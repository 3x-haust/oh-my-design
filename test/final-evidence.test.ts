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
import { createTestProjectRunInvocation } from './helpers/project-write.ts';

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
  publishTaskEvidence(root, input, createTestProjectRunInvocation(root));
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
  writeSourceSeal(root, createTestProjectRunInvocation(root));
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
function assertLegacyFinalizationDisabled(item: ReturnType<typeof fixture>): void {
  assert.throws(() => finalizeFinalEvidence(item.root, item.manifest), (error: unknown) => {
    assert.equal((error as Error & { code?: string }).code, 'LEGACY_PUBLICATION_DISABLED');
    return true;
  });
}
function assertLegacyPublicationDisabled(item: ReturnType<typeof fixture>): void {
  assertLegacyFinalizationDisabled(item);
  assert.equal(existsSync(join(item.root, '.omd', '.final-evidence.lock')), false);
  assert.equal(existsSync(join(item.root, '.omd', 'final-evidence.json')), false);
  assert.equal(existsSync(join(item.root, '.omd', 'final-evidence-runs')), false);
}
function seedHistoricalFinalEvidence(item: ReturnType<typeof fixture>): void {
  const bytes = readFileSync(item.manifest);
  const { runId } = JSON.parse(bytes.toString('utf8')) as FinalEvidenceManifest;
  const runs = join(item.root, '.omd', 'final-evidence-runs');
  mkdirSync(runs, { recursive: true });
  writeFileSync(join(runs, `${runId}.json`), bytes);
  writeFileSync(join(item.root, '.omd', 'final-evidence.json'), bytes);
}

test('v1 final evidence publication is disabled before any publication write', () => {
  const item = fixture();
  try {
    assertLegacyPublicationDisabled(item);
  } finally { cleanup(item.root); }
});

test('v1 final evidence rejects every interaction scope before publication', () => {
  for (const interaction of [{ scope: 'stateful', motion: false, surface: 'product' }, { scope: 'navigation-only', motion: false, surface: 'mixed' }, { scope: 'static', motion: true, surface: 'marketing' }] as const) {
    const item = fixture(interaction);
    try { assertLegacyPublicationDisabled(item); } finally { cleanup(item.root); }
  }
});
test('v1 final evidence rejects product and marketing flows before publication', () => {
  for (const interaction of [
    { scope: 'stateful', motion: false, surface: 'product' },
    { scope: 'static', motion: false, surface: 'marketing' },
  ] as const) {
    const item = fixture(interaction);
    try { assertLegacyPublicationDisabled(item); } finally { cleanup(item.root); }
  }
});
test('v1 finalization is disabled before task-index surface binding validation', () => {
  const relabeled = fixture();
  try {
    mutate(relabeled, value => { (value.interaction as Record<string, unknown>).surface = 'marketing'; });
    assertLegacyPublicationDisabled(relabeled);
  } finally { cleanup(relabeled.root); }

  const omitted = fixture();
  try {
    mutate(omitted, value => {
      (value.interaction as Record<string, unknown>).surface = 'marketing';
      value.artifacts = (value.artifacts as Array<Record<string, unknown>>).filter(artifact => artifact.kind !== 'task-evidence');
    });
    assertLegacyPublicationDisabled(omitted);
  } finally { cleanup(omitted.root); }
});

test('v1 finalization is disabled before frame-surface validation', () => {
  const cases: Array<{ frame: string; pattern: RegExp }> = [
    { frame: '# Frame\n', pattern: /YAML frontmatter/ },
    { frame: '---\nuxSurface: [\n---\n', pattern: /frontmatter is malformed/ },
    { frame: '---\nuxSurface: kiosk\n---\n', pattern: /uxSurface is unknown/ },
  ];
  for (const entry of cases) {
    const item = fixture({ scope: 'static', motion: false, surface: 'marketing' });
    try {
      writeFileSync(join(item.root, '.omd', 'frame.md'), entry.frame);
      assertLegacyPublicationDisabled(item);
    } finally { cleanup(item.root); }
  }
});


