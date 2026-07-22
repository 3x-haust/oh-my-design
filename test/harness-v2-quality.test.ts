import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateHarnessV2Quality, type HarnessV2QualityInputs } from '../core/eval-harness/index.ts';

function quality(overrides: Partial<HarnessV2QualityInputs> = {}): HarnessV2QualityInputs {
  return {
    motionDecision: 'none',
    protocolUx: { protocol: 'GREEN', ux: 'GREEN' },
    blind: { signature: 'GREEN', narrative: 'GREEN', motionFit: 'GREEN' },
    fidelity: { decisionFit: 'GREEN' },
    critical: {
      conceptSpecificForm: { score: 3, verdict: 'GREEN' }, compositionRhythm: { score: 3, verdict: 'GREEN' },
      narrativeDependency: { score: 3, verdict: 'GREEN' }, macroVisualLanding: { score: 3, verdict: 'GREEN' },
      staticReferenceInfluence: { score: 3, verdict: 'GREEN' }, templateInfluence: { score: 3, verdict: 'GREEN' },
    },
    ...overrides,
  };
}

test('none requires static/template influence while one requires motion influence', () => {
  assert.equal(evaluateHarnessV2Quality(quality()).gate, 'pass');
  const one = quality({ motionDecision: 'one', critical: {
    conceptSpecificForm: { score: 3, verdict: 'GREEN' }, compositionRhythm: { score: 3, verdict: 'GREEN' },
    narrativeDependency: { score: 3, verdict: 'GREEN' }, macroVisualLanding: { score: 3, verdict: 'GREEN' },
    motionInfluence: { score: 3, verdict: 'GREEN' },
  } });
  assert.equal(evaluateHarnessV2Quality(one).gate, 'pass');
});

test('critical RED never averages away', () => {
  const input = quality();
  input.critical.macroVisualLanding = { score: 5, verdict: 'RED' };
  const verdict = evaluateHarnessV2Quality(input);
  assert.equal(verdict.gate, 'fail');
  assert.ok(verdict.failedCriteria.includes('macro visual landing'));
});

test('critical score two never averages away', () => {
  const input = quality();
  input.critical.narrativeDependency = { score: 2, verdict: 'GREEN' };
  const verdict = evaluateHarnessV2Quality(input);
  assert.equal(verdict.gate, 'fail');
  assert.ok(verdict.failedCriteria.includes('narrative dependency'));
});

test('protocol/UX, blind, and fidelity lanes are conjunctive', () => {
  const verdict = evaluateHarnessV2Quality(quality({
    protocolUx: { protocol: 'GREEN', ux: 'RED' },
    blind: { signature: 'GREEN', narrative: 'RED', motionFit: 'GREEN' },
    fidelity: { decisionFit: 'RED' },
  }));
  assert.equal(verdict.gate, 'fail');
  assert.deepEqual(verdict.failedCriteria.slice(0, 3), ['ux', 'blind narrative', 'fidelity decision-fit']);
});
