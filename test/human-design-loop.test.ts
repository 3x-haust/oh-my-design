import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { extractIr, renderPage, waitForDocumentFonts } from '../core/render/index.ts';
import { decodePng } from '../core/motion/energy.ts';
import { readProbePlan, runProbe, type ProbePlan } from '../core/probe/index.ts';
import {
  ADAPTIVE_BEHAVIOR_POLICY,
  ADAPTIVE_STAGE_GRAPH,
  ADAPTIVE_STAGE_OWNERS,
  AdaptiveRouteError,
  COPY_REPAIR_WORKFLOW,
  parseRouteRecord,
  routeAdaptiveFlow,
  validateCopyRepairWorkflow,
} from '../core/route/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/probe.html', import.meta.url));
const temp = (): string => mkdtempSync(join(tmpdir(), 'omd-loop-'));

test('font-ready wait accepts ready/unsupported and fails clearly on a bounded timeout', async () => {
  const fake = (outcome: 'ready' | 'unsupported' | 'timeout') => ({
    evaluate: async (_fn: unknown, timeout: number) => {
      assert.equal(timeout, 37);
      return outcome;
    },
  });
  await waitForDocumentFonts(fake('ready') as never, 37);
  await waitForDocumentFonts(fake('unsupported') as never, 37);
  await assert.rejects(waitForDocumentFonts(fake('timeout') as never, 37), /document\.fonts\.ready timed out after 37ms/);
});

test('IR exposes declared FontFace inventory without claiming source or glyph identity', async () => {
  const dir = temp();
  const page = join(dir, 'font-face.html');
  writeFileSync(page, [
    '<!doctype html><style>',
    '@font-face { font-family: "OMD Proof Face"; src: local("__OMD_MISSING_FACE__");',
    'font-style: italic; font-weight: 650; font-stretch: condensed; }',
    'body { font-family: "OMD Proof Face", sans-serif; font-weight: 650; }',
    '</style><body>타이포그래피 Proof 123</body>',
  ].join('\n'));
  const ir = await extractIr(page, { viewport: { width: 390, height: 844 } });
  const face = ir.meta?.fontFaces?.find((item) => item.family.includes('OMD Proof Face'));
  assert.ok(face, 'declared face must be present in IR metadata even when loading fails');
  assert.ok(['unloaded', 'loading', 'loaded', 'error'].includes(face.status));
  assert.equal(face.style, 'italic');
  assert.equal(face.weight, '650');
  assert.equal(face.stretch, 'condensed');
  assert.equal(face.source, null);
  assert.equal(face.glyphIdentity, null);
});

test('normal and squint renders both exist and differ at desktop and mobile', async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const dir = temp();
    const normal = join(dir, `normal-${viewport.width}.png`);
    const squint = join(dir, `squint-${viewport.width}.png`);
    const adapter = createTestProjectWriteAdapter(dir);
    await renderPage(fixture, { viewport, out: normal, adapter });
    await renderPage(fixture, { viewport, out: squint, squint: true, adapter });
    assert.ok(existsSync(normal) && existsSync(squint));
    const dimensions = decodePng(readFileSync(normal));
    assert.deepEqual({ width: dimensions.width, height: dimensions.height }, viewport);
    assert.notDeepEqual(readFileSync(normal), readFileSync(squint));
  }
});

