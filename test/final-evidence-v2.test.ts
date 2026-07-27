import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import test from 'node:test';
import { checkFinalEvidenceV2 as guardedCheckFinalEvidenceV2, garbageCollectFinalEvidenceV2 as guardedGarbageCollectFinalEvidenceV2, publishFinalEvidenceV2 as guardedPublishFinalEvidenceV2, recoverFinalEvidenceV2Lock as guardedRecoverFinalEvidenceV2Lock, validateFinalEvidenceV2Manifest, FINAL_EVIDENCE_V2_GC_TTL_MS, type FinalEvidenceV2Manifest } from '../core/evidence/final-v2.ts';
import { publishTaskEvidence } from '../core/evidence/task.ts';
import { validateFinalEvidenceV2GraphFiles } from '../core/evidence/final-v2-graph.ts';
import { parseReferenceHandoffReceipt, referenceHandoffPayloadSha256, writeReferenceHandoffReceipt, type ReferenceHandoffReceipt } from '../core/ref/reference-handoff.ts';
import { materializeSettledReferenceSelection, motionResolutionProjectionSha256, referenceSelectionV2Sha256, resolveMotionProjection, selectReferenceCandidateV2, type MotionResolutionProjection, type ReferenceSelectionV2 } from '../core/ref/reference-selection.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import { createSourceSeal } from '../core/source-seal/index.ts';
import { artDirectionSha256 } from '../core/art-direction/schema.ts';
import { NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256 } from '../core/art-direction/decision.ts';
import { COPY_DECK_RECEIPT_SCHEMA_VERSION, copyDeckSha256, validateCanonicalCopyDeckReceipt } from '../core/copy/index.ts';
import { INTENT_CURRENT_POINTER_SCHEMA_VERSION, appendExplicitIntent, intentLedgerSha256, resolveCurrentUserBeatExceptionReceipt, type IntentLedger } from '../core/runtime/intent.ts';
import { captureMotionEvidenceV2, validateMotionEvidenceV2 } from '../core/render/index.ts';
import { authorizeTestProjectRunPayloads, createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { writeProjectFile } from '../core/runtime/project-write.ts';
import { observationV2Sha256, readCurrentObservationV2, writeObservationV2 } from '../core/runtime/observation.ts';
import { retainObservationV2 } from '../core/runtime/observation-retention.ts';
import { attestLegacyV1AsV2 } from '../core/migration/attest-v2.ts';

const finalEvidenceInvocation = (directory: string) => createTestProjectRunInvocation(directory, 'brief');
const finalEvidenceGraphFilesystem = { readFile: readFileSync, lstat: lstatSync, open: openSync, fstat: fstatSync, close: closeSync };
function finalEvidenceGraphAuthorizations(directory: string, manifest: FinalEvidenceV2Manifest): { purpose: 'current-intent-ledger' | 'final-reviewer-lane' | 'static-evidence-result' | 'static-review-receipt'; payload: Buffer }[] {
  const authorizations: { purpose: 'current-intent-ledger' | 'final-reviewer-lane' | 'static-evidence-result' | 'static-review-receipt'; payload: Buffer }[] = [
    { purpose: 'current-intent-ledger', payload: readFileSync(resolve(directory, manifest.graph.intent.path)) },
    ...(['blindLane', 'fidelityLane', 'protocolLane'] as const).map((lane) => ({ purpose: 'final-reviewer-lane' as const, payload: readFileSync(resolve(directory, manifest.graph[lane].path)) })),
  ];
  if (manifest.staticEvidence === undefined) return authorizations;
  const staticBytes = readFileSync(resolve(directory, manifest.staticEvidence.path));
  const staticEvidence = JSON.parse(staticBytes.toString('utf8')) as { reviewReceipts: Record<string, { path: string }> };
  return [
    ...authorizations,
    { purpose: 'static-evidence-result', payload: staticBytes },
    ...Object.values(staticEvidence.reviewReceipts).map(({ path }) => ({ purpose: 'static-review-receipt' as const, payload: readFileSync(resolve(directory, path)) })),
  ];
}
function publishFinalEvidenceV2(directory: string, input: unknown, seams: Parameters<typeof guardedPublishFinalEvidenceV2>[3] = {}): string {
  const invocation = finalEvidenceInvocation(directory);
  const submitted = validateFinalEvidenceV2Manifest(input);
  authorizeTestProjectRunPayloads(directory, invocation, finalEvidenceGraphAuthorizations(directory, submitted));
  const graphRootHash = validateFinalEvidenceV2GraphFiles(directory, submitted.graph, finalEvidenceGraphFilesystem, invocation).rootHash;
  authorizeTestProjectRunPayloads(directory, invocation, [{ purpose: 'final-evidence-manifest', payload: Buffer.from(`${canonical({ ...submitted, graphRootHash })}\n`) }]);
  return guardedPublishFinalEvidenceV2(directory, input, invocation, seams);
}
function authorizeFinalEvidenceCheck(directory: string, invocation: ReturnType<typeof finalEvidenceInvocation>): void {
  const pointer = readFileSync(join(directory, '.omd', 'final-evidence-v2.json'));
  const { record } = JSON.parse(pointer.toString('utf8')) as { record: string };
  const manifestBytes = readFileSync(join(directory, '.omd', 'final-evidence-v2-runs', record));
  const manifest = validateFinalEvidenceV2Manifest(JSON.parse(manifestBytes.toString('utf8')));
  authorizeTestProjectRunPayloads(directory, invocation, [
    { purpose: 'final-reviewer-lane', payload: pointer },
    { purpose: 'final-evidence-manifest', payload: manifestBytes },
    ...finalEvidenceGraphAuthorizations(directory, manifest),
  ]);
}
function checkFinalEvidenceV2(directory: string): FinalEvidenceV2Manifest {
  const invocation = finalEvidenceInvocation(directory);
  authorizeFinalEvidenceCheck(directory, invocation);
  return guardedCheckFinalEvidenceV2(directory, invocation);
}
function recoverFinalEvidenceV2Lock(directory: string, seams: Parameters<typeof guardedRecoverFinalEvidenceV2Lock>[2] = {}): boolean {
  const invocation = finalEvidenceInvocation(directory);
  if (existsSync(join(directory, '.omd', 'final-evidence-v2.json'))) authorizeFinalEvidenceCheck(directory, invocation);
  return guardedRecoverFinalEvidenceV2Lock(directory, invocation, seams);
}
function garbageCollectFinalEvidenceV2(directory: string, options: Parameters<typeof guardedGarbageCollectFinalEvidenceV2>[2] = {}): ReturnType<typeof guardedGarbageCollectFinalEvidenceV2> {
  const invocation = finalEvidenceInvocation(directory);
  if (existsSync(join(directory, '.omd', 'final-evidence-v2.json'))) authorizeFinalEvidenceCheck(directory, invocation);
  return guardedGarbageCollectFinalEvidenceV2(directory, invocation, options);
}

const sha = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const root = (): string => mkdtempSync(join(tmpdir(), 'omd-final-v2-'));
const clean = (path: string): void => rmSync(path, { recursive: true, force: true });
const crc32 = (bytes: Buffer): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
const png = (width: number, height: number): Buffer => {
  const chunk = (type: string, value: Buffer): Buffer => {
    const bytes = Buffer.alloc(value.length + 12);
    bytes.writeUInt32BE(value.length, 0); bytes.write(type, 4); value.copy(bytes, 8);
    bytes.writeUInt32BE(crc32(bytes.subarray(4, value.length + 8)), value.length + 8);
    return bytes;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
};
const canonical = (value: unknown): string => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
const receipt = <T extends string>(directory: string, name: string, schema: T, value: Record<string, unknown>): { path: string; schema: T; sha256: string } => {
  const path = join('.omd', 'receipts', `${name}.json`); const bytes = `${canonical(value)}\n`;
  mkdirSync(join(directory, '.omd', 'receipts'), { recursive: true }); writeFileSync(join(directory, path), bytes);
  return { path, schema, sha256: sha(bytes) };
};
const taskFrame = (surface: string, goal = 'save'): string => `---
uxTask: Save the edited document
uxFrequentAction: Save document changes
uxCostliestError: Lose an unsaved document edit
uxSurface: ${surface}
---

## Task coverage matrix

T1 | goal: ${goal} | start: editor | actions: edit | success: saved | recovery: retry | viewports: desktop, mobile | requirements: none
`;
const publishCurrentTaskEvidence = (directory: string, surface: 'product' | 'mixed'): { path: string; schema: 'task-evidence-v1'; sha256: string } => {
  const frame = taskFrame(surface);
  const composition = '## UX task coverage\n\nT1 | production: / | locator: #save |\n';
  writeFileSync(join(directory, '.omd', 'frame.md'), frame); writeFileSync(join(directory, '.omd', 'composition.md'), composition);
  const put = (name: string, value: unknown) => { const bytes = Buffer.from(JSON.stringify(value)); const path = `.omd/.cache/${name}`; mkdirSync(join(directory, '.omd', '.cache'), { recursive: true }); writeFileSync(join(directory, path), bytes); return { path, sha256: sha(bytes) }; };
  const probe = (role: 'primary' | 'recovery', viewport: 'desktop' | 'mobile') => {
    const value = { name: `${role} save ${viewport}`, destructive: false, steps: [{ action: 'click', selector: '#save', expect: [{ type: 'visible', selector: '#save' }] }, { action: 'click', selector: '#saved', expect: [{ type: 'text', selector: '#saved', value: 'Saved' }] }] };
    const plan = put(`task-${role}-${viewport}-plan.json`, value); const result = put(`task-${role}-${viewport}-result.json`, { name: value.name, target: 'http://localhost/', viewport: viewport === 'desktop' ? { width: 1280, height: 900 } : { width: 390, height: 844 }, steps: value.steps.map(step => ({ action: step.action, selector: step.selector, ok: true, expectations: step.expect.map(expectation => ({ ...expectation, ok: true })) })), warnings: [] });
    return { planPath: plan.path, planSha256: plan.sha256, resultPath: result.path, resultSha256: result.sha256, role, viewport };
  };
  const desktop = png(1280, 900); const mobile = png(390, 844);
  mkdirSync(join(directory, '.omd', '.cache'), { recursive: true });
  writeFileSync(join(directory, '.omd', '.cache', 'task-desktop.png'), desktop); writeFileSync(join(directory, '.omd', '.cache', 'task-mobile.png'), mobile);
  const evidence = { schemaVersion: 1, surface, frame: { path: '.omd/frame.md', sha256: sha(frame) }, composition: { path: '.omd/composition.md', sha256: sha(composition) }, tasks: [{ id: 'T1', context: 'production', production: { route: '/', locator: '#save', workObject: 'document' }, probes: [probe('primary', 'desktop'), probe('primary', 'mobile'), probe('recovery', 'desktop'), probe('recovery', 'mobile')], renders: [{ path: '.omd/.cache/task-desktop.png', sha256: sha(desktop), viewport: 'desktop' }, { path: '.omd/.cache/task-mobile.png', sha256: sha(mobile), viewport: 'mobile' }] }] };
  const input = join(directory, '.omd', '.cache', 'task-evidence-manifest.json'); writeFileSync(input, JSON.stringify(evidence));
  publishTaskEvidence(directory, input, finalEvidenceInvocation(directory));
  return { path: '.omd/task-evidence.json', schema: 'task-evidence-v1', sha256: sha(readFileSync(join(directory, '.omd', 'task-evidence.json'))) };
};
const refreshSourceSeal = (directory: string, input: FinalEvidenceV2Manifest): FinalEvidenceV2Manifest => {
  const value = createSourceSeal(directory, '2026-01-01T00:00:00.000Z'); const bytes = Buffer.from(`${canonical(value)}\n`);
  writeFileSync(join(directory, '.omd', 'source-seal.json'), bytes);
  return { ...input, graph: { ...input.graph, sourceSeal: { path: '.omd/source-seal.json', schema: 'source-seal-v1', sha256: sha(bytes) } } };
};
const attachCurrentTaskEvidence = (directory: string, input: FinalEvidenceV2Manifest, surface: 'product' | 'mixed'): FinalEvidenceV2Manifest =>
  refreshSourceSeal(directory, { ...input, graph: { ...input.graph, taskEvidence: publishCurrentTaskEvidence(directory, surface) } });
const copyDeckV2 = (
  selectedRegister: 'quiet' | 'confident' | 'showpiece',
  motionDecision: 'none' | 'one',
  currentUserBeatExceptionReceiptSha256 = NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256,
  beatIds: readonly string[] = ['B-1'],
): string => `# Copy

## Sources and fact ledger

| ID | Status | Source | Fact |
| --- | --- | --- | --- |
| F-001 | verified | user brief | The launch has one primary action. |

## Audience language

- Audience quote: “Show me the next step.”

## Voice contract

- Audience: People evaluating the launch.
- Language: en
- Register: direct

## Surface copy

### Launch
- Main message: Begin with the essential decision.
- Supporting fact: The launch has one primary action.
- Next action: Review the launch
- Claim refs: F-001

## Navigation and actions

- Review the launch → Opens the launch summary.

## States and recovery

- Interaction scope: static
- Primary copy: Review the launch.
- Recovery copy: N/A — static surface has no recovery state.
- Primary probe: N/A — static surface has no interaction.
- Recovery probe: N/A — static surface has no recovery interaction.

## Humanize audit

- Read aloud for direct, concise language.

## Art direction contract

- Schema: art-direction-v1
- Register: ${selectedRegister}
- motionDecision: ${motionDecision}
- Evidence IDs: F-001
- Current-user exception: ${currentUserBeatExceptionReceiptSha256 === NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256 ? 'N/A — no host-authorized Beat exception' : 'current-user: host-authorized Beat exception'}
- Current-user Beat-exception receipt SHA-256: ${currentUserBeatExceptionReceiptSha256}

| Beat ID | Evidence IDs |
| --- | --- |
${beatIds.map((beatId) => `| ${beatId} | F-001 |`).join('\n')}
`;
const manifest = (directory: string, decision: 'none' | 'one' = 'none', motionRegister: 'confident' | 'showpiece' = 'confident'): FinalEvidenceV2Manifest => {
  const invocation = finalEvidenceInvocation(directory);
  const current = invocation.current;
  const activation = receipt(directory, 'activation', 'activation-context-v2', { schemaVersion: 'activation-context-v2', buildSha256: current.buildSha256, loadedSkillSha256: current.loadedSkillSha256, briefSha256: current.briefSha256, hostCapability: { host: 'local' } });
  const intentValue: IntentLedger = { schemaVersion: 'intent-ledger-v1', events: [], currentEventId: null };
  const intentSha256 = intentLedgerSha256(intentValue);
  const intentRecord = `intent-runs/sha256-${intentSha256}.json`;
  mkdirSync(join(directory, '.omd', 'intent-runs'), { recursive: true });
  writeFileSync(join(directory, '.omd', intentRecord), `${JSON.stringify(intentValue)}\n`);
  writeFileSync(join(directory, '.omd', 'intent-current.json'), `${canonical({ schemaVersion: INTENT_CURRENT_POINTER_SCHEMA_VERSION, record: intentRecord, sha256: intentSha256 })}\n`);
  const intent = { path: join('.omd', intentRecord), schema: 'intent-ledger-v1', sha256: sha(readFileSync(join(directory, '.omd', intentRecord))) };
  const activationSha256 = artDirectionSha256(JSON.parse(readFileSync(join(directory, activation.path), 'utf8')));
  const referenceSource = 'https://capture.example/hero';
  const referenceComponent = 'hero';
  const referenceImage = refImagePath(directory, { source: referenceSource, component: referenceComponent });
  mkdirSync(join(directory, '.omd'), { recursive: true });
  saveRef(directory, {
    source: referenceSource, component: referenceComponent, kind: 'component', capturedAt: '2026-01-01T00:00:00.000Z',
    selector: '#hero', invariants: { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] },
    principles: ['Keep the hierarchy.'], blueprint: { selector: '#hero', capturedAt: '2026-01-01T00:00:00.000Z', nodes: [{ id: 'hero', role: 'container', children: [], box: { w: 160, h: 40 } }] }, imagePath: referenceImage.slice(directory.length + 1),
  }, createTestProjectWriteAdapter(directory));
  writeFileSync(referenceImage, png(1, 1));
  const boardValue = { schemaVersion: 'reference-board-v1', frameSha256: sha('frame'), candidates: [{ id: 'candidate', label: 'Candidate', route: '/', rationale: 'Lawful evidence', pieces: [{ slotId: 'static', sourceKind: 'component-capture', referenceId: refIdentity(referenceSource, referenceComponent), targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use structure', take: ['structure'], avoid: 'Avoid copying', adaptation: 'Adapt lawfully', evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' }, grid: { column: 1, span: 12, order: 0 } }, { slotId: 'motion-reference', sourceKind: 'component-capture', referenceId: refIdentity(referenceSource, referenceComponent), targetComponent: 'Hero', targetSelector: '#hero', taskIds: ['T1'], reason: 'Use observed motion.', take: ['motion'], avoid: 'Avoid copying', adaptation: 'Adapt lawfully', evidenceAxes: { rights: 'lawful', signal: 'high-motion', staticAxis: 'absent', motionAxis: 'available' }, grid: { column: 1, span: 12, order: 1 } }] }] };
  writeFileSync(join(directory, '.omd', 'reference-board.json'), `${canonical(boardValue)}\n`);
  const board = receipt(directory, 'board', 'reference-board-v1', boardValue);
  const selectionValue = selectReferenceCandidateV2(directory, 'candidate', [{ slotId: 'static', obligationDisposition: 'used', obligationReason: 'Selected static evidence.' }, { slotId: 'motion-reference', obligationDisposition: 'not-applicable', obligationReason: 'Motion awaits evaluator resolution.' }], invocation);
  const selection = receipt(directory, 'selection', 'reference-selection-v2', selectionValue);
  const preSelectionSha256 = referenceSelectionV2Sha256(selectionValue);
  const preHandoffValue = writeReferenceHandoffReceipt(directory, 'art-direction', invocation).receipt;
  writeFileSync(join(directory, 'evidence.html'), '<main id="hero">Evidence</main>');
  const attribution = 'Reference attribution.';
  writeFileSync(join(directory, '.omd', 'attribution.md'), attribution);
  let usage: { path: string; schema: 'reference-usage-v2'; sha256: string };
  const alternatives = [
    { register: 'quiet', subjectIdentityFit: 'Quiet editorial framing fits the subject.', staticReferenceSlotIds: ['static'], motionReferenceSlotIds: [], conceptRole: 'Editorial clarity', macroCompositionHypothesis: 'Template-breaking asymmetric editorial departure.', motionHypothesis: 'none', uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'], lawfulImplementationPath: 'CSS and SVG implementation.', rejectionCondition: 'Another evidenced direction better fits the launch.' },
    { register: 'confident', subjectIdentityFit: 'Confident framing fits the subject.', staticReferenceSlotIds: ['static'], motionReferenceSlotIds: decision === 'one' ? ['motion-reference'] : [], conceptRole: 'Launch transition', macroCompositionHypothesis: 'Layered promotional composition.', motionHypothesis: 'one', uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'], lawfulImplementationPath: 'CSS and SVG implementation.', rejectionCondition: 'Another evidenced direction better fits the launch.' },
    { register: 'showpiece', subjectIdentityFit: 'Showpiece framing fits the subject.', staticReferenceSlotIds: ['static'], motionReferenceSlotIds: decision === 'one' ? ['motion-reference'] : [], conceptRole: 'Signature reveal', macroCompositionHypothesis: 'Layered promotional composition.', motionHypothesis: 'one', uxAccessibilityPerformanceRisks: ['Reduced motion remains available.'], lawfulImplementationPath: 'CSS and SVG implementation.', rejectionCondition: 'Another evidenced direction better fits the launch.' },
  ] as const;
  const selected = decision === 'none' ? alternatives[0] : (motionRegister === 'showpiece' ? alternatives[2] : alternatives[1]);
  const authorInvocationSha256 = sha('author-invocation');
  const authorPayloadSha256 = sha('author-payload');
  const authorResultSha256 = sha('author-result');
  const alternativesSha256 = sha(canonical(alternatives));
  const motionResolution = resolveMotionProjection({
    activationSha256,
    alternativesSha256,
    handoffSha256: preHandoffValue.payloadSha256,
    evaluatorInvocationSha256: authorInvocationSha256,
    evaluatorPayloadSha256: authorPayloadSha256,
    evaluatorResultSha256: authorResultSha256,
    motionDecision: decision,
    slots: [{ slotId: 'motion-reference', obligationDisposition: decision === 'one' ? 'used' : 'rejected', obligationReason: decision === 'one' ? 'Evaluator selected observed motion evidence.' : 'Evaluator rejected observed motion evidence.' }],
    selection: selectionValue,
  });
  const motionResolutionSha256 = motionResolutionProjectionSha256(motionResolution);
  const settledSelection = materializeSettledReferenceSelection(selectionValue, { ...motionResolution, selection: selectionValue });
  const settledSelectionSha256 = referenceSelectionV2Sha256(settledSelection);
  mkdirSync(join(directory, '.omd', 'settled-reference-selections'), { recursive: true });
  writeFileSync(join(directory, '.omd', 'settled-reference-selections', `sha256-${settledSelectionSha256}.json`), `${canonical(settledSelection)}\n`);
  writeFileSync(join(directory, '.omd', 'reference-selection-v2.json'), `${canonical(settledSelection)}\n`);
  const settledSelectionReceipt = receipt(directory, 'settled-selection', 'reference-selection-v2', settledSelection);
  const selectionSha256 = settledSelectionSha256;
  const handoffValue = preHandoffValue;
  const handoff = { path: '.omd/reference-handoffs/art-direction.json', schema: 'reference-handoff-v2', sha256: sha(readFileSync(join(directory, '.omd', 'reference-handoffs', 'art-direction.json'))) };
  mkdirSync(join(directory, '.omd', 'motion-resolutions'), { recursive: true });
  writeFileSync(join(directory, '.omd', 'motion-resolutions', `sha256-${motionResolutionSha256}.json`), `${canonical(motionResolution)}\n`);
  const decisionValue = {
    schemaVersion: 'art-direction-v1' as const,
    activationSha256,
    intentSha256,
    boardSha256: selectionValue.captureSha256,
    preSelectionSha256,
    route: '/',
    source: 'explicit-user' as const,
    consideredAlternatives: alternatives,
    alternativesSha256,
    selectedRegister: selected.register,
    motionDecision: decision,
    conceptRole: selected.conceptRole,
    selectedStaticReferenceSlotIds: selected.staticReferenceSlotIds,
    selectedMotionReferenceSlotIds: selected.motionReferenceSlotIds,
    motionResolutionProjectionSha256: motionResolutionSha256,
    settledSelectionSha256,
    implementationLane: 'browser',
    fallbackPath: 'CSS/SVG static reduced-motion fallback.',
    performanceAccessibilityBudget: 'Within the declared accessibility and performance budget.',
    rejectedAlternatives: alternatives.filter((alternative) => alternative.register !== selected.register).map((alternative) => ({ register: alternative.register, reason: 'A different evidenced direction was explicitly selected.', citedReferenceSlotIds: alternative.staticReferenceSlotIds })),
    authorInvocationSha256,
    authorPayloadSha256,
    authorResultSha256,
    currentUserBeatExceptionReceiptSha256: NO_CURRENT_USER_BEAT_EXCEPTION_RECEIPT_SHA256,
  };
  const artDirectionValue = { schemaVersion: 'art-direction-record-v2', decision: decisionValue, decisionSha256: artDirectionSha256(decisionValue), referenceHandoffSha256: handoffValue.payloadSha256, intentLedgerSha256: intentSha256, activationSha256, beatIds: ['B-1'] };
  const artDirectionSemanticSha256 = artDirectionSha256(artDirectionValue);
  const artDirection = { path: `.omd/art-direction-runs/sha256-${artDirectionSemanticSha256}.json`, schema: 'art-direction-record-v2', sha256: sha(`${canonical(artDirectionValue)}\n`) };
  mkdirSync(join(directory, '.omd', 'art-direction-runs'), { recursive: true });
  writeFileSync(join(directory, artDirection.path), `${canonical(artDirectionValue)}\n`);
  writeFileSync(join(directory, '.omd', 'art-direction.json'), `${canonical({ schemaVersion: 'art-direction-current-v2', record: artDirection.path.slice('.omd/'.length), sha256: artDirectionSemanticSha256 })}\n`);
  const settlement = {
    motionResolutionProjectionSha256: motionResolutionSha256,
    settledSelectionSha256,
    settledSelection,
  };
  const composerHandoff = writeReferenceHandoffReceipt(directory, 'composer', invocation).receipt;
  writeReferenceHandoffReceipt(directory, 'hand', invocation);
  const usageValue = {
    schemaVersion: 'reference-usage-v2',
    captureSha256: selectionValue.captureSha256,
    assemblySha256: selectionValue.assemblySha256,
    projectionSha256: selectionValue.projectionSha256,
    selectionSha256,
    artDirectionSha256: artDirectionSemanticSha256,
    motionResolutionProjectionSha256: settlement.motionResolutionProjectionSha256,
    settledSelectionSha256: settlement.settledSelectionSha256,
    composerHandoffSha256: composerHandoff.payloadSha256,
    attributionSha256: sha(attribution),
    rows: [
      { slotId: 'static', status: 'used', target: { route: '/', component: 'Hero', selector: '#hero' }, borrowedProperties: ['structure'], nonBorrowedProperties: ['branding'], transformation: 'Adapted structure', evidence: { path: 'evidence.html', selector: '#hero' }, verificationNote: 'Verified' },
      { slotId: 'motion-reference', status: decision === 'one' ? 'used' : 'rejected', target: { route: '/', component: 'Hero', selector: '#hero' }, borrowedProperties: decision === 'one' ? ['motion'] : [], nonBorrowedProperties: ['branding'], transformation: 'Adapted motion timing', evidence: { path: 'evidence.html', selector: '#hero' }, verificationNote: 'Verified' },
    ],
  };
  writeFileSync(join(directory, '.omd', 'reference-usage-v2.json'), `${canonical(usageValue)}\n`);
  usage = { path: '.omd/reference-usage-v2.json', schema: 'reference-usage-v2', sha256: sha(readFileSync(join(directory, '.omd', 'reference-usage-v2.json'))) };
  const copyDeck = copyDeckV2(decisionValue.selectedRegister, decisionValue.motionDecision);
  writeFileSync(join(directory, '.omd', 'copy-deck.md'), copyDeck);
  const copyValue = {
    schemaVersion: COPY_DECK_RECEIPT_SCHEMA_VERSION,
    copyDeckSha256: copyDeckSha256(Buffer.from(copyDeck)),
    artDirectionSha256: artDirectionSemanticSha256,
    selectedRegister: decisionValue.selectedRegister,
    motionDecision: decisionValue.motionDecision,
    beatIds: ['B-1'],
    currentUserBeatExceptionReceiptSha256: decisionValue.currentUserBeatExceptionReceiptSha256,
  };
  validateCanonicalCopyDeckReceipt(copyValue, Buffer.from(copyDeck), {
    selectedRegister: decisionValue.selectedRegister,
    motionDecision: decisionValue.motionDecision,
    beatIds: artDirectionValue.beatIds,
    currentUserBeatExceptionReceiptSha256: decisionValue.currentUserBeatExceptionReceiptSha256,
  });
  const copy = receipt(directory, 'copy', COPY_DECK_RECEIPT_SCHEMA_VERSION, copyValue);
  const renderedBeats = receipt(directory, 'beats', 'rendered-beat-receipt-v1', { schema: 'rendered-beat-receipt-v1', artDirectionHash: artDirectionSemanticSha256, copyDeckSha256: copyValue.copyDeckSha256, beatIds: ['B-1'], renderedBeats: [{ id: 'B-1', boundary: true, distinctRegions: 0, ancestorBeatIds: [], rendered: true, observedViewport: { width: 1280, height: 900 } }, { id: 'B-1', boundary: true, distinctRegions: 0, ancestorBeatIds: [], rendered: true, observedViewport: { width: 390, height: 844 } }], captureViewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }] });
  const buildIdentity = receipt(directory, 'build', 'omd-build-identity-v1', { schemaVersion: 'omd-build-identity-v1', packageVersion: '1.0.0', buildSha256: current.buildSha256, sourceSkillSha256: current.loadedSkillSha256 });
  writeFileSync(join(directory, '.omd', 'type-proof.md'), 'type-proof');
  writeFileSync(join(directory, '.omd', 'composition.md'), 'composition');
  writeFileSync(join(directory, 'brief.js'), '{"argv":[],"brief":"brief"}');
  writeFileSync(join(directory, 'skill.js'), readFileSync(new URL('../bin/omd.ts', import.meta.url)));
  const first = receipt(directory, 'observation-1', 'observation-v2', { schema: 'observation-v2', buildSha256: current.buildSha256, currentArtifact: { path: buildIdentity.path, sha256: buildIdentity.sha256 }, predecessorSha256: null, observedAt: '2026-01-01T00:00:00.000Z', evidence: {} });
  const firstSha256 = sha(canonical(JSON.parse(readFileSync(join(directory, first.path), 'utf8'))));
  const second = receipt(directory, 'observation-2', 'observation-v2', { schema: 'observation-v2', buildSha256: current.buildSha256, currentArtifact: { path: buildIdentity.path, sha256: buildIdentity.sha256 }, predecessorSha256: firstSha256, observedAt: '2026-01-01T00:01:00.000Z', evidence: {} });
  const secondSha256 = sha(canonical(JSON.parse(readFileSync(join(directory, second.path), 'utf8'))));
  const lane = (name: 'blind' | 'fidelity' | 'protocol', schema: 'blind-review-v1' | 'fidelity-review-v1' | 'protocol-review-v1') => {
    const contract = {
      blind: { verdicts: { blindVisual: 'GREEN', blindNarrative: 'GREEN' }, criticalFloors: { composition: 3, copy: 3 } },
      fidelity: { verdicts: { referenceFidelity: 'GREEN', renderFidelity: 'GREEN' }, criticalFloors: { desktop: 3, mobile: 3 } },
      protocol: { verdicts: { evidenceIntegrity: 'GREEN', publicationProtocol: 'GREEN' }, criticalFloors: { authority: 3, currentness: 3 } },
    }[name];
    const sessionSha256 = sha(`${name}-isolation`);
    return receipt(directory, name, schema, {
      schema, artDirectionSha256: artDirectionSemanticSha256, buildSha256: current.buildSha256,
      isolationReceipt: { schema: 'reviewer-isolation-v1', sha256: sessionSha256 },
      ...contract, quorum: { required: 2, passed: 2 },
      provenance: { observationSha256s: [firstSha256, secondSha256], reviewerIds: [`${name}-reviewer-a`, `${name}-reviewer-b`], reviewerSessionSha256: sessionSha256 },
    });
  };
  const observed = (name: string, width: number, height: number) => {
    const path = `${name}.png`; const bytes = png(width, height); writeFileSync(join(directory, path), bytes);
    return { path, sha256: sha(bytes) };
  };
  const staticSlot = observed('static-slot', 1280, 900);
  const desktopRender = observed('desktop-render', 1280, 900);
  const mobileRender = observed('mobile-render', 390, 844);
  const desktopSamples = [observed('desktop-sample-1', 1280, 900), observed('desktop-sample-2', 1280, 900), observed('desktop-sample-3', 1280, 900)] as const;
  const mobileSamples = [observed('mobile-sample-1', 390, 844), observed('mobile-sample-2', 390, 844), observed('mobile-sample-3', 390, 844)] as const;
  const macro = observed('macro', 1280, 900);
  const fidelity = observed('fidelity', 1280, 900);
  const fallback = observed('fallback', 1280, 900);
  const blindSignature = observed('blind-signature', 1280, 900);
  const blindNarrative = observed('blind-narrative', 1280, 900);
  const blindMotionFit = observed('blind-motion-fit', 1280, 900);
  const observedSha256 = sha(JSON.stringify([desktopRender, mobileRender, ...desktopSamples, ...mobileSamples].map((observation) => observation.sha256)));
  const review = (role: 'signature' | 'narrative' | 'motionFit' | 'fidelity' | 'fallback' | 'blind', actor: 'host-reviewer' | 'host-evaluator') => {
    const path = `${role}-${actor}.json`;
    const value = { schema: 'static-review-receipt-v1', role, actor, verdict: 'pass', artDirectionHash: artDirectionSemanticSha256, buildHash: current.buildSha256, selectionSha256, handoffSha256: handoffValue.payloadSha256, observedSha256 };
    writeFileSync(join(directory, path), `${canonical(value)}\n`);
    return { path, sha256: sha(readFileSync(join(directory, path))) };
  };
  const staticEvidence = receipt(directory, 'static', 'static-direction-evidence-v1', {
    schema: 'static-direction-evidence-v1', artDirectionHash: artDirectionSemanticSha256, motionDecision: 'none',
    expected: { artDirectionHash: artDirectionSemanticSha256, selectionSha256, handoffSha256: handoffValue.payloadSha256, buildHash: current.buildSha256, runId: current.buildSha256 },
    observed: { runId: current.buildSha256, buildHash: current.buildSha256, selectionSha256, handoffSha256: handoffValue.payloadSha256, observedSha256 },
    beatReceipt: JSON.parse(readFileSync(join(directory, renderedBeats.path), 'utf8')),
    observations: { desktop: { capture: desktopRender, width: 1280, height: 900 }, mobile: { capture: mobileRender, width: 390, height: 844 }, temporalSamples: { desktop: desktopSamples, mobile: mobileSamples } },
    reviewReceipts: { signature: review('signature', 'host-reviewer'), narrative: review('narrative', 'host-evaluator'), motionFit: review('motionFit', 'host-reviewer'), fidelity: review('fidelity', 'host-evaluator'), fallback: review('fallback', 'host-reviewer'), blind: review('blind', 'host-evaluator') },
  });
  writeFileSync(join(directory, '.omd', 'frame.md'), '---\nuxTask: evaluate the launch\nuxFrequentAction: compare the direction\nuxCostliestError: publish an incorrect direction\nuxSurface: marketing\n---\n');
  const sourceSealValue = createSourceSeal(directory, '2026-01-01T00:00:00.000Z');
  writeFileSync(join(directory, '.omd', 'source-seal.json'), `${canonical(sourceSealValue)}\n`);
  const sourceSeal = { path: '.omd/source-seal.json', schema: 'source-seal-v1', sha256: sha(readFileSync(join(directory, '.omd', 'source-seal.json'))) };
  const graph = { schema: 'final-evidence-v2-graph' as const, activation, intent, artDirection, board, selection, settledSelection: settledSelectionReceipt, handoff, usage, copy, renderedBeats, sourceSeal, buildIdentity, blindLane: lane('blind', 'blind-review-v1'), fidelityLane: lane('fidelity', 'fidelity-review-v1'), protocolLane: lane('protocol', 'protocol-review-v1'), observations: [first, second] };
  return decision === 'one'
    ? { schema: 'final-evidence-v2', motionDecision: 'one', graph, motionEvidence: receipt(directory, 'motion', 'motion-evidence-v2', { schema: 'motion-evidence-v2', artDirectionHash: artDirectionSemanticSha256, motionDecision: 'one', observed: {}, scenes: [] }) }
    : { schema: 'final-evidence-v2', motionDecision: 'none', graph, staticEvidence };
};
const forgeBeatFinalization = (
  directory: string,
  input: FinalEvidenceV2Manifest,
  selectedRegister: 'quiet' | 'confident',
  beatCount: number,
  currentUserException: boolean,
): FinalEvidenceV2Manifest => {
  const beatIds = Array.from({ length: beatCount }, (_, index) => `B-${index + 1}`);
  let graph = { ...input.graph };
  let intentSha256 = intentLedgerSha256(JSON.parse(readFileSync(join(directory, graph.intent.path), 'utf8')) as IntentLedger);
  let exceptionReceipt = sha('forged-noncanonical-beat-exception');
  if (currentUserException) {
    const ledger = appendExplicitIntent(JSON.parse(readFileSync(join(directory, graph.intent.path), 'utf8')) as IntentLedger, {
      eventId: 'beat-exception', currentUser: true, kind: 'current-user-beat-exception', lock: {}, recordedAt: '2026-01-01T00:00:01.000Z',
    });
    intentSha256 = intentLedgerSha256(ledger);
    const intentRecord = `intent-runs/sha256-${intentSha256}.json`;
    writeFileSync(join(directory, '.omd', intentRecord), `${JSON.stringify(ledger)}\n`);
    writeFileSync(join(directory, '.omd', 'intent-current.json'), `${canonical({ schemaVersion: INTENT_CURRENT_POINTER_SCHEMA_VERSION, record: intentRecord, sha256: intentSha256 })}\n`);
    graph = { ...graph, intent: { path: `.omd/${intentRecord}`, schema: 'intent-ledger-v1', sha256: sha(readFileSync(join(directory, '.omd', intentRecord))) } };
    exceptionReceipt = resolveCurrentUserBeatExceptionReceipt(ledger) ?? assert.fail('typed Beat exception must have a receipt');
  }
  const artPath = join(directory, graph.artDirection.path);
  const art = JSON.parse(readFileSync(artPath, 'utf8')) as Record<string, any>;
  const alternative = (art.decision.consideredAlternatives as Record<string, any>[]).find(({ register }) => register === selectedRegister) ?? assert.fail('selected register alternative is missing');
  art.decision = {
    ...art.decision, intentSha256, selectedRegister, conceptRole: alternative.conceptRole,
    selectedStaticReferenceSlotIds: alternative.staticReferenceSlotIds, selectedMotionReferenceSlotIds: alternative.motionReferenceSlotIds,
    rejectedAlternatives: (art.decision.consideredAlternatives as Record<string, any>[]).filter(({ register }) => register !== selectedRegister)
      .map((item) => ({ register: item.register, reason: 'A different evidenced direction was explicitly selected.', citedReferenceSlotIds: item.staticReferenceSlotIds })),
    currentUserBeatExceptionReceiptSha256: exceptionReceipt,
  };
  art.decisionSha256 = artDirectionSha256(art.decision);
  art.intentLedgerSha256 = intentSha256;
  art.beatIds = beatIds;
  const artDirectionSemanticSha256 = artDirectionSha256(art);
  const artRecordRelativePath = `.omd/art-direction-runs/sha256-${artDirectionSemanticSha256}.json`;
  const artRecordPath = join(directory, artRecordRelativePath);
  writeFileSync(artRecordPath, `${canonical(art)}\n`);
  writeFileSync(join(directory, '.omd', 'art-direction.json'), `${canonical({ schemaVersion: 'art-direction-current-v2', record: artRecordRelativePath.slice('.omd/'.length), sha256: artDirectionSemanticSha256 })}\n`);
  graph = { ...graph, artDirection: { ...graph.artDirection, path: artRecordRelativePath, sha256: sha(readFileSync(artRecordPath)) } };

  const invocation = finalEvidenceInvocation(directory);
  const motionResolution = JSON.parse(readFileSync(join(directory, '.omd', 'motion-resolutions', `sha256-${art.decision.motionResolutionProjectionSha256}.json`), 'utf8')) as MotionResolutionProjection;
  const settledSelection = JSON.parse(readFileSync(join(directory, '.omd', 'reference-selection-v2.json'), 'utf8')) as ReferenceSelectionV2;
  const settlement = {
    motionResolutionProjectionSha256: motionResolutionProjectionSha256(motionResolution),
    settledSelectionSha256: referenceSelectionV2Sha256(settledSelection),
    settledSelection,
  };
  assert.equal(settlement.motionResolutionProjectionSha256, art.decision.motionResolutionProjectionSha256);
  assert.equal(settlement.settledSelectionSha256, art.decision.settledSelectionSha256);
  const composer = writeReferenceHandoffReceipt(directory, 'composer', invocation).receipt;
  writeReferenceHandoffReceipt(directory, 'hand', invocation);
  const usage = JSON.parse(readFileSync(join(directory, graph.usage.path), 'utf8')) as Record<string, any>;
  usage.artDirectionSha256 = artDirectionSemanticSha256;
  usage.composerHandoffSha256 = composer.payloadSha256;
  writeFileSync(join(directory, '.omd', 'reference-usage-v2.json'), `${canonical(usage)}\n`);
  graph = { ...graph, usage: { ...graph.usage, sha256: sha(readFileSync(join(directory, '.omd', 'reference-usage-v2.json'))) } };

  const copyDeck = copyDeckV2(selectedRegister, art.decision.motionDecision, exceptionReceipt, beatIds);
  writeFileSync(join(directory, '.omd', 'copy-deck.md'), copyDeck);
  const copy = receipt(directory, `copy-${selectedRegister}-${beatCount}`, COPY_DECK_RECEIPT_SCHEMA_VERSION, {
    schemaVersion: COPY_DECK_RECEIPT_SCHEMA_VERSION, copyDeckSha256: copyDeckSha256(Buffer.from(copyDeck)), artDirectionSha256: artDirectionSemanticSha256,
    selectedRegister, motionDecision: art.decision.motionDecision, beatIds, currentUserBeatExceptionReceiptSha256: exceptionReceipt,
  });
  const renderedBeats = receipt(directory, `beats-${selectedRegister}-${beatCount}`, 'rendered-beat-receipt-v1', {
    schema: 'rendered-beat-receipt-v1', artDirectionHash: artDirectionSemanticSha256, copyDeckSha256: copyDeckSha256(Buffer.from(copyDeck)), beatIds,
    renderedBeats: beatIds.flatMap((id) => [{ id, boundary: true, distinctRegions: 0, ancestorBeatIds: [], rendered: true, observedViewport: { width: 1280, height: 900 } }, { id, boundary: true, distinctRegions: 0, ancestorBeatIds: [], rendered: true, observedViewport: { width: 390, height: 844 } }]),
    captureViewports: [{ width: 1280, height: 900 }, { width: 390, height: 844 }],
  });
  graph = { ...graph, copy, renderedBeats };
  for (const lane of ['blindLane', 'fidelityLane', 'protocolLane'] as const) {
    const value = JSON.parse(readFileSync(join(directory, graph[lane].path), 'utf8')) as Record<string, any>;
    graph = { ...graph, [lane]: receipt(directory, `${lane}-${selectedRegister}-${beatCount}`, value.schema, { ...value, artDirectionSha256: artDirectionSemanticSha256 }) };
  }

  let output: FinalEvidenceV2Manifest = { ...input, graph };
  if (output.staticEvidence !== undefined) {
    const staticValue = JSON.parse(readFileSync(join(directory, output.staticEvidence.path), 'utf8')) as Record<string, any>;
    for (const review of Object.values(staticValue.reviewReceipts) as { path: string; sha256: string }[]) {
      const path = join(directory, review.path);
      const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, any>;
      writeFileSync(path, `${canonical({ ...value, artDirectionHash: artDirectionSemanticSha256 })}\n`);
      review.sha256 = sha(readFileSync(path));
    }
    staticValue.artDirectionHash = artDirectionSemanticSha256;
    staticValue.expected.artDirectionHash = artDirectionSemanticSha256;
    staticValue.beatReceipt = JSON.parse(readFileSync(join(directory, renderedBeats.path), 'utf8'));
    output = { ...output, staticEvidence: receipt(directory, `static-${selectedRegister}-${beatCount}`, 'static-direction-evidence-v1', staticValue) };
  }
  return refreshSourceSeal(directory, output);
};
test('finalization rejects forged over-budget Beat authority and accepts the exact typed current-user exception', () => {
  for (const [selectedRegister, beatCount] of [['quiet', 6], ['confident', 8]] as const) {
    const directory = root(); try {
      const input = forgeBeatFinalization(directory, manifest(directory), selectedRegister, beatCount, false);
      assert.throws(() => publishFinalEvidenceV2(directory, input), /Beat exception receipt does not match the current intent ledger/);
    } finally { clean(directory); }
  }
  const directory = root(); try {
    const input = forgeBeatFinalization(directory, manifest(directory), 'quiet', 6, true);
    publishFinalEvidenceV2(directory, input);
    assert.equal(checkFinalEvidenceV2(directory).graph.copy.path, input.graph.copy.path);
  } finally { clean(directory); }
});

