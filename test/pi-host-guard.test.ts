import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
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
  for (const path of ['.omd/route.json', '.omd/history.jsonl', '.omd/activation/project.key', '.omd/reference-board.json', '.omd/final-evidence-v2.json', '.omd/reference-application-review.json', `.omd/refs/design/search-${'a'.repeat(64)}.json`]) {
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

test('repairable terminal failures stop on repeated no-progress but successful repair activity keeps the loop alive', async () => {
  const sent: Array<Parameters<NonNullable<PortablePiApi['sendMessage']>>> = [];
  const h = harness(async (_command, args) => args[2] === 'production'
    ? { stdout: '{"ok":true}', stderr: '', code: 0, killed: false }
    : { stdout: JSON.stringify({ blockers: ['copy deck missing'] }), stderr: '', code: 1, killed: false }, (...args) => { sent.push(args); });
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  mkdirSync(join(h.cwd, 'src'));
  for (let round = 0; round < 5; round++) {
    const toolCallId = `repair-${round}`;
    await h.emit('tool_call', { toolName: 'write', toolCallId, input: { path: 'src/main.jsx', content: `round ${round}` } });
    writeFileSync(join(h.cwd, 'src/main.jsx'), `round ${round}`);
    await h.emit('tool_result', { toolName: 'write', toolCallId, input: { path: 'src/main.jsx' }, isError: false });
    await h.emit('before_agent_start', { prompt: 'Follow-up repair' });
    await h.emit('message_end', { message: final });
    await h.emit('input', { source: 'extension' });
  }
  assert.equal(sent.length, 5, 'successful in-scope repair work must permit more than two rechecks');
  assert.deepEqual(sent[0]![1], { triggerTurn: true, deliverAs: 'followUp' });
  assert.equal(sent[0]![0].customType, 'omd-gate-repair');

  for (let round = 0; round < 4; round++) await h.emit('message_end', { message: final });
  assert.equal(sent.length, 7, 'two recovery turns are allowed after work stops changing, then the cycle is held');
  await h.emit('input', { source: 'interactive' });
  await h.emit('tool_call', { toolName: 'write', toolCallId: 'new-request', input: { path: 'src/main.jsx' } });
  writeFileSync(join(h.cwd, 'src/main.jsx'), 'new request bytes');
  await h.emit('tool_result', { toolName: 'write', toolCallId: 'new-request', input: { path: 'src/main.jsx' }, isError: false });
  await h.emit('message_end', { message: final });
  assert.equal(sent.length, 8);
});

test('identical writes and successful publisher help do not manufacture repair progress', async () => {
  const sent: unknown[] = [];
  const h = harness(async (_command, args) => args[2] === 'production' || args[1] === 'frame'
    ? { stdout: '{"ok":true}', stderr: '', code: 0, killed: false }
    : { stdout: '{"blockers":["copy deck missing"]}', stderr: '', code: 1, killed: false }, m => { sent.push(m); });
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  mkdirSync(join(h.cwd, 'src'));
  await h.emit('tool_call', { toolName: 'write', toolCallId: 'seed', input: { path: 'src/main.jsx', content: 'same bytes' } });
  writeFileSync(join(h.cwd, 'src/main.jsx'), 'same bytes');
  await h.emit('tool_result', { toolName: 'write', toolCallId: 'seed', input: { path: 'src/main.jsx' }, isError: false });
  await h.emit('message_end', { message: final });
  for (let round = 0; round < 5; round++) {
    const toolCallId = `same-${round}`;
    await h.emit('tool_call', { toolName: 'write', toolCallId, input: { path: 'src/main.jsx', content: 'same bytes' } });
    writeFileSync(join(h.cwd, 'src/main.jsx'), 'same bytes');
    await h.emit('tool_result', { toolName: 'write', toolCallId, input: { path: 'src/main.jsx' }, isError: false });
    await h.tool.execute(`help-${round}`, { args: ['frame', 'set', '--help'] }, undefined, undefined, { cwd: h.cwd });
    await h.emit('message_end', { message: final });
  }
  assert.equal(sent.length, 3, 'successful no-op activity must not reset the no-progress allowance');
});

test('genuine writes without a tool call id still count as repair progress', async () => {
  const sent: unknown[] = [];
  const h = harness(async (_command, args) => args[2] === 'production'
    ? { stdout: '{"ok":true}', stderr: '', code: 0, killed: false }
    : { stdout: '{"blockers":["copy deck missing"]}', stderr: '', code: 1, killed: false }, m => { sent.push(m); });
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  mkdirSync(join(h.cwd, 'src'));
  for (let round = 0; round < 5; round++) {
    await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.jsx', content: `round ${round}` } });
    writeFileSync(join(h.cwd, 'src/main.jsx'), `round ${round}`);
    await h.emit('tool_result', { toolName: 'write', input: { path: 'src/main.jsx' }, isError: false });
    await h.emit('message_end', { message: final });
  }
  assert.equal(sent.length, 5);
});

test('overlapping id-less writes to one file retain each pending fingerprint', async () => {
  const sent: unknown[] = [];
  const h = harness(async (_command, args) => args[2] === 'production'
    ? { stdout: '{"ok":true}', stderr: '', code: 0, killed: false }
    : { stdout: '{"blockers":["copy deck missing"]}', stderr: '', code: 1, killed: false }, m => { sent.push(m); });
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  mkdirSync(join(h.cwd, 'src'));
  writeFileSync(join(h.cwd, 'src/main.jsx'), 'base');
  await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.jsx', content: 'first' } });
  await h.emit('tool_call', { toolName: 'write', input: { path: 'src/main.jsx', content: 'second' } });
  writeFileSync(join(h.cwd, 'src/main.jsx'), 'first');
  await h.emit('tool_result', { toolName: 'write', input: { path: 'src/main.jsx' }, isError: false });
  writeFileSync(join(h.cwd, 'src/main.jsx'), 'second');
  await h.emit('tool_result', { toolName: 'write', input: { path: 'src/main.jsx' }, isError: false });
  await h.emit('message_end', { message: final });
  assert.equal(sent.length, 1);
});

test('blocked and failed production writes never authorize an automatic completion repair', async () => {
  for (const mode of ['blocked', 'failed'] as const) {
    const sent: unknown[] = [];
    const h = harness(async (_command, args) => args[2] === 'production' && mode === 'failed'
      ? { stdout: '{"ok":true}', stderr: '', code: 0, killed: false }
      : { stdout: '{"blockers":["copy deck missing"]}', stderr: '', code: 1, killed: false }, m => { sent.push(m); });
    await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
    const toolCallId = `${mode}-write`;
    const decision = await h.emit('tool_call', { toolName: 'write', toolCallId, input: { path: 'src/main.jsx', content: 'attempt' } });
    if (mode === 'blocked') assert.equal(blocked(decision), true);
    else await h.emit('tool_result', { toolName: 'write', toolCallId, input: { path: 'src/main.jsx' }, isError: true });
    await h.emit('message_end', { message: final });
    assert.equal(sent.length, 0, `${mode} source activity is not successful work`);
  }
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

test('missing rendered application review enters the progress-driven repair loop only after source work', async () => {
  const sent: unknown[] = [];
  const h = harness(async (_command, args) => args[2] === 'production'
    ? { stdout: '{"ok":true}', stderr: '', code: 0, killed: false }
    : { stdout: '', stderr: 'REFERENCE_APPLICATION_REVIEW: .omd/reference-application-review.json is unavailable or changed', code: 1, killed: false }, m => { sent.push(m); });
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['ref', 'apply-review-plan', '--json'] } });
  assert.equal(await h.emit('message_end', { message: final }), undefined);
  mkdirSync(join(h.cwd, 'src'));
  await h.emit('tool_call', { toolName: 'write', toolCallId: 'source', input: { path: 'src/main.jsx' } });
  writeFileSync(join(h.cwd, 'src/main.jsx'), 'application source');
  await h.emit('tool_result', { toolName: 'write', toolCallId: 'source', input: { path: 'src/main.jsx' }, isError: false });
  for (let attempt = 0; attempt < 4; attempt++) await h.emit('message_end', { message: final });
  assert.equal(sent.length, 3);
});

test('research-only work and read-only reference handoffs never authorize automatic implementation repairs', async () => {
  const sent: unknown[] = [];
  const h = harness(undefined, m => { sent.push(m); });
  await h.emit('before_agent_start', { prompt: 'omd-ultradesign' });
  await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['ref', 'handoff', 'hand'] } });
  assert.equal(await h.emit('message_end', { message: final }), undefined);
  assert.equal(h.calls.length, 0);
  await h.emit('tool_call', { toolName: 'write', input: { path: '.omd/scout.md' } });
  await h.emit('message_end', { message: final });
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
