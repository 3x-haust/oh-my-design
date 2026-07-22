import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { test } from 'node:test';
import { checkTaskEvidence, publishTaskEvidence } from '../core/evidence/task.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';

type Viewport = 'desktop' | 'mobile';
type ProbeRole = 'primary' | 'recovery' | 'invalid-submit';
interface Artifact { path: string; sha256: string }
interface ProbeEvidence { planPath: string; planSha256: string; resultPath: string; resultSha256: string; role: ProbeRole; viewport: Viewport }
interface RenderEvidence extends Artifact { viewport: Viewport }
interface TransientEvidence extends Artifact { captureMode: 'settled' | 'reduced-motion'; probeRole: 'primary' | 'recovery'; stateSelector: string; stepIndex: number; viewport: Viewport }
interface PlanExpectation { type: 'visible' | 'hidden' | 'text' | 'attribute' | 'url'; selector?: string; name?: string; value?: string }
interface PlanStep { action: 'click' | 'fill' | 'press'; selector?: string; value?: string; key?: string; expect: PlanExpectation[] }
interface ProbePlanFixture { name: string; destructive: false; steps: PlanStep[] }
interface ResultExpectation { type: PlanExpectation['type']; selector?: string; name?: string; value?: string; ok: boolean }
interface ResultStep { action: PlanStep['action']; selector?: string; key?: string; ok: boolean; expectations: ResultExpectation[] }
interface ProbeResultFixture { name: string; target: string; viewport: { width: number; height: number }; steps: ResultStep[]; warnings: [] }
interface TaskFixture { id: string; context: 'production'; production: { route: string; locator: string; workObject: string }; probes: ProbeEvidence[]; renders: [RenderEvidence, RenderEvidence]; invalidSubmit?: ProbeEvidence; transient?: TransientEvidence[] }
interface ManifestFixture { schemaVersion: 1; surface: 'product' | 'mixed'; frame: Artifact; composition: Artifact; tasks: [TaskFixture] }
interface Fixture { root: string; input: string; writer: ReturnType<typeof createTestProjectRunInvocation>; manifest: ManifestFixture; frame: string; snapshot(): void; restore(): void; cleanup(): void }

