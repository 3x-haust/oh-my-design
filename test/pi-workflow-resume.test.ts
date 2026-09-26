import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { harness } from './helpers/pi-stage-continuity.ts';

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
  assert.deepEqual(h.commands.at(-1), ['stage', 'next', '--json']);
  assert.deepEqual(h.sent, ['omd-stage-repair']);
});

test('RPC resume restores the same authorized workflow', async t => {
  const h = await authorizedWorkflow(t);
  await h.emit('input', { source: 'rpc' });
  await h.activate('Continue.');
  await h.end();
  assert.deepEqual(h.sent, ['omd-stage-repair']);
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

test('Escape ends the current turn without repair but a later explicit resume can continue it', async t => {
  const h = await authorizedWorkflow(t);
  const before = h.commands.length;
  await h.emit('message_end', { message: { role: 'assistant', stopReason: 'aborted', content: [] } });
  assert.equal(h.commands.length, before);
  assert.deepEqual(h.sent, []);
  await h.emit('input', { source: 'interactive' });
  await h.activate('계속해');
  await h.end();
  assert.deepEqual(h.sent, ['omd-stage-repair']);
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
  assert.deepEqual(h.commands.at(-1), ['stage', 'next', '--json']);
  assert.deepEqual(h.sent, ['omd-stage-repair']);
});

test('explicit resume without a route cannot start an OMD workflow', async t => {
  const h = harness(t, false);
  await h.activate('Continue the OMD build.');
  await h.end();
  assert.deepEqual(h.commands, []);
  assert.deepEqual(h.sent, []);
});
