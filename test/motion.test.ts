import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../core/ir/normalize.ts';
import { loadRules, check } from '../core/rules/engine.ts';
import { extractInvariants } from '../core/ref/invariants.ts';
import { saveRef, loadRefs } from '../core/ref/store.ts';
import type { Invariants, RawIr, RawNode, Reference } from '../core/types.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const BUILTIN_DIR = fileURLToPath(new URL('../core/rules/builtin/', import.meta.url)).replace(/\/$/, '');
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-motion-'));

// Load only the motion rules to keep test assertions tight.
const motionRules = loadRules(BUILTIN_DIR).filter((r) => r.category === 'motion');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeIr(nodes: Partial<RawNode>[], meta?: Record<string, unknown>): ReturnType<typeof normalize> {
  const full = nodes.map((n, i) => ({
    id: `n${i}`,
    name: 'div',
    type: 'FRAME' as const,
    path: `body/div${i}`,
    parent: i === 0 ? null : 'n0',
    box: { x: 0, y: 0, w: 100, h: 100 },
    children: [],
    ...n,
  }));
  return normalize({ nodes: full, meta } as RawIr);
}

// ── MOTION-NO-REDUCED ────────────────────────────────────────────────────────

test('MOTION-NO-REDUCED fires when probe found live animations and hasReducedMotion is false', () => {
  const ir = makeIr([{ parent: null }], {
    motion: { animatedProperties: ['transform', 'opacity'], hasReducedMotion: false, scrollChoreography: [], snapshots: [] },
  });
  const v = check(ir, motionRules);
  assert.ok(v.some((x) => x.id === 'MOTION-NO-REDUCED'), 'expected MOTION-NO-REDUCED to fire');
});

test('MOTION-NO-REDUCED does not fire when hasReducedMotion is true', () => {
  const ir = makeIr([{ parent: null }], {
    motion: { animatedProperties: ['transform'], hasReducedMotion: true, scrollChoreography: [], snapshots: [] },
  });
  const v = check(ir, motionRules);
  assert.ok(!v.some((x) => x.id === 'MOTION-NO-REDUCED'));
});

test('MOTION-NO-REDUCED does not fire when ir.meta.motion is absent (pre-probe IR)', () => {
  // Old refs captured before the motion probe was added have no ir.meta.motion.
  const ir = makeIr([{ parent: null }]);
  const v = check(ir, motionRules);
  assert.ok(!v.some((x) => x.id === 'MOTION-NO-REDUCED'));
});

test('MOTION-NO-REDUCED does not fire when animatedProperties is empty (no live animations detected)', () => {
  // A page with CSS transitions in stylesheets but none running at probe time reads as [].
  const ir = makeIr([{ parent: null }], {
    motion: { animatedProperties: [], hasReducedMotion: false, scrollChoreography: [], snapshots: [] },
  });
  const v = check(ir, motionRules);
  assert.ok(!v.some((x) => x.id === 'MOTION-NO-REDUCED'));
});

// ── MOTION-LAYOUT-THRASH ─────────────────────────────────────────────────────

test('MOTION-LAYOUT-THRASH fires when width is in transition properties', () => {
  const ir = makeIr([{
    motion: { durations: [300], animationNames: [], easings: ['ease'], properties: ['width'] },
  }]);
  const v = check(ir, motionRules);
  assert.ok(v.some((x) => x.id === 'MOTION-LAYOUT-THRASH'), 'expected MOTION-LAYOUT-THRASH for width');
});

test('MOTION-LAYOUT-THRASH fires on all named layout properties', () => {
  const layoutProps = ['height', 'top', 'right', 'bottom', 'left', 'margin', 'margin-top',
    'margin-right', 'margin-bottom', 'margin-left', 'padding', 'padding-top',
    'padding-right', 'padding-bottom', 'padding-left'];
  for (const prop of layoutProps) {
    const ir = makeIr([{
      motion: { durations: [200], animationNames: [], easings: ['ease-out'], properties: [prop] },
    }]);
    const v = check(ir, motionRules);
    assert.ok(v.some((x) => x.id === 'MOTION-LAYOUT-THRASH'), `expected MOTION-LAYOUT-THRASH for ${prop}`);
  }
});

test('MOTION-LAYOUT-THRASH does not fire for transform and opacity', () => {
  const ir = makeIr([{
    motion: { durations: [160], animationNames: [], easings: ['ease-out'], properties: ['transform', 'opacity'] },
  }]);
  const v = check(ir, motionRules);
  assert.ok(!v.some((x) => x.id === 'MOTION-LAYOUT-THRASH'));
});

