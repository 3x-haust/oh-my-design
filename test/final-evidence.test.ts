import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkFinalEvidence, computeBuildFingerprint, finalizeFinalEvidence, type FinalEvidenceArtifact, type FinalEvidenceInteraction, type FinalEvidenceManifest } from '../core/evidence/final.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';
import { publishTaskEvidence } from '../core/evidence/task.ts';

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
function chunk(type: string, data: Buffer): Buffer { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body) >>> 0); return Buffer.concat([length, body, checksum]); }
function png(width = 2, height = 1, nonUniform = true): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let row = 0; row < height; row++) raw[row * (1 + width * 3)] = 0;
  if (nonUniform) raw[1] = 255;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function publishValidTaskEvidence(root: string, surface: 'product' | 'mixed'): void {
  const frame = `---\nuxSurface: ${surface}\n---\n\n## Task coverage matrix\n\nT1 | goal: save | start: editor | actions: edit | success: saved | recovery: retry | viewports: desktop, mobile | requirements: none\n`;
  const composition = '## UX task coverage\n\nT1 | production: /editor | locator: #save |\n';
  writeFileSync(join(root, '.omd', 'frame.md'), frame);
  writeFileSync(join(root, '.omd', 'composition.md'), composition);
  const put = (name: string, value: unknown | Buffer) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    const path = `.omd/.cache/${name}`;
    writeFileSync(join(root, path), bytes);
    return { path, sha256: sha256(bytes) };
  };
  const plan = (name: string, recovery: boolean) => ({
    name,
    destructive: false,
    steps: [
      ...(recovery ? [{ action: 'fill' as const, selector: '#title', value: 'Recovered title', expect: [{ type: 'attribute' as const, selector: '#title', name: 'value', value: 'Recovered title' }] }] : []),
      { action: 'click' as const, selector: '#save', expect: [{ type: 'visible' as const, selector: '#save' }] },
      { action: 'click' as const, selector: '#saved', expect: [{ type: 'text' as const, selector: '#saved', value: 'Saved' }] },
    ],
  });
  const result = (probe: ReturnType<typeof plan>, width: number, height: number) => ({
    name: probe.name,
    target: 'http://localhost/editor',
    viewport: { width, height },
    steps: probe.steps.map(step => ({
      action: step.action,
      selector: step.selector,
      ok: true,
      expectations: step.expect.map(expectation => ({ ...expectation, ok: true })),
    })),
    warnings: [],
  });
  const evidenceProbe = (role: 'primary' | 'recovery', viewport: 'desktop' | 'mobile', recovery: boolean) => {
    const dimensions = viewport === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 };
    const probe = plan(`${role} save ${viewport}`, recovery);
    const prefix = `task-${role}-${viewport}`;
    const planArtifact = put(`${prefix}-plan.json`, probe);
    const resultArtifact = put(`${prefix}-result.json`, result(probe, dimensions.width, dimensions.height));
    return {
      planPath: planArtifact.path,
      planSha256: planArtifact.sha256,
      resultPath: resultArtifact.path,
      resultSha256: resultArtifact.sha256,
      role,
      viewport,
    };
  };
  const primaryDesktop = evidenceProbe('primary', 'desktop', false);
  const primaryMobile = evidenceProbe('primary', 'mobile', false);
  const recoveryDesktop = evidenceProbe('recovery', 'desktop', true);
  const recoveryMobile = evidenceProbe('recovery', 'mobile', true);
  const desktop = put('task-desktop.png', png(1280, 900));
  const mobile = put('task-mobile.png', png(390, 844));
  const evidence = { schemaVersion: 1, surface, frame: { path: '.omd/frame.md', sha256: sha256(frame) }, composition: { path: '.omd/composition.md', sha256: sha256(composition) }, tasks: [{ id: 'T1', context: 'production', production: { route: '/editor', locator: '#save', workObject: 'document' }, probes: [primaryDesktop, primaryMobile, recoveryDesktop, recoveryMobile], renders: [{ ...desktop, viewport: 'desktop' }, { ...mobile, viewport: 'mobile' }] }] };
  const input = join(root, '.omd', '.cache', 'task-evidence-manifest.json');
  writeFileSync(input, JSON.stringify(evidence));
  publishTaskEvidence(root, input);
}

