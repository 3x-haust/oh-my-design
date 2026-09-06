export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
export const SCHEMA_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ProofFail = (message: string) => never;
export type ArtifactReceipt<S extends string = string> = Readonly<{
  path: string;
  schema: S;
  sha256: string;
}>;

export function fields(value: unknown, expected: readonly string[], label: string, fail: ProofFail): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} must be an object`);
  const object = value as object;
  const prototype = Reflect.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object`);
  const keys = Reflect.ownKeys(object);
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key))
    || expected.some((key) => !Object.hasOwn(object, key))) fail(`${label} has unknown or missing fields`);
  const result = new Map<string, unknown>();
  for (const key of expected) {
    const descriptor = Reflect.getOwnPropertyDescriptor(object, key);
    if (descriptor === undefined || !('value' in descriptor) || descriptor.enumerable !== true) fail(`${label}.${key} must be an enumerable own data property`);
    result.set(key, descriptor.value);
  }
  return result;
}

export function values(value: unknown, label: string, fail: ProofFail): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) fail(`${label} must be an array`);
  const array = value as unknown[];
  const keys = Reflect.ownKeys(array);
  const indexes = Array.from({ length: array.length }, (_, index) => String(index));
  if (keys.length !== indexes.length + 1
    || keys.some((key) => key !== 'length' && (typeof key !== 'string' || !indexes.includes(key)))) {
    fail(`${label} must be dense and undecorated`);
  }
  const length = Reflect.getOwnPropertyDescriptor(array, 'length');
  if (length === undefined || !('value' in length) || length.enumerable !== false) fail(`${label}.length is invalid`);
  return indexes.map((key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(array, key);
    if (descriptor === undefined || !('value' in descriptor) || descriptor.enumerable !== true) fail(`${label}[${key}] must be an own data property`);
    return descriptor.value;
  });
}

export function text(value: unknown, label: string, fail: ProofFail): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || value.length > 4096 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    fail(`${label} must be non-empty canonical text`);
  }
  return value;
}

export function token(value: unknown, label: string, fail: ProofFail): string {
  const parsed = text(value, label, fail);
  if (!ID_PATTERN.test(parsed)) fail(`${label} must be a canonical identifier`);
  return parsed;
}

export function schema(value: unknown, label: string, fail: ProofFail): string {
  const parsed = text(value, label, fail);
  if (!SCHEMA_PATTERN.test(parsed)) fail(`${label} must be a canonical schema identifier`);
  return parsed;
}

export function digest(value: unknown, label: string, fail: ProofFail): string {
  const parsed = text(value, label, fail);
  if (!SHA256_PATTERN.test(parsed)) fail(`${label} must be a SHA-256 digest`);
  return parsed;
}

export function safePath(value: unknown, label: string, fail: ProofFail): string {
  const parsed = text(value, label, fail);
  if (parsed.includes('\\') || parsed.startsWith('/') || /^[A-Za-z]:\//.test(parsed)
    || parsed.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    fail(`${label} must be a safe project-relative path`);
  }
  return parsed;
}

export function integer(value: unknown, label: string, fail: ProofFail, minimum = 0, maximum = 16384): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${label} must be a bounded integer`);
  }
  return value;
}

export function booleanValue(value: unknown, label: string, fail: ProofFail): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be boolean`);
  return value;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string, fail: ProofFail): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail(`${label} is invalid`);
  return value as T;
}

export function uniqueTokens(value: unknown, label: string, fail: ProofFail, allowEmpty = true): readonly string[] {
  const parsed = values(value, label, fail).map((item, index) => token(item, `${label}[${index}]`, fail));
  if ((!allowEmpty && parsed.length === 0) || new Set(parsed).size !== parsed.length) fail(`${label} must be a duplicate-free identifier list`);
  return Object.freeze([...parsed].sort());
}

export function receipt(value: unknown, label: string, fail: ProofFail): ArtifactReceipt {
  const item = fields(value, ['path', 'schema', 'sha256'], label, fail);
  return Object.freeze({
    path: safePath(item.get('path'), `${label}.path`, fail),
    schema: schema(item.get('schema'), `${label}.schema`, fail),
    sha256: digest(item.get('sha256'), `${label}.sha256`, fail),
  });
}

export function receipts(value: unknown, label: string, fail: ProofFail, allowEmpty = false): readonly ArtifactReceipt[] {
  const parsed = values(value, label, fail).map((item, index) => receipt(item, `${label}[${index}]`, fail));
  if (!allowEmpty && parsed.length === 0) fail(`${label} must not be empty`);
  const sorted = [...parsed].sort((left, right) => left.path.localeCompare(right.path) || left.schema.localeCompare(right.schema));
  if (new Set(sorted.map((item) => `${item.path}\u0000${item.schema}`)).size !== sorted.length) fail(`${label} contains a duplicate artifact`);
  return Object.freeze(sorted);
}

export function sameReceipts(left: readonly ArtifactReceipt[], right: readonly ArtifactReceipt[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const expected = right[index];
    return expected !== undefined && item.path === expected.path && item.schema === expected.schema && item.sha256 === expected.sha256;
  });
}

export function sameSet(actual: Iterable<string>, expected: Iterable<string>): boolean {
  const left = new Set(actual);
  const right = new Set(expected);
  return left.size === right.size && [...left].every((item) => right.has(item));
}
