import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PiReviewerRpc } from '../adapters/pi-reviewer-rpc.ts';
import { PI_REVIEWER_EVENT_PREFIX } from '../adapters/pi-reviewer-contract.ts';

test('Given a Pi extension stderr event When the marked event arrives Then the RPC channel accepts it without a model message', async () => {
  const event = { type: 'omd_reviewer_ready', sessionId: 'fresh-session' };
  const rpc = new PiReviewerRpc({ command: process.execPath, cwd: process.cwd(), env: {},
    args: ['-e', `process.stderr.write(${JSON.stringify(`${PI_REVIEWER_EVENT_PREFIX}${JSON.stringify(event)}\n`)});process.stdin.resume();`] });
  try {
    assert.deepEqual(await rpc.waitEvent('omd_reviewer_ready', 5_000), event);
    assert.equal(rpc.eventCount, 1);
    await rpc.finish();
  } finally { await rpc.dispose(); }
});

test('Given a child that closes stdin When a command is sent Then EPIPE rejects without crashing the supervisor', async () => {
  const rpc = new PiReviewerRpc({ command: process.execPath, cwd: process.cwd(), env: {}, processGroup: true,
    args: ['-e', 'require("node:fs").closeSync(0);process.stdout.write(JSON.stringify({type:"ready"})+"\\n");setInterval(()=>{},1000);'] });
  try {
    await rpc.waitEvent('ready', 5_000);
    await assert.rejects(rpc.request({ type: 'get_state' }), { code: 'EPIPE' });
  } finally { await rpc.dispose(); }
});

test('Given ordinary diagnostic JSON When no metadata prefix exists Then it never authenticates an extension event', async () => {
  const rpc = new PiReviewerRpc({ command: process.execPath, cwd: process.cwd(), env: {},
    args: ['-e', 'process.stderr.write(JSON.stringify({type:"omd_reviewer_ready"})+"\\n");process.stdout.write(JSON.stringify({type:"done"})+"\\n");process.stdin.resume();'] });
  try {
    await rpc.waitEvent('done', 5_000);
    assert.equal(rpc.events.some(event => event.type === 'omd_reviewer_ready'), false);
    await rpc.finish();
  } finally { await rpc.dispose(); }
});
