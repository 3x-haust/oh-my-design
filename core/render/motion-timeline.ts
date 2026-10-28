/**
 * Motion timeline observation — what moved, when, how, and in what order.
 *
 * A paused screenshot or a pixel-energy scalar cannot tell a hero intro with a deliberate lead,
 * overlapping beats and a settled ease-out from twelve identical fades. This module samples the
 * rendered geometry and effective opacity of content elements on every animation frame while the
 * page loads and while a real wheel-driven scroll-through runs, then reduces the samples to
 * choreography a designer can read: grouped tracks, beats, stagger intervals, easing shape,
 * scrubbed vs triggered scroll motion, pinned scenes and late layout jumps.
 *
 * It observes rendered results, so CSS transitions, WAAPI, GSAP, Framer Motion and rAF loops are
 * all visible; it does not read library internals. The output is advisory evidence for the author
 * and reviewer (`omd render <page> --motion`), never a completion gate. Clip-path, filter and
 * canvas/WebGL motion are outside the sampled properties; the contact-sheet frames still show them,
 * and a canvas whose pixels keep changing after content settles gets its own frames.
 */
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { decodePng } from '../motion/energy.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { browserExpression } from '../ref/browser-evaluation.ts';
import { resolveRenderTarget } from './serve.ts';
import type { Viewport } from './index.ts';

type Browser = import('playwright').Browser;
type Page = import('playwright').Page;

/** One element's recorded states: [tMs, x, y, w, h, opacity]; only changed states are kept. */
export type MotionSeries = Readonly<{
  id: number;
  label: string;
  selector: string;
  samples: readonly (readonly [number, number, number, number, number, number])[];
}>;
export type RawMotionCapture = Readonly<{
  viewport: Viewport;
  /** Sampler time at which the scroll-through began; load phase is everything before it. */
  scrollStartMs: number | null;
  /** Sampler-time windows during which wheel input was being delivered (smooth scrollers continue after). */
  scrollWindows: readonly (readonly [number, number])[];
  /** [tMs, scrollY] whenever scroll position changed. */
  scroll: readonly (readonly [number, number])[];
  /** First contentful paint in sampler time; layout changes before it were never seen. */
  firstPaintMs?: number | null;
  series: readonly MotionSeries[];
  libraries: readonly string[];
  cssAnimations: Readonly<{ keyframes: number; scrollTimelines: number }>;
}>;

export type EasingShape = 'linear' | 'ease-out' | 'ease-in' | 'ease-in-out' | 'overshoot' | 'stepped';
export type MotionTrack = Readonly<{
  label: string;
  selector: string;
  members: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  properties: readonly ('opacity' | 'translate' | 'scale')[];
  translatePx: Readonly<{ x: number; y: number }>;
  opacity: Readonly<{ from: number; to: number }>;
  scale: number;
  easing: EasingShape;
  /** Normalized progress at 25/50/75% of the duration for the dominant property. */
  progress: readonly [number, number, number];
}>;
export type ScrollTrack = MotionTrack & Readonly<{
  mode: 'triggered' | 'scrubbed';
  /** Element top as a fraction of viewport height when the motion began (triggered reveals). */
  viewportEntry: number | null;
  scrollY: number;
}>;
export type MotionTimeline = Readonly<{
  schema: 'motion-timeline-v1';
  target: string;
  viewport: Viewport;
  libraries: readonly string[];
  cssAnimations: RawMotionCapture['cssAnimations'];
  load: Readonly<{
    tracks: readonly MotionTrack[];
    beats: readonly Readonly<{ atMs: number; tracks: number }>[];
    staggers: readonly Readonly<{ intervalMs: number; tracks: number; firstLabel: string }>[];
    settledMs: number;
    lead: string | null;
  }>;
  scroll: Readonly<{
    observed: boolean;
    triggered: readonly ScrollTrack[];
    scrubbed: readonly ScrollTrack[];
    pinned: readonly string[];
    virtualScroll: boolean;
  }>;
  layoutJumps: readonly Readonly<{ atMs: number; label: string; shiftPx: number }>[];
  reducedMotion: Readonly<{ checked: boolean; loadTracks: number; hiddenContent: number }> | null;
  notes: readonly string[];
}>;

const MOVE_PX = 1.5;
const OPACITY_STEP = 0.02;
const SEGMENT_GAP_MS = 200;
const FRAME_MS = 16;

/**
 * In-page sampler, installed before any page script runs. Kept as plain source so it can be
 * injected with addInitScript and read in review without a build step.
 */
