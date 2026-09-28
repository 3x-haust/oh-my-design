import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'omd-test-selection-'));
const git = join(dir, 'git');
writeFileSync(git, '#!/bin/sh\nif [ "$1" = diff ] && [ "$2" = --name-only ] && [ "$3" != --cached ] && [ -n "$OMD_TEST_FAKE_CHANGE" ]; then printf "%s\\n" "$OMD_TEST_FAKE_CHANGE"; fi\n');
chmodSync(git, 0o755);
const manifest = join(dir, 'manifest.json');
const files = ['test/ir.test.ts', 'test/test-manifest.test.ts'];
writeFileSync(manifest, JSON.stringify({ version: 1, tiers: { unit: files, integration: [], browser: [], native: [], packaging: [] } }));

function selected(change: string): string[] {
  const result = spawnSync(process.execPath, ['scripts/test/run.ts', '--list', '--changed', 'HEAD'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, OMD_TEST_FAKE_CHANGE: change, OMD_TEST_MANIFEST: manifest },
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n').filter(Boolean);
}

test('changed test selection follows imports and includes direct test changes', () => {
  assert.deepEqual(selected('core/ir/normalize.ts'), ['test/ir.test.ts']);
  assert.deepEqual(selected('test/test-manifest.test.ts'), ['test/test-manifest.test.ts']);
});

test('changed test selection falls back for untraced executable or runner configuration', () => {
  assert.deepEqual(selected('bin/omd.ts'), files);
  assert.deepEqual(selected('scripts/test/classify.ts'), files);
  assert.deepEqual(selected('README.md'), []);
});