test('MOTION-LAYOUT-THRASH does not fire when motion.properties is absent (no named transition-property)', () => {
  // A node with motion durations but no properties array — e.g. transition-property: all
  // was excluded from the extraction because it is not a specific named property.
  const ir = makeIr([{
    motion: { durations: [160], animationNames: [], easings: ['ease-out'] },
  }]);
  const v = check(ir, motionRules);
  assert.ok(!v.some((x) => x.id === 'MOTION-LAYOUT-THRASH'));
});

// ── MOTION-UNIFORM ───────────────────────────────────────────────────────────

test('MOTION-UNIFORM fires when 3+ animated nodes share one duration and only default easings', () => {
  // 500ms ease-in-out everywhere — the canonical generated-work signature.
  const ir = makeIr([
    { parent: null },
    { motion: { durations: [500], animationNames: [], easings: ['ease-in-out'] } },
    { motion: { durations: [500], animationNames: [], easings: ['ease-in-out'] } },
    { motion: { durations: [500], animationNames: [], easings: ['ease-in-out'] } },
  ]);
  const v = check(ir, motionRules);
  assert.ok(v.some((x) => x.id === 'MOTION-UNIFORM'), 'expected MOTION-UNIFORM to fire');
});

test('MOTION-UNIFORM does not fire when durations vary', () => {
  const ir = makeIr([
    { parent: null },
    { motion: { durations: [160], animationNames: [], easings: ['ease-out'] } },
    { motion: { durations: [280], animationNames: [], easings: ['ease-out'] } },
    { motion: { durations: [400], animationNames: [], easings: ['ease-out'] } },
  ]);
  const v = check(ir, motionRules);
  assert.ok(!v.some((x) => x.id === 'MOTION-UNIFORM'));
});

test('MOTION-UNIFORM does not fire when a cubic-bezier is in the easing vocabulary', () => {
  // A measured easing curve breaks the "only defaults" condition.
  const ir = makeIr([
    { parent: null },
    { motion: { durations: [500], animationNames: [], easings: ['cubic-bezier(0.2,0,0,1)'] } },
    { motion: { durations: [500], animationNames: [], easings: ['cubic-bezier(0.2,0,0,1)'] } },
    { motion: { durations: [500], animationNames: [], easings: ['cubic-bezier(0.2,0,0,1)'] } },
  ]);
  const v = check(ir, motionRules);
  assert.ok(!v.some((x) => x.id === 'MOTION-UNIFORM'));
});

test('MOTION-UNIFORM does not fire with only 2 animated nodes', () => {
  // The rule requires at least 3 — two nodes sharing a duration is not a pattern.
  const ir = makeIr([
    { parent: null },
    { motion: { durations: [500], animationNames: [], easings: ['ease-in-out'] } },
    { motion: { durations: [500], animationNames: [], easings: ['ease-in-out'] } },
  ]);
  const v = check(ir, motionRules);
  assert.ok(!v.some((x) => x.id === 'MOTION-UNIFORM'));
});

test('MOTION-UNIFORM does not fire when mixed easings include a non-default keyword', () => {
  // step-start and step-end are in the default set; a real cubic-bezier is not.
  const ir = makeIr([
    { parent: null },
    { motion: { durations: [300], animationNames: [], easings: ['ease-out'] } },
    { motion: { durations: [300], animationNames: [], easings: ['ease-out', 'cubic-bezier(0.4,0,0.2,1)'] } },
    { motion: { durations: [300], animationNames: [], easings: ['ease-out'] } },
  ]);
  const v = check(ir, motionRules);
  assert.ok(!v.some((x) => x.id === 'MOTION-UNIFORM'));
});

// ── Invariants: new fields from ir.meta.motion ───────────────────────────────

test('extractInvariants reads animatedProperties and hasReducedMotion from ir.meta.motion', () => {
  const ir = makeIr([{ parent: null }], {
    motion: {
      animatedProperties: ['opacity', 'transform'],
      hasReducedMotion: true,
      scrollChoreography: [{ step: 1, fired: 2, entered: 3 }],
      snapshots: [],
    },
  });
  const inv = extractInvariants(ir);
  assert.deepEqual(inv.animatedProperties, ['opacity', 'transform']);
  assert.equal(inv.hasReducedMotion, true);
  assert.equal(inv.scrollChoreography.length, 1);
  assert.equal(inv.scrollChoreography[0]?.fired, 2);
  assert.equal(inv.scrollChoreography[0]?.entered, 3);
});

