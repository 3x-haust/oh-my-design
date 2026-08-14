import {
  failModelCapability,
  type SelectedModelIdentity,
} from './model-capability-domain.ts';

const IDENTITY_KEYS: readonly string[] = ['selection', 'provider', 'modelId', 'revision'];

export function objectValue(value: unknown): object {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  }
  let ordinary = false;
  let inherited = false;
  try {
    ordinary = Reflect.getPrototypeOf(value) === Object.prototype;
    if (!ordinary) {
      for (const key in value) inherited ||= !Object.hasOwn(value, key);
    }
  } catch {
    return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  }
  if (inherited) return failModelCapability('UNEXPECTED_MODEL_CAPABILITY_FIELD');
  if (!ordinary) return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  return value;
}

export function requireExactKeys(value: object, expected: readonly string[]): void {
  for (const key in value) {
    if (!Object.hasOwn(value, key)) {
      return failModelCapability('UNEXPECTED_MODEL_CAPABILITY_FIELD');
    }
  }
  const expectedSet = new Set(expected);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== 'string' || !expectedSet.has(key))) {
    return failModelCapability('UNEXPECTED_MODEL_CAPABILITY_FIELD');
  }
  if (actual.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  }
}

export function dataValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  }
  return descriptor.value;
}

export function strictArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return failModelCapability('MALFORMED_MODEL_CAPABILITY_PROFILE');
  }
  const expected = new Set<string>(['length']);
  for (let index = 0; index < value.length; index += 1) expected.add(String(index));
  requireExactKeys(value, [...expected]);
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    result.push(dataValue(value, String(index)));
  }
  return result;
}

function identityText(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    return failModelCapability('INVALID_MODEL_CAPABILITY_IDENTITY');
  }
  return value;
}

export function parseSelectedModelIdentity(input: unknown): SelectedModelIdentity {
  const record = objectValue(input);
  requireExactKeys(record, IDENTITY_KEYS);
  return Object.freeze({
    selection: identityText(dataValue(record, 'selection')),
    provider: identityText(dataValue(record, 'provider')),
    modelId: identityText(dataValue(record, 'modelId')),
    revision: identityText(dataValue(record, 'revision')),
  });
}

export function observedTimestamp(value: unknown, now: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > now) {
    return failModelCapability('INVALID_MODEL_CAPABILITY_TIMESTAMP');
  }
  return value;
}

export function expiryTimestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return failModelCapability('INVALID_MODEL_CAPABILITY_TIMESTAMP');
  }
  return value;
}
