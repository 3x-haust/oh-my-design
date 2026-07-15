import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `omd render --proofs` renders all four sketch/craft proofs (fixed + full-page, desktop + mobile)
// over ONE browser launch instead of four — the render-heavy sketch/craft steps' speed lever.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const SLOP = fileURLToPath(new URL('./fixtures/slop.html', import.meta.url));

test('omd render --proofs writes the four proofs from one command', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-proofs-'));
  const prefix = join(dir, 'proof');
  const result = spawnSync(process.execPath, [CLI, 'render', SLOP, '--proofs', '-o', prefix], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const expected = ['proof-desktop.png', 'proof-mobile.png', 'proof-desktop-full.png', 'proof-mobile-full.png'];
  for (const name of expected) {
    const path = join(dir, name);
    assert.ok(existsSync(path), `${name} was rendered`);
    assert.ok(statSync(path).size > 0, `${name} is a real image`);
  }
  // The stdout lists every written proof path.
  for (const name of expected) assert.match(result.stdout, new RegExp(name.replace('.', '\\.')));
});
