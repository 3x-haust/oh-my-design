import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../route/adaptive-route-persistence.ts';
import { validateActivationContext } from '../runtime/activation.ts';
import { requireMotionCollectorAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { observationV2Sha256, validateObservationV2 } from '../runtime/observation.ts';
import { readSelectedArtDirection } from '../art-direction/selected.ts';
import { selectedDirectionCopyClosureProblems } from '../art-direction/copy-closure.ts';
import { createAdaptiveSourceSealRoute, isAdaptiveSourceSealRoute, type AdaptiveSourceSealRoute } from '../source-seal/adaptive-inputs.ts';
import { validateSourceSeal, validateSourceSealArtifact } from '../source-seal/index.ts';
import { createAdaptiveWorkflowSourceBinding, isAdaptiveWorkflowSourceBinding, type AdaptiveWorkflowSourceBinding } from '../design-development/workflow-persistence.ts';
import { validateCurrentCompositionContract } from '../composition-contract/index.ts';
import { readFrame } from '../frame/index.ts';
import { checkTaskEvidenceAgainstSources, requireTaskEvidenceProbeAuthorizations } from './task.ts';
import { validateMotionEvidenceV2, validateRenderedBeatResultAuthority } from '../render/index.ts';
import { validatePostRenderBeatProof } from '../copy/index.ts';
import { validateMotionResolutionProjection } from '../ref/reference-selection.ts';
import { validateTrustedOutcomeEvidence } from './final-v2-outcome-gate.ts';
import { validateFinalBrowserObservations } from './final-v2-browser-observations.ts';
import { validateFinalV2ContentFitCurrentness } from './final-v2-content-fit.ts';
import { parseMeasuredTerminal, type MeasuredTerminal } from './final-v2-measured-contract.ts';
import { validateMeasuredTerminal } from './final-v2-measured-terminal.ts';
import { readArtifact } from '../measure/inputs.ts';
import { digest, sha256 } from '../measure/identity.ts';
import * as v from '../measure/validation.ts';
import type { EvidenceGraphFs, ArtifactReceipt } from './final-v2-graph.ts';
import { parseFinalConfidenceDebt, validateFinalConfidenceDebt, type FinalConfidenceDebt } from './final-v2-confidence-debt.ts';
import { readConfidenceDebt } from '../brief/confidence-debt.ts';
import { validateSelectedDirectionCapture } from '../runtime/trusted-selected-direction-capture.ts';

export const SELECTED_DIRECTION_GRAPH_SCHEMA = 'final-evidence-v2-selected-direction-graph-v1';
export type SelectedDirectionGraph = Readonly<{
  schema: typeof SELECTED_DIRECTION_GRAPH_SCHEMA; activation: ArtifactReceipt; route: AdaptiveSourceSealRoute;
  selectedDirection: ArtifactReceipt; copy: ArtifactReceipt; sourceSeal: ArtifactReceipt; buildIdentity: ArtifactReceipt;
  observations: readonly ArtifactReceipt[]; measuredTerminal: MeasuredTerminal; workflow?: AdaptiveWorkflowSourceBinding;
  taskEvidence?: ArtifactReceipt; contentFit?: ArtifactReceipt; motionEvidence?: ArtifactReceipt; renderedBeats?: ArtifactReceipt; directionCapture?: ArtifactReceipt;
  confidenceDebt?: FinalConfidenceDebt;
  blindLane?: never; fidelityLane?: never; protocolLane?: never;
}>;
const typedReceipt = v.object({ path: v.path, schema: v.text, sha256: v.sha });
export function isSelectedDirectionGraph(value: unknown): value is SelectedDirectionGraph {
  return !!value && typeof value === 'object' && Reflect.get(value, 'schema') === SELECTED_DIRECTION_GRAPH_SCHEMA;
}
export function parseSelectedDirectionGraph(input: unknown): SelectedDirectionGraph {
  if (!input || typeof input !== 'object') return v.fail('selected-direction graph required');
  const x = input as Record<string, unknown>;
  v.object({ schema: v.enumeration(SELECTED_DIRECTION_GRAPH_SCHEMA), activation: typedReceipt, route: value => { if (!isAdaptiveSourceSealRoute(value)) v.fail('selected-direction route binding required'); },
    selectedDirection: typedReceipt, copy: typedReceipt, sourceSeal: typedReceipt, buildIdentity: typedReceipt, observations: v.array(typedReceipt), measuredTerminal: value => { parseMeasuredTerminal(value); },
    ...(x.workflow === undefined ? {} : { workflow: value => { if (!isAdaptiveWorkflowSourceBinding(value)) v.fail('invalid selected-direction workflow'); } }),
    ...(x.confidenceDebt === undefined ? {} : { confidenceDebt: value => { parseFinalConfidenceDebt(value); } }),
    ...Object.fromEntries(['taskEvidence', 'contentFit', 'motionEvidence', 'renderedBeats', 'directionCapture'].filter(key => x[key] !== undefined).map(key => [key, typedReceipt])) })(input);
  const graph = input as SelectedDirectionGraph;
  if (!graph.observations.length || graph.selectedDirection.schema !== 'art-direction-record-v4' || graph.activation.schema !== 'activation-context-v2'
    || graph.copy.schema !== 'copy-deck-v2' || graph.buildIdentity.schema !== 'omd-build-identity-v1'
    || graph.sourceSeal.schema !== (graph.workflow ? 'source-seal-v2' : 'source-seal-v1') || graph.observations.some(o => o.schema !== 'observation-v2')
    || graph.taskEvidence && graph.taskEvidence.schema !== 'task-evidence-v1' || graph.renderedBeats && graph.renderedBeats.schema !== 'rendered-beat-receipt-v1'
    || graph.directionCapture && graph.directionCapture.schema !== 'selected-direction-capture-v1') v.fail('selected-direction receipt schemas differ');
  return graph;
}
function bytes(root: string, receipt: ArtifactReceipt): Buffer {
  const value = readArtifact(root, receipt.path); if (sha256(value) !== receipt.sha256) v.fail('selected-direction receipt bytes changed'); return value;
}
export function validateSelectedDirectionGraphFiles(root: string, input: unknown, fs: EvidenceGraphFs, invocation: ProjectRunInvocation, productionOnly = false) {
  const graph = parseSelectedDirectionGraph(input), route = readPersistedRoute(root, invocation);
  if (!route.sourceContract.processPolicy || !route.strategy.stages.includes('art-direction')) v.fail('selected-direction graph needs the current selected art stage');
  const selected = readSelectedArtDirection(root, route.sourceContractSha256), pointer = JSON.parse(readArtifact(root, '.omd/art-direction.json').toString('utf8'));
  if (readConfidenceDebt(root, route.sourceContractSha256).length && !graph.confidenceDebt) v.fail('selected-direction graph must disclose its current confidence debt');
  const limitations = validateFinalConfidenceDebt(root, route, graph.confidenceDebt, [], [graph.activation, graph.copy, graph.sourceSeal, graph.selectedDirection, graph.buildIdentity, ...graph.observations, ...graph.measuredTerminal.measurements]);
  if (pointer.record.path !== graph.selectedDirection.path || pointer.record.sha256 !== graph.selectedDirection.sha256) v.fail('selected-direction graph does not bind current v3 art');
  bytes(root, graph.selectedDirection);
  if (digest(graph.route) !== digest(createAdaptiveSourceSealRoute(root, invocation))) v.fail('selected-direction source/authority bindings changed');
  const activation = validateActivationContext(JSON.parse(bytes(root, graph.activation).toString('utf8')));
  const build = JSON.parse(bytes(root, graph.buildIdentity).toString('utf8'));
  if (build.schemaVersion !== 'omd-build-identity-v1' || build.buildSha256 !== invocation.current.buildSha256 || build.sourceSkillSha256 !== invocation.current.loadedSkillSha256
    || activation.buildSha256 !== build.buildSha256 || activation.briefSha256 !== invocation.current.briefSha256) v.fail('selected-direction build/activation changed');
  bytes(root, graph.copy);
  if (graph.copy.path !== '.omd/copy-deck.md') v.fail('selected-direction copy must identify current owner copy');
  const copyProblems = selectedDirectionCopyClosureProblems(root);
  if (copyProblems.length) v.fail(`selected-direction copy closure: ${copyProblems.join('; ')}`);
  const seal = validateSourceSealArtifact(JSON.parse(bytes(root, graph.sourceSeal).toString('utf8')));
  if (graph.sourceSeal.path !== '.omd/source-seal.json' || digest(seal.route) !== digest(graph.route) || validateSourceSeal(root, invocation).length) v.fail('selected-direction source seal changed');
  if (graph.workflow && (seal.schemaVersion !== 2 || digest(graph.workflow) !== digest(createAdaptiveWorkflowSourceBinding(root, invocation)))) v.fail('selected-direction workflow changed');
  const compositionProblems = route.strategy.stages.includes('composition') ? validateCurrentCompositionContract(root, invocation) : [];
  if (compositionProblems.length) v.fail(`selected-direction composition: ${compositionProblems.map(f => f.id).join(',')}`);
  const observations = graph.observations.map(r => {
    const value = validateObservationV2(JSON.parse(bytes(root, r).toString('utf8')));
    if (observationV2Sha256(value) !== r.sha256 || value.buildSha256 !== build.buildSha256 || value.currentArtifact.path !== graph.buildIdentity.path || value.currentArtifact.sha256 !== graph.buildIdentity.sha256) v.fail('selected-direction observation/build mismatch');
    return value;
  });
  let predecessor: string | null = null;
  for (const [i, observation] of observations.entries()) { if (observation.predecessorSha256 !== predecessor) v.fail('selected-direction observation chain broken'); predecessor = graph.observations[i]!.sha256; }
  validateFinalBrowserObservations(root, fs, observations.map(o => o.evidence), graph.observations.map(o => o.sha256));
  validateTrustedOutcomeEvidence({ root, invocation, branch: 'art-selected', required: true, observations,
    expected: { routeSha256: adaptiveRouteRecordSha256(route), sourceContractSha256: route.sourceContractSha256, sourceContract: route.sourceContract, buildSha256: build.buildSha256, entrySurfaceRequired: route.gates.includes('greenfield-task-flow-benchmark') } });
  validateFinalV2ContentFitCurrentness({ root, route, ...(graph.contentFit ? { contentFit: graph.contentFit } : {}), observations: observations.map(o => o.evidence) });
  const frame = readFrame(root), product = frame?.uxSurface === 'product' || frame?.uxSurface === 'mixed';
  const task = product ? checkTaskEvidenceAgainstSources(root, readArtifact(root, '.omd/frame.md'), readArtifact(root, '.omd/composition.md')) : null;
  if (task) {
    if (!graph.taskEvidence || graph.taskEvidence.path !== '.omd/task-evidence.json') v.fail('selected product needs native current task evidence');
    bytes(root, graph.taskEvidence!); requireTaskEvidenceProbeAuthorizations(root, task, invocation);
  } else if (graph.taskEvidence) v.fail('non-product selected direction cannot claim task evidence');
  const needsCapture = selected.decision.motion.decision === 'one' || selected.decision.beatIds.length > 0;
  if (needsCapture !== !!graph.directionCapture) v.fail('selected motion/Beats require owned current production capture');
  const captured = graph.directionCapture ? validateSelectedDirectionCapture(root, invocation, graph.directionCapture, { direction: graph.selectedDirection, motion: graph.motionEvidence, beats: graph.renderedBeats }) : null;
  if (captured && task) {
    const boundTask = task.tasks.find(t => t.id === captured.taskId);
    if (!boundTask || boundTask.production.route !== captured.route || !task.snapshot.probes.some(p => {
      const url = new URL(p.target);
      return p.taskId === captured.taskId && ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        && `${url.pathname}${url.search}${url.hash}` === captured.route;
    })) v.fail('selected capture does not bind the actual production task');
  }
  if (selected.decision.motion.decision === 'one') {
    const motion = graph.motionEvidence ?? v.fail('SELECTED_DIRECTION_MOTION_PROOF_REQUIRED');
    if (motion.schema !== 'motion-evidence-v2') v.fail('native motion evidence schema required');
    const motionBytes = bytes(root, motion), value = JSON.parse(motionBytes.toString('utf8'));
    requireMotionCollectorAuthorization(invocation, root, motionBytes);
    const result = validateMotionEvidenceV2(value, { root, invocation, motionDecision: 'one', buildHash: build.buildSha256, artDirectionHash: graph.selectedDirection.sha256,
      route: captured!.route, target: captured!.target, taskId: captured!.taskId });
    const settlement = validateMotionResolutionProjection(JSON.parse(readArtifact(root, selected.decision.motion.settlement!.path).toString('utf8'))), influence = result.observed.sourceInfluence;
    if (influence.kind === 'reference-slot' ? !settlement.slots.some(s => s.slotId === influence.referenceSlotId && s.obligationDisposition === 'used')
      : settlement.approvedRecipe?.recipeId !== influence.recipeId || settlement.approvedRecipe.recipeSha256 !== influence.recipeSha256) v.fail('motion influence is not in the selected independent settlement');
  } else if (graph.motionEvidence) v.fail('static selected direction cannot claim a motion scene');
  if (selected.decision.beatIds.length) {
    const receipt = graph.renderedBeats ?? v.fail('selected Beats need actual native production capture');
    const beat = JSON.parse(bytes(root, receipt).toString('utf8'));
    const result = validateRenderedBeatResultAuthority(beat, { root, invocation, buildSha256: build.buildSha256, artDirectionHash: graph.selectedDirection.sha256, route: captured!.route, target: captured!.target, taskId: captured!.taskId });
    if (result.copyDeckSha256 !== graph.copy.sha256 || validatePostRenderBeatProof('', result, { beatIds: selected.decision.beatIds }).length) v.fail('selected rendered Beats failed');
  } else if (graph.renderedBeats) v.fail('content-led direction must not fabricate Beat evidence');
  if (!productionOnly) validateMeasuredTerminal(root, graph, invocation);
  return { graph, rootHash: digest({ graph }), bindings: { branch: 'selected-direction' as const, activation, buildSha256: build.buildSha256 as string,
    routeSha256: adaptiveRouteRecordSha256(route), claimPublication: route.sourceContract.evidenceClaims, selectedDirectionSha256: graph.selectedDirection.sha256, motionDecision: selected.decision.motion.decision, limitations } };
}
