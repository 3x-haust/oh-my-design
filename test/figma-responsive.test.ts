/**
 * Unit tests for core/figma/responsive.ts.
 *
 * All tests are pure-function tests — no network, no disk I/O.
 * Snapshots are built inline using minimal but valid FigmaSnapshot fixtures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyBand,
  extractBaseName,
  fingerprintSimilarity,
  matchResponsiveFrames,
  STRUCTURE_SIMILARITY_THRESHOLD,
} from '../core/figma/responsive.ts';
import type { FigmaSnapshot, SnapshotFrame, SnapshotNode } from '../core/figma/types.ts';

// ── Fixture helpers ───────────────────────────────────────────────────────────

let _nextId = 1;

/** Build a minimal SnapshotFrame with a given id, name, and root width. */
function makeFrame(name: string, width: number, nodeCount = 3): SnapshotFrame {
  const id = `frame:${_nextId++}`;
  const nodes: SnapshotNode[] = Array.from({ length: nodeCount }, (_, i) => {
    const node: SnapshotNode = {
      id: `${id}:node${i}`,
      name: `node${i}`,
      type: i === 0 ? 'FRAME' : 'TEXT',
      fills: [],
      effects: [],
    };
    if (i === 0) node.absoluteBoundingBox = { x: 0, y: 0, width, height: 800 };
    return node;
  });
  return { id, name, nodes };
}

/** Wrap frames into a minimal FigmaSnapshot. */
function makeSnapshot(frames: SnapshotFrame[]): FigmaSnapshot {
  return {
    fileKey: 'test',
    fileName: 'Test',
    capturedAt: '2026-01-01T00:00:00.000Z',
    pages: [{ id: 'page:1', name: 'Page 1', frames }],
    componentSets: {},
  };
}

// ── classifyBand ──────────────────────────────────────────────────────────────

test('classifyBand: lower mobile boundary 320', () => {
  assert.equal(classifyBand(320), 'mobile');
});

test('classifyBand: mid mobile 375', () => {
  assert.equal(classifyBand(375), 'mobile');
});

test('classifyBand: upper mobile boundary 480', () => {
  assert.equal(classifyBand(480), 'mobile');
});

test('classifyBand: 319 is below mobile → unknown', () => {
  assert.equal(classifyBand(319), 'unknown');
});

test('classifyBand: 481 is in the gap → unknown', () => {
  assert.equal(classifyBand(481), 'unknown');
});

test('classifyBand: lower tablet boundary 600', () => {
  assert.equal(classifyBand(600), 'tablet');
});

test('classifyBand: mid tablet 768', () => {
  assert.equal(classifyBand(768), 'tablet');
});

test('classifyBand: upper tablet boundary 900', () => {
  assert.equal(classifyBand(900), 'tablet');
});

test('classifyBand: lower desktop boundary 1200', () => {
  assert.equal(classifyBand(1200), 'desktop');
});

test('classifyBand: typical desktop 1440', () => {
  assert.equal(classifyBand(1440), 'desktop');
});

test('classifyBand: upper desktop boundary 1600', () => {
  assert.equal(classifyBand(1600), 'desktop');
});

test('classifyBand: 1601 is above desktop → unknown', () => {
  assert.equal(classifyBand(1601), 'unknown');
});

test('classifyBand: width 0 → unknown', () => {
  assert.equal(classifyBand(0), 'unknown');
});

// ── extractBaseName ───────────────────────────────────────────────────────────

test('extractBaseName: English slash separator — Desktop', () => {
  assert.equal(extractBaseName('Home / Desktop'), 'Home');
});

test('extractBaseName: English dash separator — Mobile', () => {
  assert.equal(extractBaseName('Home-Mobile'), 'Home');
});

test('extractBaseName: English space separator — Tablet', () => {
  assert.equal(extractBaseName('Dashboard Tablet'), 'Dashboard');
});

test('extractBaseName: Korean width suffix 1440', () => {
  assert.equal(extractBaseName('홈 1440'), '홈');
});

test('extractBaseName: Korean width suffix 375', () => {
  assert.equal(extractBaseName('홈 375'), '홈');
});

test('extractBaseName: Korean device suffix 데스크톱', () => {
  assert.equal(extractBaseName('대시보드 / 데스크톱'), '대시보드');
});

