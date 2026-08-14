import {
  ADAPTIVE_BROWSER_CONTEXT_SCHEMA,
  ADAPTIVE_LEARNING_CONTEXT_SCHEMA,
  ADAPTIVE_ROUTE_INPUT_KEYS,
  ADAPTIVE_ROUTE_INPUT_SCHEMA,
  ADAPTIVE_STRATEGY_DECISION_SCHEMA,
  failAdaptiveRoute,
  type AdaptiveBrowserDecisionContext,
  type AdaptiveLearningContext,
  type AdaptiveRouteInput,
  type AdaptiveSkip,
  type AdaptiveStrategyDecision,
  type ModelCapabilityRouteInput,
} from './adaptive-flow-domain.ts';
import { parseAdaptiveExecutionWaves } from './adaptive-execution-wave-boundary.ts';
import { parseAdaptiveAiAssets } from './adaptive-ai-assets.ts';
import { ADAPTIVE_ATTRIBUTION_CATEGORIES, type AdaptiveAttributionCategory } from './adaptive-attribution.ts';
const INVISIBLE_TEXT = /[\p{Cc}\p{Default_Ignorable_Code_Point}\p{White_Space}\u2800\u3164\uffa0]/gu;
const STRATEGY_KEYS = ['schema', 'owner', 'roles', 'stages', 'executionWaves', 'methods',
  'aiAssets', 'attributionCategories', 'skips', 'rationale'] as const;
const CONTEXT_KEYS = ['schema', 'status', 'decisionIds', 'reason'] as const;
const LEARNING_KEYS = ['schema', 'status', 'learningIds', 'reason'] as const;
const MODEL_KEYS = ['now', 'routingInput'] as const;
const SKIP_KEYS = ['id', 'reason'] as const;
const ID = /^[a-z0-9]+(?:[a-z0-9:-]*[a-z0-9])?$/;
type Fields = ReadonlyMap<string, unknown>;

function fields(value: unknown, expected: readonly string[], root = false): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return failAdaptiveRoute(root ? 'UNEXPECTED_ADAPTIVE_ROUTE_FIELD' : 'MALFORMED_ADAPTIVE_ROUTE');
  }
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
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

function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  const keys = Reflect.ownKeys(value);
  const expected = ['length', ...Array.from({ length: value.length }, (_, index) => String(index))];
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
    }
    return descriptor.value;
  });
}

function text(value: unknown, skipReason = false): string {
  if (typeof value !== 'string') return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const normalized = value.trim();
  if (normalized.replace(INVISIBLE_TEXT, '').length === 0) {
    return failAdaptiveRoute(skipReason ? 'ADAPTIVE_SKIP_REASON_REQUIRED' : 'MALFORMED_ADAPTIVE_ROUTE');
  }
  return normalized;
}

function id(value: unknown): string {
  const parsed = text(value);
  return ID.test(parsed) ? parsed : failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
}

function strings(value: unknown, allowEmpty = false): readonly string[] {
  const values = array(value).map((entry) => text(entry));
  if ((!allowEmpty && values.length === 0) || new Set(values).size !== values.length) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  return Object.freeze(values);
}

function ids(value: unknown, allowEmpty = false, strategyList = false): readonly string[] {
  const values = array(value).map(id);
  if (!allowEmpty && values.length === 0) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  if (new Set(values).size !== values.length) {
    return failAdaptiveRoute(strategyList ? 'ADAPTIVE_STRATEGY_DUPLICATE' : 'MALFORMED_ADAPTIVE_ROUTE');
  }
  return Object.freeze(values);
}

function plainData(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  if (seen.has(value)) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  seen.add(value);
  if (Array.isArray(value)) {
    const values = array(value).map((entry) => plainData(entry, seen));
    return Object.freeze(values);
  }
  const keys = Reflect.ownKeys(value);
  if (Reflect.getPrototypeOf(value) !== Object.prototype
    || keys.some((key) => typeof key !== 'string')) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== 'string') return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
    }
    result[key] = plainData(descriptor.value, seen);
  }
  return Object.freeze(result);
}

function skip(value: unknown): AdaptiveSkip {
  const item = fields(value, SKIP_KEYS);
  return Object.freeze({ id: id(item.get('id')), reason: text(item.get('reason'), true) });
}

