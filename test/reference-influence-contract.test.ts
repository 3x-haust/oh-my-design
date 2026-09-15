import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { validateAcquisitionPlan } from '../core/deliberation/contracts.ts';
import { authorReferenceBoard } from '../core/ref/board-author.ts';
import { canonicalJson, readReferenceBoardArtifacts, sha256 } from '../core/ref/board-artifacts.ts';
import { parseReferenceBoard } from '../core/ref/board-parser.ts';
import { auditBoardGranularity } from '../core/ref/board-granularity.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import { loadRefs } from '../core/ref/store.ts';
import { referenceSelectionV2Sha256, type ReferenceSelectionV2 } from '../core/ref/reference-selection.ts';
import { parseReferenceInfluenceProof, validateReferenceInfluenceProof, validateReferenceInfluenceProofCurrentness } from '../core/ref/reference-influence-proof.ts';
import { assertReferenceVisualPacketNotShipped, buildReferenceVisualPacket, validateReferenceVisualPacketCurrentness } from '../core/ref/reference-visual-packet.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { verifyReferenceEvidence } from '../core/ref/reference-verification.ts';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');
const HASH = 'a'.repeat(64);
const INVARIANTS: Invariants = { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] };
const blueprint = (selector: string): Blueprint => ({ selector, capturedAt: '2026-09-02T00:00:00.000Z', nodes: [
  { id: `${selector}-root`, role: 'container', children: [`${selector}-label`, `${selector}-value`], box: { w: 240, h: 120 }, position: { x: 0, y: 0 }, direction: 'HORIZONTAL', gap: 12 },
  { id: `${selector}-label`, role: 'text', children: [], box: { w: 72, h: 24 }, position: { x: 0, y: 12 }, textLength: 'label' },
  { id: `${selector}-value`, role: 'heading', children: [], box: { w: 156, h: 48 }, position: { x: 84, y: 48 }, textLength: 'phrase' },
] });

const acquisition = () => ({
  schema: 'reference-acquisition-plan-v2', owner: 'omd-framer', localeContextSha256: null,
  zones: [{
    id: 'event-detail', kind: 'state', job: 'Make the selected event immediately scannable.', required: true,
    decisionId: 'selected-event-anatomy', question: 'How should fact hierarchy and spacing expose the changed event?',
    axes: ['structure', 'rhythm'], requiredState: 'selected',
    viewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
    falsifier: 'The selected title, date, venue, accessibility note, or attendance condition loses its hierarchy.',
  }],
});

function fixture(context: { after(callback: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'omd-reference-influence-'));
  context.after(() => { /* OS temp cleanup is deliberately left to the test runner. */ });
  mkdirSync(join(root, '.omd', 'refs'), { recursive: true });
  writeFileSync(join(root, '.omd', 'frame.md'), '# event explorer frame\n');
  writeFileSync(join(root, '.omd', 'acquisition-plan.json'), canonicalJson(acquisition()));
  const adapter = createTestProjectWriteAdapter(root);
  const specs = [
    { source: 'https://events.example.kr/detail', component: 'fact-stack', selector: '.facts' },
    { source: 'https://calendar.example.kr/event', component: 'detail-rhythm', selector: '.detail' },
  ];
  for (const spec of specs) {
    const imagePath = refImagePath(root, spec);
    const reference: Reference = { ...spec, slot: 'event-detail', kind: 'component', capturedAt: '2026-09-02T00:00:00.000Z', viewport: { width: 1280, height: 900 }, invariants: INVARIANTS, principles: ['Preserve the selected fact hierarchy.'], blueprint: blueprint(spec.selector), imagePath: relative(root, imagePath) };
    saveRef(root, reference, adapter); writeFileSync(imagePath, PNG);
  }
  const binding = (axis: 'structure' | 'rhythm') => ({
    zoneId: 'event-detail', decisionId: 'selected-event-anatomy', axis, sourceState: 'selected',
    sourceViewport: { width: 1280, height: 900 }, targetViewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
    responsiveConsequence: 'Desktop columns become one ordered mobile fact stack.', conflictGroup: null, conflictResolution: null,
    falsifier: 'The selected title, date, venue, accessibility note, or attendance condition loses its hierarchy.',
  });
  const piece = (spec: typeof specs[number], axis: 'structure' | 'rhythm', order: number) => ({
    slotId: `event-detail-${axis}`, source: spec.source, component: spec.component, targetComponent: 'SelectedEventDetail',
    targetSelector: '[data-state="selected-event"]', taskIds: ['T1'], reason: `Use measured ${axis}.`, take: [axis],
    avoid: 'Do not copy source identity or copy.', adaptation: 'Use demo facts and the destination type system.',
    grid: { column: order === 0 ? 1 : 7, span: 6, order }, rights: 'lawful', signal: 'high-visual-system', motionAxis: 'absent', binding: binding(axis),
  });
  const input = { candidates: [
    { id: 'facts-first', label: 'Facts first', route: '/events', rationale: 'Hierarchy and rhythm remain independently accountable.', pieces: specs.map((spec, index) => piece(spec, index === 0 ? 'structure' : 'rhythm', index)) },
    { id: 'rhythm-first', label: 'Rhythm first', route: '/events', rationale: 'The same evidence is recomposed without changing its promises.', pieces: [piece(specs[1]!, 'rhythm', 0), piece(specs[0]!, 'structure', 1)] },
  ] };
  return { root, input };
}

