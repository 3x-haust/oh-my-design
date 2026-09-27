export const fail = (message: string): never => { throw new Error(`VISUAL_MEASUREMENT: ${message}`); };
export type Validator = (value: unknown) => void;
export const string: Validator = v => { if (typeof v !== 'string') fail('expected string'); };
export const text: Validator = v => { string(v); if (!(v as string).trim() || (v as string).length > 10000) fail('empty/oversized text'); };
export const number: Validator = v => { if (typeof v !== 'number' || !Number.isFinite(v)) fail('expected finite number'); };
export const nonnegative: Validator = v => { number(v); if ((v as number) < 0) fail('expected nonnegative number'); };
export const integer: Validator = v => { nonnegative(v); if (!Number.isSafeInteger(v)) fail('expected nonnegative integer'); };
export const boolean: Validator = v => { if (typeof v !== 'boolean') fail('expected boolean'); };
export const enumeration = (...values: (string | number)[]): Validator => v => { if (!values.includes(v as string)) fail(`expected ${values.join('|')}`); };
export const nullable = (validator: Validator): Validator => v => { if (v !== null) validator(v); };
export const array = (validator: Validator): Validator => v => { if (!Array.isArray(v) || v.length > 200000) fail('expected bounded array'); for (const item of v as unknown[]) validator(item); };
export const tuple = (...validators: Validator[]): Validator => v => { if (!Array.isArray(v) || v.length !== validators.length) fail('invalid tuple'); validators.forEach((check, i) => check((v as unknown[])[i])); };
export const object = (shape: Record<string, Validator>): Validator => v => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail('expected plain object');
  const item = v as Record<string, unknown>;
  if (Object.keys(item).sort().join('\0') !== Object.keys(shape).sort().join('\0')) fail(`expected exact fields: ${Object.keys(shape).join(',')}`);
  for (const [key, check] of Object.entries(shape)) { const d = Object.getOwnPropertyDescriptor(item, key); if (!d || !('value' in d)) return fail('accessors forbidden'); check(d.value); }
};
export const pattern = (regex: RegExp): Validator => v => { text(v); if (!regex.test(v as string)) fail(`invalid identifier: ${String(v)}`); };
export const sha = pattern(/^[a-f0-9]{64}$/);
export const path: Validator = v => { text(v); if ((v as string).startsWith('/') || (v as string).includes('\\') || (v as string).split('/').some(s => !s || s === '.' || s === '..') || (v as string).includes('\0')) fail('path must be contained and canonical'); };
export const receipt = object({ path, sha256: sha });
export const box = object({ x: number, y: number, w: nonnegative, h: nonnegative });
export const rgba = tuple(...Array.from({ length: 3 }, (): Validator => v => { number(v); if ((v as number) < 0 || (v as number) > 255) fail('invalid RGB'); }), v => { number(v); if ((v as number) < 0 || (v as number) > 1) fail('invalid alpha'); });
export function unique(values: string[], label: string): void { if (new Set(values).size !== values.length) fail(`duplicate ${label}`); }
