import assert from 'node:assert/strict';
import { deflateSync, crc32 } from 'node:zlib';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test, { type TestContext } from 'node:test';
import { persistImageFragment } from '../core/ref/image-fragment.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { motionResolutionProjectionSha256, persistSettledReferenceSelection, readPreReferenceSelectionV2, readReferenceSelectionV2, referenceSelectionV2Sha256, resolveMotionProjection, selectReferenceCandidateV2, type ReferenceSelectionV2 } from '../core/ref/reference-selection.ts';
import { createReferenceHandoffReceipt, writeReferenceHandoffReceipt } from '../core/ref/reference-handoff.ts';
import { parseReferenceUsageV2, type ReferenceUsageInput, validateReferenceUsage } from '../core/ref/reference-usage.ts';
import { formatReferenceReport, referenceReportPath, referenceReportSnapshot } from '../core/ref/reference-report.ts';
import { canonicalJson, readReferenceBoardArtifacts, sha256 } from '../core/ref/board-artifacts.ts';
import { prepareReferenceUsage, readValidatedReferenceUsage } from '../core/ref/reference-usage-snapshot.ts';
import { writeReferenceUsageRecord } from '../core/ref/reference-usage-files.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { ART_DIRECTION_POINTER_SCHEMA_VERSION, ART_DIRECTION_RECORD_SCHEMA_VERSION, artDirectionSha256 } from '../core/art-direction/schema.ts';

const chunk = (type: string, bytes: Buffer): Buffer => {
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const body = Buffer.concat([Buffer.from(type), bytes]); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, checksum]);
};
const png = (red: number): Buffer => {
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, red, 52, 86]))), chunk('IEND', Buffer.alloc(0))]);
};
const invariants: Invariants = { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] };
const blueprint = (selector: string): Blueprint => ({ selector, capturedAt: '2026-07-18T00:00:00.000Z', nodes: [{ id: 'node', role: 'container', children: [], box: { w: 160, h: 40 } }] });
type Fixture = { readonly root: string; readonly invocation: ReturnType<typeof createTestProjectRunInvocation>; readonly writer: ReturnType<typeof createTestProjectWriteAdapter>; readonly selection: ReferenceSelectionV2 };

const hash = (value: string): string => sha256(Buffer.from(value));