test('v2 publishes only a complete receipt graph and checker revalidates backing artifacts', () => {
  const directory = root(); try {
    const input = manifest(directory); publishFinalEvidenceV2(directory, input);
    assert.equal(checkFinalEvidenceV2(directory).graphRootHash?.length, 64);
    writeFileSync(join(directory, input.graph.artDirection.path), `${canonical({ schemaVersion: 'art-direction-record-v2', changed: true })}\n`);
    assert.throws(() => checkFinalEvidenceV2(directory));
  } finally { clean(directory); }
});
test('checker parses the authorized final pointer bytes without rereading its pathname', () => {
  const directory = root(); try {
    const input = manifest(directory);
    publishFinalEvidenceV2(directory, input);
    const invocation = finalEvidenceInvocation(directory);
    authorizeFinalEvidenceCheck(directory, invocation);
    const pointerPath = join(directory, '.omd', 'final-evidence-v2.json');
    let pointerPathReads = 0;
    assert.doesNotThrow(() => guardedCheckFinalEvidenceV2(directory, invocation, {
      fs: {
        readFile: (path) => {
          if (path === pointerPath) {
            pointerPathReads += 1;
            return Buffer.from('{"substituted":"pointer"}\n');
          }
          return readFileSync(path);
        },
      },
    }));
    assert.equal(pointerPathReads, 0);
  } finally { clean(directory); }
});
test('checker validates static evidence from its content-addressed stable bytes', () => {
  const directory = root(); try {
    const input = manifest(directory);
    publishFinalEvidenceV2(directory, input);
    const invocation = finalEvidenceInvocation(directory);
    authorizeFinalEvidenceCheck(directory, invocation);
    const staticPath = resolve(directory, input.staticEvidence!.path);
    const staticBytes = readFileSync(staticPath);
    const semanticSubstitution = Buffer.from(`${canonical({
      ...(JSON.parse(staticBytes.toString('utf8')) as Record<string, unknown>),
      artDirectionHash: sha('substituted-static-semantic-evidence'),
    })}\n`);
    let staticPathReads = 0;
    assert.doesNotThrow(() => guardedCheckFinalEvidenceV2(directory, invocation, {
      fs: {
        readFile: (path) => {
          if (path === staticPath) {
            staticPathReads += 1;
            return staticPathReads === 1 ? staticBytes : semanticSubstitution;
          }
          return readFileSync(path);
        },
      },
    }));
    assert.equal(staticPathReads, 0);
  } finally { clean(directory); }
});
test('the final graph root binds complete stable current frame bytes', () => {
  const directory = root(); try {
    const input = manifest(directory);
    publishFinalEvidenceV2(directory, input);
    writeFileSync(join(directory, '.omd', 'frame.md'), '---\nuxTask: evaluate the launch\nuxFrequentAction: compare the direction\nuxCostliestError: publish an incorrect direction\nuxSurface: marketing\n---\n\nChanged current-frame content.\n');
    assert.throws(() => checkFinalEvidenceV2(directory), /graph root hash changed/);
  } finally { clean(directory); }
});
test('malformed # Copy cannot publish even when its receipt hash is updated', () => {
  const directory = root(); try {
    const input = manifest(directory);
    const malformed = '# Copy\n';
    writeFileSync(join(directory, '.omd', 'copy-deck.md'), malformed);
    const descriptor = input.graph.copy as { path: string; sha256: string };
    const copy = JSON.parse(readFileSync(join(directory, descriptor.path), 'utf8')) as Record<string, unknown>;
    const bytes = `${canonical({ ...copy, copyDeckSha256: copyDeckSha256(Buffer.from(malformed)) })}\n`;
    writeFileSync(join(directory, descriptor.path), bytes);
    descriptor.sha256 = sha(bytes);
    assert.throws(() => publishFinalEvidenceV2(directory, input), /copy receipt does not bind the canonical copy deck/);
  } finally { clean(directory); }
});
test('closed none enums pass while placeholder art-direction prose fails', () => {
  const validDirectory = root(); try {
    assert.doesNotThrow(() => publishFinalEvidenceV2(validDirectory, manifest(validDirectory)));
  } finally { clean(validDirectory); }
  for (const placeholder of ['todo', 'placeholder']) {
    const invalidDirectory = root(); try {
      const input = manifest(invalidDirectory);
      const path = join(invalidDirectory, input.graph.artDirection.path);
      const artDirection = JSON.parse(readFileSync(path, 'utf8')) as { decision: Record<string, unknown>; decisionSha256: string };
      artDirection.decision.fallbackPath = placeholder;
      artDirection.decisionSha256 = artDirectionSha256(artDirection.decision);
      const bytes = `${canonical(artDirection)}\n`;
      writeFileSync(path, bytes);
      (input.graph as unknown as { artDirection: { sha256: string } }).artDirection.sha256 = sha(bytes);
      assert.throws(() => publishFinalEvidenceV2(invalidDirectory, input), /hand-authored placeholder/);
    } finally { clean(invalidDirectory); }
  }
});
test('final reviewer lanes require their own verdicts, floors, reviewers, session evidence, and current build', () => {
  const replaceLane = (
    directory: string,
    input: FinalEvidenceV2Manifest,
    lane: 'blindLane' | 'fidelityLane' | 'protocolLane',
    mutate: (value: Record<string, unknown>) => Record<string, unknown>,
  ): void => {
    const descriptor = input.graph[lane];
    const value = JSON.parse(readFileSync(join(directory, descriptor.path), 'utf8')) as Record<string, unknown>;
    const bytes = `${canonical(mutate(value))}\n`;
    writeFileSync(join(directory, descriptor.path), bytes);
    (input.graph as unknown as Record<string, { sha256: string }>)[lane]!.sha256 = sha(bytes);
  };
  const validDirectory = root(); try {
    assert.doesNotThrow(() => publishFinalEvidenceV2(validDirectory, manifest(validDirectory)));
  } finally { clean(validDirectory); }
  const scenarios: readonly [string, (directory: string, input: FinalEvidenceV2Manifest) => void][] = [
    ['swapped generic lanes', (directory, input) => replaceLane(directory, input, 'blindLane', (lane) => ({ ...lane, verdicts: { independentVisual: 'GREEN', independentProtocol: 'GREEN' }, criticalFloors: { fidelity: 3 } }))],
    ['missing or wrong floor dimensions', (directory, input) => replaceLane(directory, input, 'fidelityLane', (lane) => ({ ...lane, criticalFloors: { desktop: 3, composition: 3 } }))],
    ['duplicate reviewer identities', (directory, input) => {
      const blind = JSON.parse(readFileSync(join(directory, input.graph.blindLane.path), 'utf8')) as { provenance: { reviewerIds: string[] } };
      replaceLane(directory, input, 'protocolLane', (lane) => ({ ...lane, provenance: { ...(lane.provenance as Record<string, unknown>), reviewerIds: blind.provenance.reviewerIds } }));
    }],
    ['forged or unbound reviewer session evidence', (directory, input) => replaceLane(directory, input, 'blindLane', (lane) => ({ ...lane, provenance: { ...(lane.provenance as Record<string, unknown>), reviewerSessionSha256: sha('forged-session') } }))],
    ['stale lane evidence', (directory, input) => replaceLane(directory, input, 'protocolLane', (lane) => ({ ...lane, buildSha256: sha('stale-build') }))],
  ];
  for (const [scenario, mutate] of scenarios) {
    const directory = root(); try {
      const input = manifest(directory);
      mutate(directory, input);
      assert.throws(() => publishFinalEvidenceV2(directory, input), new RegExp(scenario === 'stale lane evidence' ? 'does not bind art direction and build' : 'final-evidence-v2 graph'));
    } finally { clean(directory); }
  }
});

