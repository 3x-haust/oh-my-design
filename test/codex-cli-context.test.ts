import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { codexCliContext } from '../adapters/codex-cli-context.ts';

test('issuing CLI prefix survives shell metacharacters without consulting PATH', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-cli-context-'));
  try {
    const bin = join(root, "package space's $HOME `wrong`", 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'omd.ts'), 'console.log(JSON.stringify(process.argv.slice(2)))');
    const context = codexCliContext(join(bin, 'omd-codex.ts'));
    const prefix = context.split('\n')[1];
    const run = spawnSync('/bin/sh', ['-c', `${prefix} route show --json`], {
      env: { PATH: '/nonexistent' }, encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), ['route', 'show', '--json']);
    assert.match(context, /Do not use bare `omd`/);
    assert.match(context, /inherited OMD_ACTIVATION_PATH and role environment unchanged/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing issuing CLI fails instead of falling back to an installed package', () => {
  assert.throws(() => codexCliContext('/missing-omd-package/bin/omd-codex.ts'), /ENOENT/);
});
