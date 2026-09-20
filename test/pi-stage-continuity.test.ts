import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import omdExtension, { type PortablePiEvent, type PortablePiHook, type PortablePiTool } from '../extensions/omd.ts';

const final = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Finished.' }] };
const isBlocked = (value: unknown): boolean => typeof value === 'object' && value !== null && 'block' in value && value.block === true;
type Event = PortablePiEvent & { toolCallId?: string; isError?: boolean };

function harness(t: { after(fn: () => void): void }, routed = true) {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-pi-continuity-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.omd/.cache'), { recursive: true });
  if (routed) writeFileSync(join(cwd, '.omd/route.json'), '{}');
  const hooks = new Map<string, PortablePiHook>();
  const commands: string[][] = [];
  const sent: string[] = [];
  const blockedStages = new Set<string>();
  const unselected = new Set<string>();
  let tool: PortablePiTool | undefined;
  let publicationFails = false;
  let nextStage: string | null = 'reference-board';
  let sequence = 0;
  omdExtension({
    on: (name, hook) => { hooks.set(name, hook); },
    registerCommand() {}, registerTool: value => { tool = value; },
    sendMessage: value => { sent.push(value.customType); },
    async exec(_command, argv) {
      const args = argv.slice(1); commands.push([...args]);
      const stage = args[1] ?? '';
      if (args[0] === 'brief') {
        const blockers = blockedStages.has(stage) ? ['upstream reference-board: missing application evidence'] : [];
        const selected = !unselected.has(stage);
        return { stdout: JSON.stringify({ stage, entryGate: { selected }, blockers }), stderr: '',
          code: args.includes('--check') && (blockers.length > 0 || !selected) ? 1 : 0, killed: false };
      }
      if (args[0] === 'stage') return { stdout: JSON.stringify({ schema: 'stage-next-v1', stage: nextStage,
        owner: nextStage === null ? null : 'omd-scout', action: 'repair-output', progress: { routeSha256: 'a'.repeat(64), validatedStages: ['domain', 'frame'] } }), stderr: '', code: 0, killed: false };
      if (args[0] === 'guard') return { stdout: JSON.stringify({ blockers: ['reference research/application missing'] }), stderr: '', code: 1, killed: false };
      return { stdout: '{}', stderr: publicationFails ? 'publisher failed' : '', code: publicationFails ? 1 : 0, killed: false };
    },
  });
  async function emit(name: string, event: Event) { return hooks.get(name)?.(event, { cwd }); }
  async function run(args: string[]) {
    assert.ok(tool);
    await emit('tool_call', { toolName: 'omd_cli', input: { args } });
    return tool.execute('cli', { args }, undefined, undefined, { cwd });
  }
  async function write(path: string, failed = false) {
    const toolCallId = `native-${++sequence}`;
    const event = { toolName: 'write', toolCallId, input: { path, content: 'new owner output' } };
    const refusal = await emit('tool_call', event);
    if (isBlocked(refusal)) return refusal;
    if (!failed) { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), 'new owner output'); }
    await emit('tool_result', { ...event, isError: failed });
    return refusal;
  }
  return { cwd, commands, sent, blockedStages, unselected, emit, run, write,
    activate: (prompt = '/skill:omd-ultradesign Build this product') => emit('before_agent_start', { prompt }),
    end: () => emit('message_end', { message: final }),
    failPublication: () => { publicationFails = true; },
    noNextStage: () => { nextStage = null; } };
}

test('persisted route enters stage-first continuation after checked owned publication in this full workflow', async t => {
  const h = harness(t); await h.activate();
  await h.run(['route', 'classify', '--input', '.omd/.cache/existing.json']);
  await h.run(['brief', 'frame', '--check', '--json']);
  await h.run(['frame', 'set', '--input', '.omd/.cache/frame.json']);
  await h.emit('tool_call', { toolName: 'write', input: { path: 'src/app.ts' } });
  await h.end();
  assert.deepEqual(h.commands.at(-1), ['stage', 'next', '--json']);
  assert.deepEqual(h.sent, ['omd-stage-repair']);
});

test('successful native selected-stage authoring enters the current full workflow', async t => {
  const h = harness(t); await h.activate();
  await h.run(['brief', 'copy', '--check', '--json']);
  await h.write('.omd/copy-deck.md'); await h.end();
  assert.deepEqual(h.sent, ['omd-stage-repair']);
  assert.equal(readFileSync(join(h.cwd, '.omd/copy-deck.md'), 'utf8'), 'new owner output');
});

test('direct selected output writes refuse failed entry before changing bytes', async t => {
  for (const [stage, path] of [['composition', '.omd/composition.md'], ['copy', '.omd/copy-deck.md'],
    ['type-proof', '.omd/type-proof.md'], ['scout', '.omd/scout.md']]) {
    assert.ok(stage); assert.ok(path);
    const h = harness(t); await h.activate(); h.blockedStages.add(stage);
    writeFileSync(join(h.cwd, path), 'preserve current output');
    assert.equal(isBlocked(await h.write(path)), true, stage);
    assert.equal(readFileSync(join(h.cwd, path), 'utf8'), 'preserve current output', stage);
    assert.ok(h.commands.some(args => args.join(' ') === `brief ${stage} --check --json`));
  }
});

