import {
  failAdaptiveRoute,
  type AdaptiveExecutionWave,
} from './adaptive-flow-domain.ts';

const WAVE_KEYS = ['id', 'mode', 'roles'] as const;
const ID = /^[a-z0-9]+(?:[a-z0-9:-]*[a-z0-9])?$/;

function data(value: unknown, keys: readonly string[]): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length
    || own.some((key) => typeof key !== 'string' || !keys.includes(key))) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  const result = new Map<string, unknown>();
  for (const key of keys) {
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
  if (keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
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

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !ID.test(value.trim())) {
    return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  }
  return value.trim();
}

export function parseAdaptiveExecutionWaves(value: unknown): readonly AdaptiveExecutionWave[] {
  const waves = array(value).map((entry, index) => {
    const item = data(entry, WAVE_KEYS);
    const roles = array(item.get('roles')).map(identifier);
    if (item.get('mode') !== 'concurrent') return failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID', `strategyDecision.executionWaves[${index}].mode must be "concurrent"; waves run in array order, and roles within one wave share a dependency group (sequential host fallback is allowed). "sequential" and "parallel" are not mode values`);
    if (roles.length === 0 || new Set(roles).size !== roles.length) {
      return failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID', `strategyDecision.executionWaves[${index}].roles must be nonempty and unique`);
    }
    return Object.freeze({
      id: identifier(item.get('id')), mode: 'concurrent', roles: Object.freeze(roles),
    });
  });
  if (waves.length === 0 || new Set(waves.map((wave) => wave.id)).size !== waves.length) {
    return failAdaptiveRoute('ADAPTIVE_EXECUTION_WAVE_INVALID', 'strategyDecision.executionWaves must be nonempty with unique wave ids');
  }
  return Object.freeze(waves);
}
