import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

test('first-render check refuses a URL page and says to measure the local build', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-first-render-cli-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const page of ['http://127.0.0.1:4216', 'https://example.com/']) {
    const run = spawnSync(process.execPath, [BIN, 'first-render', 'check', '--page', page], { cwd, encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /FIRST_RENDER_LOCAL_BUILD: .*dist\/index\.html/);
  }
  // A local file path is not refused by this rule; it proceeds to the activation check instead.
  const local = spawnSync(process.execPath, [BIN, 'first-render', 'check', '--page', 'dist/index.html'], { cwd, encoding: 'utf8' });
  assert.doesNotMatch(local.stderr, /FIRST_RENDER_LOCAL_BUILD/);
});

test('omd render --help lists the render modes, including --graphic', () => {
  const run = spawnSync(process.execPath, [BIN, 'render', '--help'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /--graphic \[--selector css\] \[--transparent\]/);
  assert.match(run.stdout, /--motion/);
});
