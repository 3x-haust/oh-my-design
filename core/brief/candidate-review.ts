import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { readWholeScreenReferenceHandoff } from '../ref/reference-handoff.ts';
import { verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { CANDIDATE_PLAN_PATH, checkCandidateSet, type CandidateSet } from './candidate-plan.ts';
import * as v from './candidate-data.ts';
export const CANDIDATE_REVIEW_FEEDBACK_PATH = '.omd/.cache/sketches/review-current.json';
export const CANDIDATE_QUALITY_AXES = ['aesthetic-desirability', 'content-shaped-composition', 'control-craft'] as const;
export type CandidateQualityAxis = typeof CANDIDATE_QUALITY_AXES[number];
export type CandidateReviewPacket = Readonly<{
  schema: 'candidate-review-packet-v2'; inputDigest: string; sourceContractSha256: string;
  task: { surfaceId: string; stateId: string; content: readonly string[]; truthBoundary: string };
  candidates: readonly { alias: string; previews: readonly { renderId: string; viewId: string; viewport: { width: number; height: number }; png: v.Receipt }[] }[];
  references: Readonly<{ kind: 'reference-free'; reason: 'no-current-reference-analysis' }
    | { kind: 'selected-whole-screen-originals'; handoffSha256: string; analysis: v.Receipt; guidance: unknown;
      originals: readonly { role: 'selected-reference-original'; label: string; referenceId: string; png: v.Receipt }[] }>;
}>;
export type CandidateEyeReviewV1 = Readonly<{
  schema: 'candidate-eye-review-v1'; packet: v.Receipt;
  observations: readonly { alias: string; feasibility: 'pass' | 'fail' | 'unassessed'; structureRelationship: string; densityTypeFit: string; responsiveFit: string;
    findings: readonly { viewId: string; region: string; consequence: string; blocking: boolean }[] }[];
  winner: string | null; limitations: readonly string[];
  execution: { kind: 'isolated'; launchId: string; outputSha256: string };
  attestation: { kind: 'native-observation-v1'; payloadSha256: string; signature: string };
}>;
export type CandidateEyeReview = Readonly<{
  schema: 'candidate-eye-review-v2'; packet: v.Receipt;
  observations: readonly { alias: string; feasibility: 'pass' | 'fail' | 'unassessed'; structureRelationship: string; densityTypeFit: string; responsiveFit: string;
    qualityAssessments: readonly { axis: CandidateQualityAxis; viewId: string; verdict: 'pass' | 'fail' | 'unassessed'; observation: string; consequence: string }[];
    findings: readonly { viewId: string; region: string; consequence: string; blocking: boolean }[] }[];
  winner: string | null; limitations: readonly string[];
  execution: { kind: 'isolated'; launchId: string; outputSha256: string };
  attestation: { kind: 'native-observation-v1'; payloadSha256: string; signature: string };
}>;
export type ParsedCandidateEyeReview = CandidateEyeReviewV1 | CandidateEyeReview;

function currentReferences(root: string, route: { sourceContractSha256: string; request: string }): CandidateReviewPacket['references'] {
  if (!existsSync(join(root, '.omd/reference-analysis.json'))) {
    return { kind: 'reference-free', reason: 'no-current-reference-analysis' };
  }
  const handoff = readWholeScreenReferenceHandoff(root, 'concept', {
    sourceContractSha256: route.sourceContractSha256, request: route.request,
  });
  if (!('images' in handoff)) return v.fail('candidate review requires complete selected-reference originals');
  const observations = new Map(handoff.analysis.observations.map(observation => [observation.referenceId, observation] as const));
  const guidance = {
    schema: 'candidate-review-whole-screen-reference-guidance-v1',
    usageLimits: [
      'These whole-screen originals are private observation evidence, not output assets.',
      'Do not copy source text, branding, logos, names, proprietary content, or supplied pixels.',
      'Use only the stated take, avoid, and adaptation limits; screenshots do not establish destination behavior or capability.',
    ],
    references: handoff.images.map((image, index) => {
      const observation = observations.get(image.referenceId) ?? v.fail('candidate review reference observation missing');
      const screens = handoff.analysis.screens.filter(screen =>
        screen.domain.referenceIds.includes(image.referenceId) || screen.design.referenceIds.includes(image.referenceId));
      const patterns = handoff.analysis.patterns.filter(pattern => pattern.referenceIds.includes(image.referenceId));
      return {
        imageLabel: `selected-reference-original-${index + 1}.png`, referenceId: image.referenceId,
        take: { observed: { screenType: observation.screenType, mainTask: observation.mainTask,
          hierarchy: observation.hierarchy, density: observation.density, typography: observation.typography,
          components: observation.components },
          patterns: patterns.filter(pattern => pattern.decision === 'apply')
            .map(pattern => ({ pattern: pattern.pattern, reason: pattern.reason })) },
        avoid: [...patterns.filter(pattern => pattern.decision === 'do-not-apply')
          .map(pattern => ({ subject: pattern.pattern, reason: pattern.reason })),
        ...screens.flatMap(screen => [
          { subject: `${screen.surface}/domain`, reason: screen.domain.doNotTransfer },
          { subject: `${screen.surface}/design`, reason: screen.design.doNotTransfer },
        ])],
        adaptation: screens.map(screen => ({ surface: screen.surface, target: screen.target,
          domain: { application: screen.domain.application, reason: screen.domain.reason },
          design: { application: screen.design.application, reason: screen.design.reason }, checks: screen.checks })),
      };
    }),
  };
  const originals = handoff.images.map((image, index) => {
    return { role: 'selected-reference-original' as const, label: `selected-reference-original-${index + 1}.png`, referenceId: image.referenceId,
      png: { path: image.path, sha256: image.sha256 } };
  });
  return { kind: 'selected-whole-screen-originals', handoffSha256: handoff.sha256,
    analysis: handoff.analysis.receipt, guidance, originals };
}

export function buildCandidateReviewPacket(root: string, set: CandidateSet,
  route: { sourceContractSha256: string; request: string }) {
  const checked = checkCandidateSet(root, set, route.sourceContractSha256);
  const aliases = set.candidates.map(c => ({ id: c.id, alias: `option-${randomBytes(8).toString('hex')}` }));
  const packet: CandidateReviewPacket = { schema: 'candidate-review-packet-v2', inputDigest: checked.inputDigest,
    sourceContractSha256: route.sourceContractSha256,
    task: { surfaceId: checked.plan.representative.surfaceId, stateId: checked.plan.representative.stateId, content: checked.content.units.map(u => u.text), truthBoundary: checked.content.truthBoundary },
    candidates: aliases.map(a => { const c = set.candidates.find(c => c.id === a.id)!; return { alias: a.alias,
      previews: c.previews.map(p => ({ renderId: p.renderId, viewId: p.viewId, viewport: p.viewport, png: p.png })) }; }),
    references: currentReferences(root, route),
  };
  return { packet, aliases };
}
export function parseCandidateEyeReview(value: unknown): ParsedCandidateEyeReview {
  const r = v.object(value, ['schema', 'packet', 'observations', 'winner', 'limitations', 'execution', 'attestation']);
  const schema = v.enumeration(r.schema, ['candidate-eye-review-v1', 'candidate-eye-review-v2']);
  const observations = v.list(r.observations, value => {
    const o = v.object(value, ['alias', 'feasibility', 'structureRelationship', 'densityTypeFit', 'responsiveFit',
      ...(schema === 'candidate-eye-review-v2' ? ['qualityAssessments'] : []), 'findings']);
    const base = { alias: v.id(o.alias), feasibility: v.enumeration(o.feasibility, ['pass', 'fail', 'unassessed']), structureRelationship: v.text(o.structureRelationship), densityTypeFit: v.text(o.densityTypeFit), responsiveFit: v.text(o.responsiveFit), findings: v.list(o.findings, value => {
      const f = v.object(value, ['viewId', 'region', 'consequence', 'blocking']); return { viewId: v.id(f.viewId), region: v.text(f.region), consequence: v.text(f.consequence), blocking: v.boolean(f.blocking) };
    }) };
    if (schema === 'candidate-eye-review-v1') return base;
    return { ...base, qualityAssessments: v.list(o.qualityAssessments, value => {
      const q = v.object(value, ['axis', 'viewId', 'verdict', 'observation', 'consequence']);
      return { axis: v.enumeration(q.axis, CANDIDATE_QUALITY_AXES), viewId: v.id(q.viewId),
        verdict: v.enumeration(q.verdict, ['pass', 'fail', 'unassessed']),
        observation: v.text(q.observation), consequence: v.text(q.consequence) };
    }) };
  }); v.unique(observations, o => o.alias);
  const e = v.object(r.execution, ['kind', 'launchId', 'outputSha256']), a = v.object(r.attestation, ['kind', 'payloadSha256', 'signature']);
  return { schema, packet: v.receipt(r.packet), observations, winner: r.winner === null ? null : v.id(r.winner), limitations: v.list(r.limitations, v.text), execution: { kind: v.enumeration(e.kind, ['isolated']), launchId: v.id(e.launchId), outputSha256: v.sha(e.outputSha256) }, attestation: { kind: v.enumeration(a.kind, ['native-observation-v1']), payloadSha256: v.sha(a.payloadSha256), signature: v.text(a.signature) } } as ParsedCandidateEyeReview;
}
/** The isolated host signs this payload only after binding exact packet, configured child and output.
 * There is deliberately no model-callable publisher that signs an authored review as isolated. */
export function candidateReviewPayload(review: Omit<ParsedCandidateEyeReview, 'attestation'> | ParsedCandidateEyeReview) {
  const { schema, packet, observations, winner, limitations, execution } = review;
  return { schema, packet, observations, winner, limitations, execution };
}
export function verifyCandidateEyeReview(root: string, receipt: v.Receipt, packet: CandidateReviewPacket, packetReceipt: v.Receipt): CandidateEyeReview {
  const review = parseCandidateEyeReview(JSON.parse(v.readReceipt(root, receipt).toString('utf8')));
  const digest = v.digest(candidateReviewPayload(review));
  if (v.digest(review.packet) !== v.digest(packetReceipt) || review.attestation.payloadSha256 !== digest
    || !verifyNativeObservation(realpathSync(root), review.schema, digest, review.attestation.signature)) v.fail('autonomous selection requires exact host-attested isolated Eye output');
  if (review.schema !== 'candidate-eye-review-v2') v.fail('historical candidate review is diagnostic history, not current visual selection approval');
  if (v.digest(review.observations.map(o => o.alias).sort()) !== v.digest(packet.candidates.map(c => c.alias).sort())) v.fail('Eye must assess every anonymous option exactly once');
  for (const o of review.observations) {
    const candidate = packet.candidates.find(c => c.alias === o.alias)!;
    if (o.findings.some(f => !candidate.previews.some(p => p.viewId === f.viewId))) v.fail('Eye finding cites an unknown view');
    const expected = candidate.previews.flatMap(preview => CANDIDATE_QUALITY_AXES.map(axis => `${axis}:${preview.viewId}`)).sort();
    const actual = o.qualityAssessments.map(assessment => `${assessment.axis}:${assessment.viewId}`).sort();
    if (v.digest(actual) !== v.digest(expected)) v.fail('Eye must provide every quality judgment for every supplied candidate view');
  }
  const winner = review.observations.find(o => o.alias === review.winner);
  if (!winner || winner.feasibility !== 'pass' || winner.findings.some(f => f.blocking)
    || winner.qualityAssessments.some(assessment => assessment.verdict !== 'pass')) {
    v.fail('Eye has no independently qualified winner; retain repair findings rather than inventing selection');
  }
  return review;
}

export type CurrentCandidateReviewFeedback = Readonly<{
  status: 'current' | 'historical';
  receipt: v.Receipt; review: ParsedCandidateEyeReview;
  packet: CandidateReviewPacket | Record<string, unknown>;
  aliases: readonly { id: string; alias: string }[];
}> | Readonly<{
  status: 'rejected'; receipt: v.Receipt; review: null;
  packet: CandidateReviewPacket | Record<string, unknown>;
  aliases: readonly { id: string; alias: string }[];
}>;

/** Authenticates any feedback pointer bound to the current plan without requiring a candidate ID.
 * Historical v1 review bytes remain inspectable but are explicitly not current visual approval.
 * A legitimately replaced plan returns null; malformed, forged, or source-mismatched presence throws. */
export function readCurrentCandidateReviewFeedback(root: string, runId: string,
  sourceContractSha256: string): CurrentCandidateReviewFeedback | null {
  if (!existsSync(join(root, CANDIDATE_REVIEW_FEEDBACK_PATH))) return null;
  const rawPointer = JSON.parse(v.readBytes(root, CANDIDATE_REVIEW_FEEDBACK_PATH).toString('utf8'));
  const candidate = v.object(rawPointer);
  const rejected = candidate.schema === 'native-candidate-feedback-rejection-v1';
  const pointer = v.object(rawPointer, rejected
    ? ['schema', 'runId', 'sourceContractSha256', 'plan', 'packet', 'rawResult', 'aliases', 'signature']
    : ['schema', 'runId', 'sourceContractSha256', 'plan', 'packet', 'review', 'aliases', 'signature']);
  const { signature, ...payload } = pointer;
  if (!['native-candidate-feedback-v1', 'native-candidate-feedback-v2', 'native-candidate-feedback-rejection-v1'].includes(String(pointer.schema))
    || pointer.runId !== runId
    || !verifyNativeObservation(realpathSync(root), String(pointer.schema), v.digest(payload), v.text(signature))) {
    return v.fail('candidate feedback must bind the current authenticated run and source');
  }
  const currentPlan = v.object(JSON.parse(v.readBytes(root, CANDIDATE_PLAN_PATH).toString('utf8')), ['schema', 'plan']);
  const currentReceipt = v.receipt(currentPlan.plan);
  const currentRecord = v.object(JSON.parse(v.readReceipt(root, currentReceipt).toString('utf8')));
  if (currentRecord.sourceContractSha256 !== sourceContractSha256) {
    return v.fail('candidate feedback must bind the current authenticated run and source');
  }
  if (v.digest(v.receipt(pointer.plan)) !== v.digest(currentReceipt)) {
    const historical = v.object(JSON.parse(v.readReceipt(root, v.receipt(pointer.plan)).toString('utf8')));
    if (historical.sourceContractSha256 !== pointer.sourceContractSha256) {
      return v.fail('candidate feedback must bind its authenticated historical plan source');
    }
    return null;
  }
  if (pointer.sourceContractSha256 !== sourceContractSha256) {
    return v.fail('candidate feedback must bind the current authenticated run and source');
  }
  const aliases = v.list(pointer.aliases, value => {
    const row = v.object(value, ['id', 'alias']);
    return { id: v.id(row.id), alias: v.id(row.alias) };
  });
  v.unique(aliases, row => row.id); v.unique(aliases, row => row.alias);
  if (rejected) {
    const receipt = v.receipt(pointer.rawResult);
    v.readReceipt(root, receipt);
    const packet = v.object(JSON.parse(v.readReceipt(root, v.receipt(pointer.packet)).toString('utf8')));
    if (packet.schema !== 'candidate-review-packet-v2' || packet.sourceContractSha256 !== sourceContractSha256) {
      return v.fail('rejected candidate feedback packet belongs to changed reference or route evidence');
    }
    return { status: 'rejected', receipt, review: null, packet, aliases };
  }
  const receipt = v.receipt(pointer.review);
  const review = parseCandidateEyeReview(JSON.parse(v.readReceipt(root, receipt).toString('utf8')));
  const digest = v.digest(candidateReviewPayload(review));
  if (review.attestation.payloadSha256 !== digest
    || v.digest(review.packet) !== v.digest(v.receipt(pointer.packet))
    || !verifyNativeObservation(realpathSync(root), review.schema, digest, review.attestation.signature)) {
    return v.fail('candidate feedback review is not authentic');
  }
  const packet = v.object(JSON.parse(v.readReceipt(root, review.packet).toString('utf8')));
  const status = pointer.schema === 'native-candidate-feedback-v2' && review.schema === 'candidate-eye-review-v2'
    ? 'current' as const : 'historical' as const;
  if (status === 'current') {
    if (packet.schema !== 'candidate-review-packet-v2' || packet.sourceContractSha256 !== sourceContractSha256) {
      return v.fail('current candidate feedback packet belongs to changed reference or route evidence');
    }
  }
  return { status, receipt, review, packet, aliases };
}

export function readCandidateReviewFeedback(root: string, runId: string, sourceContractSha256: string, candidateId: string) {
  const current = readCurrentCandidateReviewFeedback(root, runId, sourceContractSha256);
  if (current === null || current.status !== 'current' || current.review.schema !== 'candidate-eye-review-v2') return null;
  const alias = current.aliases.find(row => row.id === candidateId)?.alias;
  if (alias === undefined) return null;
  const packet = current.packet;
  const candidates = v.list(packet.candidates, value => {
    const row = v.object(value, ['alias', 'previews']);
    return { alias: v.id(row.alias), previews: v.list(row.previews, value => {
      const preview = v.object(value, ['renderId', 'viewId', 'viewport', 'png']);
      return { viewId: v.id(preview.viewId), png: v.receipt(preview.png) };
    }) };
  });
  const candidate = candidates.find(row => row.alias === alias);
  const observation = current.review.observations.find(row => row.alias === alias);
  if (!candidate || !observation) return v.fail('candidate feedback omitted its owned option');
  return { receipt: current.receipt, observation, previews: candidate.previews };
}
