#!/usr/bin/env node
/**
 * Read-only metrics for one or more Oh My Design run directories.
 *
 * Usage:
 *   node scripts/omd-run-metrics.ts <run-dir>... [--json]
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js', '.css', '.html', '.vue', '.svelte']);
const APP_EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist', '.omd', '.omc']);
const CSS_EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist']);

export type CountMatrix = Record<string, Record<string, number>>;

export interface DiscoveryRecord {
  lane: string;
  status: string;
  provider: string;
}

export interface DiscoveryMetrics {
  byLaneStatus: CountMatrix;
  byProviderStatus: CountMatrix;
}

export interface CssFingerprint {
  fileCount: number;
  dominantCanvasBackground: string | null;
  canvasIsExactlyWhite: boolean;
  fontSizePxValues: number[];
  smallFontSizeCount: number;
  maxFontSizePx: number | null;
  monospaceFontFamilyUsageCount: number;
  uppercasePositiveLetterSpacingCount: number;
  border1pxDeclarationCount: number;
  borderRadiusDeclarationCount: number;
}

export interface RunMetrics {
  runDir: string;
  appProduced: number;
  discovery: DiscoveryMetrics;
  retainedReferenceImages: number;
  excluded: number;
  css: CssFingerprint;
}

interface CssDeclaration {
  property: string;
  value: string;
}

interface CssRule {
  selector: string;
  declarations: CssDeclaration[];
}

function compareNames(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function listFiles(root: string, excludedDirectories: ReadonlySet<string>): string[] {
  if (!existsSync(root)) return [];

  const files: string[] = [];
  const visit = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => compareNames(a.name, b.name));

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!excludedDirectories.has(entry.name)) visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };

  visit(root);
  return files;
}

function sortedMatrix(matrix: CountMatrix): CountMatrix {
  const result: CountMatrix = {};
  for (const outerKey of Object.keys(matrix).sort(compareNames)) {
    const inner = matrix[outerKey];
    if (inner === undefined) continue;

    result[outerKey] = {};
    for (const innerKey of Object.keys(inner).sort(compareNames)) {
      const count = inner[innerKey];
      if (count !== undefined) result[outerKey][innerKey] = count;
    }
  }
  return result;
}

function increment(matrix: CountMatrix, outerKey: string, innerKey: string): void {
  const inner = matrix[outerKey] ?? {};
  inner[innerKey] = (inner[innerKey] ?? 0) + 1;
  matrix[outerKey] = inner;
}

/** Pure aggregation of discovery records by lane/status and provider/status. */
export function summarizeDiscoveryRecords(records: readonly DiscoveryRecord[]): DiscoveryMetrics {
  const byLaneStatus: CountMatrix = {};
  const byProviderStatus: CountMatrix = {};

  for (const record of records) {
    increment(byLaneStatus, record.lane, record.status);
    increment(byProviderStatus, record.provider, record.status);
  }

  return {
    byLaneStatus: sortedMatrix(byLaneStatus),
    byProviderStatus: sortedMatrix(byProviderStatus),
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDiscoveryRecords(runDir: string): DiscoveryRecord[] {
  const discoveryDir = join(runDir, '.omd', 'discovery');
  if (!existsSync(discoveryDir)) return [];

  const records: DiscoveryRecord[] = [];
  const laneEntries = readdirSync(discoveryDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => compareNames(a.name, b.name));

  for (const laneEntry of laneEntries) {
    const laneDir = join(discoveryDir, laneEntry.name);
    const jsonEntries = readdirSync(laneDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name) === '.json')
      .sort((a, b) => compareNames(a.name, b.name));

    for (const entry of jsonEntries) {
      const path = join(laneDir, entry.name);
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      } catch (error) {
        throw new Error(`Could not parse discovery JSON: ${path}`, { cause: error });
      }

      if (
        isJsonObject(parsed)
        && typeof parsed.status === 'string'
        && typeof parsed.provider === 'string'
      ) {
        records.push({ lane: laneEntry.name, status: parsed.status, provider: parsed.provider });
      }
    }
  }

  return records;
}

