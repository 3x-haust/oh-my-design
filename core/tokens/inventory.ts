import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';

export const DESIGN_INVENTORY_PATH = '.omd/existing-design-system.json';
export const DESIGN_INVENTORY_DOC_PATH = '.omd/existing-design-system.md';
export const DESIGN_INVENTORY_SCHEMA = 'existing-design-system-v1';
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 8_000_000;
const MAX_ENTRIES = 20_000;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', 'out', 'target']);
const STYLE_PROPERTY = /^(?:color|background(?:-color)?|font(?:-.+)?|line-height|letter-spacing|(?:margin|padding)(?:-.+)?|(?:row-|column-)?gap|border(?:-.+)?|box-shadow|text-shadow|opacity|(?:min-|max-)?(?:width|height)|z-index|transition(?:-.+)?|animation(?:-.+)?)$/;

export type DesignObservation = Readonly<{
  kind: 'custom-property' | 'style-declaration' | 'design-token';
  name: string;
  value: unknown;
  scope: readonly string[];
  path: string;
  /** CSS line or JSON pointer, never a guessed source position. */
  location: string;
  type?: string;
}>;
export type DesignInventory = Readonly<{
  schema: typeof DESIGN_INVENTORY_SCHEMA;
  authority: 'observed-not-approved';
  sources: readonly { path: string; sha256: string; format: 'css' | 'tokens-json' }[];
  observations: readonly DesignObservation[];
  components: readonly string[];
  gaps: readonly { path: string; reason: string }[];
  limits: readonly string[];
}>;

function read(root: string, path: string): Buffer {
  return readStableProjectFile({ root, path: resolve(root, path), label: path, fs: nodeStableProjectFileSystem() });
}

/** Conservative declaration scanner. Quotes, comments and functions cannot open a rule by accident.
 * Stores literal scopes/aliases; it does not resolve cascade, execute config, or infer approved roles. */
export function cssObservations(css: string, path: string): DesignObservation[] {
  const out: DesignObservation[] = [];
  const scopes: string[] = [];
  let fragment = '', startLine = 1, line = 1, quote = '', comment = false, depth = 0;
  const emit = (): void => {
    const match = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(fragment);
    if (match && scopes.length && (match[1]!.startsWith('--') || STYLE_PROPERTY.test(match[1]!))) {
      out.push({ kind: match[1]!.startsWith('--') ? 'custom-property' : 'style-declaration',
        name: match[1]!, value: match[2]!.trim(), scope: [...scopes], path, location: `line:${startLine}` });
    }
    fragment = '';
  };
  for (let i = 0; i < css.length; i++) {
    const char = css[i]!;
    if (char === '\n') line++;
    if (comment) { if (char === '*' && css[i + 1] === '/') { comment = false; i++; } continue; }
    if (quote) {
      fragment += char;
      if (char === '\\') { fragment += css[++i] ?? ''; }
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && css[i + 1] === '*') { comment = true; fragment += ' '; i++; continue; }
    if (!fragment.trim() && !/\s/.test(char)) startLine = line;
    if (char === '"' || char === "'") { quote = char; fragment += char; continue; }
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;
    if (depth < 0) throw new Error('unbalanced CSS function/bracket');
    if (!depth && char === '{') { scopes.push(fragment.trim()); fragment = ''; }
    else if (!depth && char === '}') { emit(); if (!scopes.length) throw new Error('unbalanced CSS rule'); scopes.pop(); }
    else if (!depth && char === ';') emit();
    else fragment += char;
  }
  if (quote || comment || depth || scopes.length || fragment.trim()) throw new Error('incomplete or unsupported CSS syntax');
  return out;
}

