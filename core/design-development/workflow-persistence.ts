import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';

import { requireWorkflowProductionSliceAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import {
  acquireProjectMutationLock,
  replaceProjectFileAtomically,
  requireProjectWriteAdapterForInvocation,
  type ProjectWriteAdapter,
} from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { adaptiveRouteAuthorityBytes, adaptiveRouteAuthorityPath } from '../route/adaptive-route-authority.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';
import { parseContentStateModel, CONTENT_STATE_MODEL_SCHEMA } from './content-state-model.ts';
import { parseStructuralWireframe } from './structural-wireframe.ts';
import { parseComponentStressProof } from './component-stress-proof.ts';
import { COMPONENT_STRESS_PROOF_V2_SCHEMA, INTERACTION_BEHAVIOR_PROOF_SCHEMA, parseComponentStressProofV2, parseInteractionBehaviorProof } from './production-proofs.ts';
import {
  ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_INPUT_SCHEMA,
  ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA,
  createWorkflowProductionSlice,
  parseWorkflowProductionSlice,
  workflowProductionSliceBytes,
  type AdaptiveWorkflowProductionSlice,
} from './production-slice.ts';
import { parseDecisionPrincipleBindings } from './decision-principle-bindings.ts';
import { decodePng } from '../motion/energy.ts';
import { validateStructureReviewShape, DESIGN_REVIEW_SCHEMA } from './structure-review.ts';
import {
  adaptiveWorkflowPlanPath,
  adaptiveWorkflowPlanSha256,
  canonicalWorkflowPlanJson,
  createAdaptiveWorkflowPlan,
  parseAdaptiveWorkflowPlan,
  type AdaptiveWorkflowPlan,
} from './workflow-plan.ts';

export const ADAPTIVE_WORKFLOW_PLAN_POINTER_SCHEMA = 'adaptive-workflow-plan-pointer-v1' as const;
export const ADAPTIVE_WORKFLOW_ARTIFACT_SELECTION_SCHEMA = 'adaptive-workflow-artifact-selection-v1' as const;
export const ADAPTIVE_WORKFLOW_ARTIFACT_POINTER_SCHEMA = 'adaptive-workflow-artifact-pointer-v1' as const;
export const ADAPTIVE_WORKFLOW_SOURCE_BINDING_SCHEMA = 'adaptive-workflow-source-binding-v1' as const;
export const ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_SCHEMA = 'adaptive-workflow-production-readiness-v1' as const;
export const ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_POINTER_SCHEMA = 'adaptive-workflow-production-readiness-pointer-v1' as const;
export const ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_POINTER_SCHEMA = 'adaptive-workflow-production-slice-pointer-v1' as const;

const SHA256 = /^[a-f0-9]{64}$/;
const PLAN_RECORD = /^workflow-plan-runs\/sha256-([a-f0-9]{64})\.json$/;
const ARTIFACT_RECORD = /^workflow-artifact-runs\/sha256-([a-f0-9]{64})\.json$/;
const READINESS_RECORD = /^workflow-production-readiness-runs\/sha256-([a-f0-9]{64})\.json$/;
const SLICE_RECORD = /^workflow-production-slice-runs\/sha256-([a-f0-9]{64})\.json$/;
const PRODUCTION_DEPENDENT_KINDS = new Set(['component-in-context', 'interaction-behavior']);
const fs = nodeStableProjectFileSystem();
const hash = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const fail = (reason: string): never => { throw new Error(`adaptive workflow persistence: ${reason}`); };
const object = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const ownKeys = Reflect.ownKeys(value);
  const actual = ownKeys.filter((key): key is string => typeof key === 'string').sort();
  const expected = [...keys].sort();
  if (ownKeys.length !== expected.length
    || actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
    || actual.some((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value');
    })) fail(`${label} has unexpected keys`);
};
const safePath = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\')
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')) fail(`${label} is not a safe project-relative path`);
  return value as string;
};
const digest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} is not a SHA-256 digest`);
  return value as string;
};
const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} must be non-empty text`);
  return value as string;
};

export type WorkflowArtifactReceipt = Readonly<{ path: string; schema: string; sha256: string }>;
export type WorkflowPointer = Readonly<{ schema: string; record: string; sha256: string }>;
export type WorkflowArtifactSelection = Readonly<{
  schema: typeof ADAPTIVE_WORKFLOW_ARTIFACT_SELECTION_SCHEMA;
  plan: WorkflowArtifactReceipt;
  artifacts: readonly Readonly<{ investigationId: string; artifact: WorkflowArtifactReceipt }>[];
  reviews: readonly WorkflowArtifactReceipt[];
}>;
export type WorkflowProductionReadiness = Readonly<{
  schema: typeof ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_SCHEMA;
  plan: WorkflowArtifactReceipt;
  artifacts: readonly Readonly<{ investigationId: string; artifact: WorkflowArtifactReceipt }>[];
  reviews: readonly WorkflowArtifactReceipt[];
}>;
export type AdaptiveWorkflowSourceBinding = Readonly<{
  schema: typeof ADAPTIVE_WORKFLOW_SOURCE_BINDING_SCHEMA;
  route: AdaptiveWorkflowPlan['route'];
  plan: Readonly<{ pointer: WorkflowArtifactReceipt; record: WorkflowArtifactReceipt }>;
  artifacts: null | Readonly<{ pointer: WorkflowArtifactReceipt; record: WorkflowArtifactReceipt }>;
}>;
export type CurrentAdaptiveWorkflow = Readonly<{
  plan: AdaptiveWorkflowPlan;
  planReceipt: WorkflowArtifactReceipt;
  readiness: WorkflowProductionReadiness | null;
  readinessReceipt: WorkflowArtifactReceipt | null;
  productionSlice: AdaptiveWorkflowProductionSlice | null;
  productionSliceReceipt: WorkflowArtifactReceipt | null;
  artifacts: WorkflowArtifactSelection | null;
  binding: AdaptiveWorkflowSourceBinding;
}>;