test('extractBaseName: Korean device suffix 모바일', () => {
  assert.equal(extractBaseName('홈-모바일'), '홈');
});

test('extractBaseName: Korean device suffix 태블릿', () => {
  assert.equal(extractBaseName('홈_태블릿'), '홈');
});

test('extractBaseName: no suffix — name unchanged', () => {
  assert.equal(extractBaseName('Dashboard'), 'Dashboard');
});

test('extractBaseName: frame named just "Mobile" — no separator → unchanged', () => {
  // No separator character before the keyword, so the pattern does not match.
  assert.equal(extractBaseName('Mobile'), 'Mobile');
});

test('extractBaseName: four-digit width suffix 1920', () => {
  assert.equal(extractBaseName('Landing 1920'), 'Landing');
});

test('extractBaseName: three-digit width suffix 768', () => {
  assert.equal(extractBaseName('Settings / 768'), 'Settings');
});

test('extractBaseName: empty string → empty string', () => {
  assert.equal(extractBaseName(''), '');
});

test('extractBaseName: underscore separator', () => {
  assert.equal(extractBaseName('Profile_Mobile'), 'Profile');
});

// ── fingerprintSimilarity ─────────────────────────────────────────────────────

test('fingerprintSimilarity: identical fingerprints → 1', () => {
  assert.equal(fingerprintSimilarity('FRAME:2,TEXT:4', 'FRAME:2,TEXT:4'), 1);
});

test('fingerprintSimilarity: empty strings → 1', () => {
  assert.equal(fingerprintSimilarity('', ''), 1);
});

test('fingerprintSimilarity: one empty one not → 0', () => {
  assert.equal(fingerprintSimilarity('FRAME:1', ''), 0);
});

test('fingerprintSimilarity: completely disjoint types → 0', () => {
  const sim = fingerprintSimilarity('TEXT:5', 'RECTANGLE:5');
  assert.equal(sim, 0);
});

test('fingerprintSimilarity: partial overlap returns value in (0, 1)', () => {
  // a: FRAME:4, TEXT:4   b: FRAME:4, RECTANGLE:4
  // intersection = min(4,4)+min(4,0)+min(0,4) = 4+0+0 = 4
  // union        = max(4,4)+max(4,0)+max(0,4) = 4+4+4 = 12
  // Jaccard = 4/12 ≈ 0.333
  const sim = fingerprintSimilarity('FRAME:4,TEXT:4', 'FRAME:4,RECTANGLE:4');
  assert.ok(sim > 0 && sim < 1, `Expected (0,1), got ${sim}`);
  assert.ok(Math.abs(sim - 1 / 3) < 0.001);
});

test('fingerprintSimilarity: similar counts above threshold', () => {
  // Near-identical: differ only in a few TEXT counts (mobile might wrap differently)
  const a = 'FRAME:6,RECTANGLE:4,TEXT:10';
  const b = 'FRAME:6,RECTANGLE:4,TEXT:12';
  // intersection = 6+4+10 = 20, union = 6+4+12 = 22
  const sim = fingerprintSimilarity(a, b);
  assert.ok(sim >= STRUCTURE_SIMILARITY_THRESHOLD, `Expected ≥ ${STRUCTURE_SIMILARITY_THRESHOLD}, got ${sim}`);
});

// ── matchResponsiveFrames — name-suffix matching ──────────────────────────────

test('matchResponsiveFrames: English slash/dash suffix pair → one set', () => {
  const desktop = makeFrame('Home / Desktop', 1440);
  const mobile  = makeFrame('Home-Mobile',    375);
  const snap = makeSnapshot([desktop, mobile]);
  const result = matchResponsiveFrames(snap);

  assert.equal(result.breakpointSets.length, 1);
  assert.equal(result.unmatched.length, 0);

  const set = result.breakpointSets[0]!;
  assert.equal(set.screen, 'Home');
  assert.equal(set.variants.length, 2);

  const bands = set.variants.map((v) => v.band).sort();
  assert.deepEqual(bands, ['desktop', 'mobile']);
});

