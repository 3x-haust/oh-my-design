import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  FIRST_RENDER_REVIEW_TASK,
  LEGACY_FIRST_RENDER_REVIEW_TASK,
  LEGACY_FIRST_RENDER_REVIEW_TASK_V4,
  LEGACY_FIRST_RENDER_REVIEW_TASK_V5,
  firstRenderReviewTaskForSchema,
} from '../core/design/first-render-review-contract.ts';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

test('first-render task history preserves every signed task generation', () => {
  assert.equal(sha256(LEGACY_FIRST_RENDER_REVIEW_TASK),
    'a9b33926861fda2dcbc671610ff51932ccf09f0f619769f065cb68fd60f49eb8');
  assert.equal(sha256(LEGACY_FIRST_RENDER_REVIEW_TASK_V4),
    'cd97fac2e8dbc51f342f1a9ef8af6abab67f6d2f57fdc5ce238e322b8ebf12fe');
  assert.equal(sha256(LEGACY_FIRST_RENDER_REVIEW_TASK_V5),
    '5b0cac7f46b9b6a694dde9eb0ae0f26fd34690d8475a83169bb939754c1643bd');
  assert.equal(firstRenderReviewTaskForSchema('first-render-review-v3'), LEGACY_FIRST_RENDER_REVIEW_TASK);
  assert.equal(firstRenderReviewTaskForSchema('first-render-review-v4'), LEGACY_FIRST_RENDER_REVIEW_TASK_V4);
  assert.equal(firstRenderReviewTaskForSchema('first-render-review-v5'), LEGACY_FIRST_RENDER_REVIEW_TASK_V5);
  assert.equal(firstRenderReviewTaskForSchema('first-render-review-v6'), FIRST_RENDER_REVIEW_TASK);
  assert.equal(firstRenderReviewTaskForSchema('first-render-review-v2'), null);
});
