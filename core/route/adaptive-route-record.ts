import { parseSelectedModelIdentity } from '../runtime/model-capability-boundary.ts';
import { createHash } from 'node:crypto';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { ReferenceDiscoveryActualUse } from '../ref/reference-discovery-routing.ts';
import {
  ADAPTIVE_ROUTE_INPUT_SCHEMA,
  ADAPTIVE_ROUTE_RECORD_SCHEMA,
  ADAPTIVE_SOURCE_CONTRACT_SCHEMA,
  FORBIDDEN_WITHOUT_REQUEST,
  failAdaptiveRoute,
  type AdaptiveRouteRecord,
} from './adaptive-flow-domain.ts';
import { parseAdaptiveBrowserContext, parseAdaptiveLearningContext, parseAdaptiveStrategyDecision } from './adaptive-flow-boundary.ts';
import { routeAdaptiveFlow, validateAdaptiveStrategyRails } from './adaptive-flow.ts';
import { adaptiveSourceContractSha256, canonicalRouteJson } from './adaptive-source-contract.ts';
import { validatePersistedAdaptiveBehavior } from './adaptive-behavior-record.ts';
import { parseLocaleDesignRoute, type LocaleDesignRoute } from '../locale/design-context.ts';

const RECORD_KEYS = [
  'schema', 'route', 'request', 'projectMode', 'requiredOutcomes', 'prohibitedOutcomes', 'evidenceRequired',
  'selectedModel', 'sourceContract', 'sourceContractSha256', 'strategy', 'behavior', 'references', 'claims',
  'browserDecisions', 'validatedLearning', 'gates', 'namedDependencies', 'allowedPaths',
  'forbiddenWithoutRequest',
] as const;
const SOURCE_KEYS = [
  'schema', 'request', 'projectMode', 'namedDependencies', 'allowedPaths', 'taskOutcome', 'uxPolicy',
  'evidenceClaims', 'referenceDiscovery', 'designAxes', 'modelCapability',
  'browserDecisionContext', 'validatedLearningContext', 'strategyDecision',
] as const;
const REFERENCES_KEYS = ['decision', 'intended', 'actual'] as const;
const CLAIM_KEYS = ['userFacts', 'workingContext'] as const;
const SHA256 = /^[a-f0-9]{64}$/;
type Fields = ReadonlyMap<string, unknown>;
const hasOwn = (value: unknown, key: string): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.hasOwn(value, key);

function fields(value: unknown, expected: readonly string[]): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  const result = new Map<string, unknown>();
  for (const key of expected) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
    }
    result.set(key, descriptor.value);
  }
  return result;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  return value.trim();
}

function strings(value: unknown, allowEmpty = false): readonly string[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const expected = ['length', ...Array.from({ length: value.length }, (_, index) => String(index))];
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  const values: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
    values.push(text(descriptor.value));
  }
  if ((!allowEmpty && values.length === 0) || new Set(values).size !== values.length) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  return Object.freeze(values);
}

function actualReference(value: unknown): ReferenceDiscoveryActualUse {
  const item = fields(value, ['status', 'description']);
  const status = item.get('status');
  const description = text(item.get('description'));
  if (status === 'pending-discovery' && description === 'No discovered references have been used yet.') {
    return Object.freeze({ status, description });
  }
  if (status === 'existing-evidence') return Object.freeze({ status, description });
  return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
}

function sourceRouteInput(value: unknown): Readonly<{ input: unknown; localeDesign?: LocaleDesignRoute }> {
  const legacyKeys = SOURCE_KEYS.filter((key) => key !== 'projectMode');
  const baseKeys = hasOwn(value, 'projectMode') ? SOURCE_KEYS : legacyKeys;
  const expectedKeys = hasOwn(value, 'localeDesign') ? [...baseKeys, 'localeDesign'] : baseKeys;
  const source = fields(value, expectedKeys);
  if (source.get('schema') !== ADAPTIVE_SOURCE_CONTRACT_SCHEMA) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const input = {
    schema: ADAPTIVE_ROUTE_INPUT_SCHEMA,
    request: source.get('request'),
    projectMode: source.get('projectMode') ?? 'existing',
    namedDependencies: source.get('namedDependencies'),
    allowedPaths: source.get('allowedPaths'),
    taskOutcome: source.get('taskOutcome'),
    uxPolicy: source.get('uxPolicy'),
    evidenceClaims: source.get('evidenceClaims'),
    referenceDiscovery: source.get('referenceDiscovery'),
    designAxes: source.get('designAxes'),
    modelCapability: source.get('modelCapability'),
    browserDecisionContext: source.get('browserDecisionContext'),
    validatedLearningContext: source.get('validatedLearningContext'),
    strategyDecision: source.get('strategyDecision'),
  };
  const localeDesign = source.get('localeDesign');
  return Object.freeze({
    input,
    ...(localeDesign === undefined ? {} : { localeDesign: parseLocaleDesignRoute(localeDesign) }),
  });
}

