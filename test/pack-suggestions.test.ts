import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

test('a guessed pack name that does not exist suggests the files that cover it', () => {
  const run = spawnSync(process.execPath, [BIN, 'pack', 'protocol/native-pi-finish.md'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /pack file not found/);
  assert.match(run.stderr, /files that cover it: .*protocol\/native-pi-completion\.md/);
});

test('an unrelated missing name gets no misleading suggestion', () => {
  const run = spawnSync(process.execPath, [BIN, 'pack', 'theory/zzqx-unknown.md'], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.doesNotMatch(run.stderr, /files that cover it/);
});
