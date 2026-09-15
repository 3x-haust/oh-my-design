import { createHash } from 'node:crypto';

import type { AdaptiveRouteRecord } from '../route/adaptive-flow-domain.ts';
import { parseRouteRecord } from '../route/adaptive-route-record.ts';
import { adaptiveRouteRecordSha256 } from '../route/adaptive-route-persistence.ts';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';
import {
  parseDesignDevelopmentContract,
  type DesignDevelopmentContract,
  type DesignDevelopmentInvestigation,
} from './contract.ts';

export const ADAPTIVE_WORKFLOW_PLAN_SCHEMA = 'adaptive-workflow-plan-v1' as const;

export type AdaptiveWorkflowPlanErrorCode =
  | 'WORKFLOW_PLAN_MALFORMED'
  | 'WORKFLOW_PLAN_DUPLICATE'
  | 'WORKFLOW_PLAN_ROUTE_MISMATCH'
  | 'WORKFLOW_PLAN_UNSUPPORTED_INVESTIGATION'
  | 'WORKFLOW_PLAN_UNKNOWN_EVIDENCE'
  | 'WORKFLOW_PLAN_INAPPLICABLE_EVIDENCE'
  | 'WORKFLOW_PLAN_DEPENDENCY_MISMATCH';

export class AdaptiveWorkflowPlanError extends Error {
  override readonly name = 'AdaptiveWorkflowPlanError';
  readonly code: AdaptiveWorkflowPlanErrorCode;

  constructor(code: AdaptiveWorkflowPlanErrorCode) {
    super(code);
    this.code = code;
  }
}

type EvidenceKind =
  | 'reference-need'
  | 'content-shape'
  | 'state-impact'
  | 'structural-impact'
  | 'component-impact'
  | 'interaction-impact'
  | 'technical-risk';

type EvidenceValueByKind = Readonly<{
  'reference-need': 'translation-unresolved';
  'content-shape': 'variable' | 'repeated' | 'unbounded';
  'state-impact': 'single-state' | 'multi-state' | 'multi-screen';
  'structural-impact': 'hierarchy' | 'information-architecture' | 'responsive-order' | 'task-sequence';
  'component-impact': 'new' | 'anatomy-change' | 'context-risk';
  'interaction-impact': 'branching' | 'timing' | 'feedback' | 'gesture';
  'technical-risk': 'integration' | 'performance' | 'browser' | 'data-feasibility';
}>;

export type WorkflowEvidenceSource = Readonly<{
  path: string;
  schema: string;
  sha256: string;
  locator: string;
}>;

export type AdaptiveWorkflowEvidence = {
  readonly [Kind in EvidenceKind]: Readonly<{
    id: string;
    kind: Kind;
    value: EvidenceValueByKind[Kind];
    source: WorkflowEvidenceSource;
  }>
}[EvidenceKind];

export type AdaptiveWorkflowInvestigation = Readonly<{
  id: string;
  evidenceIds: readonly string[];
  dependsOn: readonly string[];
}>;

export type AdaptiveWorkflowRouteBinding = Readonly<{
  recordSha256: string;
  sourceContractSha256: string;
  authoritySha256: string;
}>;

export type AdaptiveWorkflowPlan = Readonly<{
  schema: typeof ADAPTIVE_WORKFLOW_PLAN_SCHEMA;
  route: AdaptiveWorkflowRouteBinding;
  development: DesignDevelopmentContract;
  evidence: readonly AdaptiveWorkflowEvidence[];
  investigations: readonly AdaptiveWorkflowInvestigation[];
  rationale: string;
}>;

export type AdaptiveWorkflowPlanRouteContext = Readonly<{
  routeRecord: AdaptiveRouteRecord;
  routeAuthorityBytes: Uint8Array;
  authority?: Readonly<{ root: string; invocation: import('../runtime/invocation.ts').ProjectRunInvocation }>;
}>;

export type AdaptiveWorkflowInvestigationCitation = Readonly<{
  id: string;
  evidenceIds: readonly string[];
}>;

export type CreateAdaptiveWorkflowPlanInput = AdaptiveWorkflowPlanRouteContext & Readonly<{
  development: unknown;
  evidence: unknown;
  investigations: unknown;
  rationale: string;
}>;

