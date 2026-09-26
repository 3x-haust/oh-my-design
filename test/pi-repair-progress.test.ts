import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  const calls: string[][] = [];
  let tool: PortablePiTool | undefined;
  let duringDiagnosis: (() => Promise<unknown>) | undefined;
  let referenceMutation: ((args: readonly string[]) => number) | undefined;
  let diagnosisFails = false;
  const work = { schema: 'stage-next-v1', stage: 'copy', owner: 'omd-writer', action: 'repair-output',
    next: 'omd brief copy --check --json',
    instruction: 'Repair the copy deck, publish its current review, then run the named check.',
    problems: ['copy review is stale'], entryBlockers: [] as string[],
    progress: { routeSha256: 'a'.repeat(64), validatedStages: [] as string[] } };
  omdExtension({
    on: (name, handler) => { hooks.set(name, handler); }, registerCommand() {}, registerTool: value => { tool = value; },
    sendMessage: message => { sent.push(message); },
    async exec(_command, args) {
      calls.push([...args]);
      if (args[1] === 'route' && args[2] === 'classify') writeFileSync(join(cwd, '.omd/route.json'), '{}');
      if (args[1] === 'stage') {
        await duringDiagnosis?.();
        if (diagnosisFails) return { stdout: '', stderr: 'stage diagnosis unavailable', code: 1, killed: false };
      }
      const code = args[1] === 'ref' ? referenceMutation?.(args) ?? 0 : 0;
      return { stdout: args[1] === 'stage' ? JSON.stringify(work) : '{}', stderr: '', code, killed: false };
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
  return { cwd, work, sent, calls, emit, start, run: (args: string[]) => {
    assert.ok(tool); return tool.execute(args.join('-'), { args }, undefined, undefined, { cwd });
  }, end: () => emit('message_end', { message: final }),
    interruptDuringDiagnosis: () => { duringDiagnosis = () => emit('input', { source: 'interactive' }); },
    failDiagnosis: () => { diagnosisFails = true; },
    onReferenceMutation: (callback: (args: readonly string[]) => number) => { referenceMutation = callback; } };
}

test('missing reference board advances a native discovery action instead of only retrying checks', async t => {
  const h = harness(t); await h.start();
  Object.assign(h.work, {
    stage: 'reference-board', owner: 'omd-scout', action: 'author-output', next: 'omd ref work-next --json',
    referenceWork: { schema: 'reference-discovery-work-v1', status: 'action', workSha256: 'b'.repeat(64),
      action: { kind: 'direct-entry', args: ['ref', 'navigate', 'https://mobbin.com/explore/screens', '--lane', 'design', '--entry', 'free-gallery', '--json'], reason: 'Inspect a free public gallery list.' } },
  });
  await h.end();
  assert.ok(h.calls.some(args => args[1] === 'ref' && args[2] === 'advance'),
    'Pi must execute an owned native acquisition step before another diagnostic turn');
});

test('an outstanding reference action refuses repeated diagnostics without publishing a board', async t => {
  const h = harness(t); await h.start();
  Object.assign(h.work, {
    stage: 'reference-board', owner: 'omd-scout', action: 'acquire-reference', next: 'omd ref advance --json',
    referenceWork: { schema: 'reference-discovery-work-v1', status: 'action', workSha256: 'c'.repeat(64),
      action: { kind: 'direct-entry', args: ['ref', 'advance', '--json'], reason: 'Inspect a public gallery list.' } },
  });
  await h.end();
  const before = h.calls.length;
  const refusal = await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['ref', 'discover-plan', '--json'] } }) as { block: boolean; reason: string };
  assert.equal(refusal.block, true);
  assert.match(refusal.reason, /OMD_OWNED_WORK_REQUIRED/);
  assert.equal(h.calls.length, before, 'refused diagnostics must not execute the CLI');
  assert.equal(existsSync(join(h.cwd, '.omd/reference-board.json')), false);
});

