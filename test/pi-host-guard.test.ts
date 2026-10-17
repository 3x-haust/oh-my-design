import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import omdExtension, { type PortablePiApi, type PortablePiHook, type PortablePiTool } from '../extensions/omd.ts';
import { classifyPiWrite, isMutatingOmdCommand, isPreproductionReadCommand } from '../extensions/omd-guard.ts';

function harness(exec?: PortablePiApi['exec']) {
  const hooks = new Map<string, PortablePiHook>();
  const calls: Array<{ args: readonly string[]; cwd: string }> = [];
  let tool!: PortablePiTool;
  let pass = false;
  omdExtension({
    on: (name, hook) => { hooks.set(name, hook); },
    registerCommand: () => {}, registerTool: registered => { tool = registered; },
    execOwned(command, args, options) { return this.exec(command, args, options); },
    exec: exec ?? (async (_command, args, options) => {
      calls.push({ args: args.slice(1), cwd: options.cwd });
      return {
        stdout: JSON.stringify({ ok: pass, sourceAuthoring: 'model', blockers: pass ? [] : ['production gate red'] }),
        stderr: '', code: pass ? 0 : 1, killed: false,
      };
    }),
  });
  const cwd = mkdtempSync(join(tmpdir(), 'omd-pi-guard-'));
  return {
    cwd, calls, tool, hooks, pass: () => { pass = true; },
    emit: (name: string, event: Parameters<PortablePiHook>[0]) => hooks.get(name)!(event, { cwd }),
  };
}

const final = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Implemented.' }] };
const blocked = (value: unknown) => (value as { block?: boolean } | undefined)?.block === true;

test('model-led tool dispatch uses the production gate and protects publisher paths', async () => {
  const h = harness();
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign Build an app' });
  assert.equal(blocked(await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.ts' } })), true);
  assert.equal(blocked(await h.emit('tool_call', { toolName: 'eval', input: { code: 'build()' } })), true);
  h.pass();
  for (const toolName of ['write', 'edit', 'bash', 'eval', 'task']) {
    assert.equal(await h.emit('tool_call', { toolName, input: { path: 'src/main.ts', command: 'npm run build' } }), undefined, toolName);
  }
  assert.equal(await h.emit('tool_call', { toolName: 'apply_patch', input: {
    input: '*** Begin Patch\n*** Add File: src/main.ts\n+export const ready = true;\n*** End Patch\n',
  } }), undefined);
  for (const path of ['.omd/route.json', '.omd/final-evidence-v2.json', '../outside.ts']) {
    assert.equal(blocked(await h.emit('tool_call', { toolName: 'write', input: { path } })), true, path);
  }
  assert.equal(blocked(await h.emit('tool_call', { toolName: 'apply_patch', input: {
    input: '*** Begin Patch\n*** Add File: src/main.ts\n+export const ready = true;\n*** Add File: .omd/route.json\n+{}\n*** End Patch\n',
  } })), true);
  rmSync(h.cwd, { recursive: true, force: true });
});

test('reference work-next is inspection and advance is an owned mutation', () => {
  assert.equal(isMutatingOmdCommand(['ref', 'work-next', '--json']), false);
  assert.equal(isMutatingOmdCommand(['ref', 'advance', '--json']), true);
});

test('managed production keeps ordinary model tools available after the gate passes', async () => {
  const h = harness();
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  h.pass();
  for (const toolName of ['eval', 'monitor', 'lsp_rename', 'ast_grep_replace', 'task']) {
    assert.equal(await h.emit('tool_call', { toolName, input: {} }), undefined, toolName);
  }
  assert.equal(await h.emit('tool_call', { toolName: 'unregistered_executor', input: {} }), undefined);
  for (const toolName of ['read', 'grep', 'find', 'ls', 'todo', 'web_search', 'lsp_diagnostics']) {
    assert.equal(await h.emit('tool_call', { toolName, input: {} }), undefined, toolName);
  }
});

test('patches may edit model-owned cache inputs but cannot mix in production or publisher records', async () => {
  const h = harness();
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign Build an app' });
  const patch = (body: string) => h.emit('tool_call', { toolName: 'apply_patch',
    toolCallId: 'patch-owned', input: { input: `*** Begin Patch\n${body}*** End Patch\n` } });
  assert.equal(await patch('*** Add File: .omd/.cache/first.json\n+{}\n'), undefined);
  for (const path of ['src/main.ts', '.omd/route.json', '../outside.json']) {
    assert.equal(blocked(await patch(`*** Add File: .omd/.cache/ok.json\n+{}\n*** Add File: ${path}\n+{}\n`)), true, path);
  }
});

test('a red production gate blocks source writes and holds completion', async () => {
  const h = harness();
  await h.emit('before_agent_start', { prompt: '/skill:omd-ultradesign Build an app' });
  for (const [toolName, input] of [
    ['write', { path: 'package.json', content: '{}' }],
    ['edit', { path: 'src/main.jsx' }],
    ['bash', { command: "python3 -c 'open(\"src/main.jsx\",\"w\").write(\"app\")'" }],
  ] as const) assert.equal(blocked(await h.emit('tool_call', { toolName, input })), true);
  const held = await h.emit('message_end', { message: final }) as { message: typeof final };
  assert.match(held.message.content[0]!.text, /incomplete/);
  assert.deepEqual(h.calls.at(-1)?.args, ['guard', 'completion', '--json']);
});

test('successful gates permit direct source work and ordinary shell execution', async () => {
  const h = harness();
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  h.pass();
  assert.equal(await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.jsx' } }), undefined);
  assert.equal(await h.emit('tool_call', { toolName: 'bash', input: { command: 'npm run build' } }), undefined);
  assert.equal(await h.emit('tool_call', { toolName: 'bash', input: { command: 'npm run build; node author.js' } }), undefined);
  assert.equal(await h.emit('message_end', { message: final }), undefined);
});

test('unrelated diagnostics do not activate managed design enforcement', async () => {
  const h = harness();
  h.pass();
  await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['doctor'] } });
  assert.equal(await h.emit('tool_call', { toolName: 'write', input: { path: 'README.md' } }), undefined);
  assert.equal(await h.emit('message_end', { message: final }), undefined);
});

