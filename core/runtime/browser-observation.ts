import { createHash } from 'node:crypto';
import { decodePng } from '../motion/energy.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { validateDecisionGraph, type DesignDecision } from '../deliberation/contracts.ts';

export const BROWSER_OBSERVATION_SCHEMA = 'browser-observation-v1';
export const BROWSER_OBSERVATION_SET_SCHEMA = 'browser-observation-set-v1';
const SHA256 = /^[a-f0-9]{64}$/;
const STATE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type BrowserObservationDecisionLinkErrorCode =
  | 'MALFORMED_BROWSER_OBSERVATION'
  | 'MISSING_DECISION_LINK'
  | 'UNKNOWN_DESIGN_DECISION'
  | 'UNBOUND_DESIGN_DECISION'
  | 'DUPLICATE_DESIGN_DECISION_ID'
  | 'STALE_DECISION_GRAPH'
  | 'MISMATCHED_OBSERVATION_DIGEST'
  | 'INVALID_OBSERVATION_ARTIFACT'
  | 'STALE_OBSERVATION_ARTIFACT';
export class BrowserObservationDecisionLinkError extends Error {
  override readonly name = 'BrowserObservationDecisionLinkError';
  readonly code: BrowserObservationDecisionLinkErrorCode;
  constructor(code: BrowserObservationDecisionLinkErrorCode, message: string) { super(message); this.code = code; }
}
export type BrowserObservationDecisionRef = Readonly<{ decisionId: string; decisionSha256: string }>;
export type BrowserObservationCore = Readonly<{
  schema: typeof BROWSER_OBSERVATION_SCHEMA;
  testedUrl: string;
  testedState: string;
  viewport: Readonly<{ width: number; height: number }>;
  observableResult: Readonly<{
    kind: 'screenshot';
    capture: Readonly<{ path: string; sha256: string }>;
    result: Readonly<{ measurement: 'viewport-pixels'; width: number; height: number }>;
  }>;
  decisionRefs: readonly BrowserObservationDecisionRef[];
}>;
export type BrowserObservation = BrowserObservationCore & Readonly<{ observationSha256: string }>;
export type BrowserObservationSet = Readonly<{
  schema: typeof BROWSER_OBSERVATION_SET_SCHEMA;
  decisionGraphSha256: string;
  observations: readonly BrowserObservation[];
}>;

