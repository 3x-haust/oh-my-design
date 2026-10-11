import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readSelectedArtDirection } from '../art-direction/selected.ts';
import { loadMeasurement } from '../measure/files.ts';
import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../route/adaptive-route-persistence.ts';
import { serveProjectEntry, servedProjectTreeSha256 } from '../render/serve.ts';
import { captureMotionEvidenceV2, captureRenderedBeatReceipt, type MotionSourceInfluence } from '../render/index.ts';
import { validateMotionResolutionProjection } from '../ref/reference-selection.ts';
import { parseTrustedOutcomeProjection } from '../evidence/final-v2-outcome-gate.ts';
import { loadMeasuredObservationBindings } from '../evidence/final-v2-browser-observations.ts';
import { parseTrustedBrowserReceipt } from './trusted-browser-receipt.ts';
import { readCurrentObservationV2, observationV2Sha256 } from './observation.ts';
import { authorizeNativePiPayload, getNativePiRun } from './native-pi-run.ts';
import { signNativeObservation, verifyNativeObservation } from './self-signed-activation.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from './project-write.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import * as v from '../brief/candidate-data.ts';

const SCHEMA = 'selected-direction-capture-v1';
export const SELECTED_DIRECTION_EVIDENCE_PATH = '.omd/selected-direction-evidence.json';
function methodSha256(): string {
  return v.digest(['./trusted-selected-direction-capture.ts', '../render/index.ts', '../ir/dom.ts', '../ref/browser-security.ts'].map(path => ({ path, sha256: v.hash(readFileSync(new URL(path, import.meta.url))) })));
}
function currentSource(root: string, invocation: ProjectRunInvocation) {
  const route = readPersistedRoute(root, invocation), art = readSelectedArtDirection(root, route.sourceContractSha256);
  const pointer = v.object(JSON.parse(v.readBytes(root, '.omd/art-direction.json').toString('utf8')), ['schemaVersion', 'record']);
  const direction = v.receipt(pointer.record), observation = readCurrentObservationV2(root) ?? v.fail('current measured production observation required');
  const observationSha256 = observationV2Sha256(observation);
  const bindings = loadMeasuredObservationBindings(root, invocation, [observationSha256]);
  const packet = loadMeasurement(root, bindings[0]!.measurement.packet);
  const initial = packet.scope.find(s => s.state === 'initial' && s.browserZoom === 1 && s.viewport.width === 1280 && s.viewport.height === 900)!;
  const outcome = parseTrustedOutcomeProjection(v.object(observation.evidence).trustedOutcome);
  const receipt = parseTrustedBrowserReceipt(JSON.parse(v.readBytes(root, `.omd/trusted-browser-receipt-sha256-${outcome.receiptSha256}.json`).toString('utf8')));
  return { route, art, direction, observationSha256, receipt, productionRoute: initial.route, productionRoutes: new Set(packet.scope.map(s => s.route)) };
}
function sameReceipt(a: v.Receipt | null, b: v.Receipt | undefined): boolean {
  return a === null ? b === undefined : !!b && a.path === b.path && a.sha256 === b.sha256;
}
/** A generic localhost collector result is not current production authority. This signed binding
 * is issued only around owned, immutable local serving and network-confined native capture. */
export function validateSelectedDirectionCapture(root: string, invocation: ProjectRunInvocation, receipt: v.Receipt, expected: { direction: v.Receipt; motion?: v.Receipt | undefined; beats?: v.Receipt | undefined }) {
  if (receipt.path !== `.omd/selected-direction-captures/sha256-${receipt.sha256}.json`) v.fail('immutable selected capture binding required');
  const record = v.object(JSON.parse(v.readReceipt(root, receipt).toString('utf8')), ['schema', 'projectIdentitySha256', 'methodSha256', 'routeSha256', 'sourceContractSha256', 'activationBuildSha256', 'selectedDirection', 'observationSha256', 'entry', 'productionRevisionSha256', 'target', 'route', 'taskId', 'motion', 'beats', 'signature']);
  const { signature, ...payload } = record;
  if (record.schema !== SCHEMA || !verifyNativeObservation(realpathSync(root), SCHEMA, v.digest(payload), v.text(signature))) v.fail('selected production capture is not native');
  const current = currentSource(root, invocation), direction = v.receipt(record.selectedDirection), motion = v.nullableReceipt(record.motion), beats = v.nullableReceipt(record.beats);
  const entry = v.path(record.entry), target = v.text(record.target), route = v.text(record.route), taskId = v.text(record.taskId), url = new URL(target);
  if (record.projectIdentitySha256 !== v.digest(realpathSync(root)) || record.methodSha256 !== methodSha256()
    || record.routeSha256 !== adaptiveRouteRecordSha256(current.route) || record.sourceContractSha256 !== current.route.sourceContractSha256
    || record.activationBuildSha256 !== invocation.current.buildSha256 || record.observationSha256 !== current.observationSha256) v.fail('selected production capture identity changed');
  if (!sameReceipt(direction, expected.direction) || v.digest(direction) !== v.digest(current.direction)) v.fail('selected production capture direction changed');
  if (entry !== current.receipt.productionPath || record.productionRevisionSha256 !== current.receipt.productionRevisionSha256
    || record.productionRevisionSha256 !== servedProjectTreeSha256(root, entry)) v.fail('selected production capture source changed');
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || `${url.pathname}${url.search}${url.hash}` !== route
    || !current.productionRoutes.has(route)) v.fail('selected production capture target changed');
  if (!sameReceipt(motion, expected.motion) || !sameReceipt(beats, expected.beats)) v.fail('selected production capture receipts changed');
  for (const artifact of [motion, beats]) if (artifact) v.readReceipt(root, artifact);
  return { entry, target, route, taskId, motion, beats };
}