test('v1 finalization is disabled before task-index validation', () => {
  const missing = fixture();
  try {
    mutate(missing, value => { value.artifacts = (value.artifacts as Array<Record<string, unknown>>).filter(artifact => artifact.kind !== 'task-evidence'); });
    assertLegacyPublicationDisabled(missing);
  } finally { cleanup(missing.root); }

  const extra = fixture();
  try {
    mutate(extra, value => { const artifact = (value.artifacts as Array<Record<string, unknown>>).find(entry => entry.kind === 'task-evidence')!; (value.artifacts as Array<Record<string, unknown>>).push({ ...artifact }); });
    assertLegacyPublicationDisabled(extra);
  } finally { cleanup(extra.root); }

  const wrongPath = fixture();
  try {
    mutate(wrongPath, value => { ((value.artifacts as Array<Record<string, unknown>>).find(artifact => artifact.kind === 'task-evidence')!).path = '.omd/.cache/task-evidence.json'; });
    assertLegacyPublicationDisabled(wrongPath);
  } finally { cleanup(wrongPath.root); }
});

test('v1 finalization is disabled before task-index integrity validation', () => {
  const handwritten = fixture();
  try {
    const path = join(handwritten.root, '.omd', 'task-evidence.json');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n`);
    mutate(handwritten, value => { ((value.artifacts as Array<Record<string, unknown>>).find(artifact => artifact.kind === 'task-evidence')!).sha256 = sha256(readFileSync(path)); });
    assertLegacyPublicationDisabled(handwritten);
  } finally { cleanup(handwritten.root); }

  const malformed = fixture();
  try {
    const path = join(malformed.root, '.omd', 'task-evidence.json');
    writeFileSync(path, '{');
    mutate(malformed, value => { ((value.artifacts as Array<Record<string, unknown>>).find(artifact => artifact.kind === 'task-evidence')!).sha256 = sha256('{'); });
    assertLegacyPublicationDisabled(malformed);
  } finally { cleanup(malformed.root); }

  const stale = fixture();
  try {
    const frame = join(stale.root, '.omd', 'frame.md');
    writeFileSync(frame, `${readFileSync(frame, 'utf8')}\n`);
    writeSourceSeal(stale.root, createTestProjectRunInvocation(stale.root));
    mutate(stale, value => { (value.sourceSeal as Record<string, unknown>).sha256 = sha256(readFileSync(join(stale.root, '.omd', 'source-seal.json'))); });
    assertLegacyPublicationDisabled(stale);
  } finally { cleanup(stale.root); }
});

test('v1 finalization is disabled before interaction applicability validation', () => {
  const mismatch = fixture();
  try {
    mutate(mismatch, value => { (value.interaction as Record<string, unknown>).surface = 'mixed'; });
    assertLegacyPublicationDisabled(mismatch);
  } finally { cleanup(mismatch.root); }

  const staticProduct = fixture();
  try {
    mutate(staticProduct, value => { (value.interaction as Record<string, unknown>).scope = 'static'; });
    assertLegacyPublicationDisabled(staticProduct);
  } finally { cleanup(staticProduct.root); }

  const contamination = fixture({ scope: 'static', motion: false, surface: 'marketing' });
  try {
    mutate(contamination, value => { (value.artifacts as Array<Record<string, unknown>>).push({ kind: 'task-evidence', path: '.omd/task-evidence.json', sha256: '0'.repeat(64) }); });
    assertLegacyPublicationDisabled(contamination);
  } finally { cleanup(contamination.root); }
});

test('v1 finalization is disabled before manifest schema and hash validation', () => {
  for (const change of [
    (value: Record<string, unknown>) => { (value.sourceSeal as Record<string, unknown>).path = '.omd/other-seal.json'; },
    (value: Record<string, unknown>) => { value.raw = 'artifact bytes'; },
    (value: Record<string, unknown>) => { ((value.artifacts as Array<Record<string, unknown>>)[0]!).sha256 = '0'.repeat(64); },
  ]) {
    const item = fixture();
    try { mutate(item, change); assertLegacyPublicationDisabled(item); } finally { cleanup(item.root); }
  }
});

test('v1 finalization is disabled before artifact path validation', () => {
  const duplicate = fixture();
  try {
    mutate(duplicate, value => { const artifacts = value.artifacts as Array<Record<string, unknown>>; artifacts[1]!.path = artifacts[0]!.path; });
    assertLegacyPublicationDisabled(duplicate);
  } finally { cleanup(duplicate.root); }
  const outside = fixture();
  try {
    mutate(outside, value => { ((value.artifacts as Array<Record<string, unknown>>)[0]!).path = '.omd/check.json'; });
    assertLegacyPublicationDisabled(outside);
  } finally { cleanup(outside.root); }
});

test('v1 finalization is disabled before probe-role validation', () => {
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
      assertLegacyPublicationDisabled(item);
    } finally { cleanup(item.root); }
  }
});

test('v1 finalization is disabled before viewport and motion validation', () => {
  const missingViewport = fixture();
  try {
    mutate(missingViewport, value => { ((value.artifacts as Array<Record<string, unknown>>)[3]!).viewport = 'desktop'; });
    assertLegacyPublicationDisabled(missingViewport);
  } finally { cleanup(missingViewport.root); }
  const missingFilmstrip = fixture({ scope: 'static', motion: true, surface: 'marketing' });
  try {
    mutate(missingFilmstrip, value => { (value.artifacts as Array<Record<string, unknown>>).pop(); });
    assertLegacyPublicationDisabled(missingFilmstrip);
  } finally { cleanup(missingFilmstrip.root); }
  const extraFilmstrip = fixture();
  try {
    writeFileSync(join(extraFilmstrip.root, '.omd/.cache/filmstrip.png'), 'filmstrip.png');
    mutate(extraFilmstrip, value => { (value.artifacts as Array<Record<string, unknown>>).push({ kind: 'filmstrip', path: '.omd/.cache/filmstrip.png', sha256: sha256('filmstrip.png') }); });
    assertLegacyPublicationDisabled(extraFilmstrip);
  } finally { cleanup(extraFilmstrip.root); }
});

test('v1 finalization is disabled before filesystem safety validation', () => {
  const unknownApplicabilityKey = fixture();
  try {
    mutate(unknownApplicabilityKey, value => { (value.interaction as Record<string, unknown>).label = 'stateful'; });
    assertLegacyPublicationDisabled(unknownApplicabilityKey);
  } finally { cleanup(unknownApplicabilityKey.root); }
  const unknownKey = fixture();
  try {
    mutate(unknownKey, value => { ((value.artifacts as Array<Record<string, unknown>>)[0]!).role = 'primary'; });
    assertLegacyPublicationDisabled(unknownKey);
  } finally { cleanup(unknownKey.root); }
  const traversal = fixture();
  try {
    mutate(traversal, value => { ((value.artifacts as Array<Record<string, unknown>>)[0]!).path = '../outside'; });
    assertLegacyPublicationDisabled(traversal);
  } finally { cleanup(traversal.root); }
  const linked = fixture();
  try {
    symlinkSync(linked.artifact, join(linked.root, '.omd', '.cache', 'linked.png'));
    mutate(linked, value => { const artifact = (value.artifacts as Array<Record<string, unknown>>)[2]!; artifact.path = '.omd/.cache/linked.png'; artifact.sha256 = sha256('desktop.png'); });
    assertLegacyPublicationDisabled(linked);
  } finally { cleanup(linked.root); }
  const special = fixture();
  try {
    const fifo = join(special.root, '.omd', '.cache', 'evidence.fifo'); execFileSync('mkfifo', [fifo]);
    mutate(special, value => { ((value.artifacts as Array<Record<string, unknown>>)[2]!).path = '.omd/.cache/evidence.fifo'; });
    assert.equal(lstatSync(fifo).isFIFO(), true);
    assertLegacyPublicationDisabled(special);
  } finally { cleanup(special.root); }
});
test('v1 finalization is disabled before media validation', () => {
  const fake = fixture({ scope: 'static', motion: false, surface: 'marketing' });
  try {
    const path = join(fake.root, '.omd', '.cache', 'desktop.png');
    writeFileSync(path, 'not a PNG');
    mutate(fake, value => { ((value.artifacts as Array<Record<string, unknown>>)[2]!).sha256 = sha256('not a PNG'); });
    assertLegacyPublicationDisabled(fake);
  } finally { cleanup(fake.root); }

  const wrongSize = fixture({ scope: 'static', motion: false, surface: 'marketing' });
  try {
    const path = join(wrongSize.root, '.omd', '.cache', 'desktop.png');
    const image = png(2, 1);
    writeFileSync(path, image);
    mutate(wrongSize, value => { ((value.artifacts as Array<Record<string, unknown>>)[2]!).sha256 = sha256(image); });
    assertLegacyPublicationDisabled(wrongSize);
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
    assertLegacyPublicationDisabled(uniformFilmstrip);
  } finally { cleanup(uniformFilmstrip.root); }
});
test('final evidence reads immutable per-run history when current is superseded', () => {
  const item = fixture();
  try {
    seedHistoricalFinalEvidence(item);
    const first = readFileSync(join(item.root, '.omd', 'final-evidence-runs', 'run-1.json'));
    mutate(item, value => { value.runId = 'run-2'; });
    seedHistoricalFinalEvidence(item);
    assert.equal(checkFinalEvidence(item.root).runId, 'run-2');
    assert.deepEqual(readFileSync(join(item.root, '.omd', 'final-evidence-runs', 'run-1.json')), first);
    assert.equal(JSON.parse(readFileSync(join(item.root, '.omd', 'final-evidence-runs', 'run-2.json'), 'utf8')).runId, 'run-2');
  } finally { cleanup(item.root); }
});

test('v1 final evidence remains disabled when historical records and locks exist', () => {
  const item = fixture();
  try {
    assertLegacyPublicationDisabled(item);
    seedHistoricalFinalEvidence(item);
    const record = join(item.root, '.omd', 'final-evidence-runs', 'run-1.json');
    const current = readFileSync(join(item.root, '.omd', 'final-evidence.json'));
    mutate(item, value => { (value.build as Record<string, unknown>).servedTarget = 'http://127.0.0.1:5173/'; });
    assertLegacyFinalizationDisabled(item);
    assert.deepEqual(readFileSync(record), current);
    writeFileSync(join(item.root, '.omd', '.final-evidence.lock'), 'held');
    mutate(item, value => { value.runId = 'run-2'; });
    assertLegacyFinalizationDisabled(item);
    assert.deepEqual(readFileSync(join(item.root, '.omd', 'final-evidence.json')), current);
    assert.equal(existsSync(join(item.root, '.omd', 'final-evidence-runs', 'run-2.json')), false);
  } finally { cleanup(item.root); }
});
test('final evidence requires the immutable run record to match the current manifest', () => {
  const missing = fixture();
  try {
    seedHistoricalFinalEvidence(missing);
    rmSync(join(missing.root, '.omd', 'final-evidence-runs', 'run-1.json'));
    assert.throws(() => checkFinalEvidence(missing.root));
  } finally { cleanup(missing.root); }

  const divergent = fixture();
  try {
    seedHistoricalFinalEvidence(divergent);
    const current = join(divergent.root, '.omd', 'final-evidence.json');
    writeFileSync(current, `${readFileSync(current, 'utf8')}\n`);
    assert.throws(() => checkFinalEvidence(divergent.root), /does not match immutable run record/);
  } finally { cleanup(divergent.root); }
});
test('final evidence checker revalidates historical schema, bindings, and filesystem safety', () => {
  const malformed = fixture();
  try {
    mutate(malformed, value => { value.raw = 'artifact bytes'; });
    seedHistoricalFinalEvidence(malformed);
    assert.throws(() => checkFinalEvidence(malformed.root), /unknown or missing keys/);
  } finally { cleanup(malformed.root); }

  const fingerprint = fixture();
  try {
    seedHistoricalFinalEvidence(fingerprint);
    writeFileSync(fingerprint.build, 'build-v2');
    assert.throws(() => checkFinalEvidence(fingerprint.root), /build fingerprint mismatch/);
  } finally { cleanup(fingerprint.root); }

  const linked = fixture();
  try {
    symlinkSync(linked.artifact, join(linked.root, '.omd', '.cache', 'linked.png'));
    mutate(linked, value => { ((value.artifacts as Array<Record<string, unknown>>)[2]!).path = '.omd/.cache/linked.png'; });
    seedHistoricalFinalEvidence(linked);
    assert.throws(() => checkFinalEvidence(linked.root), /symlink/);
  } finally { cleanup(linked.root); }
});

test('v1 finalization is disabled before metadata validation', () => {
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
      assertLegacyPublicationDisabled(item);
    } finally { cleanup(item.root); }
  }
});

test('final evidence detects historical source, source seal, build, and artifact mutations', () => {
  const mutations: Array<(item: ReturnType<typeof fixture>) => void> = [
    item => { writeFileSync(join(item.root, 'app.js'), 'export const app = false;'); },
    item => { writeFileSync(join(item.root, '.omd', 'source-seal.json'), '{}'); },
    item => { writeFileSync(item.build, 'build-v2'); },
    item => { writeFileSync(item.artifact, 'mutated'); },
  ];
  for (const change of mutations) {
    const item = fixture();
    try {
      seedHistoricalFinalEvidence(item);
      change(item);
      assert.throws(() => checkFinalEvidence(item.root));
    } finally { cleanup(item.root); }
  }
});

test('final evidence reads stale-source recovery through historical immutable runs', () => {
  const item = fixture();
  try {
    seedHistoricalFinalEvidence(item);
    writeFileSync(join(item.root, 'app.js'), 'export const app = false;');
    writeSourceSeal(item.root, createTestProjectRunInvocation(item.root));
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
    assertLegacyFinalizationDisabled(item);
    seedHistoricalFinalEvidence(item);
    assert.equal(checkFinalEvidence(item.root).runId, 'run-2');
    assert.equal(JSON.parse(readFileSync(join(item.root, '.omd', 'final-evidence-runs', 'run-1.json'), 'utf8')).runId, 'run-1');
  } finally { cleanup(item.root); }
});

test('the CLI rejects v1 finalization and checks a historical manifest as JSON', () => {
  const item = fixture();
  try {
    const cli = join(process.cwd(), 'bin', 'omd.ts');
    assert.throws(
      () => execFileSync(process.execPath, [cli, 'evidence', 'finalize', '--input', item.manifest, '--json'], { cwd: item.root, encoding: 'utf8' }),
      /LEGACY_PUBLICATION_DISABLED/,
    );
    assert.equal(existsSync(join(item.root, '.omd', '.final-evidence.lock')), false);
    assert.equal(existsSync(join(item.root, '.omd', 'final-evidence.json')), false);
    assert.equal(existsSync(join(item.root, '.omd', 'final-evidence-runs')), false);
    seedHistoricalFinalEvidence(item);
    const checked = JSON.parse(execFileSync(process.execPath, [cli, 'evidence', 'check', '--json'], { cwd: item.root, encoding: 'utf8' })) as FinalEvidenceManifest;
    assert.equal(checked.runId, 'run-1');
  } finally { cleanup(item.root); }
});
