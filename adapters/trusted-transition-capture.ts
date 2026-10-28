import type { JSHandle, Page } from 'playwright';
type Marker = {
  document: Document;
  animations: WeakSet<Animation>;
  selectors: readonly string[];
  sample?: { animation: Animation; effect: AnimationEffect; target: Element;
    timeline: AnimationTimeline; startTime: number; playbackRate: number };
};
const markers = new WeakMap<Page, JSHandle<Marker>>();

type UnavailableReason = 'document-changed' | 'no-action-correlated-animation'
  | 'no-finite-animation' | 'multiple-independent-animations' | 'unsupported-css-animation'
  | 'unsupported-timeline' | 'unsupported-view-transition' | 'animation-cancelled-or-retargeted'
  | 'observation-unavailable';
export type ObservedTransitionResult =
  | Readonly<{ kind: 'sample'; png: Buffer; animationCount: 1 }>
  | Readonly<{ kind: 'unavailable'; reason: UnavailableReason }>;

export async function markPreActionAnimations(page: Page, selectors: readonly string[]): Promise<void> {
  await clearPreActionAnimations(page);
  const marker = await page.evaluateHandle(selectors => ({
    document, animations: new WeakSet(document.getAnimations()), selectors,
  }), [...selectors]);
  markers.set(page, marker);
}
export async function clearPreActionAnimations(page: Page): Promise<void> {
  const marker = markers.get(page);
  markers.delete(page);
  await marker?.dispose();
}
/** Passive whole-viewport observation. Never pauses, seeks or replays product animations. */
export async function captureObservedTransition(page: Page): Promise<ObservedTransitionResult> {
  const marker = markers.get(page);
  if (!marker) return { kind: 'unavailable', reason: 'document-changed' };
  const prepared = await marker.evaluate(async marker => {
    if (!marker || marker.document !== document) return { reason: 'document-changed' as const };
    const selected = marker.selectors.flatMap(selector => [...document.querySelectorAll(selector)]);
    const related = document.getAnimations().filter(animation => {
      const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
      return !marker.animations.has(animation) && target instanceof Element
        && selected.some(element => element === target || element.contains(target) || target.contains(element));
    });
    if (!related.length) return { reason: 'no-action-correlated-animation' as const };
    if (related.some(a => typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation))
      return { reason: 'unsupported-css-animation' as const };
    if (related.some(a => a.effect instanceof KeyframeEffect && a.effect.pseudoElement !== null))
      return { reason: 'unsupported-view-transition' as const };
    if (related.some(a => a.timeline !== document.timeline || typeof a.currentTime !== 'number'))
      return { reason: 'unsupported-timeline' as const };
    if (related.length !== 1) return { reason: 'multiple-independent-animations' as const };
    const animation = related[0]!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const ready = await Promise.race([
        animation.ready.then(() => true, () => false),
        new Promise<false>(resolve => {
          timer = setTimeout(() => resolve(false), 5_000);
        }),
      ]);
      if (!ready) return { reason: 'animation-cancelled-or-retargeted' as const };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    const effect = animation.effect, timeline = animation.timeline;
    const target = effect instanceof KeyframeEffect ? effect.target : null;
    const currentTime = animation.currentTime, startTime = animation.startTime;
    const endTime = effect?.getComputedTiming().endTime;
    if (!effect || !timeline || !(target instanceof Element) || !target.isConnected
      || typeof currentTime !== 'number' || typeof startTime !== 'number'
      || typeof endTime !== 'number' || !Number.isFinite(endTime) || endTime <= 0
      || currentTime < 0 || currentTime >= endTime || animation.playState !== 'running'
      || !Number.isFinite(animation.playbackRate) || animation.playbackRate === 0)
      return { reason: 'no-finite-animation' as const };
    marker.sample = { animation, effect, timeline, target, startTime, playbackRate: animation.playbackRate };
    return { ready: true as const };
  }).catch(() => ({ reason: 'observation-unavailable' as const }));
  if ('reason' in prepared) {
    await clearPreActionAnimations(page);
    return { kind: 'unavailable', reason: prepared.reason };
  }
  try {
    const png = await page.screenshot({ fullPage: false, animations: 'allow' });
    const unchanged = await marker.evaluate(marker => {
      const saved = marker.sample;
      if (!saved) return false;
      const a = saved.animation;
      const end = a.effect?.getComputedTiming().endTime;
      return document.getAnimations().includes(a) && a.effect === saved.effect
        && a.timeline === saved.timeline && a.startTime === saved.startTime
        && a.playbackRate === saved.playbackRate && a.playState === 'running'
        && saved.target.isConnected && a.effect instanceof KeyframeEffect
        && a.effect.target === saved.target && typeof a.currentTime === 'number'
        && typeof end === 'number' && a.currentTime >= 0 && a.currentTime < end;
    }).catch(() => null);
    if (unchanged === null) return { kind: 'unavailable', reason: 'observation-unavailable' };
    return unchanged ? { kind: 'sample', png, animationCount: 1 }
      : { kind: 'unavailable', reason: 'animation-cancelled-or-retargeted' };
  } finally {
    await clearPreActionAnimations(page);
  }
}
