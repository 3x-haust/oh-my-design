import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { makerFail } from '../../adapters/pi-maker-contract.ts';
import { piRecord } from '../../adapters/pi-reviewer-contract.ts';
import { parseTrustedOutcomeProjection } from '../evidence/final-v2-outcome-gate.ts';
import { sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { currentNativeFinalObservations } from './native-final-manifest.ts';
import { requireNativePiPayload } from './native-pi-run.ts';
import { parseTrustedBrowserReceipt, trustedBrowserReceiptSha256 } from './trusted-browser-receipt.ts';
import { parseTrustedLifecycleManifest } from './trusted-evaluation-contract.ts';

/** Failed executions are repair input too; do not use the final-acceptance checker here. */
export function makerEvaluationLineage(root: string, invocation: ProjectRunInvocation) {
  if (!existsSync(join(root, '.omd/observation-v2.json'))) return [];
  const read = (path: string) => readContainedRegularFile(root, path, 'maker evaluator lineage');
  return currentNativeFinalObservations(root).map(observation => {
    const evidence = piRecord(observation.value.evidence, 'maker-observation-evidence');
    const projection = parseTrustedOutcomeProjection(evidence.trustedOutcome);
    const bytes = read(`.omd/trusted-browser-receipt-sha256-${projection.receiptSha256}.json`);
    requireNativePiPayload(invocation, root, 'product-probe-result', bytes);
    const receipt = parseTrustedBrowserReceipt(JSON.parse(bytes.toString('utf8')));
    if (trustedBrowserReceiptSha256(receipt) !== projection.receiptSha256
      || receipt.activationBuildSha256 !== invocation.current.buildSha256
      || receipt.executionPlanSha256 === undefined) makerFail('evaluation-lineage-binding');
    const planBytes = read(`.omd/evaluation-plans/sha256-${receipt.executionPlanSha256}.json`);
    if (sha256(planBytes) !== receipt.executionPlanSha256) makerFail('evaluation-plan-drift');
    const plan = parseTrustedLifecycleManifest(JSON.parse(planBytes.toString('utf8')));
    return {
      kind: 'browser-execution', observationSha256: observation.receipt.sha256,
      predecessorSha256: observation.value.predecessorSha256,
      receiptSha256: projection.receiptSha256, executionPlanSha256: receipt.executionPlanSha256,
      routeSha256: receipt.routeSha256, sourceContractSha256: receipt.sourceContractSha256,
      productionRevisionSha256: receipt.productionRevisionSha256,
      plan, outcomeResults: receipt.outcomeResults, hardFloors: receipt.hardFloors,
      entrySurface: receipt.entrySurface ?? null, captures: receipt.captures,
    };
  });
}