test('full-page render is explicit and may exceed the fixed viewport', async () => {
  const dir = temp();
  const page = join(dir, 'tall.html');
  const fixed = join(dir, 'fixed.png');
  const full = join(dir, 'full.png');
  const cliFull = join(dir, 'cli-full.png');
  writeFileSync(page, '<!doctype html><style>body{margin:0}.tall{height:1500px}</style><main class="tall">Long page</main>');
  const viewport = { width: 390, height: 844 };
  const adapter = createTestProjectWriteAdapter(dir);
  await renderPage(page, { viewport, out: fixed, adapter });
  await renderPage(page, { viewport, out: full, fullPage: true, adapter });
  assert.equal(decodePng(readFileSync(fixed)).height, 844);
  assert.ok(decodePng(readFileSync(full)).height > 844);
  const cli = spawnSync(process.execPath, [join(root, 'bin/omd.ts'), 'render', page, '--viewport', '390x844', '--full-page', '-o', cliFull], { cwd: dir, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(decodePng(readFileSync(cliFull)).height > 844);
});

test('probe warns only from declared expectations and expected tab order', async () => {
  await assert.rejects(
    runProbe(fixture, { name: 'unsafe', destructive: false, steps: [{ action: 'click', selector: '#toggle' }] }),
    /at least one declared expectation/,
  );

  const expected = await runProbe(fixture, {
    name: 'path', destructive: false, expectedTabOrder: ['#toggle', '#name'],
    steps: [
      { action: 'click', selector: '#toggle', expect: [{ type: 'visible', selector: '#panel' }] },
      { action: 'fill', selector: '#name', value: 'Ada', expect: [{ type: 'attribute', selector: '#name', name: 'value', value: 'Ada' }] },
    ],
  });
  assert.deepEqual(expected.warnings, []);
  assert.deepEqual(expected.viewport, { width: 390, height: 844 });
  assert.deepEqual(expected.steps[1], {
    action: 'fill', selector: '#name', ok: true,
    expectations: [{ type: 'attribute', selector: '#name', name: 'value', value: 'Ada', ok: true }],
  });

  const pressed = await runProbe(fixture, {
    name: 'keyboard', destructive: false,
    steps: [{ action: 'press', selector: '#toggle', key: 'Enter', expect: [{ type: 'visible', selector: '#panel' }] }],
  });
  assert.deepEqual(pressed.warnings, []);

  const wrong = await runProbe(fixture, {
    name: 'wrong', destructive: false, expectedTabOrder: ['#name'],
    steps: [{ action: 'click', selector: '#toggle', expect: [{ type: 'hidden', selector: '#panel' }] }],
  });
  assert.deepEqual(new Set(wrong.warnings.map((warning) => warning.id)), new Set(['PROBE-TAB-DISORDER', 'PROBE-DEAD-CONTROL']));
});

test('probe plan rejects destructive, credential, and unsupported actions', () => {
  const dir = temp();
  const path = join(dir, 'plan.json');
  writeFileSync(path, JSON.stringify({ name: 'bad', destructive: true, steps: [] }));
  assert.throws(() => readProbePlan(path), /destructive:false/);
  writeFileSync(path, JSON.stringify({ name: 'bad', destructive: false, auth: {}, steps: [] }));
  assert.throws(() => readProbePlan(path), /authenticated/);
  writeFileSync(path, JSON.stringify({ name: 'bad', destructive: false, steps: [{ action: 'delete', selector: '#x' }] }));
  assert.throws(() => readProbePlan(path), /unsafe probe action/);
});

test('runProbe validates direct API plans fail-closed before browser execution', async () => {
  const invalid = (value: unknown): Promise<unknown> => runProbe(fixture, value as ProbePlan);
  await assert.rejects(invalid({ name: 'bad', destructive: true, steps: [] }), /destructive:false/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, auth: {}, steps: [] }), /authenticated/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, steps: [{ action: 'delete', selector: '#toggle', expect: [{ type: 'visible', selector: '#panel' }] }] }), /unsafe probe action/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, steps: [{ action: 'fill', selector: '#auth-token', value: 'x', expect: [{ type: 'visible', selector: '#panel' }] }] }), /credential/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, steps: [{ action: 'press', key: 'Control+L', expect: [{ type: 'visible', selector: '#panel' }] }] }), /allowlist/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, steps: [{ action: 'click', selector: '#toggle', expect: [{ type: 'visible' }] }] }), /selector/);
  await assert.rejects(invalid({ name: 'bad', destructive: false, steps: [{ action: 'click', selector: '#toggle' }] }), /declared expectation/);
});

test('probe refuses remote targets', async () => {
  await assert.rejects(runProbe('https://example.com', {
    name: 'remote', destructive: false,
    steps: [{ action: 'click', selector: '#x', expect: [{ type: 'visible', selector: '#y' }] }],
  }), /remote targets/);
});

