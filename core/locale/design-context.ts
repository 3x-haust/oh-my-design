import { createHash } from 'node:crypto';
import { parseLocaleDesignContext } from './design-context-parse.ts';
import { deriveLocaleDesignRoute, localeDesignRouteFindings } from './design-context-route.ts';
import { LocaleDesignContextError, type LocaleDesignContext, type LocaleDesignRoute } from './design-context-types.ts';

export {
  LOCALE_DESIGN_CONTEXT_KEYS, LOCALE_DESIGN_CONTEXT_SCHEMA, LOCALE_DESIGN_FITS,
  LOCALE_DESIGN_ROUTE_SCHEMA, LOCALE_DESIGN_SURFACES, LocaleDesignContextError,
} from './design-context-types.ts';
export type {
  LocaleDesignContext, LocaleDesignFinding, LocaleDesignFit, LocaleDesignMechanics,
  LocaleDesignQuestion, LocaleDesignRoute, LocaleDesignSurface,
} from './design-context-types.ts';
export { parseLocaleDesignContext } from './design-context-parse.ts';
export { localeDesignRouteFindings } from './design-context-route.ts';

const fail = (message: string): never => { throw new LocaleDesignContextError(message); };

export function canonicalLocaleDesignJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalLocaleDesignJson).join(',')}]`;
  if (typeof value === 'object' && Reflect.getPrototypeOf(value) === Object.prototype) {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalLocaleDesignJson(record[key])}`).join(',')}}`;
  }
  return fail('context hash accepts plain JSON data only');
}

export function localeDesignContextSha256(context: LocaleDesignContext): string {
  return createHash('sha256').update(`${canonicalLocaleDesignJson(context)}\n`).digest('hex');
}

export function localeDesignContextJsonSha256(bytes: string | Uint8Array): string {
  let value: unknown;
  try {
    const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes);
    value = JSON.parse(text) as unknown;
  } catch {
    return fail('context file must contain valid JSON');
  }
  return localeDesignContextSha256(parseLocaleDesignContext(value));
}

export function routeLocaleDesignContext(value: unknown): LocaleDesignRoute {
  const context = parseLocaleDesignContext(value);
  return deriveLocaleDesignRoute(context, localeDesignContextSha256(context));
}

export function parseLocaleDesignRoute(value: unknown): LocaleDesignRoute {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
      || Reflect.getPrototypeOf(value) !== Object.prototype) return fail('route must be a plain JSON object');
    const descriptor = Reflect.getOwnPropertyDescriptor(value, 'context');
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return fail('route must contain an enumerable context data property');
    }
    const expected = routeLocaleDesignContext(descriptor.value);
    if (canonicalLocaleDesignJson(value) !== canonicalLocaleDesignJson(expected)) {
      return fail('route must be the exact derived locale-design route');
    }
    return expected;
  } catch (error) {
    if (error instanceof LocaleDesignContextError) throw error;
    return fail('route must be the exact derived locale-design route');
  }
}