const persistDecisionSettlement = (
  root: string,
  selection: ReferenceSelectionV2,
  invocation: ReturnType<typeof createTestProjectRunInvocation>,
  writer: ReturnType<typeof createTestProjectWriteAdapter>,
): ReferenceSelectionV2 => {
  const handoff = writeReferenceHandoffReceipt(root, 'art-direction', invocation).receipt;
  const alternative = (register: 'quiet' | 'confident' | 'showpiece') => ({
    register, subjectIdentityFit: `${register} fits the local shop`, staticReferenceSlotIds: ['hero-card'],
    motionReferenceSlotIds: [], conceptRole: `${register} local commerce direction`,
    macroCompositionHypothesis: 'Asymmetrical local hierarchy', motionHypothesis: 'none' as const,
    uxAccessibilityPerformanceRisks: ['Reduced motion remains available'],
    lawfulImplementationPath: 'Local CSS and SVG implementation',
    rejectionCondition: 'A stronger lawful alternative is selected.',
  });
  const alternatives = [alternative('quiet'), alternative('confident'), alternative('showpiece')];
  const motion = resolveMotionProjection({
    activationSha256: artDirectionSha256(invocation.activation), alternativesSha256: hash(canonicalJson(alternatives)),
    handoffSha256: handoff.payloadSha256, evaluatorInvocationSha256: hash('invocation'),
    evaluatorPayloadSha256: hash('payload'), evaluatorResultSha256: hash('result'),
    motionDecision: 'none', slots: [{ slotId: 'footer-links', obligationDisposition: 'rejected', obligationReason: 'Motion evidence was reviewed and rejected for the static implementation.' }], selection,
  });
  const motionSha256 = motionResolutionProjectionSha256(motion);
  writer.write(`.omd/motion-resolutions/sha256-${motionSha256}.json`, canonicalJson(motion));
  const settledSelection = persistSettledReferenceSelection(root, selection, motionSha256, invocation);
  const decision = {
    schemaVersion: 'art-direction-v1' as const, activationSha256: motion.activationSha256,
    intentSha256: hash('intent'), boardSha256: selection.captureSha256,
    preSelectionSha256: referenceSelectionV2Sha256(selection), alternativesSha256: motion.alternativesSha256,
    motionResolutionProjectionSha256: motionSha256, settledSelectionSha256: referenceSelectionV2Sha256(settledSelection),
    authorInvocationSha256: motion.evaluatorInvocationSha256, authorPayloadSha256: motion.evaluatorPayloadSha256,
    authorResultSha256: motion.evaluatorResultSha256, currentUserBeatExceptionReceiptSha256: hash('no-exception'),
    route: '/shop', source: 'agent-evidence' as const, selectedRegister: 'quiet' as const, motionDecision: 'none' as const,
    selectedStaticReferenceSlotIds: ['hero-card'], selectedMotionReferenceSlotIds: [], consideredAlternatives: alternatives,
    conceptRole: 'Quiet local commerce hierarchy', rejectedAlternatives: [
      { register: 'confident' as const, citedReferenceSlotIds: ['hero-card'], reason: 'Quiet best supports the local hierarchy.' },
      { register: 'showpiece' as const, citedReferenceSlotIds: ['hero-card'], reason: 'Showpiece overstates the local hierarchy.' },
    ],
    implementationLane: 'browser', fallbackPath: 'CSS and SVG static fallback',
    performanceAccessibilityBudget: 'Within the declared budget',
  };
  const record = {
    schemaVersion: ART_DIRECTION_RECORD_SCHEMA_VERSION, decision, decisionSha256: artDirectionSha256(decision),
    referenceHandoffSha256: handoff.payloadSha256, intentLedgerSha256: decision.intentSha256,
    activationSha256: decision.activationSha256, beatIds: ['B-1'],
  };
  const artDirectionSha256Value = artDirectionSha256(record);
  const recordPath = `art-direction-runs/sha256-${artDirectionSha256Value}.json`;
  writer.write(`.omd/${recordPath}`, canonicalJson(record));
  writer.write('.omd/art-direction.json', canonicalJson({
    schemaVersion: ART_DIRECTION_POINTER_SCHEMA_VERSION, record: recordPath, sha256: artDirectionSha256Value,
  }));
  writeReferenceHandoffReceipt(root, 'composer', invocation);
  return settledSelection;
};

