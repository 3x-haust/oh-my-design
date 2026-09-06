import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { validateDecisionGraph } from '../core/deliberation/contracts.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { parseTaskFlowBenchmarkProjection } from '../core/ref/task-flow-benchmark.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { createLocalCliInvocation } from '../core/runtime/activation.ts';
import { observationV2Sha256 } from '../core/runtime/observation.ts';
import { createProjectWriteAdapter } from '../core/runtime/project-write.ts';
import {
  deriveTrustedDecisionRefs,
  deriveTrustedEvaluationIdentity,
  parseTrustedLifecycleManifest,
  trustedEvaluationPlanBytes,
  type TrustedLifecycleManifest,
} from '../core/runtime/trusted-evaluation-contract.ts';
import { servedProjectTreeSha256 } from '../core/render/serve.ts';
import {
  parseTrustedProjectContract,
  requireExactEvaluationCoverage,
  trustedProjectContractSha256,
} from '../core/runtime/trusted-project-contract.ts';
import {
  requireProductProbeResultAuthorization,
  type ProjectRunInvocation,
} from '../core/runtime/invocation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../core/runtime/stable-project-file.ts';
import { writeTrustedEvaluationObservation } from '../core/runtime/trusted-evaluation-observation.ts';
import {
  runTrustedBrowserEvaluation,
  TRUSTED_BROWSER_EVALUATOR_REVISION,
} from './trusted-browser-runner.ts';
import { deriveTrustedEvaluationPlanFromProject } from '../core/runtime/trusted-evaluation-plan.ts';

const hash = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

function projectRelative(root: string, path: string): string {
  const target = isAbsolute(path) ? realpathSync(path) : realpathSync(resolve(root, path));
  const rel = relative(root, target);
  if (rel === '' || rel.startsWith('..') || rel.includes('\\')) {
    throw new Error('TRUSTED_LIFECYCLE_PATH_OUTSIDE_PROJECT');
  }
  return rel;
}

function decisionBinding(
  root: string,
  fs: ReturnType<typeof nodeStableProjectFileSystem>,
  sourceContractSha256: string,
  fallbackRefs: readonly string[],
  required: boolean,
): Readonly<{ decisionGraphSha256: string; decisionRefs: readonly string[] }> {
  const path = resolve(root, '.omd/decision-graph.json');
  if (!existsSync(path)) {
    if (required) throw new Error('TRUSTED_LIFECYCLE_DECISION_GRAPH_REQUIRED');
    return Object.freeze({
      decisionGraphSha256: hash(canonicalJson(fallbackRefs)),
      decisionRefs: fallbackRefs,
    });
  }
  const bytes = readStableProjectFile({ root, path, label: 'trusted lifecycle decision graph', fs });
  let graphInput: unknown;
  try { graphInput = JSON.parse(bytes.toString('utf8')) as unknown; } catch {
    throw new Error('TRUSTED_LIFECYCLE_DECISION_GRAPH_INVALID');
  }
  const graph = validateDecisionGraph(graphInput);
  if (graph.value === undefined) throw new Error('TRUSTED_LIFECYCLE_DECISION_GRAPH_INVALID');
  return Object.freeze({
    decisionGraphSha256: hash(bytes),
    decisionRefs: deriveTrustedDecisionRefs(sourceContractSha256, graph.value.decisions),
  });
}