/** Native Pi entry point: no caller URL, art hash, measurements, approvals, or prebuilt receipts. */
export async function captureNativeSelectedDirection(input: { root: string; invocation: ProjectRunInvocation; writer: ProjectWriteAdapter; taskId: string; route?: string; motion?: { selector: string; referenceSlotId?: string; viewport?: { width: number; height: number } } }) {
  const { root, invocation, writer } = input;
  getNativePiRun(invocation, root); requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const current = currentSource(root, invocation), wantsMotion = current.art.decision.motion.decision === 'one', wantsBeats = current.art.decision.beatIds.length > 0;
  if (!wantsMotion && !wantsBeats) v.fail('selected direction has no motion or Beat capture obligation');
  if (wantsMotion !== !!input.motion) v.fail('motion capture options must match the selected obligation');
  const taskId = v.text(input.taskId), entry = current.receipt.productionPath, route = input.route ?? current.productionRoute;
  if (!current.productionRoutes.has(route)) v.fail('selected capture route has no current native production observation');
  const served = await serveProjectEntry(root, entry, { spa: true }), localOrigin = new URL(served.url).origin, target = `${localOrigin}${route}`;
  const runId = randomUUID(), directory = `.omd/selected-direction-captures/${runId}`;
  let motion: v.Receipt | null = null, beats: v.Receipt | null = null;
  try {
    writer.mkdir(directory);
    if (served.productionRevisionSha256 !== current.receipt.productionRevisionSha256) v.fail('production source changed before selected capture');
    if (input.motion) {
      const settlement = validateMotionResolutionProjection(JSON.parse(v.readReceipt(root, current.art.decision.motion.settlement!).toString('utf8')));
      const influence: MotionSourceInfluence = settlement.approvedRecipe ? { kind: 'approved-recipe', recipeId: settlement.approvedRecipe.recipeId, recipeSha256: settlement.approvedRecipe.recipeSha256 }
        : { kind: 'reference-slot', referenceSlotId: v.text(input.motion.referenceSlotId) };
      if (influence.kind === 'reference-slot' && !settlement.slots.some(s => s.slotId === influence.referenceSlotId && s.obligationDisposition === 'used')) v.fail('motion reference was not independently settled');
      const result = await captureMotionEvidenceV2(target, { viewport: input.motion.viewport ?? { width: 390, height: 844 }, outDir: resolve(root, directory), runId,
        buildHash: invocation.current.buildSha256, artDirectionHash: current.direction.sha256, route, taskId, invocation, sourceInfluence: influence, selector: v.text(input.motion.selector), adapter: writer, trigger: 'load', localOrigin });
      const bytes = Buffer.from(v.jsonBytes(result)); motion = v.publishRecord(writer, '.omd/selected-direction-captures', result);
      authorizeNativePiPayload(invocation, root, 'motion-evidence', bytes); authorizeNativePiPayload(invocation, root, 'motion-result', bytes);
    }
    if (wantsBeats) {
      const result = await captureRenderedBeatReceipt(target, { adapter: writer, out: resolve(root, directory, 'beats.json'), artDirectionHash: current.direction.sha256,
        copyDeckSha256: v.hash(v.readBytes(root, '.omd/copy-deck.md')), beatIds: current.art.decision.beatIds, buildSha256: invocation.current.buildSha256, route, taskId, invocation, localOrigin });
      beats = v.publishRecord(writer, '.omd/selected-direction-captures', result);
      authorizeNativePiPayload(invocation, root, 'rendered-beat-result', Buffer.from(v.jsonBytes(result)));
    }
    const unlock = acquireProjectMutationLock(root, invocation);
    try {
      served.assertSourceCurrent();
      const payload = { schema: SCHEMA, projectIdentitySha256: v.digest(realpathSync(root)), methodSha256: methodSha256(), routeSha256: adaptiveRouteRecordSha256(current.route),
        sourceContractSha256: current.route.sourceContractSha256, activationBuildSha256: invocation.current.buildSha256, selectedDirection: current.direction,
        observationSha256: current.observationSha256, entry, productionRevisionSha256: served.productionRevisionSha256, target, route, taskId, motion, beats };
      const capture = v.publishRecord(writer, '.omd/selected-direction-captures', { ...payload, signature: signNativeObservation(realpathSync(root), SCHEMA, v.digest(payload)) });
      validateSelectedDirectionCapture(root, invocation, capture, { direction: current.direction, ...(motion ? { motion } : {}), ...(beats ? { beats } : {}) });
      const result = { schema: 'selected-direction-native-evidence-v1', capture, motion, beats };
      replaceProjectFileAtomically({ projectRoot: root, relativePath: SELECTED_DIRECTION_EVIDENCE_PATH, content: v.jsonBytes(result), invocation });
      return result;
    } finally { unlock(); }
  } finally { await served.close(); }
}
