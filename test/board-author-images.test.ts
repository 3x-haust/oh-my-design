import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { authorReferenceBoard } from '../core/ref/board-author.ts';
import { parseReferenceBoard } from '../core/ref/board-parser.ts';
import { readReferenceBoardArtifacts } from '../core/ref/board-artifacts.ts';
import { persistImageFragment } from '../core/ref/image-fragment.ts';
import { auditBoardGranularity } from '../core/ref/board-granularity.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');
const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }];

function fixture(context: TestContext, bound = false) {
  const root = mkdtempSync(join(tmpdir(), 'omd-board-author-image-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd/refs'), { recursive: true });
  writeFileSync(join(root, '.omd/frame.md'), '# Pictured message layout\n');
  const binding = {
    zoneId: 'conversation', decisionId: 'message-composer', axis: 'structure', sourceState: 'pictured message and composer',
    sourceViewport: viewports[0], targetViewports: viewports,
    responsiveConsequence: 'Keep message identity and composer adjacent at both widths; app reflow is unmeasured.',
    conflictGroup: null, conflictResolution: null,
    falsifier: 'The selected message becomes separated from its composer.',
  };
  const zone = {
    id: 'conversation', kind: 'state', job: 'Keep a message and its composer together.', required: true,
    ...(bound ? {
      decisionId: binding.decisionId, question: 'How is message identity attached to the composer?',
      axes: ['structure'], requiredState: binding.sourceState, viewports, falsifier: binding.falsifier,
    } : {}),
  };
  writeFileSync(join(root, '.omd/acquisition-plan.json'), JSON.stringify({
    schema: bound ? 'reference-acquisition-plan-v2' : 'reference-acquisition-plan-v1',
    owner: 'omd-framer', ...(bound ? { localeContextSha256: null } : {}), zones: [zone],
  }));
  writeFileSync(join(root, '.omd/refs/captured.png'), PNG);
  const fragmentInput = {
    inputPath: '.omd/refs/captured.png',
    provenance: {
      sourcePage: 'https://product.example/help/conversation', captureRegion: 'Message and composer illustration',
      licenseStatus: 'unknown' as const, rightsNotes: 'Private visual reference; source pixels are not a production asset.',
      capturedAt: '2026-09-13T00:00:00.000Z',
    },
    transfer: { visualRole: 'message to composer adjacency', principles: ['Keep selected identity above the message and composer.'] },
  };
  const fragment = persistImageFragment(root, fragmentInput, createTestProjectRunInvocation(root));
  const piece: Record<string, unknown> = {
    slotId: 'conversation', sourceKind: 'image-fragment', referenceId: fragment.id,
    targetComponent: 'Conversation', targetSelector: '#conversation', taskIds: ['T1'],
    reason: 'Use pictured adjacency without claiming measured app internals.', take: ['structure'],
    avoid: 'Do not inherit source pixels or typography.', adaptation: 'Use local content and independently tested controls.',
    grid: { column: 1, span: 12, order: 0 }, rights: 'unknown', signal: 'supporting-component', motionAxis: 'absent',
    ...(bound ? { binding } : {}),
  };
  const input = { candidates: [
    { id: 'single-lane', label: 'Single lane', route: '/', rationale: 'Keep the task in one vertical lane.', pieces: [structuredClone(piece)] },
    { id: 'context-rail', label: 'Context rail', route: '/', rationale: 'Reserve adjacent space for secondary context.', pieces: [{ ...structuredClone(piece), grid: { column: 1, span: 8, order: 0 } }] },
  ] };
  return { root, input, fragment, fragmentInput, binding };
}