function artifact(root: string, kind: FinalEvidenceArtifact['kind'], name: string, extra: Record<string, string> = {}): FinalEvidenceArtifact {
  const path = `.omd/.cache/${name}`;
  const bytes = (kind === 'screenshot' || kind === 'render')
    ? png(extra.viewport === 'desktop' ? 1280 : 390, extra.viewport === 'desktop' ? 900 : 844)
    : kind === 'filmstrip' ? png(1280, 900) : Buffer.from(name);
  writeFileSync(join(root, path), bytes);
  return { kind, path, sha256: sha256(bytes), ...extra } as FinalEvidenceArtifact;
}

function fixture(interaction: FinalEvidenceInteraction = { scope: 'stateful', motion: false, surface: 'product' }): { root: string; manifest: string; artifact: string; build: string } {
  const root = mkdtempSync(join(tmpdir(), 'omd-final-evidence-'));
  mkdirSync(join(root, '.omd', '.cache'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, '.omd', 'copy-deck.md'), '# Copy');
  writeFileSync(join(root, '.omd', 'type-proof.md'), '# Type');
  if (interaction.surface === 'product' || interaction.surface === 'mixed') publishValidTaskEvidence(root, interaction.surface);
  else {
    writeFileSync(join(root, '.omd', 'frame.md'), `---\nuxSurface: ${interaction.surface}\n---\n`);
    writeFileSync(join(root, '.omd', 'composition.md'), '# Composition');
  }
  writeFileSync(join(root, 'app.js'), 'export const app = true;');
  writeFileSync(join(root, 'dist', 'app.js'), 'build-v1');
  writeSourceSeal(root);
  const artifacts: FinalEvidenceArtifact[] = [
    artifact(root, 'check', 'check.json'),
    artifact(root, 'test', 'test.json'),
    artifact(root, 'render', 'desktop.png', { viewport: 'desktop' }),
    artifact(root, 'screenshot', 'mobile.png', { viewport: 'mobile' }),
  ];
  if (interaction.scope !== 'static') artifacts.push(artifact(root, 'probe', 'primary.json', { role: 'primary' }));
  if (interaction.scope === 'stateful') artifacts.push(artifact(root, 'probe', 'recovery.json', { role: 'recovery' }));
  if (interaction.motion) artifacts.push(artifact(root, 'filmstrip', 'motion.png'));
  if (interaction.surface === 'product' || interaction.surface === 'mixed') artifacts.push({ kind: 'task-evidence', path: '.omd/task-evidence.json', sha256: sha256(readFileSync(join(root, '.omd', 'task-evidence.json'))) });
  const sourceSeal = '.omd/source-seal.json';
  const manifest: FinalEvidenceManifest = {
    schemaVersion: 1,
    runId: 'run-1',
    sourceSeal: { path: sourceSeal, sha256: sha256(readFileSync(join(root, sourceSeal))) },
    build: { target: 'dist', fingerprint: computeBuildFingerprint(root, 'dist'), servedTarget: 'http://127.0.0.1:4173/' },
    tools: { versions: { node: process.version }, commands: ['npm test', 'npm run build'] },
    interaction,
    artifacts,
  };
  const manifestPath = join(root, '.omd', '.cache', 'final-evidence-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { root, manifest: manifestPath, artifact: join(root, '.omd', '.cache', 'desktop.png'), build: join(root, 'dist', 'app.js') };
}

function cleanup(root: string): void { rmSync(root, { recursive: true, force: true }); }
function mutate(item: ReturnType<typeof fixture>, change: (value: Record<string, unknown>) => void): void {
  const value = JSON.parse(readFileSync(item.manifest, 'utf8')) as Record<string, unknown>;
  change(value);
  writeFileSync(item.manifest, JSON.stringify(value));
}

test('final evidence round trips and exclusively publishes the bound record', () => {
  const item = fixture();
  try {
    assert.match(finalizeFinalEvidence(item.root, item.manifest), /\.omd\/final-evidence\.json$/);
    assert.equal(checkFinalEvidence(item.root).runId, 'run-1');
    assert.throws(() => finalizeFinalEvidence(item.root, item.manifest), /already exists/);
  } finally { cleanup(item.root); }
});

test('final evidence accepts each applicable interaction scope', () => {
  for (const interaction of [{ scope: 'stateful', motion: false, surface: 'product' }, { scope: 'navigation-only', motion: false, surface: 'mixed' }, { scope: 'static', motion: true, surface: 'marketing' }] as const) {
    const item = fixture(interaction);
    try { assert.doesNotThrow(() => finalizeFinalEvidence(item.root, item.manifest)); } finally { cleanup(item.root); }
  }
});
test('final evidence accepts valid product and marketing flows', () => {
  for (const interaction of [
    { scope: 'stateful', motion: false, surface: 'product' },
    { scope: 'static', motion: false, surface: 'marketing' },
  ] as const) {
    const item = fixture(interaction);
    try { assert.doesNotThrow(() => finalizeFinalEvidence(item.root, item.manifest)); } finally { cleanup(item.root); }
  }
});
test('final evidence binds task-index applicability to the sealed frame surface before caller metadata', () => {
  const relabeled = fixture();
  try {
    mutate(relabeled, value => { (value.interaction as Record<string, unknown>).surface = 'marketing'; });
    assert.throws(() => finalizeFinalEvidence(relabeled.root, relabeled.manifest), /frame uxSurface does not match/);
  } finally { cleanup(relabeled.root); }

  const omitted = fixture();
  try {
    mutate(omitted, value => {
      (value.interaction as Record<string, unknown>).surface = 'marketing';
      value.artifacts = (value.artifacts as Array<Record<string, unknown>>).filter(artifact => artifact.kind !== 'task-evidence');
    });
    assert.throws(() => finalizeFinalEvidence(omitted.root, omitted.manifest), /frame uxSurface does not match/);
  } finally { cleanup(omitted.root); }
});

test('final evidence rejects missing, malformed, and unknown frame surfaces', () => {
  const cases: Array<{ frame: string; pattern: RegExp }> = [
    { frame: '# Frame\n', pattern: /YAML frontmatter/ },
    { frame: '---\nuxSurface: [\n---\n', pattern: /frontmatter is malformed/ },
    { frame: '---\nuxSurface: kiosk\n---\n', pattern: /uxSurface is unknown/ },
  ];
  for (const entry of cases) {
    const item = fixture({ scope: 'static', motion: false, surface: 'marketing' });
    try {
      writeFileSync(join(item.root, '.omd', 'frame.md'), entry.frame);
      assert.throws(() => finalizeFinalEvidence(item.root, item.manifest), entry.pattern);
    } finally { cleanup(item.root); }
  }
});


test('final evidence requires a current production-bound task index for product and mixed surfaces', () => {
  const missing = fixture();
  try {
    mutate(missing, value => { value.artifacts = (value.artifacts as Array<Record<string, unknown>>).filter(artifact => artifact.kind !== 'task-evidence'); });
    assert.throws(() => finalizeFinalEvidence(missing.root, missing.manifest), /require exactly one task-evidence/);
  } finally { cleanup(missing.root); }

  const extra = fixture();
  try {
    mutate(extra, value => { const artifact = (value.artifacts as Array<Record<string, unknown>>).find(entry => entry.kind === 'task-evidence')!; (value.artifacts as Array<Record<string, unknown>>).push({ ...artifact }); });
    assert.throws(() => finalizeFinalEvidence(extra.root, extra.manifest), /duplicate artifact path/);
  } finally { cleanup(extra.root); }

  const wrongPath = fixture();
  try {
    mutate(wrongPath, value => { ((value.artifacts as Array<Record<string, unknown>>).find(artifact => artifact.kind === 'task-evidence')!).path = '.omd/.cache/task-evidence.json'; });
    assert.throws(() => finalizeFinalEvidence(wrongPath.root, wrongPath.manifest), /task-evidence artifact path/);
  } finally { cleanup(wrongPath.root); }
});

test('final evidence rejects hand-written, malformed, and stale task indexes', () => {
  const handwritten = fixture();
  try {
    const path = join(handwritten.root, '.omd', 'task-evidence.json');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n`);
    mutate(handwritten, value => { ((value.artifacts as Array<Record<string, unknown>>).find(artifact => artifact.kind === 'task-evidence')!).sha256 = sha256(readFileSync(path)); });
    assert.throws(() => finalizeFinalEvidence(handwritten.root, handwritten.manifest), /immutable publication/);
  } finally { cleanup(handwritten.root); }

  const malformed = fixture();
  try {
    const path = join(malformed.root, '.omd', 'task-evidence.json');
    writeFileSync(path, '{');
    mutate(malformed, value => { ((value.artifacts as Array<Record<string, unknown>>).find(artifact => artifact.kind === 'task-evidence')!).sha256 = sha256('{'); });
    assert.throws(() => finalizeFinalEvidence(malformed.root, malformed.manifest));
  } finally { cleanup(malformed.root); }

  const stale = fixture();
  try {
    const frame = join(stale.root, '.omd', 'frame.md');
    writeFileSync(frame, `${readFileSync(frame, 'utf8')}\n`);
    writeSourceSeal(stale.root);
    mutate(stale, value => { (value.sourceSeal as Record<string, unknown>).sha256 = sha256(readFileSync(join(stale.root, '.omd', 'source-seal.json'))); });
    assert.throws(() => finalizeFinalEvidence(stale.root, stale.manifest), /frame or composition digest mismatch/);
  } finally { cleanup(stale.root); }
});

test('final evidence rejects task-index surface mismatches, static product, and non-product contamination', () => {
  const mismatch = fixture();
  try {
    mutate(mismatch, value => { (value.interaction as Record<string, unknown>).surface = 'mixed'; });
    assert.throws(() => finalizeFinalEvidence(mismatch.root, mismatch.manifest), /surface.*does not match/i);
  } finally { cleanup(mismatch.root); }

  const staticProduct = fixture();
  try {
    mutate(staticProduct, value => { (value.interaction as Record<string, unknown>).scope = 'static'; });
    assert.throws(() => finalizeFinalEvidence(staticProduct.root, staticProduct.manifest), /must not be static/);
  } finally { cleanup(staticProduct.root); }

  const contamination = fixture({ scope: 'static', motion: false, surface: 'marketing' });
  try {
    mutate(contamination, value => { (value.artifacts as Array<Record<string, unknown>>).push({ kind: 'task-evidence', path: '.omd/task-evidence.json', sha256: '0'.repeat(64) }); });
    assert.throws(() => finalizeFinalEvidence(contamination.root, contamination.manifest), /must not include task-evidence/);
  } finally { cleanup(contamination.root); }
});

test('final evidence rejects a non-canonical source seal, raw payloads, and bad hashes', () => {
  for (const change of [
    (value: Record<string, unknown>) => { (value.sourceSeal as Record<string, unknown>).path = '.omd/other-seal.json'; },
    (value: Record<string, unknown>) => { value.raw = 'artifact bytes'; },
    (value: Record<string, unknown>) => { ((value.artifacts as Array<Record<string, unknown>>)[0]!).sha256 = '0'.repeat(64); },
  ]) {
    const item = fixture();
    try { mutate(item, change); assert.throws(() => finalizeFinalEvidence(item.root, item.manifest)); } finally { cleanup(item.root); }
  }
});

test('final evidence rejects paths reused across kinds and files outside the cache', () => {
  const duplicate = fixture();
  try {
    mutate(duplicate, value => { const artifacts = value.artifacts as Array<Record<string, unknown>>; artifacts[1]!.path = artifacts[0]!.path; });
    assert.throws(() => finalizeFinalEvidence(duplicate.root, duplicate.manifest), /duplicate artifact path/);
  } finally { cleanup(duplicate.root); }
  const outside = fixture();
  try {
    mutate(outside, value => { ((value.artifacts as Array<Record<string, unknown>>)[0]!).path = '.omd/check.json'; });
    assert.throws(() => finalizeFinalEvidence(outside.root, outside.manifest), /under .omd/);
  } finally { cleanup(outside.root); }
});

test('final evidence rejects missing and extra probe roles for each interaction scope', () => {
  const cases: Array<{ interaction: FinalEvidenceInteraction; change: (root: string, artifacts: Array<Record<string, unknown>>) => void }> = [
    { interaction: { scope: 'stateful', motion: false, surface: 'product' }, change: (_root, artifacts) => { artifacts.splice(5, 1); } },
    { interaction: { scope: 'stateful', motion: false, surface: 'product' }, change: (_root, artifacts) => { artifacts.push({ ...artifacts[4]!, path: '.omd/.cache/extra-primary.json' }); } },
    { interaction: { scope: 'navigation-only', motion: false, surface: 'product' }, change: (_root, artifacts) => { artifacts.splice(4, 1); } },
    { interaction: { scope: 'navigation-only', motion: false, surface: 'product' }, change: (root, artifacts) => { writeFileSync(join(root, '.omd/.cache/recovery.json'), 'recovery.json'); artifacts.push({ kind: 'probe', role: 'recovery', path: '.omd/.cache/recovery.json', sha256: sha256('recovery.json') }); } },
    { interaction: { scope: 'static', motion: false, surface: 'marketing' }, change: (root, artifacts) => { writeFileSync(join(root, '.omd/.cache/primary.json'), 'primary.json'); artifacts.push({ kind: 'probe', role: 'primary', path: '.omd/.cache/primary.json', sha256: sha256('primary.json') }); } },
  ];
  for (const entry of cases) {
    const item = fixture(entry.interaction);
    try {
      mutate(item, value => entry.change(item.root, value.artifacts as Array<Record<string, unknown>>));
      assert.throws(() => finalizeFinalEvidence(item.root, item.manifest));
    } finally { cleanup(item.root); }
  }
});

test('final evidence requires both viewports and motion-matched filmstrips', () => {
  const missingViewport = fixture();
  try {
    mutate(missingViewport, value => { ((value.artifacts as Array<Record<string, unknown>>)[3]!).viewport = 'desktop'; });
    assert.throws(() => finalizeFinalEvidence(missingViewport.root, missingViewport.manifest), /desktop and mobile/);
  } finally { cleanup(missingViewport.root); }
  const missingFilmstrip = fixture({ scope: 'static', motion: true, surface: 'marketing' });
  try {
    mutate(missingFilmstrip, value => { (value.artifacts as Array<Record<string, unknown>>).pop(); });
    assert.throws(() => finalizeFinalEvidence(missingFilmstrip.root, missingFilmstrip.manifest), /requires a filmstrip/);
  } finally { cleanup(missingFilmstrip.root); }
  const extraFilmstrip = fixture();
  try {
    writeFileSync(join(extraFilmstrip.root, '.omd/.cache/filmstrip.png'), 'filmstrip.png');
    mutate(extraFilmstrip, value => { (value.artifacts as Array<Record<string, unknown>>).push({ kind: 'filmstrip', path: '.omd/.cache/filmstrip.png', sha256: sha256('filmstrip.png') }); });
    assert.throws(() => finalizeFinalEvidence(extraFilmstrip.root, extraFilmstrip.manifest), /must not include filmstrips/);
  } finally { cleanup(extraFilmstrip.root); }
});

test('final evidence rejects unknown applicability and artifact variant keys, traversal, symlinks, and special files', () => {
  const unknownApplicabilityKey = fixture();
  try {
    mutate(unknownApplicabilityKey, value => { (value.interaction as Record<string, unknown>).label = 'stateful'; });
    assert.throws(() => finalizeFinalEvidence(unknownApplicabilityKey.root, unknownApplicabilityKey.manifest), /unknown or missing keys/);
  } finally { cleanup(unknownApplicabilityKey.root); }
  const unknownKey = fixture();
  try {
    mutate(unknownKey, value => { ((value.artifacts as Array<Record<string, unknown>>)[0]!).role = 'primary'; });
    assert.throws(() => finalizeFinalEvidence(unknownKey.root, unknownKey.manifest), /unknown or missing keys/);
  } finally { cleanup(unknownKey.root); }
  const traversal = fixture();
  try {
    mutate(traversal, value => { ((value.artifacts as Array<Record<string, unknown>>)[0]!).path = '../outside'; });
    assert.throws(() => finalizeFinalEvidence(traversal.root, traversal.manifest), /safe project-relative/);
  } finally { cleanup(traversal.root); }
  const linked = fixture();
  try {
    symlinkSync(linked.artifact, join(linked.root, '.omd', '.cache', 'linked.png'));
    mutate(linked, value => { const artifact = (value.artifacts as Array<Record<string, unknown>>)[2]!; artifact.path = '.omd/.cache/linked.png'; artifact.sha256 = sha256('desktop.png'); });
    assert.throws(() => finalizeFinalEvidence(linked.root, linked.manifest), /symlink/);
  } finally { cleanup(linked.root); }
  const special = fixture();
  try {
    const fifo = join(special.root, '.omd', '.cache', 'evidence.fifo'); execFileSync('mkfifo', [fifo]);
    mutate(special, value => { ((value.artifacts as Array<Record<string, unknown>>)[2]!).path = '.omd/.cache/evidence.fifo'; });
    assert.equal(lstatSync(fifo).isFIFO(), true);
    assert.throws(() => finalizeFinalEvidence(special.root, special.manifest), /regular file/);
  } finally { cleanup(special.root); }
});
test('final evidence decodes viewport artifacts and requires non-uniform PNG filmstrips', () => {
  const fake = fixture({ scope: 'static', motion: false, surface: 'marketing' });
  try {
    const path = join(fake.root, '.omd', '.cache', 'desktop.png');
    writeFileSync(path, 'not a PNG');
    mutate(fake, value => { ((value.artifacts as Array<Record<string, unknown>>)[2]!).sha256 = sha256('not a PNG'); });
    assert.throws(() => finalizeFinalEvidence(fake.root, fake.manifest), /structurally valid PNG/);
  } finally { cleanup(fake.root); }

  const wrongSize = fixture({ scope: 'static', motion: false, surface: 'marketing' });
  try {
    const path = join(wrongSize.root, '.omd', '.cache', 'desktop.png');
    const image = png(2, 1);
    writeFileSync(path, image);
    mutate(wrongSize, value => { ((value.artifacts as Array<Record<string, unknown>>)[2]!).sha256 = sha256(image); });
    assert.throws(() => finalizeFinalEvidence(wrongSize.root, wrongSize.manifest), /must be 1280x900/);
  } finally { cleanup(wrongSize.root); }

  const uniformFilmstrip = fixture({ scope: 'static', motion: true, surface: 'marketing' });
  try {
    const path = join(uniformFilmstrip.root, '.omd', '.cache', 'motion.png');
    const image = png(1280, 900, false);
    writeFileSync(path, image);
    mutate(uniformFilmstrip, value => {
      const artifact = (value.artifacts as Array<Record<string, unknown>>).find(entry => entry.kind === 'filmstrip')!;
      artifact.sha256 = sha256(image);
    });
    assert.throws(() => finalizeFinalEvidence(uniformFilmstrip.root, uniformFilmstrip.manifest), /must be non-uniform/);
  } finally { cleanup(uniformFilmstrip.root); }
});
test('final evidence keeps immutable per-run history while a later run atomically supersedes current', () => {
  const item = fixture();
  try {
    finalizeFinalEvidence(item.root, item.manifest);
    const first = readFileSync(join(item.root, '.omd', 'final-evidence-runs', 'run-1.json'));
    mutate(item, value => { value.runId = 'run-2'; });
    finalizeFinalEvidence(item.root, item.manifest);
    assert.equal(checkFinalEvidence(item.root).runId, 'run-2');
    assert.deepEqual(readFileSync(join(item.root, '.omd', 'final-evidence-runs', 'run-1.json')), first);
    assert.equal(JSON.parse(readFileSync(join(item.root, '.omd', 'final-evidence-runs', 'run-2.json'), 'utf8')).runId, 'run-2');
  } finally { cleanup(item.root); }
});

test('final evidence never overwrites an existing run record or current record after a failed publication', () => {
  const item = fixture();
  try {
    finalizeFinalEvidence(item.root, item.manifest);
    const record = join(item.root, '.omd', 'final-evidence-runs', 'run-1.json');
    const current = readFileSync(join(item.root, '.omd', 'final-evidence.json'));
    mutate(item, value => { (value.build as Record<string, unknown>).servedTarget = 'http://127.0.0.1:5173/'; });
    assert.throws(() => finalizeFinalEvidence(item.root, item.manifest), /run already exists/);
    assert.deepEqual(readFileSync(record), current);
    writeFileSync(join(item.root, '.omd', '.final-evidence.lock'), 'held');
    mutate(item, value => { value.runId = 'run-2'; });
    assert.throws(() => finalizeFinalEvidence(item.root, item.manifest), /already in progress/);
    assert.deepEqual(readFileSync(join(item.root, '.omd', 'final-evidence.json')), current);
    assert.equal(existsSync(join(item.root, '.omd', 'final-evidence-runs', 'run-2.json')), false);
  } finally { cleanup(item.root); }
});
test('final evidence requires the immutable run record to match the current manifest', () => {
  const missing = fixture();
  try {
    finalizeFinalEvidence(missing.root, missing.manifest);
    rmSync(join(missing.root, '.omd', 'final-evidence-runs', 'run-1.json'));
    assert.throws(() => checkFinalEvidence(missing.root));
  } finally { cleanup(missing.root); }

  const divergent = fixture();
  try {
    finalizeFinalEvidence(divergent.root, divergent.manifest);
    const current = join(divergent.root, '.omd', 'final-evidence.json');
    writeFileSync(current, `${readFileSync(current, 'utf8')}\n`);
    assert.throws(() => checkFinalEvidence(divergent.root), /does not match immutable run record/);
  } finally { cleanup(divergent.root); }
});

test('final evidence rejects whitespace metadata, unsafe run IDs, and canonical duplicate commands', () => {
  const cases: Array<(value: Record<string, unknown>) => void> = [
    value => { value.runId = ' run-1'; },
    value => { value.runId = 'run-1 '; },
    value => { value.runId = '   '; },
    value => { value.runId = '../run-1'; },
    value => { (value.build as Record<string, unknown>).servedTarget = ' http://127.0.0.1:4173/'; },
    value => { (value.tools as Record<string, unknown>).commands = ['npm test', 'npm test']; },
    value => { (value.tools as Record<string, unknown>).commands = ['npm test', 'npm test ']; },
  ];
  for (const change of cases) {
    const item = fixture();
    try {
      mutate(item, change);
      assert.throws(() => finalizeFinalEvidence(item.root, item.manifest));
    } finally { cleanup(item.root); }
  }
});

test('final evidence detects post-publication source, source seal, build, and artifact mutations', () => {
  const mutations: Array<(item: ReturnType<typeof fixture>) => void> = [
    item => { writeFileSync(join(item.root, 'app.js'), 'export const app = false;'); },
    item => { writeFileSync(join(item.root, '.omd', 'source-seal.json'), '{}'); },
    item => { writeFileSync(item.build, 'build-v2'); },
    item => { writeFileSync(item.artifact, 'mutated'); },
  ];
  for (const change of mutations) {
    const item = fixture();
    try {
      finalizeFinalEvidence(item.root, item.manifest);
      change(item);
      assert.throws(() => checkFinalEvidence(item.root));
    } finally { cleanup(item.root); }
  }
});

test('final evidence supports stale-source recovery through a new immutable run', () => {
  const item = fixture();
  try {
    finalizeFinalEvidence(item.root, item.manifest);
    writeFileSync(join(item.root, 'app.js'), 'export const app = false;');
    writeSourceSeal(item.root);
    writeFileSync(item.build, 'build-v2');
    const desktop = png(1280, 900);
    writeFileSync(item.artifact, desktop);
    mutate(item, value => {
      value.runId = 'run-2';
      (value.sourceSeal as Record<string, unknown>).sha256 = sha256(readFileSync(join(item.root, '.omd', 'source-seal.json')));
      const build = value.build as Record<string, unknown>;
      build.fingerprint = computeBuildFingerprint(item.root, String(build.target));
      ((value.artifacts as Array<Record<string, unknown>>)[2]!).sha256 = sha256(desktop);
    });
    finalizeFinalEvidence(item.root, item.manifest);
    assert.equal(checkFinalEvidence(item.root).runId, 'run-2');
    assert.equal(JSON.parse(readFileSync(join(item.root, '.omd', 'final-evidence-runs', 'run-1.json'), 'utf8')).runId, 'run-1');
  } finally { cleanup(item.root); }
});

test('the CLI finalizes and checks the current manifest as JSON', () => {
  const item = fixture();
  try {
    const cli = join(process.cwd(), 'bin', 'omd.ts');
    const finalized = JSON.parse(execFileSync(process.execPath, [cli, 'evidence', 'finalize', '--input', item.manifest, '--json'], { cwd: item.root, encoding: 'utf8' })) as { path: string };
    assert.match(finalized.path, /\.omd\/final-evidence\.json$/);
    const checked = JSON.parse(execFileSync(process.execPath, [cli, 'evidence', 'check', '--json'], { cwd: item.root, encoding: 'utf8' })) as FinalEvidenceManifest;
    assert.equal(checked.runId, 'run-1');
  } finally { cleanup(item.root); }
});