test('Scout can inspect ref work-next while reference work is pending', async t => {
  const h = harness(t); await h.start();
  Object.assign(h.work, { stage: 'reference-board', referenceWork: {
    schema: 'reference-discovery-work-v1', status: 'action', workSha256: 'c'.repeat(64),
    action: { kind: 'direct-entry', args: ['ref', 'navigate', 'https://example.test/', '--json'], reason: 'Inspect source.' },
  } });
  await h.end();
  const inspection = await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['ref', 'work-next', '--json'] } });
  assert.equal(inspection, undefined);
});

test('failed or unchanged reference mutations keep the pending-work refusal', async t => {
  const h = harness(t); await h.start();
  Object.assign(h.work, { stage: 'reference-board', referenceWork: {
    schema: 'reference-discovery-work-v1', status: 'action', workSha256: 'c'.repeat(64),
    action: { kind: 'direct-entry', args: ['ref', 'navigate', 'https://example.test/', '--json'], reason: 'Inspect source.' },
  } });
  await h.end();
  h.onReferenceMutation(args => args[2] === 'navigate' ? 1 : 0);
  await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['ref', 'navigate', 'https://example.test/', '--json'] } });
  await assert.rejects(h.run(['ref', 'navigate', 'https://example.test/', '--json']));
  const afterFailure = await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['stage', 'next', '--json'] } }) as { block: boolean };
  assert.equal(afterFailure.block, true);
  h.onReferenceMutation(() => 0);
  await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['ref', 'add', '--input', 'unrelated.json'] } });
  await h.run(['ref', 'add', '--input', 'unrelated.json']);
  const afterUnchanged = await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['stage', 'next', '--json'] } }) as { block: boolean };
  assert.equal(afterUnchanged.block, true);
});

test('successful reference mutation clears pending refusal when work digest advances', async t => {
  const h = harness(t); await h.start();
  Object.assign(h.work, { stage: 'reference-board', referenceWork: {
    schema: 'reference-discovery-work-v1', status: 'action', workSha256: 'c'.repeat(64),
    action: { kind: 'direct-entry', args: ['ref', 'navigate', 'https://example.test/', '--json'], reason: 'Inspect source.' },
  } });
  await h.end();
  h.onReferenceMutation(args => {
    if (args[2] === 'navigate') Object.assign(h.work, { referenceWork: {
      schema: 'reference-discovery-work-v1', status: 'action', workSha256: 'd'.repeat(64),
      action: { kind: 'direct-entry', args: ['ref', 'navigate', 'https://example.test/', '--json'], reason: 'Inspect source.' },
    } });
    return 0;
  });
  await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['ref', 'navigate', 'https://example.test/', '--json'] } });
  const beforeResult = await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['stage', 'next', '--json'] } }) as { block: boolean };
  assert.equal(beforeResult.block, true, 'a planned mutation is not evidence of completed work');
  await h.run(['ref', 'navigate', 'https://example.test/', '--json']);
  const next = await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['stage', 'next', '--json'] } });
  assert.equal(next, undefined);
});

test('reference board publication clears pending refusal when the board changes', async t => {
  const h = harness(t); await h.start();
  Object.assign(h.work, { stage: 'reference-board', referenceWork: {
    schema: 'reference-discovery-work-v1', status: 'ready', workSha256: 'c'.repeat(64),
    action: { kind: 'board', args: ['ref', 'board', '--input', 'board.json'], reason: 'Publish assembled references.' },
  } });
  await h.end();
  h.onReferenceMutation(args => {
    if (args[2] === 'board') writeFileSync(join(h.cwd, '.omd/reference-board.json'), '{"published":true}');
    return 0;
  });
  await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['ref', 'board', '--input', 'board.json'] } });
  await h.run(['ref', 'board', '--input', 'board.json']);
  const next = await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['stage', 'next', '--json'] } });
  assert.equal(next, undefined);
});

