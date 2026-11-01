import type { readPersistedRoute } from '../route/index.ts';
import { requestSuppliesFigmaTarget } from './consulted-references.ts';
import { latestPageComparison, type PageVerdict } from './taste-graphic-decision.ts';

type Route = ReturnType<typeof readPersistedRoute>;

export const newSurface = (route: Route): boolean => {
  const need = route.sourceContract.referenceDiscovery.taskNeed;
  return (need === 'new-product' || need === 'new-marketing') && !requestSuppliesFigmaTarget(route.request);
};

export const MOTION_GUIDANCE = 'A new landing moves in ways a visitor notices: an entry sequence and section reveals or scroll-tied movement '
  + 'that act out what each section explains: build the entry from omd pack motion/recipes/hero-intro-sequence.md and the scroll staging from '
  + 'omd pack motion/recipes/scroll-scene-timeline.md (scroll-reveal.md, sticky-scene-transition.md and stagger-orchestrator.md beside it; theory in '
  + 'omd pack theory/motion.md; watch real ones with omd ref browse search 60fps <pattern such as 3d or onboarding>), with everything shown at once under reduced motion.';

type ObservedMotion = Readonly<{ load: Readonly<{ tracks: readonly unknown[] }>; cssAnimations?: Readonly<{ scrollTimelines: number }>;
  scroll: Readonly<{ triggered: readonly unknown[]; scrubbed: readonly unknown[]; pinned: readonly unknown[] }> }>;

/**
 * Finished landings stage their content as the visitor scrolls: eight of nine measured with omd render --motion
 * (leviosa.ai.kr, kaleoyouth.com, wonand.com, rig.ai, coding.bio, linear.app, stripe.com, toss.im; not vercel.com)
 * showed seven or more scroll-triggered or scroll-linked moves. An entry fade alone reads as a still page.
 */
export const SCROLL_STAGED_MOVES = 3;

export function motionShortfall(timeline: ObservedMotion): string | null {
  const scroll = timeline.scroll.triggered.length + timeline.scroll.scrubbed.length;
  if (scroll >= SCROLL_STAGED_MOVES) return null;
  // Scroll-driven CSS whose whole move fits inside one wheel step is a jump, not motion a visitor watches.
  const shortTimelines = (timeline.cssAnimations?.scrollTimelines ?? 0) > 0 && timeline.scroll.scrubbed.length === 0
    ? ' The page declares CSS scroll timelines, but none of their moves lasted longer than one scroll step: a short animation-range on a '
      + 'small element finishes within a single wheel tick. Drive each move over a longer stretch of scroll (for example animation-range: '
      + 'entry 10% cover 45% on the section rather than on a 40px row) so the visitor sees it travel.' : '';
  return timeline.load.tracks.length + scroll + timeline.scroll.pinned.length === 0
    ? `the rendered page showed no load or scroll motion.${shortTimelines}`
    : `the rendered page moves ${scroll === 0 ? 'only on load' : `in ${scroll} place${scroll === 1 ? '' : 's'} on scroll`}; `
      + `finished landings stage what each section explains as the visitor scrolls (at least ${SCROLL_STAGED_MOVES} triggered or scroll-linked moves).${shortTimelines}`;
}

/** A new landing is expected to move; the first-render restore and the finish both read this. */
export const motionRequired = (route: Route): boolean =>
  newSurface(route) && route.sourceContract.referenceDiscovery.taskNeed === 'new-marketing';

/**
 * Terminal boundary: a new landing whose rendered page shows no load or scroll motion finishes only once the
 * blind page comparison already finds it indistinguishable from human-made work.
 */
export async function requireNoticeableMotion(root: string, route: Route, timeline: ObservedMotion, briefSha256: string,
  readLatest: (projectRoot: string, briefSha256: string) => Promise<PageVerdict | undefined> = latestPageComparison): Promise<void> {
  if (!motionRequired(route)) return;
  const shortfall = motionShortfall(timeline);
  if (shortfall === null) return;
  const latest = await readLatest(root, briefSha256);
  if (latest?.summary.verdict === 'not-distinguishable') return;
  const error = new Error(`MOTION_ABSENT: ${shortfall} ${MOTION_GUIDANCE}`);
  Object.defineProperty(error, 'code', { value: 'MOTION_ABSENT', enumerable: true });
  throw error;
}