test('native image import and board publication retain image provenance without inventing component anatomy', context => {
  const { root, input, fragmentInput, fragment } = fixture(context);
  const inputPath = join(root, '.omd/refs/import.json');
  writeFileSync(inputPath, JSON.stringify(fragmentInput));
  const imported = spawnSync(process.execPath, [CLI, 'ref', 'import-image', inputPath, '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).id, fragment.id, 'absolute CLI filename and relative image identity are distinct');
  const boardInput = join(root, '.omd/refs/board-input.json');
  writeFileSync(boardInput, JSON.stringify(input));
  const published = spawnSync(process.execPath, [CLI, 'ref', 'board', '--input', boardInput, '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(published.status, 0, published.stderr);
  const artifacts = readReferenceBoardArtifacts(root);
  const resolved = artifacts.resolved.candidates[0]!.pieces[0]!;
  assert.equal(resolved.sourceKind, 'image-fragment');
  if (resolved.sourceKind !== 'image-fragment') throw new Error('wrong evidence kind');
  assert.equal(resolved.provenance.sourcePage, fragmentInput.provenance.sourcePage);
  assert.deepEqual(readFileSync(resolved.imagePath), PNG);
  assert.equal('reference' in resolved, false, 'no synthetic component blueprint is attached');
  assert.doesNotMatch(artifacts.assemblyBytes, /product\.example|\.omd\/refs|sourcePage/);
});

test('printed image-fragment input imports local captures and rejects remote inputs and forged output fields', context => {
  const { root, fragmentInput, fragment } = fixture(context);
  const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
  const printed = run('schema', 'reference-image-fragment', '--json');
  assert.equal(printed.status, 0, printed.stderr);
  const help = JSON.parse(printed.stdout);
  const input = help.skeleton;
  assert.deepEqual(Object.keys(input).sort(), help.keys.toSorted());
  input.inputPath = fragmentInput.inputPath;
  Object.assign(input.provenance, fragmentInput.provenance);
  Object.assign(input.transfer, fragmentInput.transfer);
  const inputPath = join(root, 'image-import-input.json');
  const importValue = (value: unknown) => {
    writeFileSync(inputPath, JSON.stringify(value));
    return run('ref', 'import-image', inputPath, '--json');
  };
  const imported = importValue(input);
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(JSON.parse(imported.stdout).id, fragment.id);
  const optional = structuredClone(input);
  optional.provenance.sourceImage = 'https://product.example/capture.png';
  optional.provenance.cropBox = { x: 0, y: 0, width: 1, height: 1 };
  optional.transfer.geometry = { width: 1, height: 1, aspectRatio: 1 };
  const extended = importValue(optional);
  assert.equal(extended.status, 0, extended.stderr);
  assert.deepEqual(JSON.parse(extended.stdout).transfer.geometry, optional.transfer.geometry);
  for (const inputPath of ['https://product.example/capture.png', join(root, fragmentInput.inputPath), '../capture.png']) {
    const rejected = importValue({ ...input, inputPath });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /local PNG path|plain relative path/);
  }
  const forged = importValue({ ...input, id: fragment.id });
  assert.equal(forged.status, 1);
  assert.match(forged.stderr, /unknown or missing keys/);
});

test('image pieces preserve acquisition v2 bindings and reject invented DOM measurements or changed requirements', context => {
  const { root, input, binding } = fixture(context, true);
  const board = authorReferenceBoard(root, input);
  assert.equal(board.schemaVersion, 'reference-board-v3');
  assert.deepEqual(board.candidates[0]!.pieces[0]!.binding, binding);
  const mutate = (change: Record<string, unknown>) => {
    const bad = structuredClone(input);
    bad.candidates[0]!.pieces[0]!.binding = { ...binding, ...change };
    return bad;
  };
  assert.throws(() => authorReferenceBoard(root, mutate({ sourceState: 'different state' })), /sourceState does not match/);
  assert.throws(() => authorReferenceBoard(root, mutate({ targetViewports: [viewports[0]] })), /exactly preserve/);
  assert.throws(() => authorReferenceBoard(root, mutate({ falsifier: 'A different failure.' })), /falsifier does not match/);
  assert.throws(() => authorReferenceBoard(root, mutate({ measurements: [
    { id: 'made-up-width', quantity: 'width', sourceNodes: [0], targetAnchors: ['@root'] },
  ] })), /declared measurements require a captured component blueprint/);
});

test('Framer can require static appearance while default anatomy, state, motion and currentness remain enforced', context => {
  const { root, input, fragment, binding } = fixture(context, true);
  const run = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
  const planPath = join(root, '.omd/acquisition-plan.json');
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  const inputPath = join(root, 'board-input.json');
  writeFileSync(inputPath, JSON.stringify(input));
  const publish = () => run('ref', 'board', '--input', inputPath, '--json');
  assert.equal(publish().status, 0);
  const defaultCheck = run('ref', 'check', '--json');
  assert.equal(defaultCheck.status, 1);
  assert.match(defaultCheck.stdout, /REF-ZONE-UNCOVERED/, 'an image cannot discharge default measured anatomy');

  plan.zones[0].evidenceRequirement = { kind: 'visible-appearance', reason: 'This question concerns pictured adjacency only; independent measured and production obligations remain separate.' };
  writeFileSync(planPath, JSON.stringify(plan));
  assert.equal(run('ref', 'check', '--json').status, 1, 'changing the plan invalidates the old board');
  const published = publish();
  assert.equal(published.status, 0, published.stderr);
  for (const args of [['ref', 'check', '--json'], ['ref', 'granularity', '--json']]) {
    const checked = run(...args);
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
  }
  const badState = structuredClone(input);
  badState.candidates[0]!.pieces[0]!.binding = { ...binding, sourceState: 'An unobserved error state' };
  assert.throws(() => authorReferenceBoard(root, badState), /sourceState does not match/);
  const fakeMeasurement = structuredClone(input);
  fakeMeasurement.candidates[0]!.pieces[0]!.binding = { ...binding, measurements: [{ id: 'fake-gap', quantity: 'gap-x', sourceNodes: [0, 1], targetAnchors: ['title', 'composer'] }] };
  assert.throws(() => authorReferenceBoard(root, fakeMeasurement), /component blueprint/);

  rmSync(join(root, '.omd/reference-board.json'));
  plan.zones[0].axes = ['motion'];
  writeFileSync(planPath, JSON.stringify(plan));
  const invalidAxis = run('ref', 'granularity', '--json');
  assert.equal(invalidAxis.status, 1);
  assert.match(invalidAxis.stderr, /ACQUISITION-APPEARANCE-AXIS/);
  plan.zones[0].axes = ['structure'];
  for (const evidenceRequirement of [null, { kind: 'anything', reason: 'Invalid' }, { kind: 'visible-appearance', reason: '' }, { kind: 'visible-appearance', reason: 'https://source.example' }, { kind: 'visible-appearance', reason: 'Valid reason', extra: true }]) {
    plan.zones[0].evidenceRequirement = evidenceRequirement;
    writeFileSync(planPath, JSON.stringify(plan));
    const invalid = run('ref', 'granularity', '--json');
    assert.equal(invalid.status, 1, 'malformed plans must not silently erase coverage');
    assert.match(invalid.stderr, /ACQUISITION-EVIDENCE-REQUIREMENT/);
  }
  plan.zones[0].evidenceRequirement = { kind: 'visible-appearance', reason: 'Visible adjacency only.' };
  writeFileSync(planPath, JSON.stringify(plan));
  assert.equal(publish().status, 0);
  writeFileSync(join(root, fragment.imagePath), 'changed pixels');
  assert.equal(run('ref', 'check', '--json').status, 1, 'appearance still needs current validated image bytes');
});

test('board author rejects missing or changed fragment bytes and mixed evidence identities', context => {
  const { root, input, fragment } = fixture(context);
  const missing = structuredClone(input);missing.candidates[0]!.pieces[0]!.referenceId = 'fragment-0000000000000000';
  assert.throws(() => authorReferenceBoard(root, missing), /missing or invalid/);
  const mixed = structuredClone(input);mixed.candidates[0]!.pieces[0]!.source = 'https://product.example/';
  assert.throws(() => authorReferenceBoard(root, mixed), /unknown keys: source/);
  writeFileSync(join(root, fragment.imagePath), 'changed pixels');
  assert.throws(() => authorReferenceBoard(root, input), /valid PNG|unreadable PNG|PNG digest mismatch/);
});

test('appearance coverage is required in every candidate and never discharges a separate measured obligation', context => {
  const { root, input } = fixture(context, true);
  const board = authorReferenceBoard(root, input);
  const scope = { zones: ['conversation'], appearanceZones: ['conversation'] };
  const missing = (value: typeof board, options = scope) => auditBoardGranularity([], { ...options, board: value })
    .find(finding => finding.id === 'REF-ZONE-UNCOVERED');
  assert.equal(missing(board), undefined);
  const incomplete = { ...board, candidates: board.candidates.map((candidate, index) => ({ ...candidate, pieces: index === 1 ? [] : candidate.pieces })) };
  assert.ok(missing(incomplete), 'one candidate cannot borrow another candidate’s appearance evidence');
  const anti = { ...board, candidates: board.candidates.map((candidate, index) => ({ ...candidate,
    pieces: candidate.pieces.map(piece => index === 1 ? { ...piece, evidenceAxes: { ...piece.evidenceAxes, signal: 'anti-reference' as const } } : piece),
  })) };
  assert.ok(missing(anti), 'a rejected appearance cannot satisfy positive coverage');
  const mixed = { ...board, candidates: board.candidates.map(candidate => ({ ...candidate, pieces: [
    ...candidate.pieces,
    { ...candidate.pieces[0]!, slotId: 'measured-composer', binding: { ...candidate.pieces[0]!.binding!, zoneId: 'measured-composer' } },
  ] })) };
  const finding = missing(mixed, { zones: ['conversation', 'measured-composer'], appearanceZones: ['conversation'] });
  assert.deepEqual(finding?.refs, ['zone: measured-composer']);
});

test('a static image cannot be published as motion or classified content evidence', context => {
  const { root, input } = fixture(context);
  const raw = authorReferenceBoard(root, input);
  for (const change of [{ motionAxis: 'available' }, { take: ['structure', 'motion'] }]) {
    const bad = structuredClone(input);Object.assign(bad.candidates[0]!.pieces[0]!, change);
    assert.throws(() => authorReferenceBoard(root, bad), /static image fragment cannot supply motion/);
  }
  const rawMotion = structuredClone(raw);
  (rawMotion.candidates[0]!.pieces[0]!.evidenceAxes as { motionAxis: string }).motionAxis = 'available';
  assert.throws(() => parseReferenceBoard(rawMotion), /static image fragment cannot supply motion/);
  const rawTake = structuredClone(raw);
  (rawTake.candidates[0]!.pieces[0]!.take as string[]).push('motion');
  assert.throws(() => parseReferenceBoard(rawTake), /static image fragment cannot supply motion/);
  const content = structuredClone(input);content.candidates[0]!.pieces[0]!.signal = 'supporting-content';
  assert.throws(() => authorReferenceBoard(root, content), /nonvisual evidence requires a classified reference/);
});
