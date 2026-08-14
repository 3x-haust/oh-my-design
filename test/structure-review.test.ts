import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  DESIGN_REVIEW_SCHEMA,
  DesignStructureReviewError,
  parseStructureReview,
  structureReviewSha256,
  type DesignReviewIdentity,
  type DesignStructureReviewErrorCode,
} from '../core/design-development/structure-review.ts';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const identity = (id: string, actor: 'artifact-producer' | 'independent-reviewer') => ({
  actor, id, processId: `process:${id}`, sessionId: `session:${id}`, nonce: `nonce:${id}`,
  configurationSha256: sha(`configuration:${id}`),
});
const inputs = () => [
  { path: '.omd/workflow/content-state.json', schema: 'content-state-model-v1', sha256: sha('content-state') },
  { path: '.omd/workflow/structure.json', schema: 'structural-wireframe-v1', sha256: sha('structure') },
  { path: '.omd/workflow/structure-mobile.png', schema: 'monochrome-structural-render-v1', sha256: sha('mobile structure') },
];
const current = () => ({
  planSha256: sha('workflow-plan'), producer: identity('producer', 'artifact-producer'),
  inputs: inputs(), usedReviewerIdentities: [] as DesignReviewIdentity[],
});
const valid = () => ({
  schema: DESIGN_REVIEW_SCHEMA, lens: 'structure', planSha256: sha('workflow-plan'),
  reviewer: identity('structure-reviewer', 'independent-reviewer'), inputs: [...inputs()].reverse(),
  verdict: 'pass',
  findings: [{ axis: 'responsive-order', severity: 'advisory', evidence: 'The mobile action follows the work object in semantic and visual order.' }],
  authority: 'workflow-support-only', cannotSubstitute: ['final-v2'],
});

function throwsCode(run: () => unknown, code: DesignStructureReviewErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof DesignStructureReviewError);
    assert.equal(error.code, code);
    return true;
  });
}

test('structure review accepts current structural proof inputs and only structural findings', () => {
  const source = valid();
  const parsed = parseStructureReview(source, current());
  source.findings[0]!.evidence = 'mutated';

  assert.equal(parsed.findings[0]?.axis, 'responsive-order');
  assert.deepEqual(parsed.inputs.map(({ path }) => path), inputs().map(({ path }) => path).sort());
  assert.match(structureReviewSha256(parsed), /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.reviewer), true);
});

test('structure review rejects styled, palette, typography, media, material, motion, and craft inputs or axes', () => {
  for (const schema of ['styled-render-v1', 'palette-proof-v1', 'typography-proof-v1', 'motion-filmstrip-v1']) {
    const expressiveInput = valid();
    expressiveInput.inputs[0] = { ...expressiveInput.inputs[0]!, schema };
    const expected = { ...current(), inputs: expressiveInput.inputs };
    throwsCode(() => parseStructureReview(expressiveInput, expected), 'STRUCTURE_REVIEW_EXPRESSION_INPUT');
  }
  for (const axis of ['typography', 'color', 'media', 'material', 'motion', 'craft']) {
    const expressiveAxis = valid();
    expressiveAxis.findings[0]!.axis = axis;
    throwsCode(() => parseStructureReview(expressiveAxis, current()), 'STRUCTURE_REVIEW_EXPRESSION_AXIS');
  }
});

test('structure review binds the exact current plan and complete proof receipt set', () => {
  const stalePlan = valid();
  stalePlan.planSha256 = sha('stale plan');
  throwsCode(() => parseStructureReview(stalePlan, current()), 'STRUCTURE_REVIEW_STALE_PLAN');

  const staleInput = valid();
  staleInput.inputs[0]!.sha256 = sha('stale input');
  throwsCode(() => parseStructureReview(staleInput, current()), 'STRUCTURE_REVIEW_STALE_INPUT');

  const omitted = valid();
  omitted.inputs.pop();
  throwsCode(() => parseStructureReview(omitted, current()), 'STRUCTURE_REVIEW_STALE_INPUT');
});

test('structure reviewer identity is independent and fresh across process, session, nonce, and configuration', () => {
  for (const field of ['id', 'processId', 'sessionId', 'nonce', 'configurationSha256'] as const) {
    const reused = valid();
    reused.reviewer[field] = current().producer[field];
    throwsCode(() => parseStructureReview(reused, current()), 'STRUCTURE_REVIEW_REUSED_IDENTITY');
  }

  const prior = identity('prior-reviewer', 'independent-reviewer');
  const reusedPrior = valid();
  reusedPrior.reviewer.sessionId = prior.sessionId;
  throwsCode(
    () => parseStructureReview(reusedPrior, { ...current(), usedReviewerIdentities: [prior] }),
    'STRUCTURE_REVIEW_REUSED_IDENTITY',
  );
});

test('blocking findings force revise and structure review has supporting authority only', () => {
  const falsePass = valid();
  falsePass.findings[0]!.severity = 'blocking';
  throwsCode(() => parseStructureReview(falsePass, current()), 'STRUCTURE_REVIEW_VERDICT_MISMATCH');

  const substitution = valid();
  substitution.authority = 'final-v2';
  throwsCode(() => parseStructureReview(substitution, current()), 'STRUCTURE_REVIEW_MALFORMED');

  const revise = valid();
  revise.verdict = 'revise';
  revise.findings[0]!.severity = 'blocking';
  assert.equal(parseStructureReview(revise, current()).verdict, 'revise');
});