export const MOTION_SAMPLER_SOURCE = String.raw`(() => {
  if (window.__omdMotion) return;
  const t0 = performance.now();
  const state = { t0, series: [], scroll: [], ids: new WeakMap(), last: [], meta: [], total: 0 };
  window.__omdMotion = state;
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') state.fcp = Math.round(entry.startTime - t0);
    }).observe({ type: 'paint', buffered: true });
  } catch {}
  const MAX_ELEMENTS = 600, MAX_SAMPLES = 250000;
  let candidates = [], lastPick = -1e9, lastScroll = -1;
  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const media = el => /^(IMG|PICTURE|VIDEO|CANVAS|SVG|INPUT|BUTTON|TEXTAREA|SELECT)$/i.test(el.tagName);
  const cssPath = el => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1 && node !== document.body && parts.length < 4; node = node.parentElement) {
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      const cls = [...node.classList].filter(c => !/\d{3,}|^(is|has)-/.test(c)).slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
      parts.unshift(node.tagName.toLowerCase() + cls);
    }
    return parts.join(' > ');
  };
  const pick = () => {
    if (!document.body) return [];
    const picked = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (picked.length >= MAX_ELEMENTS) break;
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      if (!ownText(el) && !media(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height < 64) continue;
      let id = state.ids.get(el);
      if (id === undefined) {
        id = state.meta.length;
        state.ids.set(el, id);
        const src = (el.currentSrc || el.getAttribute('src') || '').split('?')[0].split('/').pop();
        const text = (el.getAttribute('aria-label') || el.getAttribute('alt') || el.textContent || src || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 48);
        state.meta.push({ label: el.tagName.toLowerCase() + ' "' + text + '"', selector: cssPath(el) });
        state.series.push([]);
        state.last.push(null);
      }
      picked.push([el, id]);
    }
    return picked;
  };
  const opacityOf = (el, memo) => {
    if (!el || el.nodeType !== 1) return 1;
    if (memo.has(el)) return memo.get(el);
    const style = getComputedStyle(el);
    const own = style.visibility === 'hidden' || style.display === 'none' ? 0 : Number(style.opacity);
    const value = own * opacityOf(el.parentElement, memo);
    memo.set(el, value);
    return value;
  };
  const frame = now => {
    const t = Math.round(now - t0);
    if (now - lastPick > 250) { candidates = pick(); lastPick = now; }
    const sy = Math.round(scrollY);
    if (sy !== lastScroll) { state.scroll.push([t, sy]); lastScroll = sy; }
    const memo = new Map();
    for (const [el, id] of candidates) {
      if (state.total >= MAX_SAMPLES) break;
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      // Document coordinates throughout: pinned and fixed content is recognised afterwards by
      // following the scroll, since libraries switch to position: fixed only while pinned.
      const row = [t, Math.round(r.left * 10) / 10, Math.round((r.top + scrollY) * 10) / 10,
        Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10, Math.round(opacityOf(el, memo) * 1000) / 1000];
      const last = state.last[id];
      if (last && Math.abs(last[1] - row[1]) < 0.5 && Math.abs(last[2] - row[2]) < 0.5 && Math.abs(last[3] - row[3]) < 0.5
        && Math.abs(last[4] - row[4]) < 0.5 && Math.abs(last[5] - row[5]) < 0.005) continue;
      state.series[id].push(row);
      state.last[id] = row;
      state.total++;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();`;

/** Rendered-library fingerprints: what produced the motion, as far as the page discloses it. */
const LIBRARY_PROBE = String.raw`() => {
  const found = [];
  const w = window, root = document.documentElement;
  const has = selector => { try { return !!document.querySelector(selector); } catch { return false; } };
  if (w.gsap || w.TweenMax || w.TweenLite) found.push('gsap');
  if (w.ScrollTrigger || (w.gsap && w.gsap.plugins && w.gsap.plugins.scrollTrigger)) found.push('gsap-scrolltrigger');
  if (w.Lenis || w.lenis || root.classList.contains('lenis')) found.push('lenis');
  if (w.LocomotiveScroll || has('[data-scroll-container]')) found.push('locomotive-scroll');
  if (has('[data-framer-appear-id],[data-framer-name],[data-projection-id]')) found.push('framer-motion');
  if (has('[data-aos]')) found.push('aos');
  if (w.Swiper || has('.swiper')) found.push('swiper');
  if (w.lottie || w.bodymovin || has('lottie-player,dotlottie-player')) found.push('lottie');
  if (has('spline-viewer') || w.SPLINE) found.push('spline');
  if (w.rive || has('canvas[data-rive]')) found.push('rive');
  if (w.THREE || w.__THREE__) found.push('three');
  if (w.barba) found.push('barba');
  if (w.swup) found.push('swup');
  let keyframes = 0, scrollTimelines = 0;
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    const walk = list => { for (const rule of list) {
      if (rule.type === 7) keyframes++;
      if (rule.style && /(view|scroll)\(/.test(rule.style.getPropertyValue('animation-timeline'))) scrollTimelines++;
      if (rule.cssRules) walk(rule.cssRules);
    } };
    walk(rules);
  }
  if (scrollTimelines > 0) found.push('css-scroll-timeline');
  if (typeof document.startViewTransition === 'function' && has('[style*="view-transition-name"]')) found.push('view-transitions');
  return { libraries: found, keyframes, scrollTimelines };
}`;

type Sample = MotionSeries['samples'][number];
type Segment = Readonly<{ series: MotionSeries; samples: readonly Sample[] }>;

const changed = (a: Sample, b: Sample): boolean =>
  Math.abs(a[1] - b[1]) > MOVE_PX || Math.abs(a[2] - b[2]) > MOVE_PX
  || Math.abs(a[3] - b[3]) > Math.max(MOVE_PX, a[3] * 0.01) || Math.abs(a[4] - b[4]) > Math.max(MOVE_PX, a[4] * 0.01)
  || Math.abs(a[5] - b[5]) > OPACITY_STEP;

/**
 * Split one element's samples into contiguous motion segments, each including its resting start
 * state. The sampler records a row only when something changed, so consecutive recorded rows
 * within SEGMENT_GAP_MS are one continuous movement even when an ease-out tail moves less than a
 * pixel per frame; a segment counts only if some row departs measurably from where it began.
 */
