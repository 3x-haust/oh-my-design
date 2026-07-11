/**
 * Tests for core/rules/motion-spec.ts — M5 spec-vs-measured rules.
 *
 * All tests use synthetic IR, synthetic spec markdown, and synthetic energy curves.
 * No browser required. The probe data shape mirrors what probeMotion() attaches to
 * ir.meta.motion at check time.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../core/ir/normalize.ts';
import { checkMotionSpec } from '../core/rules/motion-spec.ts';
import type { EnergyCurve, RawIr } from '../core/types.ts';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeIr(meta?: Record<string, unknown>) {
  const raw: RawIr = {
    nodes: [{
      id: 'n0', name: 'div', type: 'FRAME', path: 'body/div',
      parent: null, box: { x: 0, y: 0, w: 100, h: 100 }, children: [],
    }],
    ...(meta ? { meta } : {}),
  };
  return normalize(raw);
}

function probeWithAnimations(count = 1) {
  return {
    animatedProperties: count > 0 ? ['opacity', 'transform'] : [],
    hasReducedMotion: false,
    scrollChoreography: [],
    snapshots: [
      { t: 0, animations: Array.from({ length: count }, () => ({ duration: 400, easing: 'ease-out', properties: ['opacity'], playState: 'running' })) },
      { t: 500, animations: [] },
      { t: 1500, animations: [] },
    ],
  };
}

function probeNoAnimations() {
  return {
    animatedProperties: [],
    hasReducedMotion: false,
    scrollChoreography: [],
    snapshots: [
      { t: 0, animations: [] },
      { t: 500, animations: [] },
      { t: 1500, animations: [] },
    ],
  };
}

function probeScrollFired() {
  return {
    animatedProperties: [],
    hasReducedMotion: false,
    scrollChoreography: [{ step: 2, fired: 3, entered: 5 }],
    snapshots: [
      { t: 0, animations: [] },
      { t: 500, animations: [] },
      { t: 1500, animations: [] },
    ],
  };
}

function energyCurveWithMotion(peak = 0.15): EnergyCurve {
  return {
    frames: 2,
    pairs: [{ pairIndex: 0, changedFraction: peak, regionFractions: [peak, 0, 0] }],
    peakEnergy: peak,
  };
}

function energyCurveNoMotion(): EnergyCurve {
  return {
    frames: 2,
    pairs: [{ pairIndex: 0, changedFraction: 0, regionFractions: [0, 0, 0] }],
    peakEnergy: 0,
  };
}

const SPEC_WITH_LOAD_SCENE = `
## Hero entrance
- trigger: load
- target: .hero-heading
- properties: opacity, transform
- duration: 400ms
- easing: cubic-bezier(0.2,0,0,1)
`.trim();

const SPEC_WITH_SCROLL_SCENE = `
## Card reveal
- trigger: scroll
- target: .card
- properties: opacity, transform
- duration: 300ms
`.trim();

const SPEC_WITH_STAGGER = `
## Cards stagger entrance
- trigger: scroll
- target: .card
- stagger: 40ms between .card siblings
- duration: 300ms
`.trim();

const SPEC_EMPTY_NO_SCENES = '# Motion Spec\n\nNo scenes defined yet.\n';

const FRAME_SHOWPIECE = `
---
generator: "a bold agency site"
---

## Frame

This page commits to the **showpiece** register...
`.trim();

const FRAME_QUIET = `
## Frame

This page uses a quiet, confident register. Restraint is the correct choice here.
`.trim();

// ── MOTION-SPEC-DRIFT: spec has scenes, probe has nothing ─────────────────────

test('MOTION-SPEC-DRIFT fires when spec has a load scene but probe detected nothing', () => {
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, null, null);
  assert.ok(v.some((x) => x.id === 'MOTION-SPEC-DRIFT'), 'should fire MOTION-SPEC-DRIFT');
});

test('MOTION-SPEC-DRIFT fires when spec has a scroll scene but probe detected nothing', () => {
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_SCROLL_SCENE, null, null);
  assert.ok(v.some((x) => x.id === 'MOTION-SPEC-DRIFT'));
});

test('MOTION-SPEC-DRIFT does not fire when probe has animatedProperties', () => {
  const ir = makeIr({ motion: probeWithAnimations(2) });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, null, null);
  assert.ok(!v.some((x) => x.id === 'MOTION-SPEC-DRIFT'));
});

test('MOTION-SPEC-DRIFT does not fire when scrollChoreography shows fired > 0', () => {
  const ir = makeIr({ motion: probeScrollFired() });
  const v = checkMotionSpec(ir, SPEC_WITH_SCROLL_SCENE, null, null);
  assert.ok(!v.some((x) => x.id === 'MOTION-SPEC-DRIFT'));
});

test('MOTION-SPEC-DRIFT does not fire when energy curve has non-zero peak', () => {
  // probe shows nothing BUT energy curve shows motion (GSAP scenario)
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, null, energyCurveWithMotion(0.1));
  assert.ok(!v.some((x) => x.id === 'MOTION-SPEC-DRIFT'), 'energy should be enough to silence the rule');
});

test('MOTION-SPEC-DRIFT does not fire when energy peak is below the noise floor (0.005)', () => {
  // Anti-alias noise: 0.001 < 0.005 threshold should not count as motion
  const ir = makeIr({ motion: probeNoAnimations() });
  const noise: EnergyCurve = { frames: 2, pairs: [{ pairIndex: 0, changedFraction: 0.001, regionFractions: [0.001, 0, 0] }], peakEnergy: 0.001 };
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, null, noise);
  assert.ok(v.some((x) => x.id === 'MOTION-SPEC-DRIFT'), 'noise below floor should still trigger drift');
});

// ── MOTION-SPEC-DRIFT: probe has animations, spec has no scenes ───────────────

test('MOTION-SPEC-DRIFT fires when probe detected animations but spec has no scenes', () => {
  const ir = makeIr({ motion: probeWithAnimations(3) });
  const v = checkMotionSpec(ir, SPEC_EMPTY_NO_SCENES, null, null);
  assert.ok(v.some((x) => x.id === 'MOTION-SPEC-DRIFT'));
});

test('MOTION-SPEC-DRIFT does not fire when both spec and probe have nothing', () => {
  // No spec scenes AND no probe motion → nothing to compare, no violation.
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_EMPTY_NO_SCENES, null, null);
  assert.ok(!v.some((x) => x.id === 'MOTION-SPEC-DRIFT'));
});

// ── No probe data → skip all rules ───────────────────────────────────────────

test('No violations when ir.meta.motion is absent (pre-probe IR)', () => {
  const ir = makeIr(); // no meta at all
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, null, null);
  assert.equal(v.length, 0, 'pre-probe IR must not produce false positives');
});

test('No violations when ir.meta.motion is null', () => {
  const ir = makeIr({ motion: null });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, null, null);
  assert.equal(v.length, 0);
});

// ── MOTION-NO-ENTRANCE ────────────────────────────────────────────────────────

test('MOTION-NO-ENTRANCE fires when showpiece + entrance spec + no probe/energy', () => {
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, FRAME_SHOWPIECE, null);
  assert.ok(v.some((x) => x.id === 'MOTION-NO-ENTRANCE'));
});

test('MOTION-NO-ENTRANCE does not fire when probe has entrance animations (snap0 > 0)', () => {
  const ir = makeIr({ motion: probeWithAnimations(2) });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, FRAME_SHOWPIECE, null);
  assert.ok(!v.some((x) => x.id === 'MOTION-NO-ENTRANCE'));
});

test('MOTION-NO-ENTRANCE does not fire when energy curve shows entrance motion', () => {
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, FRAME_SHOWPIECE, energyCurveWithMotion(0.2));
  assert.ok(!v.some((x) => x.id === 'MOTION-NO-ENTRANCE'));
});

test('MOTION-NO-ENTRANCE does not fire when register is not showpiece', () => {
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, FRAME_QUIET, null);
  assert.ok(!v.some((x) => x.id === 'MOTION-NO-ENTRANCE'), 'quiet register should not trigger MOTION-NO-ENTRANCE');
});

test('MOTION-NO-ENTRANCE does not fire when frame.md is null', () => {
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, null, null);
  assert.ok(!v.some((x) => x.id === 'MOTION-NO-ENTRANCE'));
});

test('MOTION-NO-ENTRANCE does not fire when spec has no load scene (scroll only)', () => {
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_SCROLL_SCENE, FRAME_SHOWPIECE, null);
  assert.ok(!v.some((x) => x.id === 'MOTION-NO-ENTRANCE'));
});

// ── Stagger-only spec does not generate false MOTION-SPEC-DRIFT ──────────────

test('MOTION-SPEC-DRIFT fires on scroll-stagger spec with no probe motion (trigger is scroll)', () => {
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_STAGGER, null, null);
  // SPEC_WITH_STAGGER has trigger: scroll → should fire drift when nothing measured
  assert.ok(v.some((x) => x.id === 'MOTION-SPEC-DRIFT'));
});

// ── Violation shape ───────────────────────────────────────────────────────────

test('MOTION-SPEC-DRIFT violation has correct shape (category, layer, severity)', () => {
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, null, null);
  const drift = v.find((x) => x.id === 'MOTION-SPEC-DRIFT');
  assert.ok(drift);
  assert.equal(drift.category, 'motion');
  assert.equal(drift.layer, 1);
  assert.equal(drift.severity, 'warn');
  assert.equal(drift.nodeId, 'page');
  assert.equal(drift.path, 'motion-spec');
});

test('MOTION-NO-ENTRANCE violation has correct shape', () => {
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, SPEC_WITH_LOAD_SCENE, FRAME_SHOWPIECE, energyCurveNoMotion());
  const noEnt = v.find((x) => x.id === 'MOTION-NO-ENTRANCE');
  assert.ok(noEnt);
  assert.equal(noEnt.category, 'motion');
  assert.equal(noEnt.layer, 1);
  assert.equal(noEnt.severity, 'warn');
});

// ── Multiple scenes: only load/scroll count for drift ────────────────────────

test('hover-only spec does not trigger MOTION-SPEC-DRIFT when probe is empty', () => {
  const hoverOnlySpec = `
## Button hover glow
- trigger: hover
- target: button
- duration: 150ms
`.trim();
  const ir = makeIr({ motion: probeNoAnimations() });
  const v = checkMotionSpec(ir, hoverOnlySpec, null, null);
  // Hover scenes don't count for drift check (hover is interactive, not measured by probe)
  assert.ok(!v.some((x) => x.id === 'MOTION-SPEC-DRIFT'), 'hover-only spec should not produce drift finding');
});
