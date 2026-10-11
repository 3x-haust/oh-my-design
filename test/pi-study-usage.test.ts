import assert from 'node:assert/strict';
import test from 'node:test';
import { observeSourceStudyUsage, parseSourceStudyUsage } from '../adapters/pi-study-usage.ts';

const usage = { input: 10, output: 5, cacheRead: 20, cacheWrite: 0, totalTokens: 35 };

test('canonical assistant messages are counted once without folding cache replay into input', () => {
  const messages = [{ role: 'user' }, { role: 'assistant', usage }, { role: 'toolResult' },
    { role: 'assistant', usage }];
  assert.deepEqual(observeSourceStudyUsage({ data: { messages }, events: messages }), {
    assistantMessages: 2, input: 20, output: 10, cacheRead: 40, cacheWrite: 0, totalTokens: 70,
  });
});

test('incomplete or malformed provider usage remains unmeasured rather than a partial zero total', () => {
  for (const incomplete of [undefined, { ...usage, output: undefined }, { ...usage, input: -1 },
    { ...usage, totalTokens: 1.5 }]) {
    assert.equal(observeSourceStudyUsage({ data: { messages: [
      { role: 'assistant', usage }, { role: 'assistant', usage: incomplete },
    ] } }), null);
  }
  assert.equal(parseSourceStudyUsage(null), null);
});

test('stored usage rejects unknown counters and invalid signed values', () => {
  const value = { assistantMessages: 1, ...usage };
  assert.deepEqual(parseSourceStudyUsage(value), value);
  assert.throws(() => parseSourceStudyUsage({ ...value, estimated: true }));
  assert.throws(() => parseSourceStudyUsage({ ...value, output: -1 }));
});
