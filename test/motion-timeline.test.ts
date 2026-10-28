import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyzeMotion, beatsOf, easingShape, staggersOf, type MotionSeries, type RawMotionCapture,
} from '../core/render/motion-timeline.ts';

const VIEWPORT = { width: 1440, height: 900 };
type Row = [number, number, number, number, number, number];

/** A tween sampled every frame: rest, then ease-out (cubic) from `from` to `to` over `duration`. */
function tween(start: number, duration: number, from: Partial<Record<'y' | 'o', number>>, to: Partial<Record<'y' | 'o', number>>,
  ease: (p: number) => number = p => 1 - (1 - p) ** 3, base: Row = [0, 100, 200, 300, 60, 1]): Row[] {
  const y0 = from.y ?? base[2], y1 = to.y ?? base[2], o0 = from.o ?? base[5], o1 = to.o ?? base[5];
  const rows: Row[] = [[0, base[1], y0, base[3], base[4], o0]];
  for (let t = start + 16; t <= start + duration; t += 16) {
    const p = ease((t - start) / duration);
    rows.push([t, base[1], y0 + (y1 - y0) * p, base[3], base[4], o0 + (o1 - o0) * p]);
  }
  return rows;
}
const series = (id: number, label: string, samples: Row[]): MotionSeries =>
  ({ id, label, selector: label, samples });
const raw = (rows: MotionSeries[], extra: Partial<RawMotionCapture> = {}): RawMotionCapture => ({
  viewport: VIEWPORT, scrollStartMs: null, scrollWindows: [], scroll: [], libraries: [],
  cssAnimations: { keyframes: 0, scrollTimelines: 0 }, series: rows, ...extra,
});

test('a lead heading and a regular card stagger read as distinct beats', () => {
  const rows = [
    series(0, 'h1 "Title"', tween(100, 640, { y: 240, o: 0 }, { y: 200, o: 1 })),
    ...[0, 1, 2, 3].map(index => series(index + 1, `div "${index}"`,
      tween(500 + index * 120, 400, { y: 524, o: 0 }, { y: 500, o: 1 }, undefined, [0, 100 + index * 200, 500, 180, 120, 1]))),
  ];
  const timeline = analyzeMotion(raw(rows), 'fixture');
  assert.equal(timeline.load.lead, 'h1 "Title"');
  assert.equal(timeline.load.tracks.length, 5);
  assert.equal(timeline.load.beats.length, 5);
  assert.equal(timeline.load.staggers.length, 1);
  assert.ok(Math.abs(timeline.load.staggers[0]!.intervalMs - 120) <= 5);
  assert.equal(timeline.load.staggers[0]!.tracks, 4);
  assert.ok(timeline.load.tracks.every(track => track.easing === 'ease-out'));
  assert.deepEqual(timeline.load.tracks[0]!.properties, ['opacity', 'translate']);
  assert.ok(!timeline.notes.some(note => /share one duration/.test(note)));
  assert.ok(!timeline.notes.some(note => /starts together/.test(note)));
});

test('elements moving in lockstep are reported as having no lead', () => {
  const rows = [0, 1, 2].map(index => series(index, `p "${index}"`,
    tween(200, 600, { y: 240, o: 0 }, { y: 200, o: 1 }, p => p, [0, 100 + index * 400, 200, 300, 60, 1])));
  const timeline = analyzeMotion(raw(rows), 'fixture');
  assert.equal(timeline.load.beats.length, 1);
  assert.ok(timeline.notes.some(note => /starts together/.test(note)));
});

test('separate groups with one duration and one easing are reported as undifferentiated', () => {
  const rows = [0, 300, 900].map((start, index) => series(index, `p "${index}"`,
    tween(start + 100, 600, { y: 240 + index * 100, o: 0 }, { y: 200 + index * 100, o: 1 }, p => p, [0, 100, 200, 300, 60, 1])));
  const timeline = analyzeMotion(raw(rows), 'fixture');
  assert.equal(timeline.load.tracks.length, 3);
  assert.ok(!timeline.notes.some(note => /starts together/.test(note)));
  assert.ok(timeline.notes.some(note => /share one duration and one easing shape \(linear\)/.test(note)));
  const varied = analyzeMotion(raw([...rows.slice(0, 2), series(9, 'h1 "Lead"',
    tween(1100, 1200, { y: 640, o: 0 }, { y: 600, o: 1 }, undefined, [0, 100, 600, 300, 60, 1]))]), 'fixture');
  assert.ok(!varied.notes.some(note => /share one duration/.test(note)));
});