test('successful reference mutation preserves its result when progress diagnosis fails', async t => {
  const h = harness(t); await h.start();
  Object.assign(h.work, { stage: 'reference-board', referenceWork: {
    schema: 'reference-discovery-work-v1', status: 'action', workSha256: 'c'.repeat(64),
    action: { kind: 'direct-entry', args: ['ref', 'navigate', 'https://example.test/', '--json'], reason: 'Inspect source.' },
  } });
  await h.end();
  h.failDiagnosis();
  await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['ref', 'navigate', 'https://example.test/', '--json'] } });
  const result = await h.run(['ref', 'navigate', 'https://example.test/', '--json']);
  assert.equal(result.details.code, 0);
  assert.equal(result.content[0]?.text, '{}');
  const next = await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['stage', 'next', '--json'] } }) as { block: boolean };
  assert.equal(next.block, true, 'unknown work state must remain pending until message-end recovery');
});

test('failed internal stage diagnosis releases stale pending refusal for recovery', async t => {
  const h = harness(t); await h.start();
  Object.assign(h.work, { stage: 'reference-board', referenceWork: {
    schema: 'reference-discovery-work-v1', status: 'action', workSha256: 'c'.repeat(64),
    action: { kind: 'direct-entry', args: ['ref', 'navigate', 'https://example.test/', '--json'], reason: 'Inspect source.' },
  } });
  await h.end();
  h.failDiagnosis();
  await h.end();
  const next = await h.emit('tool_call', { toolName: 'omd_cli', input: { args: ['stage', 'next', '--json'] } });
  assert.equal(next, undefined);
});