function read(root: string, path: string, label: string): Buffer {
  return readStableProjectFile({ root, path: resolve(root, path), label, fs });
}
function json(bytes: Buffer, label: string): unknown {
  try { return JSON.parse(bytes.toString('utf8')); } catch { return fail(`${label} is not JSON`); }
}
function receipt(value: unknown, label: string): WorkflowArtifactReceipt {
  const item = object(value, label); exact(item, ['path', 'schema', 'sha256'], label);
  return Object.freeze({ path: safePath(item.path, `${label}.path`), schema: text(item.schema, `${label}.schema`), sha256: digest(item.sha256, `${label}.sha256`) });
}
function pointer(root: string, path: string, schema: string, pattern: RegExp, label: string): Readonly<{ value: WorkflowPointer; bytes: Buffer }> {
  const bytes = read(root, path, label); const item = object(json(bytes, label), label); exact(item, ['schema', 'record', 'sha256'], label);
  const record = safePath(item.record, `${label}.record`); const sha256 = digest(item.sha256, `${label}.sha256`);
  const match = pattern.exec(record);
  if (item.schema !== schema || match === null || match[1] !== sha256) fail(`${label} does not identify a content-addressed record`);
  return Object.freeze({ value: Object.freeze({ schema, record, sha256 }), bytes });
}
function routeContext(root: string, invocation: ProjectRunInvocation) {
  const routeRecord = readPersistedRoute(root, invocation);
  const routeSha256 = adaptiveRouteRecordSha256(routeRecord);
  const authorityBytes = adaptiveRouteAuthorityBytes(routeRecord, routeSha256, invocation);
  const persisted = read(root, `.omd/${adaptiveRouteAuthorityPath(authorityBytes)}`, 'workflow route authority');
  if (!persisted.equals(authorityBytes)) fail('workflow route authority is stale');
  return { routeRecord, routeAuthorityBytes: authorityBytes, authority: { root, invocation } };
}
function backedReceipt(root: string, value: WorkflowArtifactReceipt, label: string): Buffer {
  const bytes = read(root, value.path, label);
  if (hash(bytes) !== value.sha256) fail(`${label} bytes changed`);
  return bytes;
}
function validatePlanEvidence(root: string, plan: AdaptiveWorkflowPlan): void {
  for (const evidence of plan.evidence) {
    const bytes = read(root, evidence.source.path, `workflow evidence ${evidence.id}`);
    if (hash(bytes) !== evidence.source.sha256) fail(`workflow evidence ${evidence.id} is stale`);
  }
}
function nestedReceipts(value: unknown, result: WorkflowArtifactReceipt[] = []): WorkflowArtifactReceipt[] {
  if (Array.isArray(value)) { value.forEach((item) => nestedReceipts(item, result)); return result; }
  if (typeof value !== 'object' || value === null) return result;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  if (keys.length === 3 && keys[0] === 'path' && keys[1] === 'schema' && keys[2] === 'sha256') {
    result.push(receipt(item, 'nested workflow receipt')); return result;
  }
  Object.values(item).forEach((child) => nestedReceipts(child, result));
  return result;
}
function validateNestedReceipts(root: string, value: unknown): void {
  const seen = new Map<string, string>();
  for (const item of nestedReceipts(value)) {
    const key = `${item.path}\0${item.schema}`;
    const prior = seen.get(key);
    if (prior !== undefined && prior !== item.sha256) fail(`workflow input ${item.path} has conflicting hashes`);
    seen.set(key, item.sha256);
    backedReceipt(root, item, `workflow input ${item.path}`);
  }
}
const PROOF_SCHEMAS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'reference-principle': Object.freeze(['decision-principle-bindings-v1']),
  'content-state-model': Object.freeze([CONTENT_STATE_MODEL_SCHEMA]),
  'structural-layout': Object.freeze(['structural-wireframe-v1']),
  'component-in-context': Object.freeze(['component-stress-proof-v1', COMPONENT_STRESS_PROOF_V2_SCHEMA]),
  'interaction-behavior': Object.freeze([INTERACTION_BEHAVIOR_PROOF_SCHEMA]),
  'technical-slice': Object.freeze([]),
});
function validateProof(
  root: string,
  plan: AdaptiveWorkflowPlan,
  investigation: AdaptiveWorkflowPlan['development']['investigations'][number],
  item: WorkflowArtifactReceipt,
  productionSlice?: Readonly<{ value: AdaptiveWorkflowProductionSlice; receipt: WorkflowArtifactReceipt }>,
): void {
  const planSha256 = adaptiveWorkflowPlanSha256(plan);
  const kind = investigation.kind;
  const supported = PROOF_SCHEMAS[kind] ?? fail(`selected proof kind ${kind} is unsupported`);
  if (!supported.includes(item.schema)) fail(`selected proof schema ${item.schema} does not match ${kind}`);
  const bytes = backedReceipt(root, item, `selected workflow proof ${item.path}`); const value = json(bytes, `selected workflow proof ${item.path}`);
  const proof = object(value, `selected workflow proof ${item.path}`);
  if ('planSha256' in proof && proof.planSha256 !== planSha256) fail(`selected workflow proof ${item.path} is stale for the current plan`);
  validateNestedReceipts(root, value);
  if (item.schema === CONTENT_STATE_MODEL_SCHEMA) parseContentStateModel(value);
  if (item.schema === 'structural-wireframe-v1') {
    const inputs = Array.isArray(proof.inputs) ? proof.inputs.map((entry, index) => receipt(entry, `structural input ${index}`)) : fail('structural proof inputs are missing');
    const regions = Array.isArray(proof.regions) ? proof.regions.map((entry, index) => object(entry, `structural region ${index}`)) : fail('structural proof regions are missing');
    const ids = (key: 'taskIds' | 'contentIds' | 'stateIds'): string[] => [...new Set(regions.flatMap((region) => Array.isArray(region[key]) ? region[key].map((value) => text(value, `structural ${key}`)) : []))];
    parseStructuralWireframe(value, { planSha256, inputs, taskIds: ids('taskIds'), contentIds: ids('contentIds'), stateIds: ids('stateIds') });
  }
  if (item.schema === 'component-stress-proof-v1' || item.schema === COMPONENT_STRESS_PROOF_V2_SCHEMA) {
    const inputs = Array.isArray(proof.inputs) ? proof.inputs.map((entry, index) => receipt(entry, `component input ${index}`)) : fail('component stress proof inputs are missing');
    const cases = Array.isArray(proof.cases) ? proof.cases.map((entry, index) => object(entry, `component stress case ${index}`)) : fail('component stress proof cases are missing');
    const applicable = new Map<string, { id: string; contentProfileId: string; stateId: string; viewport: { name: 'desktop' | 'mobile'; width: number; height: number }; requiredAssertions: string[] }>();
    for (const [index, stressCase] of cases.entries()) {
      const assertions = Array.isArray(stressCase.assertions) ? stressCase.assertions.map((entry) => object(entry, 'component stress assertion')) : fail('component stress assertions are missing');
      if (assertions.length === 0 || assertions.some((entry) => entry.pass !== true)) fail('selected component stress proof has a failed assertion');
      const render = receipt(stressCase.render, `component stress render ${index}`); const dimensions = decodePng(backedReceipt(root, render, `component stress render ${index}`));
      const evidenceId = text(stressCase.evidenceId, `component stress case ${index}.evidenceId`);
      const viewport = text(stressCase.viewport, `component stress case ${index}.viewport`);
      const viewportName = viewport === 'desktop' ? 'desktop' : viewport === 'mobile' ? 'mobile' : fail('component stress viewport is invalid');
      const candidate: { id: string; contentProfileId: string; stateId: string; viewport: { name: 'desktop' | 'mobile'; width: number; height: number }; requiredAssertions: string[] } = { id: evidenceId, contentProfileId: text(stressCase.contentProfileId, 'component content profile'), stateId: text(stressCase.stateId, 'component state'), viewport: { name: viewportName, width: dimensions.width, height: dimensions.height }, requiredAssertions: assertions.map((entry) => text(entry.metric, 'component stress metric')) };
      const prior = applicable.get(evidenceId);
      if (prior !== undefined && canonicalRouteJson(prior) !== canonicalRouteJson(candidate)) fail('component stress contexts disagree on applicable evidence');
      applicable.set(evidenceId, candidate);
    }
    if (item.schema === 'component-stress-proof-v1') {
      parseComponentStressProof(value, { planSha256, inputs, component: object(proof.component, 'component identity') as { sourcePath: string; selector: string; contractSha256: string }, applicableCases: [...applicable.values()] as Parameters<typeof parseComponentStressProof>[1]['applicableCases'], readRender: (path) => read(root, path, 'component stress render') });
    } else {
      const slice = productionSlice ?? fail('component stress proof v2 requires the current authenticated production slice');
      const entry = slice.value.slices.find(({ investigationId }) => investigationId === investigation.id)
        ?? fail('component stress proof v2 has no matching production slice');
      parseComponentStressProofV2(value, {
        planSha256, investigationId: investigation.id, inputs,
        sliceReceipt: slice.receipt as { path: string; schema: typeof ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA; sha256: string },
        slice: entry, readFile: (path) => read(root, path, 'component production proof input'),
      }, [...applicable.values()] as Parameters<typeof parseComponentStressProof>[1]['applicableCases']);
    }
  }
  if (item.schema === INTERACTION_BEHAVIOR_PROOF_SCHEMA) {
    const slice = productionSlice ?? fail('interaction behavior proof requires the current authenticated production slice');
    const componentInvestigation = plan.development.investigations.find(({ kind: candidate }) => candidate === 'component-in-context')
      ?? fail('interaction behavior proof requires a selected component in context');
    const entry = slice.value.slices.find(({ investigationId }) => investigationId === componentInvestigation.id)
      ?? fail('interaction behavior proof has no matching production slice');
    const inputs = Array.isArray(proof.inputs) ? proof.inputs.map((entryValue, index) => receipt(entryValue, `interaction input ${index}`)) : fail('interaction behavior proof inputs are missing');
    const persisted = plan.investigations.find(({ id }) => id === investigation.id) ?? fail('interaction behavior investigation is absent');
    parseInteractionBehaviorProof(value, {
      planSha256, investigationId: investigation.id, inputs,
      sliceReceipt: slice.receipt as { path: string; schema: typeof ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA; sha256: string },
      slice: entry, readFile: (path) => read(root, path, 'interaction production proof input'),
    }, persisted.evidenceIds);
  }
  if (item.schema === 'decision-principle-bindings-v1') {
    const graphReceipt = receipt(proof.decisionGraph, 'decision principle graph');
    const selectionReceipt = proof.referenceSelection === null ? undefined : receipt(proof.referenceSelection, 'decision principle selection');
    const principles = Array.isArray(proof.principles) ? proof.principles.map((entry) => object(entry, 'decision principle')) : fail('decision principles are missing');
    parseDecisionPrincipleBindings(value, {
      decisionGraph: { path: graphReceipt.path, schema: 'decision-graph-v1', bytes: backedReceipt(root, graphReceipt, 'decision principle graph') },
      ...(selectionReceipt === undefined ? {} : { referenceSelection: { path: selectionReceipt.path, schema: 'reference-selection-v2', bytes: backedReceipt(root, selectionReceipt, 'decision principle selection') } }),
      referencePrinciples: principles.filter((principle) => object(principle.source, 'decision principle source').kind === 'reference').map((principle) => {
        const source = object(principle.source, 'decision principle source'); const artifact = receipt(source.artifact, 'decision principle source artifact');
        return { id: text(principle.id, 'decision principle id'), statement: text(principle.statement, 'decision principle statement'), artifact: { path: artifact.path, schema: artifact.schema, bytes: backedReceipt(root, artifact, 'decision principle source artifact') }, locator: text(source.locator, 'decision principle locator') };
      }),
    });
  }
}
function validateReview(root: string, planSha256: string, item: WorkflowArtifactReceipt): void {
  if (item.schema !== DESIGN_REVIEW_SCHEMA) fail('workflow review schema is invalid');
  const bytes = backedReceipt(root, item, `selected workflow review ${item.path}`); const value = json(bytes, `selected workflow review ${item.path}`);
  const review = object(value, `selected workflow review ${item.path}`);
  if (review.planSha256 !== planSha256 || review.verdict !== 'pass' || review.authority !== 'workflow-support-only'
    || !Array.isArray(review.cannotSubstitute) || review.cannotSubstitute.length !== 1 || review.cannotSubstitute[0] !== 'final-v2') {
    fail('selected workflow review is stale, failed, or claims final authority');
  }
  if (review.lens === 'structure') validateStructureReviewShape(value);
  else if (review.lens !== 'expression') fail('workflow review lens is invalid');
  validateNestedReceipts(root, value);
}
function reviewLens(root: string, item: WorkflowArtifactReceipt): string {
  return text(object(json(backedReceipt(root, item, `workflow review ${item.path}`), `workflow review ${item.path}`), `workflow review ${item.path}`).lens, 'workflow review lens');
}
function parseSelection(
  root: string,
  value: unknown,
  plan: AdaptiveWorkflowPlan,
  planReceipt: WorkflowArtifactReceipt,
  options: Readonly<{
    schema?: typeof ADAPTIVE_WORKFLOW_ARTIFACT_SELECTION_SCHEMA | typeof ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_SCHEMA;
    investigations?: readonly AdaptiveWorkflowPlan['development']['investigations'][number][];
    productionSlice?: Readonly<{ value: AdaptiveWorkflowProductionSlice; receipt: WorkflowArtifactReceipt }>;
    requiredReviewLenses?: readonly ('structure' | 'expression')[];
    requiredReviews?: readonly WorkflowArtifactReceipt[];
  }> = {},
): WorkflowArtifactSelection | WorkflowProductionReadiness {
  const expectedSchema = options.schema ?? ADAPTIVE_WORKFLOW_ARTIFACT_SELECTION_SCHEMA;
  const item = object(value, 'workflow artifact selection'); exact(item, ['schema', 'plan', 'artifacts', 'reviews'], 'workflow artifact selection');
  if (item.schema !== expectedSchema || !Array.isArray(item.artifacts) || !Array.isArray(item.reviews)) fail('workflow artifact selection is malformed');
  const rawArtifacts = item.artifacts as unknown[]; const rawReviews = item.reviews as unknown[];
  const selectedPlan = receipt(item.plan, 'workflow artifact selection plan');
  if (canonicalRouteJson(selectedPlan) !== canonicalRouteJson(planReceipt)) fail('workflow artifact selection is stale for the current plan');
  const selectedInvestigations = options.investigations ?? plan.development.investigations;
  const investigations = new Map(selectedInvestigations.map((entry) => [entry.id, entry]));
  const artifacts = rawArtifacts.map((raw, index) => {
    const entry = object(raw, `workflow artifact selection.artifacts[${index}]`); exact(entry, ['investigationId', 'artifact'], `workflow artifact selection.artifacts[${index}]`);
    const investigationId = text(entry.investigationId, `workflow artifact selection.artifacts[${index}].investigationId`);
    const investigation = investigations.get(investigationId) ?? fail(`workflow artifact ${investigationId} is not allowed at this checkpoint`);
    const artifact = receipt(entry.artifact, `workflow artifact ${investigationId}`);
    validateProof(root, plan, investigation, artifact, options.productionSlice);
    return Object.freeze({ investigationId, artifact });
  });
  if (new Set(artifacts.map(({ investigationId }) => investigationId)).size !== artifacts.length
    || artifacts.length !== investigations.size || [...investigations.keys()].some((id) => !artifacts.some((artifact) => artifact.investigationId === id))) {
    fail('every selected investigation at this checkpoint requires exactly one current workflow artifact');
  }
  const reviews = rawReviews.map((raw, index) => receipt(raw, `workflow review ${index}`));
  if (new Set(reviews.map(({ path }) => path)).size !== reviews.length) fail('workflow reviews must be unique');
  reviews.forEach((review) => validateReview(root, planReceipt.sha256, review));
  for (const required of options.requiredReviews ?? []) {
    if (!reviews.some((candidate) => canonicalRouteJson(candidate) === canonicalRouteJson(required))) fail('complete workflow must retain every production-readiness review');
  }
  const lenses = reviews.map((review) => reviewLens(root, review));
  for (const lens of options.requiredReviewLenses ?? []) if (!lenses.includes(lens)) fail(`workflow requires a passing ${lens} review`);
  if (lenses.includes('expression')) {
    const deferredReceipts = artifacts.filter(({ investigationId }) => {
      const investigation = plan.development.investigations.find(({ id }) => id === investigationId);
      return investigation !== undefined && PRODUCTION_DEPENDENT_KINDS.has(investigation.kind);
    }).map(({ artifact }) => artifact);
    const expression = reviews.find((review) => reviewLens(root, review) === 'expression');
    const expressionValue = expression === undefined ? undefined : object(json(backedReceipt(root, expression, 'expression review'), 'expression review'), 'expression review');
    const inputs = expressionValue === undefined || !Array.isArray(expressionValue.inputs) ? [] : expressionValue.inputs.map((entry, index) => receipt(entry, `expression review input ${index}`));
    if (deferredReceipts.some((required) => !inputs.some((candidate) => canonicalRouteJson(candidate) === canonicalRouteJson(required)))) {
      fail('expression review must bind every selected production-dependent proof');
    }
  }
  return Object.freeze({ schema: expectedSchema, plan: selectedPlan, artifacts: Object.freeze(artifacts), reviews: Object.freeze(reviews) });
}
function artifactSelectionBytes(selection: WorkflowArtifactSelection | WorkflowProductionReadiness): Buffer {
  return Buffer.from(`${canonicalWorkflowPlanJson(selection)}\n`);
}
function receiptForRecord(path: string, schema: string, sha256: string): WorkflowArtifactReceipt {
  return Object.freeze({ path: `.omd/${path}`, schema, sha256 });
}
function productionIndependentInvestigations(plan: AdaptiveWorkflowPlan) {
  return plan.development.investigations.filter(({ kind }) => !PRODUCTION_DEPENDENT_KINDS.has(kind));
}
function productionDependentInvestigations(plan: AdaptiveWorkflowPlan) {
  return plan.development.investigations.filter(({ kind }) => PRODUCTION_DEPENDENT_KINDS.has(kind));
}
function publishWorkflow<T>(root: string, invocation: ProjectRunInvocation, operation: () => T): T {
  const release = acquireProjectMutationLock(root, invocation);
  try { return operation(); } finally { release(); }
}
function replaceWorkflowPointer(root: string, invocation: ProjectRunInvocation, path: string, content: string): void {
  replaceProjectFileAtomically({ projectRoot: root, invocation, relativePath: path, content });
}