function jsonObservations(value: unknown, path: string): DesignObservation[] {
  const out: DesignObservation[] = [];
  const visit = (node: unknown, keys: string[], inheritedType?: string): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const entry = node as Record<string, unknown>;
    const type = typeof entry.$type === 'string' ? entry.$type : inheritedType;
    if ('$value' in entry) {
      const pointer = keys.map(key => key.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
      out.push({ kind: 'design-token', name: keys.join('.'), value: entry.$value, scope: keys.slice(0, -1),
        path, location: `json:/${pointer}/$value`, ...(type ? { type } : {}) });
      return;
    }
    for (const [key, child] of Object.entries(entry)) if (!key.startsWith('$')) visit(child, [...keys, key], type);
  };
  visit(value, []);
  return out;
}

/** Read only supported source files. Non-CSS components/configs are indexed as gaps, never evaluated. */
export function collectDesignInventory(projectRoot: string): DesignInventory {
  const root = resolve(projectRoot);
  const sources: DesignInventory['sources'][number][] = [];
  const observations: DesignObservation[] = [];
  const components: string[] = [];
  const gaps: DesignInventory['gaps'][number][] = [];
  let entries = 0, bytes = 0;
  const visit = (directory: string, depth: number): void => {
    if (depth > 20) { gaps.push({ path: directory, reason: 'directory depth limit' }); return; }
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (++entries > MAX_ENTRIES) throw new Error('DESIGN_INVENTORY_SCAN_LIMIT: more than 20000 entries; no snapshot published');
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      if (entry.isSymbolicLink()) { gaps.push({ path, reason: 'symlink not followed' }); continue; }
      if (entry.isDirectory()) { visit(path, depth + 1); continue; }
      if (!entry.isFile()) continue;
      if (/\.(?:tsx|jsx|vue|svelte)$/.test(path)) {
        components.push(path);
        gaps.push({ path, reason: 'component indexed by path only; JSX variants, utility classes and embedded/runtime styles need inspection' });
        continue;
      }
      const format = path.endsWith('.css') ? 'css' : /(?:^|[./-])tokens?\.json$/.test(path) ? 'tokens-json' : null;
      if (!format) {
        if (/\.(scss|sass|less)$/.test(path) || /^(?:tailwind|theme|tokens?)\.(?:config\.)?[cm]?[jt]s$/.test(basename(path))) {
          gaps.push({ path, reason: 'unsupported source/config; not executed' });
        }
        continue;
      }
      const size = lstatSync(join(root, path)).size;
      if (size > MAX_FILE_BYTES || bytes + size > MAX_TOTAL_BYTES) { gaps.push({ path, reason: 'source byte limit; not read' }); continue; }
      const content = read(root, path);
      bytes += content.length;
      sources.push({ path, format, sha256: createHash('sha256').update(content).digest('hex') });
      try {
        const extracted = format === 'css' ? cssObservations(content.toString('utf8'), path) : jsonObservations(JSON.parse(content.toString('utf8')), path);
        if (observations.length + extracted.length > MAX_ENTRIES) throw new Error('observation limit');
        observations.push(...extracted);
        if (!extracted.length) gaps.push({ path, reason: 'inspected; no supported declarations or $value tokens found' });
        if (format === 'css' && /@import\b/.test(content.toString('utf8'))) gaps.push({ path, reason: '@import targets are not resolved/fetched; only independently scanned local CSS is included' });
      } catch (error) {
        gaps.push({ path, reason: `not extracted: ${error instanceof SyntaxError ? 'invalid JSON' : error instanceof Error ? error.message : 'parse error'}` });
      }
    }
  };
  visit('', 0);
  return {
    schema: DESIGN_INVENTORY_SCHEMA, authority: 'observed-not-approved', sources, observations, components, gaps,
    limits: ['Static CSS declarations and $value token JSON only; not computed browser styles or proof of actual usage.',
      'Aliases, selectors and at-rule scopes remain literal; no cascade resolution or inferred semantic roles.',
      'Component variants, CSS-in-JS, Tailwind config and utility usage require manual/rendered inspection.',
      'Dot directories, dependencies, build output and symlinks excluded. Max 1MB/file, 8MB total, 20000 entries, depth 20.',
      'Observed declarations are not approved tokens. Preserve the service by default; record intentional departures in .omd/design-system-decisions.md.'],
  };
}

