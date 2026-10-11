import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import * as v from '../brief/candidate-data.ts';
import { loadMeasurement } from '../measure/files.ts';
import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../route/index.ts';
import { repeatedRefinementDefects, routeRefinementPolicy, type RefinementOutcome } from '../route/refinement-policy.ts';
import { requireFinalReviewerLaneAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { acquireProjectMutationLock, replaceProjectFileAtomically, requireProjectWriteAdapterForInvocation, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { productionRepairReviewBytes, validateCommittedProductionRepairScope } from '../runtime/production-repair.ts';

const POINTER = '.omd/refinement/policy.json';
type Attempt = Readonly<{ schema: 'refinement-observation-v1'; sourceContractSha256: string; routeSha256: string;
  measurement: v.Receipt; repair: v.Receipt; review: v.Receipt; previous: v.Receipt | null;
  policy: ReturnType<typeof routeRefinementPolicy>; outcome: RefinementOutcome; findings: readonly { issueKey: string; code: string; viewIds: readonly string[]; expected: string | null; observed: string | null }[]; signature: string }>;
function readChain(root: string): Attempt[] {
  if (!existsSync(join(root, POINTER))) return [];
  const pointer = v.object(JSON.parse(v.readBytes(root, POINTER).toString('utf8')), ['schema', 'record']);
  v.enumeration(pointer.schema, ['refinement-policy-pointer-v1']);
  let receipt: v.Receipt | null = v.receipt(pointer.record);
  const seen = new Set<string>(), chain: Attempt[] = [];
  while (receipt) {
    if (seen.has(receipt.sha256) || receipt.path !== `.omd/refinement/checkpoints/sha256-${receipt.sha256}.json`) v.fail('invalid refinement policy chain');
    seen.add(receipt.sha256);
    const record = v.object(JSON.parse(v.readReceipt(root, receipt).toString('utf8')), ['schema', 'sourceContractSha256', 'routeSha256', 'measurement', 'repair', 'review', 'previous', 'policy', 'outcome', 'findings', 'signature']);
    const { signature, ...payload } = record;
    if (record.schema !== 'refinement-observation-v1' || !verifyNativeObservation(realpathSync(root), 'refinement-observation-v1', v.digest(payload), v.text(signature))) v.fail('refinement history is not native');
    for (const field of ['measurement', 'repair', 'review'] as const) v.readReceipt(root, v.receipt(record[field]));
    chain.unshift(record as unknown as Attempt); receipt = v.nullableReceipt(record.previous);
  }
  return chain;
}

/** Join an actual committed repair, authorized review and native post-repair measurement. A failed
 * measured repair is recordable even when final gates are RED. No author issue names or pass flags. */
export function recordRefinementObservation(root: string, input: { measurement: v.Receipt; repair: v.Receipt; review: v.Receipt }, writer: ProjectWriteAdapter, invocation: ProjectRunInvocation) {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  const unlock = acquireProjectMutationLock(root, invocation);
  try {
    const route = readPersistedRoute(root, invocation);
    if (!route.sourceContract.processPolicy) v.fail('current process required; legacy refinement retains its historical chain');
    const reviewBytes = v.readReceipt(root, input.review);
    requireFinalReviewerLaneAuthorization(invocation, root, reviewBytes);
    if (!productionRepairReviewBytes(JSON.parse(reviewBytes.toString('utf8'))).equals(reviewBytes)) v.fail('repair review must preserve its exact validated contract');
    const repair = v.object(JSON.parse(v.readReceipt(root, input.repair).toString('utf8')),
      ['schema', 'outcome', 'path', 'mode', 'beforeTreeSha256', 'afterTreeSha256', 'routeSha256', 'sliceSha256', 'reviewSha256', 'predecessorSha256']);
    if (repair.schema !== 'omd-production-repair-outcome-v3' || repair.outcome !== 'committed'
      || input.repair.path !== `.omd/production-repairs/sha256-${input.repair.sha256}.json`
      || repair.routeSha256 !== adaptiveRouteRecordSha256(route) || repair.reviewSha256 !== input.review.sha256
      || v.hash(v.readBytes(root, v.path(repair.path))) !== repair.afterTreeSha256) v.fail('repair is not the current authorized committed source');
    validateCommittedProductionRepairScope({ root, invocation, routeSha256: v.sha(repair.routeSha256), sliceSha256: v.sha(repair.sliceSha256), path: v.path(repair.path), beforeTreeSha256: v.sha(repair.beforeTreeSha256) });
    const packet = loadMeasurement(root, input.measurement);
    if (packet.binding.sourceContractSha256 !== route.sourceContractSha256) v.fail('measurement belongs to another route');
    const chain = readChain(root);
    if (chain.some(a => a.measurement.sha256 === input.measurement.sha256 || a.repair.sha256 === input.repair.sha256)) return { recorded: false, reason: 'same-observation-or-repair', pending: refinementEscalation(root, route.sourceContractSha256) };
    const previous = existsSync(join(root, POINTER)) ? v.receipt(v.object(JSON.parse(v.readBytes(root, POINTER).toString('utf8'))).record) : null;
    const issueKeys = [...new Set(packet.findings.filter(f => f.severity === 'blocking').map(f => f.issueKey))];
    // Missing/partial inventories cannot prove resolution of an earlier issue.
    const complete = packet.measurements.length > 0 && packet.measurements.every(m => m.coverage.status === 'complete');
    const outcome: RefinementOutcome = { observationId: input.measurement.sha256, repairId: input.repair.sha256,
      comparisonScope: packet.binding.scopeSha256, unresolvedIssueKeys: issueKeys,
      resolvedIssueKeys: complete ? [...new Set(chain.filter(a => a.outcome.comparisonScope === packet.binding.scopeSha256)
        .flatMap(a => a.outcome.unresolvedIssueKeys))].filter(key => !issueKeys.includes(key)) : [],
      regressedIssueKeys: [], requiredEvidence: complete || issueKeys.length > 0 };
    const payload = { schema: 'refinement-observation-v1' as const, sourceContractSha256: route.sourceContractSha256, routeSha256: adaptiveRouteRecordSha256(route),
      ...input, previous, policy: routeRefinementPolicy(route), outcome, findings: packet.findings.filter(f => f.severity === 'blocking').map(f => ({ issueKey: f.issueKey, code: f.code, viewIds: f.viewIds, expected: f.expected?.value ?? null, observed: f.observed?.value ?? null })) };
    const record: Attempt = { ...payload, signature: signNativeObservation(realpathSync(root), payload.schema, v.digest(payload)) };
    const receipt = v.publishRecord(writer, '.omd/refinement/checkpoints', record);
    replaceProjectFileAtomically({ projectRoot: root, relativePath: POINTER, content: v.jsonBytes({ schema: 'refinement-policy-pointer-v1', record: receipt }), invocation });
    return { recorded: true, receipt, pending: refinementEscalation(root, route.sourceContractSha256) };
  } finally { unlock(); }
}

/** Read before any automatic recovery/repair scheduling. Signed history survives restart and scope
 * changes. A real resolved measurement closes an issue; renamed prose and rereads cannot do so. */
export function refinementEscalation(root: string, sourceContractSha256: string) {
  const chain = readChain(root);
  if (!chain.length || chain.at(-1)!.sourceContractSha256 !== sourceContractSha256) return null;
  const defects = repeatedRefinementDefects(chain.map(a => a.outcome));
  if (!defects.length) return null;
  const inputDigest = v.digest({ sourceContractSha256, defects, head: chain.at(-1)!.measurement });
  const described = defects.map(d => {
    const finding = chain.flatMap(a => a.findings).findLast(f => f.issueKey === d.issueKey);
    return `${finding?.code ?? d.issueKey} (${finding?.viewIds.join(', ') ?? 'scope unknown'}): ${finding?.observed ?? 'still unresolved'}; expected ${finding?.expected ?? 'the required criterion'}`;
  });
  return { id: inputDigest, inputDigest, presentedSet: null, optionIds: [] as string[], decisionId: `repeated-defect-${inputDigest}`,
    question: `The same required defect survived three distinct repairs: ${described.join('; ')}. The three fix/result receipts are attached. Decide whether to change the actual constraint or supply a different repair approach; the failure is not waived.`,
    defects: defects.map(d => ({ ...d, attempts: chain.filter(a => d.repairs.includes(a.repair.sha256)).map(a => ({ repair: a.repair, review: a.review, result: a.measurement })) })) };
}
