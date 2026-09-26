import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile, StableProjectFileReadError } from '../runtime/stable-project-file.ts';
import {
  LEARNING_PROMOTION_INPUT_SCHEMA,
  LEARNING_RESULT_SCHEMA,
  LearningPromotionError,
  REUSABLE_SCOPED_RULE_SCHEMA,
  type CandidateLearningResult,
  type LearningPromotionDependencies,
  type LearningPromotionInput,
  type LearningPromotionResult,
  type LearningProposition,
  type LearningPublicationReceipt,
  type LearningScope,
  type LearningValidation,
  type PromotedLearningResult,
  type ReusableScopedRule,
} from './validated-learning-contract.ts';
import { assessLearningEvidence } from './validated-learning-evidence.ts';

export * from './validated-learning-contract.ts';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const UNSAFE_AUTHORITY = /(?:system prompt|model(?:\s+or\s+system)? instructions?|override|ignore .*instructions?|hard safety|safety rails?|user facts?|user (?:said|preference|identity))/i;
const trustedResults = new WeakMap<object, string>();
const PUBLICATION_FS = nodeStableProjectFileSystem();
type Fields = ReadonlyMap<string, unknown>;

function fail(code: LearningPromotionError['code'], message: string): never {
  throw new LearningPromotionError(code, message);
}
function sha(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function ownFields(value: unknown, keys: readonly string[], label: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('MALFORMED_INPUT', `${label} must be an object`);
  if (Reflect.getPrototypeOf(value) !== Object.prototype && Reflect.getPrototypeOf(value) !== null) fail('MALFORMED_INPUT', `${label} must not inherit properties`);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key) => typeof key !== 'string' || !keys.includes(key))) fail('MALFORMED_INPUT', `${label} has unknown or missing keys`);
  if (!Object.isFrozen(value)) fail('MUTABLE_INPUT', `${label} must be frozen before crossing the learning boundary`);
  const result = new Map<string, unknown>();
  for (const key of own) {
    if (typeof key !== 'string') fail('MALFORMED_INPUT', `${label} cannot contain Symbol keys`);
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) fail('MALFORMED_INPUT', `${label} must contain enumerable own data properties only`);
    result.set(key, descriptor.value);
  }
  return result;
}
function immutableJson(value: unknown, label: string): void {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return;
  if (typeof value !== 'object') fail('MALFORMED_INPUT', `${label} is not JSON data`);
  if (!Object.isFrozen(value)) fail('MUTABLE_INPUT', `${label} must be deeply frozen`);
  const prototype = Reflect.getPrototypeOf(value);
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) fail('MALFORMED_INPUT', `${label} must be a plain array`);
    const keys = Reflect.ownKeys(value); const expected = Array.from({ length: value.length }, (_, index) => String(index));
    if (keys.length !== expected.length + 1 || keys.some((key) => key !== 'length' && (typeof key !== 'string' || !expected.includes(key)))) fail('MALFORMED_INPUT', `${label} must be dense and undecorated`);
    expected.forEach((key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) fail('MALFORMED_INPUT', `${label} array entries must be data properties`);
      immutableJson(descriptor.value, `${label}[${key}]`);
    });
    return;
  }
  if (prototype !== Object.prototype && prototype !== null) fail('MALFORMED_INPUT', `${label} must not inherit properties`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') fail('MALFORMED_INPUT', `${label} cannot contain Symbol keys`);
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) fail('MALFORMED_INPUT', `${label} must contain enumerable own data properties only`);
    immutableJson(descriptor.value, `${label}.${key}`);
  }
}
function text(value: unknown, label: string, max = 512): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > max) fail('MALFORMED_INPUT', `${label} is invalid`);
  return value;
}
function id(value: unknown, label: string): string {
  const result = text(value, label, 128);
  if (!SLUG.test(result)) fail('MALFORMED_ID', `${label} must be a lowercase kebab identifier`);
  return result;
}
function projectPath(value: unknown, label: string): string {
  const result = text(value, label, 1024);
  if (result.startsWith('/') || result.includes('\\') || result.includes('\0')
    || result.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    fail('INVALID_BROWSER_EVIDENCE', `${label} must be a normalized project-relative path`);
  }
  return result;
}
function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') fail('MALFORMED_TIMESTAMP', `${label} must be a canonical ISO timestamp`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) fail('MALFORMED_TIMESTAMP', `${label} must be a canonical ISO timestamp`);
  return value;
}
function dimension(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 16384) fail('MALFORMED_SCOPE', `${label} must be a bounded viewport dimension`);
  return value;
}
function parseScope(value: unknown): LearningScope {
  const scope = ownFields(value, ['surface', 'route', 'testedState', 'viewport'], 'proposition.scope');
  const surface = id(scope.get('surface'), 'proposition.scope.surface');
  const testedState = id(scope.get('testedState'), 'proposition.scope.testedState');
  const route = text(scope.get('route'), 'proposition.scope.route', 1024);
  if (!route.startsWith('/') || route.includes('\\') || route.includes('?') || route.includes('#') || route.split('/').includes('..')) fail('MALFORMED_SCOPE', 'proposition.scope.route must be a canonical absolute route');
  const viewport = ownFields(scope.get('viewport'), ['width', 'height'], 'proposition.scope.viewport');
  return Object.freeze({ surface, route, testedState, viewport: Object.freeze({ width: dimension(viewport.get('width'), 'viewport.width'), height: dimension(viewport.get('height'), 'viewport.height') }) });
}
function parseProposition(value: unknown): LearningProposition {
  const item = ownFields(value, ['id', 'statement', 'scope'], 'proposition');
  const statement = text(item.get('statement'), 'proposition.statement');
  if (UNSAFE_AUTHORITY.test(statement)) fail('UNSAFE_PROPOSITION', 'learning propositions cannot claim model, safety-rail, or user-fact authority');
  return Object.freeze({ id: id(item.get('id'), 'proposition.id'), statement, scope: parseScope(item.get('scope')) });
}