export function motionSegments(series: MotionSeries, from: number, to: number): Segment[] {
  const rows = series.samples;
  const segments: Segment[] = [];
  let current: Sample[] | null = null;
  const close = () => {
    if (current && current.slice(1).some(row => changed(current![0]!, row))) segments.push({ series, samples: current });
    current = null;
  };
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1]!, row = rows[index]!;
    if (row[0] < from || row[0] >= to) { close(); continue; }
    const last = current?.[current.length - 1];
    if (current && last && row[0] - last[0] <= SEGMENT_GAP_MS) current.push(row);
    else {
      close();
      // The resting row may be much older than the motion; anchor one frame before the first change.
      current = [[Math.max(previous[0], row[0] - FRAME_MS), previous[1], previous[2], previous[3], previous[4], previous[5]], row];
    }
  }
  close();
  return segments;
}

const center = (row: Sample) => [row[1] + row[3] / 2, row[2] + row[4] / 2] as const;

/** Classify a progress curve by where it stands at a quarter, half and three quarters of its time. */
export function easingShape(progress: readonly [number, number, number], overshoot: boolean, samples: number): EasingShape {
  // Two or three recorded frames is a layout change (reflow, hydration, late font), not a tween.
  if (samples <= 3) return 'stepped';
  if (overshoot) return 'overshoot';
  const [q1, half, q3] = progress;
  if (half >= 0.62 && q1 >= 0.35) return 'ease-out';
  if (half <= 0.38 && q3 <= 0.65) return 'ease-in';
  if (q1 <= 0.2 && q3 >= 0.8) return 'ease-in-out';
  return 'linear';
}

/**
 * A reveal that starts from content already showing snaps to its start state and eases back to where it rested, so
 * its net change is nil. The visitor still sees it move: describe it from that snap to its end.
 */
function fromDeparture(rows: readonly Sample[]): readonly Sample[] {
  const first = rows[0]!, last = rows[rows.length - 1]!;
  const [x0, y0] = center(first), [x1, y1] = center(last);
  if (Math.abs(last[5] - first[5]) > 0.05 || Math.hypot(x1 - x0, y1 - y0) > 2 || first[3] > 0 && Math.abs(last[3] / first[3] - 1) > 0.02) return rows;
  const departure = (row: Sample): number => {
    const [x, y] = center(row);
    return Math.max(Math.abs(row[5] - first[5]) / 0.05, Math.hypot(x - x0, y - y0) / 2);
  };
  let peak = 0;
  rows.forEach((row, index) => { if (departure(row) > departure(rows[peak]!)) peak = index; });
  return departure(rows[peak]!) > 1 && rows.length - peak > 3 ? rows.slice(peak) : rows;
}

function describeSegment(segment: Segment): Omit<MotionTrack, 'label' | 'selector' | 'members'> {
  const rows = fromDeparture(segment.samples);
  const first = rows[0]!, last = rows[rows.length - 1]!;
  const startMs = first[0];
  const [x0, y0] = center(first), [x1, y1] = center(last);
  const dx = Math.round(x1 - x0), dy = Math.round(y1 - y0);
  const scale = first[3] > 0 ? Math.round((last[3] / first[3]) * 1000) / 1000 : 1;
  const properties: MotionTrack['properties'][number][] = [];
  if (Math.abs(last[5] - first[5]) > 0.05) properties.push('opacity');
  if (Math.hypot(dx, dy) > 2) properties.push('translate');
  if (Math.abs(scale - 1) > 0.02) properties.push('scale');
  // Dominant property drives the progress curve: displacement if it moved, else opacity, else size.
  const value = (row: Sample): number => {
    if (properties.includes('translate')) { const [x, y] = center(row); return Math.hypot(x - x0, y - y0); }
    if (properties.includes('opacity')) return row[5];
    return row[3];
  };
  const v0 = value(first), v1 = value(last), span = v1 - v0;
  const duration = Math.max(FRAME_MS, last[0] - first[0]);
  const at = (fraction: number): number => {
    if (span === 0) return fraction;
    const t = first[0] + duration * fraction;
    for (let index = 1; index < rows.length; index++) {
      const a = rows[index - 1]!, b = rows[index]!;
      if (b[0] >= t) {
        const mix = b[0] === a[0] ? 1 : (t - a[0]) / (b[0] - a[0]);
        return Math.round((((value(a) + (value(b) - value(a)) * mix) - v0) / span) * 100) / 100;
      }
    }
    return 1;
  };
  const progress = [at(0.25), at(0.5), at(0.75)] as const;
  const overshoot = span !== 0 && rows.some(row => (value(row) - v0) / span > 1.04 || (value(row) - v0) / span < -0.04);
  return {
    startMs, endMs: last[0], durationMs: duration, properties,
    translatePx: { x: dx, y: dy }, opacity: { from: first[5], to: last[5] }, scale,
    easing: easingShape(progress, overshoot, rows.length), progress,
  };
}

/** Children of one animated wrapper share a track; report the group once with its member count. */
function groupTracks<T extends Omit<MotionTrack, 'label' | 'selector' | 'members'>>(
  rows: readonly (T & { label: string; selector: string })[],
): (T & { label: string; selector: string; members: number })[] {
  const groups = new Map<string, T & { label: string; selector: string; members: number }>();
  for (const row of rows) {
    const key = [Math.round(row.startMs / 40), Math.round(row.endMs / 40), Math.round(row.translatePx.x / 3),
      Math.round(row.translatePx.y / 3), Math.round(row.opacity.from * 10), Math.round(row.opacity.to * 10),
      Math.round(row.scale * 50)].join(':');
    const existing = groups.get(key);
    if (existing) existing.members++;
    else groups.set(key, { ...row, members: 1 });
  }
  return [...groups.values()].sort((a, b) => a.startMs - b.startMs || b.members - a.members);
}