test('wrapper children moving as one are grouped with a member count', () => {
  const rows = [0, 1, 2].map(index => series(index, `span "${index}"`, tween(100, 500, { y: 260 }, { y: 200 })));
  const timeline = analyzeMotion(raw(rows), 'fixture');
  assert.equal(timeline.load.tracks.length, 1);
  assert.equal(timeline.load.tracks[0]!.members, 3);
});

test('a reflow over two frames is a layout jump, not a tween', () => {
  const jump = series(0, 'h2 "Shifted"', [[0, 0, 300, 500, 40, 1], [400, 0, 340, 500, 40, 1], [416, 0, 360, 500, 40, 1]]);
  const timeline = analyzeMotion(raw([jump], { firstPaintMs: 100 }), 'fixture');
  assert.equal(timeline.load.tracks.length, 0);
  assert.equal(timeline.layoutJumps.length, 1);
  assert.equal(timeline.layoutJumps[0]!.shiftPx, 60);
  const beforePaint = analyzeMotion(raw([jump], { firstPaintMs: 500 }), 'fixture');
  assert.equal(beforePaint.layoutJumps.length, 0);
});

test('motion outside the viewport or while invisible is not reported as seen', () => {
  const offscreen = series(0, 'p "Below"', tween(100, 500, { y: 2400 }, { y: 2300 }));
  const invisible = series(1, 'p "Hidden"', tween(100, 500, { y: 260, o: 0 }, { y: 200, o: 0 }));
  assert.equal(analyzeMotion(raw([offscreen, invisible]), 'fixture').load.tracks.length, 0);
});

test('scroll motion separates triggered reveals, scrubbed motion and pinned content', () => {
  // Wheel input at 1000-1100ms, then a long smooth scroll (as Lenis continues) from 3000 to 3600ms.
  const scroll: [number, number][] = [[0, 0], [1000, 400], [1100, 800]];
  for (let t = 3000; t <= 3600; t += 16) scroll.push([t, 800 + (t - 3000)]);
  const windows: [number, number][] = [[1000, 1100], [3000, 3100]];
  // Triggered: begins after scrolling stopped and runs on its own clock.
  const reveal = series(0, 'p "Reveal"', [[0, 0, 1340, 400, 60, 0],
    ...tween(1120, 800, { y: 1340, o: 0 }, { y: 1300, o: 1 }).slice(1)]);
  // Scrubbed: moves only on frames where the scroll position changed, also after input ended.
  const parallax: Row[] = [[0, 0, 1000, 400, 300, 1]];
  for (let t = 3016; t <= 3600; t += 16) parallax.push([t, 0, 1000 - (t - 3000) * 0.2, 400, 300, 1]);
  // Pinned: its document position follows the scroll exactly; it has no motion of its own.
  const pinnedRows: Row[] = [[0, 0, 900, 400, 60, 1]];
  for (let t = 3016; t <= 3600; t += 16) pinnedRows.push([t, 0, 900 + (t - 3000), 400, 60, 1]);
  // Pinned stage child: follows the scroll and also fades in, scrubbed by the scroll.
  const pinnedChild: Row[] = [[0, 0, 950, 400, 60, 0]];
  for (let t = 3016; t <= 3600; t += 16) pinnedChild.push([t, 0, 950 + (t - 3000), 400, 60, Math.min(1, (t - 3000) / 600)]);
  const timeline = analyzeMotion(raw([reveal, series(1, 'img "Parallax"', parallax), series(2, 'h2 "Sticky"', pinnedRows),
    series(3, 'p "Pinned step"', pinnedChild)], { scrollStartMs: 900, scrollWindows: windows, scroll }), 'fixture');
  assert.deepEqual(timeline.scroll.triggered.map(track => track.label), ['p "Reveal"']);
  assert.equal(timeline.scroll.triggered[0]!.easing, 'ease-out');
  assert.deepEqual(timeline.scroll.scrubbed.map(track => track.label).sort(), ['img "Parallax"', 'p "Pinned step"']);
  assert.deepEqual(timeline.scroll.scrubbed.find(track => track.label === 'p "Pinned step"')?.properties, ['opacity']);
  assert.deepEqual([...timeline.scroll.pinned].sort(), ['h2 "Sticky"', 'p "Pinned step"']);
});

