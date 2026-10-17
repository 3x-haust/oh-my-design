import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseTrustedOutcomeProjection, validateTrustedOutcomeEvidence } from '../evidence/final-v2-outcome-gate.ts';
import { readPersistedRoute, adaptiveRouteRecordSha256 } from '../route/adaptive-route-persistence.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { validateObservationV2 } from './observation.ts';
import { parseTrustedBrowserReceipt, trustedBrowserReceiptSha256 } from './trusted-browser-receipt.ts';
import { deriveTrustedEvaluationRefSets, parseTrustedLifecycleManifest } from './trusted-evaluation-contract.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';
import { reviewerText } from './reviewer-text.ts';

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fail = (detail: string): never => { throw new Error(`NATIVE_OUTCOME_REVIEW_INVALID:${detail}`); };
const object = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fail('object required');
  return Object.fromEntries(Object.entries(value));
};

export function nativeOutcomeExecutionEvidence(root: string, invocation: ProjectRunInvocation, observationSha256: string) {
  const read = (path: string): Buffer => readStableProjectFile({
    root, path: resolve(root, path), label: 'outcome execution evidence', fs: nodeStableProjectFileSystem(),
  });
  if (!/^[a-f0-9]{64}$/.test(observationSha256)) return fail('observation digest');
  const observationBytes = read(`.omd/observation-v2/sha256-${observationSha256}.json`);
  if (hash(observationBytes) !== observationSha256) return fail('observation changed');
  const observation = validateObservationV2(JSON.parse(observationBytes.toString('utf8')));
  const route = readPersistedRoute(root, invocation);
  validateTrustedOutcomeEvidence({
    root, invocation, branch: 'adaptive-omission', required: true, observations: [observation],
    expected: { buildSha256: invocation.current.buildSha256, routeSha256: adaptiveRouteRecordSha256(route),
      sourceContractSha256: route.sourceContractSha256, sourceContract: route.sourceContract },
  });
  const projection = parseTrustedOutcomeProjection(object(observation.evidence).trustedOutcome);
  const receipt = parseTrustedBrowserReceipt(JSON.parse(
    read(`.omd/trusted-browser-receipt-sha256-${projection.receiptSha256}.json`).toString('utf8')));
  if (trustedBrowserReceiptSha256(receipt) !== projection.receiptSha256) return fail('receipt changed');
  if (receipt.schema !== 'trusted-browser-receipt-v2' || receipt.executionPlanSha256 === undefined) {
    return fail('current execution plan required; rerun native evaluation');
  }
  const planBytes = read(`.omd/evaluation-plans/sha256-${receipt.executionPlanSha256}.json`);
  if (hash(planBytes) !== receipt.executionPlanSha256) return fail('execution plan changed');
  const plan = parseTrustedLifecycleManifest(JSON.parse(planBytes.toString('utf8')));
  const refs = deriveTrustedEvaluationRefSets({
    sourceContractSha256: route.sourceContractSha256,
    taskOutcome: route.sourceContract.taskOutcome, evidenceClaims: route.sourceContract.evidenceClaims,
  }).requiredOutcomeRefs;
  if (plan.entryPath !== receipt.productionPath
    || canonicalJson(plan.scripts.map(script => script.outcomeRef).sort()) !== canonicalJson([...refs].sort())) {
    return fail('execution coverage');
  }
  const requirements = (['mustHave', 'mustNotHave', 'completionEvidence'] as const)
    .flatMap(kind => route.sourceContract.taskOutcome[kind].map(requirement => ({ kind, requirement })));
  return {
    receiptSha256: projection.receiptSha256, executionPlanSha256: receipt.executionPlanSha256,
    productionRevisionSha256: receipt.productionRevisionSha256,
    transcript: receipt.transcript,
    outcomes: plan.scripts.map(script => {
      const requirement = requirements[refs.indexOf(script.outcomeRef)] ?? fail('requirement missing');
      const result = receipt.outcomeResults.find(row => row.outcomeRef === script.outcomeRef)
        ?? fail('execution result missing');
      const actions = script.actions.map(action => {
        switch (action.kind) {
          case 'click': return action;
          case 'press': return action;
          case 'reload': return action;
          case 'fill': return { ...action, value: reviewerText(action.value) };
          default: return action satisfies never;
        }
      });
      return { ...requirement, ...script, actions, executionStatus: result.status, findings: result.findings,
        captures: receipt.captures.filter(capture => capture.outcomeRef === undefined || capture.outcomeRef === script.outcomeRef)
          .map(({ sha256, width, height }) => ({ sha256, width, height })) };
    }),
  };
}