export function publishAdaptiveWorkflowPlan(
  root: string,
  input: unknown,
  writer: ProjectWriteAdapter,
  invocation: ProjectRunInvocation,
): string {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  return publishWorkflow(root, invocation, () => {
    const submitted = object(input, 'workflow plan input'); exact(submitted, ['development', 'evidence', 'investigations', 'rationale'], 'workflow plan input');
    const plan = createAdaptiveWorkflowPlan({
      development: submitted.development, evidence: submitted.evidence, investigations: submitted.investigations,
      rationale: text(submitted.rationale, 'workflow plan input.rationale'), ...routeContext(root, invocation),
    });
    validatePlanEvidence(root, plan);
    const bytes = `${canonicalWorkflowPlanJson(plan)}\n`; const sha256 = adaptiveWorkflowPlanSha256(plan); const record = adaptiveWorkflowPlanPath(plan);
    writer.writeContentAddressed(`.omd/${record}`, bytes);
    replaceWorkflowPointer(root, invocation, '.omd/workflow-plan.json', `${canonicalWorkflowPlanJson({ schema: ADAPTIVE_WORKFLOW_PLAN_POINTER_SCHEMA, record, sha256 })}\n`);
    return `.omd/${record}`;
  });
}

export function publishAdaptiveWorkflowProductionReadiness(
  root: string,
  input: unknown,
  writer: ProjectWriteAdapter,
  invocation: ProjectRunInvocation,
): string {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  return publishWorkflow(root, invocation, () => {
  const current = checkAdaptiveWorkflow(root, invocation, { requireComplete: false });
  if (current.plan.development.mode !== 'investigate' || productionDependentInvestigations(current.plan).length === 0) {
    fail('production readiness is additive only for workflows with production-dependent investigations');
  }
  const raw = object(input, 'workflow production readiness input'); exact(raw, ['schema', 'artifacts', 'reviews'], 'workflow production readiness input');
  if (raw.schema !== 'adaptive-workflow-production-readiness-input-v1') fail('workflow production readiness input schema is invalid');
  const independent = productionIndependentInvestigations(current.plan);
  const selection = parseSelection(root, {
    schema: ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_SCHEMA,
    plan: current.planReceipt, artifacts: raw.artifacts, reviews: raw.reviews,
  }, current.plan, current.planReceipt, {
    schema: ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_SCHEMA,
    investigations: independent,
    requiredReviewLenses: independent.some(({ kind }) => kind === 'structural-layout') ? ['structure'] : [],
  }) as WorkflowProductionReadiness;
  const bytes = artifactSelectionBytes(selection); const sha256 = hash(bytes); const record = `workflow-production-readiness-runs/sha256-${sha256}.json`;
  writer.writeContentAddressed(`.omd/${record}`, bytes);
  replaceWorkflowPointer(root, invocation, '.omd/workflow-production-readiness.json', `${canonicalWorkflowPlanJson({ schema: ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_POINTER_SCHEMA, record, sha256 })}\n`);
  return `.omd/${record}`;
  });
}