/** Canonical proposition parser shared by prediction capture and promotion. */
export function validateLearningProposition(value: unknown): LearningProposition {
  try { return parseProposition(value); } catch (error) {
    if (error instanceof LearningPromotionError) throw error;
    return fail('MALFORMED_INPUT', 'learning proposition could not be inspected safely');
  }
}
function parseValidation(value: unknown, index: number): LearningValidation {
  const label = `validations[${index}]`;
  const item = ownFields(value, ['runId', 'contextId', 'outcome', 'observedAt', 'decisionGraphPath', 'browserEvidence'], label);
  const outcome = item.get('outcome');
  if (outcome !== 'validated' && outcome !== 'contradicted') fail('MALFORMED_INPUT', `${label}.outcome is invalid`);
  const browserEvidence = item.get('browserEvidence'); immutableJson(browserEvidence, `${label}.browserEvidence`);
  const decisionGraphPath = projectPath(item.get('decisionGraphPath'), `${label}.decisionGraphPath`);
  return Object.freeze({ runId: id(item.get('runId'), `${label}.runId`), contextId: id(item.get('contextId'), `${label}.contextId`), outcome, observedAt: timestamp(item.get('observedAt'), `${label}.observedAt`), decisionGraphPath, browserEvidence });
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => deepFreeze(Reflect.get(value, key)));
    Object.freeze(value);
  }
  return value;
}
function evaluate(value: unknown, dependencies: LearningPromotionDependencies): LearningPromotionResult {
  const item = ownFields(value, ['schema', 'proposition', 'validations'], 'learning input');
  if (item.get('schema') !== LEARNING_PROMOTION_INPUT_SCHEMA) fail('MALFORMED_INPUT', 'learning input schema is invalid');
  const proposition = parseProposition(item.get('proposition'));
  const raw = item.get('validations'); immutableJson(raw, 'validations');
  if (!Array.isArray(raw) || raw.length === 0) fail('MALFORMED_INPUT', 'validations must be a non-empty frozen array');
  const validations = raw.map(parseValidation);
  const now = Date.parse(timestamp(dependencies.now, 'dependencies.now'));
  const evaluated = validations.map((entry) => assessLearningEvidence(entry, proposition, dependencies));
  const provenance = evaluated.map((entry) => entry.provenance);
  if (new Set(provenance.map((entry) => entry.observationSha256)).size !== provenance.length) fail('DUPLICATE_EVIDENCE', 'a browser observation cannot be replayed as independent validation');
  const validated = provenance.filter((entry) => entry.outcome === 'validated');
  const blockers: string[] = [];
  if (provenance.some((entry) => entry.outcome === 'contradicted')) blockers.push('contradiction');
  if (provenance.some((entry) => now - Date.parse(entry.observedAt) > MAX_AGE_MS || Date.parse(entry.observedAt) > now)) blockers.push('stale-evidence');
  if (new Set(validated.map((entry) => entry.runId)).size < validated.length) blockers.push('non-distinct-runs');
  if (new Set(validated.map((entry) => entry.contextId)).size < validated.length) blockers.push('non-distinct-contexts');
  const captureArtifacts = validated.map((entry) => `${entry.capture.path}:${entry.capture.sha256}`);
  if (new Set(captureArtifacts).size < captureArtifacts.length) blockers.push('duplicate-capture-artifact');
  if (new Set(validated.map((entry) => entry.capture.sha256)).size < validated.length) blockers.push('duplicate-capture-bytes');
  if (evaluated.some((entry) => entry.mixedContext)) blockers.push('mixed-context');
  if (evaluated.some((entry) => !entry.boundDecisionScope)) blockers.push('unbound-decision-scope');
  if (validated.length < 2) blockers.push('insufficient-independent-validations');
  const propositionSha256 = sha(canonicalJson(proposition));
  const learningId = id(dependencies.idFor(propositionSha256), 'generated learning id');
  const base = { id: learningId, propositionSha256, proposition, provenance, blockers, evaluatedAt: dependencies.now };
  if (blockers.length > 0) {
    const candidate: CandidateLearningResult = { schema: LEARNING_RESULT_SCHEMA, ...base, status: 'candidate' };
    deepFreeze(candidate); trustedResults.set(candidate, resolve(dependencies.projectRoot)); return candidate;
  }
  const rule = deepFreeze<ReusableScopedRule>({ schema: REUSABLE_SCOPED_RULE_SCHEMA, id: learningId, statement: proposition.statement, scope: proposition.scope, applicability: 'advisory', authority: 'browser-validated-design-learning', cannotOverride: ['hard-safety-rails', 'model-or-system-instructions', 'user-facts'], provenance, promotedAt: dependencies.now });
  const promoted: PromotedLearningResult = { schema: LEARNING_RESULT_SCHEMA, ...base, status: 'promoted', rule };
  deepFreeze(promoted); trustedResults.set(promoted, resolve(dependencies.projectRoot)); return promoted;
}

