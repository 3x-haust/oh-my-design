import {
  failAdaptiveRoute,
  type AdaptiveRouteRecord,
} from './adaptive-flow-domain.ts';
import { canonicalRouteJson } from './adaptive-source-contract.ts';

function plain(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || seen.has(value)) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  seen.add(value);
  if (Array.isArray(value)) {
    if (Reflect.getPrototypeOf(value) !== Array.prototype) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
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
      return plain(descriptor.value, seen);
    });
  }
  if (Reflect.getPrototypeOf(value) !== Object.prototype) return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failAdaptiveRoute('MALFORMED_ADAPTIVE_ROUTE');
    }
    result[key] = plain(descriptor.value, seen);
  }
  return result;
}

export function validatePersistedAdaptiveBehavior(
  value: unknown,
  expected: AdaptiveRouteRecord['behavior'],
): AdaptiveRouteRecord['behavior'] {
  if (canonicalRouteJson(plain(value)) !== canonicalRouteJson(expected)) {
    return failAdaptiveRoute('SOURCE_CONTRACT_MISMATCH');
  }
  return expected;
}