export function publishAdaptiveWorkflowProductionSlice(
  root: string,
  input: unknown,
  writer: ProjectWriteAdapter,
  invocation: ProjectRunInvocation,
): string {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  return publishWorkflow(root, invocation, () => {
  const current = checkAdaptiveWorkflow(root, invocation, { requireComplete: false });
  if (current.readiness === null || current.readinessReceipt === null) fail('current production readiness is required before an owner slice');
  if (current.artifacts !== null) fail('a complete workflow does not accept a production slice');
  const raw = object(input, 'workflow production slice input'); exact(raw, ['schema', 'slices'], 'workflow production slice input');
  if (raw.schema !== ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_INPUT_SCHEMA) fail('workflow production slice input schema is invalid');
  const componentInvestigations = current.plan.development.investigations.filter(({ kind }) => kind === 'component-in-context');
  if (!Array.isArray(raw.slices)) fail('workflow production slice entries are missing');
  const slices = raw.slices as unknown[];
  const submittedIds = slices.map((entry, index) => text(object(entry, `workflow production slice entry ${index}`).investigationId, `workflow production slice entry ${index}.investigationId`));
  if (submittedIds.length !== componentInvestigations.length || componentInvestigations.some(({ id }) => !submittedIds.includes(id))) {
    fail('owner slice must cover exactly the selected component-in-context investigations');
  }
  const slice = createWorkflowProductionSlice({
    route: current.plan.route,
    plan: current.planReceipt as { path: string; schema: 'adaptive-workflow-plan-v1'; sha256: string },
    readiness: current.readinessReceipt as { path: string; schema: typeof ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_SCHEMA; sha256: string },
    owner: {
      role: 'omd-hand',
      buildSha256: invocation.current.buildSha256,
      loadedSkillSha256: invocation.current.loadedSkillSha256,
      briefSha256: invocation.current.briefSha256,
    },
    slices,
    readSource: (path) => read(root, path, 'workflow production slice source'),
  });
  const bytes = workflowProductionSliceBytes(slice);
  requireWorkflowProductionSliceAuthorization(invocation, root, bytes);
  const sha256 = hash(bytes); const record = `workflow-production-slice-runs/sha256-${sha256}.json`;
  writer.writeContentAddressed(`.omd/${record}`, bytes);
  replaceWorkflowPointer(root, invocation, '.omd/workflow-production-slice.json', `${canonicalWorkflowPlanJson({ schema: ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_POINTER_SCHEMA, record, sha256 })}\n`);
  return `.omd/${record}`;
  });
}