export function evaluateValidatedLearning(value: unknown, dependencies: LearningPromotionDependencies): LearningPromotionResult {
  try { return evaluate(value, dependencies); } catch (error) {
    if (error instanceof LearningPromotionError) throw error;
    return fail('MALFORMED_INPUT', 'learning input could not be inspected safely');
  }
}
export function publishValidatedLearning(root: string, result: LearningPromotionResult, writer: ProjectWriteAdapter | undefined): LearningPublicationReceipt {
  const adapter = requireProjectWriteAdapter(root, writer);
  if (trustedResults.get(result) !== resolve(root) || !Object.isFrozen(result)) fail('MALFORMED_INPUT', 'only an evaluated immutable learning result from this project can be published');
  const statePath = `.omd/coach/learnings/${result.proposition.id}.json`;
  if (result.status !== 'promoted') {
    adapter.write(statePath, canonicalJson(result));
    return Object.freeze({ status: result.status, statePath });
  }
  const ruleBytes = canonicalJson(result.rule); const rulePath = `.omd/coach/rules/sha256-${sha(ruleBytes)}.json`;
  const target = resolve(root, rulePath);
  if (existsSync(target)) {
    let existing: Buffer;
    try { existing = readStableProjectFile({ root, path: target, label: 'immutable promoted learning rule', fs: PUBLICATION_FS }); } catch (error) {
      if (error instanceof StableProjectFileReadError) fail('MALFORMED_INPUT', error.message);
      throw error;
    }
    if (existing.toString('utf8') !== ruleBytes) fail('MALFORMED_INPUT', 'immutable promoted rule path already contains different bytes');
  } else adapter.write(rulePath, ruleBytes);
  adapter.write(statePath, canonicalJson(result));
  return Object.freeze({ status: result.status, statePath, rulePath });
}
