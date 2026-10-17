import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { runNativeVerification } from '../bin/native-verification-command.ts';
import { modelLedFixture } from './helpers/model-led.ts';

test('native verification runs the existing build script without a generic execution tool', async t => {
  const f = modelLedFixture(t);
  writeFileSync(join(f.root, 'package.json'), JSON.stringify({
    private: true, scripts: { build: 'node --version' },
  }));
  const result = await runNativeVerification({ ...f, command: 'build' });
  assert.deepEqual(result.command, ['npm', 'run', 'build']);
  assert.equal(result.code, 0);
  assert.equal(result.killed, false);
  assert.match(result.stdout, /v\d+\.\d+\.\d+/);
  assert.equal(result.meaning, 'execution-not-completion');
  assert.equal(existsSync(join(f.root, '.omd/final-evidence-v2.json')), false);
});

test('native verification preserves failing command output and exit code', async t => {
  const f = modelLedFixture(t);
  writeFileSync(join(f.root, 'package.json'), JSON.stringify({
    private: true, scripts: { test: 'node -e "console.error(12345);process.exit(7)"' },
  }));
  const result = await runNativeVerification({ ...f, command: 'test' });
  assert.equal(result.code, 7);
  assert.match(result.stderr, /12345/);
  assert.equal(existsSync(join(f.root, '.omd/final-evidence-v2.json')), false);
});

test('native verification preserves other projects browser installations without changing the host environment', async t => {
  const f = modelLedFixture(t);
  writeFileSync(join(f.root, 'package.json'), JSON.stringify({
    private: true, scripts: { build: 'node -p "JSON.stringify({skip:process.env.PLAYWRIGHT_SKIP_BROWSER_GC,path:!!process.env.PATH})"' },
  }));
  const previous = process.env.PLAYWRIGHT_SKIP_BROWSER_GC;
  process.env.PLAYWRIGHT_SKIP_BROWSER_GC = '0';
  try {
    const result = await runNativeVerification({ ...f, command: 'build' });
    assert.equal(result.code, 0);
    assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)!), { skip: '1', path: true });
    assert.equal(process.env.PLAYWRIGHT_SKIP_BROWSER_GC, '0');
  } finally {
    if (previous === undefined) delete process.env.PLAYWRIGHT_SKIP_BROWSER_GC;
    else process.env.PLAYWRIGHT_SKIP_BROWSER_GC = previous;
  }
});

test('verification refuses arbitrary commands and missing readiness before executing scripts', async t => {
  const f = modelLedFixture(t);
  const marker = join(f.root, 'unexpected-write');
  writeFileSync(join(f.root, 'package.json'), JSON.stringify({
    private: true, scripts: { build: 'node -e "require(\'node:fs\').writeFileSync(\'unexpected-write\',\'bad\')"' },
  }));
  const source = readFileSync(join(f.root, 'src/copy/confirmation.ts'));
  for (const command of ['build && touch unexpected-write', 'dev', 'exec', 'install --force', 'build\nnode x']) {
    await assert.rejects(runNativeVerification({ ...f, command }), /NATIVE_VERIFICATION_COMMAND_INVALID/);
  }
  rmSync(join(f.root, '.omd/route.json'));
  await assert.rejects(runNativeVerification({ ...f, command: 'build' }), /NATIVE_VERIFICATION_NOT_READY/);
  assert.equal(existsSync(marker), false);
  assert.deepEqual(readFileSync(join(f.root, 'src/copy/confirmation.ts')), source);
});

test('verification respects cancellation before any package script starts', async t => {
  const f = modelLedFixture(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runNativeVerification({ ...f, command: 'build', signal: controller.signal }),
    /NATIVE_VERIFICATION_CANCELLED/);
});
