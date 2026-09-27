import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { checkCandidateSet, type CandidateSet } from './candidate-plan.ts';
import * as v from './candidate-data.ts';
export type CandidateReviewPacket = Readonly<{
  schema: 'candidate-review-packet-v1'; inputDigest: string;
  task: { surfaceId: string; stateId: string; content: readonly string[]; truthBoundary: string };
  candidates: readonly { alias: string; previews: readonly { renderId: string; viewId: string; viewport: { width: number; height: number }; png: v.Receipt }[] }[];
}>;
export type CandidateEyeReview = Readonly<{
  schema: 'candidate-eye-review-v1'; packet: v.Receipt;
  observations: readonly { alias: string; feasibility: 'pass' | 'fail' | 'unassessed'; structureRelationship: string; densityTypeFit: string; responsiveFit: string;
    findings: readonly { viewId: string; region: string; consequence: string; blocking: boolean }[] }[];
  winner: string | null; limitations: readonly string[];
  execution: { kind: 'isolated'; launchId: string; outputSha256: string };
  attestation: { kind: 'native-observation-v1'; payloadSha256: string; signature: string };
}>;
export function buildCandidateReviewPacket(root: string, set: CandidateSet, sourceContractSha256: string) {
  const checked = checkCandidateSet(root, set, sourceContractSha256);
  const aliases = set.candidates.map(c => ({ id: c.id, alias: `option-${randomBytes(8).toString('hex')}` }));
  const packet: CandidateReviewPacket = { schema: 'candidate-review-packet-v1', inputDigest: checked.inputDigest,
    task: { surfaceId: checked.plan.representative.surfaceId, stateId: checked.plan.representative.stateId, content: checked.content.units.map(u => u.text), truthBoundary: checked.content.truthBoundary },
    candidates: aliases.map(a => { const c = set.candidates.find(c => c.id === a.id)!; return { alias: a.alias,
      previews: c.previews.map(p => ({ renderId: p.renderId, viewId: p.viewId, viewport: p.viewport, png: p.png })) }; }),
  };
  return { packet, aliases };
}
export function parseCandidateEyeReview(value: unknown): CandidateEyeReview {
  const r = v.object(value, ['schema', 'packet', 'observations', 'winner', 'limitations', 'execution', 'attestation']); v.enumeration(r.schema, ['candidate-eye-review-v1']);
  const observations = v.list(r.observations, value => {
    const o = v.object(value, ['alias', 'feasibility', 'structureRelationship', 'densityTypeFit', 'responsiveFit', 'findings']);
    return { alias: v.id(o.alias), feasibility: v.enumeration(o.feasibility, ['pass', 'fail', 'unassessed']), structureRelationship: v.text(o.structureRelationship), densityTypeFit: v.text(o.densityTypeFit), responsiveFit: v.text(o.responsiveFit), findings: v.list(o.findings, value => {
      const f = v.object(value, ['viewId', 'region', 'consequence', 'blocking']); return { viewId: v.id(f.viewId), region: v.text(f.region), consequence: v.text(f.consequence), blocking: v.boolean(f.blocking) };
    }) };
  }); v.unique(observations, o => o.alias);
  const e = v.object(r.execution, ['kind', 'launchId', 'outputSha256']), a = v.object(r.attestation, ['kind', 'payloadSha256', 'signature']);
  return { schema: 'candidate-eye-review-v1', packet: v.receipt(r.packet), observations, winner: r.winner === null ? null : v.id(r.winner), limitations: v.list(r.limitations, v.text), execution: { kind: v.enumeration(e.kind, ['isolated']), launchId: v.id(e.launchId), outputSha256: v.sha(e.outputSha256) }, attestation: { kind: v.enumeration(a.kind, ['native-observation-v1']), payloadSha256: v.sha(a.payloadSha256), signature: v.text(a.signature) } };
}
/** The isolated host signs this payload only after binding exact packet, configured child and output.
 * There is deliberately no model-callable publisher that signs an authored review as isolated. */
export function candidateReviewPayload(review: Omit<CandidateEyeReview, 'attestation'> | CandidateEyeReview) {
  const { schema, packet, observations, winner, limitations, execution } = review;
  return { schema, packet, observations, winner, limitations, execution };
}
export function verifyCandidateEyeReview(root: string, receipt: v.Receipt, packet: CandidateReviewPacket, packetReceipt: v.Receipt): CandidateEyeReview {
  const review = parseCandidateEyeReview(JSON.parse(v.readReceipt(root, receipt).toString('utf8')));
  const digest = v.digest(candidateReviewPayload(review));
  if (v.digest(review.packet) !== v.digest(packetReceipt) || review.attestation.payloadSha256 !== digest
    || !verifyNativeObservation(realpathSync(root), 'candidate-eye-review-v1', digest, review.attestation.signature)) v.fail('autonomous selection requires exact host-attested isolated Eye output');
  if (v.digest(review.observations.map(o => o.alias).sort()) !== v.digest(packet.candidates.map(c => c.alias).sort())) v.fail('Eye must assess every anonymous option exactly once');
  for (const o of review.observations) if (o.findings.some(f => !packet.candidates.find(c => c.alias === o.alias)!.previews.some(p => p.viewId === f.viewId))) v.fail('Eye finding cites an unknown view');
  const winner = review.observations.find(o => o.alias === review.winner);
  if (!winner || winner.feasibility !== 'pass' || winner.findings.some(f => f.blocking)) v.fail('Eye has no feasible winner; retain concept debt rather than inventing selection');
  return review;
}