export async function runTrustedLifecycle(input: Readonly<{
  project: string;
  manifestPath: string;
  cliPath: string;
  argv: readonly string[];
  invocation?: ProjectRunInvocation;
}>): Promise<Readonly<{
  status: 'PASS' | 'FAIL';
  readyForFinalization: boolean;
  receiptPath: string;
  observationPath: string;
}>> {
  const root = realpathSync(input.project);
  const invocation = input.invocation ?? createLocalCliInvocation({
    cliPath: input.cliPath,
    argv: input.argv,
    projectRoot: root,
    brief: { command: input.argv },
  });
  const parsedManifest = parseTrustedLifecycleManifest(
    JSON.parse(readFileSync(realpathSync(input.manifestPath), 'utf8')) as unknown,
  );
  const entryPath = projectRelative(root, parsedManifest.entryPath);
  const manifest: TrustedLifecycleManifest = Object.freeze({ ...parsedManifest, entryPath });
  const fs = nodeStableProjectFileSystem();
  const routed = existsSync(resolve(root, '.omd/route.json'))
    ? readPersistedRoute(root, invocation)
    : undefined;
  const contract = routed === undefined ? (() => {
    const contractBytes = readStableProjectFile({
      root,
      path: resolve(root, '.omd/trusted-lifecycle-contract.json'),
      label: 'trusted lifecycle project contract',
      fs,
    });
    return parseTrustedProjectContract(JSON.parse(contractBytes.toString('utf8')) as unknown);
  })() : undefined;
  const source = routed?.sourceContract ?? contract!;
  const sourceContractSha256 = routed?.sourceContractSha256
    ?? trustedProjectContractSha256(contract!);
  if (routed !== undefined) {
    requireProductProbeResultAuthorization(
      invocation,
      root,
      trustedEvaluationPlanBytes(manifest),
    );
  }
  requireExactEvaluationCoverage(source, manifest.scripts);
  const benchmarkRequired = routed?.gates.includes('greenfield-task-flow-benchmark') === true;
  if (!benchmarkRequired && manifest.entrySurface !== undefined) {
    throw new Error('TRUSTED_ENTRY_SURFACE_NOT_APPLICABLE');
  }
  if (benchmarkRequired) {
    const entrySurface = manifest.entrySurface;
    if (entrySurface === undefined) throw new Error('TRUSTED_ENTRY_SURFACE_REQUIRED');
    const benchmarkBytes = readStableProjectFile({
      root,
      path: resolve(root, '.omd/task-flow-benchmark-projection.json'),
      label: 'trusted entry-surface benchmark projection',
      fs,
    });
    if (hash(benchmarkBytes) !== entrySurface.benchmarkProjectionSha256) {
      throw new Error('TRUSTED_ENTRY_SURFACE_PROJECTION_STALE');
    }
    let projectionInput: unknown;
    try { projectionInput = JSON.parse(benchmarkBytes.toString('utf8')) as unknown; } catch {
      throw new Error('TRUSTED_ENTRY_SURFACE_PROJECTION_INVALID');
    }
    let projection;
    try {
      projection = parseTaskFlowBenchmarkProjection(projectionInput, {
        expectedSourceContractSha256: sourceContractSha256,
      });
    } catch {
      throw new Error('TRUSTED_ENTRY_SURFACE_PROJECTION_INVALID');
    }
    const dependent = projection.taskSteps.find(({ id }) => id === entrySurface.dependentTaskId);
    if (dependent === undefined
      || !dependent.dependsOn.includes(entrySurface.prerequisiteTaskId)) {
      throw new Error('TRUSTED_ENTRY_SURFACE_EDGE_INVALID');
    }
    const derivedManifest = deriveTrustedEvaluationPlanFromProject({ root, invocation });
    if (!trustedEvaluationPlanBytes(derivedManifest).equals(trustedEvaluationPlanBytes(manifest))) {
      throw new Error('TRUSTED_EVALUATION_PLAN_DERIVATION_MISMATCH');
    }
  }
  const identity = deriveTrustedEvaluationIdentity({
    sourceContractSha256,
    taskOutcome: source.taskOutcome,
    evidenceClaims: source.evidenceClaims,
    allowedPaths: source.allowedPaths,
    entryPath,
  });
  const authorizedManifest: TrustedLifecycleManifest = Object.freeze({
    ...manifest,
    scripts: Object.freeze(manifest.scripts.map((script, index) => Object.freeze({
      ...script,
      outcomeRef: identity.requiredOutcomeRefs[index]!,
    }))),
  });
  const decisions = decisionBinding(
    root,
    fs,
    sourceContractSha256,
    contract?.decisionRefs ?? [],
    routed !== undefined,
  );
  const entryBytes = readStableProjectFile({
    root,
    path: resolve(root, entryPath),
    label: 'trusted lifecycle entry',
    fs,
  });
  const productionRevisionSha256 = servedProjectTreeSha256(root, entryPath);
  const writer = createProjectWriteAdapter(root, invocation);
  writer.mkdir('.omd');
  const buildPath = '.omd/build-identity.json';
  writer.write(buildPath, `${canonicalJson({
    schemaVersion: 'omd-build-identity-v1',
    packageVersion: 'trusted-lifecycle',
    buildSha256: invocation.current.buildSha256,
    sourceSkillSha256: invocation.current.loadedSkillSha256,
  })}\n`);
  const bindings = {
    sourceContractSha256,
    routeSha256: routed === undefined
      ? hash(`route:${sourceContractSha256}`)
      : adaptiveRouteRecordSha256(routed),
    decisionGraphSha256: decisions.decisionGraphSha256,
    requiredOutcomeRefs: identity.requiredOutcomeRefs,
    confirmedClaimRefs: identity.confirmedClaimRefs,
    decisionRefs: decisions.decisionRefs,
    productionRevisionSha256,
    productionPath: entryPath,
  };
  const runId = `sha256-${hash(canonicalJson({
    manifest: authorizedManifest,
    evaluatorRevision: TRUSTED_BROWSER_EVALUATOR_REVISION,
    buildSha256: invocation.current.buildSha256,
    productionRevisionSha256,
  }))}`;
  const evaluation = await runTrustedBrowserEvaluation({
    root,
    manifest: authorizedManifest,
    binding: {
      runId,
      ...bindings,
      activationBuildSha256: invocation.current.buildSha256,
    },
    artifacts: {
      write(relativePath, bytes) {
        writer.writeContentAddressed(relativePath, bytes);
      },
    },
  });
  const receiptPath = `.omd/evaluation-runs/${runId}/receipt.json`;
  const receiptBytes = Buffer.from(`${canonicalJson(evaluation.receipt)}\n`);
  if (routed !== undefined && process.env.OMD_CODEX_AUTHORITY_SOCKET !== undefined) {
    requireProductProbeResultAuthorization(invocation, root, receiptBytes);
  }
  writer.writeContentAddressed(receiptPath, receiptBytes);
  const observation = writeTrustedEvaluationObservation({
    root,
    writer,
    invocation,
    evaluation,
    currentArtifactPath: buildPath,
    productionArtifactPath: entryPath,
    requireDecisionGraph: routed !== undefined,
  });
  const observationSha256 = observationV2Sha256(observation);
  const observationPath = `.omd/observation-v2/sha256-${observationSha256}.json`;
  const status = evaluation.receipt.outcomeResults.every((result) => result.status === 'pass')
    && Object.values(evaluation.receipt.hardFloors).every((floor) => floor === 'pass')
    ? 'PASS' as const : 'FAIL' as const;
  return Object.freeze({
    status,
    readyForFinalization: routed !== undefined,
    receiptPath,
    observationPath,
  });
}
