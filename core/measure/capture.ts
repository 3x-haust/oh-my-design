import type { Page } from 'playwright';
import { browserEvaluationExpression } from '../render/index.ts';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { extractInPage } from '../ir/dom.ts';
import { extractMeasurementInPage } from './dom.ts';
import { attachFormAccessibility } from './accessibility.ts';
import { colorsForView, selectors, type Contracts } from './contracts.ts';
import { canonicalBytes, digest, sha256 } from './identity.ts';
import { decodePng } from '../motion/energy.ts';
import type { MeasuredIr, MeasurementDom, ViewSpec } from './types.ts';
import type { RetainedCapture } from './engine.ts';
const nativeCaptures = new WeakMap<RetainedCapture, string>();
const captureDigest = (c: RetainedCapture) => digest({ view: c.view, raw: c.raw, binding: c.binding, pngSha256: sha256(c.png) });
export function assertNativeCapture(capture: RetainedCapture): void { if (nativeCaptures.get(capture) !== captureDigest(capture)) throw new Error('VISUAL_MEASUREMENT: imported or modified captures cannot publish native evidence'); }
/**
 * Continuous motion (a turning orbit, a floating object, a marquee, a WebGL loop) never settles, so the
 * capture holds a reproducible frame instead: infinite animations pause at their start, and animation
 * frame callbacks are held rather than run. `releaseMeasurementFrame` resumes both after the capture,
 * so later scripted actions see the page behave normally.
 */
export async function measurementReady(page: Page): Promise<void> {
  // Wrapped so the named helper inside survives a loader that injects __name (the Pi runtime does).
  await page.evaluate(browserCallback(async () => {
    const held = window as unknown as { __omdHeldFrames?: FrameRequestCallback[]; __omdFrame?: typeof requestAnimationFrame; __omdPaused?: Animation[] };
    if (held.__omdFrame === undefined) {
      held.__omdFrame = window.requestAnimationFrame.bind(window);
      held.__omdHeldFrames = [];
      window.requestAnimationFrame = (callback: FrameRequestCallback) => { held.__omdHeldFrames!.push(callback); return 0; };
    }
    // Lazy images below the fold would wait for a scroll that never comes; load them now.
    for (const image of Array.from(document.images)) if (image.loading === 'lazy') image.loading = 'eager';
    held.__omdPaused = document.getAnimations().filter(a => a.playState !== 'finished' && a.effect?.getComputedTiming().iterations === Infinity);
    for (const animation of held.__omdPaused) { animation.pause(); animation.currentTime = 0; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([Promise.all([
        document.fonts.ready,
        // Name the broken image: a root-absolute src that the build or server does not provide is the usual cause.
        ...Array.from(document.images).map(async image => { const failed = () => new Error(`image failed: ${image.getAttribute('src') ?? image.currentSrc} (resolved ${image.currentSrc || 'nothing'})`); if (!image.complete) await new Promise<void>((resolve, reject) => { image.addEventListener('load', () => resolve(), { once: true }); image.addEventListener('error', () => reject(failed()), { once: true }); }); if (!image.naturalWidth) throw failed(); await image.decode(); }),
        // Scroll-driven animations follow scroll position and never finish on their own; their frame
        // at the current scroll is already determined, so only time-based animations are awaited.
        ...document.getAnimations().filter(a => a.playState === 'running' && a.timeline instanceof DocumentTimeline).map(a => a.finished),
      ]), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('render readiness deadline')), 5000); })]);
    } finally { clearTimeout(timer); }
    // One real frame lets a held loop's last paint reach the screen before the first capture.
    await new Promise<void>(resolve => held.__omdFrame!(() => resolve()));
  }));
}

