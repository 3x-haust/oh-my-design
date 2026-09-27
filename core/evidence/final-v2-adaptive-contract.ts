import { isAdaptiveSourceSealRoute, type AdaptiveSourceSealRoute } from '../source-seal/adaptive-inputs.ts';
import type { ActivationContext } from '../runtime/activation.ts';
import { parseFinalConfidenceDebt, type FinalConfidenceDebt } from './final-v2-confidence-debt.ts';
import type { ConfidenceDebt } from '../brief/confidence-debt.ts';
import { parseMeasuredTerminal, type GraphReviewBindings } from './final-v2-measured-contract.ts';

export const FINAL_EVIDENCE_V2_ADAPTIVE_OMISSION_GRAPH_SCHEMA = 'final-evidence-v2-adaptive-omission-graph' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const OMISSIONS = Object.freeze([
  ['board', 'reference-board'],
  ['selection', 'reference-selection'],
  ['artDirection', 'art-direction'],
  ['handoff', 'art-direction'],
  ['usage', 'reference-selection'],
  ['renderedBeats', 'frame'],
  ['staticEvidence', 'art-direction'],
  ['motionEvidence', 'motion-one'],
  ['typeProof', 'type-proof'],
  ['composition', 'composition'],
] as const);

export type AdaptiveArtifactReceipt = Readonly<{ path: string; schema: string; sha256: string }>;
export type AdaptiveFinalOmission = Readonly<{
  id: typeof OMISSIONS[number][0];
  routeSkipId: typeof OMISSIONS[number][1];
  reason: string;
  routeSha256: string;
  authoritySha256: string;
} & ({ status: 'skipped' } | { status: 'selected-with-debt'; claim: 'not-verified'; debtIds: readonly string[] })>;
export type AdaptiveFinalEvidenceV2Graph = Readonly<{
  schema: typeof FINAL_EVIDENCE_V2_ADAPTIVE_OMISSION_GRAPH_SCHEMA;
  activation: AdaptiveArtifactReceipt;
  route: AdaptiveSourceSealRoute;
  omissions: readonly AdaptiveFinalOmission[];
  confidenceDebt?: FinalConfidenceDebt;
  copy: AdaptiveArtifactReceipt;
  sourceSeal: AdaptiveArtifactReceipt;
  buildIdentity: AdaptiveArtifactReceipt;

  contentFit?: AdaptiveArtifactReceipt;
  observations: readonly AdaptiveArtifactReceipt[];
} & GraphReviewBindings>;
export type AdaptiveFinalEvidenceV2Bindings = Readonly<{
  branch: 'adaptive-omission';
  activation: ActivationContext;
  buildSha256: string;
  routeSha256: string;
  claimPublication: unknown;
  limitations?: readonly ConfidenceDebt[];
}>;

