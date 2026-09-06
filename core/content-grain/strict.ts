import { createHash } from 'node:crypto';
import { canonicalJson } from '../ref/board-artifacts.ts';

export class ContentGrainError extends Error {
  readonly code: string;

  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'ContentGrainError';
    this.code = code;
  }
}

export const invalid = (detail: string): never => {
  throw new ContentGrainError('CONTENT_GRAIN_INVALID', detail);
};

export const closedObject = (
  value: unknown,
  label: string,
  keys: readonly string[],
): Readonly<Record<string, unknown>> => {
  if (
    typeof value !== 'object'
    || value === null
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.getOwnPropertySymbols(value).length > 0
  ) {
    return invalid(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!keys.includes(key)) invalid(`${label} has unknown key ${key}`);
    if (!('value' in descriptor)) invalid(`${label} must be a plain object with data properties`);
  }
  return Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]),
  );
};

export const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return invalid(`${label} must be a non-empty string`);
  }
  return value;
};

export const literal = <T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
): T => {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return invalid(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
};

export const list = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) return invalid(`${label} must be an array`);
  return value;
};

export const integer = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return invalid(`${label} must be a non-negative safe integer`);
  }
  return value as number;
};

export const identifier = (value: unknown, label: string): string => {
  const result = text(value, label);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(result)) {
    return invalid(`${label} must be a lowercase kebab-case identifier`);
  }
  return result;
};

export const digest = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    return invalid(`${label} must be a lowercase sha256`);
  }
  return value;
};

export const unique = (values: readonly string[], label: string): readonly string[] => {
  if (new Set(values).size !== values.length) invalid(`${label} must be duplicate-free`);
  return values;
};

export const freeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

export const canonicalSha256 = (value: unknown): string =>
  createHash('sha256').update(canonicalJson(value)).digest('hex');