test('reduced-motion results are reported only when motion persists or content stays hidden', () => {
  const rows = [series(0, 'h1 "T"', tween(100, 500, { y: 260, o: 0 }, { y: 200, o: 1 }))];
  const honoured = analyzeMotion(raw(rows), 'fixture', { loadTracks: 0, hiddenContent: 0 });
  assert.ok(!honoured.notes.some(note => /reduced-motion/.test(note)));
  const ignored = analyzeMotion(raw(rows), 'fixture', { loadTracks: 1, hiddenContent: 2 });
  assert.ok(ignored.notes.some(note => /1 load motion group\(s\) still play/.test(note)));
  assert.ok(ignored.notes.some(note => /2 first-viewport content element\(s\) remain invisible/.test(note)));
});

test('easing shapes classify from quarter, half and three-quarter progress', () => {
  assert.equal(easingShape([0.5, 0.8, 0.95], false, 20), 'ease-out');
  assert.equal(easingShape([0.05, 0.2, 0.5], false, 20), 'ease-in');
  assert.equal(easingShape([0.1, 0.5, 0.9], false, 20), 'ease-in-out');
  assert.equal(easingShape([0.25, 0.5, 0.75], false, 20), 'linear');
  assert.equal(easingShape([0.6, 0.95, 1.05], true, 20), 'overshoot');
  assert.equal(easingShape([1, 1, 1], false, 3), 'stepped');
});

test('stagger needs three regular starts; beats merge starts within 60ms', () => {
  assert.deepEqual(staggersOf([{ startMs: 0, label: 'a' }, { startMs: 300, label: 'b' }]), []);
  assert.deepEqual(staggersOf([0, 90, 400, 1200].map((startMs, index) => ({ startMs, label: String(index) }))), []);
  assert.equal(staggersOf([0, 80, 160, 240].map((startMs, index) => ({ startMs, label: String(index) })))[0]?.intervalMs, 80);
  assert.deepEqual(beatsOf([{ startMs: 0 }, { startMs: 40 }, { startMs: 300 }]), [{ atMs: 0, tracks: 2 }, { atMs: 300, tracks: 1 }]);
});

test('a reveal that snaps from showing content to its start and eases back is still a triggered move', () => {
  const scroll: [number, number][] = [[0, 0], [1000, 400], [1100, 800]];
  // At rest the card already shows; when triggered it jumps to 0.65 opacity 20px lower and eases back.
  const rest: Row = [0, 0, 1300, 400, 60, 1];
  const dip = tween(1120, 900, { y: 1320, o: 0.65 }, { y: 1300, o: 1 }, undefined, rest).slice(1);
  const card = series(0, 'h3 "Card"', [rest, [1120, 0, 1320, 400, 60, 0.65], ...dip]);
  const timeline = analyzeMotion(raw([card], { scrollStartMs: 900, scrollWindows: [[1000, 1100]], scroll }), 'fixture');
  assert.deepEqual(timeline.scroll.triggered.map(track => [track.label, [...track.properties].sort()]), [['h3 "Card"', ['opacity', 'translate']]]);
  assert.equal(timeline.scroll.triggered[0]!.opacity.from, 0.65);
  // A flicker of a frame or two that returns where it was is still not a move.
  const flicker = series(1, 'p "Flicker"', [rest, [1120, 0, 1320, 400, 60, 0.65], [1136, 0, 1300, 400, 60, 1]]);
  assert.equal(analyzeMotion(raw([flicker], { scrollStartMs: 900, scrollWindows: [[1000, 1100]], scroll }), 'fixture').scroll.triggered.length, 0);
});

test('a landing short of scroll moves is told why CSS scroll timelines it declared did not count', async () => {
  const { motionShortfall } = await import('../core/design/new-surface-advisories.ts');
  const scroll = { triggered: [], scrubbed: [], pinned: [] };
  const declared = motionShortfall({ load: { tracks: [{}] }, cssAnimations: { scrollTimelines: 2 }, scroll });
  assert.match(declared ?? '', /only on load[\s\S]*declares CSS scroll timelines, but none of their moves lasted longer than one scroll step[\s\S]*animation-range/);
  // Without declared timelines the message stays about staging, not about animation-range.
  assert.doesNotMatch(motionShortfall({ load: { tracks: [{}] }, cssAnimations: { scrollTimelines: 0 }, scroll }) ?? '', /animation-range/);
  assert.equal(motionShortfall({ load: { tracks: [] }, scroll: { triggered: [{}, {}], scrubbed: [{}], pinned: [] } }), null);
});