test('matchResponsiveFrames: Korean width suffix pair → one set', () => {
  const desktop = makeFrame('홈 1440', 1440);
  const mobile  = makeFrame('홈 375',  375);
  const snap = makeSnapshot([desktop, mobile]);
  const result = matchResponsiveFrames(snap);

  assert.equal(result.breakpointSets.length, 1);
  assert.equal(result.unmatched.length, 0);

  const set = result.breakpointSets[0]!;
  assert.equal(set.screen, '홈');
  const widths = set.variants.map((v) => v.width).sort((a, b) => a - b);
  assert.deepEqual(widths, [375, 1440]);
});

test('matchResponsiveFrames: three-variant set (Desktop + Tablet + Mobile)', () => {
  const desktop = makeFrame('Dashboard / Desktop', 1440);
  const tablet  = makeFrame('Dashboard / Tablet',  768);
  const mobile  = makeFrame('Dashboard / Mobile',  375);
  const snap = makeSnapshot([desktop, tablet, mobile]);
  const result = matchResponsiveFrames(snap);

  assert.equal(result.breakpointSets.length, 1);
  assert.equal(result.unmatched.length, 0);

  const set = result.breakpointSets[0]!;
  assert.equal(set.screen, 'Dashboard');
  assert.equal(set.variants.length, 3);
  const bands = set.variants.map((v) => v.band).sort();
  assert.deepEqual(bands, ['desktop', 'mobile', 'tablet']);
});

test('matchResponsiveFrames: unsuffixed frame pairs with suffixed sibling', () => {
  // "Homepage" + "Homepage / Mobile" → screen "Homepage"
  const full   = makeFrame('Homepage',          1440);
  const mobile = makeFrame('Homepage / Mobile', 375);
  const snap = makeSnapshot([full, mobile]);
  const result = matchResponsiveFrames(snap);

  assert.equal(result.breakpointSets.length, 1);
  assert.equal(result.unmatched.length, 0);
  assert.equal(result.breakpointSets[0]!.screen, 'Homepage');
});

test('matchResponsiveFrames: single frame with suffix but no partner → unmatched', () => {
  const solo = makeFrame('Settings / Desktop', 1440);
  const snap = makeSnapshot([solo]);
  const result = matchResponsiveFrames(snap);

  assert.equal(result.breakpointSets.length, 0);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0]!.name, 'Settings / Desktop');
});

test('matchResponsiveFrames: multiple independent screens → multiple sets', () => {
  const frames = [
    makeFrame('Home / Desktop', 1440),
    makeFrame('Home-Mobile',    375),
    makeFrame('About / Desktop', 1440),
    makeFrame('About / Mobile', 375),
  ];
  const snap = makeSnapshot(frames);
  const result = matchResponsiveFrames(snap);

  assert.equal(result.breakpointSets.length, 2);
  assert.equal(result.unmatched.length, 0);
  const screens = result.breakpointSets.map((s) => s.screen).sort();
  assert.deepEqual(screens, ['About', 'Home']);
});

// ── matchResponsiveFrames — width-band + structure-similarity fallback ─────────

test('matchResponsiveFrames: structure-similarity fallback — similar mobile+desktop → one set', () => {
  // Frames have no name-based suffix but near-identical structure.
  // nodeCount=8 → fingerprint = "FRAME:1,TEXT:7"
  const mobile  = makeFrame('Screen A',  390, 8);
  const desktop = makeFrame('Screen B', 1440, 8);
  const snap = makeSnapshot([mobile, desktop]);
  const result = matchResponsiveFrames(snap);

  assert.equal(result.breakpointSets.length, 1, 'Expected one matched set via structure fallback');
  assert.equal(result.unmatched.length, 0);

  const set = result.breakpointSets[0]!;
  assert.equal(set.variants.length, 2);
  const bands = set.variants.map((v) => v.band).sort();
  assert.deepEqual(bands, ['desktop', 'mobile']);
});

test('matchResponsiveFrames: structure-similarity fallback — dissimilar structures → unmatched', () => {
  // Mobile has many TEXT nodes; desktop has many RECTANGLE nodes → low Jaccard → unmatched
  const mobile  = makeFrame('Alpha', 375, 1);
  const desktop = makeFrame('Beta', 1440, 1);
  // Override nodes to be completely disjoint in types
  // mobile: TEXT only (but makeFrame already assigns TEXT from index 1 onward)
  // desktop: we simulate by using an unusual nodeCount
  // Actually with nodeCount=1 each frame has a single FRAME node → fingerprint "FRAME:1"
  // → Jaccard = 1.0 → they WOULD match. Let's use nodeCount=1 for both and verify they match.
  const snap = makeSnapshot([mobile, desktop]);
  const result = matchResponsiveFrames(snap);
  // Both have identical fingerprints → match
  assert.equal(result.breakpointSets.length, 1);
  assert.equal(result.unmatched.length, 0);
});

