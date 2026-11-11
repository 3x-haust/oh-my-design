import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { PNG } from 'pngjs';
import omdExtension, { type PortablePiHook } from '../extensions/omd.ts';
import { ENTRY_COMMAND, isThinPrompt, registerThin, ThinSessions } from '../extensions/omd-thin.ts';
import { coldEyeArgs, runPiColdEye } from '../core/thin/eye.ts';
import { COLD_EYE_QUESTION } from '../core/thin/packet.ts';
import { beginCycle, closeCycle, eyeAnswerPath, eyeVerdict, goOn, newThinState, type ThinState } from '../core/thin/state.ts';
import { readBuildAgents } from '../adapters/build-identity.ts';

const cli = join(new URL('..', import.meta.url).pathname, 'bin', 'omd.ts');
const omd = (cwd: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [cli, 'thin', ...args], { cwd, encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_'))) });
  return { ...result, json: () => JSON.parse(result.stdout) as Record<string, unknown> };
};
const png = (width: number, height: number): Buffer => {
  const image = new PNG({ width, height });
  image.data.fill(200);
  return PNG.sync.write(image);
};
const write = (root: string, path: string, content: string | Buffer) => {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
};
const project = (t: TestContext): string => {
  const root = mkdtempSync(join(tmpdir(), 'omd-thin-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

test('cycle control: one cycle stops, continue runs to no tell or the cap, and a cycle begins only when due', () => {
  const step = newThinState({ request: 'a launch page', kind: 'marketing', continueMode: false });
  assert.equal(closeCycle(step, 'tell', { survivors: [] }).phase, 'stopped');
  const going = newThinState({ request: 'a launch page', kind: 'marketing', continueMode: true });
  assert.equal(closeCycle(going, 'tell', { survivors: [] }).phase, 'next');
  assert.equal(closeCycle(going, 'missing', { survivors: [] }).phase, 'next');
  assert.deepEqual(pick(closeCycle(going, 'none', { survivors: [] })), { phase: 'stopped', reason: 'no-tell' });
  assert.deepEqual(pick(closeCycle({ ...going, cycle: 3 }, 'tell', { survivors: [] })), { phase: 'stopped', reason: 'cap' });
  assert.throws(() => beginCycle(going));
  const stopped = closeCycle(step, 'tell', { survivors: ['public/a.png'] });
  assert.throws(() => goOn(going, false));
  const once = beginCycle(goOn(stopped, false));
  assert.deepEqual([once.cycle, once.phase, once.mode], [2, 'making', 'step']);
  const auto = goOn({ ...stopped, cycle: 3 }, true);
  assert.deepEqual([auto.mode, auto.until, auto.reason], ['continue', 4, undefined]);
});
const pick = (state: ThinState) => ({ phase: state.phase, reason: state.reason });

test('omd thin: start, packet, close, go and begin archive the cycle and carry only the survivors', t => {
  const root = project(t);
  write(root, 'README.md', '# Kiln\n');
  write(root, 'package.json', '{"name":"kiln"}\n');
  assert.equal(omd(root, 'start', '--kind', 'marketing', '--request', 'a launch page for Kiln').status, 0);
  assert.notEqual(omd(root, 'start', '--kind', 'marketing', '--request', 'again').status, 0);

  write(root, 'README.md', '# Kiln, edited\n');
  write(root, 'package.json', '{"name":"kiln","dependencies":{"react":"19"}}\n');
  write(root, 'src/main.tsx', 'export {};\n');
  write(root, 'src/sections/hero.tsx', 'export {};\n');
  write(root, 'public/assets/kiln.png', png(8, 8));
  write(root, 'node_modules/x/index.js', '');
  write(root, '.omd/thin/cycles/1/result/home-desktop.png', png(1440, 900));
  write(root, '.omd/thin/cycles/1/result/home-mobile.png', png(390, 3000));
  write(root, '.omd/thin/reference/desktop.png', png(1440, 900));
  write(root, '.omd/thin/memo.md', `${readFileSync(join(root, '.omd/thin/memo.md'), 'utf8')}\n## Cycle 1\n- the kiln object carried the page\n`);

  const packet = omd(root, 'packet', '--json');
  assert.equal(packet.status, 0, packet.stderr);
  const dir = join(root, '.omd/thin/cycles/1/packet');
  assert.deepEqual(readdirSync(dir).sort(), ['reference', 'result']);
  assert.deepEqual(readdirSync(join(dir, 'reference')), ['01.png']);
  const parts = readdirSync(join(dir, 'result')).sort();
  assert.equal(parts[0], '01.png');
  assert.ok(parts.length > 2 && parts.slice(1).every(name => /^02-\d+\.png$/.test(name)), parts.join(','));

  writeFileSync(join(root, '.omd/thin/cycles/1/eye.md'), 'Tell: every section is the same card formula (result/01-1.png, 01-2.png, 02.png).\n- the hero type is a template default (01-1.png)\nVerdict: no\n');
  const closed = omd(root, 'close', '--keep', 'public/assets/kiln.png', '--open', 'npm run dev', '--json');
  assert.equal(closed.status, 0, closed.stderr);
  const status = closed.json() as { state: ThinState; eye: { verdict: string }; nextCycleWouldArchive: string[] };
  assert.deepEqual([status.state.phase, status.state.reason, status.eye.verdict], ['stopped', 'one-cycle', 'tell']);
  assert.deepEqual(status.nextCycleWouldArchive, ['README.md', 'src/main.tsx', 'src/sections/hero.tsx']);
  assert.notEqual(omd(root, 'begin').status, 0, 'a stopped loop does not begin until the human goes on');

  assert.equal(omd(root, 'go', '--say', 'warmer, and keep the kiln').status, 0);
  assert.match(readFileSync(join(root, '.omd/thin/memo.md'), 'utf8'), /Human, after cycle 1: warmer, and keep the kiln/);
  const begun = omd(root, 'begin', '--json');
  assert.equal(begun.status, 0, begun.stderr);
  assert.equal((begun.json().state as ThinState).cycle, 2);
  assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), '# Kiln\n');
  assert.equal(existsSync(join(root, 'src')), false);
  assert.ok(existsSync(join(root, 'public/assets/kiln.png')));
  assert.match(readFileSync(join(root, 'package.json'), 'utf8'), /react/);
  assert.ok(existsSync(join(root, 'node_modules/x/index.js')));
  const archive = join(root, '.omd/thin/archive/cycle-1/files');
  assert.equal(readFileSync(join(archive, 'src/sections/hero.tsx'), 'utf8'), 'export {};\n');
  assert.equal(readFileSync(join(archive, 'README.md'), 'utf8'), '# Kiln, edited\n');
  assert.ok(existsSync(join(root, '.omd/thin/cycles/2/result')));
  assert.ok(existsSync(join(root, '.omd/thin/cycles/1/eye.md')), 'earlier cycle records stay');
});

test('a redesign restarts from its own before-state, including deleted files', t => {
  const root = project(t);
  write(root, 'src/App.tsx', 'export const App = () => null;\n');
  write(root, 'src/routes.ts', 'export const routes = ["/", "/orders"];\n');
  assert.equal(omd(root, 'start', '--kind', 'redesign', '--request', 'redesign the orders screen', '--continue').status, 0);
  assert.ok(existsSync(join(root, '.omd/thin/before')));
  write(root, 'src/App.tsx', 'export const App = () => "new";\n');
  rmSync(join(root, 'src/routes.ts'));
  write(root, '.omd/thin/cycles/1/result/a.png', png(1440, 900));
  const closed = omd(root, 'close', '--json');
  assert.equal((closed.json().state as ThinState).phase, 'next', 'continue mode with no eye answer goes on');
  assert.equal(omd(root, 'begin').status, 0);
  assert.equal(readFileSync(join(root, 'src/App.tsx'), 'utf8'), 'export const App = () => null;\n');
  assert.equal(readFileSync(join(root, 'src/routes.ts'), 'utf8'), 'export const routes = ["/", "/orders"];\n');
  assert.equal(readFileSync(join(root, '.omd/thin/archive/cycle-1/files/src/App.tsx'), 'utf8'), 'export const App = () => "new";\n');
});

test('the cold eye asks one question from one source, whole before part, and its answer still reads as tell or none', t => {
  const repo = new URL('..', import.meta.url).pathname;
  const agent = readBuildAgents(repo).find(a => a.name === 'omd-internal-cold-eye')!;
  assert.equal(COLD_EYE_QUESTION, agent.instructions.trim(), 'the CLI and Pi prompt are the agent\'s own words');
  const printed = spawnSync(process.execPath, [cli, 'thin', 'eye', '--prompt'], { cwd: project(t), encoding: 'utf8' });
  assert.equal(printed.stdout.trim(), COLD_EYE_QUESTION);
  assert.match(COLD_EYE_QUESTION, /whole before the parts/);
  assert.match(COLD_EYE_QUESTION, /^Tell: .*files where it shows/m);
  assert.match(COLD_EYE_QUESTION, /at most three smaller tells, one line each/);
  assert.match(COLD_EYE_QUESTION, /^Verdict: pass, close or no/m);
  assert.match(COLD_EYE_QUESTION, /"No tell\."/);
  const root = project(t);
  const answer = (text: string) => { write(root, eyeAnswerPath(1), text); return eyeVerdict(root, 1); };
  assert.equal(answer('Tell: one formula stamped on every section (result/01-1.png, 02-1.png).\n- pale metadata (03.png)\nVerdict: no\n'), 'tell');
  assert.equal(answer('No tell.\nVerdict: pass\n'), 'none');
  assert.equal(answer('**No tell.**\n'), 'none');
});

test('the cold eye on Pi gets only the packet images, from a neutral folder, on the session model', async t => {
  const root = project(t);
  write(root, 'packet/result/01.png', png(4, 4));
  write(root, 'packet/reference/01.png', png(4, 4));
  write(root, 'notes.md', 'rationale the eye must not see');
  const fake = join(root, 'fake-pi.mjs');
  writeFileSync(fake, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(join(root, 'argv.json'))}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));\nconsole.log('No tell.');\n`);
  const host = { node: process.execPath, cli: fake, provider: 'p', model: 'session-model' };
  assert.equal(await runPiColdEye(host, join(root, 'packet')), 'No tell.');
  const seen = JSON.parse(readFileSync(join(root, 'argv.json'), 'utf8')) as { argv: string[]; cwd: string };
  const files = seen.argv.filter(arg => arg.startsWith('@'));
  assert.equal(files.length, 2);
  assert.ok(files.every(file => file.startsWith(`@${seen.cwd}`) && !file.includes('.omd') && !file.includes(root)));
  assert.equal(existsSync(seen.cwd), false, 'the neutral folder is removed');
  const args = coldEyeArgs(host, []);
  for (const flag of ['--no-session', '--no-tools', '--no-extensions', '--no-skills', '--no-context-files']) assert.ok(args.includes(flag), flag);
  assert.equal(args[args.indexOf('--model') + 1], 'session-model');
});

test('a session started from omd-ultradesign is not gated, captures no workflow request and is never continued', async () => {
  const hooks = new Map<string, PortablePiHook>();
  const calls: string[][] = [];
  omdExtension({
    on: (name, hook) => { hooks.set(name, hook); }, registerCommand: () => {}, registerTool: () => {},
    execOwned(command, args, options) { return this.exec(command, args, options); },
    exec: async (_command, args) => { calls.push(args.slice(1)); return { stdout: '{"ok":false}', stderr: '', code: 1, killed: false }; },
  });
  const cwd = mkdtempSync(join(tmpdir(), 'omd-thin-pi-'));
  const legacy = mkdtempSync(join(tmpdir(), 'omd-thin-pi-legacy-'));
  const emit = (name: string, event: Parameters<PortablePiHook>[0], root = cwd) => hooks.get(name)!(event, { cwd: root });
  const final = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Cycle 1 is closed.' }] };
  try {
    // An earlier gated run left a route behind; the entry still runs ungated.
    mkdirSync(join(cwd, '.omd'), { recursive: true });
    writeFileSync(join(cwd, '.omd/route.json'), '{}');
    const text = '/skill:omd-ultradesign a launch page for Kiln';
    assert.equal(await emit('input', { source: 'interactive', text }), undefined);
    assert.equal(await emit('before_agent_start', { prompt: `<skill name="omd-ultradesign" location="/x">\n</skill>\n\n${text}` }), undefined);
    for (const [toolName, input] of [['write', { path: 'src/main.tsx' }], ['bash', { command: 'npm run build' }], ['request_user_input', {}]] as const) {
      assert.equal(await emit('tool_call', { toolName, input }), undefined, toolName);
    }
    assert.equal(await emit('message_end', { message: final }), undefined);
    assert.equal(await emit('input', { source: 'interactive', text: 'one more' }), undefined, 'a plain reply stays in the loop');
    assert.equal(await emit('tool_call', { toolName: 'write', input: { path: 'src/main.tsx' } }), undefined);
    assert.deepEqual(calls, []);
    assert.equal(existsSync(join(cwd, '.omd/request-source.json')), false);
    // The /ultradesign alias is the same entry.
    assert.deepEqual(await emit('input', { source: 'interactive', text: '/ultradesign one more' }), { action: 'transform', text: '/skill:omd-ultradesign one more' });

    // The older gates still guard a session that never invoked the entry, in a project with a route.
    mkdirSync(join(legacy, '.omd'), { recursive: true });
    writeFileSync(join(legacy, '.omd/route.json'), '{}');
    await emit('before_agent_start', { prompt: 'fix the header' }, legacy);
    assert.equal((await emit('tool_call', { toolName: 'write', input: { path: 'src/main.tsx' } }, legacy) as { block?: boolean }).block, true);
  } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(legacy, { recursive: true, force: true }); }
  assert.equal(isThinPrompt('/skill:omd-ultradesign build it'), true);
  assert.equal(isThinPrompt('$omd-ultradesign continue'), true);
  assert.equal(isThinPrompt('/ultradesign'), true);
  assert.equal(isThinPrompt('build me a page'), false);
});

test('on Pi a closed cycle opens one fresh session that invokes the entry skill', async t => {
  const root = project(t);
  write(root, '.omd/thin/state.json', JSON.stringify({ ...newThinState({ request: 'r', kind: 'product', continueMode: true }), phase: 'next' }));
  const hooks = new Map<string, (event: unknown, context: { cwd: string }) => Promise<unknown>>();
  let command: { handler(args: string, context: unknown): Promise<void> } | undefined;
  const sent: string[] = [];
  const sessions = new ThinSessions();
  registerThin({
    on: (name, hook) => { hooks.set(name, hook); },
    registerCommand: (name, definition) => { assert.equal(name, 'omd-ultradesign'); command = definition; },
    sendUserMessage: text => { sent.push(text); },
  }, sessions);
  await hooks.get('agent_settled')!({}, { cwd: root });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(sent, [], 'a session that never ran the entry is left alone');
  sessions.observe(root, '/skill:omd-ultradesign one more');
  await hooks.get('agent_settled')!({}, { cwd: root });
  await hooks.get('agent_settled')!({}, { cwd: root });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(sent, [`/${ENTRY_COMMAND}`]);
  const fresh: string[] = [];
  const context = { cwd: root, waitForIdle: async () => {},
    newSession: async (options: { withSession(context: unknown): Promise<void> }) => {
      await options.withSession({ sendUserMessage: async (text: string) => { fresh.push(text); } });
      return { cancelled: false };
    } };
  await command!.handler('', context);
  assert.deepEqual(fresh, ['/skill:omd-ultradesign fresh session: begin cycle 2']);
  // Typed with words, the same name hands them to the skill in this session.
  await command!.handler('continue', context);
  assert.deepEqual(sent.at(-1), '/skill:omd-ultradesign continue');
});

test('the user sees one skill; the loop internals are folded in or named internal', () => {
  const root = new URL('..', import.meta.url).pathname;
  assert.deepEqual(readdirSync(join(root, 'src/skills')), ['omd-ultradesign']);
  const skill = readFileSync(join(root, 'src/skills/omd-ultradesign/SKILL.md'), 'utf8');
  assert.doesNotMatch(skill, /omd-thin|thin-make|omd-cold-eye/);
  assert.match(skill, /`omd-internal-cold-eye`/);
  for (const doc of ['README.md', 'README.ko.md']) {
    assert.doesNotMatch(readFileSync(join(root, doc), 'utf8'), /omd-thin|thin-make|cold-eye|omd thin/, doc);
  }
});
