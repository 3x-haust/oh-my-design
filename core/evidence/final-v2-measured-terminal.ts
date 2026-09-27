import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { requireFinalReviewerLaneAuthorization } from '../runtime/invocation.ts';
import { acquireProjectMutationLock, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { nodeStableProjectFileSystem } from '../runtime/stable-project-file.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { loadReviewPolicy, assertReviewQuorum, type ReviewPolicy } from '../measure/review-policy.ts';
import type { Receipt } from '../measure/types.ts';
import { canonicalBytes, digest, sha256 } from '../measure/identity.ts';
import { readArtifact } from '../measure/inputs.ts';
import * as v from '../measure/validation.ts';
import { assertMeasurementPacketsGreen } from './final-v2-measurement.ts';
import { aggregateMeasuredDesignQuality } from './final-v2-measured-quality.ts';
import { measuredLanePacket, parseMeasuredHandback, policyLane, type MeasuredLane } from '../../adapters/measured-reviewer-publication.ts';
import { checkMeasuredSlopReview } from '../slop/measured-review.ts';
import { validateFinalProductionEvidence } from './final-v2-graph.ts';
import { stageArtifactProblems } from '../stage/output.ts';
import { stageDefinition } from '../stage/contract.ts';
import { loadTerminalProcess, checkTerminalSurfaceReview } from './final-v2-process.ts';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FinalConfidenceDebt } from './final-v2-confidence-debt.ts';