test('digest-only, missing, mixed, branch-mismatched, red, and forked graphs cannot publish', () => {
  const directory = root(); try {
    assert.throws(() => validateFinalEvidenceV2Manifest({ schema: 'final-evidence-v2', motionDecision: 'none', bindings: { activationHash: 'a'.repeat(64) } }));
    for (const mutate of [
      (input: FinalEvidenceV2Manifest) => { rmSync(join(directory, input.graph.copy.path)); },
      (input: FinalEvidenceV2Manifest) => { (input.graph as unknown as { board: unknown }).board = { ...input.graph.board, schema: 'board-v1' }; },
      (input: FinalEvidenceV2Manifest) => { (input as { motionEvidence?: unknown }).motionEvidence = input.staticEvidence; },
      (input: FinalEvidenceV2Manifest) => { const lane = JSON.parse(readFileSync(join(directory, input.graph.blindLane.path), 'utf8')) as Record<string, unknown>; const bytes = `${canonical({ ...lane, verdicts: { blindVisual: 'RED', blindNarrative: 'GREEN' } })}\n`; writeFileSync(join(directory, input.graph.blindLane.path), bytes); (input.graph as unknown as { blindLane: { sha256: string } }).blindLane.sha256 = sha(bytes); },
      (input: FinalEvidenceV2Manifest) => { (input.graph as unknown as { observations: unknown }).observations = [input.graph.observations[0], receipt(directory, 'fork', 'observation-v2', { schema: 'observation-v2', buildSha256: sha('build-output'), currentArtifact: { path: input.graph.buildIdentity.path, sha256: input.graph.buildIdentity.sha256 }, predecessorSha256: null, observedAt: '2026-01-01T00:02:00.000Z', evidence: {} })]; },
    ]) {
      const input = manifest(directory); mutate(input); assert.throws(() => publishFinalEvidenceV2(directory, input)); assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
    }
  } finally { clean(directory); }
});
test('unrelated usage raw-board, assembly, or selection receipt bindings cannot substitute selected artifacts', () => {
  const directory = root(); try {
    for (const field of ['captureSha256', 'assemblySha256', 'projectionSha256', 'selectionSha256', 'settledSelectionSha256'] as const) {
      const input = manifest(directory);
      const usage = JSON.parse(readFileSync(join(directory, input.graph.usage.path), 'utf8')) as Record<string, unknown>;
      const bytes = `${canonical({ ...usage, [field]: sha(`unrelated-${field}`) })}\n`;
      writeFileSync(join(directory, input.graph.usage.path), bytes);
      (input.graph as unknown as { usage: { sha256: string } }).usage.sha256 = sha(bytes);
      assert.throws(() => publishFinalEvidenceV2(directory, input));
      assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
    }
  } finally { clean(directory); }
});
test('pre-selection and settled-selection receipts reject their distinct joins', () => {
  const directory = root(); try {
    const preSubstituted = manifest(directory);
    (preSubstituted.graph as unknown as { selection: unknown }).selection = receipt(directory, 'settled-as-pre-selection', 'reference-selection-v2', JSON.parse(readFileSync(join(directory, preSubstituted.graph.settledSelection.path), 'utf8')) as Record<string, unknown>);
    assert.throws(() => publishFinalEvidenceV2(directory, preSubstituted), /immutable pre-selection/);

    const settledSubstituted = manifest(directory);
    (settledSubstituted.graph as unknown as { settledSelection: unknown }).settledSelection = receipt(directory, 'pre-as-settled-selection', 'reference-selection-v2', JSON.parse(readFileSync(join(directory, settledSubstituted.graph.selection.path), 'utf8')) as Record<string, unknown>);
    assert.throws(() => publishFinalEvidenceV2(directory, settledSubstituted), /settled capture, assembly, projection, and selection/);
  } finally { clean(directory); }
});
test('semantic-edge substitutions cannot cross canonical graph joins', () => {
  const directory = root(); try {
    const rewrite = (input: FinalEvidenceV2Manifest, key: 'handoff' | 'copy' | 'renderedBeats' | 'sourceSeal' | 'buildIdentity' | 'blindLane', value: Record<string, unknown>): void => {
      const descriptor = input.graph[key];
      const bytes = `${canonical(value)}\n`;
      writeFileSync(join(directory, descriptor.path), bytes);
      (descriptor as { sha256: string }).sha256 = sha(bytes);
    };
    for (const field of ['captureSha256', 'assemblySha256', 'projectionSha256', 'preSelectionSha256'] as const) {
      const input = manifest(directory);
      const handoff = parseReferenceHandoffReceipt(JSON.parse(readFileSync(join(directory, input.graph.handoff.path), 'utf8')));
      const { payloadSha256: _payloadSha256, ...payload } = handoff;
      const substituted: Omit<ReferenceHandoffReceipt, 'payloadSha256'> = { ...payload, [field]: sha(`substituted-handoff-${field}`) };
      rewrite(input, 'handoff', { ...substituted, payloadSha256: referenceHandoffPayloadSha256(substituted) });
      assert.throws(() => publishFinalEvidenceV2(directory, input));
    }
    for (const [key, mutate] of [
      ['copy', (value: Record<string, unknown>) => ({ ...value, artDirectionSha256: sha('substituted-copy-art-direction') })],
      ['renderedBeats', (value: Record<string, unknown>) => ({ ...value, copySha256: sha('substituted-rendered-beats-copy') })],
      ['sourceSeal', (value: Record<string, unknown>) => ({ ...value, inputs: { ...(value.inputs as Record<string, unknown>), copyDeckSha256: sha('substituted-source-seal-copy') } })],
      ['buildIdentity', (value: Record<string, unknown>) => ({ ...value, buildSha256: sha('substituted-build') })],
      ['blindLane', (value: Record<string, unknown>) => ({ ...value, artDirectionSha256: sha('substituted-lane-art-direction') })],
    ] as const) {
      const input = manifest(directory);
      const descriptor = input.graph[key];
      const value = JSON.parse(readFileSync(join(directory, descriptor.path), 'utf8')) as Record<string, unknown>;
      rewrite(input, key, mutate(value));
      assert.throws(() => publishFinalEvidenceV2(directory, input));
    }
    const input = manifest(directory);
    const staticEvidence = (input as unknown as { staticEvidence: { path: string; sha256: string } }).staticEvidence;
    const value = JSON.parse(readFileSync(join(directory, staticEvidence.path), 'utf8')) as Record<string, unknown>;
    const bytes = `${canonical({ ...value, artDirectionHash: input.graph.artDirection.sha256 })}\n`;
    writeFileSync(join(directory, staticEvidence.path), bytes);
    staticEvidence.sha256 = sha(bytes);
    assert.throws(() => publishFinalEvidenceV2(directory, input));
  } finally { clean(directory); }
});
test('motion evidence accepts one observed scene and rejects empty or multi-scene branches', async () => {
  const directory = root(); try {
    const input = manifest(directory, 'one');
    const artDirectionHash = artDirectionSha256(JSON.parse(readFileSync(join(directory, input.graph.artDirection.path), 'utf8')));
    const buildHash = (JSON.parse(readFileSync(join(directory, input.graph.activation.path), 'utf8')) as { buildSha256: string }).buildSha256;
    const target = join(directory, 'motion.html');
    writeFileSync(target, `<!doctype html><html><style>
      html, body { width: 100%; height: 100%; margin: 0; }
      #scene { width: 240px; height: 180px; background: #111; animation: production-scene 1000ms linear 100ms forwards; }
      @keyframes production-scene { to { background: #eee; } }
      @media (prefers-reduced-motion: reduce) { #scene { background: #eee; animation: none !important; } }
    </style><body><main id="scene">motion</main></body></html>`);
    const observationDirectory = join(directory, '.omd', 'motion-observations', 'run-1');
    const adapter = createTestProjectWriteAdapter(directory);
    adapter.mkdir('.omd/motion-observations/run-1');
    const motion = await captureMotionEvidenceV2(target, {
      viewport: { width: 390, height: 300 }, outDir: observationDirectory, runId: 'run-1', buildHash,
      artDirectionHash: artDirectionHash, referenceSlotId: 'motion-reference', selector: '#scene',
      trigger: 'load', intervalMs: 160, adapter,
    });
    for (const [stage, capture] of Object.entries({
      start: motion.scenes[0]!.start.capture,
      mid: motion.scenes[0]!.mid.capture,
      end: motion.scenes[0]!.end.capture,
      reduced: motion.scenes[0]!.reducedMotion.capture,
    })) {
      assert.equal(capture.path, `.omd/motion-observations/run-1/run-1-${stage}.png`);
      assert.deepEqual(readFileSync(join(directory, capture.path)), Buffer.from(capture.bytesBase64, 'base64'));
    }
    const sourceSealValue = createSourceSeal(directory, '2026-01-01T00:00:00.000Z');
    writeFileSync(join(directory, '.omd', 'source-seal.json'), `${canonical(sourceSealValue)}\n`);
    (input.graph.sourceSeal as { sha256: string }).sha256 = sha(readFileSync(join(directory, '.omd', 'source-seal.json')));
    const publish = (name: string) => {
      const originalDirectory = process.cwd();
      try {
        process.chdir(directory);
        return publishFinalEvidenceV2(directory, {
          ...input,
          motionEvidence: receipt(directory, name, 'motion-evidence-v2', motion),
        });
      } finally {
        process.chdir(originalDirectory);
      }
    };
    assert.doesNotThrow(() => publish('motion-one'));
    const noScenes: unknown = { ...motion, scenes: [] };
    assert.throws(() => validateMotionEvidenceV2(noScenes), /exactly one|one requires exactly one/);
    const twoScenes: unknown = { ...motion, scenes: [motion.scenes[0]!, motion.scenes[0]!] };
    assert.throws(() => validateMotionEvidenceV2(twoScenes), /exactly one|one requires exactly one/);
  } finally { clean(directory); }
});