function countExcludedRecords(runDir: string): number {
  const discoveryDir = join(runDir, '.omd', 'discovery');
  if (!existsSync(discoveryDir)) return 0;

  let count = 0;
  const laneEntries = readdirSync(discoveryDir, { withFileTypes: true });
  for (const laneEntry of laneEntries) {
    if (!laneEntry.isDirectory()) continue;

    const excludedDir = join(discoveryDir, laneEntry.name, 'excluded');
    if (!existsSync(excludedDir)) continue;
    count += readdirSync(excludedDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name) === '.json')
      .length;
  }
  return count;
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseDeclarations(block: string): CssDeclaration[] {
  const declarations: CssDeclaration[] = [];
  const declarationPattern = /(?:^|;)\s*([\w-]+)\s*:\s*([^;{}]+)/g;
  let match: RegExpExecArray | null;

  while ((match = declarationPattern.exec(block)) !== null) {
    const property = match[1];
    const value = match[2];
    if (property !== undefined && value !== undefined) {
      declarations.push({ property: property.toLowerCase(), value: value.trim() });
    }
  }
  return declarations;
}

function parseCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  const uncommented = stripCssComments(css);
  let match: RegExpExecArray | null;

  while ((match = rulePattern.exec(uncommented)) !== null) {
    const selector = match[1];
    const body = match[2];
    if (selector !== undefined && body !== undefined) {
      rules.push({ selector: selector.trim(), declarations: parseDeclarations(body) });
    }
  }
  return rules;
}

function normalizeCssValue(value: string): string {
  return value
    .replace(/\s*!important\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function resolveCssVariables(value: string, variables: ReadonlyMap<string, string>): string {
  let resolved = value;

  for (let pass = 0; pass < 12; pass += 1) {
    let changed = false;
    const next = resolved.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
      (whole, name: string, fallback: string | undefined) => {
        const replacement = variables.get(name) ?? fallback;
        if (replacement === undefined || replacement === whole) return whole;
        changed = true;
        return replacement;
      },
    );
    resolved = next;
    if (!changed) break;
  }

  return normalizeCssValue(resolved);
}

function selectorMentionsCanvas(selector: string): boolean {
  return selector.split(',').some((part) => {
    const target = part.trim().split(/[\s>+~]+/).at(-1) ?? '';
    return /^(?:html|body)(?![\w-])/i.test(target) || /^:root(?![\w-])/i.test(target);
  });
}

function isCanvasVariable(property: string): boolean {
  return /^--(?:bg|canvas|surface)(?:-|$)/i.test(property);
}

function pxValues(value: string): number[] {
  const values: number[] = [];
  const pattern = /(-?(?:\d+(?:\.\d*)?|\.\d+))px\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    const raw = match[1];
    if (raw !== undefined) values.push(Number(raw));
  }
  return values;
}

function startsWithPositiveLength(value: string): boolean {
  const match = /^\s*\+?((?:\d+(?:\.\d*)?|\.\d+))(?:[a-z%]+)?\b/i.exec(value);
  return match?.[1] !== undefined && Number(match[1]) > 0;
}

function isBorderWidthProperty(property: string): boolean {
  return property === 'border'
    || property === 'border-width'
    || /^border-(?:top|right|bottom|left|block|block-start|block-end|inline|inline-start|inline-end)(?:-width)?$/.test(property);
}

function isBorderRadiusProperty(property: string): boolean {
  return property === 'border-radius' || /^border(?:-[a-z]+)+-radius$/.test(property);
}

/** Pure semantic check for the exact CSS white spellings tracked by this tool. */
export function isExactlyWhiteCssValue(value: string | null): boolean {
  if (value === null) return false;
  const normalized = normalizeCssValue(value);
  return normalized === '#fff'
    || normalized === '#ffffff'
    || normalized === 'white'
    || /^rgb\(\s*255\s*(?:,\s*|\s+)255\s*(?:,\s*|\s+)255\s*\)$/.test(normalized);
}