export function publishAdaptiveWorkflowArtifacts(
  root: string,
  input: unknown,
  writer: ProjectWriteAdapter,
  invocation: ProjectRunInvocation,
): string {
  requireProjectWriteAdapterForInvocation(root, writer, invocation);
  return publishWorkflow(root, invocation, () => {
  const current = checkAdaptiveWorkflow(root, invocation, { requireComplete: false });
  if (current.plan.development.mode !== 'investigate') fail('direct workflows cannot publish phantom workflow artifacts');
  const raw = object(input, 'workflow artifact selection input'); exact(raw, ['schema', 'artifacts', 'reviews'], 'workflow artifact selection input');
  if (raw.schema !== 'adaptive-workflow-artifact-selection-input-v1') fail('workflow artifact selection input schema is invalid');
  const deferred = productionDependentInvestigations(current.plan);
  const sliced = current.readiness !== null;
  if (sliced && (current.productionSlice === null || current.productionSliceReceipt === null)) fail('complete workflow requires the current authenticated production slice');
  const selection = parseSelection(root, { schema: ADAPTIVE_WORKFLOW_ARTIFACT_SELECTION_SCHEMA, plan: current.planReceipt, artifacts: raw.artifacts, reviews: raw.reviews }, current.plan, current.planReceipt, {
    ...(sliced && current.productionSlice !== null && current.productionSliceReceipt !== null ? { productionSlice: { value: current.productionSlice, receipt: current.productionSliceReceipt } } : {}),
    requiredReviewLenses: sliced && deferred.length > 0 ? ['expression'] : [],
    requiredReviews: current.readiness?.reviews ?? [],
  }) as WorkflowArtifactSelection;
  if (sliced) {
    for (const { investigationId, artifact } of selection.artifacts) {
      const investigation = current.plan.development.investigations.find(({ id }) => id === investigationId);
      if (investigation?.kind === 'component-in-context' && artifact.schema !== COMPONENT_STRESS_PROOF_V2_SCHEMA) {
        fail('post-slice component-in-context requires component-stress-proof-v2');
      }
    }
  }
  const bytes = artifactSelectionBytes(selection); const sha256 = hash(bytes); const record = `workflow-artifact-runs/sha256-${sha256}.json`;
  writer.writeContentAddressed(`.omd/${record}`, bytes);
  replaceWorkflowPointer(root, invocation, '.omd/workflow-artifacts.json', `${canonicalWorkflowPlanJson({ schema: ADAPTIVE_WORKFLOW_ARTIFACT_POINTER_SCHEMA, record, sha256 })}\n`);
  return `.omd/${record}`;
  });
}

