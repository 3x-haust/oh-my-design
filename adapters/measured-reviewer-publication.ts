import { verifySignedEyeRoleResult, type FinalReviewerPublication } from './final-reviewer-publication.ts';
import { finalRenderReviewerPacket, FINAL_RENDER_REVIEWER_TASK } from '../core/runtime/final-render-review.ts';
import { nativeFinalLanePacket, nativeFinalLaneTask } from '../core/runtime/native-final-packet.ts';
import { MEASURED_REVIEW_HANDBACK } from '../core/runtime/trusted-measured-review.ts';
import { loadReviewPolicy } from '../core/measure/review-policy.ts';
import { canonicalBytes, digest, sha256 } from '../core/measure/identity.ts';
import { loadMeasuredQualityContext } from '../core/evidence/final-v2-measurement.ts';
import { aggregateMeasuredDesignQuality, assertMeasuredDesignQualityGreen } from '../core/evidence/final-v2-measured-quality.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import type { Receipt } from '../core/measure/types.ts';
import * as v from '../core/measure/validation.ts';
import { getNativePiRun } from '../core/runtime/native-pi-run.ts';
import { measuredReviewerTask } from '../core/runtime/trusted-review-profile.ts';
import { loadTerminalProcess } from '../core/evidence/final-v2-process.ts';
import { parseSurfaceReview, joinSurfaceCoverage } from '../core/brief/surface-coverage.ts';
import { loadMeasurement } from '../core/measure/files.ts';

export type MeasuredLane = 'blindLane' | 'fidelityLane' | 'protocolLane';
export const policyLane = (lane: MeasuredLane) => ({ blindLane: 'blind', fidelityLane: 'fidelity', protocolLane: 'protocol' } as const)[lane];
export function measuredLanePacket(root: string, invocation: ProjectRunInvocation, observations: readonly string[], lane: MeasuredLane): Buffer {
  return lane === 'blindLane' ? finalRenderReviewerPacket({ root, invocation, packetInput: { schema: 'adaptive-final-render-reviewer-packet-input-v1', observationSha256s: observations } })
    : nativeFinalLanePacket({ root, invocation, observationSha256s: observations, lane });
}
type Output = { schema: string; lane: MeasuredLane; laneSchema: string; verdictKeys: string[]; criticalFloorKeys: string[]; reviewerFields: string[];
  fixedBindings: { observationSha256s: string[]; measurements: Receipt[]; reviewPolicySha256: string; [key: string]: unknown } };