test('under-lock and pre-pointer revalidation block receipt drift without a pointer', () => {
  const directory = root(); try {
    const input = manifest(directory);
    assert.throws(() => publishFinalEvidenceV2(directory, input, { fault: point => { if (point === 'revalidate') writeFileSync(join(directory, input.graph.sourceSeal.path), `${canonical({ schemaVersion: 1, sealedAt: 'changed', inputs: {}, sources: [] })}\n`); } }));
    assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
  } finally { clean(directory); }
});

test('crash seams never leave an invalid committed pointer', () => {
  for (const point of ['lock-write', 'record-temp-fsync', 'runs-directory-sync', 'revalidate', 'pointer-temp-fsync', 'pointer-rename', 'pointer-directory-sync'] as const) {
    const directory = root(); try { assert.throws(() => publishFinalEvidenceV2(directory, manifest(directory), { fault: current => { if (current === point) throw new Error('injected'); } })); const pointer = join(directory, '.omd', 'final-evidence-v2.json'); if (existsSync(pointer)) assert.doesNotThrow(() => checkFinalEvidenceV2(directory)); } finally { clean(directory); }
  }
});

test('stale committed lock recovery revalidates the complete current graph', () => {
  const directory = root(); try {
    publishFinalEvidenceV2(directory, manifest(directory)); const pointer = JSON.parse(readFileSync(join(directory, '.omd', 'final-evidence-v2.json'), 'utf8')) as { sha256: string };
    writeFileSync(join(directory, '.omd', '.final-evidence-v2.lock'), JSON.stringify({ schema: 'final-evidence-v2-lock', operation: 'publication', hash: pointer.sha256, host: 'host', pid: 1, startedAt: 0 }));
    writeFileSync(join(directory, '.omd-project-mutation.lock'), JSON.stringify({ schema: 'omd-project-mutation-lock-v1', host: hostname(), pid: 99_999_999, startedAt: 0 }));
    assert.equal(recoverFinalEvidenceV2Lock(directory, { now: () => 16 * 60 * 1000, processAlive: () => false }), true);
    assert.equal(existsSync(join(directory, '.omd-project-mutation.lock')), false);
  } finally { clean(directory); }
});
test('stale publication lock recovery fails closed when its intended record is absent', () => {
  const directory = root(); try {
    publishFinalEvidenceV2(directory, manifest(directory));
    const lockPath = join(directory, '.omd', '.final-evidence-v2.lock');
    writeFileSync(lockPath, JSON.stringify({ schema: 'final-evidence-v2-lock', operation: 'publication', hash: sha('missing-record'), host: 'host', pid: 1, startedAt: 0 }));
    assert.throws(() => recoverFinalEvidenceV2Lock(directory, { now: () => 16 * 60 * 1000, processAlive: () => false }), /missing its intended immutable record/);
    assert.equal(existsSync(lockPath), true);
  } finally { clean(directory); }
});
test('stale GC recovery restores a journaled claimed runs parent before checking the pointer', () => {
  const directory = root(); try {
    publishFinalEvidenceV2(directory, manifest(directory));
    const invocation = finalEvidenceInvocation(directory);
    authorizeFinalEvidenceCheck(directory, invocation);
    const omd = join(directory, '.omd');
    const runs = join(omd, 'final-evidence-v2-runs');
    const claimed = join(omd, '.final-evidence-v2-gc-runs.claim');
    renameSync(runs, claimed);
    const identity = lstatSync(claimed);
    writeFileSync(join(omd, '.final-evidence-v2-gc.journal'), JSON.stringify({
      schema: 'final-evidence-v2-gc-journal',
      runs: { path: runs, claimed, dev: identity.dev, ino: identity.ino, state: 'claimed' },
    }));
    writeFileSync(join(omd, '.final-evidence-v2.lock'), JSON.stringify({
      schema: 'final-evidence-v2-lock', operation: 'gc', hash: 'a'.repeat(64), host: 'host', pid: 1, startedAt: 0,
    }));
    assert.equal(guardedRecoverFinalEvidenceV2Lock(directory, invocation, { now: () => 16 * 60 * 1000, processAlive: () => false }), true);
    assert.equal(existsSync(runs), true);
    assert.equal(existsSync(claimed), false);
    assert.equal(existsSync(join(omd, '.final-evidence-v2-gc.journal')), false);
    assert.doesNotThrow(() => checkFinalEvidenceV2(directory));
  } finally { clean(directory); }
});
test('orphan GC serializes quarantine and deletion against a same-hash publisher reuse', () => {
  const directory = root(); try {
    const input = manifest(directory);
    publishFinalEvidenceV2(directory, input);
    const pointerPath = join(directory, '.omd', 'final-evidence-v2.json');
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { record: string };
    const recordPath = join(directory, '.omd', 'final-evidence-v2-runs', pointer.record);
    const quarantinedRecordPath = join(directory, '.omd', 'final-evidence-v2-quarantine', pointer.record);
    rmSync(pointerPath);
    utimesSync(recordPath, new Date(0), new Date(0));

    let concurrentPublisherAttempts = 0;
    const race = () => {
      concurrentPublisherAttempts += 1;
      assert.throws(() => publishFinalEvidenceV2(directory, input), /publication is already in progress|project mutation lock/);
    };
    const quarantined = garbageCollectFinalEvidenceV2(directory, {
      dryRun: false,
      now: 2 * FINAL_EVIDENCE_V2_GC_TTL_MS,
      seams: { fs: { rename: (from, to) => { if (basename(from) === pointer.record && basename(to) === pointer.record) race(); renameSync(from, to); } } },
    });
    assert.deepEqual(quarantined.quarantined, [pointer.record]);
    assert.equal(existsSync(recordPath), false);

    const deleted = garbageCollectFinalEvidenceV2(directory, {
      dryRun: false,
      now: 4 * FINAL_EVIDENCE_V2_GC_TTL_MS,
      seams: { fs: { rm: (path, options) => { if (basename(path) === pointer.record) race(); rmSync(path, options); } } },
    });
    assert.deepEqual(deleted.deleted, [pointer.record]);
    assert.equal(concurrentPublisherAttempts, 2);
    publishFinalEvidenceV2(directory, input);
    assert.equal((JSON.parse(readFileSync(pointerPath, 'utf8')) as { record: string }).record, pointer.record);
    assert.doesNotThrow(() => checkFinalEvidenceV2(directory));
  } finally { clean(directory); }
});
test('final publication and destructive GC reject ordinary guarded writers at commit seams', () => {
  const publicationRoot = root(); const gcRoot = root(); try {
    const publicationInput = manifest(publicationRoot);
    const publicationWriter = finalEvidenceInvocation(publicationRoot);
    let publicationRaceObserved = false;
    publishFinalEvidenceV2(publicationRoot, publicationInput, {
      fs: {
        rename: (from, to) => {
          if (basename(to) === 'final-evidence-v2.json') {
            publicationRaceObserved = true;
            assert.throws(() => writeProjectFile({
              projectRoot: publicationRoot,
              relativePath: '.omd/concurrent-writer.json',
              content: '{}',
              invocation: publicationWriter,
            }), /project mutation lock/);
          }
          renameSync(from, to);
        },
      },
    });
    assert.equal(publicationRaceObserved, true);
    assert.equal(existsSync(join(publicationRoot, '.omd', 'concurrent-writer.json')), false);

    const gcInput = manifest(gcRoot);
    publishFinalEvidenceV2(gcRoot, gcInput);
    const pointerPath = join(gcRoot, '.omd', 'final-evidence-v2.json');
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { record: string };
    const recordPath = join(gcRoot, '.omd', 'final-evidence-v2-runs', pointer.record);
    rmSync(pointerPath);
    utimesSync(recordPath, new Date(0), new Date(0));
    const gcWriter = finalEvidenceInvocation(gcRoot);
    let gcRaceObserved = false;
    garbageCollectFinalEvidenceV2(gcRoot, {
      dryRun: false,
      now: 2 * FINAL_EVIDENCE_V2_GC_TTL_MS,
      seams: {
        fs: {
          rename: (from, to) => {
            if (basename(from) === pointer.record && basename(to) === pointer.record) {
              gcRaceObserved = true;
              assert.throws(() => writeProjectFile({
                projectRoot: gcRoot,
                relativePath: '.omd/concurrent-gc-writer.json',
                content: '{}',
                invocation: gcWriter,
              }), /project mutation lock/);
            }
            renameSync(from, to);
          },
        },
      },
    });
    assert.equal(gcRaceObserved, true);
    assert.equal(existsSync(join(gcRoot, '.omd', 'concurrent-gc-writer.json')), false);
  } finally {
    clean(publicationRoot);
    clean(gcRoot);
  }
});
test('orphan GC rejects symlinked runs and quarantine parent directories', () => {
  const runsDirectory = root(); const quarantineDirectory = root(); const outside = root(); try {
    mkdirSync(join(runsDirectory, '.omd'), { recursive: true });
    symlinkSync(outside, join(runsDirectory, '.omd', 'final-evidence-v2-runs'));
    assert.throws(() => garbageCollectFinalEvidenceV2(runsDirectory, { dryRun: false }), /GC runs parent/);

    mkdirSync(join(quarantineDirectory, '.omd', 'final-evidence-v2-runs'), { recursive: true });
    symlinkSync(outside, join(quarantineDirectory, '.omd', 'final-evidence-v2-quarantine'));
    assert.throws(() => garbageCollectFinalEvidenceV2(quarantineDirectory, { dryRun: true }), /GC quarantine parent/);
  } finally { clean(runsDirectory); clean(quarantineDirectory); clean(outside); }
});

