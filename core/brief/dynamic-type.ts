import * as v from './candidate-data.ts';

export type DynamicTypeCoverage = Readonly<{ locales: readonly string[]; scripts: readonly string[];
  sources: readonly { roleId: string; kind: 'fixed-copy' | 'user-input' | 'api' | 'cms'; bounded: boolean }[];
  unicodeRanges: readonly string[]; requiredPunctuationAndSymbols: readonly string[];
  normalization: 'NFC' | 'preserve'; fallbackStack: readonly string[]; unknownScriptPolicy: 'fallback' | 'documented-input-restriction';
  subsets: readonly { familyId: string; ranges: readonly string[]; asset: v.Receipt; unicodeRange: string }[] }>;
function range(value: unknown): [number, number] {
  const text = v.text(value), match = /^U\+([0-9A-Fa-f]{1,6})(?:-([0-9A-Fa-f]{1,6}))?$/.exec(text);
  if (!match) return v.fail('explicit Unicode scalar range required');
  const first = parseInt(match[1]!, 16), last = parseInt(match[2] ?? match[1]!, 16);
  if (first > last || last > 0x10ffff || first <= 0xdfff && last >= 0xd800) return v.fail('invalid Unicode scalar range');
  return [first, last];
}
function covers(ranges: readonly string[], start: number, end: number): boolean {
  let next = start;
  for (const [first, last] of ranges.map(range).sort((a, b) => a[0] - b[0])) {
    if (first > next) break;
    if (last >= next) next = last + 1;
    if (next > end) return true;
  }
  return false;
}
/** This is range-policy validation, not a claim of physical glyph identity. Native type/stress
 * observation is still required; computed family or a declared unicode-range cannot prove a font. */
export function parseDynamicTypeCoverage(value: unknown): DynamicTypeCoverage {
  const p = v.object(value, ['locales', 'scripts', 'sources', 'unicodeRanges', 'requiredPunctuationAndSymbols', 'normalization', 'fallbackStack', 'unknownScriptPolicy', 'subsets']);
  const sources = v.list(p.sources, value => { const s = v.object(value, ['roleId', 'kind', 'bounded']); return { roleId: v.id(s.roleId), kind: v.enumeration(s.kind, ['fixed-copy', 'user-input', 'api', 'cms']), bounded: v.boolean(s.bounded) }; });
  const unicodeRanges = v.list(p.unicodeRanges, value => { range(value); return v.text(value); });
  const scripts = v.ids(p.scripts, true), fallbackStack = v.list(p.fallbackStack, v.text);
  if (!fallbackStack.length || !sources.length) v.fail('dynamic type needs actual roles and declared fallback');
  const dynamic = sources.some(s => s.kind !== 'fixed-copy');
  if (dynamic && !unicodeRanges.length) v.fail('dynamic content cannot use a literal-current-copy-only subset');
  if (dynamic && scripts.includes('Hangul') && ![[0x1100, 0x11ff], [0x3130, 0x318f], [0xac00, 0xd7a3]].every(([a, b]) => covers(unicodeRanges, a!, b!))) v.fail('dynamic Hangul needs supported modern syllables and Jamo ranges, not today\'s syllables');
  const subsets = v.list(p.subsets, value => {
    const s = v.object(value, ['familyId', 'ranges', 'asset', 'unicodeRange']), ranges = v.list(s.ranges, value => { range(value); return v.text(value); }), unicodeRange = v.text(s.unicodeRange);
    const cssRanges = unicodeRange.split(',').map(r => r.trim()); cssRanges.forEach(range);
    if (v.digest(ranges.map(range).sort()) !== v.digest(cssRanges.map(range).sort())) v.fail('subset CSS unicode-range differs from declared ranges');
    return { familyId: v.id(s.familyId), ranges, asset: v.receipt(s.asset), unicodeRange };
  });
  return { locales: v.ids(p.locales, true), scripts, sources, unicodeRanges, requiredPunctuationAndSymbols: v.list(p.requiredPunctuationAndSymbols, v.text),
    normalization: v.enumeration(p.normalization, ['NFC', 'preserve']), fallbackStack,
    unknownScriptPolicy: v.enumeration(p.unknownScriptPolicy, ['fallback', 'documented-input-restriction']), subsets };
}
export function checkDynamicTypeCoverage(root: string, value: unknown): DynamicTypeCoverage {
  const coverage = parseDynamicTypeCoverage(value);
  for (const subset of coverage.subsets) v.readReceipt(root, subset.asset);
  return coverage;
}