test('adaptive process contracts preserve ownership, isolation, checkpoints, and executable gates', () => {
  const input = JSON.parse(readFileSync(join(root, 'test/fixtures/adaptive-flow/copy-only.json'), 'utf8'));
  const route = routeAdaptiveFlow(input);
  const process = route.behavior.policy.process;

  assert.deepEqual(process.artifactOwners, {
    copyDeck: 'omd-writer', typeProof: 'omd-typesetter', composition: 'omd-composer',
    candidates: 'omd-sketch', production: 'omd-hand', review: 'omd-eye', squint: 'omd-glance',
  });
  assert.deepEqual(process.checkpointSequence, [
    'semantic-render-decision', 'typography-reproof', 'visual-render-decision',
  ]);
  assert.equal(process.checkpointNone, 'no-human-approval-wait');
  assert.equal(process.squintBeforeSharp, true);
  assert.equal(process.showpieceLensCount, 1);
  assert.deepEqual(process.reviewIsolation.fidelityAllowed, ['selected-projections', 'handoff-receipts']);
  assert.deepEqual(process.reviewIsolation.glanceAllowed, ['squint-renders']);
  assert.deepEqual(process.typeProof.viewports, ['1280x900', '390x844']);
  assert.deepEqual(process.typeProof.reject, ['fallback', 'tofu', 'faux', 'invented-type-scale']);
  assert.deepEqual(process.immutableInputs, ['frame', 'copy-deck', 'type-proof', 'scout-summary']);
  assert.deepEqual(process.preferenceOrder, [
    'current-brief', 'current-user-feedback', 'project-taste', 'model-judgment',
  ]);
  assert.deepEqual(route.behavior.policy.references.coverage, [
    'domain', 'competitors', 'audience-language', 'typography', 'voice', 'motion', 'components',
  ]);
  assert.deepEqual(process.roleCapabilities.requiredTools, [
    'Bash(omd pack:*)', 'Bash(omd copy:*)', 'Bash(omd composition:*)',
    'Bash(shasum:*)', 'Bash(omd source:*)',
  ]);
  assert.deepEqual(process.evidenceChecks, [
    'copy-check', 'motion-spec-before-code', 'attribution', 'finish-pass', 'design-check',
    'reference-distance-advisory', 'target-diff', 'site-check', 'sharp-desktop-mobile',
    'filmstrip-when-applicable', 'humanize-review', 'declared-probes', 'non-deterministic-craft-review',
  ]);
  assert.deepEqual(ADAPTIVE_STAGE_GRAPH.composition.prerequisites, ['frame', 'copy']);
  assert.deepEqual(ADAPTIVE_STAGE_GRAPH['candidate-generation'].prerequisites, ['composition']);
  assert.equal(ADAPTIVE_STAGE_OWNERS.production, 'omd-hand');
  assert.equal(ADAPTIVE_STAGE_OWNERS['independent-review'], 'omd-eye');
  assert.ok(route.strategy.skips.some((skip) => skip.id === 'composition' && skip.reason.trim() !== ''));
  assert.deepEqual(route.behavior.active.copyRepairWorkflow, {
    status: 'selected', steps: COPY_REPAIR_WORKFLOW,
  });

  for (const role of ['framer', 'scout', 'sketch', 'hand', 'eye', 'writer', 'typesetter', 'composer']) {
    const agent = parse(readFileSync(join(root, `src/agents/${role}.agent.yaml`), 'utf8'));
    const allow = Reflect.get(agent, 'allow');
    assert.ok(Array.isArray(allow) && allow.includes('Bash(omd pack:*)'), role);
  }

  const forged = structuredClone(route);
  Reflect.set(forged.behavior.policy.process, 'squintBeforeSharp', false);
  assert.throws(() => parseRouteRecord(forged), AdaptiveRouteError);
});

test('copy repair is an exact writer-check-editor-writer-recheck workflow or a typed full skip', () => {
  assert.deepEqual(validateCopyRepairWorkflow([
    'writer', 'copy-check', 'copy-editor', 'writer', 'copy-recheck',
  ]), COPY_REPAIR_WORKFLOW);
  const malformed = [
    ['writer', 'copy-check', 'copy-editor', 'writer'],
    ['writer', 'copy-check', 'copy-editor', 'copy-editor', 'writer', 'copy-recheck'],
    ['copy-check', 'writer', 'copy-editor', 'writer', 'copy-recheck'],
    ['writer', 'copy-check', 'proofreader', 'writer', 'copy-recheck'],
  ];
  for (const workflow of malformed) {
    assert.throws(() => validateCopyRepairWorkflow(workflow), AdaptiveRouteError);
  }

  const skipped = routeAdaptiveFlow(JSON.parse(readFileSync(
    join(root, 'test/fixtures/adaptive-flow/medical-new-product.json'), 'utf8',
  )));
  assert.equal(skipped.behavior.active.copyRepairWorkflow.status, 'skipped');
  assert.ok(skipped.strategy.skips.some((entry) => entry.id === 'copy-repair-workflow' && entry.reason.trim() !== ''));

  const forged = structuredClone(routeAdaptiveFlow(JSON.parse(readFileSync(
    join(root, 'test/fixtures/adaptive-flow/copy-only.json'), 'utf8',
  ))));
  Reflect.set(forged.behavior.active.copyRepairWorkflow, 'steps', [
    'writer', 'copy-check', 'copy-editor', 'copy-recheck',
  ]);
  assert.throws(() => parseRouteRecord(forged), AdaptiveRouteError);
});

test('typography policy is proof-based and contains no fixed size quota', () => {
  assert.equal(ADAPTIVE_BEHAVIOR_POLICY.process.typeProof.scope, 'typography-only');
  assert.equal(Object.hasOwn(ADAPTIVE_BEHAVIOR_POLICY.process.typeProof, 'minimumFontSize'), false);
  assert.equal(Object.hasOwn(ADAPTIVE_BEHAVIOR_POLICY.process.typeProof, 'viewportFillQuota'), false);
});