const hash = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const taskOf = (manifest: ManifestFixture): TaskFixture => manifest.tasks[0];
const probeOf = (task: TaskFixture, role: 'primary' | 'recovery', viewport: Viewport): ProbeEvidence => {
  const probe = task.probes.find(item => item.role === role && item.viewport === viewport);
  if (!probe) throw new Error(`test fixture has no ${role} ${viewport} probe`);
  return probe;
};
const primaryOf = (task: TaskFixture, viewport: Viewport = 'desktop'): ProbeEvidence => probeOf(task, 'primary', viewport);
const recoveryOf = (task: TaskFixture, viewport: Viewport = 'desktop'): ProbeEvidence => probeOf(task, 'recovery', viewport);
const invalidOf = (task: TaskFixture): ProbeEvidence => {
  if (!task.invalidSubmit) throw new Error('test fixture has no invalid-submit probe');
  return task.invalidSubmit;
};
const transientOf = (task: TaskFixture): TransientEvidence => {
  const transient = task.transient?.[0];
  if (!transient) throw new Error('test fixture has no transient artifact');
  return transient;
};
function at<T>(items: readonly T[], index: number, label: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(`test fixture is missing ${label}`);
  return item;
}
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
function png(width: number, height: number, options: { transparent?: boolean; noise?: boolean; flat?: boolean; scattered?: boolean } = {}): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = options.transparent ? 6 : 2;
  const channels = options.transparent ? 4 : 3;
  const raw = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = y * (width * channels + 1) + 1 + x * channels;
      const varied = (!options.flat && x < Math.ceil(width * 0.1) && y < Math.ceil(height * 0.1)) || (options.scattered === true && x % 20 === 0 && y % 10 === 0);
      raw[offset] = varied ? 255 : 20;
      raw[offset + 1] = varied ? 255 : 20;
      raw[offset + 2] = varied ? 255 : 20;
      if (channels === 4) raw[offset + 3] = options.transparent ? 0 : 255;
    }
  }
  if (options.noise) raw[1] = 255;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function fixture(surface: 'product' | 'mixed' = 'product'): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'omd-task-evidence-'));
  const writer = createTestProjectRunInvocation(root);
  const cache = join(root, '.omd/.cache');
  mkdirSync(cache, { recursive: true });
  const frame = `---\nuxSurface: ${surface}\n---\n\n## Task coverage matrix\n\nT1 | goal: save | start: editor | actions: edit | success: saved | recovery: retry | viewports: desktop, mobile | requirements: none\n`;
  const composition = '## UX task coverage\n\nT1 | production: /editor | locator: #save |\n';
  writeFileSync(join(root, '.omd/frame.md'), frame);
  writeFileSync(join(root, '.omd/composition.md'), composition);
  const primaryDesktopPlan: ProbePlanFixture = { name: 'save-desktop', destructive: false, steps: [{ action: 'click', selector: '#save', expect: [{ type: 'visible', selector: '#saved' }] }, { action: 'click', selector: '#saved', expect: [{ type: 'visible', selector: '#saved' }] }] };
  const primaryMobilePlan: ProbePlanFixture = { ...primaryDesktopPlan, name: 'save-mobile' };
  const recoveryDesktopPlan: ProbePlanFixture = { name: 'recover-desktop', destructive: false, steps: [{ action: 'click', selector: '#save', expect: [{ type: 'text', selector: '#saved', value: 'Saved' }] }, { action: 'click', selector: '#saved', expect: [{ type: 'text', selector: '#saved', value: 'Saved' }] }] };
  const recoveryMobilePlan: ProbePlanFixture = { ...recoveryDesktopPlan, name: 'recover-mobile' };
  const result = (name: string, viewport: { width: number; height: number }, savedAsText: boolean): ProbeResultFixture => ({ name, target: 'http://localhost/editor', viewport, steps: [{ action: 'click', selector: '#save', ok: true, expectations: [savedAsText ? { type: 'text', selector: '#saved', value: 'Saved', ok: true } : { type: 'visible', selector: '#saved', ok: true }] }, { action: 'click', selector: '#saved', ok: true, expectations: [savedAsText ? { type: 'text', selector: '#saved', value: 'Saved', ok: true } : { type: 'visible', selector: '#saved', ok: true }] }], warnings: [] });
  const put = (name: string, value: unknown | Buffer): Artifact => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    const path = `.omd/.cache/${name}`;
    writeFileSync(join(root, path), bytes);
    return { path, sha256: hash(bytes) };
  };
  const probe = (role: 'primary' | 'recovery', viewport: Viewport, plan: ProbePlanFixture, savedAsText: boolean): ProbeEvidence => {
    const planArtifact = put(`${role}-${viewport}-plan.json`, plan);
    const dimensions = viewport === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 };
    const resultArtifact = put(`${role}-${viewport}-result.json`, result(plan.name, dimensions, savedAsText));
    return { planPath: planArtifact.path, planSha256: planArtifact.sha256, resultPath: resultArtifact.path, resultSha256: resultArtifact.sha256, role, viewport };
  };
  const desktop = put('desktop.png', png(1280, 900));
  const mobile = put('mobile.png', png(390, 844));
  const task: TaskFixture = { id: 'T1', context: 'production', production: { route: '/editor', locator: '#save', workObject: 'document' }, probes: [probe('primary', 'desktop', primaryDesktopPlan, false), probe('primary', 'mobile', primaryMobilePlan, false), probe('recovery', 'desktop', recoveryDesktopPlan, true), probe('recovery', 'mobile', recoveryMobilePlan, true)], renders: [{ ...desktop, viewport: 'desktop' }, { ...mobile, viewport: 'mobile' }] };
  const manifest: ManifestFixture = { schemaVersion: 1, surface, frame: { path: '.omd/frame.md', sha256: hash(frame) }, composition: { path: '.omd/composition.md', sha256: hash(composition) }, tasks: [task] };
  const input = join(cache, 'task-evidence-manifest.json');
  writeFileSync(input, JSON.stringify(manifest));
  const artifacts = new Map<string, Buffer>();
  const snapshot = () => { artifacts.clear(); for (const name of readdirSync(cache)) artifacts.set(name, readFileSync(join(cache, name))); };
  const restore = () => { for (const [name, bytes] of artifacts) writeFileSync(join(cache, name), bytes); };
  snapshot();
  return { root, input, writer, manifest, frame, snapshot, restore, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
function writeArtifact<T>(item: Fixture, path: string, value: T): Artifact {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  writeFileSync(join(item.root, path), bytes);
  return { path, sha256: hash(bytes) };
}
function readArtifact<T>(item: Fixture, path: string): T {
  return JSON.parse(readFileSync(join(item.root, path), 'utf8')) as T;
}
function fail(item: Fixture, mutate: (manifest: ManifestFixture) => void, pattern: RegExp): void {
  item.restore();
  const manifest = structuredClone(item.manifest);
  mutate(manifest);
  writeFileSync(item.input, JSON.stringify(manifest));
  assert.throws(() => publishTaskEvidence(item.root, item.input, item.writer), pattern);
}
function bindProductionTarget(item: Fixture, manifest: ManifestFixture, production: TaskFixture['production']): void {
  const task = taskOf(manifest);
  task.production = production;
  const composition = `## UX task coverage\n\nT1 | production: ${production.route} | locator: ${production.locator} |\n`;
  writeFileSync(join(item.root, '.omd/composition.md'), composition);
  manifest.composition.sha256 = hash(composition);
  for (const probe of task.probes) {
    const plan = readArtifact<ProbePlanFixture>(item, probe.planPath);
    const result = readArtifact<ProbeResultFixture>(item, probe.resultPath);
    for (const step of plan.steps) if (step.selector === '#save') step.selector = production.locator;
    for (const step of result.steps) if (step.selector === '#save') step.selector = production.locator;
    result.target = `http://localhost${production.route}`;
    probe.planSha256 = writeArtifact(item, probe.planPath, plan).sha256;
    probe.resultSha256 = writeArtifact(item, probe.resultPath, result).sha256;
  }
}

test('task evidence publishes and rechecks exact product and mixed production bindings', () => {
  for (const surface of ['product', 'mixed'] as const) {
    const item = fixture(surface);
    try { assert.match(publishTaskEvidence(item.root, item.input, item.writer), /\.omd\/task-evidence\.json$/); assert.equal(checkTaskEvidence(item.root).surface, surface); } finally { item.cleanup(); }
  }
});
test('task evidence reserves explicit fixture namespaces without rejecting product-domain vocabulary', () => {
  for (const route of ['/demographics', '/gallery-management']) {
    const item = fixture();
    try {
      const manifest = structuredClone(item.manifest);
      bindProductionTarget(item, manifest, { route, locator: '#demographics-save', workObject: 'gallery item' });
      writeFileSync(item.input, JSON.stringify(manifest));
      assert.doesNotThrow(() => publishTaskEvidence(item.root, item.input, item.writer));
    } finally { item.cleanup(); }
  }
  const item = fixture();
  try {
    for (const route of ['/demo', '/storybook', '/showcase', '/fixture', '/demo-fixture']) {
      fail(item, manifest => { taskOf(manifest).production.route = route; }, /local non-demo production target/);
    }
    for (const locator of ['#showcase', '#storybook', '#demo-fixture', '#fixture']) {
      fail(item, manifest => { taskOf(manifest).production.locator = locator; }, /local non-demo production target/);
    }
    for (const workObject of ['showcase', 'storybook', 'demo-fixture', 'fixture']) {
      fail(item, manifest => { taskOf(manifest).production.workObject = workObject; }, /local non-demo production target/);
    }
  } finally { item.cleanup(); }
});
test('task evidence fails closed for stale source bytes, probes, recovery, and task sets', () => {
  const item = fixture();
  try {
    fail(item, manifest => { manifest.frame.sha256 = '0'.repeat(64); }, /digest mismatch/);
    fail(item, manifest => { primaryOf(taskOf(manifest)).resultSha256 = 'f'.repeat(64); }, /probe digest mismatch/);
    fail(item, manifest => { const task = taskOf(manifest); recoveryOf(task).resultPath = primaryOf(task).resultPath; recoveryOf(task).resultSha256 = primaryOf(task).resultSha256; }, /distinct from primary/);
    fail(item, manifest => { manifest.tasks.push(structuredClone(taskOf(manifest))); }, /globally unique|exact frame and composition task sets/);
  } finally { item.cleanup(); }
});
test('probe bindings reject remote targets, expectation-only locators, and missing observables', () => {
  const item = fixture();
  try {
    fail(item, manifest => { const probe = primaryOf(taskOf(manifest)); const result = readArtifact<ProbeResultFixture>(item, probe.resultPath); result.target = 'https://example.test/editor'; probe.resultSha256 = writeArtifact(item, probe.resultPath, result).sha256; }, /localhost production route/);
    fail(item, manifest => {
      const probe = primaryOf(taskOf(manifest));
      const plan = readArtifact<ProbePlanFixture>(item, probe.planPath);
      const result = readArtifact<ProbeResultFixture>(item, probe.resultPath);
      const activation = at(plan.steps, 0, 'primary activation step');
      const expectation = at(activation.expect, 0, 'primary activation expectation');
      activation.selector = '#other';
      expectation.selector = '#save';
      at(result.steps, 0, 'primary activation result').selector = '#other';
      probe.planSha256 = writeArtifact(item, probe.planPath, plan).sha256;
      probe.resultSha256 = writeArtifact(item, probe.resultPath, result).sha256;
    }, /activation must use|probe expectation failed/);
    fail(item, manifest => {
      const probe = primaryOf(taskOf(manifest));
      const plan = readArtifact<ProbePlanFixture>(item, probe.planPath);
      const result = readArtifact<ProbeResultFixture>(item, probe.resultPath);
      at(plan.steps, 0, 'primary activation step').expect = [{ type: 'visible', selector: '#later' }];
      at(result.steps, 0, 'primary activation result').expectations = [{ type: 'visible', selector: '#later', ok: false }];
      probe.planSha256 = writeArtifact(item, probe.planPath, plan).sha256;
      probe.resultSha256 = writeArtifact(item, probe.resultPath, result).sha256;
    }, /probe expectation failed/);
    fail(item, manifest => {
      const raw = taskOf(manifest) as unknown as { probes: Array<{ viewport: unknown }> };
      at(raw.probes, 1, 'primary mobile probe').viewport = 'desktop';
    }, /unique role and viewport/);
    fail(item, manifest => {
      const raw = taskOf(manifest) as unknown as { probes: Array<{ viewport: unknown }> };
      at(raw.probes, 0, 'primary desktop probe').viewport = 'tablet';
    }, /viewport is invalid/);
    fail(item, manifest => {
      const probe = primaryOf(taskOf(manifest), 'desktop');
      const result = readArtifact<ProbeResultFixture>(item, probe.resultPath);
      result.viewport = { width: 390, height: 844 };
      probe.resultSha256 = writeArtifact(item, probe.resultPath, result).sha256;
    }, /successful local task route/);
  } finally { item.cleanup(); }
});
test('invalid submit requires ordered same-field fill, production activation, and post-activation state', () => {
  const item = fixture();
  try {
    const frame = item.frame.replace('requirements: none', 'requirements: invalid-submit');
    writeFileSync(join(item.root, '.omd/frame.md'), frame);
    item.manifest.frame.sha256 = hash(frame);
    const plan: ProbePlanFixture = { name: 'invalid', destructive: false, steps: [{ action: 'fill', selector: '#email', value: 'a@example.test', expect: [{ type: 'visible', selector: '#email' }] }, { action: 'click', selector: '#save', expect: [{ type: 'visible', selector: '#error' }, { type: 'attribute', selector: '#email', name: 'value', value: 'a@example.test' }] }] };
    const result: ProbeResultFixture = { name: 'invalid', target: 'http://localhost/editor', viewport: { width: 390, height: 844 }, steps: [{ action: 'fill', selector: '#email', ok: true, expectations: [{ type: 'visible', selector: '#email', ok: true }] }, { action: 'click', selector: '#save', ok: true, expectations: [{ type: 'visible', selector: '#error', ok: true }, { type: 'attribute', selector: '#email', name: 'value', value: 'a@example.test', ok: true }] }], warnings: [] };
    const planArtifact = writeArtifact(item, '.omd/.cache/invalid-plan.json', plan);
    const resultArtifact = writeArtifact(item, '.omd/.cache/invalid-result.json', result);
    taskOf(item.manifest).invalidSubmit = { planPath: planArtifact.path, planSha256: planArtifact.sha256, resultPath: resultArtifact.path, resultSha256: resultArtifact.sha256, role: 'invalid-submit', viewport: 'mobile' };
    writeFileSync(item.input, JSON.stringify(item.manifest)); item.snapshot(); publishTaskEvidence(item.root, item.input, item.writer);
    fail(item, manifest => {
      const probe = invalidOf(taskOf(manifest));
      const invalidPlan = readArtifact<ProbePlanFixture>(item, probe.planPath);
      const invalidResult = readArtifact<ProbeResultFixture>(item, probe.resultPath);
      const fill = at(invalidPlan.steps, 0, 'invalid fill step');
      invalidPlan.steps[0] = at(invalidPlan.steps, 1, 'invalid activation step');
      invalidPlan.steps[1] = fill;
      const fillResult = at(invalidResult.steps, 0, 'invalid fill result');
      invalidResult.steps[0] = at(invalidResult.steps, 1, 'invalid activation result');
      invalidResult.steps[1] = fillResult;
      probe.planSha256 = writeArtifact(item, probe.planPath, invalidPlan).sha256;
      probe.resultSha256 = writeArtifact(item, probe.resultPath, invalidResult).sha256;
    }, /invalid-submit evidence/);
    fail(item, manifest => {
      const probe = invalidOf(taskOf(manifest));
      const invalidPlan = readArtifact<ProbePlanFixture>(item, probe.planPath);
      const invalidResult = readArtifact<ProbeResultFixture>(item, probe.resultPath);
      const errorStep = at(invalidPlan.steps, 1, 'invalid activation step');
      const errorExpectation = at(errorStep.expect, 1, 'invalid value expectation');
      const observedErrorStep = at(invalidResult.steps, 1, 'invalid activation result');
      const observedExpectation = at(observedErrorStep.expectations, 1, 'invalid value result expectation');
      errorExpectation.selector = '#other';
      observedExpectation.selector = '#other';
      probe.planSha256 = writeArtifact(item, probe.planPath, invalidPlan).sha256;
      probe.resultSha256 = writeArtifact(item, probe.resultPath, invalidResult).sha256;
    }, /invalid-submit evidence/);
  } finally { item.cleanup(); }
});
test('renders and transient captures require decoded exact pixels and bound visible state', () => {
  const item = fixture();
  try {
    fail(item, manifest => { const bytes = png(2, 1); writeFileSync(join(item.root, '.omd/.cache/desktop.png'), bytes); taskOf(manifest).renders[0].sha256 = hash(bytes); }, /exact 1280x900/);
    fail(item, manifest => { const bytes = Buffer.from('not a PNG'); writeFileSync(join(item.root, '.omd/.cache/desktop.png'), bytes); taskOf(manifest).renders[0].sha256 = hash(bytes); }, /not a PNG/);
    const desktop = png(1280, 900); writeFileSync(join(item.root, '.omd/.cache/desktop.png'), desktop);
    const frame = item.frame.replace('requirements: none', 'requirements: transient'); writeFileSync(join(item.root, '.omd/frame.md'), frame); item.manifest.frame.sha256 = hash(frame);
    const good = png(1280, 900); writeFileSync(join(item.root, '.omd/.cache/transient.png'), good);
    taskOf(item.manifest).transient = [{ path: '.omd/.cache/transient.png', sha256: hash(good), captureMode: 'settled', probeRole: 'primary', stateSelector: '#saved', stepIndex: 0, viewport: 'desktop' }];
    writeFileSync(item.input, JSON.stringify(item.manifest)); item.snapshot(); publishTaskEvidence(item.root, item.input, item.writer);
    fail(item, manifest => { const bytes = png(1280, 900, { transparent: true }); writeFileSync(join(item.root, '.omd/.cache/transient.png'), bytes); transientOf(taskOf(manifest)).sha256 = hash(bytes); }, /meaningful coherent visible/);
    fail(item, manifest => { const bytes = png(1280, 900, { flat: true, noise: true }); writeFileSync(join(item.root, '.omd/.cache/transient.png'), bytes); transientOf(taskOf(manifest)).sha256 = hash(bytes); }, /meaningful coherent visible/);
    fail(item, manifest => { const bytes = png(1280, 900, { flat: true, scattered: true }); writeFileSync(join(item.root, '.omd/.cache/transient.png'), bytes); transientOf(taskOf(manifest)).sha256 = hash(bytes); }, /meaningful coherent visible/);
    fail(item, manifest => { transientOf(taskOf(manifest)).stepIndex = 1; }, /production activation observable/);
    fail(item, manifest => { transientOf(taskOf(manifest)).stateSelector = '#unseen'; }, /production activation observable/);
  } finally { item.cleanup(); }
});
test('publication rejects directory and symlink current records and preserves immutable byte identity', () => {
  const item = fixture();
  try {
    const current = join(item.root, '.omd/task-evidence.json');
    mkdirSync(current); assert.throws(() => publishTaskEvidence(item.root, item.input, item.writer), /current record must be a regular/); rmSync(current, { recursive: true, force: true });
    symlinkSync('/tmp', current); assert.throws(() => publishTaskEvidence(item.root, item.input, item.writer), /current record must be a regular/); rmSync(current, { recursive: true, force: true });
    publishTaskEvidence(item.root, item.input, item.writer);
    const published = readFileSync(current); writeFileSync(join(item.root, '.omd/task-evidence-runs', `${hash(published)}.json`), 'tampered');
    assert.throws(() => checkTaskEvidence(item.root), /does not match immutable/);
  } finally { item.cleanup(); }
});
