import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createBuildIdentityFromSource } from '../../adapters/build-identity.ts';
import { requireTrustedBrowserEvaluation, runTrustedBrowserEvaluation } from '../../adapters/trusted-browser-runner.ts';
import { validateDecisionGraph } from '../deliberation/contracts.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { authorizeNativePiPayload, getNativePiRun } from './native-pi-run.ts';
import { observationV2Sha256 } from './observation.ts';
import { createProjectWriteAdapter } from './project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';
import {
  deriveTrustedDecisionRefs, deriveTrustedEvaluationIdentity, parseTrustedLifecycleManifest,
  trustedEvaluationPlanBytes,
} from './trusted-evaluation-contract.ts';
import { writeTrustedEvaluationObservation } from './trusted-evaluation-observation.ts';
import { deriveTrustedEvaluationPlanFromProject } from './trusted-evaluation-plan.ts';

export class NativeEvaluationError extends Error {
  override readonly name = 'NativeEvaluationError';
  readonly code: 'NATIVE_EVALUATION_MANIFEST_MISMATCH' | 'NATIVE_EVALUATION_BUILD_MISMATCH'
    | 'NATIVE_EVALUATION_DECISION_GRAPH_INVALID' | 'NATIVE_EVALUATION_PLAN_CHANGED'
    | 'NATIVE_EVALUATION_OUTCOME_BINDING_INVALID';
  constructor(code: NativeEvaluationError['code']) {
    super(code);
    this.code = code;
  }
}

export type NativeEvaluationInput = Readonly<{
  root: string;
  packRoot: string;
  invocation: ProjectRunInvocation;
  manifest?: unknown;
}>;

export async function runNativeEvaluation(input: NativeEvaluationInput) {
  const root = resolve(input.root);
  const run = getNativePiRun(input.invocation, root);
  const manifest = deriveTrustedEvaluationPlanFromProject({ root, invocation: input.invocation });
  const manifestBytes = trustedEvaluationPlanBytes(manifest);
  if (input.manifest !== undefined
    && !trustedEvaluationPlanBytes(parseTrustedLifecycleManifest(input.manifest)).equals(manifestBytes)) {
    throw new NativeEvaluationError('NATIVE_EVALUATION_MANIFEST_MISMATCH');
  }
  const build = createBuildIdentityFromSource(resolve(input.packRoot, '..'));
  if (build.buildSha256 !== input.invocation.current.buildSha256
    || build.sourceSkillSha256 !== input.invocation.current.loadedSkillSha256) {
    throw new NativeEvaluationError('NATIVE_EVALUATION_BUILD_MISMATCH');
  }
  const route = readPersistedRoute(root, input.invocation);
  const routeSha256 = adaptiveRouteRecordSha256(route);
  const graphBytes = readStableProjectFile({ root, path: resolve(root, '.omd/decision-graph.json'),
    label: 'native evaluation decision graph', fs: nodeStableProjectFileSystem() });
  const graphInput: unknown = JSON.parse(graphBytes.toString('utf8'));
  const graph = validateDecisionGraph(graphInput);
  if (graph.value === undefined || graph.value.decisions.length === 0) {
    throw new NativeEvaluationError('NATIVE_EVALUATION_DECISION_GRAPH_INVALID');
  }
  const identity = deriveTrustedEvaluationIdentity({
    sourceContractSha256: route.sourceContractSha256, taskOutcome: route.sourceContract.taskOutcome,
    evidenceClaims: route.sourceContract.evidenceClaims, allowedPaths: route.allowedPaths, entryPath: manifest.entryPath,
  });
  const boundManifest = { ...manifest, scripts: manifest.scripts.map(script => {
    const prefix = `outcome:${identity.sourceContractSha256}:${script.outcomeRef}:`;
    const outcomeRef = identity.requiredOutcomeRefs.find(ref => ref.startsWith(prefix));
    if (outcomeRef === undefined) throw new NativeEvaluationError('NATIVE_EVALUATION_OUTCOME_BINDING_INVALID');
    return { ...script, outcomeRef };
  }) };
  const writer = createProjectWriteAdapter(root, input.invocation);
  writer.write('.omd/build.json', `${canonicalJson(build)}\n`);
  const evaluation = requireTrustedBrowserEvaluation(await runTrustedBrowserEvaluation({
    root, manifest: boundManifest,
    binding: {
      runId: run.runId, routeSha256, sourceContractSha256: route.sourceContractSha256,
      activationBuildSha256: input.invocation.current.buildSha256,
      productionRevisionSha256: servedProjectTreeSha256(root, manifest.entryPath), productionPath: manifest.entryPath,
      decisionGraphSha256: createHash('sha256').update(graphBytes).digest('hex'),
      requiredOutcomeRefs: identity.requiredOutcomeRefs, confirmedClaimRefs: identity.confirmedClaimRefs,
      decisionRefs: deriveTrustedDecisionRefs(route.sourceContractSha256, graph.value.decisions),
    },
    artifacts: { write: (path, bytes) => { writer.writeContentAddressed(path, bytes); } },
  }));
  getNativePiRun(input.invocation, root);
  const currentPlan = deriveTrustedEvaluationPlanFromProject({ root, invocation: input.invocation });
  if (!trustedEvaluationPlanBytes(currentPlan).equals(manifestBytes)
    || adaptiveRouteRecordSha256(readPersistedRoute(root, input.invocation)) !== routeSha256) {
    throw new NativeEvaluationError('NATIVE_EVALUATION_PLAN_CHANGED');
  }
  authorizeNativePiPayload(input.invocation, root, 'product-probe-result',
    Buffer.from(`${canonicalJson(evaluation.receipt)}\n`));
  const observation = writeTrustedEvaluationObservation({ root, writer, invocation: input.invocation,
    evaluation, currentArtifactPath: '.omd/build.json', productionArtifactPath: manifest.entryPath,
    requireDecisionGraph: true });
  const observationSha256 = observationV2Sha256(observation);
  return Object.freeze({
    ok: evaluation.receipt.outcomeResults.every(row => row.status === 'pass')
      && Object.values(evaluation.receipt.hardFloors).every(status => status === 'pass')
      && evaluation.receipt.entrySurface?.status !== 'fail',
    manifest, observation, observationSha256,
    observationPath: `.omd/observation-v2/sha256-${observationSha256}.json`,
    receipt: evaluation.receipt, receiptSha256: evaluation.receiptSha256,
    receiptPath: `.omd/trusted-browser-receipt-sha256-${evaluation.receiptSha256}.json`,
  });
}