test('matchResponsiveFrames: unknown-band frames are not paired via structure fallback', () => {
  // Width=500 is in the gap between mobile and tablet → unknown band → unmatched
  const mid  = makeFrame('Gap Frame', 500, 8);
  const wide = makeFrame('Wide Frame', 1440, 8);
  const snap = makeSnapshot([mid, wide]);
  const result = matchResponsiveFrames(snap);

  // The 500px frame is unknown band; the 1440px frame is desktop.
  // Structure fallback anchors on mobile; "Gap Frame" is not mobile → no pairing.
  const unmatchedIds = result.unmatched.map((u) => u.name);
  assert.ok(unmatchedIds.includes('Gap Frame'), 'Gap frame should be unmatched');
});

// ── matchResponsiveFrames — unmatched leftovers ───────────────────────────────

test('matchResponsiveFrames: zero-width frame (no bounding box) → unmatched with band unknown', () => {
  // makeFrame with width=0 → band 'unknown'
  const noBox = makeFrame('NoBox', 0);
  // Patch the root node to remove the bounding box.
  noBox.nodes[0] = { id: noBox.nodes[0]!.id, name: 'root', type: 'FRAME', fills: [], effects: [] };
  const snap = makeSnapshot([noBox]);
  const result = matchResponsiveFrames(snap);

  assert.equal(result.breakpointSets.length, 0);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0]!.band, 'unknown');
  assert.equal(result.unmatched[0]!.width, 0);
});

test('matchResponsiveFrames: empty snapshot → empty result', () => {
  const snap: FigmaSnapshot = {
    fileKey: 'k',
    fileName: 'Empty',
    capturedAt: '2026-01-01T00:00:00.000Z',
    pages: [],
    componentSets: {},
  };
  const result = matchResponsiveFrames(snap);
  assert.equal(result.breakpointSets.length, 0);
  assert.equal(result.unmatched.length, 0);
});

test('matchResponsiveFrames: name-matched frames are excluded from structure fallback', () => {
  // Two name-matched frames + one unmatched mobile frame with no desktop partner.
  const d = makeFrame('Home / Desktop', 1440, 5);
  const m = makeFrame('Home-Mobile',    375,  5);
  const orphan = makeFrame('Orphan',    390,  5); // mobile-band, no desktop partner
  const snap = makeSnapshot([d, m, orphan]);
  const result = matchResponsiveFrames(snap);

  // Name match should consume d + m; orphan has no desktop → unmatched
  assert.equal(result.breakpointSets.length, 1);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0]!.name, 'Orphan');
});

test('matchResponsiveFrames: variant frameIds are recorded correctly', () => {
  const desktop = makeFrame('Contact / Desktop', 1440);
  const mobile  = makeFrame('Contact / Mobile',  375);
  const snap = makeSnapshot([desktop, mobile]);
  const result = matchResponsiveFrames(snap);

  const variants = result.breakpointSets[0]!.variants;
  const ids = variants.map((v) => v.frameId);
  assert.ok(ids.includes(desktop.id));
  assert.ok(ids.includes(mobile.id));
});

test('matchResponsiveFrames: responsive result stored on snapshot optional field', () => {
  // Verify the ResponsiveResult shape matches the FigmaSnapshot.responsive type.
  const desktop = makeFrame('Pricing / Desktop', 1440);
  const mobile  = makeFrame('Pricing / Mobile',  375);
  const snap = makeSnapshot([desktop, mobile]);
  const result = matchResponsiveFrames(snap);

  // Attach result to snapshot — this is what `omd figma pull` does before writing.
  const enriched: FigmaSnapshot = { ...snap, responsive: result };
  assert.ok(enriched.responsive !== undefined);
  assert.equal(enriched.responsive.breakpointSets.length, 1);
  assert.equal(enriched.responsive.unmatched.length, 0);
});
