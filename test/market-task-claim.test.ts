import assert from 'node:assert/strict';
import test from 'node:test';
import { assessedTaskCapability, selfRootTaskClaim } from '../core/ref/market-task-claim.ts';

test('legacy text cannot establish task capability', async () => {
  for (const text of ['Global welfare benefits service for residents.', 'We do not provide welfare benefits.',
    '한국 주민을 위한 복지 혜택 서비스입니다.', 'Õnnestus!']) {
    assert.equal(selfRootTaskClaim('public benefits', text), 'unclear');
  }
  const result = await assessedTaskCapability('https://example.org/service');
  assert.equal(result.decision, 'unclear');
  assert.ok(result.limitation);
});
