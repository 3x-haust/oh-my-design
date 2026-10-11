import type { AcquisitionPage } from './acquisition-engine.ts';
import { publicDiscoveryUrl } from './discovery-record.ts';
import { assessPageAccess, type ReferenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';
import { assertPublicNetworkUrl, type PublicHostLookup } from './public-network.ts';

export type UserBrowserObservation = Readonly<{
  url: string; title: string; body: string; visibleText: string; taskText: string;
  links: string[]; linkLabels: { url: string; text: string }[];
  viewport: { width: number; height: number }; identity: number;
  loginOccludes: boolean;
}>;
// Reviewed expression: no form values, cookies, storage, HTML serialization, or network inspection.
export const USER_BROWSER_OBSERVE = `(() => {
  const visible = element => {
    if (element.closest('form, [role="dialog"], [aria-modal="true"], input, textarea, select, [contenteditable="true"]')) return false;
    for (let owner = element; owner; owner = owner.parentElement) {
      const css = getComputedStyle(owner);
      if (css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) < .05
        || css.filter !== 'none' || css.mixBlendMode !== 'normal' || css.backgroundImage !== 'none'
        || css.getPropertyValue('mask-image') && css.getPropertyValue('mask-image') !== 'none') return false;
    }
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0
      && box.left < innerWidth && box.top < innerHeight;
  };
  const parts = []; const task = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node && parts.join(' ').length < 16384; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !visible(parent)) continue;
    const colour = getComputedStyle(parent).color;
    if (colour === 'transparent' || colour === 'rgba(0, 0, 0, 0)') continue;
    const value = (node.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!value) continue;
    parts.push(value);
    if (!parent.closest('a, header, nav, footer, [role="navigation"]')) task.push(value);
  }
  const anchors = Array.from(document.querySelectorAll('a[href]')).filter(visible).map(a =>
    ({url: a.href, text: (a.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 4096)}))
    .filter(a => a.text && !a.url.includes('#') && !a.url.includes('@'));
  const loginOccludes = Array.from(document.querySelectorAll('input[type="password"]')).some(input => {
    const box = input.getBoundingClientRect();
    const form = input.closest('form, [role="dialog"], [aria-modal="true"]');
    const centre = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return box.width > 0 && box.height > 0 && form && centre && form.contains(centre);
  });
  return {url: location.href, title: document.title, body: parts.join(' ').slice(0, 16384),
    visibleText: parts.join(' ').slice(0, 16384), taskText: task.join(' ').slice(0, 16384),
    links: anchors.map(a => a.url), linkLabels: anchors,
    viewport: {width: innerWidth, height: innerHeight}, identity: performance.timeOrigin,
    loginOccludes: Boolean(loginOccludes)};
})()`;

export const USER_BROWSER_IMAGES = `(() => {
  const unique = selector => { try { return document.querySelectorAll(selector).length === 1; } catch { return false; } };
  const selectorFor = image => {
    if (image.id) { const id = '#' + CSS.escape(image.id); if (unique(id)) return id; }
    for (const name of ['data-testid', 'data-test', 'data-cy', 'aria-label', 'alt']) {
      const value = image.getAttribute(name);
      if (!value) continue;
      const selector = 'img[' + name + '=' + JSON.stringify(value) + ']';
      if (unique(selector)) return selector;
    }
    const path = [];
    for (let el = image; el && el !== document.documentElement; el = el.parentElement) {
      const siblings = el.parentElement ? Array.from(el.parentElement.children).filter(item => item.localName === el.localName) : [];
      path.unshift(el.localName + ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')');
      const selector = 'html > ' + path.join(' > ');
      if (unique(selector)) return selector;
    }
    return 'html > ' + path.join(' > ');
  };
  return Array.from(document.querySelectorAll('img')).flatMap(image => {
    if (!image.complete || image.naturalWidth < 100 || image.naturalHeight < 100) return [];
    const box = image.getBoundingClientRect();
    if (box.width < 100 || box.height < 100) return [];
    for (let el = image; el; el = el.parentElement) {
      const css = getComputedStyle(el);
      if (css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) <= 0) return [];
    }
    return [{ selector: selectorFor(image), width: box.width, height: box.height,
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }];
  }).sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 8);
})()`;

export async function observeUserBrowserImages(page: AcquisitionPage): Promise<readonly {
  selector: string; width: number; height: number; naturalWidth: number; naturalHeight: number;
}[]> {
  const images = await page.evaluate<unknown>(USER_BROWSER_IMAGES);
  if (!Array.isArray(images) || images.length > 8 || images.some(item =>
    !item || typeof item.selector !== 'string' || ![item.width, item.height, item.naturalWidth, item.naturalHeight]
      .every((size: unknown) => typeof size === 'number' && Number.isFinite(size) && size >= 100)))
    throw new Error('OMD Browser image candidates are invalid');
  return images;
}

export async function observeUserBrowser(page: AcquisitionPage, lookup?: PublicHostLookup): Promise<UserBrowserObservation> {
  const state = await page.evaluate<UserBrowserObservation>(USER_BROWSER_OBSERVE);
  if (!state || typeof state.url !== 'string' || typeof state.title !== 'string'
    || typeof state.visibleText !== 'string' || typeof state.taskText !== 'string'
    || typeof state.identity !== 'number' || !Array.isArray(state.links) || !Array.isArray(state.linkLabels)
    || !Number.isInteger(state.viewport?.width) || !Number.isInteger(state.viewport?.height))
    throw new Error('OMD Browser observation is incompatible');
  const url = publicDiscoveryUrl(state.url);
  await assertPublicNetworkUrl(url, lookup);
  const links = [...new Set(state.links.flatMap(link => {
    try { return [publicDiscoveryUrl(link)]; } catch { return []; }
  }))].slice(0, 2000);
  const linkLabels = state.linkLabels.filter(label => links.includes(label.url) && label.text.trim()).filter((label, index, all) =>
    all.findIndex(candidate => candidate.url === label.url) === index).slice(0, 2000);
  return { ...state, url, links, linkLabels };
}

export async function clearUserBrowserChallenge(page: AcquisitionPage, lookup?: PublicHostLookup,
  signal?: AbortSignal, _allowSparse = false,
  judgmentFor?: (observation: UserBrowserObservation, stage: 'before' | 'after') => Promise<ReferenceJudgmentBinding | undefined>
): Promise<UserBrowserObservation & { access: ReferenceDecision }> {
  let state = await observeUserBrowser(page, lookup);
  const assess = async (stage: 'before' | 'after') => {
    const binding = await judgmentFor?.(state, stage);
    return assessPageAccess(state.url, binding);
  };
  let access = await assess('before');
  if (access.decision !== 'challenge' && access.decision !== 'login') return { ...state, access };
  const outcome = await page.requestHelp({ title: 'Complete browser sign-in or verification', prompt: 'Please complete the sign-in or verification in this browser window.',
    completionCriteria: 'The requested page is visible after verification.', timeoutMs: 120_000 });
  if (signal?.aborted) throw new Error('OMD Browser acquisition cancelled');
  if (!['completed', 'continued', 'navigated'].includes(outcome)) throw new Error(`OMD Browser handoff ${outcome}`);
  state = await observeUserBrowser(page, lookup);
  access = await assess('after'); // Pre-handoff judgment can never clear a changed page.
  return { ...state, access };
}
