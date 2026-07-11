import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveRef, loadRefs } from '../core/ref/store.ts';
import { topKinshipPairs } from '../core/ref/distance.ts';
import type { Invariants, Reference } from '../core/types.ts';

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-contamination-'));

const base: Invariants = {
  spacingLadder: [4, 8, 16, 24], radiusLadder: [4, 8, 12], elevationLevels: 3,
  centeredRatio: 0.1, tokenCoverage: 0.7, paddingWeight: 12,
  typeScale: [13, 14, 16, 21], fontFamilies: ['inter'], weightLadder: [400, 510],
  motionDurations: [100, 160], easingVocab: ['ease', 'ease-out'], animatedShare: 0.05,
  hoverCoverage: 0, focusCoverage: 0,
};

const distinct: Invariants = {
  spacingLadder: [5, 10, 20], radiusLadder: [0], elevationLevels: 0,
  centeredRatio: 0.9, tokenCoverage: 0.05, paddingWeight: 2,
  typeScale: [16, 24, 48], fontFamilies: ['georgia'], weightLadder: [400, 700],
  motionDurations: [], easingVocab: [], animatedShare: 0,
  hoverCoverage: 0, focusCoverage: 0,
};

const ref: Reference = {
  source: 'https://example.com', component: 'page', kind: 'page',
  capturedAt: '2024-01-01T00:00:00.000Z', invariants: base, principles: [],
};

// ── Layer 1: slopCount on captured references ──

test('saveRef round-trips slopCount', () => {
  const dir = project();
  saveRef(dir, { ...ref, slopCount: 3 });
  const [loaded] = loadRefs(dir);
  assert.equal(loaded?.slopCount, 3);
});

test('saveRef round-trips slopCount of 0', () => {
  const dir = project();
  saveRef(dir, { ...ref, slopCount: 0 });
  const [loaded] = loadRefs(dir);
  assert.equal(loaded?.slopCount, 0);
});

test('loadRefs backward compat: a ref saved without slopCount loads without the field', () => {
  const dir = project();
  const refsDir = join(dir, '.omd', 'refs');
  mkdirSync(refsDir, { recursive: true });
  writeFileSync(join(refsDir, 'example.com.page.json'), JSON.stringify({
    source: 'https://example.com', component: 'page', kind: 'page',
    capturedAt: '2024-01-01T00:00:00.000Z', invariants: base, principles: [],
  }));
  const [loaded] = loadRefs(dir);
  assert.equal(loaded?.slopCount, undefined, 'absent in JSON → absent on loaded ref (treat as 0 at usage site)');
});

test('usage site treats absent slopCount as 0 via nullish coalescing', () => {
  const dir = project();
  saveRef(dir, ref);
  const [loaded] = loadRefs(dir);
  assert.equal((loaded?.slopCount ?? 0) >= 2, false, 'no slop findings → not flagged as contaminated');
});

// ── Layer 3: board kinship check ──

test('topKinshipPairs returns identical pair at similarity 1', () => {
  const refs: Reference[] = [
    { ...ref, source: 'https://a.com' },
    { ...ref, source: 'https://b.com' },
  ];
  const pairs = topKinshipPairs(refs);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]?.similarity, 1);
  assert.ok(
    (pairs[0]?.a === 'https://a.com' && pairs[0]?.b === 'https://b.com')
    || (pairs[0]?.a === 'https://b.com' && pairs[0]?.b === 'https://a.com'),
  );
});

test('topKinshipPairs returns empty when no pair exceeds threshold', () => {
  const refs: Reference[] = [
    { ...ref, source: 'https://a.com', invariants: base },
    { ...ref, source: 'https://b.com', invariants: distinct },
  ];
  const pairs = topKinshipPairs(refs);
  assert.deepEqual(pairs, []);
});

test('topKinshipPairs skips image references (null invariants)', () => {
  const refs: Reference[] = [
    { source: 'https://a.com', component: 'page', kind: 'image', capturedAt: 'x', invariants: null, principles: [] },
    { ...ref, source: 'https://b.com' },
  ];
  assert.deepEqual(topKinshipPairs(refs), [], 'only one measurable ref, no pairs possible');
});

test('topKinshipPairs caps output at topN (default 3)', () => {
  const refs: Reference[] = Array.from({ length: 4 }, (_, i) => ({
    ...ref, source: `https://${i}.com`,
  }));
  const pairs = topKinshipPairs(refs);
  assert.equal(pairs.length, 3, 'four identical refs produce 6 pairs but only top 3 returned');
});

test('topKinshipPairs respects custom threshold', () => {
  const slightlyDifferent: Invariants = { ...base, centeredRatio: 0.3 };
  const refs: Reference[] = [
    { ...ref, source: 'https://a.com', invariants: base },
    { ...ref, source: 'https://b.com', invariants: slightlyDifferent },
  ];
  const atDefault = topKinshipPairs(refs, 0.85);
  const atRelaxed = topKinshipPairs(refs, 0.5);
  assert.ok(atRelaxed.length >= atDefault.length, 'relaxed threshold finds at least as many pairs');
});

test('topKinshipPairs sorts most-similar first', () => {
  const nearlySame: Invariants = { ...base, centeredRatio: 0.11 };
  const refs: Reference[] = [
    { ...ref, source: 'https://a.com', invariants: base },
    { ...ref, source: 'https://b.com', invariants: base },
    { ...ref, source: 'https://c.com', invariants: nearlySame },
  ];
  const pairs = topKinshipPairs(refs, 0.5);
  assert.ok(pairs.length >= 2, 'at least two pairs above a relaxed threshold');
  for (let i = 1; i < pairs.length; i++) {
    assert.ok(pairs[i - 1]!.similarity >= pairs[i]!.similarity, 'sorted descending');
  }
});