function checkAdaptiveWorkflowSnapshot(
  root: string,
  invocation: ProjectRunInvocation,
  options: Readonly<{ requireComplete?: boolean; checkpoint?: 'complete' | 'readiness' | 'slice' }> = {},
): CurrentAdaptiveWorkflow {
  const context = routeContext(root, invocation);
  const planPointer = pointer(root, '.omd/workflow-plan.json', ADAPTIVE_WORKFLOW_PLAN_POINTER_SCHEMA, PLAN_RECORD, 'workflow plan pointer');
  const planBytes = read(root, `.omd/${planPointer.value.record}`, 'workflow plan immutable record');
  if (hash(planBytes) !== planPointer.value.sha256) fail('workflow plan record hash changed');
  const plan = parseAdaptiveWorkflowPlan(json(planBytes, 'workflow plan immutable record'), context);
  if (planBytes.toString('utf8') !== `${canonicalWorkflowPlanJson(plan)}\n` || adaptiveWorkflowPlanSha256(plan) !== planPointer.value.sha256) fail('workflow plan record is not canonical and content-addressed');
  validatePlanEvidence(root, plan);
  const planReceipt = Object.freeze({ path: `.omd/${planPointer.value.record}`, schema: plan.schema, sha256: planPointer.value.sha256 });
  let readiness: WorkflowProductionReadiness | null = null;
  let readinessReceipt: WorkflowArtifactReceipt | null = null;
  let productionSlice: AdaptiveWorkflowProductionSlice | null = null;
  let productionSliceReceipt: WorkflowArtifactReceipt | null = null;
  if (plan.development.mode === 'investigate' && productionDependentInvestigations(plan).length > 0) {
    try {
      const readinessPointer = pointer(root, '.omd/workflow-production-readiness.json', ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_POINTER_SCHEMA, READINESS_RECORD, 'workflow production readiness pointer');
      const bytes = read(root, `.omd/${readinessPointer.value.record}`, 'workflow production readiness immutable record');
      if (hash(bytes) !== readinessPointer.value.sha256) fail('workflow production readiness record hash changed');
      readiness = parseSelection(root, json(bytes, 'workflow production readiness immutable record'), plan, planReceipt, {
        schema: ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_SCHEMA,
        investigations: productionIndependentInvestigations(plan),
        requiredReviewLenses: productionIndependentInvestigations(plan).some(({ kind }) => kind === 'structural-layout') ? ['structure'] : [],
      }) as WorkflowProductionReadiness;
      if (!bytes.equals(artifactSelectionBytes(readiness))) fail('workflow production readiness record is not canonical and content-addressed');
      readinessReceipt = receiptForRecord(readinessPointer.value.record, ADAPTIVE_WORKFLOW_PRODUCTION_READINESS_SCHEMA, readinessPointer.value.sha256);
    } catch (error) {
      if (!(error instanceof Error && /could not be read stably/.test(error.message))) throw error;
    }
    if (readiness !== null && readinessReceipt !== null && options.checkpoint !== 'readiness') {
      try {
        const slicePointer = pointer(root, '.omd/workflow-production-slice.json', ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_POINTER_SCHEMA, SLICE_RECORD, 'workflow production slice pointer');
        const bytes = read(root, `.omd/${slicePointer.value.record}`, 'workflow production slice immutable record');
        if (hash(bytes) !== slicePointer.value.sha256) fail('workflow production slice record hash changed');
        productionSlice = parseWorkflowProductionSlice(json(bytes, 'workflow production slice immutable record'));
        if (!bytes.equals(workflowProductionSliceBytes(productionSlice))) fail('workflow production slice record is not canonical and content-addressed');
        if (canonicalRouteJson(productionSlice.route) !== canonicalRouteJson(plan.route)
          || canonicalRouteJson(productionSlice.plan) !== canonicalRouteJson(planReceipt)
          || canonicalRouteJson(productionSlice.readiness) !== canonicalRouteJson(readinessReceipt)
          || productionSlice.owner.buildSha256 !== invocation.current.buildSha256
          || productionSlice.owner.loadedSkillSha256 !== invocation.current.loadedSkillSha256
          || productionSlice.owner.briefSha256 !== invocation.current.briefSha256) fail('workflow production slice authority is stale');
        for (const entry of productionSlice.slices) {
          backedReceipt(root, entry.component.source, 'workflow component slice source');
          backedReceipt(root, entry.representativeContext.source, 'workflow representative context source');
        }
        productionSliceReceipt = receiptForRecord(slicePointer.value.record, ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_SCHEMA, slicePointer.value.sha256);
      } catch (error) {
        if (!(error instanceof Error && /could not be read stably/.test(error.message))) throw error;
      }
    }
  }
  let artifacts: WorkflowArtifactSelection | null = null;
  let artifactBinding: AdaptiveWorkflowSourceBinding['artifacts'] = null;
  if (plan.development.mode === 'investigate' && (options.checkpoint === undefined || options.checkpoint === 'complete')) {
    try {
      const selectedPointer = pointer(root, '.omd/workflow-artifacts.json', ADAPTIVE_WORKFLOW_ARTIFACT_POINTER_SCHEMA, ARTIFACT_RECORD, 'workflow artifact pointer');
      const bytes = read(root, `.omd/${selectedPointer.value.record}`, 'workflow artifact immutable record');
      if (hash(bytes) !== selectedPointer.value.sha256) fail('workflow artifact record hash changed');
      artifacts = parseSelection(root, json(bytes, 'workflow artifact immutable record'), plan, planReceipt, {
        ...(readiness !== null && productionSlice !== null && productionSliceReceipt !== null ? { productionSlice: { value: productionSlice, receipt: productionSliceReceipt } } : {}),
        requiredReviewLenses: readiness !== null && productionDependentInvestigations(plan).length > 0 ? ['expression'] : [],
        requiredReviews: readiness?.reviews ?? [],
      }) as WorkflowArtifactSelection;
      if (readiness !== null) {
        for (const { investigationId, artifact } of artifacts.artifacts) {
          const investigation = plan.development.investigations.find(({ id }) => id === investigationId);
          if (investigation?.kind === 'component-in-context' && artifact.schema !== COMPONENT_STRESS_PROOF_V2_SCHEMA) fail('post-slice component-in-context requires component-stress-proof-v2');
        }
      }
      if (!bytes.equals(artifactSelectionBytes(artifacts))) fail('workflow artifact record is not canonical and content-addressed');
      artifactBinding = Object.freeze({
        pointer: Object.freeze({ path: '.omd/workflow-artifacts.json', schema: ADAPTIVE_WORKFLOW_ARTIFACT_POINTER_SCHEMA, sha256: hash(selectedPointer.bytes) }),
        record: Object.freeze({ path: `.omd/${selectedPointer.value.record}`, schema: ADAPTIVE_WORKFLOW_ARTIFACT_SELECTION_SCHEMA, sha256: selectedPointer.value.sha256 }),
      });
    } catch (error) {
      if (options.requireComplete === false && error instanceof Error && /could not be read stably/.test(error.message)) artifacts = null;
      else throw error;
    }
    if (options.requireComplete !== false && artifacts === null) fail('every selected proof requires a current workflow artifact record');
  }
  const binding: AdaptiveWorkflowSourceBinding = Object.freeze({
    schema: ADAPTIVE_WORKFLOW_SOURCE_BINDING_SCHEMA,
    route: plan.route,
    plan: Object.freeze({
      pointer: Object.freeze({ path: '.omd/workflow-plan.json', schema: ADAPTIVE_WORKFLOW_PLAN_POINTER_SCHEMA, sha256: hash(planPointer.bytes) }),
      record: planReceipt,
    }),
    artifacts: artifactBinding,
  });
  return Object.freeze({ plan, planReceipt, readiness, readinessReceipt, productionSlice, productionSliceReceipt, artifacts, binding });
}

