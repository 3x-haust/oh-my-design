import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOutput, evaluateRefinementLoop } from '../core/eval-harness/index.ts';
import type { EvalHarnessInputs } from '../core/eval-harness/index.ts';

// ── Positive: winner "after" passes the gate ────────────────────────────────

test('winner "after" (confident register, default) passes the gate', () => {
  const verdict = evaluateOutput({ blindChoose: { winner: 'after' } });
  assert.equal(verdict.gate, 'pass');
  assert.equal(verdict.gatingSignal, 'blind-choose');
  assert.match(verdict.reason, /after/);
});

test('winner "after" with explicit "confident" register passes', () => {
  const verdict = evaluateOutput({ blindChoose: { winner: 'after', confidence: 0.4 }, register: 'confident' });
  assert.equal(verdict.gate, 'pass');
});

// ── Negative: "before" and "tie" fail the gate ──────────────────────────────

test('winner "before" fails the gate regardless of register', () => {
  for (const register of ['quiet', 'confident', 'showpiece'] as const) {
    const verdict = evaluateOutput({ blindChoose: { winner: 'before', confidence: 0.95 }, register });
    assert.equal(verdict.gate, 'fail', `register=${register}`);
    assert.match(verdict.reason, /before/);
  }
});

test('winner "tie" fails the gate under the default (confident) register', () => {
  const verdict = evaluateOutput({ blindChoose: { winner: 'tie' } });
  assert.equal(verdict.gate, 'fail');
  assert.match(verdict.reason, /tie/);
});

test('winner "tie" fails under showpiece register', () => {
  const verdict = evaluateOutput({ blindChoose: { winner: 'tie', confidence: 0.9 }, register: 'showpiece' });
  assert.equal(verdict.gate, 'fail');
});

// ── Advisory signals never flip the gate ────────────────────────────────────

test('sky-high quantitative and Awwwards scores do not flip a "before" gate to pass', () => {
  const inputs: EvalHarnessInputs = {
    blindChoose: { winner: 'before', confidence: 0.99 },
    quantitative: { nonTextCarrierDensity: 0.95, motionPresent: true, extraMetric: 42 },
    awwwards: { design: 10, usability: 10, creativity: 10, content: 10 },
  };
  const verdict = evaluateOutput(inputs);
  assert.equal(verdict.gate, 'fail');
  assert.equal(verdict.gatingSignal, 'blind-choose');
});

test('rock-bottom quantitative and Awwwards scores do not flip an "after" gate to fail', () => {
  const inputs: EvalHarnessInputs = {
    blindChoose: { winner: 'after' },
    quantitative: { nonTextCarrierDensity: 0, motionPresent: false },
    awwwards: { design: 0, usability: 0, creativity: 0, content: 0 },
  };
  const verdict = evaluateOutput(inputs);
  assert.equal(verdict.gate, 'pass');
});

test('all advisories are tagged gating:false and sourced from quantitative/awwwards', () => {
  const verdict = evaluateOutput({
    blindChoose: { winner: 'after' },
    quantitative: { nonTextCarrierDensity: 0.4, motionPresent: true },
    awwwards: { design: 7, content: 8 },
  });
  assert.equal(verdict.advisories.length, 4);
  for (const advisory of verdict.advisories) {
    assert.equal(advisory.gating, false);
    assert.ok(advisory.source === 'quantitative' || advisory.source === 'awwwards');
    assert.equal(typeof advisory.message, 'string');
  }
  assert.equal(verdict.advisories.filter((a) => a.source === 'quantitative').length, 2);
  assert.equal(verdict.advisories.filter((a) => a.source === 'awwwards').length, 2);
});

test('no quantitative/awwwards inputs yields an empty advisories array', () => {
  const verdict = evaluateOutput({ blindChoose: { winner: 'after' } });
  assert.deepEqual(verdict.advisories, []);
});

test('undefined fields within quantitative/awwwards are skipped, not emitted as advisories', () => {
  const verdict = evaluateOutput({
    blindChoose: { winner: 'after' },
    quantitative: { nonTextCarrierDensity: undefined, motionPresent: true },
    awwwards: { design: undefined, usability: 5 },
  });
  assert.equal(verdict.advisories.length, 2);
});

// ── Register-aware gating ────────────────────────────────────────────────────

test('showpiece register requires confidence >= 0.6 on an "after" win', () => {
  const low = evaluateOutput({ blindChoose: { winner: 'after', confidence: 0.5 }, register: 'showpiece' });
  assert.equal(low.gate, 'fail');
  assert.match(low.reason, /showpiece/);

  const noConfidence = evaluateOutput({ blindChoose: { winner: 'after' }, register: 'showpiece' });
  assert.equal(noConfidence.gate, 'fail');

  const atThreshold = evaluateOutput({ blindChoose: { winner: 'after', confidence: 0.6 }, register: 'showpiece' });
  assert.equal(atThreshold.gate, 'pass');

  const high = evaluateOutput({ blindChoose: { winner: 'after', confidence: 0.9 }, register: 'showpiece' });
  assert.equal(high.gate, 'pass');
});