/** Starts within 60ms read as one beat. */
export function beatsOf(tracks: readonly Pick<MotionTrack, 'startMs'>[]): { atMs: number; tracks: number }[] {
  const beats: { atMs: number; tracks: number }[] = [];
  for (const track of [...tracks].sort((a, b) => a.startMs - b.startMs)) {
    const last = beats[beats.length - 1];
    if (last && track.startMs - last.atMs <= 60) last.tracks++;
    else beats.push({ atMs: track.startMs, tracks: 1 });
  }
  return beats;
}

/** Runs of three or more consecutive starts at a near-constant interval read as a stagger. */
export function staggersOf(tracks: readonly Pick<MotionTrack, 'startMs' | 'label'>[]) {
  const sorted = [...tracks].sort((a, b) => a.startMs - b.startMs);
  const runs: { intervalMs: number; tracks: number; firstLabel: string }[] = [];
  let index = 0;
  while (index < sorted.length - 2) {
    const interval = sorted[index + 1]!.startMs - sorted[index]!.startMs;
    if (interval < 20 || interval > 400) { index++; continue; }
    let end = index + 1;
    while (end + 1 < sorted.length) {
      const next = sorted[end + 1]!.startMs - sorted[end]!.startMs;
      if (Math.abs(next - interval) > Math.max(12, interval * 0.35)) break;
      end++;
    }
    if (end - index + 1 >= 3) {
      const span = sorted[end]!.startMs - sorted[index]!.startMs;
      runs.push({ intervalMs: Math.round(span / (end - index)), tracks: end - index + 1, firstLabel: sorted[index]!.label });
      index = end + 1;
    } else index++;
  }
  return runs;
}

/** Whether a person could have seen the segment: some visible row overlaps the viewport then. */
function seen(segment: Segment, viewportHeight: number, scroll: RawMotionCapture['scroll']): boolean {
  return segment.samples.some(row => {
    const top = scrollAt(row[0], scroll);
    return row[5] > 0.05 && row[2] < top + viewportHeight && row[2] + row[4] > top;
  });
}

/** Whether the scroll position changed in (from, to]; scrubbed motion changes only when it does. */
function scrollChanged(from: number, to: number, scroll: RawMotionCapture['scroll']): boolean {
  let low = 0, high = scroll.length;
  while (low < high) { const mid = (low + high) >> 1; if (scroll[mid]![0] <= from - 20) low = mid + 1; else high = mid; }
  return low < scroll.length && scroll[low]![0] <= to;
}
const scrollAt = (t: number, scroll: RawMotionCapture['scroll']): number => {
  let value = 0;
  for (const [time, y] of scroll) { if (time > t) break; value = y; }
  return value;
};

/** Elements that shift together share one cause; report one event per 50ms window, largest shift first. */
function layoutEvents(jumps: readonly { atMs: number; label: string; shiftPx: number }[]) {
  const events: { atMs: number; label: string; shiftPx: number }[] = [];
  for (const jump of [...jumps].sort((a, b) => a.atMs - b.atMs)) {
    const last = events[events.length - 1];
    if (last && jump.atMs - last.atMs <= 50) {
      if (jump.shiftPx > last.shiftPx) { last.label = jump.label; last.shiftPx = jump.shiftPx; }
    } else events.push({ ...jump });
  }
  return events.slice(0, 20);
}