import { parseMeasuredTerminal, type MeasuredTerminalGraph as Graph } from './final-v2-measured-contract.ts';
export { parseMeasuredTerminal } from './final-v2-measured-contract.ts';
export type { MeasuredTerminal, GraphReviewBindings } from './final-v2-measured-contract.ts';
const lanes = ['blindLane', 'fidelityLane', 'protocolLane'] as const;
function load(root: string, receipt: Receipt) {
  v.receipt(receipt); const bytes = readArtifact(root, receipt.path);
  if (sha256(bytes) !== receipt.sha256) v.fail('measured terminal artifact bytes changed');
  return { bytes, value: JSON.parse(bytes.toString('utf8')) as Record<string, unknown> };
}
function productionProjection(graph: Graph) {
  const t = parseMeasuredTerminal(graph.measuredTerminal);
  // No protocol receipt or reviewer artifact is a dependency of deterministic protocol facts.
  return { ...graph, measuredTerminal: { schema: t.schema, measurements: t.measurements, reviewPolicy: t.reviewPolicy, slop: t.slop, ...(t.process ? { process: t.process } : {}), lanes: {} } };
}
function protocolFacts(root: string, graph: Graph, invocation: ProjectRunInvocation) {
  const terminal = parseMeasuredTerminal(graph.measuredTerminal), policy = loadReviewPolicy(root, invocation);
  const process = loadTerminalProcess(root, invocation, graph.observations.map(o => o.sha256));
  if (digest(terminal.process ?? null) !== digest(process?.binding ?? null)) v.fail('current design-process evidence is absent or stale');
  if (digest(policy) !== digest(terminal.reviewPolicy)) v.fail('terminal review policy is not current authority');
  assertMeasurementPacketsGreen(root, terminal.measurements);
  const slopMeasurements = [...new Map([...terminal.measurements, ...process?.binding.surface?.measurements ?? []].map(r => [r.sha256, r])).values()];
  checkMeasuredSlopReview(root, { measurements: slopMeasurements, slop: terminal.slop });
  const production = validateFinalProductionEvidence(root, productionProjection(graph), nodeStableProjectFileSystem(), invocation);
  const route = readPersistedRoute(root, invocation);
  const debt = graph.confidenceDebt as FinalConfidenceDebt | undefined;
  const unverifiedStages = debt?.limitations.filter(d => d.stage === 'reference-board' && !existsSync(resolve(root, stageDefinition('reference-board').artifact))) ?? [];
  const checkedStages = (['domain', 'frame', 'copy', 'type-proof', 'composition', 'reference-board'] as const).filter(stage => route.strategy.stages.includes(stage) && !unverifiedStages.some(d => d.stage === stage));
  for (const stage of checkedStages) { const problems = stageArtifactProblems(root, stage, invocation); if (problems.length) v.fail(`deterministic protocol ${stage}: ${problems.join('; ')}`); }
  return { schema: 'deterministic-terminal-protocol-v1' as const, routeSha256: policy.routeSha256, sourceContractSha256: policy.sourceContractSha256,
    reviewPolicySha256: digest(policy), productionRootHash: production.rootHash, measurements: terminal.measurements,
    observations: graph.observations, slop: terminal.slop, ...(process ? { process: process.binding } : {}), unverifiedStages, checkedStages: checkedStages.map(stage => {
      const path = stageDefinition(stage).artifact;
      return { stage, artifact: { path, sha256: sha256(readArtifact(root, path)) } };
    }) };
}
export function publishDeterministicProtocol(root: string, graph: Graph, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation): Receipt {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const before = protocolFacts(root, graph, invocation);
  const release = acquireProjectMutationLock(root, invocation);
  try {
    const facts = protocolFacts(root, graph, invocation);
    if (digest(facts) !== digest(before)) v.fail('deterministic protocol inputs changed');
    const value = { ...facts, signature: signNativeObservation(root, facts.schema, digest(facts)) };
    const bytes = canonicalBytes(value), hash = sha256(bytes), path = `.omd/final-review/protocol/sha256-${hash}.json`;
    writer.writeContentAddressed(path, bytes); return { path, sha256: hash };
  } finally { release(); }
}
/** Replays native facts and all signed-host publication bindings. No caller PASS flag exists. */
export function validateMeasuredTerminal(root: string, graph: Graph, invocation: ProjectRunInvocation): void {
  const terminal = parseMeasuredTerminal(graph.measuredTerminal), facts = protocolFacts(root, graph, invocation), policy = loadReviewPolicy(root, invocation);
  const process = loadTerminalProcess(root, invocation, graph.observations.map(o => o.sha256));
  const protocol = terminal.deterministicProtocol ?? v.fail('separate deterministic protocol receipt required');
  if (protocol.path !== `.omd/final-review/protocol/sha256-${protocol.sha256}.json`) v.fail('protocol receipt must be immutable');
  const loaded = load(root, protocol), { signature, ...recorded } = loaded.value;
  if (digest(recorded) !== digest(facts) || typeof signature !== 'string' || !verifyNativeObservation(root, facts.schema, digest(facts), signature)) v.fail('deterministic protocol is forged or stale');
  const consumptionPids = new Set<number>(), consumptionSessions = new Set<string>(), consumptionNonces = new Set<string>();
  const observed = lanes.flatMap(lane => {
    const required = policy.lanes[policyLane(lane)], descriptor = terminal.lanes[lane];
    if (!required) { if (descriptor) v.fail('policy-unselected lane must be absent'); return []; }
    if (!descriptor) return v.fail(`missing required measured lane: ${lane}`);
    const loaded = load(root, descriptor); requireFinalReviewerLaneAuthorization(invocation, root, loaded.bytes);
    const value = loaded.value;
    v.object({ schema: v.enumeration(`measured-${policyLane(lane)}-review-v1`), lane: v.enumeration(lane), reviewPolicySha256: v.sha, measurements: v.array(v.receipt),
      fixedBindings: () => {}, packetSha256: v.sha, verdicts: () => {}, criticalFloors: () => {}, ...(lane === 'blindLane' ? { designQuality: () => {}, ...(process?.plan ? { surfaceReview: v.receipt } : {}) } : {}),
      quorum: v.object({ required: v.integer, passed: v.integer }), executionReceipts: v.array(v.receipt) })(value);
    const packet = measuredLanePacket(root, invocation, graph.observations.map(o => o.sha256), lane);
    const expected = JSON.parse(packet.toString('utf8')).outputContract;
    if (value.packetSha256 !== sha256(packet) || digest(value.fixedBindings) !== digest(expected.fixedBindings)
      || digest(value.measurements) !== digest(terminal.measurements) || value.reviewPolicySha256 !== digest(policy)
      || digest(value.quorum) !== digest({ required, passed: required })) v.fail('measured lane binding/quorum changed');
    const executions = (value.executionReceipts as Receipt[]).map(r => {
      const e = load(root, r); requireFinalReviewerLaneAuthorization(invocation, root, e.bytes);
      const x = e.value;
      v.object({ schema: v.enumeration('measured-final-reviewer-execution-v1'), lane: v.enumeration(lane), reviewerId: v.text, handback: () => {}, processPid: v.integer,
        evidenceConsumption: v.object({ processPid: v.integer, sessionId: v.text, nonce: v.text }),
        sessionId: v.text, nonce: v.text, configurationSha256: v.sha, packetSha256: v.sha, reviewPolicySha256: v.sha, measurements: v.array(v.receipt) })(x);
      if (x.packetSha256 !== value.packetSha256 || x.reviewPolicySha256 !== digest(policy) || digest(x.measurements) !== digest(terminal.measurements)) v.fail('measured execution has another packet/policy');
      const proof = x.evidenceConsumption as { processPid: number; sessionId: string; nonce: string };
      if (!proof.processPid || proof.processPid === x.processPid || consumptionPids.has(proof.processPid) || consumptionSessions.has(proof.sessionId) || consumptionNonces.has(proof.nonce)) v.fail('measured evidence consumption identity reused');
      consumptionPids.add(proof.processPid); consumptionSessions.add(proof.sessionId); consumptionNonces.add(proof.nonce);
      return { checked: parseMeasuredHandback(root, invocation, x.handback, packet, lane), processPid: x.processPid as number, sessionId: x.sessionId as string, nonce: x.nonce as string,
        packetSha256: x.packetSha256 as string, reviewPolicySha256: x.reviewPolicySha256 as string };
    });
    if (executions.length !== required) v.fail('measured execution count differs from policy');
    const first = executions[0]!;
    const floors = Object.fromEntries(Object.keys(first.checked.floors).map(key => [key, Math.min(...executions.map(e => e.checked.floors[key]!))]));
    if (digest(floors) !== digest(value.criticalFloors) || digest(value.verdicts) !== digest(first.checked.handback.verdicts)) v.fail('measured lane aggregate forged');
    if (lane === 'blindLane' && digest(aggregateMeasuredDesignQuality(executions.map(e => e.checked.quality!), first.checked.context)) !== digest(value.designQuality)) v.fail('measured quality aggregate forged');
    if (lane === 'blindLane' && process?.plan) {
      const surface = value.surfaceReview as Receipt;
      if (digest(load(root, surface).value) !== digest(first.checked.surfaceReview)) v.fail('surface review aggregate changed');
      checkTerminalSurfaceReview(root, invocation, process, surface);
    }
    return [{ lane: policyLane(lane), executions }];
  });
  // Quorum validation also enforces reviewer PID/session/nonce uniqueness across every lane.
  assertReviewQuorum(policy, observed);
  if (observed.some(lane => lane.executions.some(e => consumptionPids.has(e.processPid)
    || consumptionSessions.has(e.sessionId) || consumptionNonces.has(e.nonce)))) v.fail('reviewer and evidence-consumption identities overlap');
}
