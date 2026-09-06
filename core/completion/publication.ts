import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  checkCompletenessRun,
  checkTypographyApplicability,
  type CompletenessRun,
  type TypographyApplicabilityEvidence,
} from './evidence.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { createAdaptiveSourceSealRoute } from '../source-seal/adaptive-inputs.ts';
import type { AdaptiveSourceSealRoute } from '../source-seal/adaptive-inputs.ts';
import { validateAdaptiveFinalEvidenceV2Graph } from '../evidence/final-v2-adaptive-contract.ts';
import { validateCurrentCompositionContract } from '../composition-contract/index.ts';
import { checkAdaptiveWorkflow } from '../design-development/workflow-persistence.ts';

export type CompletionTypographyBinding = Readonly<
  | { id: 'type-proof'; status: 'selected'; path: string; sha256: string; applicability: TypographyApplicabilityEvidence }
  | { id: 'type-proof'; status: 'skipped'; reason: string; routeSha256: string; authoritySha256: string; applicability: TypographyApplicabilityEvidence }
  | { id: 'type-proof'; status: 'legacy-unassessed'; reason: string }
>;
export type CompletionPublicationResult = Readonly<{
  completeness?: CompletenessRun;
  typography: CompletionTypographyBinding;
}>;

export class CompletionPreflightError extends Error {
  override readonly name = 'CompletionPreflightError';
  constructor(reason: string) { super(`terminal completion preflight: ${reason}`); }
}
const fail = (reason: string): never => { throw new CompletionPreflightError(reason); };
const fs = nodeStableProjectFileSystem();