/** Pure reduction from raw samples to readable choreography. */
export function analyzeMotion(
  raw: RawMotionCapture, target: string,
  reduced: Readonly<{ loadTracks: number; hiddenContent: number }> | null = null,
): MotionTimeline {
  const loadEnd = raw.scrollStartMs ?? Number.POSITIVE_INFINITY;
  const loadRows: (MotionTrack & { label: string; selector: string })[] = [];
  const jumps: { atMs: number; label: string; shiftPx: number }[] = [];
  const scrollRows: (ScrollTrack & { label: string; selector: string })[] = [];
  const pinned = new Set<string>();
  let docMovedDuringScroll = 0, scrollingElements = 0;
  for (const series of raw.series) {
    for (const segment of motionSegments(series, 0, loadEnd)) {
      if (!seen(segment, raw.viewport.height, raw.scroll)) continue;
      const track = describeSegment(segment);
      if (track.easing === 'stepped') {
        const shiftPx = Math.round(Math.hypot(track.translatePx.x, track.translatePx.y));
        if (track.properties.includes('translate') && shiftPx >= 4 && track.startMs > (raw.firstPaintMs ?? 0)) {
          jumps.push({ atMs: track.startMs, label: series.label, shiftPx });
        }
        continue;
      }
      if (track.properties.length) loadRows.push({ ...track, label: series.label, selector: series.selector, members: 1 });
    }
    if (raw.scrollStartMs === null) continue;
    let movedInScroll = false, followedScroll = false;
    const ownScrollRows: (ScrollTrack & { label: string; selector: string })[] = [];
    for (const segment of motionSegments(series, raw.scrollStartMs, Number.POSITIVE_INFINITY)) {
      if (!seen(segment, raw.viewport.height, raw.scroll)) continue;
      const rows = segment.samples;
      const first = rows[0]!, last = rows[rows.length - 1]!;
      const scrollDelta = scrollAt(last[0], raw.scroll) - scrollAt(first[0], raw.scroll);
      const followsScroll = Math.abs(scrollDelta) > 40
        && Math.abs((last[2] - first[2]) - scrollDelta) <= Math.max(8, Math.abs(scrollDelta) * 0.15);
      // Pinned or fixed content travels with the viewport; its own motion is what remains in
      // viewport coordinates.
      const local: Segment = followsScroll
        ? { series, samples: rows.map(row => [row[0], row[1], row[2] - scrollAt(row[0], raw.scroll), row[3], row[4], row[5]] as const) }
        : segment;
      if (followsScroll) {
        followedScroll = movedInScroll = true;
        pinned.add(series.label);
        if (!local.samples.slice(1).some(row => changed(local.samples[0]!, row))) continue;
      }
      const track = describeSegment(local);
      if (!track.properties.length || track.easing === 'stepped') continue;
      movedInScroll = true;
      const coupled = rows.slice(1).filter((row, index) => scrollChanged(rows[index]![0], row[0], raw.scroll)).length
        / Math.max(1, rows.length - 1);
      const mode = coupled >= 0.8 ? 'scrubbed' as const : 'triggered' as const;
      const scrollY = scrollAt(track.startMs, raw.scroll);
      const top = local.samples[0]![2] - (followsScroll ? 0 : scrollY);
      ownScrollRows.push({
        ...track, label: series.label, selector: series.selector, members: 1, mode, scrollY,
        viewportEntry: mode === 'triggered' ? Math.round((top / raw.viewport.height) * 100) / 100 : null,
      });
    }
    // Pin engagement and release show as brief translate-only slips (the pin lags the scroll by a
    // frame); they belong to the pin, not to choreography.
    scrollRows.push(...(followedScroll
      ? ownScrollRows.filter(track => !(track.durationMs < 200 && track.properties.length === 1 && track.properties[0] === 'translate'))
      : ownScrollRows));
    if (movedInScroll) {
      scrollingElements++;
      if (!followedScroll) docMovedDuringScroll++;
    }
  }
  const load = groupTracks(loadRows);
  const scroll = groupTracks(scrollRows);
  const scrollTravel = raw.scroll.length ? Math.max(...raw.scroll.map(([, y]) => y)) : 0;
  // A transform-driven scroller keeps scrollY still while every element moves with the wheel.
  const virtualScroll = raw.scrollStartMs !== null && scrollTravel < raw.viewport.height * 0.25
    && raw.series.length > 0 && docMovedDuringScroll / raw.series.length > 0.5;
  const leadTrack = load.length
    ? [...load].sort((a, b) => a.startMs - b.startMs || b.members - a.members)[0]! : null;
  const timeline: MotionTimeline = {
    schema: 'motion-timeline-v1', target, viewport: raw.viewport, libraries: raw.libraries, cssAnimations: raw.cssAnimations,
    load: {
      tracks: load, beats: beatsOf(load), staggers: staggersOf(load),
      settledMs: load.reduce((end, track) => Math.max(end, track.endMs), 0),
      lead: leadTrack ? leadTrack.label : null,
    },
    scroll: {
      observed: raw.scrollStartMs !== null,
      triggered: scroll.filter(track => track.mode === 'triggered'),
      scrubbed: scroll.filter(track => track.mode === 'scrubbed'),
      pinned: [...pinned],
      virtualScroll,
    },
    layoutJumps: layoutEvents(jumps),
    reducedMotion: reduced === null ? null : { checked: true, ...reduced },
    notes: [],
  };
  return { ...timeline, notes: motionNotes(timeline, scrollingElements) };
}

/** Plain-language observations. They describe what happened; whether it fits is the reviewer's call. */
export function motionNotes(timeline: MotionTimeline, scrollingElements = 0): string[] {
  const notes: string[] = [];
  const { load, scroll } = timeline;
  if (!load.tracks.length) notes.push('No load motion observed in sampled content elements.');
  else {
    notes.push(`Load: ${load.tracks.length} motion group(s) in ${load.beats.length} beat(s), settled at ${load.settledMs}ms; first to move: ${load.lead}.`);
    const moving = load.tracks.reduce((count, track) => count + track.members, 0);
    if (load.beats.length === 1 && moving >= 3) {
      notes.push('Every load group starts together: no lead element or sequence is established.');
    }
    const durations = new Set(load.tracks.map(track => Math.round(track.durationMs / 50)));
    const easings = new Set(load.tracks.map(track => track.easing));
    if (load.tracks.length >= 3 && durations.size === 1 && easings.size === 1) {
      notes.push(`All ${load.tracks.length} load groups share one duration and one easing shape (${[...easings][0]}); roles are not differentiated by timing.`);
    }
    for (const run of load.staggers) notes.push(`Stagger: ${run.tracks} groups ${run.intervalMs}ms apart, beginning with ${run.firstLabel}.`);
    if (load.settledMs > 2500) notes.push(`Load motion holds content in motion until ${load.settledMs}ms.`);
  }
  if (scroll.observed) {
    if (scroll.triggered.length) {
      const entries = scroll.triggered.map(track => track.viewportEntry)
        .filter((value): value is number => value !== null && value >= -0.2 && value <= 1.2);
      const median = [...entries].sort((a, b) => a - b)[Math.floor(entries.length / 2)];
      notes.push(`Scroll: ${scroll.triggered.length} triggered reveal group(s)${median === undefined ? '' : `, typically starting with the element top at ${Math.round(median * 100)}% of the viewport`}.`);
      const shapes = new Set(scroll.triggered.map(track => `${Math.round(track.durationMs / 50)}:${track.easing}:${track.properties.join('+')}`));
      if (scroll.triggered.length >= 4 && shapes.size === 1) {
        notes.push('Every scroll reveal is the same move at the same timing; sections do not differ in motion role.');
      }
    }
    if (scroll.scrubbed.length) notes.push(`Scroll: ${scroll.scrubbed.length} scroll-linked (scrubbed) group(s).`);
    if (scroll.pinned.length) notes.push(`Pinned or fixed content moved during scroll: ${scroll.pinned.slice(0, 3).join(', ')}.`);
    if (!scroll.triggered.length && !scroll.scrubbed.length && !scroll.pinned.length) notes.push('Scroll-through produced no element motion.');
    if (scroll.virtualScroll) notes.push(`A transform-driven scroller moved ${scrollingElements} element(s) while the document scroll position stayed put; scroll measurements are approximate.`);
  }
  if (timeline.layoutJumps.length) {
    const largest = [...timeline.layoutJumps].sort((a, b) => b.shiftPx - a.shiftPx)[0]!;
    notes.push(`${timeline.layoutJumps.length} visible layout jump event(s) without a tween; largest ${largest.shiftPx}px at ${largest.atMs}ms (${largest.label}).`);
  }
  if (timeline.reducedMotion?.checked) {
    if (timeline.reducedMotion.loadTracks > 0 && load.tracks.length > 0) {
      notes.push(`With prefers-reduced-motion, ${timeline.reducedMotion.loadTracks} load motion group(s) still play.`);
    }
    if (timeline.reducedMotion.hiddenContent > 0) {
      notes.push(`With prefers-reduced-motion, ${timeline.reducedMotion.hiddenContent} first-viewport content element(s) remain invisible after settling.`);
    }
  }
  if (timeline.libraries.length) notes.push(`Detected: ${timeline.libraries.join(', ')}.`);
  return notes;
}