test('dead no-pointer lock with a missing observation receipt fails closed and is retained', () => {
  const directory = root(); try {
    const input = manifest(directory);
    publishFinalEvidenceV2(directory, input);
    const pointerPath = join(directory, '.omd', 'final-evidence-v2.json');
    const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { sha256: string };
    rmSync(pointerPath);
    rmSync(join(directory, input.graph.observations[0]!.path));
    const lockPath = join(directory, '.omd', '.final-evidence-v2.lock');
    writeFileSync(lockPath, JSON.stringify({ schema: 'final-evidence-v2-lock', operation: 'publication', hash: pointer.sha256, host: 'host', pid: 1, startedAt: 0 }));
    assert.throws(() => recoverFinalEvidenceV2Lock(directory, { now: () => 16 * 60 * 1000, processAlive: () => false }));
    assert.equal(existsSync(lockPath), true);
  } finally { clean(directory); }
});
test('unguarded final-v2 publication cannot create its output directory', () => {
  const directory = root(); try {
    assert.throws(() => guardedPublishFinalEvidenceV2(directory, manifest(directory), {} as never));
    assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
  } finally { clean(directory); }
});

test('content-addressed record symlinks fail closed on EEXIST publication and post-commit validation', () => {
  const directory = root(); const outside = root(); try {
    const input = manifest(directory);
    const invocation = finalEvidenceInvocation(directory); authorizeTestProjectRunPayloads(directory, invocation, finalEvidenceGraphAuthorizations(directory, input));
    const graphRootHash = validateFinalEvidenceV2GraphFiles(directory, input.graph, finalEvidenceGraphFilesystem, invocation).rootHash;
    const record = `sha256-${sha(`${canonical({ ...input, graphRootHash })}\n`)}.json`;
    const recordPath = join(directory, '.omd', 'final-evidence-v2-runs', record);
    mkdirSync(join(directory, '.omd', 'final-evidence-v2-runs'), { recursive: true });
    const outsideRecord = join(outside, 'record.json'); writeFileSync(outsideRecord, '{}\n'); symlinkSync(outsideRecord, recordPath);
    assert.throws(() => publishFinalEvidenceV2(directory, input), /unsafe file|content-addressed record/);
    assert.equal(existsSync(join(directory, '.omd', 'final-evidence-v2.json')), false);
    rmSync(recordPath);

    publishFinalEvidenceV2(directory, input);
    rmSync(recordPath);
    symlinkSync(outsideRecord, recordPath);
    const postCommitInvocation = finalEvidenceInvocation(directory);
    const persistedManifest = Buffer.from(`${canonical({ ...input, graphRootHash })}\n`);
    authorizeTestProjectRunPayloads(directory, postCommitInvocation, [{ purpose: 'final-reviewer-lane', payload: readFileSync(join(directory, '.omd', 'final-evidence-v2.json')) }, { purpose: 'final-evidence-manifest', payload: persistedManifest }, ...finalEvidenceGraphAuthorizations(directory, input)]);
    assert.throws(() => guardedCheckFinalEvidenceV2(directory, postCommitInvocation), /unsafe file|final evidence record/);
    writeFileSync(join(directory, '.omd', '.final-evidence-v2.lock'), JSON.stringify({ schema: 'final-evidence-v2-lock', operation: 'publication', hash: sha(readFileSync(join(directory, '.omd', 'final-evidence-v2.json'))), host: 'host', pid: 1, startedAt: 0 }));
    assert.throws(() => guardedRecoverFinalEvidenceV2Lock(directory, postCommitInvocation, { now: () => 16 * 60 * 1000, processAlive: () => false }), /unsafe file|final evidence record/);
  } finally { clean(directory); clean(outside); }
});

