import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import omdExtension, { type PortablePiEvent, type PortablePiHook, type PortablePiTool } from '../extensions/omd.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { expandedSkillOnly } from './helpers/pi-stage-continuity.ts';

const inputPath = '.omd/.cache/route-input.json';
const original = `\n# 사용자 기획서\n${'조건과 화면을 빠짐없이 구현한다.\n'.repeat(1000)}리액트로 구현해줘.\n  `;
const cliPath = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
type InputEvent = PortablePiEvent & { text?: string; streamingBehavior?: 'steer' | 'followUp' };

function project(t: { after(fn: () => void): void }): string {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-request-binding-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.omd/.cache'), { recursive: true });
  const skeleton = inputSkeleton('product-route-input').skeleton;
  assert.ok(typeof skeleton === 'object' && skeleton !== null);
  const value = { ...skeleton, request: '축약된 요구사항' };
  writeFileSync(join(cwd, inputPath), JSON.stringify(value));
  return cwd;
}

function host(cwd: string, afterExec?: () => void) {
  const hooks = new Map<string, PortablePiHook>();
  const inputs: Array<{ path: string; request: string }> = [];
  let tool: PortablePiTool | undefined;
  omdExtension({
    on: (name, handler) => { hooks.set(name, handler); }, registerCommand() {},
    registerTool: value => { tool = value; },
    async exec(_command, args, options) {
      const index = args.indexOf('--input');
      const path = args[index + 1];
      if (args[1] === 'route' && index >= 0 && path) inputs.push({ path, request: JSON.parse(readFileSync(resolve(options.cwd, path), 'utf8')).request });
      const result = spawnSync(process.execPath, [...args], { cwd: options.cwd, encoding: 'utf8', env, timeout: 20000 });
      afterExec?.();
      return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', code: result.status ?? 1, killed: result.signal !== null };
    },
  });
  const emit = (name: string, event: InputEvent) => hooks.get(name)?.(event, { cwd });
  return { emit, inputs,
    async start(request = original) {
      await emit('input', { source: 'interactive', text: `/skill:omd-ultradesign ${request}` });
      await emit('before_agent_start', { prompt: `${expandedSkillOnly()}\n\n${request.trim()}` });
    },
    async run(action: string, extra: string[] = [], signal?: AbortSignal) {
      assert.ok(tool);
      return tool.execute('request-test', { args: ['route', action, '--input', inputPath, '--json', ...extra] }, signal, undefined, { cwd });
    },
  };
}

function persisted(cwd: string) {
  const pointer = JSON.parse(readFileSync(join(cwd, '.omd/route.json'), 'utf8'));
  return JSON.parse(readFileSync(join(cwd, '.omd', pointer.record), 'utf8'));
}

test('Pi validation and publication preserve the full actual request when the authored input is a summary', async t => {
  const cwd = project(t), pi = host(cwd);
  const authoredBefore = readFileSync(join(cwd, inputPath), 'utf8');
  await pi.start();
  await pi.run('validate');
  const result = await pi.run('classify');
  const response = JSON.parse(result.content[0]?.text ?? 'null');
  const route = persisted(cwd);
  assert.equal(route.request, original);
  assert.equal(route.sourceContract.request, original);
  assert.deepEqual(pi.inputs.map(value => value.request), [original, original]);
  assert.equal(readFileSync(join(cwd, inputPath), 'utf8'), authoredBefore);
  assert.equal(response.schema, 'omd-route-summary-v1');
  assert.equal(response.requestSource.characters, original.length);
  assert.equal(result.details.requestBinding?.authoredRequestReplaced, true);
  for (const value of pi.inputs) assert.equal(existsSync(value.path), false, 'private effective input must be removed');
});

for (const streamingBehavior of ['steer', 'followUp'] as const) {
  test(`queued ${streamingBehavior} replaces the request only when Pi delivers its native user message`, async t => {
    const cwd = project(t), pi = host(cwd);
    await pi.start();
    const next = '새로운 날씨 앱을 리액트로 구현해줘.';
    await pi.emit('input', { source: 'interactive', text: `/skill:omd-ultradesign ${next}`, streamingBehavior });
    await pi.run('validate');
    assert.equal(pi.inputs.at(-1)?.request, original);
    await pi.emit('message_start', { message: { role: 'user', content: [{ type: 'text', text: `${expandedSkillOnly()}\n\n${next}` }] } });
    await pi.run('classify');
    assert.equal(persisted(cwd).request, next);
  });
}

test('extra or ambiguous route flags cannot bypass captured request binding', async t => {
  const cwd = project(t), pi = host(cwd);
  await pi.start();
  for (const extra of [['--foo', 'bar'], ['--full'], ['--help'], ['-h'], ['--input', inputPath]]) {
    await assert.rejects(pi.run('classify', extra), /OMD_REQUEST_BINDING: bound route commands/);
  }
  assert.equal(existsSync(join(cwd, '.omd/route.json')), false);
});

