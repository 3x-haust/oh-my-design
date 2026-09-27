import { existsSync } from 'node:fs';
import { readPiRequest } from '../../extensions/omd-request-source.ts';
import { join } from 'node:path';
import { readPersistedRoute } from '../route/index.ts';
import { parseProcessPolicy, type ProcessPolicy } from '../route/process-policy.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { selectedBaseTokens } from '../tokens/minimal.ts';
import { CANDIDATE_SET_PATH, checkCandidateSet, parseCandidatePreview, type CandidatePreview } from './candidate-plan.ts';
import { buildCandidateReviewPacket, verifyCandidateEyeReview, type CandidateReviewPacket } from './candidate-review.ts';
import { chosenDirectionId, verifyDirectionUserInput, verifyDirectionAutonomyGrant, type DirectionUserInput } from './candidate-authority.ts';
import * as v from './candidate-data.ts';
export const CURRENT_CANDIDATE_PATH = '.omd/.cache/sketches/current.json';
export type CandidateDecision = Readonly<{ decidedBy: 'user'; userMessage: string; userInputReceipt: v.Receipt; displayedSet: v.Receipt }
  | { decidedBy: 'agent'; autonomyGrant: v.Receipt; eyeReview: v.Receipt; reviewIndependence: 'isolated' }>;
export type CandidateSelection = Readonly<{ schema: 'candidate-selection-v2'; candidateSet: v.Receipt; selectedId: string; inputDigest: string; decidedAt: string;
  decision: CandidateDecision; selectedSource: v.Receipt; previews: readonly CandidatePreview[]; effectiveBaseTokensSha256: string }>;
export type CandidatePointerV2 = Readonly<{ schema: 'candidate-selection-pointer-v2'; selection: v.Receipt }>;
export type PendingDirection = Readonly<{ id: string; inputDigest: string; presentedSet: v.Receipt | null; question: string; optionIds: readonly string[]; decisionId: string }>;
export type DirectionState = Readonly<{ selectionStatus: 'missing' | 'awaiting-user' | 'current' | 'stale' | 'skipped' | 'unavailable';
  pending: PendingDirection | null; reason: string | null; selection: CandidateSelection | null }>;
export type PresentedCandidates = Readonly<{ schema: 'candidate-presentation-v1'; candidateSet: v.Receipt; sourceContractSha256: string; inputDigest: string;
  options: readonly { id: string; layoutStrategy: string; tradeoffs: readonly string[]; previews: readonly CandidatePreview[] }[] }>;