const WORKFLOW_PUBLICATION_POINTERS = Object.freeze([
  '.omd/route-source.json',
  '.omd/route.json',
  '.omd/workflow-plan.json',
  '.omd/workflow-production-readiness.json',
  '.omd/workflow-production-slice.json',
  '.omd/workflow-artifacts.json',
]);
function optionalPublicationPointer(root: string, path: string): Buffer | null {
  try { return read(root, path, `workflow publication pointer ${path}`); } catch (error) {
    try { lstatSync(resolve(root, path)); } catch (missing) {
      if ((missing as NodeJS.ErrnoException).code === 'ENOENT') return null;
    }
    throw error;
  }
}
function publicationSnapshot(root: string): readonly (Buffer | null)[] {
  return WORKFLOW_PUBLICATION_POINTERS.map((path) => optionalPublicationPointer(root, path));
}
function samePublicationSnapshot(left: readonly (Buffer | null)[], right: readonly (Buffer | null)[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => {
    const current = right[index];
    return value === null ? current === null : current !== undefined && current !== null && value.equals(current);
  });
}
export function checkAdaptiveWorkflow(
  root: string,
  invocation: ProjectRunInvocation,
  options: Readonly<{ requireComplete?: boolean; checkpoint?: 'complete' | 'readiness' | 'slice' }> = {},
): CurrentAdaptiveWorkflow {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = publicationSnapshot(root);
    try {
      const current = checkAdaptiveWorkflowSnapshot(root, invocation, options);
      if (samePublicationSnapshot(before, publicationSnapshot(root))) return current;
    } catch (error) {
      if (samePublicationSnapshot(before, publicationSnapshot(root)) || attempt === 2) throw error;
    }
  }
  return fail('related workflow pointers changed during coherent read');
}

