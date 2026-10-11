import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyJudgment, type JudgmentPolicy } from '../core/judgment/index.ts';
import test from 'node:test';
import { harness } from './helpers/pi-stage-continuity.ts';
import { WorkflowResume } from '../extensions/omd-workflow-resume.ts';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const policy: JudgmentPolicy = { purpose: 'workflow-continuation', decisions: ['resume', 'pause', 'cancel'], authorRoles: ['coordinator'], sourceKinds: ['user-turn'], fields: ['text'], requiredSourceKinds: ['user-turn'], mode: 'advisory', parsePayload: value => value };
async function judged(text: string, decision: string) {
  const context = { requestSha256: hash('request'), sourceContractSha256: null, questionDigest: null, documentSha256: null };
  return verifyJudgment({ schema: 'ai-judgment-v1', purpose: 'workflow-continuation', subjectId: 'turn', context, decision,
    reason: 'Current user decision', quotes: [{ source: { kind: 'user-turn', sessionId: 's', turnId: 't', sha256: hash(text) }, field: 'text', itemId: null, text }], evidence: [], payload: null }, policy,
    { ...context, resolve: async (_ref, field, itemId) => ({ ...context, sha256: hash(text), text, field, itemId }) });
}
async function authorizedWorkflow(t: { after(fn: () => void): void }) {
  const h = harness(t);
  await h.activate();
  await h.run(['brief', 'frame', '--check', '--json']);
  await h.run(['frame', 'set', '--input', '.omd/.cache/frame.json']);
  return h;
}

test('explicit resume continues previously authorized stage work after interactive state reset', async t => {
  const h = await authorizedWorkflow(t);
  await h.emit('input', { source: 'interactive' });
  await h.activate('계속해');
  await h.end();
  assert.deepEqual(h.sent, [], 'unverified user text does not authorize automatic continuation');
});

test('RPC resume restores the same authorized workflow', async t => {
  const h = await authorizedWorkflow(t);
  await h.emit('input', { source: 'rpc' });
  await h.activate('Continue.');
  await h.end();
  assert.deepEqual(h.sent, [], 'RPC text alone is not a verified decision');
});

test('status inspection keeps the suspended workflow read-only', async t => {
  const h = await authorizedWorkflow(t);
  await h.emit('input', { source: 'interactive' });
  await h.activate('Only report status; do not continue.');
  const before = h.commands.length;
  await h.run(['stage', 'next', '--json']);
  await h.end();
  assert.deepEqual(h.commands.slice(before), [['stage', 'next', '--json']]);
  assert.deepEqual(h.sent, []);
});

test('an explicit stop request revokes the suspended workflow before a bare resume', async t => {
  const h = await authorizedWorkflow(t);
  await h.emit('input', { source: 'interactive' });
  await h.activate('멈춰');
  await h.emit('input', { source: 'interactive' });
  await h.activate('계속해');
  const before = h.commands.length;
  await h.end();
  assert.equal(h.commands.length, before);
  assert.deepEqual(h.sent, []);
});

for (const prompt of ['Stop the build.', 'Cancel the OMD build.', 'Pause implementation please.',
  '작업 중단해 주세요', 'OMD 개발을 취소해 주세요', '복구 작업 멈춰줘',
  'Stop the build workflow.', 'Cancel the OMD repair task.', 'Pause implementation work please.']) {
  test(`explicit stop phrase revokes the suspended workflow: ${prompt}`, async t => {
    const h = await authorizedWorkflow(t);
    await h.emit('input', { source: 'interactive' });
    await h.activate(prompt);
    await h.emit('input', { source: 'interactive' });
    await h.activate('continue');
    await h.end();
    assert.deepEqual(h.sent, []);
  });
}

test('the same phrases require a verified current-turn continuation judgment', async () => {
  const identity = { cwd: '/test', routeSha256: 'a'.repeat(64) };
  for (const subject of ['build', 'implementation', 'repair']) for (const suffix of ['', ' workflow', ' task', ' work']) {
    for (const prefix of ['', 'the ', 'OMD ', 'the OMD ']) for (const verb of ['Stop', 'Cancel', 'Pause']) {
      const workflow = new WorkflowResume();
      const object = `${prefix}${subject}${suffix}`;
      const continuation = `Continue ${object}.`;
      assert.equal(workflow.accepts({ ...identity, prompt: continuation }), false);
      assert.equal(workflow.accepts({ ...identity, prompt: continuation, judgment: await judged(continuation, 'resume') }), true);
      const stop = `${verb} ${object}.`;
      assert.equal(workflow.accepts({ ...identity, prompt: stop, judgment: await judged(stop, 'cancel') }), false);
      assert.equal(workflow.accepts({ ...identity, prompt: 'continue' }), false, object);
    }
  }
});

test('Escape ends the current turn without repair but a later explicit resume can continue it', async t => {
  const h = await authorizedWorkflow(t);
  const before = h.commands.length;
  await h.emit('message_end', { message: { role: 'assistant', stopReason: 'aborted', content: [] } });
  assert.equal(h.commands.length, before);
  assert.deepEqual(h.sent, []);
  await h.emit('input', { source: 'interactive' });
  await h.activate('계속해');
  await h.end();
  assert.deepEqual(h.sent, []);
});

test('a changed route cannot inherit an earlier workflow resume', async t => {
  const h = await authorizedWorkflow(t);
  await h.emit('input', { source: 'interactive' });
  writeFileSync(join(h.cwd, '.omd/route.json'), '{"route":"replacement"}');
  await h.activate('계속해');
  await h.end();
  assert.deepEqual(h.sent, []);
});

test('route replacement before the next input cannot gain the previous authorization', async t => {
  const h = await authorizedWorkflow(t);
  writeFileSync(join(h.cwd, '.omd/route.json'), '{"route":"replacement"}');
  await h.emit('input', { source: 'interactive' });
  await h.activate('계속해');
  await h.end();
  assert.deepEqual(h.sent, []);
});

test('a bare resume after host restart cannot manufacture workflow authorization', async t => {
  const h = await authorizedWorkflow(t);
  await h.emit('session_start', {});
  await h.activate('계속해');
  await h.end();
  assert.deepEqual(h.sent, []);
});

test('explicit build continuation authorizes existing route recovery after host restart', async t => {
  const h = await authorizedWorkflow(t);
  await h.emit('session_start', {});
  await h.activate('Continue the OMD build.');
  await h.end();
  assert.deepEqual(h.sent, [], 'host restart cannot infer intent from prose');
});

test('explicit resume without a route cannot start an OMD workflow', async t => {
  const h = harness(t, false);
  await h.activate('Continue the OMD build.');
  await h.end();
  assert.deepEqual(h.commands, []);
  assert.deepEqual(h.sent, []);
});