const SHA256 = /^[a-f0-9]{64}$/;
const EVIDENCE_VALUES: Readonly<Record<EvidenceKind, readonly string[]>> = Object.freeze({
  'reference-need': Object.freeze(['translation-unresolved']),
  'content-shape': Object.freeze(['variable', 'repeated', 'unbounded']),
  'state-impact': Object.freeze(['single-state', 'multi-state', 'multi-screen']),
  'structural-impact': Object.freeze(['hierarchy', 'information-architecture', 'responsive-order', 'task-sequence']),
  'component-impact': Object.freeze(['new', 'anatomy-change', 'context-risk']),
  'interaction-impact': Object.freeze(['branching', 'timing', 'feedback', 'gesture']),
  'technical-risk': Object.freeze(['integration', 'performance', 'browser', 'data-feasibility']),
});

const APPLICABLE_EVIDENCE = Object.freeze({
  'reference-principle': Object.freeze(['reference-need']),
  'content-state-model': Object.freeze(['content-shape', 'state-impact']),
  'structural-layout': Object.freeze(['structural-impact', 'content-shape', 'state-impact']),
  'component-in-context': Object.freeze(['component-impact', 'content-shape', 'state-impact']),
  'interaction-behavior': Object.freeze(['interaction-impact', 'state-impact']),
  'technical-slice': Object.freeze(['technical-risk']),
} as const satisfies Readonly<Record<DesignDevelopmentInvestigation['kind'], readonly EvidenceKind[]>>);

const DEPENDENCY_KINDS = Object.freeze({
  'reference-principle': Object.freeze([]),
  'content-state-model': Object.freeze([]),
  'structural-layout': Object.freeze(['reference-principle', 'content-state-model']),
  'component-in-context': Object.freeze(['reference-principle', 'content-state-model', 'structural-layout']),
  'interaction-behavior': Object.freeze(['content-state-model', 'structural-layout', 'component-in-context']),
  'technical-slice': Object.freeze([]),
} as const satisfies Readonly<Record<DesignDevelopmentInvestigation['kind'], readonly DesignDevelopmentInvestigation['kind'][]>>);

type Fields = ReadonlyMap<string, unknown>;

function fail(code: AdaptiveWorkflowPlanErrorCode): never {
  throw new AdaptiveWorkflowPlanError(code);
}

function fields(value: unknown, expected: readonly string[]): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) return fail('WORKFLOW_PLAN_MALFORMED');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return fail('WORKFLOW_PLAN_MALFORMED');
  }
  const result = new Map<string, unknown>();
  for (const key of expected) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail('WORKFLOW_PLAN_MALFORMED');
    }
    result.set(key, descriptor.value);
  }
  return result;
}

function arrayValues(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return fail('WORKFLOW_PLAN_MALFORMED');
  }
  const expected = ['length', ...Array.from({ length: value.length }, (_, index) => String(index))];
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return fail('WORKFLOW_PLAN_MALFORMED');
  }
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail('WORKFLOW_PLAN_MALFORMED');
    }
    result.push(descriptor.value);
  }
  return result;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim()) {
    return fail('WORKFLOW_PLAN_MALFORMED');
  }
  return value;
}

function sha256(value: unknown): string {
  if (typeof value !== 'string' || !SHA256.test(value)) return fail('WORKFLOW_PLAN_MALFORMED');
  return value;
}

function strings(value: unknown, allowEmpty: boolean): readonly string[] {
  const values = arrayValues(value).map(text);
  if ((!allowEmpty && values.length === 0) || new Set(values).size !== values.length) {
    return fail(values.length === 0 ? 'WORKFLOW_PLAN_MALFORMED' : 'WORKFLOW_PLAN_DUPLICATE');
  }
  return Object.freeze(values);
}