export function checkAdaptiveWorkflowProductionReadiness(
  root: string,
  invocation: ProjectRunInvocation,
): CurrentAdaptiveWorkflow {
  const current = checkAdaptiveWorkflow(root, invocation, { requireComplete: false, checkpoint: 'readiness' });
  if (current.plan.development.mode !== 'investigate' || productionDependentInvestigations(current.plan).length === 0) {
    fail('current workflow does not require a production-readiness checkpoint');
  }
  if (current.readiness === null || current.readinessReceipt === null) fail('workflow production readiness is missing');
  return current;
}

export function checkAdaptiveWorkflowProductionSlice(
  root: string,
  invocation: ProjectRunInvocation,
): CurrentAdaptiveWorkflow {
  const current = checkAdaptiveWorkflow(root, invocation, { requireComplete: false, checkpoint: 'slice' });
  if (current.plan.development.mode !== 'investigate' || productionDependentInvestigations(current.plan).length === 0
    || current.readiness === null || current.readinessReceipt === null) fail('workflow production readiness is missing');
  if (current.productionSlice === null || current.productionSliceReceipt === null) fail('workflow production slice is missing');
  return current;
}

export function isAdaptiveWorkflowSourceBinding(value: unknown): value is AdaptiveWorkflowSourceBinding {
  try {
    const item = object(value, 'workflow source binding'); exact(item, ['schema', 'route', 'plan', 'artifacts'], 'workflow source binding');
    if (item.schema !== ADAPTIVE_WORKFLOW_SOURCE_BINDING_SCHEMA) return false;
    const route = object(item.route, 'workflow source route'); exact(route, ['recordSha256', 'sourceContractSha256', 'authoritySha256'], 'workflow source route');
    digest(route.recordSha256, 'workflow source route.recordSha256'); digest(route.sourceContractSha256, 'workflow source route.sourceContractSha256'); digest(route.authoritySha256, 'workflow source route.authoritySha256');
    const plan = object(item.plan, 'workflow source plan'); exact(plan, ['pointer', 'record'], 'workflow source plan');
    const planPointer = receipt(plan.pointer, 'workflow source plan pointer'); const planRecord = receipt(plan.record, 'workflow source plan record');
    if (planPointer.path !== '.omd/workflow-plan.json' || planPointer.schema !== ADAPTIVE_WORKFLOW_PLAN_POINTER_SCHEMA
      || planRecord.schema !== 'adaptive-workflow-plan-v1' || !PLAN_RECORD.test(planRecord.path.replace(/^\.omd\//, ''))) return false;
    if (item.artifacts !== null) {
      const artifacts = object(item.artifacts, 'workflow source artifacts'); exact(artifacts, ['pointer', 'record'], 'workflow source artifacts');
      const artifactPointer = receipt(artifacts.pointer, 'workflow source artifact pointer'); const artifactRecord = receipt(artifacts.record, 'workflow source artifact record');
      if (artifactPointer.path !== '.omd/workflow-artifacts.json' || artifactPointer.schema !== ADAPTIVE_WORKFLOW_ARTIFACT_POINTER_SCHEMA
        || artifactRecord.schema !== ADAPTIVE_WORKFLOW_ARTIFACT_SELECTION_SCHEMA || !ARTIFACT_RECORD.test(artifactRecord.path.replace(/^\.omd\//, ''))) return false;
    }
    return true;
  } catch { return false; }
}

export function createAdaptiveWorkflowSourceBinding(root: string, invocation: ProjectRunInvocation): AdaptiveWorkflowSourceBinding {
  return checkAdaptiveWorkflow(root, invocation).binding;
}