test('acquisition v2 closes decision, locale, state, viewport, and falsifier fields', () => {
  assert.ok(validateAcquisitionPlan(acquisition()).value);
  const invalid = structuredClone(acquisition()) as { zones: Record<string, unknown>[] };
  invalid.zones[0]!.axes = [];
  assert.ok(validateAcquisitionPlan(invalid).findings.some((finding) => finding.id === 'ACQUISITION-AXES'));
  const duplicateViewport = structuredClone(acquisition());
  duplicateViewport.zones[0]!.viewports.push({ width: 1280, height: 900 });
  assert.ok(validateAcquisitionPlan(duplicateViewport).findings.some((finding) => finding.id === 'ACQUISITION-VIEWPORT-DUPLICATE'));
});

test('acquisition verification exposes real source bindings and does not claim semantic inspection', async context => {
  const { root, input } = fixture(context);
  const board = authorReferenceBoard(root, input);
  writeFileSync(join(root, '.omd/reference-board.json'), canonicalJson(board));
  const report = await verifyReferenceEvidence(root, { candidateId: 'facts-first' });
  assert.equal(report.rows.length, 2);
  assert.ok(report.rows.every(row => row.acquisition === 'measured-component' && row.semanticState === 'requires-visible-inspection'));
  assert.ok(report.rows.every(row => row.comparison === null));
  assert.ok(report.rows.every(row => 'sourceSelector' in row && row.sourceSelector));
  await assert.rejects(() => verifyReferenceEvidence(root, { candidateId: 'invented' }), /does not exist/);
  const refs = loadRefs(root); const old = refs[0]!;
  delete old.blueprint!.nodes[0]!.position;
  saveRef(root, old, createTestProjectWriteAdapter(root));
  const changed = await verifyReferenceEvidence(root, { candidateId: 'facts-first' });
  assert.ok(changed.rows.some(row => row.acquisition === 'unmeasured-geometry'));
});

test('declared feature bindings retain source-free numeric correspondence and reject invalid captured nodes before publication', context => {
  const { root, input } = fixture(context);
  const withFeatures = structuredClone(input) as any;
  withFeatures.candidates[0].pieces[0].binding.measurements = [
    { id: 'label-value-offset', quantity: 'left-edge-offset', sourceNodes: [1, 2], targetAnchors: ['label', 'value'] },
  ];
  const board = authorReferenceBoard(root, withFeatures);
  writeFileSync(join(root, '.omd/reference-board.json'), canonicalJson(board));
  const artifacts = readReferenceBoardArtifacts(root);
  const projected = artifacts.assembly.candidates.find(candidate => candidate.id === 'facts-first')!.pieces[0]!.binding!;
  assert.deepEqual(projected.measurements, withFeatures.candidates[0].pieces[0].binding.measurements);
  assert.doesNotMatch(artifacts.assemblyBytes, /events\.example\.kr|calendar\.example\.kr|sourceSelector/);
  (projected.measurements![0]!.sourceNodes as number[])[0] = 999;
  assert.deepEqual(artifacts.resolved.candidates.find(candidate => candidate.id === 'facts-first')!.pieces[0]!.binding!.measurements![0]!.sourceNodes, [1, 2]);
  withFeatures.candidates[0].pieces[0].binding.measurements[0].sourceNodes = [1, 999];
  assert.throws(() => authorReferenceBoard(root, withFeatures), /source node 999/);
  assert.deepEqual(JSON.parse(readFileSync(join(root, '.omd/reference-board.json'), 'utf8')), board, 'invalid definitions cannot replace the existing board');
});

