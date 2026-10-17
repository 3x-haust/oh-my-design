import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('the retired art-direction command cannot mutate model-led source or records', t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-native-art-direction-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'input.json'), '{}');
  writeFileSync(join(root, 'index.html'), 'unchanged source');
  const cli = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
  const result = spawnSync(process.execPath, [cli, 'art-direction', 'check', '--input', 'input.json', '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}\n${result.stderr}`, /unknown command art-direction/i);
  assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), 'unchanged source');
  assert.equal(existsSync(join(root, '.omd/art-direction.json')), false);
});
