import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import omdExtension, {
  OMD_COMMAND_NAME,
  OMD_TOOL_NAME,
  type PortablePiApi,
  type PortablePiCommand,
  type PortablePiTool,
} from '../extensions/omd.ts';
import { formatOmdProgress } from '../extensions/omd-runtime.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

function loadExtension(exec: PortablePiApi['exec']): {
  command: PortablePiCommand;
  tool: PortablePiTool;
  execCallsAtLoad: number;
} {
  let command: PortablePiCommand | undefined;
  let tool: PortablePiTool | undefined;
  let execCallsAtLoad = 0;
  const api = new Proxy({
    registerCommand(name: string, definition: PortablePiCommand): void {
      assert.equal(name, OMD_COMMAND_NAME);
      command = definition;
    },
    registerTool(definition: PortablePiTool): void {
      assert.equal(definition.name, OMD_TOOL_NAME);
      tool = definition;
    },
    async exec(...args: Parameters<PortablePiApi['exec']>) {
      execCallsAtLoad += 1;
      return exec(...args);
    },
  } satisfies PortablePiApi, {
    get(target, property, receiver) {
      if (!(property in target)) throw new Error(`non-portable Pi API access: ${String(property)}`);
      return Reflect.get(target, property, receiver);
    },
  });

  omdExtension(api);
  assert.ok(command);
  assert.ok(tool);
  return { command, tool, execCallsAtLoad };
}

test('the npm package declares one host-neutral Pi extension and canonical skills', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    keywords?: string[];
    pi?: { extensions?: string[]; skills?: string[] };
  };
  assert.ok(pkg.keywords?.includes('pi-package'));
  assert.deepEqual(pkg.pi?.extensions, ['./extensions/omd.ts']);
  assert.deepEqual(pkg.pi?.skills, ['./src/skills']);
});

test('the portable extension registers without host detection or startup processes', () => {
  const loaded = loadExtension(async () => ({ stdout: '', stderr: '', code: 0, killed: false }));
  assert.equal(loaded.execCallsAtLoad, 0);
  assert.equal(loaded.tool.name, 'omd_cli');
  assert.equal(loaded.command.description, 'Check this project with Oh My Design');
});

test('omd_cli preserves structured argv and the Pi project cwd without a shell', async () => {
  const calls: Array<{
    command: string;
    args: readonly string[];
    options: { cwd: string; signal?: AbortSignal };
  }> = [];
  const loaded = loadExtension(async (command, args, options) => {
    calls.push({ command, args, options });
    return { stdout: 'ok\n', stderr: '', code: 0, killed: false };
  });
  const signal = new AbortController().signal;
  const result = await loaded.tool.execute(
    'call-1',
    { args: ['check', 'a path/page.html', '--json', '$(not-a-shell)'] },
    signal,
    undefined,
    { cwd: '/tmp/pi project' },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.command, 'node');
  assert.equal(isAbsolute(calls[0]!.args[0]!), true);
  assert.match(calls[0]!.args[0]!, /bin[/\\]omd\.mjs$/);
  assert.deepEqual(calls[0]!.args.slice(1), ['check', 'a path/page.html', '--json', '$(not-a-shell)']);
  assert.equal(calls[0]!.options.cwd, '/tmp/pi project');
  assert.equal(calls[0]!.options.signal, signal);
  assert.deepEqual(result.details, { code: 0, killed: false });
  assert.equal(result.content[0]?.text, 'ok');
});

test('omd_cli fails closed on a nonzero CLI exit', async () => {
  const loaded = loadExtension(async () => ({
    stdout: '',
    stderr: 'invalid manifest\n',
    code: 2,
    killed: false,
  }));
  await assert.rejects(
    loaded.tool.execute('call-2', { args: ['lifecycle', 'run'] }, undefined, undefined, { cwd: '/tmp/project' }),
    /OMD_CLI_FAILED \(2\): invalid manifest/,
  );
});

test('omd_cli returns structured exit-one JSON diagnostics without a failed tool result', async () => {
  const diagnostic = { ok: false, blockers: ['reference board missing'] };
  const loaded = loadExtension(async () => ({
    stdout: `${JSON.stringify(diagnostic)}\n`,
    stderr: '',
    code: 1,
    killed: false,
  }));
  const result = await loaded.tool.execute(
    'check-1',
    { args: ['guard', 'production', '--json'] },
    undefined,
    undefined,
    { cwd: '/tmp/project' },
  );
  assert.deepEqual(JSON.parse(result.content[0]?.text ?? ''), diagnostic);
  assert.deepEqual(result.details, { code: 1, killed: false });
});

test('a partly failed discovery batch keeps its successful receipt in structured Pi output', async () => {
  const partial = { ok: false, concurrency: 2, outcomes: [
    { kind: 'search', ok: true, receipt: { path: '.omd/discovery/domain/search-a.json', sha256: 'a'.repeat(64) } },
    { kind: 'navigate', ok: false, error: 'site unavailable' },
  ] };
  const loaded = loadExtension(async () => ({ stdout: JSON.stringify(partial), stderr: '', code: 1, killed: false }));
  const result = await loaded.tool.execute('batch', { args: ['ref', 'discover-batch', '--input', 'batch.json', '--json'] },
    undefined, undefined, { cwd: '/tmp/project' });
  assert.deepEqual(JSON.parse(result.content[0]?.text ?? ''), partial);
  assert.equal(result.details.code, 1);
});

