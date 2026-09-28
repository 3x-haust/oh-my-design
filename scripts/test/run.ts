#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cpus } from 'node:os';

const ROOT = process.cwd();
const TIER_ORDER = ['unit', 'integration', 'browser', 'native', 'packaging'] as const;
type Tier = (typeof TIER_ORDER)[number];
type Manifest = { readonly version: number; readonly tiers: Readonly<Record<Tier, readonly string[]>> };
type Timings = { readonly files?: Readonly<Record<string, number>> };
type Options = {
  tiers: Tier[];
  shard?: { index: number; total: number };
  concurrency?: number;
  reporters: string[];
  changed?: string;
  coverage: boolean;
  list: boolean;
};

function fail(message: string): never {
  console.error(`test runner: ${message}`);
  process.exit(2);
}

function parseTierList(value: string): Tier[] {
  const values = value.split(',').filter(Boolean);
  for (const value of values) if (!TIER_ORDER.includes(value as Tier)) fail(`unknown tier '${value}'`);
  return TIER_ORDER.filter((tier) => values.includes(tier));
}

function parseArguments(argv: string[]): Options {
  const options: Options = { tiers: [...TIER_ORDER], reporters: [], coverage: false, list: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const value = argv[index + 1];
    if (argument === '--tier') {
      if (value === undefined) fail('--tier requires a comma-separated value');
      options.tiers = parseTierList(value);
      index += 1;
    } else if (argument === '--shard') {
      if (value === undefined || !/^\d+\/\d+$/.test(value)) fail('--shard requires i/n');
      const [shardIndex, total] = value.split('/').map(Number) as [number, number];
      if (shardIndex < 1 || shardIndex > total || total < 1) fail('--shard index must be between 1 and n');
      options.shard = { index: shardIndex, total };
      index += 1;
    } else if (argument === '--concurrency') {
      if (value === undefined || !/^\d+$/.test(value) || Number(value) < 1) fail('--concurrency requires a positive integer');
      options.concurrency = Number(value);
      index += 1;
    } else if (argument === '--reporter') {
      if (value === undefined) fail('--reporter requires a reporter or reporter:destination');
      options.reporters.push(value);
      index += 1;
    } else if (argument === '--changed') {
      options.changed = value !== undefined && !value.startsWith('--') ? value : 'origin/main';
      if (options.changed === value) index += 1;
    } else if (argument === '--coverage') {
      options.coverage = true;
    } else if (argument === '--list') {
      options.list = true;
    } else if (argument === '--help' || argument === '-h') {
      console.log('Usage: node scripts/test/run.ts [--tier unit,integration,browser,native,packaging] [--shard i/n] [--concurrency n] [--reporter spec] [--reporter junit:path] [--changed [base]] [--coverage] [--list]');
      process.exit(0);
    } else {
      fail(`unknown argument '${argument}'`);
    }
  }
  if (options.tiers.length === 0) fail('at least one tier is required');
  return options;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

function latestMtime(paths: readonly string[]): number {
  return paths.reduce((latest, path) => Math.max(latest, statSync(path).mtimeMs), 0);
}

function oldestMtime(paths: readonly string[]): number {
  return paths.reduce((oldest, path) => Math.min(oldest, statSync(path).mtimeMs), Number.POSITIVE_INFINITY);
}

function distIsStale(): boolean {
  const inputDirectories = ['src', 'adapters', 'core/theory', 'core/protocol', 'core/motion', 'core/composition', 'core/graphics', 'core/craft'];
  const inputs = inputDirectories.flatMap((directory) => sourceFiles(join(ROOT, directory)))
    .filter((file) => ['.ts', '.yaml', '.md', '.json'].includes(extname(file)));
  if (existsSync(join(ROOT, 'package.json'))) inputs.push(join(ROOT, 'package.json'));
  const outputDirectories = ['dist', 'agents', 'skills'];
  if (outputDirectories.some((directory) => !existsSync(join(ROOT, directory)))) return true;
  const outputs = outputDirectories.flatMap((directory) => sourceFiles(join(ROOT, directory)));
  return outputs.length === 0 || latestMtime(inputs) > oldestMtime(outputs);
}

function runBuild(): void {
  console.log('==> build (packaging or stale generated output)');
  const result = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function gitChanged(base: string): Set<string> {
  let result = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0 && base === 'origin/main') result = spawnSync('git', ['diff', '--name-only', 'HEAD~1'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) fail(`cannot diff changed files from '${base}'`);
  const changed = result.stdout.split('\n').filter(Boolean);
  for (const args of [
    ['diff', '--name-only'],
    ['diff', '--name-only', '--cached'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    const working = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
    if (working.status === 0) changed.push(...working.stdout.split('\n').filter(Boolean));
  }
  return new Set(changed.map((file) => normalize(file)));
}

const IMPORT_PATTERN = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
function importsFor(file: string): string[] {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const imports: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2];
    if (specifier?.startsWith('.')) imports.push(specifier);
  }
  return imports;
}

function resolveImport(importer: string, specifier: string): string | undefined {
  const candidate = normalize(relative(ROOT, resolve(ROOT, dirname(importer), specifier)));
  const alternatives = [candidate, `${candidate}.ts`, `${candidate}.mjs`, join(candidate, 'index.ts')];
  return alternatives.find((path) => existsSync(join(ROOT, path)));
}

function affectedTests(files: readonly string[], base: string): string[] {
  const changed = gitChanged(base);
  // Runner/build configuration affects the entire suite, not just its direct importers.
  if ([...changed].some((file) => file === 'package.json' || file === 'package-lock.json' || file === 'tsconfig.json' || file === 'test/test-manifest.json' || file.startsWith('scripts/test/') || file.startsWith('adapters/build.ts'))) return [...files];
  const memo = new Map<string, boolean>();
  const visited = new Set<string>();
  function reachesChanged(file: string, visiting = new Set<string>()): boolean {
    const cached = memo.get(file);
    if (cached !== undefined) return cached;
    visited.add(file);
    if (changed.has(file)) return true;
    if (visiting.has(file) || !existsSync(join(ROOT, file))) return false;
    const nextVisiting = new Set(visiting).add(file);
    const affected = importsFor(file).map((specifier) => {
      const dependency = resolveImport(file, specifier);
      return dependency !== undefined && reachesChanged(dependency, nextVisiting);
    }).some(Boolean);
    memo.set(file, affected);
    return affected;
  }
  const affected = files.filter((file) => reachesChanged(file));
  // Static assets, scripts invoked through a CLI, and generated inputs are not import edges.
  // A changed executable source file with no traced importer needs the full suite.
  if ([...changed].some((file) => /\.(?:ts|mjs|js|yaml|json)$/.test(file) && !file.startsWith('.omo/') && !visited.has(file))) return [...files];
  return affected;
}

function shard(files: readonly string[], request: { index: number; total: number }, timings: Timings): string[] {
  const known = Object.values(timings.files ?? {}).filter((duration) => Number.isFinite(duration) && duration > 0).sort((a, b) => a - b);
  const median = known.length === 0 ? 1 : known[Math.floor(known.length / 2)]!;
  const bins = Array.from({ length: request.total }, () => ({ total: 0, files: [] as string[] }));
  for (const file of [...files].sort((left, right) => ((timings.files?.[right] ?? median) - (timings.files?.[left] ?? median)) || left.localeCompare(right))) {
    const bin = bins.reduce((best, candidate) => candidate.total < best.total ? candidate : best);
    bin.files.push(file);
    bin.total += timings.files?.[file] ?? median;
  }
  const selected = bins[request.index - 1]!;
  console.log(`==> shard ${request.index}/${request.total}: ${selected.files.length} files, estimated ${selected.total.toFixed(1)}s`);
  return selected.files.sort();
}

function defaultConcurrency(tier: Tier): number {
  if (tier === 'native') return 1;
  // Browser workers launch multiple Chromium processes; leave room for those children.
  if (tier === 'browser') return Math.min(4, Math.max(2, Math.floor(cpus().length / 2)));
  return Math.min(4, Math.max(2, cpus().length - 2));
}

function reporterArguments(reporters: readonly string[]): string[] {
  const configured = reporters.length === 0 ? ['spec'] : reporters;
  return configured.flatMap((entry) => {
    const separator = entry.indexOf(':');
    const reporter = separator === -1 ? entry : entry.slice(0, separator);
    const destination = separator === -1 ? 'stdout' : entry.slice(separator + 1);
    if (!reporter || !destination) fail(`invalid reporter '${entry}'`);
    if (destination !== 'stdout' && destination !== 'stderr') mkdirSync(dirname(resolve(ROOT, destination)), { recursive: true });
    return [`--test-reporter=${reporter}`, `--test-reporter-destination=${destination}`];
  });
}

const COVERAGE_THRESHOLDS = { lines: 59, branches: 72, functions: 65 } as const;

function executeTests(label: string, files: readonly string[], concurrency: number, options: Options, extraArguments: readonly string[] = []): number {
  if (files.length === 0) {
    console.log(`==> ${label}: no matching tests`);
    return 0;
  }
  const args = ['--test', `--test-concurrency=${concurrency}`, ...extraArguments, ...reporterArguments(options.reporters), ...files];
  console.log(`==> ${label}: ${files.length} files, concurrency ${concurrency}`);
  const result = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runTier(tier: Tier, files: readonly string[], options: Options): void {
  const status = executeTests(tier, files, options.concurrency ?? defaultConcurrency(tier), options);
  if (status !== 0) process.exit(status);
}

function validateLcovReporters(reporters: readonly string[]): void {
  for (const reporter of reporters) {
    if (!reporter.startsWith('lcov:')) continue;
    const destination = reporter.slice('lcov:'.length);
    const path = resolve(ROOT, destination);
    if (!existsSync(path)) fail(`lcov reporter did not create ${destination}`);
    const lcov = readFileSync(path, 'utf8');
    if (!lcov.startsWith('TN:\n') || !lcov.includes('\nSF:') || !lcov.includes('\nend_of_record\n')) {
      fail(`lcov reporter created an invalid or empty report at ${destination}`);
    }
    const totals: Record<keyof typeof COVERAGE_THRESHOLDS, [number, number]> = {
      lines: [0, 0], branches: [0, 0], functions: [0, 0],
    };
    for (const line of lcov.split('\n')) {
      const value = Number(line.slice(line.indexOf(':') + 1));
      if (!Number.isFinite(value)) continue;
      if (line.startsWith('LH:')) totals.lines[0] += value;
      else if (line.startsWith('LF:')) totals.lines[1] += value;
      else if (line.startsWith('BRH:')) totals.branches[0] += value;
      else if (line.startsWith('BRF:')) totals.branches[1] += value;
      else if (line.startsWith('FNH:')) totals.functions[0] += value;
      else if (line.startsWith('FNF:')) totals.functions[1] += value;
    }
    for (const metric of Object.keys(COVERAGE_THRESHOLDS) as Array<keyof typeof COVERAGE_THRESHOLDS>) {
      const [covered, found] = totals[metric];
      if (found === 0) fail(`lcov report has no ${metric} at ${destination}`);
      const percent = 100 * covered / found;
      console.log(`==> lcov ${metric}: ${percent.toFixed(2)}% (${covered}/${found}), threshold ${COVERAGE_THRESHOLDS[metric]}%`);
      if (percent < COVERAGE_THRESHOLDS[metric]) fail(`lcov ${metric} coverage ${percent.toFixed(2)}% is below ${COVERAGE_THRESHOLDS[metric]}%`);
    }
  }
}

function runCoverage(tiers: readonly Tier[], filesByTier: ReadonlyMap<Tier, readonly string[]>, options: Options): void {
  const unsupported = tiers.filter((tier) => tier !== 'unit' && tier !== 'integration');
  if (unsupported.length > 0) fail(`coverage supports only unit and integration tiers, not ${unsupported.join(', ')}`);
  const selectedTiers = tiers.filter((tier) => (filesByTier.get(tier)?.length ?? 0) > 0);
  if (selectedTiers.length === 0) {
    console.log('==> coverage: no matching tests');
    return;
  }
  const files = selectedTiers.flatMap((tier) => filesByTier.get(tier) ?? []);
  const concurrency = options.concurrency ?? Math.min(...selectedTiers.map(defaultConcurrency));
  const identity = selectedTiers.map((tier) => `${tier}=${filesByTier.get(tier)?.length ?? 0}`).join(', ');
  const coverageArguments = [
    '--experimental-test-coverage',
    '--test-coverage-include=core/**', '--test-coverage-include=bin/**', '--test-coverage-include=adapters/**',
    '--test-coverage-include=extensions/**', '--test-coverage-include=scripts/**',
    '--test-coverage-exclude=test/**', '--test-coverage-exclude=dist/**', '--test-coverage-exclude=node_modules/**',
    `--test-coverage-lines=${COVERAGE_THRESHOLDS.lines}`,
    `--test-coverage-branches=${COVERAGE_THRESHOLDS.branches}`,
    `--test-coverage-functions=${COVERAGE_THRESHOLDS.functions}`,
  ];
  const status = executeTests(`coverage (${identity})`, files, concurrency, options, coverageArguments);
  validateLcovReporters(options.reporters);
  if (status !== 0) process.exit(status);
}

const options = parseArguments(process.argv.slice(2));
const manifestPath = process.env.OMD_TEST_MANIFEST ?? join(ROOT, 'test/test-manifest.json');
const timingsPath = process.env.OMD_TEST_TIMINGS ?? join(ROOT, 'test/.timings.json');
const manifest = loadJson<Manifest>(manifestPath);
const timings = existsSync(timingsPath) ? loadJson<Timings>(timingsPath) : {};
if (!options.list && (options.tiers.includes('packaging') || distIsStale())) runBuild();
let selected = options.tiers.flatMap((tier) => manifest.tiers[tier]);
if (options.changed !== undefined) selected = affectedTests(selected, options.changed);
if (options.shard !== undefined) selected = shard(selected, options.shard, timings);
if (options.list) {
  console.log(selected.join('\n'));
  process.exit(0);
}
const selectedSet = new Set(selected);
const filesByTier = new Map<Tier, readonly string[]>(options.tiers.map((tier) => [
  tier,
  manifest.tiers[tier].filter((file) => selectedSet.has(file)),
]));
if (options.coverage) {
  runCoverage(options.tiers, filesByTier, options);
} else {
  for (const tier of options.tiers) runTier(tier, filesByTier.get(tier) ?? [], options);
}
