import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../route/adaptive-route-persistence.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { requireEvaluatorAssessmentAuthorization, requireEvaluatorResultAuthorization } from '../runtime/invocation.ts';
import { directionCommitmentBlocker } from '../brief/candidate-choice.ts';
import { readSelectedArtDirection } from '../art-direction/selected.ts';
import { currentSelectedSystem } from '../measure/selected-system.ts';
import { assertRepresentativeTokenAssignments } from '../tokens/resolve.ts';
import { validateTokenCommit } from '../tokens/contract.ts';
import { readFrame } from '../frame/index.ts';
import { requiredSurfaceCells } from '../frame/process-plan.ts';
import { checkExpansionContract } from '../brief/expansion.ts';
import { checkAllSurfaceContentProofs, checkSurfaceCoverage, parseSurfaceMappings, parseSurfaceReview, SURFACE_REVIEW_CRITERIA, type SurfaceCapture } from '../brief/surface-coverage.ts';
import { loadMeasurement } from '../measure/files.ts';
import { currentRefinementBinding } from '../runtime/trusted-refinement.ts';
import { SELECTED_DIRECTION_EVIDENCE_PATH, validateSelectedDirectionCapture } from '../runtime/trusted-selected-direction-capture.ts';
import { decodePng } from '../motion/energy.ts';
import { measurementProjection } from '../measure/projection.ts';
import * as v from '../brief/candidate-data.ts';