test('write classification rejects traversal and symlink escapes and read commands cannot hide execution', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-pi-path-'));
  const external = mkdtempSync(join(tmpdir(), 'omd-pi-outside-'));
  mkdirSync(join(root, '.omd'));
  symlinkSync(external, join(root, '.omd/.cache'));
  for (const path of ['../outside', '.omd/.cache/route-input.json']) assert.equal(classifyPiWrite(root, path).kind, 'blocked');
  for (const command of ['pwd', 'ls -al', 'git status --short']) assert.equal(isPreproductionReadCommand(command), true);
  for (const command of ['pwd > src/x', 'ls; node x', 'python3 x.py', 'ls\nnode x', '$(node x)']) assert.equal(isPreproductionReadCommand(command), false);
  rmSync(root, { recursive: true, force: true });
  rmSync(external, { recursive: true, force: true });
});

test('per-project CLI queue serializes one project while allowing another project', async () => {
  const starts: string[] = [];
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const h = harness(async (_command, args, options) => {
    const label = `${options.cwd}:${args[1]}`;
    starts.push(label);
    if (args[1] === 'first') { await hold; return { stdout: '', stderr: 'failed', code: 1, killed: false }; }
    return { stdout: 'ok', stderr: '', code: 0, killed: false };
  });
  const run = (arg: string, cwd = h.cwd, signal?: AbortSignal) => h.tool.execute(arg, { args: [arg] }, signal, undefined, { cwd });
  const first = assert.rejects(run('first'), /failed/);
  const controller = new AbortController();
  const cancelled = assert.rejects(run('cancelled', h.cwd, controller.signal));
  controller.abort();
  const second = run('second');
  await run('other', h.cwd + '-other');
  assert.equal(starts.some(entry => entry.endsWith(':second')), false);
  release();
  await Promise.all([first, cancelled, second]);
  assert.equal(starts.some(entry => entry.endsWith(':cancelled')), false);
  assert.equal(starts.at(-1), `${h.cwd}:second`);
});
