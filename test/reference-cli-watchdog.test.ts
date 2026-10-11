import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn as requireSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { runOwnedOmdProcess, type OwnedExecDependencies } from '../extensions/omd-process.ts';
import assert from 'node:assert/strict';
import { omdCliBudgetMs, runOmd, OmdCancelledError, OmdTimeoutError, formatOmdProgress, type PortablePiApi } from '../extensions/omd-runtime.ts';

test('browser acquisitions use the shorter ceiling while other commands retain the longer ceiling', () => {
  for (const action of ['advance', 'navigate', 'add', 'add-batch', 'discover-batch', 'search'])
    assert.equal(omdCliBudgetMs(['ref', action]), 300_000);
  assert.equal(omdCliBudgetMs(['ref', 'work-next']), 600_000);
  assert.equal(omdCliBudgetMs(['guard', 'production']), 600_000);
});

test('user cancellation aborts an in-flight command independently of its watchdog', async () => {
  const controller = new AbortController();
  let started!: (signal: AbortSignal | undefined) => void;
  const ready = new Promise<AbortSignal | undefined>(resolve => { started = resolve; });
  const pi = { registerTool: () => undefined, registerCommand: () => undefined,
    execOwned: async (_command: string, _args: readonly string[], options: { signal?: AbortSignal }) => {
    started(options.signal);
    return new Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>(() => undefined);
  }, exec: async () => { throw new Error('Pi exec must not be used'); } } as PortablePiApi;
  const running = runOmd(pi, ['ref', 'search'], '/tmp', controller.signal);
  const childSignal = await ready;
  assert.equal(childSignal?.aborted, false);
  controller.abort();
  await assert.rejects(running, OmdCancelledError);
  assert.equal(childSignal?.aborted, true);
});

test('watchdog expiry aborts the owned runner and settles with OmdTimeoutError, not cancellation', async () => {
  let expire!: () => void;
  let finishTeardown!: () => void;
  let childSignal!: AbortSignal;
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const pi = {
    registerTool: () => undefined, registerCommand: () => undefined,
    exec: async () => { throw new Error('Pi exec must not be used'); },
    execOwned: async (_command: string, _args: readonly string[], options: { signal?: AbortSignal }) => {
      childSignal = options.signal!;
      started();
      return new Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>(() => undefined);
    },
  } as PortablePiApi;
  const clock = {
    setTimeout: ((callback: () => void, delay: number) => {
      if (delay === 300_000) expire = callback;
      else { assert.equal(delay, 3_000); finishTeardown = callback; }
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimeout: (() => undefined) as typeof clearTimeout,
  };
  const running = runOmd(pi, ['ref', 'advance'], '/tmp', undefined, undefined, undefined, undefined, clock);
  await ready;
  expire();
  assert.equal(childSignal.aborted, true);
  assert.ok(finishTeardown);
  finishTeardown();
  await assert.rejects(running, error => error instanceof OmdTimeoutError && error.code === 'OMD_CLI_TIMEOUT');
});

test('owned CLI sends SIGTERM to its process group and SIGKILL after injected grace even if launcher exits', async () => {
  const child = Object.assign(new EventEmitter(), { pid: 43210, stdout: new PassThrough(), stderr: new PassThrough() }) as unknown as ChildProcess;
  const calls: Array<[number, NodeJS.Signals]> = [];
  let escalation: (() => void) | undefined;
  const dependencies = {
    spawn: ((_command: string, _args: string[], options: { detached?: boolean; shell?: boolean }) => {
      assert.equal(options.detached, true);
      assert.equal(options.shell, false);
      return child;
    }) as OwnedExecDependencies['spawn'],
    kill: (pid: number, sig: NodeJS.Signals) => { calls.push([pid, sig]); },
    setTimeout: ((callback: () => void, delay: number) => {
      assert.equal(delay, 3000);
      escalation = callback;
      return { unref: () => undefined } as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
  };
  const controller = new AbortController();
  const running = runOwnedOmdProcess(process.execPath, ['test'], { cwd: '/tmp', signal: controller.signal }, dependencies);
  controller.abort();
  assert.deepEqual(calls, [[-43210, 'SIGTERM']]);
  child.emit('close', null);
  assert.equal((await running).killed, true);
  assert.ok(escalation);
  escalation();
  assert.deepEqual(calls, [[-43210, 'SIGTERM'], [-43210, 'SIGKILL']]);
});

test('real owned CLI process ignores SIGTERM but exits after process-group SIGKILL', { timeout: 10_000 }, async () => {
  const controller = new AbortController();
  let ready!: () => void;
  const seen = new Promise<void>(resolve => { ready = resolve; });
  const script = `const {createServer}=require('node:net'); process.on('SIGTERM',()=>{}); createServer().listen(0,'127.0.0.1',()=>process.stdout.write('READY\\n'));`;
  const dependencies: OwnedExecDependencies = {
    spawn: ((command: string, args: readonly string[], options: SpawnOptions) => {
      const child = requireSpawn(command, [...args], options);
      child.stdout!.once('data', () => ready());
      return child;
    }) as unknown as OwnedExecDependencies['spawn'],
    kill: (pid, signal) => { process.kill(pid, signal); },
    setTimeout,
  };
  const running = runOwnedOmdProcess(process.execPath, ['-e', script], { cwd: '/tmp', signal: controller.signal }, dependencies);
  await seen;
  controller.abort();
  const result = await running;
  assert.equal(result.killed, true);
  assert.notEqual(result.code, 0);
});

test('progress identifies advance but never reveals URL credentials, path, or query', () => {
  const text = formatOmdProgress(['ref', 'advance', '--input', 'https://user:password@example.test/private?token=secret'], 'running', 15);
  assert.match(text, /다음 소스/);
  assert.match(text, /example\.test/);
  assert.match(text, /0분 15초/);
  assert.doesNotMatch(text, /user|password|private|secret/);
});