/** Pure CSS fingerprinting; callers provide stylesheet contents, not paths. */
export function buildCssFingerprint(stylesheets: readonly string[]): CssFingerprint {
  const rules = stylesheets.flatMap(parseCssRules);
  const variables = new Map<string, string>();

  for (const rule of rules) {
    for (const declaration of rule.declarations) {
      if (declaration.property.startsWith('--')) {
        variables.set(declaration.property, declaration.value);
      }
    }
  }

  const canvasCounts = new Map<string, number>();
  const fontSizePxValues: number[] = [];
  let monospaceFontFamilyUsageCount = 0;
  let uppercasePositiveLetterSpacingCount = 0;
  let border1pxDeclarationCount = 0;
  let borderRadiusDeclarationCount = 0;

  for (const rule of rules) {
    const canvasSelector = selectorMentionsCanvas(rule.selector);
    const uppercase = rule.declarations.some((declaration) => (
      declaration.property === 'text-transform' && /\buppercase\b/i.test(declaration.value)
    ));

    for (const declaration of rule.declarations) {
      if (
        isCanvasVariable(declaration.property)
        || (canvasSelector && (declaration.property === 'background' || declaration.property === 'background-color'))
      ) {
        const candidate = resolveCssVariables(declaration.value, variables);
        canvasCounts.set(candidate, (canvasCounts.get(candidate) ?? 0) + 1);
      }

      if (declaration.property === 'font-size') {
        fontSizePxValues.push(...pxValues(declaration.value));
      }
      if (
        (declaration.property === 'font-family' || declaration.property === 'font')
        && /\bmonospace\b/i.test(declaration.value)
      ) {
        monospaceFontFamilyUsageCount += 1;
      }
      if (
        uppercase
        && declaration.property === 'letter-spacing'
        && startsWithPositiveLength(declaration.value)
      ) {
        uppercasePositiveLetterSpacingCount += 1;
      }
      if (
        isBorderWidthProperty(declaration.property)
        && /(?:^|[^\d.])1px(?![\w.])/i.test(declaration.value)
      ) {
        border1pxDeclarationCount += 1;
      }
      if (isBorderRadiusProperty(declaration.property)) {
        borderRadiusDeclarationCount += 1;
      }
    }
  }

  let dominantCanvasBackground: string | null = null;
  let dominantCount = 0;
  for (const [candidate, count] of canvasCounts) {
    if (count > dominantCount) {
      dominantCanvasBackground = candidate;
      dominantCount = count;
    }
  }

  fontSizePxValues.sort((a, b) => a - b);
  const maxFontSizePx = fontSizePxValues.reduce<number | null>(
    (maximum, value) => maximum === null || value > maximum ? value : maximum,
    null,
  );

  return {
    fileCount: stylesheets.length,
    dominantCanvasBackground,
    canvasIsExactlyWhite: isExactlyWhiteCssValue(dominantCanvasBackground),
    fontSizePxValues,
    smallFontSizeCount: fontSizePxValues.filter((value) => value < 12).length,
    maxFontSizePx,
    monospaceFontFamilyUsageCount,
    uppercasePositiveLetterSpacingCount,
    border1pxDeclarationCount,
    borderRadiusDeclarationCount,
  };
}

