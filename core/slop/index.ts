import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';

export const SLOP_SOURCE_SCHEMA_VERSION = '1.0';
export const SLOP_SOURCE_MAX_BYTES = 512 * 1024;

export type SlopSourceCandidateId =
  | 'mid-sentence-break'
  | 'all-property-transition'
  | 'repeated-kicker-treatment'
  | 'animated-status-glow'
  | 'rounded-accent-callout'
  | 'decorative-ordinal-run'
  | 'default-font-pair'
  | 'global-terminal-styling';

export interface SlopSourceCandidate {
  candidateId: SlopSourceCandidateId;
  path: string;
  line: number;
  signals: string[];
  reason: string;
  reviewQuestion: string;
  owner: 'hand';
}

export interface SlopSourceScan {
  schemaVersion: typeof SLOP_SOURCE_SCHEMA_VERSION;
  root: string;
  filesScanned: number;
  candidates: SlopSourceCandidate[];
}

const SOURCE_EXTENSIONS = new Set(['.html', '.css', '.scss', '.js', '.jsx', '.ts', '.tsx']);
const SKIP_DIRECTORIES = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', 'vendor', '.git',
  '.omd', 'test', 'tests', '__tests__', 'fixtures', 'snapshots',
]);
const ROOT_GENERATED_DIRECTORIES = new Set(['agents', 'skills']);
const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock',
  'bun.lockb', 'deno.lock',
]);

const REASONS: Record<SlopSourceCandidateId, Pick<SlopSourceCandidate, 'reason' | 'reviewQuestion'>> = {
  'mid-sentence-break': {
    reason: 'A heading or paragraph fixes a line break before the sentence has ended.',
    reviewQuestion: 'Does this break express meaning, or should width and wrapping decide the line?',
  },
  'all-property-transition': {
    reason: 'A transition targets every changing property instead of naming the intended motion.',
    reviewQuestion: 'Which property is meant to animate, and can the transition name only that property?',
  },
  'repeated-kicker-treatment': {
    reason: 'The same kicker-like treatment repeats across at least three content blocks.',
    reviewQuestion: 'Does each repeated label carry useful hierarchy, or has it become a default decoration?',
  },
  'animated-status-glow': {
    reason: 'A live-state label combines luminous styling with a ping or pulse treatment.',
    reviewQuestion: 'Does this state need continuous visual urgency, or would a quiet status remain legible?',
  },
  'rounded-accent-callout': {
    reason: 'A callout combines rounded corners with a thick coloured left edge.',
    reviewQuestion: 'Which one treatment communicates the aside most clearly without stacking both?',
  },
  'decorative-ordinal-run': {
    reason: 'A display treatment repeats zero-padded ordinals across a three-step run.',
    reviewQuestion: 'Do these ordinals carry navigation or sequence meaning, or are they ornamental structure?',
  },
  'default-font-pair': {
    reason: 'One source file declares Inter together with a second frequently paired interface family.',
    reviewQuestion: 'What distinct role requires both families, and is that role visible in the type proof?',
  },
  'global-terminal-styling': {
    reason: 'Monospace terminal styling is applied to a global or primary interface surface.',
    reviewQuestion: 'Is terminal language intrinsic to the product, or should monospace stay with code content?',
  },
};

function slash(path: string): string {
  return path.split(sep).join('/');
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

function maskRange(chars: string[], start: number, end: number): void {
  for (let i = start; i < end; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
}

/** Remove comments while preserving offsets and line numbers. Strings remain intact. */
function maskComments(source: string, extension: string): string {
  const chars = source.split('');
  for (const match of source.matchAll(/<!--[\s\S]*?-->/g)) maskRange(chars, match.index!, match.index! + match[0].length);

  let quote: '"' | "'" | '`' | null = null;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      maskRange(chars, i, stop);
      i = stop - 1;
      continue;
    }
    const lineComments = ['.js', '.jsx', '.ts', '.tsx', '.scss'].includes(extension);
    if (lineComments && ch === '/' && next === '/') {
      const end = source.indexOf('\n', i + 2);
      const stop = end < 0 ? source.length : end;
      maskRange(chars, i, stop);
      i = stop - 1;
    }
  }
  return chars.join('');
}

interface ClassAttribute {
  value: string;
  index: number;
  tag: string;
}

