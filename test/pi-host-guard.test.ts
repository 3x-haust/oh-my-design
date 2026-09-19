import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import omdExtension, { type PortablePiApi, type PortablePiHook, type PortablePiTool } from '../extensions/omd.ts';
import { classifyPiWrite, isPreproductionReadCommand } from '../extensions/omd-guard.ts';

function harness(exec?: PortablePiApi['exec'], sendMessage?: PortablePiApi['sendMessage']) {
  const hooks = new Map<string, PortablePiHook>();
  const calls: Array<{ args: readonly string[]; cwd: string }> = [];
  let tool!: PortablePiTool;
  let pass = false;
  omdExtension({
    ...(sendMessage === undefined ? {} : { sendMessage }),
    on: (name, hook) => { hooks.set(name, hook); },
    registerCommand: () => {}, registerTool: t => { tool = t; },
    exec: exec ?? (async (_command, args, options) => {
      calls.push({ args: args.slice(1), cwd: options.cwd });
      return { stdout: JSON.stringify({ ok: pass, blockers: pass ? [] : ['copy deck missing', 'review loop incomplete'] }), stderr: '', code: pass ? 0 : 1, killed: false };
    }),
  });
  const cwd = mkdtempSync(join(tmpdir(), 'omd-pi-guard-'));
  return { cwd, calls, tool, hooks, pass: () => { pass = true; }, emit: (name: string, event: Parameters<PortablePiHook>[0]) => hooks.get(name)!(event, { cwd }) };
}
const final = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: '구현했습니다.' }] };
const blocked = (value: unknown) => (value as { block?: boolean } | undefined)?.block === true;

test('test-011 bypass: selected-stage failure blocks native write, edit and script-based bash', async () => {
  const h = harness();
  await h.emit('before_agent_start', { prompt: '/skill:omd-ultradesign Build an app', systemPrompt: 'Base' });
  for (const [toolName, input] of [
    ['write', { path: 'package.json', content: '{}' }], ['edit', { path: 'src/main.jsx' }],
    ['bash', { command: "python3 -c 'open(\"src/main.jsx\",\"w\").write(\"app\")'" }],
  ] as const) assert.equal(blocked(await h.emit('tool_call', { toolName, input })), true);
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.calls[0]?.args, ['guard', 'production', '--path', 'package.json', '--json']);
  const held = await h.emit('message_end', { message: final }) as { message: typeof final };
  assert.match(held.message.content[0]!.text, /미완료/);
  assert.doesNotMatch(held.message.content[0]!.text, /구현했습니다/);
  assert.deepEqual(h.calls.at(-1)?.args, ['guard', 'completion', '--json']);
});

test('research repair remains possible but CLI-owned evidence cannot be forged through native write', async () => {
  const h = harness();
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  for (const path of ['.omd/.cache/route-input.json', '.omd/copy-deck.md', '.omd/type-proof.md', '.omd/docs/app/repair.md', '.omd/design-handoff.json']) {
    assert.equal(await h.emit('tool_call', { toolName: 'write', input: { path } }), undefined);
  }
  for (const path of ['.omd/route.json', '.omd/history.jsonl', '.omd/activation/project.key', '.omd/reference-board.json', '.omd/final-evidence-v2.json']) {
    assert.equal(blocked(await h.emit('tool_call', { toolName: 'write', input: { path } })), true);
  }
  assert.equal(await h.emit('tool_call', { toolName: 'read', input: { path: 'src/main.jsx' } }), undefined);
  assert.equal(await h.emit('tool_call', { toolName: 'bash', input: { command: 'rg --files --hidden' } }), undefined);
  assert.equal(h.calls.length, 0);
});

test('the packaged source-writing recipe tool cannot bypass the production gate', async () => {
  const h = harness();
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  await assert.rejects(h.tool.execute('recipe', { args: ['recipe', 'add', 'glass-card'] }, undefined, undefined, { cwd: h.cwd }), /copy deck missing/);
  assert.deepEqual(h.calls.map(call => call.args), [['guard', 'production', '--json']]);
});

