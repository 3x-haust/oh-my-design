import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleOmdMessageEnd } from '../extensions/omd-message-end.ts';
import { RepairLoop } from '../extensions/omd-repair-progress.ts';
import { confidenceDebt } from '../core/brief/confidence-debt.ts';

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

test('debt-free successful completion leaves the authorized message unchanged', async () => {
  const { input } = task({ limitations: [] });
  const before = structuredClone(input.message);
  assert.equal(await handleOmdMessageEnd(input), undefined);
  assert.deepEqual(input.message, before);
});