test('omd_cli keeps malformed, fatal and killed command failures as tool errors', async () => {
  for (const result of [
    { stdout: 'not json', stderr: '', code: 1, killed: false },
    { stdout: '{"ok":false}', stderr: 'fatal', code: 1, killed: false },
    { stdout: '{"ok":false}', stderr: '', code: 2, killed: false },
    { stdout: '{"ok":false}', stderr: '', code: 1, killed: true },
  ]) {
    const loaded = loadExtension(async () => result);
    await assert.rejects(loaded.tool.execute(
      'fatal', { args: ['guard', 'production', '--json'] }, undefined, undefined, { cwd: '/tmp/project' },
    ));
  }
});

test('Given a user-interrupted browser command When CDP teardown fails Then omd_cli reports cancellation instead of the teardown error', async () => {
  const controller = new AbortController();
  const loaded = loadExtension(async () => {
    controller.abort();
    return { stdout: '', stderr: 'cdpSession.detach: Target page, context or browser has been closed', code: 1, killed: true };
  });
  await assert.rejects(
    loaded.tool.execute('interrupted', { args: ['ref', 'navigate', 'https://example.test/', '--json'] }, controller.signal, undefined, { cwd: '/tmp/project' }),
    error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /OMD_CLI_CANCELLED/);
      assert.doesNotMatch(error.message, /cdpSession\.detach/);
      return true;
    },
  );
});

test('Given a running browser command When omd_cli starts Then Pi receives a visible progress update before completion', async () => {
  let complete: ((result: { stdout: string; stderr: string; code: number; killed: boolean }) => void) | undefined;
  const pending = new Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>(resolve => { complete = resolve; });
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const loaded = loadExtension(async () => { markStarted?.(); return pending; });
  const updates: Array<{ content: Array<{ type: 'text'; text: string }> }> = [];
  const running = loaded.tool.execute('progress', { args: ['ref', 'navigate', 'https://example.test/', '--json'] }, undefined,
    (update: { content: Array<{ type: 'text'; text: string }> }) => { updates.push(update); }, { cwd: '/tmp/project' });
  try {
    await started;
    const text = updates[0]?.content[0]?.text ?? '';
    assert.match(text, /레퍼런스.*방문/);
    assert.match(text, /example\.test/);
    assert.match(text, /아직 결과/);
  } finally {
    assert.ok(complete);
    complete({ stdout: 'ok\n', stderr: '', code: 0, killed: false });
    await running;
  }
});

test('long-running progress names the command, target, elapsed time, and unknown internal state', () => {
  const message = formatOmdProgress(['ref', 'add', 'https://example.test/private?token=secret', '--lane', 'design'], 'running', 130);
  assert.match(message, /디자인 레퍼런스/);
  assert.match(message, /example\.test\/private/);
  assert.match(message, /2분 10초/);
  assert.match(message, /아직 결과/);
  assert.match(message, /ESC/);
  assert.doesNotMatch(message, /token=secret/);
});

test('a queued omd_cli command reports that it has not started, then reports execution', async () => {
  let finishFirst: (() => void) | undefined;
  const firstPending = new Promise<void>(resolve => { finishFirst = resolve; });
  let calls = 0;
  const loaded = loadExtension(async () => {
    calls += 1;
    if (calls === 1) await firstPending;
    return { stdout: 'ok', stderr: '', code: 0, killed: false };
  });
  const first = loaded.tool.execute('first', { args: ['ref', 'search', '--input', 'first.json'] }, undefined, undefined, { cwd: '/tmp/project' });
  const updates: string[] = [];
  const second = loaded.tool.execute('second', { args: ['ref', 'navigate', 'https://example.test/', '--lane', 'domain'] }, undefined,
    update => { updates.push(update.content[0]?.text ?? ''); }, { cwd: '/tmp/project' });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.match(updates[0] ?? '', /대기 중/);
    assert.match(updates[0] ?? '', /아직 시작되지 않았/);
    assert.equal(calls, 1);
  } finally {
    assert.ok(finishFirst);
    finishFirst();
    await Promise.all([first, second]);
  }
  assert.match(updates.at(-1) ?? '', /실행 중/);
});

test('/omd runs doctor only and rejects host-specific arguments', async () => {
  const calls: string[][] = [];
  const notifications: Array<{ message: string; level: string | undefined }> = [];
  const loaded = loadExtension(async (_command, args) => {
    calls.push([...args]);
    return { stdout: 'OMD doctor: ready\n', stderr: '', code: 0, killed: false };
  });
  const context = {
    cwd: '/tmp/project',
    ui: {
      notify(message: string, level?: 'info' | 'warning' | 'error') {
        notifications.push({ message, level });
      },
    },
  };

  await loaded.command.handler('', context);
  await loaded.command.handler('host-specific', context);

  assert.deepEqual(calls[0]?.slice(1), ['doctor']);
  assert.deepEqual(notifications, [
    { message: 'OMD doctor: ready\nOMD_HOST_GUARD_UNAVAILABLE: this host exposes no event hooks; only explicit CLI checks are available.', level: 'warning' },
    { message: 'Usage: /omd', level: 'warning' },
  ]);
});
