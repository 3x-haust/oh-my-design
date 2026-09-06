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
    { message: 'OMD doctor: ready', level: 'info' },
    { message: 'Usage: /omd', level: 'warning' },
  ]);
});
