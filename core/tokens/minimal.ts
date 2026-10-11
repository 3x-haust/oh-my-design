import * as v from '../brief/candidate-data.ts';

export const MINIMAL_TOKEN_SCHEMA = 'token-commit-v3' as const;
export type Primitive = Readonly<{ type: 'color'; value: string }
  | { type: 'number'; value: number; unit: 'px' | 'unitless' }
  | { type: 'font-family'; value: readonly string[] }>;
export type TextStyle = Readonly<{ familyRef: string; sizeRef: string; weight: number; lineHeightRef: string; letterSpacingRef: string | null }>;
export type TokenMaps = Readonly<{ primitives: Readonly<Record<string, Primitive>>; semantic: Readonly<Record<string, { ref: string }>>; textStyles: Readonly<Record<string, TextStyle>> }>;
export type MinimalTokenCommit = TokenMaps & Readonly<{ schema: typeof MINIMAL_TOKEN_SCHEMA; scope: { representativeSurfaceId: string } }>;
const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong']);
export function parsePrimitive(value: unknown): Primitive {
  const p = v.object(value);
  if (p.type === 'color') {
    v.object(p, ['type', 'value']);
    // Deliberately literal sRGB: CSS variables, currentColor and context-dependent color functions
    // are not primitive values. Rendered contrast, not this parser, establishes readability.
    const value = v.text(p.value);
    if (!/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/.test(value)) return v.fail('color primitive must be a literal hex color');
    return { type: 'color', value };
  }
  if (p.type === 'number') {
    v.object(p, ['type', 'value', 'unit']);
    if (typeof p.value !== 'number' || !Number.isFinite(p.value)) return v.fail('number primitive must be finite');
    return { type: 'number', value: p.value, unit: v.enumeration(p.unit, ['px', 'unitless']) };
  }
  v.object(p, ['type', 'value']); v.enumeration(p.type, ['font-family']);
  const families = v.list(p.value, v.text); v.unique(families);
  if (!families.length || !GENERIC_FAMILIES.has(families.at(-1)!)) return v.fail('font-family needs a declared generic fallback; font readiness/physical glyph coverage still require rendering');
  return { type: 'font-family', value: families };
}
function map<T>(value: unknown, parse: (value: unknown) => T): Record<string, T> {
  return Object.fromEntries(Object.entries(v.object(value)).map(([key, item]) => [v.id(key), parse(item)]));
}
export function parseTokenMaps(value: Record<string, unknown>): TokenMaps {
  return {
    primitives: map(value.primitives, parsePrimitive),
    semantic: map(value.semantic, value => { const a = v.object(value, ['ref']); return { ref: v.id(a.ref) }; }),
    textStyles: map(value.textStyles, value => {
      const s = v.object(value, ['familyRef', 'sizeRef', 'weight', 'lineHeightRef', 'letterSpacingRef']);
      if (typeof s.weight !== 'number' || !Number.isFinite(s.weight) || s.weight < 1 || s.weight > 1000) return v.fail('invalid font weight');
      return { familyRef: v.id(s.familyRef), sizeRef: v.id(s.sizeRef), weight: s.weight, lineHeightRef: v.id(s.lineHeightRef), letterSpacingRef: s.letterSpacingRef === null ? null : v.id(s.letterSpacingRef) };
    }),
  };
}
export function validateTokenReferences(tokens: TokenMaps): void {
  for (const alias of Object.values(tokens.semantic)) if (!Object.hasOwn(tokens.primitives, alias.ref)) v.fail(`dangling semantic primitive: ${alias.ref}`);
  const primitive = (ref: string): Primitive => tokens.primitives[ref] ?? v.fail(`dangling text-style primitive: ${ref}`);
  for (const style of Object.values(tokens.textStyles)) {
    if (primitive(style.familyRef).type !== 'font-family') v.fail('text familyRef must refer to a font-family primitive');
    const size = primitive(style.sizeRef), leading = primitive(style.lineHeightRef);
    if (size.type !== 'number' || size.unit !== 'px' || size.value <= 0) v.fail('text sizeRef must refer to positive px');
    if (leading.type !== 'number' || leading.value <= 0) v.fail('text lineHeightRef must refer to a positive number');
    if (style.letterSpacingRef !== null) {
      const tracking = primitive(style.letterSpacingRef);
      if (tracking.type !== 'number' || tracking.unit !== 'px' && tracking.value !== 0) v.fail('letterSpacingRef must refer to px or unitless zero');
    }
  }
}
export function validateMinimalTokens(value: unknown): MinimalTokenCommit {
  const item = v.object(value, ['schema', 'scope', 'primitives', 'semantic', 'textStyles']);
  v.enumeration(item.schema, [MINIMAL_TOKEN_SCHEMA]);
  const scope = v.object(item.scope, ['representativeSurfaceId']), maps = parseTokenMaps(item);
  if (!Object.keys(maps.primitives).length || !Object.keys(maps.semantic).length || !Object.keys(maps.textStyles).length) v.fail('seed must name its actual primitive, semantic and text roles');
  validateTokenReferences(maps);
  return { schema: MINIMAL_TOKEN_SCHEMA, scope: { representativeSurfaceId: v.id(scope.representativeSurfaceId) }, ...maps };
}
export function validatePrimitiveOverrides(seed: MinimalTokenCommit, value: unknown): Record<string, Primitive> {
  const overrides = map(value, parsePrimitive);
  for (const [key, override] of Object.entries(overrides)) {
    const base = seed.primitives[key];
    if (!base || base.type !== override.type || base.type === 'number' && override.type === 'number' && base.unit !== override.unit) v.fail(`override must preserve existing primitive type/unit: ${key}`);
  }
  validateTokenReferences({ ...seed, primitives: { ...seed.primitives, ...overrides } });
  return overrides;
}
export function selectedBaseTokens(seed: MinimalTokenCommit, overrides: unknown): MinimalTokenCommit {
  return { ...seed, primitives: { ...seed.primitives, ...validatePrimitiveOverrides(seed, overrides) } };
}
/** Numeric compatibility projection for legacy observers; it imposes no rung quotas. */
export function minimalTokenScales(tokens: MinimalTokenCommit) {
  const typeScale = [...new Set(Object.values(tokens.textStyles).map(s => (tokens.primitives[s.sizeRef] as Extract<Primitive, { type: 'number' }>).value))].sort((a, b) => a - b);
  const spacingScale = [...new Set(Object.values(tokens.primitives).flatMap(p => p.type === 'number' && p.unit === 'px' ? [p.value] : []))].sort((a, b) => a - b);
  return { typeScale, spacingScale };
}
