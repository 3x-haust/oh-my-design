import { isAdaptiveSourceSealRoute, type AdaptiveSourceSealRoute } from '../source-seal/adaptive-inputs.ts';
import type { ActivationContext } from '../runtime/activation.ts';

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
  status: 'skipped';
  routeSkipId: typeof OMISSIONS[number][1];
  reason: string;
  routeSha256: string;
  authoritySha256: string;
}>;
export type AdaptiveFinalEvidenceV2Graph = Readonly<{
  schema: typeof FINAL_EVIDENCE_V2_ADAPTIVE_OMISSION_GRAPH_SCHEMA;
  activation: AdaptiveArtifactReceipt;
  route: AdaptiveSourceSealRoute;
  omissions: readonly AdaptiveFinalOmission[];
  copy: AdaptiveArtifactReceipt;
  sourceSeal: AdaptiveArtifactReceipt;
  buildIdentity: AdaptiveArtifactReceipt;
  blindLane: AdaptiveArtifactReceipt;
  fidelityLane: AdaptiveArtifactReceipt;
  protocolLane: AdaptiveArtifactReceipt;
  observations: readonly AdaptiveArtifactReceipt[];
}>;
export type AdaptiveFinalEvidenceV2Bindings = Readonly<{
  branch: 'adaptive-omission';
  activation: ActivationContext;
  buildSha256: string;
  routeSha256: string;
  claimPublication: unknown;
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
function receipt(value: unknown, schema: string, label: string): AdaptiveArtifactReceipt {
  const item = fields(value, ['path', 'schema', 'sha256'], label);
  if (item.get('schema') !== schema) return fail(`${label} schema is invalid`);
  return Object.freeze({ path: safePath(item.get('path'), `${label}.path`), schema, sha256: digest(item.get('sha256'), `${label}.sha256`) });
}
function omission(value: unknown, expected: typeof OMISSIONS[number], route: AdaptiveSourceSealRoute, index: number): AdaptiveFinalOmission {
  const item = fields(value, ['id', 'status', 'routeSkipId', 'reason', 'routeSha256', 'authoritySha256'], `omissions[${index}]`);
  if (item.get('id') !== expected[0] || item.get('status') !== 'skipped' || item.get('routeSkipId') !== expected[1]) return fail(`omissions[${index}] identity is invalid`);
  const routeSha256 = digest(item.get('routeSha256'), `omissions[${index}].routeSha256`);
  const authoritySha256 = digest(item.get('authoritySha256'), `omissions[${index}].authoritySha256`);
  if (routeSha256 !== route.record.sha256 || authoritySha256 !== route.authority.sha256) return fail(`omissions[${index}] does not bind the route and authority`);
  return Object.freeze({ id: expected[0], status: 'skipped', routeSkipId: expected[1], reason: text(item.get('reason'), `omissions[${index}].reason`), routeSha256, authoritySha256 });
}
function receipts(value: unknown, schema: string, label: string): readonly AdaptiveArtifactReceipt[] {
  if (!Array.isArray(value) || value.length === 0) return fail(`${label} must be a non-empty array`);
  return Object.freeze(value.map((item, index) => receipt(item, schema, `${label}[${index}]`)));
}
function skippedArt(route: AdaptiveSourceSealRoute): void {
  const art = route.stages.find((stage) => stage.id === 'art-direction');
  if (art?.status !== 'skipped') fail('a selected-art route cannot use the omission branch');
}

export function isAdaptiveFinalEvidenceV2Graph(value: unknown): value is AdaptiveFinalEvidenceV2Graph {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Reflect.get(value, 'schema') === FINAL_EVIDENCE_V2_ADAPTIVE_OMISSION_GRAPH_SCHEMA;
}

export function validateAdaptiveFinalEvidenceV2Graph(value: unknown): AdaptiveFinalEvidenceV2Graph {
  const graph = fields(value, ['schema', 'activation', 'route', 'omissions', 'copy', 'sourceSeal', 'buildIdentity', 'blindLane', 'fidelityLane', 'protocolLane', 'observations'], 'graph');
  if (graph.get('schema') !== FINAL_EVIDENCE_V2_ADAPTIVE_OMISSION_GRAPH_SCHEMA || !isAdaptiveSourceSealRoute(graph.get('route'))) fail('unsupported adaptive graph schema or route receipt');
  const route = graph.get('route');
  if (!isAdaptiveSourceSealRoute(route)) return fail('route receipt is invalid');
  skippedArt(route);
  const rawOmissions = graph.get('omissions');
  const omissionItems = Array.isArray(rawOmissions) ? rawOmissions : fail('omissions must be an array');
  if (omissionItems.length !== OMISSIONS.length) fail('omissions do not cover the fixed adaptive terminal set');
  const omissions = Object.freeze(OMISSIONS.map((expected, index) => omission(omissionItems[index], expected, route, index)));
  const result: AdaptiveFinalEvidenceV2Graph = Object.freeze({
    schema: FINAL_EVIDENCE_V2_ADAPTIVE_OMISSION_GRAPH_SCHEMA,
    activation: receipt(graph.get('activation'), 'activation-context-v2', 'activation'), route, omissions,
    copy: receipt(graph.get('copy'), 'copy-deck-v2', 'copy'), sourceSeal: receipt(graph.get('sourceSeal'), 'source-seal-v1', 'sourceSeal'),
    buildIdentity: receipt(graph.get('buildIdentity'), 'omd-build-identity-v1', 'buildIdentity'),
    blindLane: receipt(graph.get('blindLane'), 'adaptive-blind-review-v1', 'blindLane'),
    fidelityLane: receipt(graph.get('fidelityLane'), 'adaptive-fidelity-review-v1', 'fidelityLane'),
    protocolLane: receipt(graph.get('protocolLane'), 'adaptive-protocol-review-v1', 'protocolLane'),
    observations: receipts(graph.get('observations'), 'observation-v2', 'observations'),
  });
  const paths = [result.activation.path, ...[result.route.pointer, result.route.record, result.route.sourcePointer, result.route.sourceContract, result.route.authority].map((item) => item.path), result.copy.path, result.sourceSeal.path, result.buildIdentity.path, result.blindLane.path, result.fidelityLane.path, result.protocolLane.path, ...result.observations.map((item) => item.path)];
  if (new Set(paths).size !== paths.length) fail('receipt paths must be unique');
  return result;
}

export const adaptiveFinalOmissionMappings = (): readonly (readonly [AdaptiveFinalOmission['id'], AdaptiveFinalOmission['routeSkipId']])[] => OMISSIONS;
