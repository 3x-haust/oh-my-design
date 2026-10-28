import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleOmdMessageEnd } from '../extensions/omd-message-end.ts';
import { RepairLoop } from '../extensions/omd-repair-progress.ts';
import { confidenceDebt } from '../core/brief/confidence-debt.ts';
import { hostCapabilityMatrix } from '../core/host-capability.ts';
import { formatCompletionHostCapabilities } from '../core/completion/host-capabilities.ts';

const debt = confidenceDebt('reference-board', 'Research sources were unavailable.');
function task(result: unknown, failed = false) {
  const commands: readonly string[][] = [];
  const mutable: string[][] = commands as string[][];
  return { commands, input: {
    cwd: '/private/tmp/omd-confidence-debt-host-test', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Delivered the application.' }] },
    run: async (args: readonly string[]) => {
      mutable.push([...args]);
      if (failed) throw new Error('OMD_CLI_FAILED (1): SLOP_REVIEW_REQUIRED: confirmed issues remain');
      return { text: JSON.stringify(result), details: { code: 0, killed: false } };
    },
    interrupted: () => false, hasRoute: true, workflowStarted: false, ownedWorkStarted: false,
    productionAttempted: false, revision: 0, routeRevision: 'a'.repeat(64), repairLoop: new RepairLoop(),
    pi: { registerTool() {}, registerCommand() {}, exec: async () => ({ stdout: '', stderr: '', code: 0, killed: false }) },
  } };
}

test('Pi completion cannot hide limitations even if the assistant omits them from its final message', async () => {
  const { input, commands } = task({ limitations: [debt] });
  const result = await handleOmdMessageEnd(input) as { message: { content: { text: string }[] } };
  assert.deepEqual(commands, [['guard', 'completion', '--json']]);
  assert.equal(result.message.content[0]!.text, input.message.content[0]!.text);
  assert.ok(result.message.content[1]!.text.includes(debt.stage));
  assert.ok(result.message.content[1]!.text.includes(debt.reason));
});

test('debt does not authorize a completion report when the actual terminal guard refuses', async () => {
  const { input } = task({ limitations: [debt] }, true);
  const before = structuredClone(input.message);
  const result = await handleOmdMessageEnd(input) as { message: { content: { text: string }[] } };
  assert.deepEqual(input.message, before);
  assert.ok(!result.message.content.some(part => part.text === input.message.content[0]!.text));
  assert.ok(result.message.content.some(part => part.text.includes('SLOP_REVIEW_REQUIRED')));
});

test('successful completion appends the exact host enforcement report even without design debt', async () => {
  const hostCapabilities = hostCapabilityMatrix({ host: 'pi', piHooksPresent: true });
  const { input } = task({ limitations: [], hostCapabilities });
  const result = await handleOmdMessageEnd(input) as { message: { content: { text: string }[] } };
  assert.equal(result.message.content[1]!.text, formatCompletionHostCapabilities(hostCapabilities));
});

test('legacy debt-free completion without a matrix leaves the authorized message unchanged', async () => {
  const { input } = task({ limitations: [] });
  const before = structuredClone(input.message);
  assert.equal(await handleOmdMessageEnd(input), undefined);
  assert.deepEqual(input.message, before);
});

test('a stalled first-render report keeps the agent report and asks for no further repair', async () => {
  const stage = { schema: 'stage-next-v2', stage: 'independent-review', owner: 'coordinator', action: 'report-stalled-first-render',
    next: null, instruction: 'Stop repairing; report the remaining findings.', problems: ['FIRST_RENDER_LOOP_STALLED', 'persistent-findings'],
    progress: { routeSha256: 'b'.repeat(64), validatedStages: [], materialProgressIdentities: [] } };
  const { input, commands } = task(stage);
  const sent: unknown[] = [];
  const result = await handleOmdMessageEnd({ ...input, workflowStarted: true,
    pi: { ...input.pi, sendMessage: (message: unknown) => { sent.push(message); } } }) as { message: { content: { text: string }[] } };
  assert.deepEqual(commands, [['stage', 'next', '--json']]);
  assert.equal(result.message.content[0]!.text, 'Delivered the application.');
  assert.match(result.message.content[1]!.text, /not verified completion[\s\S]*persistent-findings/);
  assert.deepEqual(sent, []);
});

test('current terminal evidence lets the guard decide the report instead of asking for another repair', async () => {
  const stage = { schema: 'stage-next-v2', stage: null, owner: 'coordinator', action: 'report-completion',
    next: 'omd guard completion --json', instruction: 'Terminal evidence is current. Run the completion guard before reporting completion.',
    problems: [], progress: { routeSha256: 'b'.repeat(64), validatedStages: [], materialProgressIdentities: [] } };
  const commands: string[][] = [];
  const { input } = task(stage);
  const sent: unknown[] = [];
  const result = await handleOmdMessageEnd({ ...input, workflowStarted: true,
    run: async (args: readonly string[]) => {
      commands.push([...args]);
      return { text: JSON.stringify(args[0] === 'stage' ? stage : { limitations: [debt] }), details: { code: 0, killed: false } };
    },
    pi: { ...input.pi, sendMessage: (message: unknown) => { sent.push(message); } } }) as { message: { content: { text: string }[] } };
  assert.deepEqual(commands, [['stage', 'next', '--json'], ['guard', 'completion', '--json']]);
  assert.equal(result.message.content[0]!.text, 'Delivered the application.');
  assert.ok(result.message.content[1]!.text.includes(debt.reason));
  assert.deepEqual(sent, []);
});