type Fields = ReadonlyMap<string, unknown>;
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
function fail(code: BrowserObservationDecisionLinkErrorCode, message: string): never { throw new BrowserObservationDecisionLinkError(code, message); }
function dataValue(value: object, key: string | symbol, label: string, enumerable = true): unknown {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !('value' in descriptor) || descriptor.enumerable !== enumerable) fail('MALFORMED_BROWSER_OBSERVATION', `${label} must contain enumerable own data properties only`);
  return descriptor.value;
}
function fields(value: unknown, keys: readonly string[], label: string, exact = true): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('MALFORMED_BROWSER_OBSERVATION', `${label} must be an object`);
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail('MALFORMED_BROWSER_OBSERVATION', `${label} must not inherit input properties`);
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string')) fail('MALFORMED_BROWSER_OBSERVATION', `${label} must not contain Symbol keys`);
  const names = own.filter((key): key is string => typeof key === 'string');
  if (exact && (names.length !== keys.length || keys.some((key) => !names.includes(key)))) fail('MALFORMED_BROWSER_OBSERVATION', `${label} has unknown or missing keys`);
  const result = new Map<string, unknown>();
  for (const key of names) result.set(key, dataValue(value, key, `${label}.${key}`));
  return result;
}
function values(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) fail('MALFORMED_BROWSER_OBSERVATION', `${label} must be an array`);
  const own = Reflect.ownKeys(value);
  const expected = Array.from({ length: value.length }, (_, index) => String(index));
  if (own.length !== expected.length + 1 || own.some((key) => key !== 'length' && (typeof key !== 'string' || !expected.includes(key)))) fail('MALFORMED_BROWSER_OBSERVATION', `${label} must be dense and undecorated`);
  dataValue(value, 'length', `${label}.length`, false);
  return expected.map((key) => dataValue(value, key, `${label}[${key}]`));
}
function text(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > 4096 || (pattern !== undefined && !pattern.test(value))) fail('MALFORMED_BROWSER_OBSERVATION', `${label} is invalid`);
  return value;
}
function digest(value: unknown, label: string): string {
  return text(value, label, SHA256);
}
function safePath(value: unknown, label: string): string {
  const path = text(value, label);
  if (path.includes('\\') || path.includes('\0') || path.startsWith('/') || path.split('/').some((part) => part === '' || part === '.' || part === '..')) fail('MALFORMED_BROWSER_OBSERVATION', `${label} must be a safe project-relative path`);
  return path;
}
function dimension(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 16384) fail('MALFORMED_BROWSER_OBSERVATION', `${label} must be a bounded positive integer`);
  return value;
}
function testedUrl(value: unknown): string {
  const input = text(value, 'testedUrl');
  let parsed: URL;
  try { parsed = new URL(input); } catch { return fail('MALFORMED_BROWSER_OBSERVATION', 'testedUrl must be an absolute browser URL'); }
  if (!['http:', 'https:', 'file:'].includes(parsed.protocol) || parsed.username !== '' || parsed.password !== '' || parsed.hash !== '' || parsed.href !== input) fail('MALFORMED_BROWSER_OBSERVATION', 'testedUrl must be a canonical browser URL without credentials or fragment');
  return input;
}
function parseRef(value: unknown, label: string): BrowserObservationDecisionRef {
  const item = fields(value, ['decisionId', 'decisionSha256'], label);
  return Object.freeze({ decisionId: text(item.get('decisionId'), `${label}.decisionId`, STATE), decisionSha256: digest(item.get('decisionSha256'), `${label}.decisionSha256`) });
}
function parseObservation(value: unknown, index: number): BrowserObservation {
  const label = `browserObservations.observations[${index}]`;
  const item = fields(value, ['schema', 'testedUrl', 'testedState', 'viewport', 'observableResult', 'decisionRefs', 'observationSha256'], label);
  if (item.get('schema') !== BROWSER_OBSERVATION_SCHEMA) fail('MALFORMED_BROWSER_OBSERVATION', `${label}.schema is invalid`);
  const viewport = fields(item.get('viewport'), ['width', 'height'], `${label}.viewport`);
  const result = fields(item.get('observableResult'), ['kind', 'capture', 'result'], `${label}.observableResult`);
  if (result.get('kind') !== 'screenshot') fail('MALFORMED_BROWSER_OBSERVATION', `${label}.observableResult.kind is invalid`);
  const capture = fields(result.get('capture'), ['path', 'sha256'], `${label}.observableResult.capture`);
  const measured = fields(result.get('result'), ['measurement', 'width', 'height'], `${label}.observableResult.result`);
  if (measured.get('measurement') !== 'viewport-pixels') fail('MALFORMED_BROWSER_OBSERVATION', `${label}.observableResult.result.measurement is invalid`);
  const refs = values(item.get('decisionRefs'), `${label}.decisionRefs`).map((ref, refIndex) => parseRef(ref, `${label}.decisionRefs[${refIndex}]`));
  if (refs.length === 0 || new Set(refs.map((ref) => ref.decisionId)).size !== refs.length) fail('MALFORMED_BROWSER_OBSERVATION', `${label}.decisionRefs must be non-empty and duplicate-free`);
  const normalizedViewport = Object.freeze({ width: dimension(viewport.get('width'), `${label}.viewport.width`), height: dimension(viewport.get('height'), `${label}.viewport.height`) });
  const normalizedMeasurement: BrowserObservationCore['observableResult']['result'] = Object.freeze({ measurement: 'viewport-pixels', width: dimension(measured.get('width'), `${label}.observableResult.result.width`), height: dimension(measured.get('height'), `${label}.observableResult.result.height`) });
  if (normalizedMeasurement.width !== normalizedViewport.width || normalizedMeasurement.height !== normalizedViewport.height) fail('MALFORMED_BROWSER_OBSERVATION', `${label}.observableResult.result must measure the tested viewport`);
  const core: BrowserObservationCore = Object.freeze({
    schema: BROWSER_OBSERVATION_SCHEMA,
    testedUrl: testedUrl(item.get('testedUrl')),
    testedState: text(item.get('testedState'), `${label}.testedState`, STATE),
    viewport: normalizedViewport,
    observableResult: Object.freeze({ kind: 'screenshot', capture: Object.freeze({ path: safePath(capture.get('path'), `${label}.observableResult.capture.path`), sha256: digest(capture.get('sha256'), `${label}.observableResult.capture.sha256`) }), result: normalizedMeasurement }),
    decisionRefs: Object.freeze(refs),
  });
  const observationSha256 = digest(item.get('observationSha256'), `${label}.observationSha256`);
  if (browserObservationSha256(core) !== observationSha256) fail('MISMATCHED_OBSERVATION_DIGEST', `${label} digest does not bind its measured fields`);
  return Object.freeze({ ...core, observationSha256 });
}
export function designDecisionSha256(value: DesignDecision): string { return hash(canonicalJson(value)); }
export function browserObservationSha256(value: BrowserObservationCore): string {
  return hash(canonicalJson({ schema: value.schema, testedUrl: value.testedUrl, testedState: value.testedState, viewport: value.viewport, observableResult: value.observableResult, decisionRefs: value.decisionRefs }));
}
function validate(value: unknown, decisionGraphBytes: Uint8Array, required: boolean): BrowserObservationSet | undefined {
  const evidence = fields(value, [], 'observation.evidence', false);
  if (!evidence.has('browserObservations')) return required ? fail('MISSING_DECISION_LINK', 'final observation is missing browser decision links') : undefined;
  const set = fields(evidence.get('browserObservations'), ['schema', 'decisionGraphSha256', 'observations'], 'browserObservations');
  if (set.get('schema') !== BROWSER_OBSERVATION_SET_SCHEMA) fail('MALFORMED_BROWSER_OBSERVATION', 'browserObservations.schema is invalid');
  if (digest(set.get('decisionGraphSha256'), 'browserObservations.decisionGraphSha256') !== hash(decisionGraphBytes)) fail('STALE_DECISION_GRAPH', 'browser observations do not bind the current decision graph bytes');
  let graphInput: unknown;
  try { graphInput = JSON.parse(Buffer.from(decisionGraphBytes).toString('utf8')); } catch { return fail('MALFORMED_BROWSER_OBSERVATION', 'decision graph is not JSON'); }
  const checked = validateDecisionGraph(graphInput);
  if (checked.findings.some((finding) => finding.id === 'DECISION-DUPLICATE')) fail('DUPLICATE_DESIGN_DECISION_ID', 'decision graph contains duplicate decision IDs');
  const graph = checked.value ?? fail('MALFORMED_BROWSER_OBSERVATION', 'decision graph is invalid');
  const observations = values(set.get('observations'), 'browserObservations.observations').map(parseObservation);
  if (observations.length === 0 || new Set(observations.map((observation) => observation.observationSha256)).size !== observations.length) fail('MALFORMED_BROWSER_OBSERVATION', 'browser observations must be a non-empty duplicate-free set');
  const decisions = new Map(graph.decisions.map((item) => [item.id, item]));
  for (const observation of observations) for (const ref of observation.decisionRefs) {
    const bound = decisions.get(ref.decisionId) ?? fail('UNKNOWN_DESIGN_DECISION', `browser observation references unknown decision ${ref.decisionId}`);
    if (designDecisionSha256(bound) !== ref.decisionSha256) fail('UNBOUND_DESIGN_DECISION', `browser observation does not bind decision ${ref.decisionId}`);
  }
  return Object.freeze({ schema: BROWSER_OBSERVATION_SET_SCHEMA, decisionGraphSha256: hash(decisionGraphBytes), observations: Object.freeze(observations) });
}
export function validateBrowserObservationDecisionLinks(value: unknown, decisionGraphBytes: Uint8Array, required = false): BrowserObservationSet | undefined {
  try { return validate(value, decisionGraphBytes, required); } catch (error) {
    if (error instanceof BrowserObservationDecisionLinkError) throw error;
    return fail('MALFORMED_BROWSER_OBSERVATION', 'browser observation input could not be inspected safely');
  }
}
export function validateBrowserObservationArtifacts(set: BrowserObservationSet, read: (path: string) => Uint8Array, verifyPng: boolean): void {
  for (const observation of set.observations) {
    let bytes: Buffer;
    try { bytes = Buffer.from(read(observation.observableResult.capture.path)); } catch { return fail('INVALID_OBSERVATION_ARTIFACT', 'browser observation capture is unavailable'); }
    if (hash(bytes) !== observation.observableResult.capture.sha256) fail('STALE_OBSERVATION_ARTIFACT', 'browser observation capture bytes changed');
    if (verifyPng) {
      let image: ReturnType<typeof decodePng>;
      try { image = decodePng(bytes); } catch { return fail('INVALID_OBSERVATION_ARTIFACT', 'browser observation capture is not a measured PNG'); }
      if (image.width !== observation.viewport.width || image.height !== observation.viewport.height) fail('INVALID_OBSERVATION_ARTIFACT', 'browser observation viewport does not match capture pixels');
    }
  }
}