test('reference-state guidance separates observed sources from destination outcomes', () => {
  const plan = inputSkeleton('acquisition-plan');
  assert.ok(plan.constraints);
  assert.match(plan.constraints.join(' '), /reference component state to inspect, not a desired destination capability/);
  assert.match(plan.constraints.join(' '), /Framer repairs the acquisition plan/);
  const board = inputSkeleton('reference-board');
  assert.ok(board.constraints);
  assert.match(board.constraints.join(' '), /truthfully describe the captured reference state and match zone.requiredState/);
});

test('Framer rejects non-transferable state and falsifier payloads before Scout builds a board', () => {
  for (const payload of ['The Node.js 22.19 prerequisite is absent.', 'See https://example.com/source.', 'The .omd/refs/capture.png is hidden.', '<button>Install</button>']) {
    for (const field of ['requiredState', 'falsifier'] as const) {
      const input = acquisition();
      input.zones[0]![field] = payload;
      const checked = validateAcquisitionPlan(input);
      assert.equal(checked.value, undefined, `${field}: ${payload}`);
      assert.ok(checked.findings.some(finding => finding.path === `zones[0].${field}` && finding.id.endsWith('-PAYLOAD')));
    }
  }
  const transferable = acquisition();
  transferable.zones[0]!.requiredState = 'Installation steps and the runtime prerequisite are visible.';
  transferable.zones[0]!.falsifier = 'The setup order is unclear or the stated runtime prerequisite is missing.';
  assert.ok(validateAcquisitionPlan(transferable).value);
  transferable.zones[0]!.falsifier = 'The displayed rate loses its 3.1 mm/s value.';
  assert.ok(validateAcquisitionPlan(transferable).value, 'the existing bounded measurement-ratio exception is preserved');
});

test('plan repair guidance does not weaken exact reference-state binding', (context) => {
  const { root, input } = fixture(context);
  assert.ok(authorReferenceBoard(root, input));
  const mislabeled = structuredClone(input);
  mislabeled.candidates[0]!.pieces[0]!.binding.sourceState = 'Destination installation completed';
  assert.throws(() => authorReferenceBoard(root, mislabeled), /sourceState does not match acquisition zone/);
});

test('board v3 binds two source identities and axes to one destination without leaking sources', (context) => {
  const { root, input } = fixture(context);
  const board = authorReferenceBoard(root, input);
  assert.equal(board.schemaVersion, 'reference-board-v3');
  assert.deepEqual(board.candidates[0]?.pieces.map((piece) => piece.binding?.zoneId), ['event-detail', 'event-detail']);
  const artifacts = readReferenceBoardArtifacts(root, (() => { const path = join(root, '.omd', 'reference-board.json'); writeFileSync(path, canonicalJson(board)); return path; })());
  assert.equal(artifacts.assembly.schemaVersion, 'reference-assembly-v2');
  assert.equal(artifacts.projection.schemaVersion, 'reference-evidence-projection-v3');
  assert.deepEqual(artifacts.assembly.candidates[0]?.pieces.map((piece) => piece.binding?.axis), ['structure', 'rhythm']);
  for (const privateValue of ['events.example.kr', 'calendar.example.kr', '.omd/refs', 'referenceId', 'imagePath']) assert.doesNotMatch(artifacts.assemblyBytes, new RegExp(privateValue.replaceAll('.', '\\.')));
  assert.match(artifacts.boardBytes, /events\.example\.kr/);
  assert.deepEqual(auditBoardGranularity(loadRefs(root), { zones: ['event-detail'], board: artifacts.manifest }).filter((finding) => finding.id === 'REF-NO-PARTS' || finding.id === 'REF-ZONE-UNCOVERED'), []);
});

test('board v3 rejects undeclared axes, duplicate influence claims, unresolved same-axis conflicts, and stale acquisition', (context) => {
  const { root, input } = fixture(context);
  const undeclared = structuredClone(input); undeclared.candidates[0]!.pieces[0]!.binding.axis = 'motion' as 'structure'; undeclared.candidates[0]!.pieces[0]!.take = ['motion' as 'structure'];
  assert.throws(() => authorReferenceBoard(root, undeclared), /was not requested/);

  const board = authorReferenceBoard(root, input);
  const duplicate = structuredClone(board) as any; duplicate.candidates[0]!.pieces[1] = { ...duplicate.candidates[0]!.pieces[0]!, slotId: 'duplicate', grid: { column: 7, span: 6, order: 1 } };
  assert.throws(() => parseReferenceBoard(duplicate), /must not duplicate a source part and axis/);

  const conflict = structuredClone(board) as any; conflict.candidates[0]!.pieces[1]!.binding = { ...conflict.candidates[0]!.pieces[1]!.binding!, axis: 'structure' };
  assert.throws(() => parseReferenceBoard(conflict), /require one shared conflict group and resolution/);

  const path = join(root, '.omd', 'reference-board.json'); writeFileSync(path, canonicalJson(board));
  writeFileSync(join(root, '.omd', 'acquisition-plan.json'), canonicalJson({ ...acquisition(), owner: 'omd-framer' }));
  writeFileSync(join(root, '.omd', 'acquisition-plan.json'), `${canonicalJson(acquisition()).trim()} \n`);
  assert.throws(() => readReferenceBoardArtifacts(root, path), /acquisition plan is stale/);
});

