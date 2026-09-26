import assert from 'node:assert/strict';
import test from 'node:test';
import { withNativeCommandSignal } from '../bin/native-command-signal.ts';

test('native command forwards interruption and removes its listeners after child cleanup', async () => {
  const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  await assert.rejects(withNativeCommandSignal(async signal => {
    process.emit('SIGTERM');
    signal.throwIfAborted();
  }), /OMD_NATIVE_COMMAND_CANCELLED/);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), before);
  assert.equal(await withNativeCommandSignal(async signal => { assert.equal(signal.aborted, false); return 'complete'; }), 'complete');
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), before);
});
