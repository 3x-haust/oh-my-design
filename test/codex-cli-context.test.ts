import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { codexCliContext } from '../adapters/codex-cli-context.ts';
import { brokeredBrowserOperationNames, isBrokeredBrowserCliOperation } from '../core/runtime/codex-browser-operation.ts';
import { loadRoleProfile } from '../core/brief/profiles.ts';

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
    assert.doesNotMatch(context, /health check uses the installer/);
    writeFileSync(join(bin, 'omd-install.ts'), 'console.log(JSON.stringify(process.argv.slice(2)))');
    const healthContext = codexCliContext(join(bin, 'omd-codex.ts'));
    assert.match(healthContext, /health check uses the installer entry point, not an `omd browser` subcommand/);
    const health = spawnSync('/bin/sh', ['-c', healthContext.split('\n').at(-1)!], {
      env: { PATH: '/nonexistent' }, encoding: 'utf8',
    });
    assert.equal(health.status, 0, health.stderr);
    assert.deepEqual(JSON.parse(health.stdout), ['browser', 'doctor', '--json']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing issuing CLI fails instead of falling back to an installed package', () => {
  assert.throws(() => codexCliContext('/missing-omd-package/bin/omd-codex.ts'), /ENOENT/);
});

test('research and type roles discover their brokered browser path without receiving production permissions', () => {
  const cli = new URL('../bin/omd.ts', import.meta.url).pathname;
  assert.ok(brokeredBrowserOperationNames('omd-scout').includes('ref browse'));
  assert.deepEqual(brokeredBrowserOperationNames('omd-typesetter'), ['ir', 'render', 'measure']);
  assert.deepEqual(brokeredBrowserOperationNames('omd-hand', 'source'), []);
  assert.equal(isBrokeredBrowserCliOperation('omd-hand', ['measure'], 'observer'), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-sketch', ['render'], 'visual-study'), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-sketch', ['render'], 'unknown'), false);
  const profile = loadRoleProfile('omd-hand', 'observer');
  const context = codexCliContext(cli, process.execPath, 'omd-hand', 'observer');
  assert.ok(context.includes(profile.source));
  assert.ok(context.includes(profile.sha256));
  assert.ok(!context.includes(loadRoleProfile('omd-hand', 'source').source));
  assert.throws(() => codexCliContext(cli, process.execPath, 'omd-hand', 'unknown'));
});
