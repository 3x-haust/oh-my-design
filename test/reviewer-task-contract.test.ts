import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  FIRST_RENDER_REVIEW_TASK,
  LEGACY_FIRST_RENDER_REVIEW_TASK,
  LEGACY_FIRST_RENDER_REVIEW_TASK_V4,
  firstRenderReviewTaskForSchema,
} from '../core/design/first-render-review-contract.ts';
import { FINAL_RENDER_REVIEWER_TASK } from '../core/runtime/final-render-review.ts';
import { WORDS_TYPE_FLOW_REVIEW_CHECKLIST } from '../core/runtime/reviewer-task-checklist.ts';
import { measuredReviewerTask } from '../core/runtime/trusted-review-profile.ts';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

test('first-render task history preserves every signed task generation', () => {
  assert.equal(sha256(LEGACY_FIRST_RENDER_REVIEW_TASK),
    'a9b33926861fda2dcbc671610ff51932ccf09f0f619769f065cb68fd60f49eb8');
  assert.equal(sha256(LEGACY_FIRST_RENDER_REVIEW_TASK_V4),
    'cd97fac2e8dbc51f342f1a9ef8af6abab67f6d2f57fdc5ce238e322b8ebf12fe');
  assert.equal(firstRenderReviewTaskForSchema('first-render-review-v3'), LEGACY_FIRST_RENDER_REVIEW_TASK);
  assert.equal(firstRenderReviewTaskForSchema('first-render-review-v4'), LEGACY_FIRST_RENDER_REVIEW_TASK_V4);
  assert.equal(firstRenderReviewTaskForSchema('first-render-review-v5'), FIRST_RENDER_REVIEW_TASK);
  assert.equal(firstRenderReviewTaskForSchema('first-render-review-v2'), null);
  assert.equal(FIRST_RENDER_REVIEW_TASK, `${LEGACY_FIRST_RENDER_REVIEW_TASK_V4} ${WORDS_TYPE_FLOW_REVIEW_CHECKLIST}`);
});

test('current blind reviewer tasks carry the shared words type and flow checklist', () => {
  assert.ok(FINAL_RENDER_REVIEWER_TASK.endsWith(WORDS_TYPE_FLOW_REVIEW_CHECKLIST));
  assert.ok(measuredReviewerTask('blindLane').includes(WORDS_TYPE_FLOW_REVIEW_CHECKLIST));
  assert.equal(measuredReviewerTask('fidelityLane').includes(WORDS_TYPE_FLOW_REVIEW_CHECKLIST), false);
  assert.equal(measuredReviewerTask('protocolLane').includes(WORDS_TYPE_FLOW_REVIEW_CHECKLIST), false);
});