export type NativeOutcomeAssessment = Readonly<{
  outcomeRef: string;
  verdict: 'pass';
  rationale: string;
  receiptSha256: string;
  executionPlanSha256: string;
  captureSha256s: readonly string[];
}>;

export function validateCurrentOutcomeAssessments(
  root: string, invocation: ProjectRunInvocation, observationSha256: string, assessments: unknown,
  observationPath = `.omd/observation-v2/sha256-${observationSha256}.json`,
): void {
  if (!/^[a-f0-9]{64}$/.test(observationSha256)) return fail('observation digest');
  const read = (path: string) => readStableProjectFile({
    root, path: resolve(root, path), label: 'outcome assessment binding', fs: nodeStableProjectFileSystem(),
  });
  const observationBytes = read(observationPath);
  if (hash(observationBytes) !== observationSha256) return fail('observation changed');
  const observation = validateObservationV2(JSON.parse(observationBytes.toString('utf8')));
  const trustedOutcome = object(observation.evidence).trustedOutcome;
  if (trustedOutcome === undefined) {
    if (assessments !== undefined) fail('assessments require executed outcome evidence');
    return;
  }
  const projection = parseTrustedOutcomeProjection(trustedOutcome);
  const receipt = parseTrustedBrowserReceipt(JSON.parse(
    read(`.omd/trusted-browser-receipt-sha256-${projection.receiptSha256}.json`).toString('utf8')));
  if (receipt.schema === 'trusted-browser-receipt-v2') {
    validateNativeOutcomeAssessments(assessments, nativeOutcomeExecutionEvidence(root, invocation, observationSha256));
  } else if (assessments !== undefined) fail('assessments require current execution evidence');
}

export function validateNativeOutcomeAssessments(
  input: unknown,
  evidence: ReturnType<typeof nativeOutcomeExecutionEvidence>,
): readonly NativeOutcomeAssessment[] {
  if (!Array.isArray(input) || input.length !== evidence.outcomes.length) return fail('assessment coverage');
  return input.map((value, index) => {
    const row = object(value);
    const outcome = evidence.outcomes[index] ?? fail('unknown outcome');
    const keys = ['outcomeRef', 'verdict', 'rationale', 'receiptSha256', 'executionPlanSha256', 'captureSha256s'];
    if (Object.keys(row).sort().join(',') !== keys.sort().join(',')
      || row.outcomeRef !== outcome.outcomeRef || row.verdict !== 'pass'
      || outcome.executionStatus !== 'pass'
      || typeof row.rationale !== 'string' || row.rationale.trim() === ''
      || row.receiptSha256 !== evidence.receiptSha256
      || row.executionPlanSha256 !== evidence.executionPlanSha256
      || !Array.isArray(row.captureSha256s) || row.captureSha256s.length === 0
      || row.captureSha256s.some(digest => typeof digest !== 'string'
        || !outcome.captures.some(capture => capture.sha256 === digest))
      || new Set(row.captureSha256s).size !== row.captureSha256s.length) return fail('assessment rejected or unbound');
    return Object.freeze({
      outcomeRef: outcome.outcomeRef, verdict: 'pass' as const, rationale: row.rationale,
      receiptSha256: evidence.receiptSha256, executionPlanSha256: evidence.executionPlanSha256,
      captureSha256s: Object.freeze([...row.captureSha256s]) as readonly string[],
    });
  });
}
