import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coverageShards } from '../scripts/ci/coverage-shard.ts';

test('coverage shards partition every unit and integration manifest entry', () => {
  const { tiers } = JSON.parse(readFileSync('test/test-manifest.json', 'utf8')) as { tiers: { unit: string[]; integration: string[] } };
  const expected = [...tiers.unit, ...tiers.integration].sort();
  const shards = coverageShards(4);
  const selected = shards.flatMap((shard) => shard.files).sort();
  assert.equal(shards.length, 4);
  assert.equal(new Set(selected).size, expected.length);
  assert.deepEqual(selected, expected);
});

test('raw V8 coverage keeps opposite hits and rejects incomplete shard reports', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-coverage-'));
  try {
    mkdirSync(join(directory, 'core'));
    writeFileSync(join(directory, 'core', 'lib.mjs'), 'export function pick(value) { return value ? "yes" : "no"; }\n');
    for (const [name, value] of [['first', 'true'], ['second', 'false']]) {
      writeFileSync(join(directory, `${name}.test.mjs`),
        `import { test } from 'node:test';\nimport { pick } from './core/lib.mjs';\ntest('pick', () => { pick(${value}); });\n`);
    }
    const run = (name: string, files: string[]) => {
      const raw = join(directory, name);
      mkdirSync(raw);
      const env: NodeJS.ProcessEnv = { ...process.env, NODE_V8_COVERAGE: raw };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, [
        '--test', '--experimental-test-coverage', '--test-coverage-include=core/**',
        '--test-reporter=spec', '--test-reporter-destination=stdout',
        '--test-reporter=lcov', `--test-reporter-destination=${join(raw, 'report.info')}`, ...files,
      ], { cwd: directory, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.ok(existsSync(join(raw, 'report.info')), `${result.stdout}\n${result.stderr}\n${readdirSync(raw)}`);
      return raw;
    };
    const first = run('first-raw', ['first.test.mjs']);
    const second = run('second-raw', ['second.test.mjs']);
    const full = run('full-raw', ['first.test.mjs', 'second.test.mjs']);
    const expected = readFileSync(join(full, 'report.info'), 'utf8');
    const merge = (shards: string[]) => spawnSync(process.execPath,
      ['--expose-internals', join(process.cwd(), 'scripts/ci/merge-coverage.ts'), ...shards],
      { cwd: directory, encoding: 'utf8' });
    const merged = merge([first, second]);
    assert.equal(merged.status, 0, merged.stderr);
    const lcov = readFileSync(join(directory, 'coverage', 'lcov.info'), 'utf8');
    assert.match(lcov, /BRDA:1,0,0,[1-9]\d*\nBRDA:1,1,0,[1-9]\d*/);
    assert.match(expected, /BRH:1/);
    assert.match(lcov, /FNDA:2,pick/);
    assert.match(merged.stdout, /\| Branches \| \d+ \| \d+ \| 100\.00%/);
    const missing = merge([first, join(directory, 'missing-raw')]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /missing coverage shard/);
    writeFileSync(join(first, 'coverage-9-0000000000000-0.json'), '{"result":');
    const corrupt = merge([first, second]);
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /JSON|coverage/i);
    writeFileSync(join(directory, 'core', 'lib.mjs'),
      'export function pick(value) { return value ? "yes" : "no"; }\n'
      + 'export function unusedA() { return 1; }\n'
      + 'export function unusedB() { return 2; }\n');
    const low = run('low-raw', ['first.test.mjs']);
    const belowThreshold = merge([low]);
    assert.notEqual(belowThreshold.status, 0);
    assert.match(belowThreshold.stderr, /coverage .* is below/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