function dataObject(value: unknown, label: string): Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} is invalid`);
    const input = value as object;
    const prototype = Reflect.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) fail(`${label} must not inherit input properties`);
    const own = Reflect.ownKeys(input);
    if (own.some((key) => typeof key !== 'string')) fail(`${label} must not contain Symbol keys`);
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of own) {
      const name = typeof key === 'string' ? key : fail(`${label} must not contain Symbol keys`);
      const descriptor = Reflect.getOwnPropertyDescriptor(input, name) ?? fail(`${label} property disappeared while inspecting`);
      if (!descriptor.enumerable || !('value' in descriptor)) fail(`${label} must contain enumerable own data properties only`);
      result[name] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof CompletionPreflightError) throw error;
    return fail(`${label} could not be inspected safely`);
  }
}
function dataArray(value: unknown, label: string): readonly unknown[] {
  try {
    if (!Array.isArray(value)) fail(`${label} is invalid`);
    const input = value as unknown[];
    if (Reflect.getPrototypeOf(input) !== Array.prototype) fail(`${label} is invalid`);
    const own = Reflect.ownKeys(input);
    const expected = Array.from({ length: input.length }, (_, index) => String(index));
    if (own.length !== expected.length + 1 || own.some((key) => key !== 'length' && (typeof key !== 'string' || !expected.includes(key)))) fail(`${label} must be dense and undecorated`);
    return expected.map((key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key) ?? fail(`${label} entry disappeared while inspecting`);
      if (!descriptor.enumerable || !('value' in descriptor)) fail(`${label} must contain data entries only`);
      return descriptor.value;
    });
  } catch (error) {
    if (error instanceof CompletionPreflightError) throw error;
    return fail(`${label} could not be inspected safely`);
  }
}

function graphReceipts(value: unknown): Readonly<{ raw: Readonly<Record<string, unknown>>; schema: unknown; productionSchema: unknown; observations: readonly unknown[]; buildIdentity: unknown; sourceSeal: unknown; workflow: unknown; referenceDistance: unknown }> {
  const manifest = dataObject(value, 'final manifest graph');
  const graph = dataObject(manifest.graph, 'final manifest graph');
  return { raw: graph, schema: graph.schema, productionSchema: graph.productionSchema, observations: dataArray(graph.observations, 'final manifest graph observations'), buildIdentity: graph.buildIdentity, sourceSeal: graph.sourceSeal, workflow: graph.workflow, referenceDistance: graph.referenceDistance };
}
function receiptIdentity(value: unknown): string {
  const item = dataObject(value, 'final graph receipt');
  if (Object.keys(item).length !== 3 || !Object.hasOwn(item, 'path') || !Object.hasOwn(item, 'schema') || !Object.hasOwn(item, 'sha256')
    || typeof item.path !== 'string' || item.path === '' || item.path.startsWith('/') || item.path.includes('\\') || item.path.split('/').some((part) => part === '' || part === '.' || part === '..')
    || typeof item.schema !== 'string' || item.schema === ''
    || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('final graph receipt is invalid');
  return canonicalJson({ path: item.path, schema: item.schema, sha256: item.sha256 });
}
function typographyBinding(
  root: string,
  invocation: ProjectRunInvocation,
  applicability: TypographyApplicabilityEvidence,
  continuationRoute?: AdaptiveSourceSealRoute,
): CompletionTypographyBinding {
  if (!existsSync(`${root}/.omd/route.json`)) {
    const path = '.omd/type-proof.md';
    if (!existsSync(resolve(root, path))) fail('selected typography proof is missing');
    let bytes: Buffer;
    try { bytes = readStableProjectFile({ root, path: resolve(root, path), label: 'selected typography proof', fs }); }
    catch { return fail('selected typography proof is not a stable regular file'); }
    return Object.freeze({ id: 'type-proof', status: 'selected', path, sha256: createHash('sha256').update(bytes).digest('hex'), applicability });
  }
  const route = continuationRoute ?? createAdaptiveSourceSealRoute(root, invocation);
  const stage = route.stages.find((item) => item.id === 'type-proof') ?? fail('route has no typography decision');
  if (stage.status === 'selected') {
    const artifact = stage.artifacts[0] ?? fail('selected typography proof has no artifact');
    return Object.freeze({ id: 'type-proof', status: 'selected', path: artifact.path, sha256: artifact.sha256, applicability });
  }
  if (applicability.koreanDisplayText) fail('rendered Korean display text requires a selected type proof');
  if (continuationRoute === undefined) {
    const record = readPersistedRoute(root, invocation);
    const exactSkip = record.strategy.skips.find((item) => item.id === 'type-proof');
    if (exactSkip === undefined || exactSkip.reason !== stage.reason) {
      fail('typography omission is not the exact route-authorized skip');
    }
  }
  return Object.freeze({ id: 'type-proof', status: 'skipped', reason: stage.reason, routeSha256: stage.routeSha256, authoritySha256: stage.authoritySha256, applicability });
}

/** New-publication-only prerequisites; historical final-v2 records retain their original checker. */
export function checkCompletionPublicationPrerequisites(
  root: string,
  manifest: unknown,
  invocation: ProjectRunInvocation,
): CompletionPublicationResult {
  const graph = graphReceipts(manifest);
  const continuationRoute = graph.schema === 'final-evidence-v2-adaptive-omission-graph'
    ? validateAdaptiveFinalEvidenceV2Graph(graph.raw).route
    : undefined;
  const hasWorkflow = existsSync(`${root}/.omd/workflow-plan.json`);
  if (hasWorkflow) {
    if (graph.schema !== 'final-evidence-v2-workflow-graph-v1') fail('current workflow requires the additive workflow final graph');
    const workflow = checkAdaptiveWorkflow(root, invocation).binding;
    if (canonicalJson(graph.workflow) !== canonicalJson(workflow)) fail('final graph does not bind the exact current workflow plan, artifacts, and reviews');
  } else if (graph.schema === 'final-evidence-v2-workflow-graph-v1') {
    fail('workflow final graph has no current workflow plan');
  }
  if (graph.schema === 'final-evidence-v2-graph' || (graph.schema === 'final-evidence-v2-workflow-graph-v1'
    && graph.productionSchema === 'final-evidence-v2-graph')) {
    const distance = dataObject(graph.referenceDistance, 'selected reference distance receipt');
    receiptIdentity(distance);
    if (distance.path !== '.omd/selected-reference-distance.json'
      || distance.schema !== 'selected-reference-distance-v1') {
      fail('selected reference distance receipt is not the current typed gate');
    }
    const compositionFindings = validateCurrentCompositionContract(root, invocation);
    if (compositionFindings.length > 0) {
      fail(`current composition contract is invalid: ${compositionFindings.map((finding) => `${finding.id} ${finding.path}`).join(', ')}`);
    }
  }
  if (!existsSync(`${root}/.omd/functional-requirements.json`)) {
    if (existsSync(`${root}/.omd/route.json`)) {
      fail('current routed publication requires functional requirements and a completeness run');
    }
    return Object.freeze({ typography: Object.freeze({
      id: 'type-proof',
      status: 'legacy-unassessed',
      reason: 'historical non-routed publication has no completion requirements',
    }) });
  }
  const completeness = checkCompletenessRun(root, invocation, continuationRoute);
  const applicabilityReceipt = completeness.typographyApplicability
    ?? fail('completeness run predates immutable typography applicability evidence');
  const applicability = checkTypographyApplicability(root, applicabilityReceipt);
  const typography = typographyBinding(root, invocation, applicability, continuationRoute);
  if (receiptIdentity(graph.buildIdentity) !== receiptIdentity(completeness.buildIdentity)
    || receiptIdentity(graph.sourceSeal) !== receiptIdentity(completeness.sourceSeal)) {
    fail('completeness run does not bind the exact final build and source seal');
  }
  return Object.freeze({ completeness, typography });
}