test('product and mixed final-v2 publications require current typed task evidence', () => {
  for (const surface of ['product', 'mixed'] as const) {
    const directory = root(); try {
      let input = manifest(directory); writeFileSync(join(directory, '.omd', 'frame.md'), taskFrame(surface)); input = refreshSourceSeal(directory, input);
      assert.throws(() => publishFinalEvidenceV2(directory, input), /requires current task evidence/);
      input = attachCurrentTaskEvidence(directory, input, surface);
      publishFinalEvidenceV2(directory, input);
      rmSync(join(directory, '.omd', 'task-evidence.json'));
      assert.throws(() => checkFinalEvidenceV2(directory), /ENOENT|current task evidence validation failed|task evidence/);
    } finally { clean(directory); }
  }
});
test('product routes reject a one signature scene even with current task evidence', () => {
  const directory = root(); try {
    let input = manifest(directory, 'one');
    input = attachCurrentTaskEvidence(directory, input, 'product');
    assert.throws(() => publishFinalEvidenceV2(directory, input), /product routes cannot publish a signature scene or showpiece register/);
  } finally { clean(directory); }
});

test('product final-v2 evidence rejects stale task evidence and marketing, editorial, or static frames reject task matrices', () => {
  const product = root(); try {
    let input = manifest(product); input = attachCurrentTaskEvidence(product, input, 'product'); publishFinalEvidenceV2(product, input);
    writeFileSync(join(product, '.omd', 'frame.md'), taskFrame('product', 'changed'));
    assert.throws(() => checkFinalEvidenceV2(product), /current task evidence validation failed|task evidence/);
  } finally { clean(product); }

  for (const surface of ['marketing', 'editorial', 'static'] as const) {
    const directory = root(); try {
      let input = manifest(directory); input = attachCurrentTaskEvidence(directory, input, 'product');
      writeFileSync(join(directory, '.omd', 'frame.md'), taskFrame(surface)); input = refreshSourceSeal(directory, input);
      assert.throws(() => publishFinalEvidenceV2(directory, input), /current frame fails UX contract: FRAME-UX-INCOMPLETE/);
    } finally { clean(directory); }
  }
});
test('task evidence surface must exactly match the current frame in both directions', () => {
  const product = root(); try {
    let input = manifest(product);
    input = attachCurrentTaskEvidence(product, input, 'product');
    assert.doesNotThrow(() => publishFinalEvidenceV2(product, input));
  } finally { clean(product); }

  const mixedEvidenceForProduct = root(); try {
    let input = manifest(mixedEvidenceForProduct);
    input = attachCurrentTaskEvidence(mixedEvidenceForProduct, input, 'mixed');
    writeFileSync(join(mixedEvidenceForProduct, '.omd', 'frame.md'), taskFrame('product'));
    input = refreshSourceSeal(mixedEvidenceForProduct, input);
    assert.throws(() => publishFinalEvidenceV2(mixedEvidenceForProduct, input), {
      message: 'final-evidence-v2 graph: current task evidence validation failed: frame or composition digest mismatch',
    });
  } finally { clean(mixedEvidenceForProduct); }

  const taskMatrixForMarketing = root(); try {
    let input = manifest(taskMatrixForMarketing);
    input = attachCurrentTaskEvidence(taskMatrixForMarketing, input, 'product');
    writeFileSync(join(taskMatrixForMarketing, '.omd', 'frame.md'), '---\nuxTask: evaluate the launch\nuxFrequentAction: compare the direction\nuxCostliestError: publish an incorrect direction\nuxSurface: marketing\n---\n');
    input = refreshSourceSeal(taskMatrixForMarketing, input);
    assert.throws(() => publishFinalEvidenceV2(taskMatrixForMarketing, input), {
      message: 'final-evidence-v2 graph: marketing final publication must not include task evidence',
    });
  } finally { clean(taskMatrixForMarketing); }
});
test('project writes reject an existing symlink ancestor', () => {
  const directory = root(); const outside = root(); try {
    symlinkSync(outside, join(directory, 'linked'));
    assert.throws(() => writeProjectFile({
      projectRoot: directory,
      relativePath: 'linked/escape.txt',
      content: 'blocked',
      invocation: createTestProjectRunInvocation(directory),
    }));
    assert.equal(existsSync(join(outside, 'escape.txt')), false);
  } finally { clean(directory); clean(outside); }
});
test('project writes reject an existing symlink leaf target', () => {
  const directory = root(); const outside = root(); try {
    const outsideTarget = join(outside, 'target.txt');
    writeFileSync(outsideTarget, 'original');
    symlinkSync(outsideTarget, join(directory, 'leaf.txt'));
    assert.throws(() => writeProjectFile({
      projectRoot: directory,
      relativePath: 'leaf.txt',
      content: 'blocked',
      invocation: createTestProjectRunInvocation(directory),
    }));
    assert.equal(readFileSync(outsideTarget, 'utf8'), 'original');
  } finally { clean(directory); clean(outside); }
});
test('motionDecision one rejects every additional scroll-scene evidence carrier', () => {
  const directory = root(); try {
    const input = manifest(directory, 'one', 'showpiece');
    const extra = receipt(directory, 'scroll', 'scroll-scene-evidence-v1', { schema: 'scroll-scene-evidence-v1' });
    assert.throws(
      () => validateFinalEvidenceV2Manifest({ ...input, scrollSceneEvidence: extra }),
      /unexpected keys|exactly one motion evidence/,
    );
  } finally { clean(directory); }
});
test('observation-v2 rejects forged currentness and persists only redacted hash-chained evidence', () => {
  const directory = root(); try {
    const artifactPath = join(directory, '.omd', 'current-artifact.json');
    mkdirSync(join(directory, '.omd'), { recursive: true });
    const buildSha256 = sha('current-build');
    writeFileSync(artifactPath, `${JSON.stringify({ buildSha256 })}\n`);
    const currentArtifact = { path: '.omd/current-artifact.json', sha256: sha(readFileSync(artifactPath)) };
    const writer = createTestProjectWriteAdapter(directory);
    assert.throws(() => writeObservationV2(directory, { currentArtifact: { ...currentArtifact, sha256: sha('forged') }, buildSha256, evidence: {} }, writer), /stale/);
    assert.throws(() => writeObservationV2(directory, { currentArtifact, buildSha256, evidence: {}, observedAt: 'not-a-date' }, writer), /observedAt/);
    const first = writeObservationV2(directory, { currentArtifact, buildSha256, observedAt: '2026-01-01T00:00:00.000Z', evidence: { email: 'person@example.com', nested: { authorization: 'Bearer super-secret-token-value-123456' } } }, writer);
    const second = writeObservationV2(directory, { currentArtifact, buildSha256, observedAt: '2026-01-02T00:00:00.000Z', evidence: { note: 'safe' } }, writer);
    writeFileSync(artifactPath, '{"current":false}\n');
    assert.throws(() => writeObservationV2(directory, { currentArtifact, buildSha256, evidence: {} }, writer), /stale/);
    assert.deepEqual(first.evidence, { email: '[REDACTED]', nested: { authorization: '[REDACTED]' } });
    assert.equal(readCurrentObservationV2(directory)?.predecessorSha256, observationV2Sha256(first));
    assert.equal(second.predecessorSha256, observationV2Sha256(first));
    assert.doesNotMatch(readFileSync(join(directory, '.omd', 'observation-v2.json'), 'utf8') + readFileSync(join(directory, '.omd', 'observation-v2', `sha256-${observationV2Sha256(first)}.json`), 'utf8'), /person@example\.com|super-secret-token/);
  } finally { clean(directory); }
});

