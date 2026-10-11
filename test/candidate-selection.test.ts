import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

test('candidate select publishes a validated current pointer through the guarded CLI', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-candidate-selection-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, '.omd', '.cache', 'sketches', 'causal-workbench');
  mkdirSync(directory, { recursive: true });
  for (const name of ['index.html', 'noun-swap-test.json', 'selection.json', 'ux-models.json']) {
    writeFileSync(join(directory, name), `${name}\n`);
  }
  const pointer = {
    schema: 'candidate-selection-pointer-v1',
    directory: 'causal-workbench',
    indexSha256: sha256('index.html\n'),
    selectionSha256: sha256('selection.json\n'),
  };
  const input = join(root, 'candidate-pointer.json');
  writeFileSync(input, JSON.stringify(pointer));

  const result = spawnSync(
    process.execPath,
    [CLI, 'candidate', 'select', '--input', input, '--json'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    path: '.omd/.cache/sketches/current.json',
    directory: 'causal-workbench',
  });
  const published = JSON.parse(readFileSync(join(root, '.omd', '.cache', 'sketches', 'current.json'), 'utf8'));
  assert.equal(published.schema, 'candidate-selection-pointer-v2');
  assert.equal(published.directory, pointer.directory);
  assert.equal(published.indexSha256, pointer.indexSha256);
  assert.equal(published.selectionSha256, pointer.selectionSha256);
  assert.equal(published.visual.renders.length, 2);
  const current = join(root, '.omd', '.cache', 'sketches', 'current.json');
  const before = readFileSync(current);
  writeFileSync(input, JSON.stringify({ ...pointer, indexSha256: '0'.repeat(64) }));
  const refused = spawnSync(process.execPath, [CLI, 'candidate', 'select', '--input', input, '--json'],
    { cwd: root, encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /CANDIDATE_SELECTION_STALE/);
  assert.deepEqual(readFileSync(current), before);
});
