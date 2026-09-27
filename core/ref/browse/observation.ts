import type { Page } from 'playwright';
import { extractInPage } from '../../ir/dom.ts';
import { normalize } from '../../ir/normalize.ts';
import { extractInvariants } from '../invariants.ts';
import { inspectRenderedState } from '../search-observation.ts';
import { captureBlueprint } from '../blueprint.ts';
import { toVisualVector } from '../../visual-vector.ts';
import { canonicalJson, sha256 } from './json.ts';
import type { DocumentObserver } from '../document-observation.ts';
import { cropBrowsePng } from './pixels.ts';
import { renderWholeBrowseImage } from './whole-image.ts';
import type { BrowseBrowser } from './browser.ts';
import { browseUrl } from './safety.ts';
import { browseFail, type Box, type BrowseObservation, type PublishedAsset, type Receipt } from './contract.ts';
import type { RawIr } from '../../types.ts';

export function asset(sessionId: string, directory: string, bytes: Buffer, extension: string): PublishedAsset {
  const sha = sha256(bytes); return { receipt: { path: `.omd/discovery/browse/${sessionId}/${directory}/${sha}.${extension}`, sha256: sha }, base64: bytes.toString('base64') };
}
/** Runs in the page, without reading field values or hidden DOM text. */
export function visibleSnapshot() {
  const viewport = { width: innerWidth, height: innerHeight };
  const visible = (node: Element) => {
    const box = node.getBoundingClientRect(), style = getComputedStyle(node);
    const x = Math.max(0, box.x), y = Math.max(0, box.y), right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom);
    if (right <= x || bottom <= y || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < .1
      || !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const hit = document.elementFromPoint((x + right) / 2, (y + bottom) / 2);
    return hit !== null && (node.contains(hit) || hit.contains(node));
  };
  const selector = (node: Element): string => {
    if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) return `#${CSS.escape(node.id)}`;
    const parts: string[] = []; let cursor: Element | null = node;
    while (cursor && cursor !== document.documentElement) {
      const siblings: Element[] = cursor.parentElement ? Array.from(cursor.parentElement.children).filter(item => item.tagName === cursor!.tagName) : [];
      parts.unshift(`${cursor.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(cursor) + 1})`); cursor = cursor.parentElement;
    }
    return `html > ${parts.join(' > ')}`;
  };
  const controls = Array.from(document.querySelectorAll('a[href],button,summary,[role="tab"],input[type="search"],[role="searchbox"]'))
    .filter(visible).slice(0, 200).map(node => {
      const box = node.getBoundingClientRect();
      return { selector: selector(node), tag: node.tagName, role: node.getAttribute('role'),
        label: ((node as HTMLElement).innerText?.trim() || node.getAttribute('aria-label') || '').slice(0, 200),
        href: node instanceof HTMLAnchorElement ? node.href : null, type: node instanceof HTMLButtonElement ? node.type : node.getAttribute('type'),
        expanded: node.getAttribute('aria-expanded'), controls: node.getAttribute('aria-controls'), download: node.hasAttribute('download'),
        box: { x: box.x, y: box.y, width: box.width, height: box.height } };
    });
  const text: string[] = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Node | null; let length = 0;
  while ((node = walker.nextNode()) && length < 24_000) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,input,textarea,[contenteditable],select') || !visible(parent)) continue;
    const value = node.textContent?.trim(); if (!value) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    if (!Array.from(range.getClientRects()).some(box => box.width > 0 && box.height > 0 && box.bottom > 0 && box.y < innerHeight && box.right > 0 && box.x < innerWidth)) continue;
    text.push(value); length += value.length;
  }
  const masks = Array.from(document.querySelectorAll('input[type="password"],input[autocomplete="one-time-code"],input[autocomplete^="cc-"]')).filter(visible).map(selector);
  const obstructions = Array.from(document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"],div,section,aside')).filter(node => {
    if (!visible(node)) return false;
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    const heading = node.getAttribute('aria-label') ?? node.querySelector('h1,h2,h3,[role="heading"]')?.textContent ?? '';
    return (style.position === 'fixed' || node.matches('dialog,[role="dialog"],[aria-modal="true"]'))
      && box.width * box.height > innerWidth * innerHeight * .35 && /cookie|consent|privacy choices|sign in|log in|checkout|payment/iu.test(heading);
  }).slice(0, 20).map(selector);
  const renderKey = Array.from(document.querySelectorAll('*')).slice(0, 2000).flatMap(node => {
    const box = node.getBoundingClientRect(), style = getComputedStyle(node);
    if (box.width <= 0 || box.height <= 0 || box.right <= 0 || box.bottom <= 0 || box.x >= innerWidth || box.y >= innerHeight
      || !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return [];
    return [[node.tagName, box.x, box.y, box.width, box.height, style.color, style.backgroundColor, style.backgroundImage,
      style.fontSize, style.fontFamily, style.fontWeight, style.lineHeight, style.opacity, style.transform, style.padding,
      style.margin, style.gap, style.borderRadius, style.boxShadow, style.clipPath, style.filter,
      node instanceof HTMLImageElement ? [node.currentSrc, node.complete, node.naturalWidth, node.naturalHeight] : null]];
  });
  return { title: document.title.slice(0, 500), text: text.join('\n').slice(0, 24_000), controls, masks, obstructions, viewport, renderKey: JSON.stringify(renderKey),
    dpr: devicePixelRatio, scroll: { x: scrollX, y: scrollY } };
}
export async function inspectVisible(page: Page) {
  const { renderKey, ...result } = await page.evaluate(visibleSnapshot);
  const rendered = await inspectRenderedState(page, 'discovery');
  // Reuse legacy visibility/contrast checks, but never freeze or recolour an interactive page.
  // Ambiguous backgrounds are excluded from claims rather than represented as observed text.
  const uncertain = new Set(rendered.uncertain.map(item => item.id));
  const uncertainLinks = new Set(rendered.uncertain.flatMap(item => item.href ? [item.href] : []));
  const readable = rendered.visibleText.filter(item => !uncertain.has(item.id));
  const linkClaims = rendered.anchors.filter(item => !item.chrome && !uncertainLinks.has(item.href)).flatMap(item => {
    try { return [{ url: browseUrl(item.href), text: item.text }]; } catch { return []; }
  }).slice(0, 2000);
  return { ...result, renderSha256: sha256(renderKey), text: readable.map(item => item.value).join('\n').slice(0, 24_000),
    taskText: readable.filter(item => item.taskClaim).map(item => item.value).join('\n').slice(0, 24_000), linkClaims,
    controls: result.controls.map(control => {
    if (control.href === null) return control;
    try { return { ...control, href: browseUrl(control.href) }; }
    catch { return { ...control, href: null }; }
  }) };
}
export async function captureBrowseObservation(page: Page, observer: DocumentObserver, sessionId: string,
  options: { selector?: string; wholeImageSelector?: string; media?: BrowseBrowser['media']; search: boolean; readySelector?: string | null; timeout: number }): Promise<{ observation: BrowseObservation; receipt: Receipt; assets: PublishedAsset[] }> {
  if (options.readySelector) await page.locator(options.readySelector).waitFor({ state: 'visible', timeout: options.timeout });
  await page.waitForFunction(() => document.fonts.status === 'loaded', undefined, { timeout: options.timeout });
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = browseUrl(page.url()), binding = await observer.current(), before = await inspectVisible(page);
    let crop: Box | null = null, mediaUrl: string | null = null, kind: BrowseObservation['kind'] = 'page';
    let invariants: BrowseObservation['invariants'] = null, blueprint: BrowseObservation['blueprint'] = null;
    if (options.selector) {
      const locator = page.locator(options.selector);
      if (await locator.count() !== 1 || !await locator.isVisible()) browseFail('BROWSE_CROP_TARGET', 'crop needs one visible element');
      const box = await locator.boundingBox();
      if (!box || box.x < 0 || box.y < 0 || box.x + box.width > before.viewport.width || box.y + box.height > before.viewport.height) browseFail('BROWSE_CROP_BOUNDS', 'record a scroll first; crop must fit entirely inside this viewport');
      const hit = await locator.evaluate(node => {
        const b = node.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return hit !== null && node.contains(hit);
      });
      if (!hit) browseFail('BROWSE_CROP_OBSCURED', 'overlay obscures crop; do not hide consent notices');
      crop = { x: Math.floor(box.x * before.dpr), y: Math.floor(box.y * before.dpr),
        width: Math.ceil((box.x + box.width) * before.dpr) - Math.floor(box.x * before.dpr),
        height: Math.ceil((box.y + box.height) * before.dpr) - Math.floor(box.y * before.dpr) };
      const image = await locator.evaluate(node => node instanceof HTMLImageElement ? { url: node.currentSrc, loaded: node.complete && node.naturalWidth > 0 } : null);
      if (image) { if (!image.loaded) browseFail('BROWSE_IMAGE_UNLOADED', 'image has not loaded'); kind = 'image'; try { mediaUrl = browseUrl(image.url); } catch { mediaUrl = null; } }
      else {
        kind = 'component';
        const raw = await page.evaluate(`(${extractInPage.toString()})(2000, ${JSON.stringify(options.selector)})`) as RawIr;
        invariants = extractInvariants(normalize(raw));
        invariants.measurementCoverage = { interactionProbe: 'not-measured', motionProbe: 'not-measured', energyCurve: 'not-measured' };
        blueprint = captureBlueprint(raw.nodes, options.selector);
      }
    }
    if (!options.selector && !options.wholeImageSelector && !options.search && before.masks.length === 0) {
      const raw = await page.evaluate(`(${extractInPage.toString()})(2000, 'body')`) as RawIr;
      const nodes = raw.nodes.filter(node => node.box && node.box.w > 0 && node.box.h > 0 && node.box.x < before.viewport.width
        && node.box.y < before.viewport.height && node.box.x + node.box.w > 0 && node.box.y + node.box.h > 0);
      const ids = new Set(nodes.map(node => node.id));
      const scoped = { ...raw, nodes: nodes.map(node => ({ ...node, children: node.children.filter(id => ids.has(id)) })) };
      invariants = extractInvariants(normalize(scoped));
      invariants.measurementCoverage = { interactionProbe: 'not-measured', motionProbe: 'not-measured', energyCurve: 'not-measured' };
      blueprint = captureBlueprint(scoped.nodes, 'body');
    }
    let wholeImage: BrowseObservation['wholeImage'] = null, originalPng: Buffer | null = null;
    if (options.wholeImageSelector) {
      const image = page.locator(options.wholeImageSelector);
      if (await image.count() !== 1 || !await image.isVisible()) browseFail('BROWSE_WHOLE_IMAGE', 'choose one visible loaded item image');
      const info = await image.evaluate(node => {
        if (!(node instanceof HTMLImageElement) || !node.complete || !node.naturalWidth) return null;
        const b = node.getBoundingClientRect(), x = Math.max(0, b.x), y = Math.max(0, b.y);
        const hit = document.elementFromPoint((x + Math.min(innerWidth, b.right)) / 2, (y + Math.min(innerHeight, b.bottom)) / 2);
        return hit === node ? { url: node.currentSrc, width: node.naturalWidth, height: node.naturalHeight } : null;
      });
      if (!info) browseFail('BROWSE_WHOLE_IMAGE', 'item image is unloaded, offscreen or obscured');
      mediaUrl = browseUrl(info.url);
      const response = await options.media?.get(mediaUrl);
      if (!response) browseFail('BROWSE_WHOLE_IMAGE_RESPONSE', 'original loaded image response was not observed; revisit the item');
      originalPng = await renderWholeBrowseImage(response.bytes, response.mime, info);
      wholeImage = { width: info.width, height: info.height, originalSha256: sha256(response.bytes) }; kind = 'image';
    }
    const png = await page.screenshot({ timeout: options.timeout, mask: before.masks.map(selector => page.locator(selector)) });
    const after = await inspectVisible(page), afterBinding = await observer.current();
    if (page.url() !== url || binding.identity !== afterBinding.identity || canonicalJson(before) !== canonicalJson(after)) continue;
    const parent = asset(sessionId, 'assets', png, 'png'), assets = [parent];
    const screenshot = originalPng ? asset(sessionId, 'assets', originalPng, 'png') : crop ? asset(sessionId, 'assets', cropBrowsePng(png, crop), 'png') : parent;
    if (crop || originalPng) assets.push(screenshot);
    const challenge = /captcha|access denied|verify you are human|just a moment|sign in|log in/iu.test(before.title);
    const retainable = binding.httpStatus >= 200 && binding.httpStatus < 300 && !challenge && !before.masks.length && !before.obstructions.length && !options.search && (before.text.trim().length > 0 || wholeImage !== null);
    const observation: BrowseObservation = { schema: 'reference-browse-observation-v1', url, documentId: binding.identity, httpStatus: binding.httpStatus,
      ...before, screenshot: parent.receipt, crop, selector: options.wholeImageSelector ?? options.selector ?? null, mediaUrl, kind, invariants, blueprint,
      wholeImage, measurement: kind === 'image' ? 'image-only' : invariants ? 'scoped-dom' : 'not-measured',
      vector: invariants ? { ...toVisualVector({ invariants }), motionVoice: null, easingVoice: null, materialDensity: null, interactionCoverage: null, motionLoad: null, energyLoad: null } : null,
      retainable, limitation: retainable ? null : 'Search wrapper, obscuring consent, failed/challenged/authentication page, sensitive fields or empty visible content cannot be retained.' };
    const metadata = asset(sessionId, 'observations', Buffer.from(`${canonicalJson(observation)}\n`), 'json'); assets.push(metadata);
    return { observation, receipt: metadata.receipt, assets };
  }
  return browseFail('BROWSE_UNSTABLE_RENDER', 'two snapshots disagreed; no capture evidence was accepted');
}