type SetPointer = Readonly<{ schema: 'candidate-set-pointer-v2'; candidateSet: v.Receipt; displayedSet: v.Receipt; packet: v.Receipt; aliases: readonly { id: string; alias: string }[] }>;
export function parseCandidatePointerV2(value: unknown): CandidatePointerV2 {
  const p = v.object(value, ['schema', 'selection']); v.enumeration(p.schema, ['candidate-selection-pointer-v2']);
  const selection = v.receipt(p.selection);
  if (selection.path !== `.omd/.cache/sketches/selections/sha256-${selection.sha256}.json`) v.fail('selection must be immutable and content addressed');
  return { schema: 'candidate-selection-pointer-v2', selection };
}
function decision(value: unknown): CandidateDecision {
  const d = v.object(value);
  if (d.decidedBy === 'user') { v.object(d, ['decidedBy', 'userMessage', 'userInputReceipt', 'displayedSet']); return { decidedBy: 'user', userMessage: v.text(d.userMessage), userInputReceipt: v.receipt(d.userInputReceipt), displayedSet: v.receipt(d.displayedSet) }; }
  v.object(d, ['decidedBy', 'autonomyGrant', 'eyeReview', 'reviewIndependence']);
  return { decidedBy: v.enumeration(d.decidedBy, ['agent']), autonomyGrant: v.receipt(d.autonomyGrant), eyeReview: v.receipt(d.eyeReview), reviewIndependence: v.enumeration(d.reviewIndependence, ['isolated']) };
}
export function parseCandidateSelection(value: unknown): CandidateSelection {
  const s = v.object(value, ['schema', 'candidateSet', 'selectedId', 'inputDigest', 'decidedAt', 'decision', 'selectedSource', 'previews', 'effectiveBaseTokensSha256']);
  v.enumeration(s.schema, ['candidate-selection-v2']); const decidedAt = v.text(s.decidedAt);
  if (!/^\d{4}-\d\d-\d\dT/.test(decidedAt) || !Number.isFinite(Date.parse(decidedAt))) v.fail('invalid decision timestamp');
  return { schema: 'candidate-selection-v2', candidateSet: v.receipt(s.candidateSet), selectedId: v.id(s.selectedId), inputDigest: v.sha(s.inputDigest), decidedAt, decision: decision(s.decision), selectedSource: v.receipt(s.selectedSource), previews: v.list(s.previews, parseCandidatePreview), effectiveBaseTokensSha256: v.sha(s.effectiveBaseTokensSha256) };
}
/** Read-only route binding. Mutating entry points additionally require readPersistedRoute authority. */
export function directionRoute(root: string): { sourceContractSha256: string; request: string; processPolicy: ProcessPolicy | undefined; conceptSelected?: boolean } {
  const p = v.object(JSON.parse(v.readBytes(root, '.omd/route-source.json').toString('utf8')), ['schema', 'record', 'sha256']);
  if (p.schema !== 'adaptive-route-source-pointer-v1' || p.record !== `route-sources/sha256-${v.sha(p.sha256)}.json`) v.fail('invalid route source pointer');
  const source = v.object(JSON.parse(v.readReceipt(root, { path: `.omd/${p.record}`, sha256: p.sha256 as string }).toString('utf8')));
  return { sourceContractSha256: p.sha256 as string, request: v.text(source.request), processPolicy: source.processPolicy === undefined ? undefined : parseProcessPolicy(source.processPolicy),
    conceptSelected: v.ids(v.object(source.strategyDecision).methods).includes('concept-exploration') };
}
function setPointer(root: string): SetPointer {
  const p = v.object(JSON.parse(v.readBytes(root, CANDIDATE_SET_PATH).toString('utf8')), ['schema', 'candidateSet', 'displayedSet', 'packet', 'aliases']);
  return { schema: v.enumeration(p.schema, ['candidate-set-pointer-v2']), candidateSet: v.receipt(p.candidateSet), displayedSet: v.receipt(p.displayedSet), packet: v.receipt(p.packet), aliases: v.list(p.aliases, value => { const a = v.object(value, ['id', 'alias']); return { id: v.id(a.id), alias: v.id(a.alias) }; }) };
}
function verifySetPointer(root: string, pointer: SetPointer, checked: ReturnType<typeof checkCandidateSet>): void {
  v.unique(pointer.aliases, a => a.id); v.unique(pointer.aliases, a => a.alias);
  if (v.digest(pointer.aliases.map(a => a.id).sort()) !== v.digest(checked.set.candidates.map(c => c.id).sort())) v.fail('anonymous option mapping must contain exactly the actual candidate IDs');
  for (const [directory, receipt] of [['sets', pointer.candidateSet], ['presentations', pointer.displayedSet], ['packets', pointer.packet]] as const) {
    if (receipt.path !== `.omd/.cache/sketches/${directory}/sha256-${receipt.sha256}.json`) v.fail('candidate evidence must be immutable and content addressed');
  }
  const presentation: PresentedCandidates = { schema: 'candidate-presentation-v1', candidateSet: pointer.candidateSet, sourceContractSha256: checked.plan.sourceContractSha256, inputDigest: checked.inputDigest,
    options: checked.plan.candidates.map(c => ({ id: c.id, layoutStrategy: c.layoutStrategy, tradeoffs: c.tradeoffs, previews: checked.set.candidates.find(s => s.id === c.id)!.previews })) };
  if (v.digest(JSON.parse(v.readReceipt(root, pointer.displayedSet).toString('utf8'))) !== v.digest(presentation)) v.fail('displayed options/previews changed');
  const packet: CandidateReviewPacket = { schema: 'candidate-review-packet-v1', inputDigest: checked.inputDigest,
    task: { surfaceId: checked.plan.representative.surfaceId, stateId: checked.plan.representative.stateId, content: checked.content.units.map(u => u.text), truthBoundary: checked.content.truthBoundary },
    candidates: pointer.aliases.map(a => { const c = checked.set.candidates.find(c => c.id === a.id)!; return { alias: a.alias, previews: c.previews.map(p => ({ renderId: p.renderId, viewId: p.viewId, viewport: p.viewport, png: p.png })) }; }) };
  if (v.digest(JSON.parse(v.readReceipt(root, pointer.packet).toString('utf8'))) !== v.digest(packet)) v.fail('anonymous packet/mapping differs from actual captures');
}
export function pendingDirection(inputDigest: string, displayedSet: v.Receipt | null, optionIds: readonly string[], stale = false): PendingDirection {
  const id = v.digest({ inputDigest, displayedSet, optionIds });
  return { id, inputDigest, presentedSet: displayedSet, optionIds, decisionId: `direction-${id}`, question: stale
    ? 'The selected direction inputs or previews changed. Review the current previews and explicitly choose a direction again.'
    : `Which direction should be developed: ${optionIds.join(', ')}?` };
}
export function publishCandidatePacket(root: string, value: unknown, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation) {
  requireProjectWriteAdapterForInvocation(root, writer, invocation); const unlock = acquireProjectMutationLock(root, invocation);
  try {
    const route = readPersistedRoute(root, invocation);
    if (!route.sourceContract.processPolicy || !route.strategy.methods.includes('concept-exploration')) v.fail('candidate packets require the current concept-exploration route');
    const checked = checkCandidateSet(root, value, route.sourceContractSha256);
    if (existsSync(join(root, CANDIDATE_SET_PATH))) {
      const previous = setPointer(root);
      if (previous.candidateSet.sha256 === v.hash(v.jsonBytes(checked.set))) {
        verifySetPointer(root, previous, checked);
        return { ...previous, pending: route.sourceContract.processPolicy.interactionMode === 'interactive' ? pendingDirection(checked.inputDigest, previous.displayedSet, checked.set.candidates.map(c => c.id)) : null, interactionMode: route.sourceContract.processPolicy.interactionMode };
      }
    }
    const candidateSet = v.publishRecord(writer, '.omd/.cache/sketches/sets', checked.set);
    const presentation: PresentedCandidates = { schema: 'candidate-presentation-v1', candidateSet, sourceContractSha256: route.sourceContractSha256, inputDigest: checked.inputDigest,
      options: checked.plan.candidates.map(c => ({ id: c.id, layoutStrategy: c.layoutStrategy, tradeoffs: c.tradeoffs, previews: checked.set.candidates.find(s => s.id === c.id)!.previews })) };
    const displayedSet = v.publishRecord(writer, '.omd/.cache/sketches/presentations', presentation);
    const blind = buildCandidateReviewPacket(root, checked.set, route.sourceContractSha256), packet = v.publishRecord(writer, '.omd/.cache/sketches/packets', blind.packet);
    const pointer: SetPointer = { schema: 'candidate-set-pointer-v2', candidateSet, displayedSet, packet, aliases: blind.aliases };
    replaceProjectFileAtomically({ projectRoot: root, relativePath: CANDIDATE_SET_PATH, content: v.jsonBytes(pointer), invocation });
    return { ...pointer, pending: route.sourceContract.processPolicy.interactionMode === 'interactive' ? pendingDirection(checked.inputDigest, displayedSet, checked.set.candidates.map(c => c.id)) : null, interactionMode: route.sourceContract.processPolicy.interactionMode };
  } finally { unlock(); }
}
function verifyDecision(root: string, choice: CandidateSelection, route: ReturnType<typeof directionRoute>, pointer: SetPointer, observation?: DirectionUserInput, publishing = false): void {
  const options = pointer.aliases.map(a => a.id);
  if (!options.includes(choice.selectedId)) v.fail('selectedId is not one of the displayed directions');
  if (choice.decision.decidedBy === 'user') {
    if (route.processPolicy?.interactionMode !== 'interactive') v.fail('user direction branch requires an interactive route');
    const d = choice.decision, input = verifyDirectionUserInput(root, observation ?? JSON.parse(v.readReceipt(root, d.userInputReceipt).toString('utf8')));
    if (publishing && input.source !== 'host-user-input') {
      const source = readPiRequest(root);
      if (!source || source.workflow?.status === 'cancelled' || source.recordSha256 !== input.resumeAuthority?.sha256) v.fail('Pi direction input no longer has its original full-workflow/resume authority');
    }
    if (v.hash(v.jsonBytes(input)) !== d.userInputReceipt.sha256 || d.userInputReceipt.path !== `.omd/.cache/sketches/authority/sha256-${d.userInputReceipt.sha256}.json`
      || input.userMessage !== d.userMessage || chosenDirectionId(input.userMessage, options) !== choice.selectedId
      || input.sourceContractSha256 !== route.sourceContractSha256 || input.requestSha256 !== v.hash(route.request)
      || input.inputDigest !== choice.inputDigest || v.digest(input.displayedSet) !== v.digest(d.displayedSet)
      || v.digest(d.displayedSet) !== v.digest(pointer.displayedSet)
      || input.pendingId !== pendingDirection(choice.inputDigest, pointer.displayedSet, options).id) v.fail('stale, ambiguous or forged user direction input; preserve the current pointer');
    const presented = v.object(JSON.parse(v.readReceipt(root, d.displayedSet).toString('utf8')));
    if (presented.inputDigest !== choice.inputDigest || v.digest(presented.candidateSet) !== v.digest(choice.candidateSet)) v.fail('choice was not bound to these displayed previews');
  } else {
    const d = choice.decision;
    if (route.processPolicy?.interactionMode !== 'autonomous' || v.digest(d.autonomyGrant) !== v.digest(route.processPolicy.autonomyGrant)) v.fail('interactive Eye cannot choose for the user');
    verifyDirectionAutonomyGrant(root, d.autonomyGrant, route.request);
    const packet = JSON.parse(v.readReceipt(root, pointer.packet).toString('utf8')) as CandidateReviewPacket;
    if (packet.inputDigest !== choice.inputDigest) v.fail('blind packet is stale');
    const reviewed = verifyCandidateEyeReview(root, d.eyeReview, packet, pointer.packet);
    if (pointer.aliases.find(a => a.alias === reviewed.winner)?.id !== choice.selectedId) v.fail('selected direction differs from the isolated Eye winner');
  }
}
export function checkCandidateSelection(root: string, pointer: CandidatePointerV2): CandidateSelection {
  const choice = parseCandidateSelection(JSON.parse(v.readReceipt(root, pointer.selection).toString('utf8'))), route = directionRoute(root), current = setPointer(root);
  if (v.digest(choice.candidateSet) !== v.digest(current.candidateSet)) v.fail('selection candidate set changed');
  const checked = checkCandidateSet(root, JSON.parse(v.readReceipt(root, choice.candidateSet).toString('utf8')), route.sourceContractSha256);
  verifySetPointer(root, current, checked);
  const selected = checked.set.candidates.find(c => c.id === choice.selectedId);
  if (!selected || choice.inputDigest !== checked.inputDigest || v.digest(choice.selectedSource) !== v.digest(selected.source)
    || v.digest(choice.previews) !== v.digest(selected.previews) || choice.effectiveBaseTokensSha256 !== selected.effectiveTokensSha256) v.fail('selected direction inputs/previews changed');
  verifyDecision(root, choice, route, current);
  return choice;
}
export function publishCandidateSelection(root: string, value: unknown, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation): CandidatePointerV2 {
  requireProjectWriteAdapterForInvocation(root, writer, invocation); const unlock = acquireProjectMutationLock(root, invocation);
  try {
    const input = v.object(value), inline = Object.hasOwn(input, 'userInputObservation');
    v.object(input, ['schema', 'candidateSet', 'selectedId', 'inputDigest', 'decision', ...(inline ? ['userInputObservation'] : [])]); v.enumeration(input.schema, ['candidate-selection-input-v2']);
    const route = readPersistedRoute(root, invocation), pointer = setPointer(root), candidateSet = v.receipt(input.candidateSet);
    if (v.digest(candidateSet) !== v.digest(pointer.candidateSet)) v.fail('candidate selection must bind the current displayed set');
    const checked = checkCandidateSet(root, JSON.parse(v.readReceipt(root, candidateSet).toString('utf8')), route.sourceContractSha256), selectedId = v.id(input.selectedId), selected = checked.set.candidates.find(c => c.id === selectedId);
    verifySetPointer(root, pointer, checked);
    if (!selected || input.inputDigest !== checked.inputDigest) v.fail('wrong option or stale displayed input digest');
    const choice: CandidateSelection = { schema: 'candidate-selection-v2', candidateSet, selectedId, inputDigest: checked.inputDigest, decidedAt: new Date().toISOString(), decision: decision(input.decision), selectedSource: selected.source, previews: selected.previews, effectiveBaseTokensSha256: selected.effectiveTokensSha256 };
    const observation = inline ? verifyDirectionUserInput(root, input.userInputObservation) : undefined;
    verifyDecision(root, choice, { request: route.request, sourceContractSha256: route.sourceContractSha256, processPolicy: route.sourceContract.processPolicy }, pointer, observation, true);
    // Every refusal above is read-only. Only a verified observation and complete set can advance.
    if (observation) v.publishRecord(writer, '.omd/.cache/sketches/authority', observation);
    const selection = v.publishRecord(writer, '.omd/.cache/sketches/selections', choice), result: CandidatePointerV2 = { schema: 'candidate-selection-pointer-v2', selection };
    replaceProjectFileAtomically({ projectRoot: root, relativePath: CURRENT_CANDIDATE_PATH, content: v.jsonBytes(result), invocation });
    return result;
  } finally { unlock(); }
}
export function readCurrentCandidateSelection(root: string): CandidateSelection {
  return checkCandidateSelection(root, parseCandidatePointerV2(JSON.parse(v.readBytes(root, CURRENT_CANDIDATE_PATH).toString('utf8'))));
}
export function candidateDirectionState(root: string): DirectionState {
  const route = directionRoute(root);
  if (!route.processPolicy || route.conceptSelected === false) return { selectionStatus: 'skipped', pending: null, reason: 'legacy process or explicitly skipped concept exploration', selection: null };
  const hasSelection = existsSync(join(root, CURRENT_CANDIDATE_PATH)), hasSet = existsSync(join(root, CANDIDATE_SET_PATH));
  if (!hasSet && !hasSelection) return { selectionStatus: 'missing', pending: null, reason: 'No viable candidate set; exploration remains confidence debt, not approval.', selection: null };
  let stale: string | null = null;
  if (hasSelection) {
    try { const selection = readCurrentCandidateSelection(root); return { selectionStatus: 'current', pending: null, reason: null, selection }; }
    catch (error) { stale = error instanceof Error ? error.message : String(error); }
  }
  try {
    const pointer = setPointer(root), checked = checkCandidateSet(root, JSON.parse(v.readReceipt(root, pointer.candidateSet).toString('utf8')), route.sourceContractSha256);
    verifySetPointer(root, pointer, checked);
    return { selectionStatus: stale ? 'stale' : route.processPolicy.interactionMode === 'interactive' ? 'awaiting-user' : 'missing',
      pending: route.processPolicy.interactionMode === 'interactive' ? pendingDirection(checked.inputDigest, pointer.displayedSet, checked.set.candidates.map(c => c.id), stale !== null) : null, reason: stale, selection: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // A published set was already ready. Breaking its bytes cannot revoke the user's checkpoint
    // and turn it back into ordinary missing-research debt.
    return { selectionStatus: 'stale', pending: route.processPolicy.interactionMode === 'interactive'
      ? pendingDirection(v.digest({ source: route.sourceContractSha256, reason }), null, [], true) : null, reason, selection: null };
  }
}
export function selectedCandidateBase(root: string, selection: CandidateSelection) {
  const route = directionRoute(root), checked = checkCandidateSet(root, JSON.parse(v.readReceipt(root, selection.candidateSet).toString('utf8')), route.sourceContractSha256);
  return selectedBaseTokens(checked.seed, checked.plan.candidates.find(c => c.id === selection.selectedId)!.primitiveOverrides);
}
export function directionCommitmentBlocker(root: string): string | null {
  if (!existsSync(join(root, '.omd/route-source.json'))) return null;
  const state = candidateDirectionState(root);
  return state.pending ? `NEEDS_USER_DIRECTION: ${state.pending.question}` : state.selectionStatus === 'stale' ? `STALE_DIRECTION: ${state.reason}` : null;
}
export function directionPresentation(root: string, pending: PendingDirection): PresentedCandidates | null {
  return pending.presentedSet === null ? null : JSON.parse(v.readReceipt(root, pending.presentedSet).toString('utf8')) as PresentedCandidates;
}