export class AdaptiveFinalEvidenceGraphError extends Error {
  constructor(reason: string) { super(`final-evidence-v2 adaptive graph: ${reason}`); }
}
const fail = (reason: string): never => { throw new AdaptiveFinalEvidenceGraphError(reason); };
function fields(value: unknown, keys: readonly string[], label: string): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(`${label} must be an object`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key) => typeof key !== 'string' || !keys.includes(key))) return fail(`${label} has unexpected keys`);
  const result = new Map<string, unknown>();
  for (const key of keys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return fail(`${label} has invalid fields`);
    result.set(key, descriptor.value);
  }
  return result;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') return fail(`${label} must be non-empty text`);
  return value;
}
function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) return fail(`${label} must be a SHA-256 digest`);
  return value;
}
function safePath(value: unknown, label: string): string {
  const path = text(value, label);
  if (path.startsWith('/') || path.includes('\\') || path === '.' || path.split('/').some((part) => part === '' || part === '.' || part === '..')) return fail(`${label} is not project-relative`);
  return path;
}
function receipt(
  value: unknown,
  schema: string | readonly string[],
  label: string,
): AdaptiveArtifactReceipt {
  const item = fields(value, ['path', 'schema', 'sha256'], label);
  const actualSchema = text(item.get('schema'), `${label}.schema`);
  const expected = Array.isArray(schema) ? schema : [schema];
  if (!expected.includes(actualSchema)) return fail(`${label} schema is invalid`);
  return Object.freeze({ path: safePath(item.get('path'), `${label}.path`), schema: actualSchema, sha256: digest(item.get('sha256'), `${label}.sha256`) });
}
function omission(value: unknown, route: AdaptiveSourceSealRoute, index: number): AdaptiveFinalOmission {
  const deferred = typeof value === 'object' && value !== null && Reflect.get(value, 'status') === 'selected-with-debt';
  const item = fields(value, ['id', 'status', 'routeSkipId', 'reason', 'routeSha256', 'authoritySha256', ...(deferred ? ['claim', 'debtIds'] : [])], `omissions[${index}]`);
  const expected = OMISSIONS.find(([id]) => id === item.get('id'));
  if (expected === undefined) return fail(`omissions[${index}] identity is invalid`);
  if (item.get('id') !== expected[0] || !['skipped', 'selected-with-debt'].includes(String(item.get('status'))) || item.get('routeSkipId') !== expected[1]) return fail(`omissions[${index}] identity is invalid`);
  const routeSha256 = digest(item.get('routeSha256'), `omissions[${index}].routeSha256`);
  const authoritySha256 = digest(item.get('authoritySha256'), `omissions[${index}].authoritySha256`);
  if (routeSha256 !== route.record.sha256 || authoritySha256 !== route.authority.sha256) return fail(`omissions[${index}] does not bind the route and authority`);
  const stage = route.stages.find(({ id }) => id === expected[1]);
  const common = { id: expected[0], routeSkipId: expected[1], reason: text(item.get('reason'), `omissions[${index}].reason`), routeSha256, authoritySha256 };
  if (deferred) {
    const ids = item.get('debtIds');
    if (stage?.status === 'selected' && (stage.artifacts.length > 0 || stage.confidenceDebt === undefined)) return fail('completed selected evidence cannot be relabeled as debt');
    if (stage?.status === 'skipped' || item.get('claim') !== 'not-verified' || !Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !SHA256.test(id)) || new Set(ids).size !== ids.length) return fail('selected-with-debt needs selected work and unverified debt ids');
    return Object.freeze({ ...common, status: 'selected-with-debt', claim: 'not-verified', debtIds: Object.freeze(ids as string[]) });
  }
  if (stage?.status === 'selected') return fail(`omissions[${index}] contradicts selected stage ${expected[1]}`);
  return Object.freeze({ ...common, status: 'skipped' });
}
function receipts(value: unknown, schema: string, label: string): readonly AdaptiveArtifactReceipt[] {
  if (!Array.isArray(value) || value.length === 0) return fail(`${label} must be a non-empty array`);
  return Object.freeze(value.map((item, index) => receipt(item, schema, `${label}[${index}]`)));
}
function skippedArt(route: AdaptiveSourceSealRoute, omissions: readonly AdaptiveFinalOmission[]): void {
  const art = route.stages.find((stage) => stage.id === 'art-direction');
  if (art?.status !== 'skipped' && !omissions.some(o => o.id === 'artDirection' && o.status === 'selected-with-debt')) fail('a selected-art route needs an explicit selected-with-debt binding to use the omission branch');
}

export function isAdaptiveFinalEvidenceV2Graph(value: unknown): value is AdaptiveFinalEvidenceV2Graph {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Reflect.get(value, 'schema') === FINAL_EVIDENCE_V2_ADAPTIVE_OMISSION_GRAPH_SCHEMA;
}

