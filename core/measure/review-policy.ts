import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../route/adaptive-route-persistence.ts';
import { verifyReviewPurposeAuthority } from '../route/review-purpose-authority.ts';
import type { AdaptiveRouteRecord } from '../route/adaptive-flow-domain.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { Receipt } from './types.ts';
import { digest } from './identity.ts';
import * as v from './validation.ts';
export type ReviewPolicy = { schema: 'review-policy-v1'; ruleVersion: 'risk-quorum-v1'; tier: 'ordinary' | 'high-risk' | 'benchmark-release' | 'legacy-unmigrated'; routeSha256: string; sourceContractSha256: string; purpose: 'ordinary' | 'benchmark' | 'release' | null; purposeAuthority: Receipt | null; lanes: { blind: number; fidelity: number; protocol: number }; deterministicProtocol: true };
export function requiresMeasuredTerminal(route: AdaptiveRouteRecord): boolean {
  return route.deliveryMode !== 'design-only' && (route.sourceContract.processPolicy !== undefined || route.sourceContract.reviewPurpose !== undefined);
}

/** Pure policy over an authority-validated route. Never accepts a caller-supplied quorum. */
export function deriveReviewPolicy(route: AdaptiveRouteRecord, routeSha256: string): ReviewPolicy {
  v.sha(routeSha256);
  const source = route.sourceContract;
  const purpose = source.reviewPurpose ?? null, authority = source.reviewPurposeAuthority ?? null;
  if (purpose !== null && !['ordinary', 'benchmark', 'release'].includes(purpose)) v.fail('unknown review purpose');
  if ((purpose === 'benchmark' || purpose === 'release') && !authority) v.fail('benchmark/release purpose needs its origin receipt');
  if (authority) v.receipt(authority);
  const tier = purpose === null ? 'legacy-unmigrated' : purpose !== 'ordinary' ? 'benchmark-release' : source.designAxes.failureRisk === 'high' ? 'high-risk' : 'ordinary';
  return { schema: 'review-policy-v1', ruleVersion: 'risk-quorum-v1', tier, routeSha256, sourceContractSha256: route.sourceContractSha256, purpose, purposeAuthority: authority, lanes: tier === 'ordinary' ? { blind: 1, fidelity: 0, protocol: 0 } : tier === 'high-risk' ? { blind: 2, fidelity: 1, protocol: 0 } : { blind: 2, fidelity: 2, protocol: 2 }, deterministicProtocol: true };
}
export function loadReviewPolicy(root: string, invocation: ProjectRunInvocation): ReviewPolicy {
  const route = readPersistedRoute(root, invocation), policy = deriveReviewPolicy(route, adaptiveRouteRecordSha256(route));
  if (policy.purposeAuthority) verifyReviewPurposeAuthority(root, policy.purposeAuthority, policy.purpose!, route.sourceContract.request);
  return policy;
}
export function assertReviewQuorum(policy: ReviewPolicy, lanes: readonly { lane: 'blind' | 'fidelity' | 'protocol'; executions: readonly { processPid: number; sessionId: string; nonce: string; packetSha256: string; reviewPolicySha256: string }[] }[]): void {
  v.unique(lanes.map(l => l.lane), 'review lane');
  const sessions = new Set<string>(), pids = new Set<number>(), nonces = new Set<string>();
  for (const lane of ['blind', 'fidelity', 'protocol'] as const) {
    const required = policy.lanes[lane], current = lanes.find(l => l.lane === lane);
    if (!required) { if (current) v.fail(`unselected review lane must be absent: ${lane}`); continue; }
    if (!current || current.executions.length !== required) v.fail(`review quorum mismatch: ${lane} requires ${required}`);
    const executions = current!.executions;
    if (new Set(executions.map(e => e.packetSha256)).size !== 1) v.fail('reviewers did not consume the same immutable lane packet');
    for (const e of executions) {
      if (e.reviewPolicySha256 !== digest(policy) || !Number.isSafeInteger(e.processPid) || e.processPid <= 0 || !e.sessionId || !e.nonce || pids.has(e.processPid) || sessions.has(e.sessionId) || nonces.has(e.nonce)) v.fail('reviewer execution is reused or bound to another policy');
      v.sha(e.packetSha256); pids.add(e.processPid); sessions.add(e.sessionId); nonces.add(e.nonce);
    }
  }
}