/** Gather all metrics for one run directory. Files are read but never changed. */
export function collectRunMetrics(runDirInput: string): RunMetrics {
  const runDir = resolve(runDirInput);
  if (!existsSync(runDir) || !statSync(runDir).isDirectory()) {
    throw new Error(`Run directory does not exist or is not a directory: ${runDir}`);
  }

  const appProduced = listFiles(runDir, APP_EXCLUDED_DIRECTORIES)
    .filter((path) => APP_EXTENSIONS.has(extname(path).toLowerCase()))
    .length;

  const discovery = summarizeDiscoveryRecords(readDiscoveryRecords(runDir));
  const retainedReferenceImages = ['design', 'domain']
    .flatMap((lane) => listFiles(join(runDir, '.omd', 'refs', lane), new Set<string>()))
    .filter((path) => extname(path).toLowerCase() === '.png')
    .length;
  const excluded = countExcludedRecords(runDir);
  const cssFiles = listFiles(runDir, CSS_EXCLUDED_DIRECTORIES)
    .filter((path) => extname(path).toLowerCase() === '.css');
  const css = buildCssFingerprint(cssFiles.map((path) => readFileSync(path, 'utf8')));

  return {
    runDir,
    appProduced,
    discovery,
    retainedReferenceImages,
    excluded,
    css,
  };
}

function formatCountMatrix(matrix: CountMatrix): string {
  const groups = Object.entries(matrix).map(([group, counts]) => {
    const values = Object.entries(counts).map(([status, count]) => `${status}=${count}`).join(', ');
    return `${group}: ${values}`;
  });
  return groups.length === 0 ? '-' : groups.join('; ');
}

function formatTable(rows: readonly (readonly string[])[]): string {
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const widths = Array.from({ length: columnCount }, (_, column) => (
    rows.reduce((maximum, row) => Math.max(maximum, row[column]?.length ?? 0), 0)
  ));

  return rows.map((row, rowIndex) => {
    const line = row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join(' | ').trimEnd();
    if (rowIndex !== 0) return line;
    const separator = widths.map((width) => '-'.repeat(width)).join('-+-');
    return `${line}\n${separator}`;
  }).join('\n');
}

/** Pure human-readable rendering used by the default CLI mode. */
export function formatHuman(metrics: readonly RunMetrics[]): string {
  return metrics.map((metric) => {
    const rows = [
      ['Metric', 'Value'],
      ['App-produced files', String(metric.appProduced)],
      ['Discovery by lane/status', formatCountMatrix(metric.discovery.byLaneStatus)],
      ['Discovery by provider/status', formatCountMatrix(metric.discovery.byProviderStatus)],
      ['Retained reference PNGs', String(metric.retainedReferenceImages)],
      ['Excluded discovery records', String(metric.excluded)],
      ['CSS files', String(metric.css.fileCount)],
      ['Dominant canvas background', metric.css.dominantCanvasBackground ?? '-'],
      ['Canvas exactly white', String(metric.css.canvasIsExactlyWhite)],
      ['Font-size px values', metric.css.fontSizePxValues.join(', ') || '-'],
      ['Font-size values < 12px', String(metric.css.smallFontSizeCount)],
      ['Max font-size px', metric.css.maxFontSizePx === null ? '-' : String(metric.css.maxFontSizePx)],
      ['Monospace font-family uses', String(metric.css.monospaceFontFamilyUsageCount)],
      ['Uppercase + positive letter-spacing', String(metric.css.uppercasePositiveLetterSpacingCount)],
      ['Border 1px declarations', String(metric.css.border1pxDeclarationCount)],
      ['Border-radius declarations', String(metric.css.borderRadiusDeclarationCount)],
    ];
    return `Run: ${metric.runDir}\n${formatTable(rows)}`;
  }).join('\n\n');
}

export function parseCliArgs(args: readonly string[]): { runDirs: string[]; json: boolean } {
  const unknownOption = args.find((arg) => arg.startsWith('-') && arg !== '--json');
  if (unknownOption !== undefined) throw new Error(`Unknown option: ${unknownOption}`);

  return {
    runDirs: args.filter((arg) => arg !== '--json'),
    json: args.includes('--json'),
  };
}

function main(args: readonly string[]): void {
  const options = parseCliArgs(args);
  if (options.runDirs.length === 0) {
    throw new Error('Usage: node scripts/omd-run-metrics.ts <run-dir>... [--json]');
  }

  const metrics = options.runDirs.map(collectRunMetrics);
  process.stdout.write(options.json ? `${JSON.stringify(metrics, null, 2)}\n` : `${formatHuman(metrics)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