export function validateAdaptiveFinalEvidenceV2Graph(value: unknown): AdaptiveFinalEvidenceV2Graph {
  const hasContentFit = typeof value === 'object' && value !== null && !Array.isArray(value)
    && Reflect.ownKeys(value).includes('contentFit');
  const hasDebt = typeof value === 'object' && value !== null && Reflect.ownKeys(value).includes('confidenceDebt');
  const measured = typeof value === 'object' && value !== null && Object.hasOwn(value, 'measuredTerminal');
  const graph = fields(value, ['schema', 'activation', 'route', 'omissions', 'copy', 'sourceSeal', 'buildIdentity', ...(measured ? ['measuredTerminal'] : ['blindLane', 'fidelityLane', 'protocolLane']), ...(hasContentFit ? ['contentFit'] : []), ...(hasDebt ? ['confidenceDebt'] : []), 'observations'], 'graph');
  if (graph.get('schema') !== FINAL_EVIDENCE_V2_ADAPTIVE_OMISSION_GRAPH_SCHEMA || !isAdaptiveSourceSealRoute(graph.get('route'))) fail('unsupported adaptive graph schema or route receipt');
  const route = graph.get('route');
  if (!isAdaptiveSourceSealRoute(route)) return fail('route receipt is invalid');
  const rawOmissions = graph.get('omissions');
  const omissionItems = Array.isArray(rawOmissions) ? rawOmissions : fail('omissions must be an array');
  if (omissionItems.length > OMISSIONS.length) fail('omissions exceed the adaptive terminal set');
  const omissions = Object.freeze(omissionItems.map((value, index) => omission(value, route, index)));
  skippedArt(route, omissions);
  const confidenceDebt = hasDebt ? parseFinalConfidenceDebt(graph.get('confidenceDebt')) : undefined;
  if (omissions.some(o => o.status === 'selected-with-debt') && !confidenceDebt) fail('selected-with-debt requires explicit terminal limitations');
  for (const o of omissions) if (o.status === 'selected-with-debt' && o.debtIds.some(id => !confidenceDebt?.limitations.some(d => d.id === id && d.stage === o.routeSkipId))) fail('selected debt is not disclosed as a limitation');
  const positions = omissions.map(({ id }) => OMISSIONS.findIndex(([expected]) => expected === id));
  if (positions.some((position, index) => position < 0 || (index > 0 && position <= positions[index - 1]!))) {
    fail('omissions must be unique and follow canonical adaptive terminal order');
  }
  const result: AdaptiveFinalEvidenceV2Graph = Object.freeze({
    schema: FINAL_EVIDENCE_V2_ADAPTIVE_OMISSION_GRAPH_SCHEMA,
    activation: receipt(graph.get('activation'), 'activation-context-v2', 'activation'), route, omissions,
    ...(confidenceDebt ? { confidenceDebt } : {}),
    copy: receipt(graph.get('copy'), 'copy-deck-v2', 'copy'), sourceSeal: receipt(graph.get('sourceSeal'), 'source-seal-v1', 'sourceSeal'),
    buildIdentity: receipt(graph.get('buildIdentity'), 'omd-build-identity-v1', 'buildIdentity'),
    ...(measured ? { measuredTerminal: parseMeasuredTerminal(graph.get('measuredTerminal')) } : { blindLane: receipt(
      graph.get('blindLane'),
      ['adaptive-blind-review-v1', 'adaptive-blind-review-v2', 'adaptive-blind-review-v3'],
      'blindLane',
    ),
    fidelityLane: receipt(graph.get('fidelityLane'), 'adaptive-fidelity-review-v1', 'fidelityLane'),
    protocolLane: receipt(graph.get('protocolLane'), 'adaptive-protocol-review-v1', 'protocolLane') }),
    ...(hasContentFit ? { contentFit: receipt(graph.get('contentFit'), 'content-fit-receipt-v1', 'contentFit') } : {}),
    observations: receipts(graph.get('observations'), 'observation-v2', 'observations'),
  });
  const paths = [result.activation.path, ...[result.route.pointer, result.route.record, result.route.sourcePointer, result.route.sourceContract, result.route.authority].map((item) => item.path), result.copy.path, result.sourceSeal.path, result.buildIdentity.path, ...[result.blindLane, result.fidelityLane, result.protocolLane].flatMap(r => r ? [r.path] : []), ...(result.contentFit === undefined ? [] : [result.contentFit.path]), ...result.observations.map((item) => item.path)];
  if (new Set(paths).size !== paths.length) fail('receipt paths must be unique');
  return result;
}

export const adaptiveFinalOmissionMappings = (): readonly (readonly [AdaptiveFinalOmission['id'], AdaptiveFinalOmission['routeSkipId']])[] => OMISSIONS;
