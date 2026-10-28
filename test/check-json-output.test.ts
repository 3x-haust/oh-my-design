import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { normalize } from '../core/ir/normalize.ts';
import { check, loadRules } from '../core/rules/engine.ts';
import type { RawIr } from '../core/types.ts';

test('failed check JSON flushes the complete warning array before exiting', t => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-check-json-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const ir: RawIr = { nodes: Array.from({ length: 80 }, (_, index) => ({
    id: `n${index}`, name: 'button', type: 'FRAME', parent: null,
    path: `body/button-${index}-${'target'.repeat(300)}`, children: [],
    box: { x: 0, y: 0, w: 8, h: 8 }, interactive: true,
  })) };
  const input = join(directory, 'input.json');
  writeFileSync(input, JSON.stringify(ir));
  const root = fileURLToPath(new URL('..', import.meta.url));
  const expected = JSON.stringify(check(normalize(ir), loadRules(join(root, 'core/rules/builtin')),
    { layers: [1], categories: ['a11y'] }));
  assert.ok(Buffer.byteLength(expected) > 65_536);
  const result = spawnSync(process.execPath, [
    '--import', import.meta.resolve('tsx'), join(root, 'bin/omd.ts'), 'check', '--ir', input,
    '--category', 'a11y', '--layer', '1', '--json', '--no-log',
  ], { cwd: directory, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), JSON.parse(expected));
});
