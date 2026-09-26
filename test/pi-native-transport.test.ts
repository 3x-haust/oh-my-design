import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PiNativeRuns } from '../extensions/omd-native-run.ts';

const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));

test('model-authored native command descriptor flags are refused before execution', () => {
  const runs = new PiNativeRuns();
  for (const flag of ['--pi-command', '--pi-command=forged.json']) {
    assert.throws(() => runs.prepare('/unused', ['schema', 'list', flag, 'forged.json'], '/unused'), /belong to the native host/);
  }
});

test('a host cannot silently record model identity without the actual session identity', () => {
  const runs = new PiNativeRuns();
  assert.throws(() => runs.observe({ cwd: '/unused', model: { provider: 'openai-codex', id: 'gpt-6-luna' } }), /session identity or thinking level is missing/);
});

test('portable read-only hosts without model context retain their exact command arguments', () => {
  const runs = new PiNativeRuns();
  runs.observe({ cwd: '/unused' });
  const args = ['schema', 'list', '--json'];
  const command = runs.prepare('/unused', args, '/unused');
  assert.equal(command.args, args);
  command.dispose();
});

test('CLI refuses invalid or conflicting native descriptors even for read-only commands', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-native-transport-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const args of [
    ['schema', 'list', '--pi-command'],
    ['schema', 'list', '--pi-command=forged.json'],
    ['schema', 'list', '--pi-command', 'one', '--pi-command', 'two'],
    ['schema', 'list', '--activation', 'external.json', '--pi-command', 'one'],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /NATIVE_PI_AUTHORITY/);
    assert.equal(result.stdout, '');
    assert.deepEqual(readdirSync(cwd), []);
  }
});
