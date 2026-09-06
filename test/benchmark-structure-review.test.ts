import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STRUCTURE_REVIEW_AXES,
  parseStructureReview,
} from '../core/design-development/structure-review.ts';

const SHA = 'a'.repeat(64);

test('structure review owns benchmark fit and domain specificity', () => {
  assert.ok(STRUCTURE_REVIEW_AXES.includes('benchmark-fit'));
  assert.ok(STRUCTURE_REVIEW_AXES.includes('domain-specificity'));

  const inputReceipt = {
    path: '.omd/structural-wireframe.json',
    schema: 'structural-wireframe-v1',
    sha256: 'b'.repeat(64),
  };
  const producer = {
    actor: 'artifact-producer' as const,
    id: 'producer-a',
    processId: 'producer-process',
    sessionId: 'producer-session',
    nonce: 'producer-nonce',
    configurationSha256: 'c'.repeat(64),
  };
  const review = parseStructureReview({
    schema: 'design-review-v1',
    lens: 'structure',
    planSha256: SHA,
    reviewer: {
      actor: 'independent-reviewer',
      id: 'reviewer-a',
      processId: 'reviewer-process',
      sessionId: 'reviewer-session',
      nonce: 'reviewer-nonce',
      configurationSha256: 'd'.repeat(64),
    },
    inputs: [inputReceipt],
    verdict: 'revise',
    findings: [
      {
        axis: 'domain-specificity',
        severity: 'blocking',
        evidence: 'work object and recovery remain cross-domain interchangeable',
      },
    ],
    authority: 'workflow-support-only',
    cannotSubstitute: ['final-v2'],
  }, {
    planSha256: SHA,
    producer,
    inputs: [inputReceipt],
    usedReviewerIdentities: [],
  });
  assert.equal(review.verdict, 'revise');
});

