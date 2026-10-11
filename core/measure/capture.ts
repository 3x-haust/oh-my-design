import type { Page } from 'playwright';
import { browserEvaluationExpression } from '../render/index.ts';
import { extractInPage } from '../ir/dom.ts';
import { extractMeasurementInPage } from './dom.ts';
import { selectors, type Contracts } from './contracts.ts';
import { canonicalBytes, digest, sha256 } from './identity.ts';
import { decodePng } from '../motion/energy.ts';
import type { MeasuredIr, MeasurementDom, ViewSpec } from './types.ts';
import type { RetainedCapture } from './engine.ts';
const nativeCaptures = new WeakMap<RetainedCapture, string>();
const captureDigest = (c: RetainedCapture) => digest({ view: c.view, raw: c.raw, binding: c.binding, pngSha256: sha256(c.png) });
export function assertNativeCapture(capture: RetainedCapture): void { if (nativeCaptures.get(capture) !== captureDigest(capture)) throw new Error('VISUAL_MEASUREMENT: imported or modified captures cannot publish native evidence'); }
export async function measurementReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([Promise.all([
        document.fonts.ready,
        ...Array.from(document.images).map(async image => { if (!image.complete) await new Promise<void>((resolve, reject) => { image.addEventListener('load', () => resolve(), { once: true }); image.addEventListener('error', () => reject(new Error('image failed')), { once: true }); }); if (!image.naturalWidth) throw new Error('image failed'); await image.decode(); }),
        ...document.getAnimations().filter(a => a.playState !== 'finished').map(a => { const timing = a.effect?.getComputedTiming(); if (timing?.iterations === Infinity) throw new Error('continuous motion requires a reproducible frame contract'); return a.finished; }),
      ]), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('render readiness deadline')), 5000); })]);
    } finally { clearTimeout(timer); }
  });
}
/** Same live state and same PNG buffer are returned to trusted browser receipt callers. */
export async function captureMeasuredView(page: Page, view: ViewSpec, contracts: Contracts, context: { compositionReceipt?: { path: string; sha256: string }; externalProvenance?: { requestedUrl: string; resourceUrls: string[] } } = {}): Promise<RetainedCapture> {
  if (view.state === 'initial') await page.evaluate(() => window.scrollTo(0, 0));
  await measurementReady(page);
  const detail = { measurementDetails: true, ...(contracts.composition?.frequentAction && context.compositionReceipt ? { frequentAction: { selector: contracts.composition.frequentAction, contract: { ...context.compositionReceipt, field: 'Measurement contract.frequentAction' } } } : {}) };
  const rawExpression = browserEvaluationExpression(extractInPage.toString(), `4000, null, ${JSON.stringify(detail)}`);
  const argument = JSON.stringify({ selectors: selectors(contracts), tokens: [...new Set(contracts.composition?.colors.flatMap(c => c.token ? [c.token] : []) ?? [])], maxNodes: 4000, maxGraphemes: 100000 });
  const before = await page.evaluate(browserEvaluationExpression(extractMeasurementInPage.toString(), argument)) as MeasurementDom;
  const raw = await page.evaluate(rawExpression) as MeasuredIr;
  const png = await page.screenshot({ fullPage: false, animations: 'allow', caret: 'initial', timeout: 5000 });
  const afterPng = await page.screenshot({ fullPage: false, animations: 'allow', caret: 'initial', timeout: 5000 });
  const afterRaw = await page.evaluate(rawExpression) as MeasuredIr;
  const rawStable = digest(raw) === digest(afterRaw);
  const after = await page.evaluate(browserEvaluationExpression(extractMeasurementInPage.toString(), argument)) as MeasurementDom;
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
