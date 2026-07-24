import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REFERENCE_CRAFT_SCHEMA,
  ReferenceCraftError,
  CraftFidelityError,
  CRAFT_ENERGY_FLOOR,
  validateReferenceCraft,
  verifyCraftReproduction,
} from '../core/ref/reference-craft.ts';

function craft(overrides = {}) {
  return {
    schema: REFERENCE_CRAFT_SCHEMA,
    source: 'awwwards.com/sites/example',
    as: 'hero-scroll',
    selector: '.hero',
    viewport: { width: 1440, height: 900 },
    motion: { peakEnergy: 0.4, scrollLinked: true, reducedMotionSafe: true },
    technique: 'scroll-scrubbed shader gradient',
    ...overrides,
  };
}

test('validateReferenceCraft accepts a well-formed craft signature and trims', () => {
  const c = validateReferenceCraft(craft({ source: '  awwwards.com/x  ' }));
  assert.equal(c.schema, 'reference-craft-v1');
  assert.equal(c.source, 'awwwards.com/x');
  assert.equal(c.selector, '.hero');
  assert.equal(c.motion.scrollLinked, true);
});

test('validateReferenceCraft rejects schema, key, energy-range, and viewport violations', () => {
  assert.throws(() => validateReferenceCraft(craft({ schema: 'reference-craft-v2' })), ReferenceCraftError);
  assert.throws(() => validateReferenceCraft({ ...craft(), extra: 1 }), /unknown or missing keys/);
  assert.throws(() => validateReferenceCraft(craft({ motion: { peakEnergy: 1.4, scrollLinked: true, reducedMotionSafe: true } })), /within \[0, 1\]/);
  assert.throws(() => validateReferenceCraft(craft({ selector: '' })), /non-empty string/);
  assert.throws(() => validateReferenceCraft(craft({ viewport: { width: 0, height: 900 } })), /viewport.width must be a positive integer/);
});

test('verifyCraftReproduction passes when the reproduction moves comparably and keeps scroll + reduced-motion', () => {
  const result = verifyCraftReproduction(craft(), craft({ motion: { peakEnergy: 0.38, scrollLinked: true, reducedMotionSafe: true } }));
  assert.equal(result.ok, true);
  assert.ok(result.energyRatio >= 0.6 && result.energyRatio <= 1);
});

test('verifyCraftReproduction rejects a static reproduction (energy below the floor)', () => {
  const gen = craft({ motion: { peakEnergy: CRAFT_ENERGY_FLOOR / 2, scrollLinked: true, reducedMotionSafe: true } });
  assert.throws(() => verifyCraftReproduction(craft(), gen), (e) => e instanceof CraftFidelityError && /static/.test(e.message));
});

test('verifyCraftReproduction rejects a faint ghost (below the fidelity ratio of the reference)', () => {
  // reference 0.4, reproduction 0.1 -> ratio 0.25 < 0.6
  const gen = craft({ motion: { peakEnergy: 0.1, scrollLinked: true, reducedMotionSafe: true } });
  assert.throws(() => verifyCraftReproduction(craft(), gen), (e) => e instanceof CraftFidelityError && /faint ghost/.test(e.message));
});

test('verifyCraftReproduction rejects dropping a scroll-linked response or the reduced-motion baseline', () => {
  const noScroll = craft({ motion: { peakEnergy: 0.4, scrollLinked: false, reducedMotionSafe: true } });
  assert.throws(() => verifyCraftReproduction(craft(), noScroll), /dropped the reference's scroll-linked/);
  const noReduce = craft({ motion: { peakEnergy: 0.4, scrollLinked: true, reducedMotionSafe: false } });
  assert.throws(() => verifyCraftReproduction(craft(), noReduce), /no reduced-motion baseline/);
});

test('verifyCraftReproduction does not require scroll when the reference is not scroll-linked', () => {
  const ref = craft({ motion: { peakEnergy: 0.3, scrollLinked: false, reducedMotionSafe: true } });
  const gen = craft({ motion: { peakEnergy: 0.3, scrollLinked: false, reducedMotionSafe: true } });
  assert.equal(verifyCraftReproduction(ref, gen).ok, true);
});
