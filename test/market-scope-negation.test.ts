import assert from 'node:assert/strict';
import test from 'node:test';
import { assessedMarketScope, negatesMarketScope } from '../core/ref/market-scope-negation.ts';

test('legacy text cannot authorize or deny market scope', async () => {
  for (const text of ['This service does not serve users in South Korea', 'No service is available outside South Korea',
    '대한민국에서는 이 서비스를 이용할 수 없습니다', 'Õnnestus!']) {
    assert.equal(negatesMarketScope(text, ['South Korea']), 'unclear');
  }
  const result = await assessedMarketScope('https://example.org/service');
  assert.equal(result.decision, 'unclear');
  assert.ok(result.limitation);
});