test('promise proof rejects a missing feature and axis laundering despite valid hashes', (context) => {
  const { root, input } = fixture(context); const board = authorReferenceBoard(root, input);
  const path = join(root, '.omd', 'reference-board.json'); writeFileSync(path, canonicalJson(board));
  const artifacts = readReferenceBoardArtifacts(root, path); const candidate = artifacts.projection.candidates[0]!;
  const selection: ReferenceSelectionV2 = {
    schemaVersion: 'reference-selection-v2', captureSha256: sha256(artifacts.boardBytes), assemblySha256: sha256(artifacts.assemblyBytes), projectionSha256: sha256(artifacts.projectionBytes), candidateId: candidate.id,
    slots: candidate.pieces.map((piece) => ({ slotId: piece.slotId, rights: piece.rights, signal: piece.signal, staticAxis: piece.staticAxis, motionAxis: piece.motionAxis, obligationDisposition: 'used', obligationReason: 'Selected for the named promise.' })),
  };
  const observations = artifacts.assembly.candidates[0]!.pieces.flatMap((piece) => piece.binding!.targetViewports.map((viewport) => ({
    slotId: piece.slotId, axis: piece.binding!.axis, targetSelector: piece.targetSelector, viewport, falsifier: piece.binding!.falsifier,
    evidenceKind: piece.binding!.axis === 'structure' ? 'dom-structure' as const : 'spacing-measure' as const,
    evidencePath: `evidence/${piece.slotId}-${viewport.width}.json`, evidenceSha256: HASH, observedFeature: `Observed ${piece.binding!.axis}.`, featureObserved: true, falsifierObserved: false, verdict: 'pass' as const,
  })));
  const proof = { schema: 'reference-influence-proof-v1', assemblySha256: sha256(canonicalJson(artifacts.assembly)), selectionSha256: referenceSelectionV2Sha256(selection), buildSha256: HASH, candidateId: candidate.id, observations, verdict: 'pass' };
  assert.equal(validateReferenceInfluenceProof(proof, artifacts.assembly, selection).verdict, 'pass');

  const missing = structuredClone(proof) as any; missing.observations[0]!.featureObserved = false; missing.observations[0]!.verdict = 'fail'; missing.verdict = 'fail';
  assert.equal(validateReferenceInfluenceProof(missing, artifacts.assembly, selection).verdict, 'fail');
  const laundered = structuredClone(proof) as any; laundered.observations[0]!.axis = 'density'; laundered.observations[0]!.evidenceKind = 'density-measure';
  assert.throws(() => validateReferenceInfluenceProof(laundered, artifacts.assembly, selection), /launders structure through density/);
  const aggregateFalsePass = structuredClone(missing) as any; aggregateFalsePass.verdict = 'pass';
  assert.throws(() => parseReferenceInfluenceProof(aggregateFalsePass), /proof verdict must be fail/);

  mkdirSync(join(root, 'evidence'), { recursive: true });
  const current = structuredClone(proof) as any;
  for (const observation of current.observations) {
    const bytes = Buffer.from(`evidence for ${observation.slotId} at ${observation.viewport.width}`);
    writeFileSync(join(root, observation.evidencePath), bytes);
    observation.evidenceSha256 = sha256(bytes);
  }
  assert.equal(validateReferenceInfluenceProofCurrentness(root, current, artifacts.assembly, selection).verdict, 'pass');
  writeFileSync(join(root, current.observations[0].evidencePath), 'changed');
  assert.throws(() => validateReferenceInfluenceProofCurrentness(root, current, artifacts.assembly, selection), /evidenceSha256 is stale/);
});

