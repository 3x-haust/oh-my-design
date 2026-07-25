import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVELOPER_AWARD_FLOOR,
  DEV_AWARD_WEIGHTS,
  HONORABLE_MENTION_FLOOR,
  MAIN_JURY_WEIGHTS,
  scoreAward,
} from '../core/award/rubric.ts';

test('the encoded weights match the published Awwwards rubric', () => {
  assert.deepEqual(DEV_AWARD_WEIGHTS, { wpo: 0.2, rwd: 0.2, markup: 0.15, semantics: 0.2, animation: 0.15, a11y: 0.1 });
  assert.equal(Object.values(DEV_AWARD_WEIGHTS).reduce((a, b) => a + b, 0).toFixed(2), '1.00');
  assert.deepEqual(MAIN_JURY_WEIGHTS, { design: 0.4, usability: 0.3, creativity: 0.2, content: 0.1 });
  assert.equal(HONORABLE_MENTION_FLOOR, 6.5);
  assert.equal(DEVELOPER_AWARD_FLOOR, 7);
});

test('no evidence scores nothing rather than fabricating a number', () => {
  const result = scoreAward({});
  assert.equal(result.verdict, 'no-evidence');
  assert.equal(result.weighted, 0);
  assert.equal(result.coverage, 0);
  assert.ok(result.axes.every((axis) => axis.score === null));
});

test('a partial run reports a renormalised score with its coverage', () => {
  const result = scoreAward({ performance: 0.9 });
  const wpo = result.axes.find((a) => a.axis === 'wpo')!;
  assert.equal(wpo.score, 9);
  assert.equal(result.coverage, 0.2, 'only the wpo weight had evidence');
  assert.equal(result.weighted, 9, 'the single scored axis carries the whole renormalised weight');
});

test('a clean, fast, accessible, motion-bearing page clears the developer-award floor', () => {
  const result = scoreAward({
    performance: 0.98,
    mobileReflows: true,
    violations: { contrast: 0, focus: 0, headingOrder: 0, system: 0, hitArea: 0, ux: 0 },
    markup: { hasLang: true, hasTitle: true, hasViewportMeta: true, hasDescription: true, hasOpenGraph: true, imagesMissingAlt: 0 },
    motion: { scrollLinked: true, peakEnergy: 0.2, reducedMotionSafe: true },
    noJsSafe: true,
  });
  assert.equal(result.coverage, 1);
  assert.ok(result.weighted > DEVELOPER_AWARD_FLOOR, `expected above ${DEVELOPER_AWARD_FLOOR}, got ${result.weighted}`);
  assert.equal(result.verdict, 'developer-award');
});

test('the static, JS-gated page the harness keeps catching lands below the HM floor', () => {
  const result = scoreAward({
    performance: 0.6,
    mobileReflows: true,
    violations: { contrast: 2, focus: 1, headingOrder: 1, system: 2, hitArea: 1, ux: 2 },
    markup: { hasLang: true, hasTitle: true, hasViewportMeta: true, hasDescription: false, hasOpenGraph: false, imagesMissingAlt: 4 },
    motion: { scrollLinked: false, peakEnergy: 0, reducedMotionSafe: true },
    noJsSafe: false,
  });
  assert.ok(result.weighted < HONORABLE_MENTION_FLOOR, `expected below ${HONORABLE_MENTION_FLOOR}, got ${result.weighted}`);
  assert.equal(result.verdict, 'below-hm');
  const animation = result.axes.find((a) => a.axis === 'animation')!;
  assert.equal(animation.score, 2, 'a static, JS-gated page scores only its reduced-motion point');
});

test('motion scoring rewards presence, reduced-motion safety, and no-JS survival independently', () => {
  const base = { scrollLinked: true, peakEnergy: 0.2, reducedMotionSafe: true } as const;
  const full = scoreAward({ motion: base, noJsSafe: true }).axes.find((a) => a.axis === 'animation')!;
  assert.equal(full.score, 10);
  const noReduced = scoreAward({ motion: { ...base, reducedMotionSafe: false }, noJsSafe: true }).axes.find((a) => a.axis === 'animation')!;
  assert.equal(noReduced.score, 8);
  const gated = scoreAward({ motion: base, noJsSafe: false }).axes.find((a) => a.axis === 'animation')!;
  assert.equal(gated.score, 8);
  const still = scoreAward({ motion: { scrollLinked: false, peakEnergy: 0, reducedMotionSafe: true }, noJsSafe: true }).axes.find((a) => a.axis === 'animation')!;
  assert.equal(still.score, 4);
});

test('a floor failure on one axis is not averaged away by the others', () => {
  const strongExceptMotion = scoreAward({
    performance: 1,
    mobileReflows: true,
    violations: { contrast: 0, focus: 0, headingOrder: 0, system: 0, hitArea: 0, ux: 0 },
    markup: { hasLang: true, hasTitle: true, hasViewportMeta: true, hasDescription: true, hasOpenGraph: true, imagesMissingAlt: 0 },
    motion: { scrollLinked: false, peakEnergy: 0, reducedMotionSafe: true },
    noJsSafe: true,
  });
  assert.ok(strongExceptMotion.weighted >= 8, `mean stays high: ${strongExceptMotion.weighted}`);
  assert.deepEqual([...strongExceptMotion.floorFailures], ['animation']);
  assert.equal(strongExceptMotion.verdict, 'below-hm', 'a static page must not score an award on markup alone');
});