type Frame = Readonly<{ label: string; png: Buffer; atMs?: number }>;

// Page-side sources are plain JavaScript strings run through browserExpression, like every other
// render/ref evaluation, so no host closure or compiled helper is ever shipped into the page.
const READ_CAPTURE = `() => {
  const state = window.__omdMotion;
  if (!state) return { scroll: [], series: [], firstPaintMs: null };
  return {
    scroll: state.scroll, firstPaintMs: state.fcp ?? null,
    series: state.meta.map((meta, id) => ({ id, label: meta.label, selector: meta.selector, samples: state.series[id] }))
      .filter(series => series.samples.length > 1),
  };
}`;
const NOW = '() => Math.round(performance.now() - (window.__omdMotion ? window.__omdMotion.t0 : 0))';
const LAST_CHANGE = `() => {
  const state = window.__omdMotion;
  let last = 0;
  for (const rows of state ? state.series : []) { const row = rows[rows.length - 1]; if (row && row[0] > last) last = row[0]; }
  return last;
}`;
const READY = "() => document.readyState === 'complete'";
const PAGE_HEIGHT = '() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)';
const SCROLL_POSITION = '() => Math.round(window.scrollY)';
const HIDDEN_FIRST_VIEWPORT = `() => {
  let hidden = 0;
  for (const el of document.body ? document.body.querySelectorAll('h1,h2,h3,p,a,button,img,video') : []) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight || rect.width * rect.height < 64) continue;
    let opacity = 1;
    for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    if (opacity < 0.05) hidden++;
  }
  return hidden;
}`;
const CANVAS_BOXES = `() => [...document.querySelectorAll('canvas')].flatMap(canvas => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, rect.left), y = Math.max(0, rect.top);
  const width = Math.min(innerWidth, rect.right) - x, height = Math.min(innerHeight, rect.bottom) - y;
  return width >= 48 && height >= 48 && getComputedStyle(canvas).visibility !== 'hidden'
    ? [{ x: Math.round(x), y: Math.round(y), width: Math.floor(width), height: Math.floor(height) }] : [];
})`;
const inPage = <T>(page: Page, source: string): Promise<T> => page.evaluate(browserExpression(source)) as Promise<T>;

const readCapture = (page: Page) =>
  inPage<Pick<RawMotionCapture, 'scroll' | 'series' | 'firstPaintMs'>>(page, READ_CAPTURE);
const now = (page: Page) => inPage<number>(page, NOW);
const lastChange = (page: Page) => inPage<number>(page, LAST_CHANGE);

/** Wait until sampled content has been still for settleMs, bounded by maxMs, collecting frames. */
async function settle(page: Page, maxMs: number, settleMs: number, frames: Frame[] | null, frameEveryMs: number) {
  const begin = Date.now();
  let lastFrame = -Infinity;
  while (Date.now() - begin < maxMs) {
    if (frames && Date.now() - lastFrame >= frameEveryMs && frames.length < 10) {
      lastFrame = Date.now();
      const at = await now(page);
      frames.push({ label: `t=${at}ms`, atMs: at, png: await page.screenshot({ fullPage: false }) });
    }
    const [current, changedAt] = await Promise.all([now(page), lastChange(page)]);
    const ready = await inPage<boolean>(page, READY);
    if (ready && current > 1200 && current - changedAt >= settleMs) return;
    await page.waitForTimeout(60);
  }
}

type Box = Readonly<{ x: number; y: number; width: number; height: number }>;
const CANVAS_FRAMES = 4;
const CANVAS_FRAME_MS = 400;

