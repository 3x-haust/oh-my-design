import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  CRAFT_ANIMATED_SHARE_FLOOR,
  checkCraftUsage,
  hasCapturedScrollCraft,
  readCapturedCraftSignals,
  refCraftSignal,
} from '../core/ref/craft-usage.ts';

const dir = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

test('refCraftSignal reads fired choreography, animated share, and peak energy', () => {
  const s = refCraftSignal(
    { invariants: { animatedShare: 0.2, scrollChoreography: [{ step: 1, fired: 1, entered: 4 }] }, energyCurve: { peakEnergy: 0.3 } },
    'x',
  );
  assert.equal(s.scrollFired, true);
  assert.equal(s.animatedShare, 0.2);
  assert.equal(s.peakEnergy, 0.3);
});

test('refCraftSignal tolerates missing or malformed fields', () => {
  const s = refCraftSignal({}, 'y');
  assert.equal(s.scrollFired, false);
  assert.equal(s.animatedShare, 0);
  assert.equal(s.peakEnergy, 0);
  const t = refCraftSignal({ invariants: { scrollChoreography: 'nope', animatedShare: 'x' } }, 'z');
  assert.equal(t.scrollFired, false);
  assert.equal(t.animatedShare, 0);
});

test('readCapturedCraftSignals + hasCapturedScrollCraft detect a scroll-craft reference set', () => {
  const signals = readCapturedCraftSignals(dir('craft-usage-refs'));
  assert.equal(signals.length, 1);
  assert.equal(signals[0]!.scrollFired, true);
  assert.equal(hasCapturedScrollCraft(signals), true);
});

test('a reference set with no fired choreography and no animated share is not scroll craft', () => {
  const signals = readCapturedCraftSignals(dir('craft-usage-refs-static'));
  assert.equal(signals.length, 1);
  assert.equal(hasCapturedScrollCraft(signals), false);
});

test('animated share alone above the floor counts as captured scroll craft', () => {
  const only = [{ source: 'a', scrollFired: false, animatedShare: CRAFT_ANIMATED_SHARE_FLOOR, peakEnergy: 0 }];
  assert.equal(hasCapturedScrollCraft(only), true);
  const below = [{ source: 'a', scrollFired: false, animatedShare: CRAFT_ANIMATED_SHARE_FLOOR - 0.01, peakEnergy: 0 }];
  assert.equal(hasCapturedScrollCraft(below), false);
});

test('readCapturedCraftSignals returns nothing for an absent refs directory', () => {
  assert.deepEqual(readCapturedCraftSignals(dir('no-such-refs-dir')), []);
});

test('checkCraftUsage flags a persuasion surface that captured scroll craft but shipped static', () => {
  const finding = checkCraftUsage({ surface: 'marketing', capturedScrollCraft: true, builtScrollLinked: false });
  assert.equal(finding?.id, 'CRAFT-DECLINED-TO-STILL');
  assert.match(finding!.message, /declined to stillness/);
});

test('checkCraftUsage passes when the build reproduced scroll-linked craft', () => {
  assert.equal(checkCraftUsage({ surface: 'marketing', capturedScrollCraft: true, builtScrollLinked: true }), null);
});

test('checkCraftUsage passes when no scroll craft was captured, and exempts product/quiet', () => {
  assert.equal(checkCraftUsage({ surface: 'marketing', capturedScrollCraft: false, builtScrollLinked: false }), null);
  assert.equal(checkCraftUsage({ surface: 'product', capturedScrollCraft: true, builtScrollLinked: false }), null);
  assert.equal(checkCraftUsage({ surface: 'quiet', capturedScrollCraft: true, builtScrollLinked: false }), null);
});
