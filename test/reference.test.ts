import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractInvariants, ladder, isHairline } from '../core/ref/invariants.ts';
import { similarity, distances } from '../core/ref/distance.ts';
import { saveRef, loadRefs } from '../core/ref/store.ts';
import { normalize } from '../core/ir/normalize.ts';
import type { Invariants, RawIr, Reference } from '../core/types.ts';

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-ref-'));

// ── ladder: the 90th-percentile cut, learned from real data ──
//
// Linear declares 11 distinct radii and 13 spacing values. Feeding all of them into a
// distance metric lets noise dominate. Keeping only what carries 90% of the uses reduces
// the radius set to 7 rungs, which is what a designer would actually name.

test('ladder keeps values carrying 90% of uses, sorted ascending', () => {
  const h = { '4': 50, '8': 30, '16': 15, '3': 3, '7': 2 };
  assert.deepEqual(ladder(h), [4, 8, 16]);
});

test('ladder excludes zero — on a real page padding:0 is ~80% of every spacing value', () => {
  const h = { '0': 812, '8': 43, '6': 34 };
  assert.deepEqual(ladder(h), [6, 8]);
});

test('ladder on a single value is a monoculture of one rung', () => {
  assert.deepEqual(ladder({ '8': 40 }), [8]);
});

test('ladder of nothing is empty, not a crash', () => {
  assert.deepEqual(ladder({}), []);
  assert.deepEqual(ladder({ '0': 100 }), []);
});

// ── hairlines are borders, not elevation ──
//
// Linear has five distinct box-shadows. Four are `0 0 0 Npx` — borders drawn as shadows.
// Counting them as elevation levels produced the false claim "five layers of height".

test('isHairline recognises a shadow with no offset and no blur', () => {
  assert.equal(isHairline('rgba(0, 0, 0, 0.2) 0px 0px 0px 1px'), true);
  assert.equal(isHairline('rgba(0, 0, 0, 0.1) 0px 0px 0px 2px'), true);
  assert.equal(isHairline('rgba(255, 255, 255, 0.03) 0px 0px 0px 1px inset'), true);
});

test('isHairline rejects a shadow that actually lifts the element', () => {
  assert.equal(isHairline('rgba(0, 0, 0, 0.15) 0px 4px 12px 0px'), false);
  assert.equal(isHairline('rgba(0, 0, 0, 0.4) 0px 1px 0px 0px'), false);
});

// ── invariants ──

function ir(nodes: Partial<RawIr['nodes'][number]>[]): ReturnType<typeof normalize> {
  const full = nodes.map((n, i) => ({
    id: `n${i}`, name: 'div', type: 'FRAME' as const, path: `body/div${i}`,
    parent: i === 0 ? null : 'n0', box: { x: 0, y: 0, w: 100, h: 100 }, children: [], ...n,
  }));
  return normalize({ nodes: full } as RawIr);
}

test('extractInvariants reads the ladders, elevation, ratios and padding weight', () => {
  const page = ir([
    { fill: { value: '#FFFFFF', token: 'surface' } },
    { radius: { value: 8, token: 'md' }, layout: { mode: 'VERTICAL', gap: 8, padding: [16, 16, 16, 16] }, shadow: { value: 'rgba(0,0,0,0.15) 0px 4px 12px 0px', token: null } },
    { radius: { value: 8, token: 'md' }, layout: { mode: 'VERTICAL', gap: 8, padding: [16, 16, 16, 16] } },
    { radius: { value: 4, token: 'sm' }, layout: { mode: 'VERTICAL', gap: 0, padding: [8, 8, 8, 8] } },
    { type: 'TEXT', text: 'left', textAlign: 'left', color: '#111111' },
    { type: 'TEXT', text: 'centre', textAlign: 'center', color: '#111111' },
    { shadow: { value: 'rgba(0,0,0,0.2) 0px 0px 0px 1px', token: null } },
  ]);
  const inv = extractInvariants(page);

  assert.deepEqual(inv.radiusLadder, [4, 8]);
  assert.ok(inv.spacingLadder.includes(16));
  assert.ok(!inv.spacingLadder.includes(0), 'zero never enters a ladder');
  assert.equal(inv.elevationLevels, 1, 'the hairline is a border, not a level');
  assert.equal(inv.centeredRatio, 0.5);
  assert.ok(inv.tokenCoverage > 0 && inv.tokenCoverage <= 1);
  assert.ok(inv.paddingWeight > 0);
});

test('extractInvariants survives an empty page', () => {
  const inv = extractInvariants(ir([]));
  assert.deepEqual(inv.radiusLadder, []);
  assert.equal(inv.elevationLevels, 0);
  assert.equal(inv.centeredRatio, 0);
  assert.equal(inv.paddingWeight, 0);
  assert.deepEqual(inv.typeScale, []);
  assert.deepEqual(inv.fontFamilies, []);
  assert.deepEqual(inv.weightLadder, []);
  assert.deepEqual(inv.motionDurations, []);
  assert.deepEqual(inv.easingVocab, []);
  assert.equal(inv.animatedShare, 0);
});

// Typography and motion used to be invisible to the pipeline entirely — a generic
// serif-heading dark blog could not be measured, only vibed about.
test('extractInvariants reads type and motion fields from text and animated nodes', () => {
  const page = ir([
    { type: 'TEXT', text: 'a', fontFamily: 'inter', fontSize: 14, fontWeight: 400, lineHeight: 1.4 },
    { type: 'TEXT', text: 'b', fontFamily: 'inter', fontSize: 21, fontWeight: 510, lineHeight: 1.2 },
    { motion: { durations: [160], animationNames: [], easings: ['ease-out'] } },
    { motion: { durations: [], animationNames: ['fade-in'], easings: ['ease'] } },
  ]);
  const inv = extractInvariants(page);

  assert.deepEqual(inv.typeScale, [14, 21]);
  assert.deepEqual(inv.fontFamilies, ['inter']);
  assert.deepEqual(inv.weightLadder, [400, 510]);
  assert.deepEqual(inv.motionDurations, [160]);
  assert.deepEqual(inv.easingVocab, ['ease', 'ease-out']);
  assert.equal(inv.animatedShare, 0.5, '2 of 4 nodes carry motion');
});

