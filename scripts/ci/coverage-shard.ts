#!/usr/bin/env node
// Match scripts/test/run.ts sharding over the combined unit + integration manifest.
import { readFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export function coverageShards(total: number): { total: number; files: string[] }[] {
  if (!Number.isInteger(total) || total < 1) throw new Error('invalid shard count');
  const { tiers } = JSON.parse(readFileSync('test/test-manifest.json', 'utf8')) as { tiers: { unit: string[]; integration: string[] } };
  const { files: timings } = JSON.parse(readFileSync('test/.timings.json', 'utf8')) as { files: Record<string, number> };
  const known = Object.values(timings).filter((duration) => Number.isFinite(duration) && duration > 0).sort((a, b) => a - b);
  const median = known.length === 0 ? 1 : known[Math.floor(known.length / 2)]!;
  const bins = Array.from({ length: total }, () => ({ total: 0, files: [] as string[] }));
  for (const file of [...tiers.unit, ...tiers.integration].sort((a, b) => (timings[b] ?? median) - (timings[a] ?? median) || a.localeCompare(b))) {
    const bin = bins.reduce((best, candidate) => candidate.total < best.total ? candidate : best);
    bin.files.push(file);
    bin.total += timings[file] ?? median;
  }
  return bins.map((bin) => ({ total: bin.total, files: bin.files.sort() }));
}

if (process.argv[1]?.endsWith('/coverage-shard.ts')) {
const [indexText, totalText] = process.argv.slice(2);
const index = Number(indexText);
const total = Number(totalText);
if (!Number.isInteger(index) || index < 1 || index > total) throw new Error('usage: node scripts/ci/coverage-shard.ts <index> <total>');
const selected = coverageShards(total)[index - 1]!;
const files = selected.files;
if (!files.length) throw new Error(`empty coverage shard ${index}/${total}`);
console.log(`==> coverage shard ${index}/${total}: ${files.length} files, estimated ${selected.total.toFixed(1)}s`);
mkdirSync('coverage', { recursive: true });
const result = spawnSync(process.execPath, [
  '--test', '--test-concurrency=2', '--experimental-test-coverage',
  '--test-coverage-include=core/**', '--test-coverage-include=bin/**', '--test-coverage-include=adapters/**',
  '--test-coverage-include=extensions/**', '--test-coverage-include=scripts/**',
  '--test-coverage-exclude=test/**', '--test-coverage-exclude=dist/**', '--test-coverage-exclude=node_modules/**',
  '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=lcov', '--test-reporter-destination=coverage/lcov.info',
  '--test-reporter=junit', '--test-reporter-destination=coverage/junit.xml', ...files,
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
}
