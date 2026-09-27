import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRoleDelivery } from './helpers/prompt-delivery.ts';
import { loadRoleProfile } from '../core/brief/profiles.ts';
import { validateCurrentCopyReview } from '../core/copy/index.ts';
import { createHash } from 'node:crypto';

test('copy author and isolated copy-editor receive separate emitted profiles', () => {
  assertRoleDelivery('writer'); assertRoleDelivery('eye');
  assert.equal(loadRoleProfile('omd-eye', 'copy-editor').file, 'eye/copy-editor.md');
  assert.notEqual(loadRoleProfile('omd-eye', 'copy-editor').sha256, loadRoleProfile('omd-eye', 'production-visual').sha256);
});

test('copy review closure binds the exact reviewed deck rather than a later rewritten hash', () => {
  const deck = Buffer.from('Exact reviewed surface copy.');
  const sha = createHash('sha256').update(deck).digest('hex');
  const report = `Mode: copy-editor\nReview time: 2026-09-27T00:00:00Z\nReviewed copy-deck SHA-256: ${sha}\nVerdict: CLEAN\nFindings:\nNo factual mismatch observed.\n`;
  assert.deepEqual(validateCurrentCopyReview(report, deck), []);
  assert.ok(validateCurrentCopyReview(report, Buffer.from('Changed surface copy.')).length > 0);
});