const fixture = (context: TestContext): Fixture => {
  const root = mkdtempSync(join(tmpdir(), 'omd-reference-usage-')); mkdirSync(join(root, '.omd', 'refs'), { recursive: true }); mkdirSync(join(root, 'src'), { recursive: true });
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root); const invocation = createTestProjectRunInvocation(root);
  const addComponent = (source: string, component: string, selector: string, red: number): string => {
    const imagePath = refImagePath(root, { source, component });
    const reference: Reference = { source, component, kind: 'component', capturedAt: '2026-07-18T00:00:00.000Z', selector, invariants, principles: ['Keep the hierarchy independent.'], blueprint: blueprint(selector), imagePath: relative(root, imagePath) };
    saveRef(root, reference, writer); writeFileSync(imagePath, png(red)); return refIdentity(source, component);
  };
  const hero = addComponent('https://ui.example/catalog', 'product card', '[data-card]', 12);
  const footer = addComponent('https://ui.example/catalog', 'footer links', '[data-footer]', 34);
  const fragment = persistImageFragment(root, { inputPath: relative(root, refImagePath(root, { source: 'https://ui.example/catalog', component: 'product card' })), provenance: { sourcePage: 'https://pinterest.example/pin/handmade-tiles', captureRegion: 'warm tile mosaic, top-right image fragment', licenseStatus: 'unknown', rightsNotes: 'Verify rights before publication.', capturedAt: '2026-07-18T00:00:00.000Z' }, transfer: { visualRole: 'atmosphere', principles: ['Use only colour density, never the source composition.'] } }, invocation);
  writeFileSync(join(root, '.omd', 'reference-board.json'), JSON.stringify({ schemaVersion: 'reference-board-v1', frameSha256: 'a'.repeat(64), candidates: [{ id: 'selected', label: 'Selected clean-room assembly', route: '/shop', rationale: 'Use measured structure with independent implementation.', pieces: [{ slotId: 'hero-card', sourceKind: 'component-capture', referenceId: hero, targetComponent: 'ShopHero', targetSelector: '[data-omd="shop-hero"]', taskIds: ['T1'], reason: 'Carry only hierarchy.', take: ['structure'], avoid: 'Do not reproduce source copy.', adaptation: 'Use local spacing.', evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' }, grid: { column: 1, span: 6, order: 0 } }, { slotId: 'mosaic-fragment', sourceKind: 'image-fragment', referenceId: fragment.id, targetComponent: 'ShopHero', targetSelector: '[data-omd="shop-hero"]', taskIds: ['T1'], reason: 'Study colour density.', take: ['density'], avoid: 'Do not use source pixels.', adaptation: 'Use local gradient.', evidenceAxes: { rights: 'unknown', signal: 'supporting-content', staticAxis: 'available', motionAxis: 'absent' }, grid: { column: 7, span: 6, order: 1 } }, { slotId: 'footer-links', sourceKind: 'component-capture', referenceId: footer, targetComponent: 'ShopFooter', targetSelector: '[data-omd="shop-footer"]', taskIds: ['T2'], reason: 'Study motion restraint.', take: ['rhythm'], avoid: 'Do not copy labels.', adaptation: 'Use local content.', evidenceAxes: { rights: 'lawful', signal: 'high-motion', staticAxis: 'available', motionAxis: 'available' }, grid: { column: 1, span: 12, order: 2 } }] }] }) + '\n');
  const selection = selectReferenceCandidateV2(root, 'selected', [
    { slotId: 'hero-card', obligationDisposition: 'used', obligationReason: 'Lawful visual-system evidence informs the local hierarchy.' },
    { slotId: 'mosaic-fragment', obligationDisposition: 'rejected', obligationReason: 'Unknown-rights image content is not used in production.' },
    { slotId: 'footer-links', obligationDisposition: 'not-applicable', obligationReason: 'Available motion awaits evaluator resolution.' },
  ], invocation);
  const settledSelection = persistDecisionSettlement(root, selection, invocation, writer);
  writeFileSync(join(root, '.omd', 'attribution.md'), '| Group | Source |\n|---|---|\n| color | theory/local |\n'); writeFileSync(join(root, 'src', 'shop.ts'), 'export const shop = true;\n');
  return { root, invocation, writer, selection: settledSelection };
};
const usageRows = (value: Fixture) => {
  const statusFor = (slotId: string): 'used' | 'rejected' | 'anti-reference' => {
    const slot = value.selection.slots.find((candidate) => candidate.slotId === slotId);
    if (slot === undefined) throw new Error(`fixture must select ${slotId}`);
    return slot.obligationDisposition === 'used' ? 'used' : slot.signal === 'anti-reference' ? 'anti-reference' : 'rejected';
  };
  return [{ slotId: 'hero-card', status: statusFor('hero-card'), target: { route: '/shop', component: 'ShopHero', selector: '[data-omd="shop-hero"]' }, borrowedProperties: ['vertical hierarchy'], nonBorrowedProperties: ['source copy'], transformation: 'Rebuilt with local tokens.', evidence: { path: 'src/shop.ts', selector: '[data-omd="shop-hero"]' }, verificationNote: 'Rendered hero is independently implemented.' }, { slotId: 'mosaic-fragment', status: statusFor('mosaic-fragment'), target: { route: '/shop', component: 'ShopHero', selector: '[data-omd="shop-hero"]' }, borrowedProperties: [], nonBorrowedProperties: ['source pixels and composition'], transformation: 'Used a local generated gradient instead.', evidence: { path: 'src/shop.ts', selector: '[data-omd="shop-hero"]' }, verificationNote: 'No captured image bytes ship.' }, { slotId: 'footer-links', status: statusFor('footer-links'), target: { route: '/shop', component: 'ShopFooter', selector: '[data-omd="shop-footer"]' }, borrowedProperties: [], nonBorrowedProperties: ['dense source grouping'], transformation: 'Deliberately expanded local link spacing.', evidence: { path: 'src/shop.ts', selector: '[data-omd="shop-footer"]' }, verificationNote: 'The final footer rejects the observed grouping.' }];
};
const recordUsage = (value: Fixture, input: ReferenceUsageInput) => {
  const usage = prepareReferenceUsage(value.root, input);
  writeReferenceUsageRecord(value.root, 'reference-usage-v2.json', canonicalJson(usage), 'reference usage v2', value.writer);
  return usage;
};
const generateReport = (value: Fixture): string => {
  const markdown = formatReferenceReport(referenceReportSnapshot(validateReferenceUsage(value.root)));
  writeReferenceUsageRecord(value.root, 'reference-report.md', markdown, 'reference report', value.writer);
  return markdown;
};

test('usage ledger binds every selected component and image-fragment production outcome', (context) => {
  // Given: a selected three-piece assembly, composite lineage, attribution, and local shipped source evidence.
  const value = fixture(context);
  const rows = usageRows(value);

  // When: the complete actual-usage ledger is atomically recorded and checked.
  const recorded = recordUsage(value, { rows }); const checked = validateReferenceUsage(value.root);

  // Then: all statuses and the exact persisted bytes remain bound to the selected assembly.
  assert.deepEqual(checked.usage, recorded); assert.deepEqual(recorded.rows, rows); assert.match(readFileSync(join(value.root, '.omd', 'reference-usage-v2.json'), 'utf8'), /reference-usage-v2/);
  const preSelection = readPreReferenceSelectionV2(value.root);
  const settledSelection = readReferenceSelectionV2(value.root);
  assert.notEqual(referenceSelectionV2Sha256(preSelection), referenceSelectionV2Sha256(settledSelection));
  assert.equal(checked.usage.selectionSha256, referenceSelectionV2Sha256(settledSelection));
  assert.equal(checked.usage.settledSelectionSha256, referenceSelectionV2Sha256(settledSelection));
  const pointer = JSON.parse(readFileSync(join(value.root, '.omd', 'reference-pre-selection-v2.json'), 'utf8')) as { record: string; sha256: string };
  assert.equal(pointer.sha256, referenceSelectionV2Sha256(preSelection));
  assert.equal(readFileSync(join(value.root, '.omd', pointer.record), 'utf8'), canonicalJson(preSelection));
});

test('pre-selection records are content-addressed while only the immutable pointer advances', (context) => {
  const value = fixture(context);
  const first = readPreReferenceSelectionV2(value.root);
  const dispositions = [
    { slotId: 'hero-card', obligationDisposition: 'used' as const, obligationReason: 'Lawful visual-system evidence informs the local hierarchy.' },
    { slotId: 'mosaic-fragment', obligationDisposition: 'rejected' as const, obligationReason: 'Unknown-rights image content is not used in production.' },
    { slotId: 'footer-links', obligationDisposition: 'not-applicable' as const, obligationReason: 'Available motion awaits evaluator resolution.' },
  ];
  const repeated = selectReferenceCandidateV2(value.root, 'selected', dispositions, value.invocation);
  const revised = selectReferenceCandidateV2(value.root, 'selected', [
    ...dispositions.slice(0, 2),
    { slotId: 'footer-links', obligationDisposition: 'not-applicable', obligationReason: 'Available motion remains pending evaluator settlement.' },
  ], value.invocation);
  const pointer = JSON.parse(readFileSync(join(value.root, '.omd', 'reference-pre-selection-v2.json'), 'utf8')) as { record: string; sha256: string };

  assert.equal(referenceSelectionV2Sha256(repeated), referenceSelectionV2Sha256(first));
  assert.notEqual(referenceSelectionV2Sha256(revised), referenceSelectionV2Sha256(first));
  assert.ok(existsSync(join(value.root, '.omd', 'pre-reference-selections', `sha256-${referenceSelectionV2Sha256(first)}.json`)));
  assert.ok(existsSync(join(value.root, '.omd', 'pre-reference-selections', `sha256-${referenceSelectionV2Sha256(revised)}.json`)));
  assert.equal(pointer.sha256, referenceSelectionV2Sha256(revised));
  assert.deepEqual(readPreReferenceSelectionV2(value.root), revised);
});
test('settlement rejects an unpersisted motion-resolution digest', (context) => {
  const value = fixture(context);
  assert.throws(() => persistSettledReferenceSelection(value.root, readPreReferenceSelectionV2(value.root), '0'.repeat(64), value.invocation));
});

test('composer handoff derives settlement only from the exact persisted graph', (context) => {
  const value = fixture(context);
  const receipt = createReferenceHandoffReceipt(value.root, 'composer');
  assert.equal(receipt.settledSelectionSha256, referenceSelectionV2Sha256(value.selection));

  const pointer = JSON.parse(readFileSync(join(value.root, '.omd', 'art-direction.json'), 'utf8')) as { record: string };
  const record = JSON.parse(readFileSync(join(value.root, '.omd', pointer.record), 'utf8')) as { decision: { motionResolutionProjectionSha256: string } };
  const motionPath = join(value.root, '.omd', 'motion-resolutions', `sha256-${record.decision.motionResolutionProjectionSha256}.json`);
  writeFileSync(motionPath, `${readFileSync(motionPath, 'utf8')}\n`);

  assert.throws(() => createReferenceHandoffReceipt(value.root, 'composer'), /persisted motion resolution/);
});
test('usage ledger rejects incomplete, ambiguous, injected, and non-selected rows', (context) => {
  // Given: exact selected pieces plus malformed attempts that vary one trust-boundary field.
  const value = fixture(context); const rows = usageRows(value); const first = rows[0];
  if (first === undefined) throw new Error('fixture must include a first usage row');

  // When / Then: the parser and selected-candidate validator fail closed before persistence.
  assert.throws(() => recordUsage(value, { rows: rows.slice(0, 2) }));
  assert.throws(() => recordUsage(value, { rows: [...rows, first] }));
  assert.throws(() => recordUsage(value, { rows: [{ ...first, slotId: 'unknown-slot' }, ...rows.slice(1)] }));
  assert.throws(() => recordUsage(value, { rows: [{ ...first, nonBorrowedProperties: [] }, ...rows.slice(1)] }));
  assert.throws(() => recordUsage(value, { rows: [{ ...first, status: 'rejected', borrowedProperties: ['unexpected'] }, ...rows.slice(1)] }));
  assert.throws(() => recordUsage(value, { rows: [{ ...first, transformation: '<b>injected</b>' }, ...rows.slice(1)] }));
  assert.throws(() => recordUsage(value, { rows: [{ ...first, verificationNote: 'line\nbreak' }, ...rows.slice(1)] }));
  assert.throws(() => recordUsage(value, { rows: [{ ...first, verificationNote: 'tab\tC1\u0085bidi\u202e' }, ...rows.slice(1)] }));
  assert.throws(() => recordUsage(value, { rows: [{ ...first, verificationNote: 'ALM\u061cLRM\u200eRLM\u200f' }, ...rows.slice(1)] }));
  assert.throws(() => recordUsage(value, { rows: [{ ...first, borrowedProperties: ['[x](https://source.example)'] }, ...rows.slice(1)] }));
  assert.throws(() => recordUsage(value, { rows: [{ ...first, evidence: { ...first.evidence, path: '../outside.ts' } }, ...rows.slice(1)] }));
  const persisted = recordUsage(value, { rows });
  assert.throws(() => parseReferenceUsageV2({ ...persisted, unrecognized: 'field' }));
});

test('usage ledger rejects stale upstream records and missing or symlinked production evidence', (context) => {
  // Given: separately recorded ledgers whose upstream attribution or production evidence changes.
  const stale = fixture(context); recordUsage(stale, { rows: usageRows(stale) }); writeFileSync(join(stale.root, '.omd', 'attribution.md'), 'changed\n');
  const staleHash = fixture(context); recordUsage(staleHash, { rows: usageRows(staleHash) }); const stalePath = join(staleHash.root, '.omd', 'reference-usage-v2.json'); writeFileSync(stalePath, readFileSync(stalePath, 'utf8').replace(/"captureSha256":"[0-9a-f]{64}"/, `"captureSha256":"${'0'.repeat(64)}"`));
  const replacedBoard = fixture(context); recordUsage(replacedBoard, { rows: usageRows(replacedBoard) }); const boardPath = join(replacedBoard.root, '.omd', 'reference-board.json'); writeFileSync(boardPath, readFileSync(boardPath, 'utf8').replace('Selected clean-room assembly', 'Replacement assembly'));
  const missing = fixture(context); recordUsage(missing, { rows: usageRows(missing) }); rmSync(join(missing.root, 'src', 'shop.ts'));
  const linked = fixture(context); symlinkSync(join(linked.root, 'src', 'shop.ts'), join(linked.root, 'src', 'linked.ts'));
  const linkedRows = usageRows(linked).map((row) => ({ ...row, evidence: { ...row.evidence, path: 'src/linked.ts' } }));
  const swapped = fixture(context); recordUsage(swapped, { rows: usageRows(swapped) }); const pointerPath = join(swapped.root, '.omd', 'reference-pre-selection-v2.json'); const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { schemaVersion: string; record: string; sha256: string }; writeFileSync(pointerPath, canonicalJson({ ...pointer, record: `pre-reference-selections/sha256-${referenceSelectionV2Sha256(readReferenceSelectionV2(swapped.root))}.json` }));
  const missingRecord = fixture(context); recordUsage(missingRecord, { rows: usageRows(missingRecord) }); const missingPointer = JSON.parse(readFileSync(join(missingRecord.root, '.omd', 'reference-pre-selection-v2.json'), 'utf8')) as { record: string }; rmSync(join(missingRecord.root, '.omd', missingPointer.record));
  const linkedPointer = fixture(context); recordUsage(linkedPointer, { rows: usageRows(linkedPointer) }); const linkedPointerPath = join(linkedPointer.root, '.omd', 'reference-pre-selection-v2.json'); rmSync(linkedPointerPath); symlinkSync(join(linkedPointer.root, '.omd', 'reference-selection-v2.json'), linkedPointerPath);

  // When / Then: changed bindings, absence, and symlink indirection cannot validate or record usage.
  assert.throws(() => validateReferenceUsage(stale.root)); assert.throws(() => validateReferenceUsage(staleHash.root)); assert.throws(() => validateReferenceUsage(replacedBoard.root)); assert.throws(() => validateReferenceUsage(missing.root)); assert.throws(() => recordUsage(linked, { rows: linkedRows })); assert.throws(() => validateReferenceUsage(swapped.root)); assert.throws(() => validateReferenceUsage(missingRecord.root)); assert.throws(() => validateReferenceUsage(linkedPointer.root));
});

test('usage validation rejects every substituted settlement carrier', (context) => {
  for (const carrier of ['art-direction-pointer', 'art-direction-record', 'art-direction-handoff', 'motion-resolution', 'settled-selection', 'composer-handoff'] as const) {
    const value = fixture(context);
    recordUsage(value, { rows: usageRows(value) });
    const pointerPath = join(value.root, '.omd', 'art-direction.json');
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { record: string };
    const recordPath = join(value.root, '.omd', pointer.record);
    const record = JSON.parse(readFileSync(recordPath, 'utf8')) as { decision: { motionResolutionProjectionSha256: string; settledSelectionSha256: string }; beatIds: string[] };
    const paths = {
      'art-direction-pointer': pointerPath,
      'art-direction-record': recordPath,
      'art-direction-handoff': join(value.root, '.omd', 'reference-handoffs', 'art-direction.json'),
      'motion-resolution': join(value.root, '.omd', 'motion-resolutions', `sha256-${record.decision.motionResolutionProjectionSha256}.json`),
      'settled-selection': join(value.root, '.omd', 'settled-reference-selections', `sha256-${record.decision.settledSelectionSha256}.json`),
      'composer-handoff': join(value.root, '.omd', 'reference-handoffs', 'composer.json'),
    };
    if (carrier === 'art-direction-pointer') {
      const current = JSON.parse(readFileSync(paths[carrier], 'utf8')) as { sha256: string };
      writeFileSync(paths[carrier], canonicalJson({ ...current, sha256: '0'.repeat(64) }));
    } else if (carrier === 'art-direction-record') {
      writeFileSync(paths[carrier], canonicalJson({ ...record, beatIds: [...record.beatIds, 'B-replacement'] }));
    } else {
      writeFileSync(paths[carrier], `${readFileSync(paths[carrier], 'utf8')}\n`);
    }
    assert.throws(() => validateReferenceUsage(value.root), `${carrier} replacement must invalidate usage`);
  }
});

test('report generation never leaks raw artifact paths and preserves a prior report on failure', (context) => {
  // Given: a complete usage record with a component and Pinterest-like fragment provenance.
  const value = fixture(context); recordUsage(value, { rows: usageRows(value) }); const report = generateReport(value); const path = referenceReportPath(value.root); const repeat = generateReport(value);

  // When: production evidence disappears after the prior report was atomically published.
  const before = readFileSync(path); rmSync(join(value.root, 'src', 'shop.ts'));

  // Then: the chat report excludes raw artifact carriers and a failed refresh preserves prior bytes.
  assert.equal(repeat, report); assert.deepEqual(readFileSync(path), Buffer.from(report)); assert.match(report, /pinterest\.example\/pin\/handmade-tiles/); assert.match(report, /warm tile mosaic, top-right image fragment/); assert.match(report, /Carry only hierarchy/); assert.doesNotMatch(report, /\.\./); assert.doesNotMatch(report, /imagePath|imageSha256|\.\.\//); assert.throws(() => generateReport(value)); assert.deepEqual(readFileSync(path), before);
});
