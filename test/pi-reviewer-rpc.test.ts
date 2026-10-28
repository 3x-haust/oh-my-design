import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PiReviewerRpc } from '../adapters/pi-reviewer-rpc.ts';
import { PI_REVIEWER_EVENT_PREFIX, PiReviewerError } from '../adapters/pi-reviewer-contract.ts';

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

test('Given rejected RPC responses When a command fails Then bounded remote diagnostics survive without payload data', async () => {
  for (const response of [
    { success: false, error: 'RPC_FAIL_SENTINEL', data: 'PRIVATE_PAYLOAD_SENTINEL' },
    { error: { code: -32000, message: 'E'.repeat(2100), data: 'PRIVATE_PAYLOAD_SENTINEL' } },
  ]) {
    const rpc = new PiReviewerRpc({ command: process.execPath, cwd: process.cwd(), env: {},
      args: ['-e', `require("node:readline").createInterface({input:process.stdin}).on("line",line=>{const request=JSON.parse(line);process.stdout.write(JSON.stringify({...${JSON.stringify(response)},id:request.id})+"\\n")});`] });
    try {
      await assert.rejects(rpc.request({ jsonrpc: '2.0', method: 'tools/call' }), error => {
        assert.ok(error instanceof PiReviewerError);
        assert.equal(error.code, 'rpc-command-failed');
        const diagnosticOffset = error.message.indexOf('{');
        assert.ok(diagnosticOffset >= 0);
        const diagnostic = JSON.parse(error.message.slice(diagnosticOffset));
        assert.deepEqual(diagnostic, {
          type: 'rpc-response', event: 'tools/call',
          error: typeof response.error === 'string' ? response.error : 'E'.repeat(2000),
          ...(typeof response.error === 'string' ? {} : { reason: '-32000' }),
        });
        assert.equal(error.message.includes('PRIVATE_PAYLOAD_SENTINEL'), false);
        return true;
      });
      await rpc.finish();
    } finally { await rpc.dispose(); }
  }
});
