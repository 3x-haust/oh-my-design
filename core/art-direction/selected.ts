import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import * as v from '../brief/candidate-data.ts';
import { CURRENT_CANDIDATE_PATH, checkCandidateSelection, parseCandidatePointerV2 } from '../brief/candidate-choice.ts';
import { parseCandidateSet, parseCandidatePlan } from '../brief/candidate-plan.ts';
import { readPersistedRoute } from '../route/index.ts';
import { requireEvaluatorAssessmentAuthorization, requireEvaluatorResultAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import { validateMotionResolutionProjection, motionResolutionProjectionSha256 } from '../ref/reference-selection.ts';

export const SELECTED_ART_REGISTERS = ['quiet', 'content-led', 'confident', 'showpiece'] as const;
export type SelectedArtDirectionInput = Readonly<{
  schema: 'art-direction-input-v3'; candidateSelection: v.Receipt; selectedId: string;
  register: typeof SELECTED_ART_REGISTERS[number]; relationship: string;
  staticContract: { hierarchy: string; density: string; typography: string; preserve: readonly string[]; falsifiers: readonly string[] };
  metaphorQualities: readonly string[]; literalPropsToReject: readonly string[];
  motion: { decision: 'none' | 'one'; settlement: v.Receipt | null; evaluatorAssessment: v.Receipt | null; evaluatorResult: v.Receipt | null };
  implementationLane: string; fallbackPath: string; performanceAccessibilityBudget: string;
  beatIds: readonly string[];
}>;
export type SelectedArtDirection = Omit<SelectedArtDirectionInput, 'schema'> & Readonly<{
  schema: 'art-direction-v3'; sourceContractSha256: string; decidedBy: 'user' | 'agent'; inputDigest: string;
  effectiveBaseTokensSha256: string;
}>;
export type SelectedArtRecord = Readonly<{ schema: 'art-direction-record-v4'; decision: SelectedArtDirection; signature: string }>;
export type SelectedArtPointer = Readonly<{ schemaVersion: 'art-direction-current-v3'; record: v.Receipt }>;

export function parseSelectedArtDirectionInput(value: unknown): SelectedArtDirectionInput {
  const x = v.object(value, ['schema', 'candidateSelection', 'selectedId', 'register', 'relationship', 'staticContract', 'metaphorQualities', 'literalPropsToReject', 'motion', 'implementationLane', 'fallbackPath', 'performanceAccessibilityBudget', 'beatIds']);
  const s = v.object(x.staticContract, ['hierarchy', 'density', 'typography', 'preserve', 'falsifiers']);
  const m = v.object(x.motion, ['decision', 'settlement', 'evaluatorAssessment', 'evaluatorResult']);
  const motion = { decision: v.enumeration(m.decision, ['none', 'one']), settlement: v.nullableReceipt(m.settlement), evaluatorAssessment: v.nullableReceipt(m.evaluatorAssessment), evaluatorResult: v.nullableReceipt(m.evaluatorResult) };
  if (motion.decision === 'one' && (!motion.settlement || !motion.evaluatorAssessment || !motion.evaluatorResult)) v.fail('selected motion needs existing native settlement and independent evaluator evidence');
  if (motion.decision === 'none' && [motion.settlement, motion.evaluatorAssessment, motion.evaluatorResult].some(Boolean)
    && ![motion.settlement, motion.evaluatorAssessment, motion.evaluatorResult].every(Boolean)) v.fail('native settlement lineage must be complete');
  const beatIds = v.ids(x.beatIds); if (beatIds.some(id => !/^B-\d+$/.test(id))) v.fail('invalid Beat ID');
  return { schema: v.enumeration(x.schema, ['art-direction-input-v3']), candidateSelection: v.receipt(x.candidateSelection), selectedId: v.id(x.selectedId),
    register: v.enumeration(x.register, SELECTED_ART_REGISTERS), relationship: v.text(x.relationship),
    staticContract: { hierarchy: v.text(s.hierarchy), density: v.text(s.density), typography: v.text(s.typography), preserve: v.list(s.preserve, v.text), falsifiers: v.list(s.falsifiers, v.text) },
    metaphorQualities: v.list(x.metaphorQualities, v.text), literalPropsToReject: v.list(x.literalPropsToReject, v.text), motion,
    implementationLane: v.text(x.implementationLane), fallbackPath: v.text(x.fallbackPath), performanceAccessibilityBudget: v.text(x.performanceAccessibilityBudget), beatIds };
}

function derive(root: string, input: SelectedArtDirectionInput, sourceContractSha256: string, invocation?: ProjectRunInvocation): SelectedArtDirection {
  const pointer = parseCandidatePointerV2(JSON.parse(v.readBytes(root, CURRENT_CANDIDATE_PATH).toString('utf8')));
  if (v.digest(pointer.selection) !== v.digest(input.candidateSelection)) v.fail('art direction must consume the current authenticated candidate choice');
  const choice = checkCandidateSelection(root, pointer);
  const set = parseCandidateSet(JSON.parse(v.readReceipt(root, choice.candidateSet).toString('utf8')));
  const plan = parseCandidatePlan(JSON.parse(v.readReceipt(root, set.plan).toString('utf8')));
  const hypothesis = plan.candidates.find(c => c.id === choice.selectedId)!;
  if (input.selectedId !== choice.selectedId || plan.sourceContractSha256 !== sourceContractSha256 || input.relationship !== hypothesis.relationship) v.fail('settlement cannot replace the chosen candidate or relationship');
  if (input.motion.settlement) {
    const bytes = v.readReceipt(root, input.motion.settlement), projection = validateMotionResolutionProjection(JSON.parse(bytes.toString('utf8')));
    const assessment = v.readReceipt(root, input.motion.evaluatorAssessment!), result = v.readReceipt(root, input.motion.evaluatorResult!);
    if (projection.motionDecision !== input.motion.decision || projection.evaluatorPayloadSha256 !== v.hash(assessment)
      || projection.evaluatorResultSha256 !== v.hash(result)
      || input.motion.settlement.path !== `.omd/motion-resolutions/sha256-${motionResolutionProjectionSha256(projection)}.json`) v.fail('native motion settlement lineage differs');
    // The evaluator must assess this already chosen direction, not elect a register winner.
    const a = v.object(JSON.parse(assessment.toString('utf8')));
    if (v.digest(a.candidateSelection) !== v.digest(pointer.selection) || a.selectedId !== choice.selectedId
      || a.suitability !== 'pass') v.fail('independent motion suitability must bind the chosen candidate');
    if (invocation) {
      requireEvaluatorAssessmentAuthorization(invocation, realpathSync(root), assessment);
      requireEvaluatorResultAuthorization(invocation, realpathSync(root), result);
    }
  }
  const { schema: _schema, ...authored } = input;
  return { schema: 'art-direction-v3', ...authored, sourceContractSha256, decidedBy: choice.decision.decidedBy,
    inputDigest: choice.inputDigest, effectiveBaseTokensSha256: choice.effectiveBaseTokensSha256 };
}

export function selectedArtDirectionInput(root: string) {
  const pointer = parseCandidatePointerV2(JSON.parse(v.readBytes(root, CURRENT_CANDIDATE_PATH).toString('utf8')));
  const choice = checkCandidateSelection(root, pointer);
  const set = parseCandidateSet(JSON.parse(v.readReceipt(root, choice.candidateSet).toString('utf8')));
  const plan = parseCandidatePlan(JSON.parse(v.readReceipt(root, set.plan).toString('utf8')));
  return { candidateSelection: pointer.selection, selectedId: choice.selectedId,
    hypothesis: plan.candidates.find(c => c.id === choice.selectedId)!, previews: choice.previews, decidedBy: choice.decision.decidedBy };
}

/** Same durable art-direction family, new explicit version. Legacy readers refuse rather than
 * treating candidate choice as a register tournament or manufacturing old motion/reference hashes. */
export function publishSelectedArtDirection(root: string, value: unknown, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation): SelectedArtPointer {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const unlock = acquireProjectMutationLock(root, invocation);
  try {
    const route = readPersistedRoute(root, invocation);
    if (!route.sourceContract.processPolicy || !route.strategy.stages.includes('art-direction')) v.fail('current selected art-direction stage required');
    const decision = derive(root, parseSelectedArtDirectionInput(value), route.sourceContractSha256, invocation);
    const record: SelectedArtRecord = { schema: 'art-direction-record-v4', decision,
      signature: signNativeObservation(realpathSync(root), 'art-direction-v3', v.digest(decision)) };
    const receipt = v.publishRecord(writer, '.omd/art-direction-runs', record);
    const pointer: SelectedArtPointer = { schemaVersion: 'art-direction-current-v3', record: receipt };
    replaceProjectFileAtomically({ projectRoot: root, relativePath: '.omd/art-direction.json', content: v.jsonBytes(pointer), invocation });
    return pointer;
  } finally { unlock(); }
}
export function isSelectedArtDirection(root: string): boolean {
  return existsSync(join(root, '.omd/art-direction.json'))
    && JSON.parse(v.readBytes(root, '.omd/art-direction.json').toString('utf8')).schemaVersion === 'art-direction-current-v3';
}
export function readSelectedArtDirection(root: string, sourceContractSha256: string): SelectedArtRecord {
  const p = v.object(JSON.parse(v.readBytes(root, '.omd/art-direction.json').toString('utf8')), ['schemaVersion', 'record']);
  v.enumeration(p.schemaVersion, ['art-direction-current-v3']); const receipt = v.receipt(p.record);
  if (receipt.path !== `.omd/art-direction-runs/sha256-${receipt.sha256}.json`) v.fail('immutable selected art record required');
  const record = v.object(JSON.parse(v.readReceipt(root, receipt).toString('utf8')), ['schema', 'decision', 'signature']);
  v.enumeration(record.schema, ['art-direction-record-v4']); const decision = v.object(record.decision);
  const { schema, sourceContractSha256: source, decidedBy, inputDigest, effectiveBaseTokensSha256, ...authored } = decision;
  if (schema !== 'art-direction-v3' || source !== sourceContractSha256
    || !verifyNativeObservation(realpathSync(root), 'art-direction-v3', v.digest(decision), v.text(record.signature))) v.fail('selected art record authority/currentness mismatch');
  const current = derive(root, parseSelectedArtDirectionInput({ schema: 'art-direction-input-v3', ...authored }), sourceContractSha256);
  if (v.digest(current) !== v.digest(decision)) v.fail('selected art direction changed');
  return { schema: 'art-direction-record-v4', decision: current, signature: record.signature as string };
}
export function selectedArtCopyProjection(record: SelectedArtRecord) {
  const d = record.decision;
  return { schema: 'selected-art-copy-v1', selectedId: d.selectedId, candidateSelection: d.candidateSelection,
    register: d.register, motionDecision: d.motion.decision, beatIds: d.beatIds };
}
