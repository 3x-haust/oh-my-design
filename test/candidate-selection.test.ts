import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

test('candidate select publishes a validated current pointer through the guarded CLI', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-candidate-selection-'));
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
  assert.deepEqual(
    JSON.parse(readFileSync(join(root, '.omd', '.cache', 'sketches', 'current.json'), 'utf8')),
    pointer,
  );
});