export function designInventoryStatus(root: string): { status: 'missing' | 'current' | 'stale' | 'invalid'; path: string; observations: number; gaps: number } {
  if (!existsSync(join(root, DESIGN_INVENTORY_PATH))) return { status: 'missing', path: DESIGN_INVENTORY_PATH, observations: 0, gaps: 0 };
  try {
    const saved = JSON.parse(read(root, DESIGN_INVENTORY_PATH).toString('utf8')) as DesignInventory;
    if (saved.schema !== DESIGN_INVENTORY_SCHEMA || saved.authority !== 'observed-not-approved' || !Array.isArray(saved.observations) || !Array.isArray(saved.gaps)) throw new Error('invalid inventory');
    const docCurrent = existsSync(join(root, DESIGN_INVENTORY_DOC_PATH))
      && read(root, DESIGN_INVENTORY_DOC_PATH).toString('utf8') === designInventoryMarkdown(saved);
    return { status: docCurrent && isDeepStrictEqual(saved, collectDesignInventory(root)) ? 'current' : 'stale', path: DESIGN_INVENTORY_PATH, observations: saved.observations.length, gaps: saved.gaps.length };
  } catch { return { status: 'invalid', path: DESIGN_INVENTORY_PATH, observations: 0, gaps: 0 }; }
}

export function designInventoryMarkdown(inventory: DesignInventory): string {
  const cell = (value: unknown): string => String(typeof value === 'object' ? JSON.stringify(value) : value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ').replace(/</g, '&lt;');
  return ['# Existing design system — observed, not approved', '',
    'Generated by `omd init`. Edit decisions in `.omd/design-system-decisions.md`, not this generated inventory. Approved `.omd/tokens.json` remains separate and is never overwritten.', '',
    ...inventory.limits.map(item => `- ${item}`), '',
    '## Observations', '', '| Kind | Name | Value | Scope | Source |', '| --- | --- | --- | --- | --- |',
    ...inventory.observations.map(item => `| ${item.kind} | ${cell(item.name)} | ${cell(item.value)} | ${cell(item.scope.join(' → '))} | ${cell(item.path)} (${item.location}) |`), '',
    '## Component files (not verified variants)', '', ...inventory.components.map(path => `- ${cell(path)}`), '',
    '## Coverage gaps', '', ...inventory.gaps.map(item => `- ${cell(item.path)}: ${cell(item.reason)}`), '',
  ].join('\n');
}

export function initializeDesignInventory(root: string, writer: ProjectWriteAdapter, refresh = false): DesignInventory {
  if (existsSync(join(root, DESIGN_INVENTORY_PATH))) {
    const previous = JSON.parse(read(root, DESIGN_INVENTORY_PATH).toString('utf8')) as DesignInventory;
    if (previous.schema !== DESIGN_INVENTORY_SCHEMA || previous.authority !== 'observed-not-approved') throw new Error('DESIGN_INVENTORY_UNOWNED: refusing to overwrite an unrecognized record');
    const current = collectDesignInventory(root);
    if (isDeepStrictEqual(previous, current) && designInventoryStatus(root).status === 'current') return current;
    if (!refresh) throw new Error('DESIGN_INVENTORY_STALE: inspect changes and use omd init --refresh; authored decisions and tokens remain untouched');
  } else if (existsSync(join(root, DESIGN_INVENTORY_DOC_PATH))) throw new Error('DESIGN_INVENTORY_UNOWNED: refusing to overwrite an existing document without its generated inventory');
  const inventory = collectDesignInventory(root);
  writer.write(DESIGN_INVENTORY_DOC_PATH, designInventoryMarkdown(inventory));
  writer.write(DESIGN_INVENTORY_PATH, `${JSON.stringify(inventory, null, 2)}\n`);
  return inventory;
}
