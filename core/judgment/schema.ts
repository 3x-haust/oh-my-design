export type SchemaWarning = Readonly<{ code: 'UNKNOWN_FIELD'; field: string }>;
export class SchemaInputError extends Error {
  constructor(message: string) { super(message); this.name = 'SchemaInputError'; }
}
/** Snapshot own data only. Unknown ordinary keys are discarded, never evaluated. */
export function knownFields(input: unknown, required: readonly string[], optional: readonly string[] = [], label = 'input'): { value: Record<string, unknown>; warnings: SchemaWarning[] } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new SchemaInputError(`${label} must be an object`);
  const prototype = Reflect.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new SchemaInputError(`${label} has an unsafe prototype`);
  const value: Record<string, unknown> = Object.create(null);
  const warnings: SchemaWarning[] = [];
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') throw new SchemaInputError(`${label} has a symbol key`);
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new SchemaInputError(`${label}.${key} must be an enumerable data property`);
    if (required.includes(key) || optional.includes(key)) value[key] = descriptor.value;
    else if (/^(?:signature|author|publishedAt|invocationSha256|authority|hostReceipt|approved|approvedByUser|approval)$/u.test(key)
      || key === '__proto__' || key === 'constructor' || key === 'prototype')
      throw new SchemaInputError(`${label}.${key} is host-owned or unsafe`);
    else warnings.push({ code: 'UNKNOWN_FIELD', field: `${label}.${key}` });
  }
  for (const key of required) if (!Object.hasOwn(value, key)) throw new SchemaInputError(`${label}.${key} is required`);
  return { value, warnings };
}