test('showpiece register fails closed on a non-finite confidence (NaN / Infinity)', () => {
  const nan = evaluateOutput({ blindChoose: { winner: 'after', confidence: NaN }, register: 'showpiece' });
  assert.equal(nan.gate, 'fail');

  const inf = evaluateOutput({ blindChoose: { winner: 'after', confidence: Infinity }, register: 'showpiece' });
  assert.equal(inf.gate, 'fail');
});

test('quiet register relaxes gating: a tie with no confidence reported passes', () => {
  const verdict = evaluateOutput({ blindChoose: { winner: 'tie' }, register: 'quiet' });
  assert.equal(verdict.gate, 'pass');
  assert.match(verdict.reason, /quiet/);
});

test('quiet register still fails "before" and still fails a tie that reports confidence', () => {
  const beforeVerdict = evaluateOutput({ blindChoose: { winner: 'before' }, register: 'quiet' });
  assert.equal(beforeVerdict.gate, 'fail');

  const tieWithConfidence = evaluateOutput({ blindChoose: { winner: 'tie', confidence: 0.3 }, register: 'quiet' });
  assert.equal(tieWithConfidence.gate, 'fail');
});

test('quiet register does not need showpiece-level confidence for an "after" win', () => {
  const verdict = evaluateOutput({ blindChoose: { winner: 'after', confidence: 0.1 }, register: 'quiet' });
  assert.equal(verdict.gate, 'pass');
});

// ── gatingSignal is always "blind-choose" ────────────────────────────────────

test('gatingSignal is always "blind-choose" across every branch', () => {
  const cases: EvalHarnessInputs[] = [
    { blindChoose: { winner: 'after' } },
    { blindChoose: { winner: 'before' } },
    { blindChoose: { winner: 'tie' } },
    { blindChoose: { winner: 'after', confidence: 0.9 }, register: 'showpiece' },
    { blindChoose: { winner: 'tie' }, register: 'quiet' },
  ];
  for (const inputs of cases) {
    assert.equal(evaluateOutput(inputs).gatingSignal, 'blind-choose');
  }
});

// ── Refinement loop: bounded RED/GREEN, evidence-driven ─────────────────────

const round = (n: number, blindChoose: 'after' | 'before' | 'tie', redCriteria: string[], evidence: string[] = ['render:r.png']) =>
  ({ round: n, blindChoose, redCriteria, evidence });

test('refinement loop: no rounds yet asks for the first round', () => {
  const d = evaluateRefinementLoop({ rounds: [] });
  assert.equal(d.status, 'run-first-round');
  assert.equal(d.continueLoop, true);
  assert.equal(d.converged, false);
});

test('refinement loop: improving and still RED continues and names the next RED target', () => {
  const d = evaluateRefinementLoop({ rounds: [round(1, 'after', ['two competing primary masses', 'left-text/right-image hero'])] });
  assert.equal(d.status, 'continue');
  assert.equal(d.continueLoop, true);
  assert.equal(d.nextTarget, 'two competing primary masses');
});

test('refinement loop: GREEN (no RED criteria left) stops and converges', () => {
  const d = evaluateRefinementLoop({ rounds: [round(1, 'after', ['x']), round(2, 'after', [])] });
  assert.equal(d.status, 'green');
  assert.equal(d.continueLoop, false);
  assert.equal(d.converged, true);
});

test('refinement loop: a regression stops and reverts, never converged', () => {
  const d = evaluateRefinementLoop({ rounds: [round(1, 'after', ['x']), round(2, 'before', ['x'])] });
  assert.equal(d.status, 'regressed');
  assert.equal(d.continueLoop, false);
  assert.equal(d.converged, false);
});

test('refinement loop: a plateau while still RED stops without converging and reports remaining RED', () => {
  const d = evaluateRefinementLoop({ rounds: [round(1, 'after', ['x']), round(2, 'tie', ['x', 'y'])] });
  assert.equal(d.status, 'plateaued');
  assert.equal(d.continueLoop, false);
  assert.equal(d.converged, false);
  assert.match(d.reason, /x, y/);
});

test('refinement loop: the round budget is a hard stop even while improving', () => {
  const d = evaluateRefinementLoop({ maxRounds: 2, rounds: [round(1, 'after', ['x']), round(2, 'after', ['x'])] });
  assert.equal(d.status, 'budget-exhausted');
  assert.equal(d.continueLoop, false);
});

test('refinement loop: a round with no evidence does not count — the loop blocks until evidence is recorded', () => {
  const d = evaluateRefinementLoop({ rounds: [round(1, 'after', ['x'], [])] });
  assert.equal(d.status, 'missing-evidence');
  assert.equal(d.continueLoop, false);
});

test('refinement loop: GREEN is honored only after minRounds', () => {
  const d = evaluateRefinementLoop({ minRounds: 2, rounds: [round(1, 'after', [])] });
  // 1 round, GREEN criteria but minRounds=2 → not yet a GREEN stop; budget (default 3) not hit → continue.
  assert.equal(d.continueLoop, true);
  assert.notEqual(d.status, 'green');
});