test('an earlier entry check does not bypass current upstream failure on native edits', async t => {
  const h = harness(t); await h.activate();
  await h.run(['brief', 'composition', '--check', '--json']);
  h.blockedStages.add('composition');
  const refusal = await h.emit('tool_call', { toolName: 'edit', toolCallId: 'edit', input: { path: '.omd/composition.md' } });
  assert.equal(isBlocked(refusal), true);
});

test('cache inputs, initial domain authoring, unselected outputs and standalone documents remain authorable', async t => {
  const h = harness(t); await h.activate(); h.blockedStages.add('composition'); h.unselected.add('scout');
  for (const path of ['.omd/.cache/composition.json', '.omd/domain-brief.json', '.omd/scout.md']) {
    assert.equal(isBlocked(await h.write(path)), false, path);
  }
  const standalone = harness(t, false); await standalone.activate('/skill:omd-scout Research only');
  standalone.blockedStages.add('scout');
  assert.equal(isBlocked(await standalone.write('.omd/scout.md')), false);
  assert.equal(standalone.commands.length, 0);
});

test('read-only inspection and classification with entry alone do not start a persisted workflow', async t => {
  const h = harness(t); await h.activate();
  await h.run(['route', 'classify', '--input', '.omd/.cache/existing.json']);
  await h.run(['stage', 'resume', '--json']);
  await h.run(['brief', 'frame', '--check', '--json']);
  await h.end();
  assert.equal(h.commands.some(args => args[0] === 'stage' && args[1] === 'next'), false);
  assert.deepEqual(h.sent, []);
});

test('research-only stage entry and output never authorize the full persisted workflow', async t => {
  const h = harness(t); await h.activate('/skill:omd-scout Research only');
  await h.run(['brief', 'scout', '--check', '--json']);
  await h.write('.omd/scout.md'); await h.end();
  assert.equal(h.commands.some(args => args[0] === 'stage' && args[1] === 'next'), false);
  assert.deepEqual(h.sent, []);
});

test('failed publisher and native write outcomes do not establish owned work', async t => {
  const publisher = harness(t); await publisher.activate();
  await publisher.run(['brief', 'frame', '--check', '--json']); publisher.failPublication();
  await assert.rejects(publisher.run(['frame', 'set', '--input', '.omd/.cache/frame.json']));
  await publisher.end(); assert.deepEqual(publisher.sent, []);
  const native = harness(t); await native.activate();
  await native.run(['brief', 'copy', '--check', '--json']);
  await native.write('.omd/copy-deck.md', true); await native.end();
  assert.deepEqual(native.sent, []);
});

test('a checked different stage does not authorize a successful publisher as owned work', async t => {
  const h = harness(t); await h.activate();
  await h.run(['brief', 'frame', '--check', '--json']);
  await h.run(['ref', 'board', '--input', '.omd/.cache/board.json']);
  await h.end(); assert.deepEqual(h.sent, []);
});

test('publisher help and a stage that is now unselected cannot enroll owned work', async t => {
  const help = harness(t); await help.activate();
  await help.run(['brief', 'frame', '--check', '--json']);
  await help.run(['frame', 'set', '--help']);
  await help.write('.omd/.cache/note.txt'); await help.end();
  assert.deepEqual(help.sent, []);
  const unselected = harness(t); await unselected.activate();
  await unselected.run(['brief', 'copy', '--check', '--json']);
  unselected.unselected.add('copy');
  assert.equal(isBlocked(await unselected.write('.omd/copy-deck.md')), false);
  await unselected.end(); assert.deepEqual(unselected.sent, []);
});

test('interactive input revokes pending native success and previous full-workflow activation', async t => {
  const h = harness(t); await h.activate();
  await h.run(['brief', 'copy', '--check', '--json']);
  const event = { toolName: 'write', toolCallId: 'late-write', input: { path: '.omd/copy-deck.md' } };
  await h.emit('tool_call', event);
  await h.emit('input', { source: 'interactive' });
  await h.emit('before_agent_start', { prompt: 'Only report status' });
  await h.emit('tool_result', { ...event, isError: false });
  await h.end(); assert.deepEqual(h.sent, []);
});

test('an enrolled null work pointer checks completion without scheduling production', async t => {
  const h = harness(t); await h.activate();
  await h.run(['brief', 'frame', '--check', '--json']);
  await h.run(['frame', 'set', '--input', '.omd/.cache/frame.json']);
  h.noNextStage(); await h.end();
  assert.deepEqual(h.commands.slice(-2), [['stage', 'next', '--json'], ['guard', 'completion', '--json']]);
  assert.deepEqual(h.sent, []);
});