export function parseMeasuredHandback(root: string, invocation: ProjectRunInvocation, input: unknown, packetBytes: Buffer, lane: MeasuredLane) {
  const packet = JSON.parse(packetBytes.toString('utf8')) as { evidenceSha256: string; outputContract: Output };
  const output = packet.outputContract;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return v.fail('measured reviewer handback required');
  const handback = input as Record<string, unknown>;
  if (Object.keys(handback).sort().join('\0') !== [...output.reviewerFields].sort().join('\0') || handback.schema !== MEASURED_REVIEW_HANDBACK || handback.lane !== lane
    || output.schema !== MEASURED_REVIEW_HANDBACK || output.lane !== lane) v.fail('measured reviewer handback contract mismatch');
  for (const [key, value] of Object.entries(output.fixedBindings)) if (digest(handback[key]) !== digest(value)) v.fail(`measured reviewer binding changed: ${key}`);
  v.object(Object.fromEntries(output.verdictKeys.map(key => [key, v.enumeration('GREEN')])))(handback.verdicts);
  v.object(Object.fromEntries(output.criticalFloorKeys.map(key => [key, v.enumeration(3, 4)])))(handback.criticalFloors);
  v.array(v.text)(handback.findings);
  const context = loadMeasuredQualityContext(root, invocation, output.fixedBindings.measurements, output.fixedBindings.observationSha256s);
  const quality = lane === 'blindLane' ? assertMeasuredDesignQualityGreen(handback.designQuality, context) : undefined;
  const floors = handback.criticalFloors as Record<string, number>;
  const process = loadTerminalProcess(root, invocation, output.fixedBindings.observationSha256s);
  if (process && handback.processBindingSha256 !== digest(process.binding)) v.fail('reviewer process binding is stale');
  const surfaceReview = process?.plan && lane === 'blindLane' ? parseSurfaceReview(handback.surfaceReview) : undefined;
  if (surfaceReview && process?.plan) {
    if (digest(surfaceReview.rows.map(({ criteria: _, measurementIds: __, ...row }) => row)) !== digest(process.surfaceRows.map(({ criteria: _, measurementIds: __, ...row }) => row))) v.fail('surface reviewer changed the supplied capture inventory');
    const packets = new Map(surfaceReview.rows.map(row => [row.packet.sha256, loadMeasurement(root, row.packet)]));
    joinSurfaceCoverage(process.plan, process.mappings, surfaceReview, packets);
  }
  if (quality && (floors.composition !== quality.axes.find(a => a.axis === 'composition')!.score || floors.composition < 4)) v.fail('composition compatibility floor must equal independent composition score and clear 4');
  return { handback, quality, floors, context, output, surfaceReview };
}
export function buildMeasuredReviewerPublication(input: { laneSchema: string; roleResults: unknown[] }, context: {
  projectRoot: string; invocation: ProjectRunInvocation; buildSha256: string; briefSha256: string; publicKeyPath?: string;
}): FinalReviewerPublication {
  const lane: MeasuredLane = input.laneSchema === 'measured-blind-review-v1' ? 'blindLane' : input.laneSchema === 'measured-fidelity-review-v1' ? 'fidelityLane' : input.laneSchema === 'measured-protocol-review-v1' ? 'protocolLane' : v.fail('unknown measured lane');
  const policy = loadReviewPolicy(context.projectRoot, context.invocation), count = policy.lanes[policyLane(lane)];
  if (!count || !Array.isArray(input.roleResults) || input.roleResults.length !== count) v.fail('measured reviewer quorum differs from authority-bound policy');
  const roles = input.roleResults.map(r => verifySignedEyeRoleResult(r, context.projectRoot, context.publicKeyPath));
  if (new Set(roles.map(r => r.receipt.schema)).size !== 1) v.fail('measured reviewer hosts cannot be mixed');
  if (roles[0]!.receipt.schema === 'omd-pi-role-exec-result-v1') v.fail('measured Pi reviews require independent v2 evidence identities');
  if (roles[0]!.receipt.schema === 'omd-pi-role-exec-result-v2') {
    const run = getNativePiRun(context.invocation, context.projectRoot);
    for (const { receipt } of roles) if (receipt.schema !== 'omd-pi-role-exec-result-v2' || receipt.provider !== run.host.provider || receipt.model !== run.host.model
      || receipt.nodeSha256 !== run.host.nodeSha256 || receipt.cliSha256 !== run.host.cliSha256) v.fail('measured Pi reviewer host identity changed');
  }
  const task = measuredReviewerTask(lane);
  const parsed = roles.map(role => {
    if (role.receipt.exitCode !== 0 || role.receipt.signal !== null) v.fail('measured reviewer execution did not finish successfully');
    if (role.receipt.buildSha256 !== context.buildSha256 || role.receipt.briefSha256 !== context.briefSha256) v.fail('stale signed reviewer execution');
    const handback = JSON.parse(role.finalMessage) as Record<string, unknown>;
    v.array(v.sha)(handback.observationSha256s);
    const packet = measuredLanePacket(context.projectRoot, context.invocation, handback.observationSha256s as string[], lane);
    const checked = parseMeasuredHandback(context.projectRoot, context.invocation, handback, packet, lane);
    const proof = role.receipt.reviewerEvidence;
    if (!proof || role.receipt.taskSha256 !== sha256(task) || proof.taskSha256 !== sha256(task)
      || proof.packetSha256 !== sha256(packet) || proof.evidenceSha256 !== checked.output.fixedBindings.evidenceSha256
      || proof.childPid === role.receipt.processPid
      || checked.output.laneSchema !== input.laneSchema || checked.output.fixedBindings.reviewPolicySha256 !== digest(policy)) v.fail('signed isolated reviewer did not consume the exact measured task/packet');
    return { ...checked, role, packetSha256: sha256(packet) };
  });
  for (const key of ['processPid', 'sessionId', 'roleNonce'] as const) if (new Set(roles.map(r => r.receipt[key])).size !== count) v.fail('measured reviewer execution reused');
  for (const key of ['childPid', 'sessionId', 'nonce'] as const) if (new Set(roles.map(r => r.receipt.reviewerEvidence![key])).size !== count) v.fail('measured evidence consumption reused');
  const first = parsed[0]!;
  if (parsed.some(p => p.packetSha256 !== first.packetSha256 || digest(p.output.fixedBindings) !== digest(first.output.fixedBindings))) v.fail('measured reviewer handback bindings disagree');
  const artifact = (directory: string, value: unknown) => { const bytes = canonicalBytes(value), hash = sha256(bytes); return { path: `.omd/final-review/${directory}/sha256-${hash}.json`, sha256: hash, bytes }; };
  const executions = parsed.map(p => artifact('executions', { schema: 'measured-final-reviewer-execution-v1', lane,
    reviewerId: `omd-eye-${sha256(p.role.receipt.sessionId!).slice(0, 16)}`, handback: p.handback,
    processPid: p.role.receipt.processPid, sessionId: p.role.receipt.sessionId, nonce: p.role.receipt.roleNonce,
    evidenceConsumption: { processPid: p.role.receipt.reviewerEvidence!.childPid, sessionId: p.role.receipt.reviewerEvidence!.sessionId, nonce: p.role.receipt.reviewerEvidence!.nonce },
    configurationSha256: p.role.receipt.configurationSha256, packetSha256: p.packetSha256, reviewPolicySha256: digest(policy), measurements: first.output.fixedBindings.measurements }));
  const quality = lane === 'blindLane' ? aggregateMeasuredDesignQuality(parsed.map(p => p.quality!), first.context) : undefined;
  const surface = first.surfaceReview ? artifact('surfaces', first.surfaceReview) : undefined;
  const value = { schema: input.laneSchema, lane, reviewPolicySha256: digest(policy), measurements: first.output.fixedBindings.measurements,
    fixedBindings: first.output.fixedBindings, packetSha256: first.packetSha256, verdicts: first.handback.verdicts,
    criticalFloors: Object.fromEntries(Object.keys(first.floors).map(key => [key, Math.min(...parsed.map(p => p.floors[key]!))])),
    ...(quality ? { designQuality: quality } : {}), ...(surface ? { surfaceReview: { path: surface.path, sha256: surface.sha256 } } : {}),
    quorum: { required: count, passed: count }, executionReceipts: executions.map(({ path, sha256 }) => ({ path, sha256 })) };
  return { lane: artifact('lanes', value), executions, ...(surface ? { artifacts: [surface] } : {}) };
}