export const SURFACE_CAPTURE_INPUT_PATH = '.omd/surface-captures.json';
const cellKey = (cell: { surfaceId: string; stateId: string; viewId: string }) => JSON.stringify([cell.surfaceId, cell.stateId, cell.viewId]);
/** Authenticated owner/process facts; no caller booleans, scores or inferred approvals. */
export function loadTerminalProcess(root: string, invocation: ProjectRunInvocation, observations: readonly string[]) {
  const route = readPersistedRoute(root, invocation);
  if (!route.sourceContract.processPolicy) return null;
  const blocked = directionCommitmentBlocker(root); if (blocked) v.fail(blocked);
  const system = currentSelectedSystem(root);
  if (route.strategy.methods.includes('concept-exploration') && !system) v.fail('current process requires its authenticated selected direction');
  const art = route.strategy.stages.includes('art-direction') ? readSelectedArtDirection(root, route.sourceContractSha256) : null;
  const artPointer = art ? v.object(JSON.parse(v.readBytes(root, '.omd/art-direction.json').toString('utf8'))) : null;
  const direction = art ? { pointer: v.fileReceipt(root, '.omd/art-direction.json'), record: v.receipt(artPointer!.record), candidateSelection: art.decision.candidateSelection } : null;
  if (art?.decision.motion.evaluatorAssessment) {
    requireEvaluatorAssessmentAuthorization(invocation, root, v.readReceipt(root, art.decision.motion.evaluatorAssessment));
    requireEvaluatorResultAuthorization(invocation, root, v.readReceipt(root, art.decision.motion.evaluatorResult!));
  }
  const seed = existsSync(resolve(root, '.omd/tokens.json')) ? validateTokenCommit(JSON.parse(v.readBytes(root, '.omd/tokens.json').toString('utf8'))) : null;
  const tokens = system ? { receipts: system.receipts, baseTokensSha256: system.tokens.baseTokensSha256, effectiveTokensSha256: system.tokens.effectiveTokensSha256 }
    : seed ? { receipts: [v.fileReceipt(root, '.omd/tokens.json')], baseTokensSha256: v.digest(seed), effectiveTokensSha256: v.digest(seed) } : null;
  const frame = route.strategy.stages.includes('frame') ? readFrame(root) : null;
  if (route.strategy.stages.includes('frame') && !frame?.surfacePlan) v.fail('current selected Frame requires native surface coverage');
  const plan = frame?.surfacePlan;
  let surface: null | { input: v.Receipt; composition: v.Receipt | null; contentProofs: v.Receipt[]; measurements: v.Receipt[] } = null;
  const surfaceRows: ReturnType<typeof parseSurfaceReview>['rows'][number][] = [], supplementalRenders: Record<string, unknown>[] = [], projections: ReturnType<typeof measurementProjection>[] = [];
  let mappings: ReturnType<typeof checkExpansionContract>['cells'] = [];
  if (plan) {
    const composition = route.strategy.stages.includes('composition') ? v.fileReceipt(root, '.omd/composition.md') : null;
    const effective = system?.tokens.effective ?? seed;
    const roles = effective?.schema === 'token-commit-v3' ? [...Object.keys(effective.semantic), ...Object.keys(effective.textStyles),
      ...Object.keys(effective.semantic).map(k => `semantic.${k}`), ...Object.keys(effective.textStyles).map(k => `textStyles.${k}`)] : [];
    const inputReceipt = v.fileReceipt(root, SURFACE_CAPTURE_INPUT_PATH);
    const input = v.object(JSON.parse(v.readReceipt(root, inputReceipt).toString('utf8')), ['schema', 'captures', 'contentProofs', ...(composition ? [] : ['mappings'])]);
    v.enumeration(input.schema, ['surface-capture-inventory-v1']);
    if (!composition && !route.strategy.skips.some(s => s.id === 'composition')) v.fail('surface mapping has no composition owner or authorized applicability skip');
    mappings = composition ? checkExpansionContract(v.readReceipt(root, composition).toString('utf8'), plan, roles).cells : parseSurfaceMappings(input.mappings);
    v.unique(mappings, cellKey);
    if (v.digest(mappings.map(cellKey).sort()) !== v.digest(requiredSurfaceCells(plan).map(cellKey).sort())) v.fail('surface mappings must cover exactly the current Frame cells');
    const captures: SurfaceCapture[] = v.list(input.captures, value => { const x = v.object(value, ['surfaceId', 'stateId', 'viewId', 'packet', 'capture']);
      return { surfaceId: v.id(x.surfaceId), stateId: v.id(x.stateId), viewId: v.id(x.viewId), packet: v.receipt(x.packet), capture: v.receipt(x.capture) }; });
    v.unique(captures, cellKey);
    if (v.digest(captures.map(cellKey).sort()) !== v.digest(requiredSurfaceCells(plan).map(cellKey).sort())) v.fail('surface captures must cover every required Frame cell exactly once');
    const identities = new Set<string>(), packets = new Map<string, ReturnType<typeof loadMeasurement>>();
    for (const row of captures) {
      const packet = packets.get(row.packet.sha256) ?? loadMeasurement(root, row.packet); packets.set(row.packet.sha256, packet);
      const mapping = mappings.find(m => cellKey(m) === cellKey(row))!;
      const captureViewId = Reflect.get(mapping, 'measurementViewId') ?? row.viewId;
      const view = packet.scope.find(s => s.id === captureViewId), capture = packet.captures.find(c => c.viewId === captureViewId), dimensions = plan.views.find(v => v.id === row.viewId)!;
      if (!view || !capture || view.route !== mapping.route || view.state !== mapping.state || view.stateRecipeSha256 !== mapping.stateRecipeSha256
        || view.viewport.width !== dimensions.width || view.viewport.height !== dimensions.height || v.digest(capture.capture) !== v.digest(row.capture)
        || packet.binding.routeSha256 !== adaptiveRouteRecordSha256(route) || packet.binding.sourceContractSha256 !== route.sourceContractSha256 || packet.binding.activationBuildSha256 !== invocation.current.buildSha256
        || packet.summary.deterministicVerdict !== 'PASS') v.fail('surface capture is not the actual current native mapped view/state');
      const identity = `${row.packet.sha256}:${view.id}`; if (identities.has(identity)) v.fail('one capture cannot stand in for another surface/state'); identities.add(identity);
      const metrics = packet.measurements.filter(m => m.viewIds.includes(view.id));
      if (metrics.some(m => m.coverage.status !== 'complete')) v.fail('surface measurement inventory is incomplete');
      if (system && row.surfaceId === system.representative.surfaceId && row.stateId === system.representative.stateId) {
        const raw = JSON.parse(v.readReceipt(root, capture.ir).toString('utf8')) as { measurement: { nodes: { contentId?: string | null; textStyleId?: string | null; text: string; visibleBox: unknown }[] } };
        const observed: Record<string, string> = {};
        for (const n of raw.measurement.nodes.filter(n => n.text.trim() && n.contentId)) {
          if (observed[n.contentId!] !== undefined && observed[n.contentId!] !== n.textStyleId) v.fail('representative token role is ambiguous');
          observed[n.contentId!] = n.textStyleId ?? '';
        }
        assertRepresentativeTokenAssignments(system.assignments, observed);
      }
      surfaceRows.push({ ...row, measurementIds: metrics.map(m => m.id), criteria: Object.fromEntries(SURFACE_REVIEW_CRITERIA.map(k => [k, 'unassessed'])) as ReturnType<typeof parseSurfaceReview>['rows'][number]['criteria'] });
      supplementalRenders.push({ surfaceId: row.surfaceId, stateId: row.stateId, viewId: row.viewId, measurementViewId: view.id, state: view.state, browserZoom: view.browserZoom,
        packetSha256: row.packet.sha256, captureSha256: capture.capture.sha256, width: capture.image.width, height: capture.image.height, pngBase64: v.readReceipt(root, capture.capture).toString('base64') });
    }
    for (const [sha, packet] of packets) projections.push(measurementProjection(packet, sha));
    const contentProofs = v.list(input.contentProofs, v.receipt);
    if (plan.surfaces.some(s => s.contentCases.length) && !tokens) v.fail('content stress needs the actual current token system');
    const proofs = checkAllSurfaceContentProofs(root, plan, contentProofs.map(r => JSON.parse(v.readReceipt(root, r).toString('utf8'))),
      { selectedDirectionSha256: direction?.record.sha256 ?? route.sourceContractSha256, effectiveTokensSha256: tokens?.effectiveTokensSha256 ?? route.sourceContractSha256 });
    for (const proof of proofs) {
      const normal = captures.find(c => c.surfaceId === proof.surfaceId && c.viewId === proof.viewId && v.digest(c.packet) === v.digest(proof.normalPacket));
      if (!normal) v.fail('stress proof must compare against a reviewed normal capture for its surface/view');
      const packet = loadMeasurement(root, proof.packet), capture = packet.captures.find(c => c.capture.sha256 === proof.capture.sha256)!;
      if (packet.binding.sourceContractSha256 !== route.sourceContractSha256 || packet.binding.activationBuildSha256 !== invocation.current.buildSha256) v.fail('stress proof belongs to another source contract/tool build');
      projections.push(measurementProjection(packet, proof.packet.sha256));
      supplementalRenders.push({ surfaceId: proof.surfaceId, stateId: proof.stateId, caseId: proof.caseId, viewId: proof.viewId, packetSha256: proof.packet.sha256,
        captureSha256: capture.capture.sha256, width: capture.image.width, height: capture.image.height, pngBase64: v.readReceipt(root, capture.capture).toString('base64') });
    }
    surface = { input: inputReceipt, composition, contentProofs, measurements: [...new Map([...captures.map(c => c.packet), ...proofs.map(p => p.packet)].map(r => [r.sha256, r])).values()] };
  }
  let directionCapture: v.Receipt | null = null;
  if (art && (art.decision.motion.decision === 'one' || art.decision.beatIds.length)) {
    const extra = v.object(JSON.parse(v.readBytes(root, SELECTED_DIRECTION_EVIDENCE_PATH).toString('utf8')), ['schema', 'capture', 'motion', 'beats']);
    v.enumeration(extra.schema, ['selected-direction-native-evidence-v1']);
    directionCapture = v.receipt(extra.capture);
    const motion = v.nullableReceipt(extra.motion), beats = v.nullableReceipt(extra.beats);
    validateSelectedDirectionCapture(root, invocation, directionCapture, { direction: direction!.record, ...(motion ? { motion } : {}), ...(beats ? { beats } : {}) });
    const addImage = (kind: string, stage: string, capture: v.Receipt) => {
      const bytes = v.readReceipt(root, capture), image = decodePng(bytes);
      supplementalRenders.push({ kind, stage, captureSha256: capture.sha256, width: image.width, height: image.height, pngBase64: bytes.toString('base64') });
    };
    if (motion) {
      const result = JSON.parse(v.readReceipt(root, motion).toString('utf8')) as import('../render/index.ts').MotionEvidenceV2;
      for (const stage of ['start', 'mid', 'end', 'reducedMotion'] as const) addImage('native-selected-motion', stage, result.scenes[0]![stage].capture);
    }
    if (beats) {
      const result = JSON.parse(v.readReceipt(root, beats).toString('utf8')) as import('../render/index.ts').RenderedBeatResult;
      for (const capture of result.captures ?? v.fail('native Beat captures missing')) addImage('native-selected-beats', `${capture.viewport.width}x${capture.viewport.height}`, capture);
    }
  }
  const binding = { schema: 'terminal-process-binding-v1' as const, routeSha256: adaptiveRouteRecordSha256(route), direction, directionCapture, tokens,
    frame: plan ? v.fileReceipt(root, '.omd/frame.md') : null, surface, refinement: currentRefinementBinding(root, invocation, observations) };
  return { binding, plan, mappings, surfaceRows, supplementalRenders, projections, art };
}
export type TerminalProcessBinding = NonNullable<ReturnType<typeof loadTerminalProcess>>['binding'];
export function checkTerminalSurfaceReview(root: string, invocation: ProjectRunInvocation, process: NonNullable<ReturnType<typeof loadTerminalProcess>>, receipt: v.Receipt) {
  if (!process.plan) v.fail('surface review has no selected current Frame scope');
  return checkSurfaceCoverage(root, process.plan!, process.mappings, receipt, invocation);
}