function hash(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function validateDevelopmentShape(value: unknown): void {
  const development = fields(value, [
    'schema', 'owner', 'mode', 'risks', 'investigations', 'referencePrinciples', 'rationale',
  ]);
  for (const risk of arrayValues(development.get('risks'))) {
    fields(risk, ['id', 'question', 'consequence', 'uncertainty', 'lateReversalCost']);
  }
  for (const investigation of arrayValues(development.get('investigations'))) {
    const item = fields(investigation, ['id', 'kind', 'riskIds', 'question', 'fidelity', 'stopWhen']);
    arrayValues(item.get('riskIds'));
    fields(item.get('fidelity'), ['content', 'visual', 'interaction', 'behavior', 'environment']);
  }
  for (const principle of arrayValues(development.get('referencePrinciples'))) {
    const item = fields(principle, ['id', 'sourceIds', 'dimension', 'statement', 'doNotCopy', 'observableConsequence']);
    arrayValues(item.get('sourceIds'));
    arrayValues(item.get('doNotCopy'));
  }
}

function development(value: unknown): DesignDevelopmentContract {
  try {
    validateDevelopmentShape(value);
    return parseDesignDevelopmentContract(value);
  } catch (error) {
    if (error instanceof AdaptiveWorkflowPlanError) throw error;
    return fail('WORKFLOW_PLAN_MALFORMED');
  }
}

function evidenceSource(value: unknown): WorkflowEvidenceSource {
  const item = fields(value, ['path', 'schema', 'sha256', 'locator']);
  return Object.freeze({
    path: text(item.get('path')),
    schema: text(item.get('schema')),
    sha256: sha256(item.get('sha256')),
    locator: text(item.get('locator')),
  });
}

function evidenceItem(value: unknown): AdaptiveWorkflowEvidence {
  const item = fields(value, ['id', 'kind', 'value', 'source']);
  const kind = item.get('kind');
  if (typeof kind !== 'string' || !Object.hasOwn(EVIDENCE_VALUES, kind)) {
    return fail('WORKFLOW_PLAN_MALFORMED');
  }
  const typedKind = kind as EvidenceKind;
  const evidenceValue = item.get('value');
  if (typeof evidenceValue !== 'string' || !EVIDENCE_VALUES[typedKind].includes(evidenceValue)) {
    return fail('WORKFLOW_PLAN_MALFORMED');
  }
  return Object.freeze({
    id: text(item.get('id')),
    kind: typedKind,
    value: evidenceValue,
    source: evidenceSource(item.get('source')),
  }) as AdaptiveWorkflowEvidence;
}

function evidenceList(value: unknown): readonly AdaptiveWorkflowEvidence[] {
  const evidence = arrayValues(value).map(evidenceItem);
  if (new Set(evidence.map(({ id }) => id)).size !== evidence.length) return fail('WORKFLOW_PLAN_DUPLICATE');
  return Object.freeze(evidence);
}

function citation(value: unknown): AdaptiveWorkflowInvestigationCitation {
  const item = fields(value, ['id', 'evidenceIds']);
  return Object.freeze({ id: text(item.get('id')), evidenceIds: strings(item.get('evidenceIds'), true) });
}

function persistedInvestigation(value: unknown): AdaptiveWorkflowInvestigation {
  const item = fields(value, ['id', 'evidenceIds', 'dependsOn']);
  return Object.freeze({
    id: text(item.get('id')),
    evidenceIds: strings(item.get('evidenceIds'), true),
    dependsOn: strings(item.get('dependsOn'), true),
  });
}

function uniqueInvestigations<T extends Readonly<{ id: string }>>(values: readonly T[]): void {
  if (new Set(values.map(({ id }) => id)).size !== values.length) return fail('WORKFLOW_PLAN_DUPLICATE');
}

function dependenciesFor(
  investigation: DesignDevelopmentInvestigation,
  selected: readonly DesignDevelopmentInvestigation[],
): readonly string[] {
  const dependencies = DEPENDENCY_KINDS[investigation.kind];
  return Object.freeze(selected
    .filter((candidate) => dependencies.some((kind) => kind === candidate.kind))
    .map(({ id }) => id));
}

function validateInvestigationEvidence(
  contract: DesignDevelopmentContract,
  evidence: readonly AdaptiveWorkflowEvidence[],
  investigations: readonly AdaptiveWorkflowInvestigationCitation[],
): void {
  uniqueInvestigations(investigations);
  if (investigations.length !== contract.investigations.length
    || investigations.some(({ id }, index) => id !== contract.investigations[index]?.id)) {
    return fail('WORKFLOW_PLAN_UNSUPPORTED_INVESTIGATION');
  }
  const byEvidence = new Map(evidence.map((item) => [item.id, item]));
  const used = new Set<string>();
  for (let index = 0; index < investigations.length; index += 1) {
    const citation = investigations[index];
    const selected = contract.investigations[index];
    if (citation === undefined || selected === undefined || citation.evidenceIds.length === 0) {
      return fail('WORKFLOW_PLAN_UNSUPPORTED_INVESTIGATION');
    }
    for (const evidenceId of citation.evidenceIds) {
      const cited = byEvidence.get(evidenceId);
      if (cited === undefined) return fail('WORKFLOW_PLAN_UNKNOWN_EVIDENCE');
      if (!APPLICABLE_EVIDENCE[selected.kind].some((kind) => kind === cited.kind)) {
        return fail('WORKFLOW_PLAN_INAPPLICABLE_EVIDENCE');
      }
      used.add(evidenceId);
    }
  }
  if (used.size !== evidence.length) return fail('WORKFLOW_PLAN_UNKNOWN_EVIDENCE');
}

function deriveInvestigations(
  contract: DesignDevelopmentContract,
  evidence: readonly AdaptiveWorkflowEvidence[],
  citations: readonly AdaptiveWorkflowInvestigationCitation[],
): readonly AdaptiveWorkflowInvestigation[] {
  validateInvestigationEvidence(contract, evidence, citations);
  return Object.freeze(citations.map((citation, index) => {
    const selected = contract.investigations[index];
    if (selected === undefined) return fail('WORKFLOW_PLAN_UNSUPPORTED_INVESTIGATION');
    return Object.freeze({
      id: citation.id,
      evidenceIds: citation.evidenceIds,
      dependsOn: dependenciesFor(selected, contract.investigations),
    });
  }));
}

function authorityValue(bytes: Uint8Array, record: AdaptiveRouteRecord, routeSha256: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) return fail('WORKFLOW_PLAN_MALFORMED');
    throw error;
  }
  const authority = fields(value, [
    'schema', 'invocation', 'sourceSha256', 'routeSha256', 'selectedModel', 'allowedPaths', 'namedDependencies',
  ]);
  const invocation = fields(authority.get('invocation'), ['buildSha256', 'loadedSkillSha256', 'briefSha256']);
  for (const key of ['buildSha256', 'loadedSkillSha256', 'briefSha256']) sha256(invocation.get(key));
  if (authority.get('schema') !== 'adaptive-route-authority-v1'
    || authority.get('sourceSha256') !== record.sourceContractSha256
    || authority.get('routeSha256') !== routeSha256
    || canonicalRouteJson(authority.get('selectedModel')) !== canonicalRouteJson(record.selectedModel)
    || canonicalRouteJson(authority.get('allowedPaths')) !== canonicalRouteJson(record.allowedPaths)
    || canonicalRouteJson(authority.get('namedDependencies')) !== canonicalRouteJson(record.namedDependencies)
    || Buffer.from(bytes).toString('utf8') !== `${canonicalRouteJson(value)}\n`) {
    return fail('WORKFLOW_PLAN_ROUTE_MISMATCH');
  }
  return value;
}