function parse(
  value: unknown,
  authority?: Readonly<{ root: string; invocation: ProjectRunInvocation }>,
): AdaptiveRouteRecord {
  const legacyKeys = RECORD_KEYS.filter((key) => key !== 'projectMode');
  const item = fields(value, hasOwn(value, 'projectMode') ? RECORD_KEYS : legacyKeys);
  if (item.get('schema') !== ADAPTIVE_ROUTE_RECORD_SCHEMA || item.get('route') !== 'adaptive') {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  const persistedSourceContract = item.get('sourceContract');
  const legacySourceContract = !hasOwn(persistedSourceContract, 'projectMode');
  const replay = sourceRouteInput(persistedSourceContract);
  const expected = routeAdaptiveFlow(replay.input, authority, replay.localeDesign);
  const normalizedSourceSha256 = adaptiveSourceContractSha256(expected.sourceContract);
  const persistedExpectedSha256 = legacySourceContract
    ? createHash('sha256').update(`${canonicalRouteJson(persistedSourceContract)}\n`).digest('hex')
    : normalizedSourceSha256;
  const sourceSha256 = item.get('sourceContractSha256');
  if (typeof sourceSha256 !== 'string' || !SHA256.test(sourceSha256)
    || sourceSha256 !== persistedExpectedSha256) {
    return failAdaptiveRoute('SOURCE_CONTRACT_MISMATCH');
  }
  const selectedModel = parseSelectedModelIdentity(item.get('selectedModel'));
  if (canonicalRouteJson(selectedModel) !== canonicalRouteJson(expected.selectedModel)) {
    return failAdaptiveRoute('MODEL_IDENTITY_MISMATCH');
  }
  const references = fields(item.get('references'), REFERENCES_KEYS);
  const decision = references.get('decision');
  if (decision !== 'discover' && decision !== 'skip') return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const claims = fields(item.get('claims'), CLAIM_KEYS);
  const forbidden = strings(item.get('forbiddenWithoutRequest'));
  const candidate: AdaptiveRouteRecord = Object.freeze({
    schema: ADAPTIVE_ROUTE_RECORD_SCHEMA,
    route: 'adaptive',
    request: text(item.get('request')),
    projectMode: item.get('projectMode') === 'greenfield' ? 'greenfield' : 'existing',
    requiredOutcomes: strings(item.get('requiredOutcomes')),
    prohibitedOutcomes: strings(item.get('prohibitedOutcomes')),
    evidenceRequired: strings(item.get('evidenceRequired')),
    selectedModel,
    sourceContract: expected.sourceContract,
    sourceContractSha256: normalizedSourceSha256,
    strategy: parseAdaptiveStrategyDecision(item.get('strategy')),
    behavior: validatePersistedAdaptiveBehavior(item.get('behavior'), expected.behavior),
    references: Object.freeze({ decision, intended: text(references.get('intended')), actual: actualReference(references.get('actual')) }),
    claims: Object.freeze({ userFacts: strings(claims.get('userFacts'), true), workingContext: strings(claims.get('workingContext'), true) }),
    browserDecisions: parseAdaptiveBrowserContext(item.get('browserDecisions')),
    validatedLearning: parseAdaptiveLearningContext(item.get('validatedLearning')),
    gates: strings(item.get('gates')),
    namedDependencies: strings(item.get('namedDependencies'), true),
    allowedPaths: strings(item.get('allowedPaths')),
    forbiddenWithoutRequest: forbidden,
  });
  validateAdaptiveStrategyRails(candidate.strategy);
  if (canonicalRouteJson(candidate) !== canonicalRouteJson(expected)) return failAdaptiveRoute('SOURCE_CONTRACT_MISMATCH');
  return expected;
}

export function parseRouteRecord(
  value: unknown,
  authority?: Readonly<{ root: string; invocation: ProjectRunInvocation }>,
): AdaptiveRouteRecord {
  try {
    return parse(value, authority);
  } catch (error) {
    if (error instanceof Error && error.name === 'AdaptiveRouteError') throw error;
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
}

const globToRegExp = (glob: string): RegExp => {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*').replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
};

export function pathsOutsideScope(record: AdaptiveRouteRecord, changedPaths: readonly string[]): readonly string[] {
  const allowed = record.allowedPaths.map(globToRegExp);
  return changedPaths.filter((path) => {
    const normalized = path.replace(/^\.\//, '');
    const unsafe = normalized === '' || normalized.includes('\0') || normalized.includes('\\')
      || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)
      || normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
    if (unsafe) return true;
    if (normalized.startsWith('.omd/')) return false;
    return !allowed.some((pattern) => pattern.test(normalized));
  });
}