test('legacy exhausted reference discovery queues bounded recovery without executing unauthored inputs', async t => {
  const h = harness(t); await h.start();
  Object.assign(h.work, {
    stage: 'reference-board', owner: 'omd-scout', action: 'resolve-external-blocker', next: 'REFERENCE_DISCOVERY_EXHAUSTED',
    referenceWork: { schema: 'reference-discovery-work-v1', status: 'exhausted', workSha256: 'd'.repeat(64),
      code: 'REFERENCE_DISCOVERY_EXHAUSTED', action: null,
      attempts: [{ lane: 'design', url: 'https://example-gallery.test/', reason: 'login wall',
        receipt: { path: '.omd/discovery/design/attempts/receipt.json', sha256: 'e'.repeat(64) } }] },
  });
  const held = await h.end() as { message: { content: Array<{ type: string; text: string }> } };
  const text = held.message.content.find(part => part.type === 'text')?.text ?? '';
  assert.match(text, /REFERENCE_DISCOVERY_EXHAUSTED/);
  assert.match(text, /https:\/\/example-gallery\.test\//);
  assert.equal(h.sent.length, 1);
  assert.equal(h.calls.some(args => args[1] === 'ref'), false);
  await h.end(); await h.end(); await h.end();
  assert.equal(h.sent.length, 3, 'unchanged recovery evidence must eventually stop automatic retries');
});

test('replanning reference discovery queues its owner without running the unauthored batch', async t => {
  const h = harness(t); await h.start();
  Object.assign(h.work, {
    stage: 'reference-board', owner: 'omd-scout', action: 'replan-discovery',
    next: 'omd ref discover-batch --input .omd/.cache/reference-recovery-batch.json --recovery --json',
    referenceWork: { schema: 'reference-discovery-work-v1', status: 'action', workSha256: 'e'.repeat(64),
      action: { kind: 'replan-discovery', args: ['ref', 'discover-batch', '--input', '.omd/.cache/reference-recovery-batch.json', '--recovery', '--json'],
        reason: 'Author fresh qualified acquisition work from current failure evidence.' } },
  });
  await h.end();
  assert.equal(h.sent.length, 1);
  assert.equal(h.calls.some(args => args[1] === 'ref'), false);
});

test('distinct advancing work pointers continue beyond the former two-pass ceiling', async t => {
  const h = harness(t); await h.start();
  for (const [stage, action, validatedStages] of [
    ['domain', 'repair-output', []],
    ['frame', 'author-output', ['domain']],
    ['reference-board', 'author-research', ['domain', 'frame']],
    ['reference-board', 'apply-references', ['domain', 'frame']],
    ['reference-interpretation', 'interpret-references', ['domain', 'frame', 'reference-board']],
    ['copy', 'repair-output', ['domain', 'frame', 'reference-board']],
  ] as const) {
    h.work.stage = stage;
    h.work.action = action;
    h.work.progress.validatedStages = [...validatedStages];
    await h.end();
  }
  assert.equal(h.sent.length, 6, 'real stage/substage advancement must not inherit a fixed global retry ceiling');
});

test('a visible continuation names the current owner, action and next validation before raw diagnostics', async t => {
  const h = harness(t); await h.start();
  const held = await h.end() as { message: { content: Array<{ type: string; text: string }> } };
  const firstParagraph = (held.message.content.find(part => part.type === 'text')?.text ?? '').split('\n\n')[0] ?? '';
  assert.match(firstParagraph, /omd-writer/);
  assert.match(firstParagraph, /repair-output/);
  assert.match(firstParagraph, /omd brief copy --check --json/);
  const followUp = h.sent[0] as { content: string };
  assert.match(followUp.content, /Repair the copy deck, publish its current review/);
  assert.doesNotMatch(followUp.content, /"schema":"stage-next-v1"/);
});

test('a successful mutating OMD publication counts as progress after the stage loop stalls', async t => {
  const h = harness(t); await h.start();
  await h.end(); await h.end(); await h.end(); await h.end();
  assert.equal(h.sent.length, 3);
  await h.run(['frame', 'set', '--input', '.omd/.cache/frame.json']);
  await h.end();
  assert.equal(h.sent.length, 4, 'successful CLI publication must advance the repair revision');
});

test('an unchanged work pointer stops only after repeated no-progress turns', async t => {
  const h = harness(t); await h.start();
  await h.end(); await h.end(); await h.end(); await h.end();
  assert.equal(h.sent.length, 3, 'the initial repair plus two recovery turns are allowed before a verified stall');
  const held = await h.end() as { message: { content: Array<{ type: string; text: string }> } };
  assert.match(held.message.content.find(part => part.type === 'text')?.text ?? '', /진전|progress/i);
  h.work.progress.routeSha256 = 'b'.repeat(64);
  h.work.stage = 'frame';
  await h.end();
  assert.equal(h.sent.length, 3, 'changing route identity cannot manufacture repair progress');
});

test('interactive input during an awaited diagnosis prevents the old task from scheduling work', async t => {
  const h = harness(t); await h.start();
  h.interruptDuringDiagnosis();
  assert.equal(await h.end(), undefined);
  assert.equal(h.sent.length, 0);
});

test('completion repair state cannot cross a replaced route', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-completion-scope-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, '.omd'), { recursive: true });
  writeFileSync(join(cwd, '.omd/route.json'), '{"route":"first"}');
  const hooks = new Map<string, PortablePiHook>();
  const sent: unknown[] = [];
  omdExtension({
    on: (name, handler) => { hooks.set(name, handler); }, registerCommand() {}, registerTool() {},
    sendMessage: message => { sent.push(message); },
    async exec(_command, args) {
      if (args[1] === 'stage') return { stdout: '{}', stderr: '', code: 0, killed: false };
      if (args[1] === 'guard' && args[2] === 'production') return { stdout: '{"ok":true}', stderr: '', code: 0, killed: false };
      return { stdout: '{"blockers":["copy deck missing"]}', stderr: '', code: 1, killed: false };
    },
  });
  const emit = (name: string, event: Parameters<PortablePiHook>[0]) => hooks.get(name)!(event, { cwd });
  await emit('before_agent_start', { prompt: 'omd-ultradesign' });
  mkdirSync(join(cwd, 'src'), { recursive: true });
  await emit('tool_call', { toolName: 'write', toolCallId: 'source', input: { path: 'src/main.jsx' } });
  writeFileSync(join(cwd, 'src/main.jsx'), 'source');
  await emit('tool_result', { toolName: 'write', toolCallId: 'source', input: { path: 'src/main.jsx' }, isError: false });
  await emit('message_end', { message: final });
  assert.equal(sent.length, 1);
  writeFileSync(join(cwd, '.omd/route.json'), '{"route":"replacement"}');
  await emit('message_end', { message: final });
  assert.equal(sent.length, 1, 'route replacement must stall the prior completion loop');
});