function canvasDigest(png: Buffer, boxes: readonly Box[]) {
  const image = decodePng(png), hash = createHash('sha256');
  for (const box of boxes) for (let y = box.y; y < Math.min(image.height, box.y + box.height); y++) {
    const start = (y * image.width + box.x) * image.channels;
    hash.update(image.pixels.subarray(start, start + Math.min(box.width, image.width - box.x) * image.channels));
  }
  return hash.digest('hex');
}

/**
 * Content settles while a canvas or WebGL scene keeps playing, so the load frames stop before its motion shows.
 * Frames of the page at rest are kept only when the pixels inside a visible canvas change between them.
 */
async function canvasFrames(page: Page): Promise<Frame[]> {
  const boxes = await inPage<Box[]>(page, CANVAS_BOXES);
  if (boxes.length === 0) return [];
  const frames: Frame[] = [];
  for (let index = 0; index < CANVAS_FRAMES; index++) {
    if (index > 0) await page.waitForTimeout(CANVAS_FRAME_MS);
    frames.push({ label: `canvas t=${await now(page)}ms`, png: await page.screenshot({ fullPage: false }) });
  }
  return new Set(frames.map(frame => canvasDigest(frame.png, boxes))).size > 1 ? frames : [];
}

async function scrollThrough(page: Page, viewport: Viewport, frames: Frame[]) {
  const windows: [number, number][] = [];
  const height = await inPage<number>(page, PAGE_HEIGHT);
  const travel = Math.max(0, height - viewport.height);
  const steps = Math.min(14, Math.max(1, Math.ceil(travel / (viewport.height * 0.6))));
  const stepPx = travel / steps;
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (let step = 0; step < steps; step++) {
    const start = await now(page);
    // Real wheel input in small increments, so smooth scrollers and scroll triggers respond as for a person.
    for (let moved = 0; moved < stepPx; moved += 120) {
      await page.mouse.wheel(0, Math.min(120, stepPx - moved));
      await page.waitForTimeout(24);
    }
    windows.push([start, await now(page)]);
    await page.waitForTimeout(650);
    const position = await inPage<number>(page, SCROLL_POSITION);
    if (frames.length < 24 && (step % Math.max(1, Math.ceil(steps / 7)) === 0 || step === steps - 1)) {
      frames.push({ label: `scroll ${position}px`, png: await page.screenshot({ fullPage: false }) });
    }
  }
  return windows;
}

async function reducedMotionPass(browser: Browser, url: string, viewport: Viewport) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.addInitScript({ content: MOTION_SAMPLER_SOURCE });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await settle(page, 6000, 700, null, 0);
    const raw = await readCapture(page);
    const hiddenContent = await inPage<number>(page, HIDDEN_FIRST_VIEWPORT);
    const analyzed = analyzeMotion({ viewport, scrollStartMs: null, scrollWindows: [], libraries: [],
      cssAnimations: { keyframes: 0, scrollTimelines: 0 }, ...raw }, url);
    return { loadTracks: analyzed.load.tracks.length, hiddenContent };
  } finally { await context.close(); }
}