test('an unrelated doctor or schema query does not turn subsequent generic work into an OMD design run', async () => {
  const h = harness(); h.pass();
  await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['doctor'] } });
  await h.tool.execute('doctor', { args: ['doctor'] }, undefined, undefined, { cwd: h.cwd });
  assert.equal(await h.emit('tool_call', { toolName: 'write', input: { path: 'README.md' } }), undefined);
  assert.equal(h.calls.length, 1);
  assert.equal(await h.emit('message_end', { message: final }), undefined);
});

test('current successful gates allow in-scope writes and preserve final message; plain chat is untouched', async () => {
  const h = harness();
  assert.equal(await h.emit('message_end', { message: final }), undefined);
  assert.equal(await h.emit('tool_call', { toolName: 'write', input: { path: 'plain.txt' } }), undefined);
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  h.pass();
  assert.equal(await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.jsx' } }), undefined);
  assert.equal(await h.emit('message_end', { message: final }), undefined);
  const count = h.calls.length;
  await h.emit('input', { source: 'interactive' });
  await h.emit('before_agent_start', { prompt: 'What is the status?' });
  assert.equal(await h.emit('message_end', { message: final }), undefined);
  assert.equal(h.calls.length, count);
});

test('repairable terminal failures trigger at most two custom follow-ups; only real new input resets the budget', async () => {
  const sent: Array<Parameters<NonNullable<PortablePiApi['sendMessage']>>> = [];
  const h = harness(undefined, (...args) => { sent.push(args); });
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.jsx' } });
  for (let round = 0; round < 4; round++) {
    await h.emit('before_agent_start', { prompt: 'Follow-up repair' });
    await h.emit('message_end', { message: final });
    await h.emit('input', { source: 'extension' });
  }
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0]![1], { triggerTurn: true, deliverAs: 'followUp' });
  assert.equal(sent[0]![0].customType, 'omd-gate-repair');
  await h.emit('input', { source: 'interactive' });
  await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.jsx' } });
  await h.emit('message_end', { message: final });
  assert.equal(sent.length, 3);
});

test('authority failures, user aborts and tool-use messages do not trigger automatic repair', async () => {
  const sent: unknown[] = [];
  const h = harness(async () => ({ stdout: '', stderr: 'FINAL_REVIEWER_LANE_AUTHORIZATION_REQUIRED', code: 1, killed: false }), m => { sent.push(m); });
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.jsx' } });
  await h.emit('message_end', { message: final });
  assert.equal(sent.length, 0);
  assert.equal(await h.emit('message_end', { message: { ...final, stopReason: 'aborted' } }), undefined);
  assert.equal(await h.emit('message_end', { message: { ...final, stopReason: 'toolUse' } }), undefined);
  const controller = new AbortController(); controller.abort();
  assert.equal(await h.hooks.get('message_end')!({ message: final }, { cwd: h.cwd, signal: controller.signal }), undefined);
  assert.equal(sent.length, 0);
});

test('write classification rejects traversal and symlink escapes; shell allowance cannot execute arbitrary payloads', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-pi-path-'));
  const external = mkdtempSync(join(tmpdir(), 'omd-pi-outside-'));
  mkdirSync(join(root, '.omd'));
  symlinkSync(external, join(root, '.omd/.cache'));
  for (const path of ['../outside', '.omd/.cache/route-input.json']) assert.equal(classifyPiWrite(root, path).kind, 'blocked');
  for (const command of ['pwd', 'ls -al', 'git status --short']) assert.equal(isPreproductionReadCommand(command), true);
  for (const command of ['pwd > src/x', 'ls; node x', 'rg --pre=evil x', 'python3 x.py', 'git -c core.pager=evil diff', 'ls\nnode x', '$(node x)']) assert.equal(isPreproductionReadCommand(command), false);
});

test('per-project CLI queue prevents mutation lock collisions, survives failure and keeps other projects independent', async () => {
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
  assert.equal(starts.some(s => s.endsWith(':second')), false);
  release();
  await Promise.all([first, cancelled, second]);
  assert.equal(starts.some(s => s.endsWith(':cancelled')), false);
  assert.equal(starts.at(-1), `${h.cwd}:second`);
});