test('extractInvariants returns safe defaults when ir.meta.motion is absent (pre-probe IR)', () => {
  const ir = makeIr([{ parent: null }]);
  const inv = extractInvariants(ir);
  assert.deepEqual(inv.animatedProperties, []);
  assert.equal(inv.hasReducedMotion, false);
  assert.deepEqual(inv.scrollChoreography, []);
});

test('extractInvariants sorts animatedProperties for stable output', () => {
  const ir = makeIr([{ parent: null }], {
    motion: {
      animatedProperties: ['transform', 'color', 'opacity'],
      hasReducedMotion: false,
      scrollChoreography: [],
      snapshots: [],
    },
  });
  const inv = extractInvariants(ir);
  assert.deepEqual(inv.animatedProperties, ['color', 'opacity', 'transform']);
});

// ── Backward compat: loadRefs handles old refs without motion probe fields ───

test('loadRefs backfills new motion fields on references saved before the probe was added', () => {
  const dir = project();
  // Simulate an old ref: Invariants object without animatedProperties/hasReducedMotion/scrollChoreography.
  const oldRef: Reference = {
    source: 'https://example.com',
    component: 'page',
    kind: 'page',
    capturedAt: '2024-01-01T00:00:00.000Z',
    invariants: {
      spacingLadder: [4, 8],
      radiusLadder: [4],
      elevationLevels: 1,
      centeredRatio: 0,
      tokenCoverage: 0.5,
      paddingWeight: 8,
      typeScale: [14, 16],
      fontFamilies: ['inter'],
      weightLadder: [400],
      motionDurations: [160],
      easingVocab: ['ease-out'],
      animatedShare: 0.1,
      hoverCoverage: 0,
      focusCoverage: 0,
      // animatedProperties, hasReducedMotion, scrollChoreography intentionally absent
    } as Invariants,
    principles: [],
  };
  saveRef(dir, oldRef, createTestProjectWriteAdapter(dir));
  const [loaded] = loadRefs(dir);
  assert.ok(loaded, 'reference should load without error');
  assert.deepEqual(loaded?.invariants?.animatedProperties, [], 'animatedProperties backfilled to []');
  assert.equal(loaded?.invariants?.hasReducedMotion, false, 'hasReducedMotion backfilled to false');
  assert.deepEqual(loaded?.invariants?.scrollChoreography, [], 'scrollChoreography backfilled to []');
});

test('loadRefs preserves existing motion probe fields if present', () => {
  const dir = project();
  const newRef: Reference = {
    source: 'https://example.com',
    component: 'page',
    kind: 'page',
    capturedAt: '2025-01-01T00:00:00.000Z',
    invariants: {
      spacingLadder: [4, 8],
      radiusLadder: [4],
      elevationLevels: 1,
      centeredRatio: 0,
      tokenCoverage: 0.5,
      paddingWeight: 8,
      typeScale: [14, 16],
      fontFamilies: ['inter'],
      weightLadder: [400],
      motionDurations: [160],
      easingVocab: ['ease-out'],
      animatedShare: 0.1,
      hoverCoverage: 0.8,
      focusCoverage: 0.9,
      animatedProperties: ['opacity', 'transform'],
      hasReducedMotion: true,
      scrollChoreography: [{ step: 1, fired: 3, entered: 5 }],
    },
    principles: [],
  };
  saveRef(dir, newRef, createTestProjectWriteAdapter(dir));
  const [loaded] = loadRefs(dir);
  assert.deepEqual(loaded?.invariants?.animatedProperties, ['opacity', 'transform']);
  assert.equal(loaded?.invariants?.hasReducedMotion, true);
  assert.equal(loaded?.invariants?.scrollChoreography?.[0]?.fired, 3);
});

// ── motion probe browser path coverage note ──────────────────────────────────
//
// probeMotion() in core/render/index.ts requires a real browser (Playwright). Its
// browser path is covered by the integration tests in test/ref-granularity.test.ts,
// which run `omd ref add` against a real HTML fixture — the same path that calls
// extractIr() → probeMotion(). That test does not assert on motion-specific fields
// because slop.html has no CSS animations; the probe runs and returns an empty result.
// The pure parts (invariants extraction, rule evaluation, backward compat) are covered
// by the unit tests above.
