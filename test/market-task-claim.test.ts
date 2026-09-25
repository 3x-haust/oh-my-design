import assert from 'node:assert/strict';
import test from 'node:test';
import { selfRootTaskClaim } from '../core/ref/market-task-claim.ts';

test('direct market self-root needs a page-owned task claim', () => {
  assert.equal(selfRootTaskClaim('public benefits', 'Global public restaurant service for residents.'), false);
  assert.equal(selfRootTaskClaim('public benefits', 'Home\nGlobal benefits service for residents.'), true);
  assert.equal(selfRootTaskClaim('public benefits', 'Benefits service for residents.'), true);
  assert.equal(selfRootTaskClaim('public benefits', '복지로\n복지 혜택 서비스를 찾고 신청을 준비하는 한국 주민을 위한 안내입니다.'), true);
});

test('task denial excludes the named service without rejecting other-audience limits', () => {
  assert.equal(selfRootTaskClaim('public benefits', 'Global welfare benefits service for residents. We do not provide welfare benefits.'), false);
  assert.equal(selfRootTaskClaim('public benefits', 'Global welfare benefits service for residents. No benefits are offered to nonresidents.'), true);
  assert.equal(selfRootTaskClaim('public benefits', 'Global welfare benefits service for residents. No welfare benefits are available to visitors and residents.'), false);
  assert.equal(selfRootTaskClaim('flight booking', 'Global flight booking service for residents. We do not offer flight booking; only tracking is available.'), false);
  assert.equal(selfRootTaskClaim('flight booking', 'Global flight booking service for residents. No flight booking for visitors.'), true);
});
