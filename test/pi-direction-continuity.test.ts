import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import omdExtension, { type PortablePiEvent, type PortablePiHook, type PortablePiTool } from '../extensions/omd.ts';
import { PiRequestBindings } from '../extensions/omd-request-binding.ts';
import { capturePiRequest, readPiRequest } from '../extensions/omd-request-source.ts';
import { publishCandidatePacket, publishCandidateSelection, readCurrentCandidateSelection } from '../core/brief/candidate-choice.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { fixture, renderedSet, snapshot, userChoice, write, pack, type Fixture } from './helpers/phase6-process.ts';
function signal() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function host(f: Fixture) {
  const hooks = new Map<string, PortablePiHook>(), sent: string[] = [], commands: string[][] = [];
  let tool: PortablePiTool | undefined;
  let hold: { started: ReturnType<typeof signal>; release: ReturnType<typeof signal> } | undefined;
  omdExtension({ on: (name, hook) => { hooks.set(name, hook); }, registerCommand() {}, registerTool(t) { tool = t; }, sendMessage(m) { sent.push(m.customType); },
    async exec(_command, argv) {
      const args = argv.slice(1); commands.push(args);
      if (hold && args[0] === 'route' && args[1] === 'show') { hold.started.resolve(); await hold.release.promise; return { stdout: '{}', stderr: '', code: 0, killed: false }; }
      if (args[0] === 'stage') return { stdout: JSON.stringify(nextStageWork(f.root, pack, f.invocation)), stderr: '', code: 0, killed: false };
      if (args[0] === 'candidate' && args[1] === 'select') {
        const input = JSON.parse(readFileSync(args[args.indexOf('--input') + 1]!, 'utf8'));
        return { stdout: JSON.stringify(publishCandidateSelection(f.root, input, f.writer, f.invocation)), stderr: '', code: 0, killed: false };
      }
      throw new Error(`unexpected automatic command ${args.join(' ')}`);
    } });
  const emit = (name: string, event: PortablePiEvent) => hooks.get(name)?.(event, { cwd: f.root });
  const input = async (text: string, source = 'interactive') => { await emit('input', { text, source }); await emit('before_agent_start', { prompt: text }); };
  return { sent, commands, emit, input,
    run: (args: string[]) => tool!.execute('command', { args }, undefined, undefined, { cwd: f.root }),
    end: () => emit('message_end', { message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Ready.' }] } }),
    hold: () => { hold = { started: signal(), release: signal() }; return hold; },
  };
}
test('typed pending direction returns actual images and schedules zero repair/acquisition/completion; real input resumes the original scope', async t => {
  const f = fixture(t), set = await renderedSet(f), packet = publishCandidatePacket(f.root, set, f.writer, f.invocation), h = host(f);
  await h.input(`/skill:omd-ultradesign ${f.route.request}`);
  const request = readPiRequest(f.root)!;
  await h.input('continue build');
  const before = snapshot(f.root), output = await h.end() as { message: { content: { type: string }[] } };
  assert.equal(output.message.content.filter(p => p.type === 'image').length, 4);
  assert.deepEqual(h.commands, [['stage', 'next', '--json']]); assert.deepEqual(h.sent, []);
  assert.deepEqual(snapshot(f.root), before);
  // A second message does not present or schedule the same checkpoint again.
  assert.equal(await h.end(), undefined); assert.deepEqual(h.sent, []);
  const input = userChoice(f, packet); write(f.root, '.omd/.cache/choice.json', JSON.stringify(input));
  const invalidBefore = snapshot(f.root);
  await assert.rejects(h.run(['candidate', 'select', '--input', '.omd/.cache/choice.json', '--json']), /actual user direction/);
  assert.deepEqual(snapshot(f.root), invalidBefore);
  await h.input('  I choose B.\n', 'rpc');
  assert.equal(readPiRequest(f.root)!.recordSha256, request.recordSha256);
  await h.run(['candidate', 'select', '--input', '.omd/.cache/choice.json', '--json']);
  const choice = readCurrentCandidateSelection(f.root);
  assert.equal(choice.decision.decidedBy === 'user' && choice.decision.userMessage, '  I choose B.\n');
});

test('tools/assistant text/continue/ambiguity/cancel cannot choose; restart restores the durable pending set, not a queued answer', async t => {
  const f = fixture(t), set = await renderedSet(f), packet = publishCandidatePacket(f.root, set, f.writer, f.invocation);
  capturePiRequest(f.root, f.route.request);
  const binding = new PiRequestBindings(), input = userChoice(f, packet);
  write(f.root, '.omd/.cache/choice.json', JSON.stringify(input));
  const args = ['candidate', 'select', '--input', '.omd/.cache/choice.json', '--json'];
  for (const event of [{ source: 'tool', text: 'B' }, { source: 'assistant', text: 'I choose B' }, { source: 'interactive', text: 'continue' }, { source: 'interactive', text: 'A or B' }, { source: 'interactive', text: '"I choose B"' }]) {
    binding.receive(f.root, event); binding.activate(f.root, event.text);
    const before = snapshot(f.root);
    assert.throws(() => binding.materialize(f.root, args, undefined), /actual user direction/);
    assert.deepEqual(snapshot(f.root), before);
  }
  binding.receive(f.root, { source: 'interactive', text: 'cancel' }); binding.activate(f.root, 'cancel');
  binding.receive(f.root, { source: 'interactive', text: 'B' }); binding.activate(f.root, 'B');
  const before = snapshot(f.root); assert.throws(() => binding.materialize(f.root, args, undefined)); assert.deepEqual(snapshot(f.root), before);
  binding.clear(); // Restart preserves signed cancellation; old workflow authority cannot return.
  binding.receive(f.root, { source: 'interactive', text: 'I choose B' }); assert.equal(binding.activate(f.root, 'I choose B'), false);
  const restarted = snapshot(f.root); assert.throws(() => binding.materialize(f.root, args, undefined)); assert.deepEqual(snapshot(f.root), restarted);
  binding.receive(f.root, { source: 'interactive', text: 'resume build' }); binding.activate(f.root, 'resume build');
  binding.receive(f.root, { source: 'interactive', text: 'I choose B' }); assert.equal(binding.activate(f.root, 'I choose B'), true);
  const materialized = binding.materialize(f.root, args, undefined);
  try { publishCandidateSelection(f.root, JSON.parse(readFileSync(materialized.args[materialized.args.indexOf('--input') + 1]!, 'utf8')), f.writer, f.invocation); }
  finally { materialized.dispose(); }
  assert.equal(readCurrentCandidateSelection(f.root).selectedId, 'B');
});

test('queued acquisition cannot cross a typed direction pause and authorized selection still succeeds', { timeout: 120_000 }, async t => {
  const f = fixture(t), set = await renderedSet(f), packet = publishCandidatePacket(f.root, set, f.writer, f.invocation), h = host(f);
  capturePiRequest(f.root, f.route.request);
  const hold = h.hold(), reading = h.run(['route', 'show', '--json']);
  await hold.started.promise;
  const before = snapshot(f.root), queued = h.run(['ref', 'advance', '--json']);
  const refused = assert.rejects(queued, /NEEDS_USER_DIRECTION|CANCELLED/);
  await h.input('I choose B'); hold.release.resolve(); await reading; await refused;
  assert.deepEqual(snapshot(f.root), before);
  assert.equal(h.commands.some(c => c[0] === 'ref'), false);
  write(f.root, '.omd/.cache/choice.json', JSON.stringify(userChoice(f, packet)));
  await h.run(['candidate', 'select', '--input', '.omd/.cache/choice.json', '--json']);
  assert.equal(readCurrentCandidateSelection(f.root).selectedId, 'B');
});