// ── distance: the checkable defence against fixation ──

const base: Invariants = {
  spacingLadder: [4, 8, 16, 24], radiusLadder: [4, 8, 12], elevationLevels: 3,
  centeredRatio: 0.1, tokenCoverage: 0.7, paddingWeight: 12,
  typeScale: [13, 14, 16, 21], fontFamilies: ['inter'], weightLadder: [400, 510],
  motionDurations: [100, 160], easingVocab: ['ease', 'ease-out'], animatedShare: 0.05,
};

test('a page identical to a reference scores 1', () => {
  assert.equal(similarity(base, base), 1);
});

test('similarity is symmetric and bounded to 0..1', () => {
  const other: Invariants = {
    spacingLadder: [5, 10], radiusLadder: [20], elevationLevels: 0, centeredRatio: 0.9, tokenCoverage: 0.1, paddingWeight: 40,
    typeScale: [16, 24, 32], fontFamilies: ['georgia'], weightLadder: [400, 700],
    motionDurations: [], easingVocab: [], animatedShare: 0,
  };
  const ab = similarity(base, other);
  assert.equal(ab, similarity(other, base));
  assert.ok(ab >= 0 && ab <= 1);
  assert.ok(ab < 0.6, 'a genuinely different design must fall under the warning threshold');
});

test('copying the ladders but not the ratios still scores high — that is the point', () => {
  const clone: Invariants = { ...base, centeredRatio: 0.15, tokenCoverage: 0.65 };
  assert.ok(similarity(base, clone) > 0.6, 'a knockoff must trip the warning');
});

// Typography must move the score, not just sit there unused: reproducing a page's
// spacing and radius ladders on top of an otherwise opposite design should read as less
// of a copy than also reproducing its type scale, families and weight ladder.
test('copying spacing and radius plus type scores higher than copying spacing and radius alone', () => {
  const opposite: Invariants = {
    spacingLadder: [5, 10], radiusLadder: [20], elevationLevels: 0, centeredRatio: 0.9, tokenCoverage: 0.1, paddingWeight: 40,
    typeScale: [16, 24, 32], fontFamilies: ['georgia'], weightLadder: [400, 700],
    motionDurations: [], easingVocab: [], animatedShare: 0,
  };
  const spacingRadiusOnly: Invariants = { ...opposite, spacingLadder: base.spacingLadder, radiusLadder: base.radiusLadder };
  const spacingRadiusType: Invariants = {
    ...spacingRadiusOnly, typeScale: base.typeScale, fontFamilies: base.fontFamilies, weightLadder: base.weightLadder,
  };
  assert.ok(
    similarity(base, spacingRadiusType) > similarity(base, spacingRadiusOnly),
    'reproducing type on top of spacing+radius must score higher than spacing+radius alone',
  );
});

test('an empty ladder never divides by zero', () => {
  const empty: Invariants = {
    spacingLadder: [], radiusLadder: [], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 0,
    typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0,
  };
  const s = similarity(base, empty);
  assert.ok(Number.isFinite(s) && s >= 0 && s <= 1);
  assert.equal(similarity(empty, empty), 1);
});

test('distances ranks every reference and names what drove the score', () => {
  const refs: Reference[] = [
    { source: 'https://linear.app', component: 'page', kind: 'page', capturedAt: 'x', invariants: base, principles: [] },
    { source: 'https://stripe.com', component: 'page', kind: 'page', capturedAt: 'x', invariants: { ...base, radiusLadder: [2], elevationLevels: 0, centeredRatio: 0.8 }, principles: [] },
  ];
  const out = distances(base, refs);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.reference, 'https://linear.app');
  assert.equal(out[0]?.similarity, 1);
  assert.ok(out[0]!.similarity >= out[1]!.similarity, 'sorted most-similar first');
  assert.ok(out[0]!.drivers.length > 0);
});

// ── store ──

const ref: Reference = {
  source: 'https://linear.app', component: 'search-bar', kind: 'component', capturedAt: new Date().toISOString(),
  invariants: base, principles: ['Radii split into three rungs, so an input and a card are different materials.'],
};

test('saveRef writes under .omd/refs and loadRefs reads it back', () => {
  const dir = project();
  const path = saveRef(dir, ref);
  assert.match(path, /\.omd\/refs\/linear\.app\.search-bar\.json$/);
  const [loaded] = loadRefs(dir);
  assert.deepEqual(loaded, ref);
});

test('saveRef overwrites the same source+component rather than accumulating duplicates', () => {
  const dir = project();
  saveRef(dir, ref);
  saveRef(dir, { ...ref, principles: ['revised'] });
  const all = loadRefs(dir);
  assert.equal(all.length, 1);
  assert.deepEqual(all[0]?.principles, ['revised']);
});

test('loadRefs on a project with no references returns empty, not a crash', () => {
  assert.deepEqual(loadRefs(project()), []);
});

test('loadRefs skips a corrupt reference file rather than failing the whole run', () => {
  const dir = project();
  saveRef(dir, ref);
  mkdirSync(join(dir, '.omd', 'refs'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'refs', 'broken.json'), '{ not json');
  assert.equal(loadRefs(dir).length, 1);
});