test('the exact /ultradesign alias expands natively and retains its original arguments and images', async t => {
  const cwd = project(t), pi = host(cwd);
  const images = [{ type: 'image', data: 'fixture' }];
  const response = await pi.emit('input', { source: 'interactive', text: `/ultradesign ${original}`, images });
  assert.deepEqual(response, { action: 'transform', text: `/skill:omd-ultradesign ${original}`, images });
  await pi.emit('before_agent_start', { prompt: `${expandedSkillOnly()}\n\n${original.trim()}` });
  await pi.run('classify');
  assert.equal(persisted(cwd).request, original);
});

for (const kind of ['failure', 'abort'] as const) {
  test(`private route input is removed after execution ${kind}`, async t => {
    const cwd = project(t), controller = new AbortController();
    const pi = host(cwd, () => { if (kind === 'failure') throw new Error('execution failed'); controller.abort(); });
    await pi.start();
    await assert.rejects(pi.run('validate', [], controller.signal), kind === 'failure' ? /execution failed/ : /OMD_CLI_CANCELLED/);
    assert.equal(pi.inputs.length, 1);
    for (const input of pi.inputs) assert.equal(existsSync(input.path), false);
  });
}

test('Pi retains the request through unrelated, queued, and extension inputs and restores it after restart', async t => {
  const cwd = project(t), pi = host(cwd);
  await pi.start();
  await pi.run('classify');
  await pi.emit('input', { source: 'interactive', text: '/skill:omd-ultradesign 다른 앱을 구현해줘.', streamingBehavior: 'followUp' });
  await pi.emit('input', { source: 'extension', text: '/skill:omd-ultradesign 가짜 앱을 구현해줘.' });
  await pi.emit('before_agent_start', { prompt: '현재 입력을 수정한 뒤 계속해.' });
  await pi.run('validate');
  assert.equal(pi.inputs.at(-1)?.request, original);
  const restarted = host(cwd);
  await restarted.emit('session_start', {});
  await restarted.emit('before_agent_start', { prompt: '계속 진행해줘' });
  await restarted.run('classify');
  assert.equal(persisted(cwd).request, original);
});

test('a different plain user task cannot silently reuse the preceding workflow request', async t => {
  const cwd = project(t), pi = host(cwd);
  await pi.start();
  await pi.run('classify');
  const prompt = 'Build a new weather app.';
  await pi.emit('input', { source: 'interactive', text: prompt });
  await pi.emit('before_agent_start', { prompt });
  await assert.rejects(pi.run('classify'), /OMD_REQUEST_BINDING: a different user task/);
  assert.equal(persisted(cwd).request, original);
});

test('restart refuses rollback to an older signed source when the current route belongs to a newer request', async t => {
  const cwd = project(t), pi = host(cwd);
  await pi.start();
  const pointer = join(cwd, '.omd/request-source.json');
  const oldPointer = readFileSync(pointer);
  await pi.run('classify');
  await pi.start('새로운 날씨 앱을 리액트로 구현해줘.');
  await pi.run('classify');
  writeFileSync(pointer, oldPointer);
  const restarted = host(cwd);
  await assert.rejects(restarted.run('classify'), /OMD_REQUEST_BINDING: restored source differs/);
  assert.equal(persisted(cwd).request, '새로운 날씨 앱을 리액트로 구현해줘.');
});

test('route show drains the complete large JSON through a pipe', async t => {
  const cwd = project(t), pi = host(cwd);
  await pi.start();
  await pi.run('classify');
  const result = spawnSync(process.execPath, [cliPath, 'route', 'show', '--json'], { cwd, env, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(Buffer.byteLength(result.stdout) > 65536);
  assert.equal(JSON.parse(result.stdout).request, original);
});

test('Pi refuses a replaced or missing captured request without falling back to the authored summary', async t => {
  const cwd = project(t), pi = host(cwd);
  await pi.start();
  const pointer = join(cwd, '.omd/request-source.json');
  assert.ok(existsSync(pointer));
  writeFileSync(pointer, '{}');
  await assert.rejects(pi.run('classify'), /OMD_REQUEST_BINDING/);
  assert.equal(existsSync(join(cwd, '.omd/route.json')), false);
});

test('an OMD mention or extension-generated skill invocation does not acquire user request authority', async t => {
  const cwd = project(t), pi = host(cwd);
  await pi.emit('input', { source: 'interactive', text: 'Explain /skill:omd-ultradesign please.' });
  await pi.emit('before_agent_start', { prompt: 'Explain /skill:omd-ultradesign please.' });
  await pi.emit('input', { source: 'extension', text: '/skill:omd-ultradesign 가짜 앱을 구현해줘.' });
  await pi.emit('before_agent_start', { prompt: '/skill:omd-ultradesign 가짜 앱을 구현해줘.' });
  const result = await pi.run('classify');
  assert.equal(JSON.parse(result.content[0]?.text ?? 'null').request, '축약된 요구사항');
  assert.equal(existsSync(join(cwd, '.omd/request-source.json')), false);
});