test('selected visual packet neutralizes one lawful influence reproducibly and cannot ship', (context) => {
  const { root, input } = fixture(context); const board = authorReferenceBoard(root, input);
  const path = join(root, '.omd', 'reference-board.json'); writeFileSync(path, canonicalJson(board));
  const artifacts = readReferenceBoardArtifacts(root, path); const candidate = artifacts.projection.candidates[0]!;
  const selection: ReferenceSelectionV2 = {
    schemaVersion: 'reference-selection-v2', captureSha256: sha256(artifacts.boardBytes), assemblySha256: sha256(artifacts.assemblyBytes), projectionSha256: sha256(artifacts.projectionBytes), candidateId: candidate.id,
    slots: candidate.pieces.map((piece) => ({ slotId: piece.slotId, rights: piece.rights, signal: piece.signal, staticAxis: piece.staticAxis, motionAxis: piece.motionAxis, obligationDisposition: 'used', obligationReason: 'Selected for the named promise.' })),
  };
  const first = buildReferenceVisualPacket(root, selection, ['event-detail-structure']);
  const second = buildReferenceVisualPacket(root, selection, ['event-detail-structure']);
  assert.deepEqual(first.packet, second.packet);
  assert.deepEqual([...first.assets], [...second.assets]);
  const publicBytes = canonicalJson(first.packet) + [...first.assets.values()].join('\n');
  for (const leaked of ['events.example.kr', 'calendar.example.kr', 'ref-', 'sourceCaptureSha256', '<text', '<image']) assert.doesNotMatch(publicBytes, new RegExp(leaked));
  assert.equal(first.packet.noShip, true); assert.equal(first.packet.sourceFree, true);
  assert.deepEqual(first.packet.entries[0]?.sanitizer.dropped, ['color', 'copy', 'identity', 'imagery', 'typeface']);
  assert.ok(first.packet.entries[0]?.sanitizer.preserved.includes('relative-position'));
  // The measured 240×120 group scales uniformly by 920/240. Its deliberately
  // offset children must not be rearranged into a guessed horizontal flex row.
  const geometry = [...first.assets.values()][0]!;
  assert.match(geometry, /<rect x="22" y="22" width="916" height="456"/);
  assert.match(geometry, /<rect x="22" y="107" width="114\.24" height="10"/);
  assert.match(geometry, /<rect x="344" y="287" width="403\.92" height="18"/);

  mkdirSync(join(root, '.omd', 'reference-visual-packets'), { recursive: true });
  for (const [assetPath, content] of first.assets) writeFileSync(join(root, assetPath), content);
  writeFileSync(join(root, '.omd', 'reference-visual-packet.json'), canonicalJson(first.packet));
  writeFileSync(join(root, '.omd', 'reference-visual-packet-evidence.json'), canonicalJson(first.evidence));
  assert.equal(validateReferenceVisualPacketCurrentness(root, selection).packet.entries.length, 1);

  mkdirSync(join(root, 'src'), { recursive: true }); writeFileSync(join(root, 'src', 'app.html'), '<main>own production</main>');
  assert.doesNotThrow(() => assertReferenceVisualPacketNotShipped(root, first, ['src/app.html']));
  const asset = [...first.assets.values()][0]!; writeFileSync(join(root, 'src', 'copied.svg'), asset);
  assert.throws(() => assertReferenceVisualPacketNotShipped(root, first, ['src/copied.svg']), /reuses no-ship packet/);

  const rejected = structuredClone(selection); (rejected.slots as any)[0].obligationDisposition = 'rejected';
  assert.throws(() => buildReferenceVisualPacket(root, rejected, ['event-detail-structure']), /not a used lawful selection/);
  const assetPath = [...first.assets.keys()][0]!; writeFileSync(join(root, assetPath), '<svg/>');
  assert.throws(() => validateReferenceVisualPacketCurrentness(root, selection), /packet asset .* is stale/);

  // Rebind a genuine legacy capture, so rejection is for missing geometry and
  // not merely a stale board/selection hash.
  const legacy = loadRefs(root).find(reference => reference.component === 'fact-stack')!;
  delete legacy.blueprint!.nodes[2]!.position;
  saveRef(root, legacy, createTestProjectWriteAdapter(root));
  writeFileSync(path, canonicalJson(authorReferenceBoard(root, input)));
  const current = readReferenceBoardArtifacts(root, path);
  const legacySelection: ReferenceSelectionV2 = {
    ...selection, captureSha256: sha256(current.boardBytes),
    assemblySha256: sha256(current.assemblyBytes), projectionSha256: sha256(current.projectionBytes),
  };
  assert.throws(() => buildReferenceVisualPacket(root, legacySelection, ['event-detail-structure']), /measured relative positions are missing; recapture/);
});