export async function releaseMeasurementFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const held = window as unknown as { __omdHeldFrames?: FrameRequestCallback[]; __omdFrame?: typeof requestAnimationFrame; __omdPaused?: Animation[] };
    if (held.__omdFrame === undefined) return;
    window.requestAnimationFrame = held.__omdFrame;
    for (const callback of held.__omdHeldFrames ?? []) held.__omdFrame(callback);
    for (const animation of held.__omdPaused ?? []) animation.play();
    delete held.__omdFrame; delete held.__omdHeldFrames; delete held.__omdPaused;
  });
}
/** Same live state and same PNG buffer are returned to trusted browser receipt callers. */
export async function captureMeasuredView(page: Page, view: ViewSpec, contracts: Contracts, context: { compositionReceipt?: { path: string; sha256: string }; externalProvenance?: { requestedUrl: string; resourceUrls: string[] } } = {}): Promise<RetainedCapture> {
  if (view.state === 'initial') await page.evaluate(() => window.scrollTo(0, 0));
  const detail = { measurementDetails: true, ...(contracts.composition?.frequentAction && context.compositionReceipt ? { frequentAction: { selector: contracts.composition.frequentAction, contract: { ...context.compositionReceipt, field: 'Measurement contract.frequentAction' } } } : {}) };
  const rawExpression = browserEvaluationExpression(extractInPage.toString(), [4000, null, detail]);
  const argument = { selectors: selectors(contracts), tokens: [...new Set(contracts.composition?.colors.flatMap(c => c.token ? [c.token] : []) ?? [])], paintSelectors: colorsForView(contracts.composition, view.id).filter(c => c.property === 'border' || c.property === 'outline').map(c => c.selector), targetSelectors: contracts.composition?.regions.filter(r => r.minimumTargetPx !== undefined).map(r => r.selector) ?? [], maxNodes: 4000, maxGraphemes: 100000 };
  const measuredDom = async () => attachFormAccessibility(page,
    await page.evaluate(browserEvaluationExpression(extractMeasurementInPage.toString(), [argument])) as MeasurementDom);
  const shoot = async () => {
    await measurementReady(page);
    const before = await measuredDom();
    const raw = await page.evaluate(rawExpression) as MeasuredIr;
    const png = await page.screenshot({ fullPage: false, animations: 'allow', caret: 'initial', timeout: 5000 });
    const afterPng = await page.screenshot({ fullPage: false, animations: 'allow', caret: 'initial', timeout: 5000 });
    const afterRaw = await page.evaluate(rawExpression) as MeasuredIr;
    const after = await measuredDom();
    await releaseMeasurementFrame(page);
    return { before, raw, png, afterPng, afterRaw, after };
  };
  // A late image decode or font swap can land between the two shots once; a page that keeps changing
  // (a ticker, a counter, an endless loop) still differs on every attempt and stays unstable.
  const settled = (shot: Awaited<ReturnType<typeof shoot>>) => digest(shot.raw) === digest(shot.afterRaw)
    && digest(shot.before) === digest(shot.after) && sha256(decodePng(shot.png).pixels) === sha256(decodePng(shot.afterPng).pixels);
  let shot = await shoot();
  for (let attempt = 0; attempt < 2 && !settled(shot); attempt++) {
    await page.waitForTimeout(600);
    shot = await shoot();
  }
  const { before, raw, png, afterPng, afterRaw, after } = shot;
  const rawStable = digest(raw) === digest(afterRaw);
  const url = new URL(page.url());
  if (`${url.pathname}${url.search}${url.hash}` !== view.route) throw new Error('VISUAL_MEASUREMENT: state route changed during capture');
  if (before.viewport.visualViewportScale !== 1 || view.browserZoom === 1 && (before.viewport.innerWidth !== view.viewport.width || before.viewport.innerHeight !== view.viewport.height)) throw new Error('VISUAL_MEASUREMENT: viewport does not match requested layout geometry');
  if (view.browserZoom === 2 && (Math.abs(before.viewport.innerWidth * 2 - view.viewport.width) > 2 || Math.abs(before.viewport.innerHeight * 2 - view.viewport.height) > 2 || before.viewport.devicePixelRatio < 2)) throw new Error('VISUAL_MEASUREMENT: ZOOM_UNSUPPORTED: requested zoom did not reflow layout geometry');
  raw.meta = { ...raw.meta, url: view.route, ...(context.externalProvenance ? { externalProvenance: { ...context.externalProvenance, finalUrl: page.url() } } : {}) }; raw.measurement = before;
  const irBytes = canonicalBytes(raw), image = decodePng(png), afterImage = decodePng(afterPng);
  const beforeProjectionSha256 = digest(before), afterProjectionSha256 = digest(after), beforePixelSha256 = sha256(image.pixels), afterPixelSha256 = sha256(afterImage.pixels);
  const result: RetainedCapture = { view, raw, png, binding: { viewId: view.id, capture: { path: `.omd/visual-measurement-captures/sha256-${sha256(png)}.png`, sha256: sha256(png) }, ir: { path: `.omd/visual-measurement-ir/sha256-${sha256(irBytes)}.json`, sha256: sha256(irBytes) }, image: { width: image.width, height: image.height }, observedViewport: before.viewport, fonts: before.fonts, stability: { status: rawStable && beforeProjectionSha256 === afterProjectionSha256 && beforePixelSha256 === afterPixelSha256 ? 'stable' : 'unstable', beforeProjectionSha256, afterProjectionSha256, beforePixelSha256, afterPixelSha256 } } };
  nativeCaptures.set(result, captureDigest(result)); return result;
}