function classAttributes(source: string): ClassAttribute[] {
  const found: ClassAttribute[] = [];
  const tagPattern = /<([a-z][\w.-]*)\b[^>]*>/gi;
  for (const tagMatch of source.matchAll(tagPattern)) {
    const tagSource = tagMatch[0];
    const attr = /\bclass(?:Name)?\s*=\s*(?:\{\s*)?(["'`])([\s\S]*?)\1\s*\}?/i.exec(tagSource);
    if (!attr) continue;
    found.push({
      value: attr[2]!,
      index: tagMatch.index! + (attr.index ?? 0),
      tag: tagMatch[1]!.toLowerCase(),
    });
  }
  return found;
}

function candidate(
  candidateId: SlopSourceCandidateId,
  path: string,
  source: string,
  index: number,
  signals: string[],
): SlopSourceCandidate {
  return {
    candidateId,
    path,
    line: lineAt(source, index),
    signals,
    ...REASONS[candidateId],
    owner: 'hand',
  };
}

function detectMidSentenceBreak(source: string, path: string): SlopSourceCandidate | null {
  const element = /<(h1|h2|p)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of source.matchAll(element)) {
    const body = match[2]!;
    const bodyOffset = match.index! + match[0].indexOf(body);
    for (const br of body.matchAll(/<br\s*\/?>/gi)) {
      const visibleBefore = body.slice(0, br.index).replace(/<[^>]+>/g, '').trimEnd();
      if (!visibleBefore || /[.!?。！？…:;]\s*$/.test(visibleBefore)) continue;
      return candidate('mid-sentence-break', path, source, bodyOffset + br.index!, [
        `element:${match[1]!.toLowerCase()}`, 'break:before-sentence-end',
      ]);
    }
  }
  return null;
}

function detectAllTransition(source: string, path: string): SlopSourceCandidate | null {
  const match = /\btransition-all\b|\btransition\s*:\s*all(?:\s|;|!|$)/i.exec(source);
  return match ? candidate('all-property-transition', path, source, match.index, [
    match[0].toLowerCase().includes('transition-all') ? 'syntax:utility' : 'syntax:declaration',
    'property:all',
  ]) : null;
}

function detectKickerCluster(source: string, path: string): SlopSourceCandidate | null {
  const occurrences = new Map<string, ClassAttribute[]>();
  const trackedUppercase: ClassAttribute[] = [];
  for (const attr of classAttributes(source)) {
    const token = attr.value.match(/(?:^|\s)(kicker|overline|eyebrow)(?:[\w-]*)?(?=\s|$)/i)?.[1]?.toLowerCase();
    if (token) {
      const list = occurrences.get(token) ?? [];
      list.push(attr);
      occurrences.set(token, list);
    }
    const uppercase = /(?:^|\s)uppercase(?=\s|$)/i.test(attr.value);
    const tracked = /(?:^|\s)tracking-(?:wide|wider|widest)(?=\s|$)/i.test(attr.value);
    if (uppercase && tracked) trackedUppercase.push(attr);
  }
  for (const token of ['kicker', 'overline', 'eyebrow']) {
    const matches = occurrences.get(token) ?? [];
    if (matches.length >= 3) return candidate('repeated-kicker-treatment', path, source, matches[2]!.index, [
      `role:${token}`, 'cluster:3-plus',
    ]);
  }
  if (trackedUppercase.length >= 3) {
    return candidate('repeated-kicker-treatment', path, source, trackedUppercase[2]!.index, [
      'role:tracked-uppercase', 'cluster:3-plus',
    ]);
  }
  return null;
}

function detectAnimatedStatus(source: string, path: string): SlopSourceCandidate | null {
  const blocks = source.matchAll(/<([a-z][\w.-]*)\b[^>]*>[\s\S]{0,900}?<\/\1\s*>/gi);
  for (const match of blocks) {
    const text = match[0];
    const status = text.match(/\b(live|ready|online)\b/i)?.[1]?.toLowerCase();
    const motion = text.match(/(?:animate[-_:]?)?(ping|pulse)\b/i)?.[1]?.toLowerCase();
    const luminous = /\bglow(?:ing)?\b|(?:shadow|ring|drop-shadow)[^\s"'<>]*(?:emerald|green|lime|amber)|box-shadow\s*:/i.test(text);
    if (status && motion && luminous) return candidate('animated-status-glow', path, source, match.index!, [
      `state:${status}`, `motion:${motion}`, 'luminance:glow',
    ]);
  }
  return null;
}

function detectRoundedCallout(source: string, path: string): SlopSourceCandidate | null {
  for (const attr of classAttributes(source)) {
    const rounded = /(?:^|\s)rounded(?:-[\w[\]./-]+)?(?=\s|$)/i.test(attr.value);
    const thickLeft = /(?:^|\s)border-l-(?:[4-9]|[1-9]\d)(?=\s|$)/i.test(attr.value);
    const colouredLeft = /(?:^|\s)border-l-(?![0-9]+(?:\s|$))(?:[a-z]+)-(?:[1-9]00|[a-z]+)(?=\s|$)/i.test(attr.value);
    if (rounded && thickLeft && colouredLeft) return candidate('rounded-accent-callout', path, source, attr.index, [
      'shape:rounded', 'edge:left-thick', 'edge:coloured',
    ]);
  }
  for (const block of source.matchAll(/[^{}]+\{([^{}]*)\}/g)) {
    const declarations = block[1]!;
    const rounded = /border-radius\s*:\s*(?!0(?:\D|$))[^;]+/i.test(declarations);
    const left = /border-left\s*:\s*(?:[4-9]|[1-9]\d)px\s+(?:solid|double|dashed)\s+(?!transparent|currentcolor)[^;]+/i.test(declarations);
    if (rounded && left) return candidate('rounded-accent-callout', path, source, block.index!, [
      'shape:rounded', 'edge:left-thick', 'edge:coloured',
    ]);
  }
  return null;
}

function detectOrdinalRun(source: string, path: string): SlopSourceCandidate | null {
  const outsideOrderedLists = source.replace(/<ol\b[\s\S]*?<\/ol\s*>/gi, (value) => value.replace(/[^\r\n]/g, ' '));
  const found = new Map<string, number>();
  for (const match of outsideOrderedLists.matchAll(/<([a-z][\w.-]*)\b([^>]*)>([\s\S]{0,180}?)<\/\1\s*>/gi)) {
    const attrs = match[2]!;
    const body = match[3]!;
    const treatment = /(?:display[-_ ]?(?:number|ordinal)|(?:number|ordinal)[-_ ]?display|decorative[-_ ]?ordinal|chapter[-_ ]?index)/i.test(attrs)
      || (/step[-_ ]?(?:number|index)/i.test(attrs) && /font[-_ ]?display/i.test(attrs));
    if (!treatment) continue;
    const ordinal = body.replace(/<[^>]+>/g, '').match(/\b(01|02|03)\b/)?.[1];
    if (ordinal && !found.has(ordinal)) found.set(ordinal, match.index!);
  }
  if (found.size === 3) return candidate('decorative-ordinal-run', path, source, found.get('03')!, [
    'sequence:01-02-03', 'treatment:display-ordinal',
  ]);
  return null;
}

function findEscapedIdentifierCall(source: string, identifier: string): number | null {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|[^\\w$])(${escaped})\\s*\\(`, 'm').exec(source);
  return match ? match.index + match[1]!.length : null;
}

function detectFontPair(source: string, path: string): SlopSourceCandidate | null {
  const inter = /(?:font-family\s*:[^;{}]*|fontFamily\s*[:=][^,;\n}]*|fonts?\.[a-z]+\s*\([^)]*)\bInter\b/i.exec(source);
  const partner = /(?:font-family\s*:[^;{}]*|fontFamily\s*[:=][^,;\n}]*|fonts?\.[a-z]+\s*\([^)]*)\b(Space\s+Grotesk|Geist|Manrope|Plus\s+Jakarta(?:\s+Sans)?)\b/i.exec(source);
  if (inter && partner) {
    return candidate('default-font-pair', path, source, Math.max(inter.index, partner.index), [
      'family:inter', `family:${partner[1]!.toLowerCase().replace(/\s+/g, '-')}`, 'context:same-file',
    ]);
  }

  for (const imported of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/g)) {
    const names = new Map<string, string>();
    for (const item of imported[1]!.split(',')) {
      const parsed = /^\s*(Inter|Space_Grotesk|Geist|Manrope|Plus_Jakarta_Sans)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(item);
      if (parsed) names.set(parsed[1]!, parsed[2] ?? parsed[1]!);
    }
    const interLocal = names.get('Inter');
    if (!interLocal || findEscapedIdentifierCall(source, interLocal) === null) continue;
    for (const family of ['Space_Grotesk', 'Geist', 'Manrope', 'Plus_Jakarta_Sans']) {
      const local = names.get(family);
      if (!local) continue;
      const useIndex = findEscapedIdentifierCall(source, local);
      if (useIndex === null) continue;
      return candidate('default-font-pair', path, source, useIndex, [
        'family:inter', `family:${family.toLowerCase().replace(/_/g, '-')}`, 'context:next-font-google',
      ]);
    }
  }
  return null;
}

function detectTerminalChrome(source: string, path: string): SlopSourceCandidate | null {
  for (const attr of classAttributes(source)) {
    if (['body', 'main', 'nav', 'h1', 'h2'].includes(attr.tag) && /(?:^|\s)font-mono(?=\s|$)/i.test(attr.value)) {
      return candidate('global-terminal-styling', path, source, attr.index, [
        `surface:${attr.tag}`, 'type:monospace',
      ]);
    }
    const mono = /(?:^|\s)font-mono(?=\s|$)/i.test(attr.value);
    const dark = /(?:^|\s)bg-(?:black|zinc-9\d\d|neutral-9\d\d|stone-9\d\d|slate-9\d\d)(?=\s|$)/i.test(attr.value);
    const warm = /(?:^|\s)text-(?:amber|orange|yellow|red)-(?:[2-8]\d\d)(?=\s|$)/i.test(attr.value);
    const viewportShell = /(?:^|\s)(?:min-h-screen|h-screen|w-screen)(?=\s|$)/i.test(attr.value);
    if (mono && dark && warm && viewportShell) {
      return candidate('global-terminal-styling', path, source, attr.index, [
        'surface:viewport-shell', 'type:monospace', 'palette:dark-warm',
      ]);
    }
  }
  for (const block of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = block[1]!.trim();
    const declarations = block[2]!;
    const primarySurface = /(?:^|,)\s*(?:html|body|main|nav|h1|h2|:root)(?:\b|\s|,|$)/i.test(selectors);
    const globalShell = /(?:^|,)\s*(?:#(?:root|app)|\.(?:app|shell|site-shell))(?:\b|\s|,|$)/i.test(selectors);
    if (!primarySurface && !globalShell) continue;
    const mono = /font-family\s*:[^;{}]*(?:monospace|\bmono\b|Menlo|Monaco|Consolas|Fira\s+Code|JetBrains\s+Mono)/i.test(declarations);
    if (primarySurface && mono) {
      return candidate('global-terminal-styling', path, source, block.index!, [
        'surface:global-or-primary', 'type:monospace',
      ]);
    }
    const dark = /background(?:-color)?\s*:\s*(?:#(?:0[0-9a-f]{2}|1[0-9a-f]{2}){1,2}|(?:black|rgb\(\s*(?:[0-2]?\d)\s*,\s*(?:[0-2]?\d)\s*,\s*(?:[0-2]?\d)\s*\)))/i.test(declarations);
    const warm = /(?:^|;)\s*color\s*:\s*(?:#(?:f[0-9a-f]{2}|e[6-9a-f][0-9a-f])(?:[0-9a-f]{3})?|(?:orange|gold|amber|yellow))/i.test(declarations);
    if (globalShell && mono && dark && warm) {
      return candidate('global-terminal-styling', path, source, block.index!, [
        'surface:global-shell', 'type:monospace', 'palette:dark-warm',
      ]);
    }
  }
  return null;
}

function detectCandidates(source: string, path: string, extension: string): SlopSourceCandidate[] {
  const masked = maskComments(source, extension);
  const candidates = [
    detectMidSentenceBreak(masked, path),
    detectAllTransition(masked, path),
    detectKickerCluster(masked, path),
    detectAnimatedStatus(masked, path),
    detectRoundedCallout(masked, path),
    detectOrdinalRun(masked, path),
    detectFontPair(masked, path),
    detectTerminalChrome(masked, path),
  ];
  return candidates.filter((item): item is SlopSourceCandidate => item !== null);
}

function shouldSkipFile(name: string): boolean {
  const lower = name.toLowerCase();
  return LOCKFILES.has(lower) || /\.min\.[^.]+$/i.test(lower) || !SOURCE_EXTENSIONS.has(extname(lower));
}

function compareCodeUnits(a: SlopSourceCandidate, b: SlopSourceCandidate): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1
    : a.line - b.line || (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0);
}

/**
 * Read-only source scan. It uses a fixed skip policy and intentionally does not interpret
 * .gitignore. Rendered IR remains a separate, authoritative review input.
 */
export function scanSlopSource(rootInput = process.cwd()): SlopSourceScan {
  const root = resolve(rootInput);
  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch (error) {
    throw new Error(`slop scan root is not readable: ${root}`, { cause: error });
  }
  if (rootStat.isSymbolicLink()) throw new Error(`slop scan root cannot be a symlink: ${root}`);
  if (!rootStat.isDirectory()) throw new Error(`slop scan root is not a directory: ${root}`);

  let filesScanned = 0;
  const candidates: SlopSourceCandidate[] = [];

  const walk = (directory: string, relativeDirectory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const entryPath = resolve(directory, entry.name);
      const entryRelative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRECTORIES.has(entry.name)
          || (!relativeDirectory && ROOT_GENERATED_DIRECTORIES.has(entry.name))) continue;
        walk(entryPath, entryRelative);
        continue;
      }
      if (!entry.isFile() || shouldSkipFile(entry.name)) continue;

      const size = statSync(entryPath).size;
      if (size > SLOP_SOURCE_MAX_BYTES) continue;
      const bytes = readFileSync(entryPath);
      if (bytes.includes(0)) continue;
      let source: string;
      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        continue;
      }
      filesScanned++;
      candidates.push(...detectCandidates(source, slash(relative(root, entryPath)), extname(entry.name).toLowerCase()));
    }
  };

  walk(root, '');
  candidates.sort(compareCodeUnits);
  return { schemaVersion: SLOP_SOURCE_SCHEMA_VERSION, root, filesScanned, candidates };
}
