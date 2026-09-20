import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import omdExtension, { type PortablePiHook, type PortablePiTool } from '../extensions/omd.ts';

const final = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: '작업을 완료했습니다.' }] };
function harness(t: { after(fn: () => void): void }) {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-progress-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const hooks = new Map<string, PortablePiHook>();
  const sent: unknown[] = [];
  let tool: PortablePiTool | undefined;
  let duringDiagnosis: (() => Promise<unknown>) | undefined;
  const work = { schema: 'stage-next-v1', stage: 'copy', action: 'repair-output',
    progress: { routeSha256: 'a'.repeat(64), validatedStages: [] as string[] } };
  omdExtension({
    on: (name, handler) => { hooks.set(name, handler); }, registerCommand() {}, registerTool: value => { tool = value; },
    sendMessage: message => { sent.push(message); },
    async exec(_command, args) {
      if (args[1] === 'route' && args[2] === 'classify') writeFileSync(join(cwd, '.omd/route.json'), '{}');
      if (args[1] === 'stage') await duringDiagnosis?.();
      return { stdout: args[1] === 'stage' ? JSON.stringify(work) : '{}', stderr: '', code: 0, killed: false };
    },
  });
  async function emit(name: string, event: Parameters<PortablePiHook>[0]) {
    const hook = hooks.get(name); assert.ok(hook); return hook(event, { cwd });
  }
  async function start() {
    await emit('before_agent_start', { prompt: 'omd-ultradesign' });
    await emit('tool_call', { toolName: 'write', input: { path: '.omd/.cache/route.json' } });
    mkdirSync(join(cwd, '.omd/.cache'), { recursive: true });
    assert.ok(tool);
    await tool.execute('route', { args: ['route', 'classify', '--input', '.omd/.cache/route.json'] }, undefined, undefined, { cwd });
    await tool.execute('brief', { args: ['brief', 'domain', '--check'] }, undefined, undefined, { cwd });
  }
  return { work, sent, emit, start, end: () => emit('message_end', { message: final }),
    interruptDuringDiagnosis: () => { duringDiagnosis = () => emit('input', { source: 'interactive' }); } };
}

test('new validated stage progress renews bounded repair but repeats and cycles do not', async t => {
  const h = harness(t); await h.start();
  await h.end(); await h.end(); await h.end();
  assert.equal(h.sent.length, 2);
  h.work.progress.validatedStages = ['domain'];
  await h.end(); await h.end(); await h.end();
  assert.equal(h.sent.length, 4, 'a validated stage must not inherit an exhausted global counter');
  h.work.progress.validatedStages = []; await h.end();
  h.work.progress.validatedStages = ['domain']; await h.end();
  assert.equal(h.sent.length, 4, 'revalidating a previously credited stage is not new progress');
  h.work.stage = 'frame'; await h.end();
  assert.equal(h.sent.length, 4, 'a different error/stage without validated progress earns nothing');
  h.work.progress.routeSha256 = 'b'.repeat(64);
  h.work.progress.validatedStages = ['domain', 'frame']; await h.end();
  assert.equal(h.sent.length, 4, 'changing the route cannot manufacture repair credit');
});

test('interactive input during an awaited diagnosis prevents the old task from scheduling work', async t => {
  const h = harness(t); await h.start();
  h.interruptDuringDiagnosis();
  assert.equal(await h.end(), undefined);
  assert.equal(h.sent.length, 0);
});