function routeBinding(context: AdaptiveWorkflowPlanRouteContext): AdaptiveWorkflowRouteBinding {
  let record: AdaptiveRouteRecord;
  try {
    record = parseRouteRecord(context.routeRecord, context.authority);
  } catch (error) {
    if (error instanceof Error && error.name === 'AdaptiveRouteError') return fail('WORKFLOW_PLAN_ROUTE_MISMATCH');
    throw error;
  }
  const recordSha256 = adaptiveRouteRecordSha256(record);
  authorityValue(context.routeAuthorityBytes, record, recordSha256);
  return Object.freeze({
    recordSha256,
    sourceContractSha256: record.sourceContractSha256,
    authoritySha256: hash(context.routeAuthorityBytes),
  });
}

function parsedRouteBinding(value: unknown): AdaptiveWorkflowRouteBinding {
  const route = fields(value, ['recordSha256', 'sourceContractSha256', 'authoritySha256']);
  return Object.freeze({
    recordSha256: sha256(route.get('recordSha256')),
    sourceContractSha256: sha256(route.get('sourceContractSha256')),
    authoritySha256: sha256(route.get('authoritySha256')),
  });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function parse(value: unknown, context?: AdaptiveWorkflowPlanRouteContext): AdaptiveWorkflowPlan {
  const item = fields(value, ['schema', 'route', 'development', 'evidence', 'investigations', 'rationale']);
  if (item.get('schema') !== ADAPTIVE_WORKFLOW_PLAN_SCHEMA) return fail('WORKFLOW_PLAN_MALFORMED');
  const route = parsedRouteBinding(item.get('route'));
  if (context !== undefined) {
    const expected = routeBinding(context);
    if (canonicalWorkflowPlanJson(route) !== canonicalWorkflowPlanJson(expected)) {
      return fail('WORKFLOW_PLAN_ROUTE_MISMATCH');
    }
  }
  const contract = development(item.get('development'));
  const evidence = evidenceList(item.get('evidence'));
  const investigations = arrayValues(item.get('investigations')).map(persistedInvestigation);
  uniqueInvestigations(investigations);
  const citations = investigations.map(({ id, evidenceIds }) => Object.freeze({ id, evidenceIds }));
  const expected = deriveInvestigations(contract, evidence, citations);
  if (investigations.some((investigation, index) => {
    const derived = expected[index];
    return derived === undefined || !sameStrings(investigation.dependsOn, derived.dependsOn);
  })) return fail('WORKFLOW_PLAN_DEPENDENCY_MISMATCH');
  return Object.freeze({
    schema: ADAPTIVE_WORKFLOW_PLAN_SCHEMA,
    route,
    development: contract,
    evidence,
    investigations: expected,
    rationale: text(item.get('rationale')),
  });
}

/** Creates a detached plan while deriving all route bindings and conditional dependency edges. */
export function createAdaptiveWorkflowPlan(input: CreateAdaptiveWorkflowPlanInput): AdaptiveWorkflowPlan {
  try {
    const contract = development(input.development);
    const evidence = evidenceList(input.evidence);
    const citations = arrayValues(input.investigations).map(citation);
    return Object.freeze({
      schema: ADAPTIVE_WORKFLOW_PLAN_SCHEMA,
      route: routeBinding(input),
      development: contract,
      evidence,
      investigations: deriveInvestigations(contract, evidence, citations),
      rationale: text(input.rationale),
    });
  } catch (error) {
    if (error instanceof AdaptiveWorkflowPlanError) throw error;
    return fail('WORKFLOW_PLAN_MALFORMED');
  }
}

/** Parses a closed persisted plan and, when supplied, verifies its exact current route authority. */
export function parseAdaptiveWorkflowPlan(
  value: unknown,
  context?: AdaptiveWorkflowPlanRouteContext,
): AdaptiveWorkflowPlan {
  try {
    return parse(value, context);
  } catch (error) {
    if (error instanceof AdaptiveWorkflowPlanError) throw error;
    return fail('WORKFLOW_PLAN_MALFORMED');
  }
}

function canonicalObject(value: object): string {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) {
    throw new TypeError('workflow plan canonical data contains non-data fields');
  }
  const entries: string[] = [];
  for (const key of keys.sort()) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('workflow plan canonical data contains non-data fields');
    }
    entries.push(`${JSON.stringify(key)}:${canonicalWorkflowPlanJson(descriptor.value)}`);
  }
  return `{${entries.join(',')}}`;
}

/** Canonical JSON for immutable workflow records; non-JSON and exotic values fail closed. */
export function canonicalWorkflowPlanJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value) && Reflect.getPrototypeOf(value) === Array.prototype) {
    arrayValues(value);
    return `[${value.map(canonicalWorkflowPlanJson).join(',')}]`;
  }
  if (typeof value === 'object' && Reflect.getPrototypeOf(value) === Object.prototype) return canonicalObject(value);
  throw new TypeError('workflow plan canonical data must be plain JSON data');
}

export function adaptiveWorkflowPlanSha256(plan: AdaptiveWorkflowPlan): string {
  return hash(`${canonicalWorkflowPlanJson(plan)}\n`);
}

export function adaptiveWorkflowPlanPath(plan: AdaptiveWorkflowPlan): string {
  return `workflow-plan-runs/sha256-${adaptiveWorkflowPlanSha256(plan)}.json`;
}
