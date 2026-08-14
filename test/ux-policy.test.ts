import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { finalizeFinalEvidence } from '../core/evidence/final.ts';
import { UxPolicyError, checkUxPolicy, parseUxPolicy } from '../core/ux/index.ts';

function assertPolicyError(run: () => unknown, code: UxPolicyError['code']): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof UxPolicyError);
    assert.equal(error.code, code);
    return true;
  });
}

test('existing final-evidence safety rejects legacy publication before project writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-ux-policy-baseline-'));
  const manifest = join(root, '.omd', 'malformed.json');
  try {
    mkdirSync(join(root, '.omd'), { recursive: true });
    writeFileSync(manifest, '{');

    assert.throws(() => finalizeFinalEvidence(root, manifest), /LEGACY_PUBLICATION_DISABLED/);
    assert.equal(existsSync(join(root, '.omd', 'final-evidence.json')), false);
    assert.equal(existsSync(join(root, '.omd', 'final-evidence-runs')), false);
    assert.equal(existsSync(join(root, '.omd', '.final-evidence.lock')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('policy keeps mandatory gates separate from justified recommendations and free choices', () => {
  const policy = parseUxPolicy({
    schema: 'ux-policy-v1',
    decisions: [
      { id: 'protect-user-data', kind: 'hard_safety_rail', status: 'enforced' },
      { id: 'complete-checkout', kind: 'required_outcome', status: 'required' },
      { id: 'reference-discovery', kind: 'recommended_method', status: 'skipped', reason: 'Existing validated references cover this change.' },
      { id: 'prototype-flow', kind: 'recommended_method', status: 'selected', reason: 'The interaction needs direct validation.' },
      { id: 'decorative-motion', kind: 'free_choice', status: 'skipped' },
    ],
  });

  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.decisions), true);
  assert.equal(policy.decisions.every(Object.isFrozen), true);
  assert.deepEqual(checkUxPolicy(policy), {
    status: 'accepted',
    enforcedRailIds: ['protect-user-data'],
    requiredOutcomeIds: ['complete-checkout'],
    recommendations: [
      { id: 'reference-discovery', status: 'skipped', reason: 'Existing validated references cover this change.' },
      { id: 'prototype-flow', status: 'selected', reason: 'The interaction needs direct validation.' },
    ],
    freeChoices: [{ id: 'decorative-motion', status: 'skipped' }],
  });
});

test('parsed policy is an immutable snapshot of input state', () => {
  const sourceDecision = {
    id: 'reference-discovery',
    kind: 'recommended_method',
    status: 'skipped',
    reason: 'Current evidence is sufficient.',
  };
  const source = { schema: 'ux-policy-v1', decisions: [sourceDecision] };
  const policy = parseUxPolicy(source);

  sourceDecision.status = 'selected';
  sourceDecision.reason = 'Changed after parsing.';
  source.decisions.length = 0;

  assert.deepEqual(checkUxPolicy(policy).recommendations, [
    { id: 'reference-discovery', status: 'skipped', reason: 'Current evidence is sufficient.' },
  ]);
});

test('policy rejects attempts to skip hard rails or required outcomes', () => {
  assertPolicyError(() => parseUxPolicy({
    schema: 'ux-policy-v1',
    decisions: [{ id: 'protect-user-data', kind: 'hard_safety_rail', status: 'skipped' }],
  }), 'HARD_SAFETY_RAIL_REQUIRED');

  assertPolicyError(() => parseUxPolicy({
    schema: 'ux-policy-v1',
    decisions: [{ id: 'complete-checkout', kind: 'required_outcome', status: 'skipped' }],
  }), 'REQUIRED_OUTCOME_REQUIRED');
});

test('recommended methods require a non-empty reason for either decision', () => {
  for (const decision of [
    { id: 'reference-discovery', kind: 'recommended_method', status: 'skipped' },
    { id: 'reference-discovery', kind: 'recommended_method', status: 'selected', reason: '   ' },
  ]) {
    assertPolicyError(() => parseUxPolicy({ schema: 'ux-policy-v1', decisions: [decision] }), 'RECOMMENDATION_REASON_REQUIRED');
  }
});

test('strict policy parsing rejects non-enumerable extra own properties', () => {
  const input = { schema: 'ux-policy-v1', decisions: [] };
  Object.defineProperty(input, 'hidden', { value: true });

  assertPolicyError(() => parseUxPolicy(input), 'MALFORMED_POLICY');
});

test('strict policy parsing rejects Symbol extra own properties', () => {
  const extra = Symbol('extra');
  const input = { schema: 'ux-policy-v1', decisions: [], [extra]: true };

  assertPolicyError(() => parseUxPolicy(input), 'MALFORMED_POLICY');
});

test('strict policy parsing rejects malformed fields and duplicate machine IDs', () => {
  assertPolicyError(() => parseUxPolicy({ schema: 'ux-policy-v1', decisions: 'invalid' }), 'MALFORMED_POLICY');
  assertPolicyError(() => parseUxPolicy({
    schema: 'ux-policy-v1',
    decisions: [
      { id: 'same-id', kind: 'free_choice', status: 'selected' },
      { id: 'same-id', kind: 'free_choice', status: 'skipped' },
    ],
  }), 'DUPLICATE_POLICY_ID');
  assertPolicyError(() => parseUxPolicy({
    schema: 'ux-policy-v1',
    decisions: [{ id: 'optional-layout', kind: 'free_choice', status: 'skipped', reason: 'not part of this contract' }],
  }), 'MALFORMED_POLICY');
});