/** Drive a page through load and a scroll-through and return the raw capture plus frames. */
export async function observeMotion(
  target: string,
  opts: Readonly<{ viewport: Viewport; scroll?: boolean; reduced?: boolean }>,
): Promise<{ timeline: MotionTimeline; frames: Frame[] }> {
  const { chromium } = await import('playwright');
  const resolved = await resolveRenderTarget(target);
  const browser = await chromium.launch({ headless: true, timeout: 30_000 });
  try {
    const context = await browser.newContext({ viewport: opts.viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript({ content: MOTION_SAMPLER_SOURCE });
    await page.goto(resolved.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const frames: Frame[] = [];
    await settle(page, 7000, 900, frames, 220);
    const canvas = await canvasFrames(page);
    frames.push(...canvas);
    let scrollStartMs: number | null = null;
    let scrollWindows: [number, number][] = [];
    if (opts.scroll !== false) {
      scrollStartMs = await now(page);
      scrollWindows = await scrollThrough(page, opts.viewport, frames);
    }
    const probe = await inPage<{ libraries: string[]; keyframes: number; scrollTimelines: number }>(page, LIBRARY_PROBE);
    const raw: RawMotionCapture = {
      viewport: opts.viewport, scrollStartMs, scrollWindows, libraries: probe.libraries,
      cssAnimations: { keyframes: probe.keyframes, scrollTimelines: probe.scrollTimelines },
      ...(await readCapture(page)),
    };
    await context.close();
    const reduced = opts.reduced === false ? null : await reducedMotionPass(browser, resolved.url, opts.viewport);
    const analyzed = analyzeMotion(raw, target, reduced);
    const timeline = canvas.length === 0 ? analyzed : { ...analyzed, notes: [...analyzed.notes,
      `A visible canvas kept changing after content settled; its motion is shown in the ${canvas.length} canvas frames, not in the sampled tracks.`] };
    // Keep load frames up to the first one after motion settled; later stills repeat it.
    const loadFrames = frames.filter(frame => frame.atMs !== undefined);
    const firstSettled = loadFrames.findIndex(frame => frame.atMs! > timeline.load.settledMs);
    const kept = firstSettled < 0 ? loadFrames : loadFrames.slice(0, firstSettled + 1);
    return { timeline, frames: [...kept, ...frames.filter(frame => frame.atMs === undefined)] };
  } finally {
    await browser.close();
    await resolved.close();
  }
}

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);

/** One page a reviewer can read at a glance: frames in order, then the load Gantt and scroll table. */
export function contactSheetHtml(timeline: MotionTimeline, frames: readonly Frame[]): string {
  const tracks = timeline.load.tracks.slice(0, 28);
  const span = Math.max(600, timeline.load.settledMs + 100);
  const rowHeight = 18, chartWidth = 1100, labelWidth = 330;
  const x = (ms: number) => labelWidth + (ms / span) * (chartWidth - labelWidth - 240);
  const ticks = Array.from({ length: Math.floor(span / 250) + 1 }, (_, index) => index * 250);
  const bars = tracks.map((track, index) => {
    const y = 24 + index * rowHeight;
    const colour = track.properties.includes('translate') ? '#d4572a' : track.properties.includes('scale') ? '#7a5af5' : '#2a8bd4';
    return `<text x="0" y="${y + 12}" class="l">${escapeHtml(track.label.slice(0, 44))}${track.members > 1 ? ` ×${track.members}` : ''}</text>`
      + `<rect x="${x(track.startMs)}" y="${y + 2}" width="${Math.max(2, x(track.endMs) - x(track.startMs))}" height="12" fill="${colour}" rx="2"/>`
      + `<text x="${x(track.endMs) + 6}" y="${y + 12}" class="m">${track.durationMs}ms ${track.easing} ${track.properties.join('+')}</text>`;
  }).join('');
  const grid = ticks.map(ms => `<line x1="${x(ms)}" x2="${x(ms)}" y1="16" y2="${24 + tracks.length * rowHeight}" class="g"/><text x="${x(ms) - 8}" y="12" class="m">${ms}</text>`).join('');
  const scrollRows = [...timeline.scroll.triggered, ...timeline.scroll.scrubbed].slice(0, 16).map(track =>
    `<tr><td>${track.mode}</td><td>${escapeHtml(track.label.slice(0, 50))}${track.members > 1 ? ` ×${track.members}` : ''}</td><td>${track.scrollY}px</td><td>${track.viewportEntry ?? '—'}</td><td>${track.durationMs}ms</td><td>${track.easing}</td><td>${track.properties.join('+')}</td></tr>`).join('');
  return [
    '<!doctype html><meta charset="utf-8"><style>',
    'body{margin:0;padding:20px;background:#fff;color:#111;font:12px/1.45 ui-sans-serif,system-ui;width:1160px}',
    'h1{font-size:15px;margin:0 0 6px}h2{font-size:13px;margin:18px 0 6px}ul{margin:0;padding-left:18px}',
    '.f{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.f.c{grid-template-columns:repeat(2,1fr)}.f figure{margin:0}.f img{width:100%;border:1px solid #ccc;display:block}',
    'figcaption{font-size:11px;color:#555;padding:2px 0}.l{font-size:11px;fill:#222}.m{font-size:10px;fill:#666}.g{stroke:#eee}',
    'table{border-collapse:collapse;font-size:11px}td{border-bottom:1px solid #eee;padding:3px 8px 3px 0}',
    '</style>',
    `<h1>Motion timeline — ${escapeHtml(basename(timeline.target))} @ ${timeline.viewport.width}×${timeline.viewport.height}</h1>`,
    `<ul>${timeline.notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`,
    '<h2>Frames (load, then scroll-through)</h2><div class="f">',
    ...frames.filter(frame => !frame.label.startsWith('canvas ')).map(frame => `<figure><img src="data:image/png;base64,${frame.png.toString('base64')}"><figcaption>${escapeHtml(frame.label)}</figcaption></figure>`),
    '</div>',
    ...(frames.some(frame => frame.label.startsWith('canvas ')) ? ['<h2>Canvas at rest (pixels change between frames)</h2><div class="f c">',
      ...frames.filter(frame => frame.label.startsWith('canvas ')).map(frame => `<figure><img src="data:image/png;base64,${frame.png.toString('base64')}"><figcaption>${escapeHtml(frame.label)}</figcaption></figure>`),
      '</div>'] : []),
    tracks.length ? `<h2>Load choreography (ms)</h2><svg width="${chartWidth}" height="${32 + tracks.length * rowHeight}">${grid}${bars}</svg>` : '',
    scrollRows ? `<h2>Scroll motion</h2><table><tr><td>mode</td><td>element</td><td>scrollY</td><td>entry (vh)</td><td>duration</td><td>easing</td><td>properties</td></tr>${scrollRows}</table>` : '',
  ].join('\n');
}

/** Capture, analyze and write `timeline.json`, `contact-sheet.png` and the raw frames under outDir. */
export async function captureMotionTimeline(
  target: string,
  opts: Readonly<{ viewport: Viewport; outDir: string; adapter: ProjectWriteAdapter; scroll?: boolean; reduced?: boolean }>,
): Promise<{ timeline: MotionTimeline; files: string[] }> {
  const { timeline, frames } = await observeMotion(target, opts);
  const outDir = opts.outDir.replace(/\/+$/, '');
  opts.adapter.mkdir(join(outDir, 'frames'));
  const files: string[] = [];
  frames.forEach((frame, index) => {
    files.push(opts.adapter.write(join(outDir, 'frames', `${String(index).padStart(2, '0')}.png`), frame.png));
  });
  files.push(opts.adapter.write(join(outDir, 'timeline.json'), `${JSON.stringify(timeline, null, 2)}\n`));
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await page.setContent(contactSheetHtml(timeline, frames), { waitUntil: 'load' });
    files.push(opts.adapter.write(join(outDir, 'contact-sheet.png'), await page.screenshot({ fullPage: true })));
  } finally { await browser.close(); }
  return { timeline, files };
}