export function parseAdaptiveStrategyDecision(value: unknown): AdaptiveStrategyDecision {
  const item = fields(value, STRATEGY_KEYS);
  if (item.get('schema') !== ADAPTIVE_STRATEGY_DECISION_SCHEMA) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  if (item.get('owner') !== 'user-selected-model') return failAdaptiveRoute('MODEL_OWNER_REQUIRED');
  const skips = array(item.get('skips')).map(skip);
  if (new Set(skips.map((entry) => entry.id)).size !== skips.length) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const attributionCategories = ids(item.get('attributionCategories'), false, true);
  if (attributionCategories.some((category) => !ADAPTIVE_ATTRIBUTION_CATEGORIES.includes(category as never)))
    return failAdaptiveRoute('ATTRIBUTION_COVERAGE_INVALID');
  return Object.freeze({
    schema: ADAPTIVE_STRATEGY_DECISION_SCHEMA, owner: 'user-selected-model',
    roles: ids(item.get('roles'), false, true), stages: ids(item.get('stages'), false, true),
    executionWaves: parseAdaptiveExecutionWaves(item.get('executionWaves')), methods: ids(item.get('methods'), false, true),
    aiAssets: parseAdaptiveAiAssets(item.get('aiAssets')),
    attributionCategories: attributionCategories as readonly AdaptiveAttributionCategory[],
    skips: Object.freeze(skips), rationale: text(item.get('rationale')),
  });
}

export function parseAdaptiveBrowserContext(value: unknown): AdaptiveBrowserDecisionContext {
  const item = fields(value, CONTEXT_KEYS);
  if (item.get('schema') !== ADAPTIVE_BROWSER_CONTEXT_SCHEMA) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const status = item.get('status');
  if (status !== 'pending' && status !== 'validated') return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const decisionIds = ids(item.get('decisionIds'), status === 'pending');
  if ((status === 'pending' && decisionIds.length !== 0) || (status === 'validated' && decisionIds.length === 0))
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  return Object.freeze({ schema: ADAPTIVE_BROWSER_CONTEXT_SCHEMA, status, decisionIds, reason: text(item.get('reason'), true) });
}

export function parseAdaptiveLearningContext(value: unknown): AdaptiveLearningContext {
  const item = fields(value, LEARNING_KEYS);
  if (item.get('schema') !== ADAPTIVE_LEARNING_CONTEXT_SCHEMA) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const status = item.get('status');
  if (status !== 'none' && status !== 'candidate' && status !== 'promoted') return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const learningIds = ids(item.get('learningIds'), status === 'none');
  if ((status === 'none' && learningIds.length !== 0) || (status !== 'none' && learningIds.length === 0))
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  return Object.freeze({ schema: ADAPTIVE_LEARNING_CONTEXT_SCHEMA, status, learningIds, reason: text(item.get('reason'), true) });
}

function modelCapability(value: unknown): ModelCapabilityRouteInput {
  const item = fields(value, MODEL_KEYS);
  const now = item.get('now');
  if (typeof now !== 'number' || !Number.isSafeInteger(now) || now < 0) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  return Object.freeze({ now, routingInput: plainData(item.get('routingInput')) });
}

export function parseAdaptiveRouteInput(value: unknown): AdaptiveRouteInput {
  try {
    const item = fields(value, ADAPTIVE_ROUTE_INPUT_KEYS, true);
    if (item.get('schema') !== ADAPTIVE_ROUTE_INPUT_SCHEMA) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
    return Object.freeze({
      schema: ADAPTIVE_ROUTE_INPUT_SCHEMA,
      request: text(item.get('request')),
      namedDependencies: strings(item.get('namedDependencies'), true),
      allowedPaths: strings(item.get('allowedPaths')),
      taskOutcome: plainData(item.get('taskOutcome')), uxPolicy: plainData(item.get('uxPolicy')),
      evidenceClaims: plainData(item.get('evidenceClaims')),
      referenceDiscovery: plainData(item.get('referenceDiscovery')), designAxes: plainData(item.get('designAxes')),
      modelCapability: modelCapability(item.get('modelCapability')),
      browserDecisionContext: parseAdaptiveBrowserContext(item.get('browserDecisionContext')),
      validatedLearningContext: parseAdaptiveLearningContext(item.get('validatedLearningContext')),
      strategyDecision: parseAdaptiveStrategyDecision(item.get('strategyDecision')),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AdaptiveRouteError') throw error;
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
}
