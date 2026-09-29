#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Readable, type Transform } from 'node:stream';

type CoverageTotals = {
  totalLineCount: number;
  totalBranchCount: number;
  totalFunctionCount: number;
  coveredLineCount: number;
  coveredBranchCount: number;
  coveredFunctionCount: number;
};
type CoverageSummary = { totals: CoverageTotals; files: readonly unknown[]; workingDirectory: string };
type CoverageReader = { summary(): CoverageSummary };

// CI pins Node 24.11.0. Its own coverage collector preserves range identity and
// source-map handling; LCOV's line/ordinal branch IDs cannot be merged faithfully.
const thresholds = { Lines: 59, Branches: 72, Functions: 65 } as const;

export async function mergeCoverage(directories: readonly string[], cwd = process.cwd()): Promise<{ lcov: string; summary: string }> {
  if (directories.length === 0) throw new Error('at least one raw V8 coverage shard is required');
  const require = createRequire(import.meta.url);
  const { TestCoverage }: { TestCoverage: new (directory: string, original: undefined, options: object) => CoverageReader } =
    require('internal/test_runner/coverage');
  const LcovReporter: new () => Transform = require('internal/test_runner/reporter/lcov');
  const combined = mkdtempSync(join(tmpdir(), 'omd-coverage-merge-'));
  try {
    let index = 0;
    for (const directory of directories) {
      if (!existsSync(directory)) throw new Error(`missing coverage shard: ${directory}`);
      const files = readdirSync(directory).filter((name) => /^coverage-\d+-\d{13}-\d+\.json$/.test(name));
      if (files.length === 0) throw new Error(`empty raw V8 coverage shard: ${directory}`);
      for (const file of files) {
        const path = resolve(directory, file);
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
        if (!parsed || typeof parsed !== 'object' || !('result' in parsed) || !Array.isArray(parsed.result)) {
          throw new Error(`invalid raw V8 coverage: ${path}`);
        }
        symlinkSync(path, join(combined, `coverage-${++index}-0000000000000-0.json`));
      }
    }
    const coverage = new TestCoverage(combined, undefined, {
      cwd,
      sourceMaps: true,
      coverageIncludeGlobs: ['core/**', 'bin/**', 'adapters/**', 'extensions/**', 'scripts/**'],
      coverageExcludeGlobs: ['test/**', 'dist/**', 'node_modules/**'],
    }).summary();
    const rows = [
      { metric: 'Lines', covered: coverage.totals.coveredLineCount, found: coverage.totals.totalLineCount },
      { metric: 'Branches', covered: coverage.totals.coveredBranchCount, found: coverage.totals.totalBranchCount },
      { metric: 'Functions', covered: coverage.totals.coveredFunctionCount, found: coverage.totals.totalFunctionCount },
    ] as const;
    if (coverage.files.length === 0 || rows.some(({ found }) => found === 0)) throw new Error('raw V8 coverage has no instrumented source');
    const summary = ['## Coverage', '', '| Metric | Covered | Total | Percent | Threshold |', '|---|---:|---:|---:|---:|',
      ...rows.map(({ metric, covered, found }) =>
        `| ${metric} | ${covered} | ${found} | ${(100 * covered / found).toFixed(2)}% | ${thresholds[metric]}% |`), ''].join('\n');
    for (const { metric, covered, found } of rows) {
      if (100 * covered / found < thresholds[metric]) throw new Error(`${metric} coverage ${(100 * covered / found).toFixed(2)}% is below ${thresholds[metric]}%`);
    }
    const reporter = Readable.from([{ type: 'test:coverage', data: { summary: coverage } }]).pipe(new LcovReporter());
    const chunks: string[] = [];
    for await (const chunk of reporter) chunks.push(String(chunk));
    return { lcov: chunks.join(''), summary };
  } finally {
    rmSync(combined, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('/merge-coverage.ts')) {
  try {
    const { lcov, summary } = await mergeCoverage(process.argv.slice(2));
    mkdirSync('coverage', { recursive: true });
    writeFileSync('coverage/lcov.info', lcov);
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
