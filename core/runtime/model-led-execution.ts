import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { validateDecisionGraph, type DesignDecision } from '../deliberation/contracts.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { servedProjectTreeSha256 } from '../render/serve.ts';
import { listProductionSourceFiles } from '../source-seal/index.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { isModelLedProcess } from '../route/process-policy.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { getNativePiRun } from './native-pi-run.ts';
import { createProjectWriteAdapter } from './project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';
import { parseTrustedLifecycleManifest, trustedEvaluationPlanBytes } from './trusted-evaluation-contract.ts';
import { consultedReferenceProjection } from '../design/consulted-references.ts';

export function modelLedCompletionFingerprint(root: string, manifest?: unknown): string {
  const fs = nodeStableProjectFileSystem();
  const read = (path: string) => readStableProjectFile({ root, path: resolve(root, path), label: path, fs });
  const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const files = [...listProductionSourceFiles(root), '.omd/route.json']
    .map(path => [path, sha(read(path))]);
  const plan = manifest ?? JSON.parse(read('.omd/.cache/trusted-lifecycle-manifest.json').toString('utf8'));
  return sha(Buffer.from(canonicalJson({ files, manifest: sha(trustedEvaluationPlanBytes(parseTrustedLifecycleManifest(plan))),
    consultedReferencesSha256: consultedReferenceProjection(root)?.context.sha256 ?? null })));
}

/**
 * Record what the harness actually executes. Never manufacture alternatives,
 * research, trade-offs or a maker's design judgment to satisfy a document gate.
 */
export function recordModelLedExecution(root: string, invocation: ProjectRunInvocation, entryPath: string): void {
  const route = readPersistedRoute(root, invocation);
  if (!isModelLedProcess(route.sourceContract)) return;
  const run = getNativePiRun(invocation, root);
  if (run.designPolicy?.criteriaVersion !== 'model-led-design-v1') throw new Error('MODEL_LED_HOST_POLICY_REQUIRED');
  const path = '.omd/decision-graph.json';
  const previous = existsSync(resolve(root, path))
    ? readStableProjectFile({ root, path: resolve(root, path), label: 'existing decision graph', fs: nodeStableProjectFileSystem() })
    : undefined;
  const graph = previous === undefined ? undefined : validateDecisionGraph(JSON.parse(previous.toString('utf8')));
  if (graph !== undefined && graph.value === undefined) {
    throw new Error(`NATIVE_EVALUATION_DECISION_GRAPH_INVALID: ${graph.findings.map(f => `${f.path}: ${f.message}`).join('; ')}`);
  }
  const decisions = graph?.value?.decisions.filter(decision => decision.origin === undefined) ?? [];
  const id = 'current-production-execution';
  if (decisions.some(decision => decision.id === id)) throw new Error('MODEL_LED_EXECUTION_ID_CONFLICT');
  const execution: DesignDecision = {
    id, stage: 'production', owner: 'omd-hand', risk: 'low',
    origin: { kind: 'harness-execution-v1', runId: run.runId, entryPath,
      productionRevisionSha256: servedProjectTreeSha256(root, entryPath) },
    question: 'Execute real browser verification against the current production snapshot.',
    alternatives: [{ id: 'execute-current', label: entryPath }], selected: 'execute-current',
    evidence: [entryPath], constraints: [`source-contract:${route.sourceContractSha256}`],
    rejected: [], affects: ['production-execution'], dependsOn: [], reversible: true, tradeoffs: [],
  };
  const value = { schema: 'decision-graph-v1', decisions: [...decisions, execution] };
  const checked = validateDecisionGraph(value);
  if (!checked.value) throw new Error(`NATIVE_EVALUATION_DECISION_GRAPH_INVALID: ${checked.findings.map(f => f.message).join('; ')}`);
  const bytes = Buffer.from(`${canonicalJson(value)}\n`);
  if (previous?.equals(bytes)) return;
  createProjectWriteAdapter(root, invocation).write(path, bytes);
}