test('observation retention keeps graph-current records and requires a trusted writer', () => {
  const directory = root(); try {
    const artifactPath = join(directory, '.omd', 'current-artifact.json');
    const buildSha256 = sha('current-build');
    mkdirSync(join(directory, '.omd'), { recursive: true }); writeFileSync(artifactPath, JSON.stringify({ buildSha256 }));
    const currentArtifact = { path: '.omd/current-artifact.json', sha256: sha(readFileSync(artifactPath)) };
    const writer = createTestProjectWriteAdapter(directory);
    writeObservationV2(directory, { currentArtifact, buildSha256, observedAt: '2026-01-01T00:00:00.000Z', evidence: { id: 1 } }, writer);
    writeObservationV2(directory, { currentArtifact, buildSha256, observedAt: '2026-01-02T00:00:00.000Z', evidence: { id: 2 } }, writer);
    const retained = retainObservationV2(directory, { currentArtifact, maxRecords: 1 }, writer);
    assert.equal(retained.retained.length, 2);
    assert.throws(() => retainObservationV2(directory, { currentArtifact, maxRecords: 0 }, writer), /positive integer/);
    assert.throws(() => retainObservationV2(directory, { currentArtifact, maxRecords: 1 }, { projectRoot: directory, mkdir() { return ''; }, write() { return ''; } }), /trusted active project-write adapter/);
  } finally { clean(directory); }
});

test('legacy v1 migration rechecks published artifacts rather than accepting caller data', () => {
  const directory = root(); try {
    assert.throws(() => attestLegacyV1AsV2(directory, createTestProjectWriteAdapter(directory)), /final-evidence/);
  } finally { clean(directory); }
});