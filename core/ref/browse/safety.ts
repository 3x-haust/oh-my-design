import { forbiddenPublicHostname } from '../public-network.ts';
import { sha256 } from '../board-artifacts.ts';
import { browseFail, type BrowseControl, type Consent, type Start } from './contract.ts';

const TRANSACTION = /(?:check[\s_-]*out|cart\b|purchase|buy\b|payment|pay\b|trial|subscribe|unsubscribe|delete|remove|destroy|logout|log[\s_-]*out|sign[\s_-]*out|결제|구매|삭제|탈퇴|구독|무료\s*체험)/iu;
const AUTH = /(?:\b(?:log[\s_-]*in|sign[\s_-]*(?:in|up)|register|oauth|authorize|password)|로그인|가입)/iu;
const PRICE = /(?:pricing|plans|요금제)/iu;
const SECRET = /^(?:access_token|refresh_token|id_token|token|code|password|passwd|secret|session|sessionid|sid|otp|authorization)$/iu;
export function browseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { return browseFail('BROWSE_URL', 'public HTTPS URL required', 2); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || forbiddenPublicHostname(url.hostname)
    || [...url.searchParams.keys()].some(key => SECRET.test(key)) || /(?:access_token|id_token|password|code)=/iu.test(url.hash)) {
    return browseFail('BROWSE_URL', 'public HTTPS without credentials, secret parameters, private hosts or alternate ports required', 2);
  }
  return url.href;
}
export function cdpEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { return browseFail('BROWSE_CDP_URL', 'loopback Chrome debugging endpoint required', 2); }
  if (!['http:', 'ws:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname) || !url.port
    || url.username || url.password || url.search || url.hash
    || (url.protocol === 'http:' ? url.pathname !== '/' : !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(url.pathname))) {
    return browseFail('BROWSE_CDP_URL', 'use http://127.0.0.1:<port> or its exact browser websocket', 2);
  }
  return url.href;
}
const SEARCH: Record<string, string> = { google: 'https://www.google.com/search?q={query}', bing: 'https://www.bing.com/search?q={query}',
  duckduckgo: 'https://duckduckgo.com/?q={query}', daum: 'https://search.daum.net/search?q={query}', naver: 'https://search.naver.com/search.naver?query={query}',
  // Pinterest search needs a login; Naver image search lists public pins and their i.pinimg.com originals without one.
  pinterest: 'https://search.naver.com/search.naver?where=image&query=pinterest%20{query}', dribbble: 'https://dribbble.com/search/{query}', siteinspire: 'https://www.siteinspire.com/websites?search={query}',
  behance: 'https://www.behance.net/search/projects?search={query}', notefolio: 'https://notefolio.net/search?search={query}',
  // Public without login (checked 2026-10): graphics, components, app screens, sites and type in use.
  cosmos: 'https://www.cosmos.so/search/elements/{query}', componentgallery: 'https://component.gallery/components/{query}/',
  '21st': 'https://21st.dev/s/{query}', refero: 'https://refero.design/search?query={query}',
  landbook: 'https://land-book.com/?search={query}', awwwards: 'https://www.awwwards.com/websites/?text={query}',
  onepagelove: 'https://onepagelove.com/?s={query}', lapaninja: 'https://www.lapa.ninja/search/?q={query}',
  fontsinuse: 'https://fontsinuse.com/search?terms={query}', nook: 'https://nook.ai.kr/?q={query}',
  landinglove: 'https://www.landing.love/search/?q={query}',
  // Category browsers, not free-text search: inspora takes 3D|Product|Motion|Branding|Illustration|Web|Print,
  // 60fps a pattern slug such as 3d, bottom-sheet or onboarding.
  inspora: 'https://www.inspora.design/?category={query}', '60fps': 'https://60fps.design/shots/filter/{query}' };
export function searchUrl(provider: string, query: string, parameter: string): string {
  const source = SEARCH[provider] ?? provider;
  const occurrences = source.split('{query}').length - 1;
  if (occurrences > 1) browseFail('BROWSE_SEARCH', 'exactly one query substitution allowed', 2);
  if (occurrences === 1) return browseUrl(source.replace('{query}', encodeURIComponent(query)));
  const url = new URL(browseUrl(source)); url.searchParams.set(parameter, query); return url.href;
}
/**
 * A site's own silent bot check (AWS WAF token, Cloudflare challenge platform) proves the page runs
 * in a real browser by POSTing a token from the page's script. That is not a form submission, login
 * or transaction, so it may pass; every other non-GET request stays blocked.
 */
export function isBrowserIntegrityCheck(method: string, value: string, navigation: boolean): boolean {
  if (method !== 'POST' || navigation) return false;
  const url = new URL(value);
  if (url.protocol !== 'https:') return false;
  return url.hostname.endsWith('.token.awswaf.com')
    || url.hostname === 'challenges.cloudflare.com'
    || url.pathname.startsWith('/cdn-cgi/challenge-platform/');
}
export function authorizeBrowseDestination(value: string, start: Start): string {
  const url = browseUrl(value);
  const parsed = new URL(url), path = decodeURIComponent(parsed.pathname);
  const mutation = [...parsed.searchParams].some(([key, value]) => /^(?:action|operation|cmd|do)$/i.test(key) && TRANSACTION.test(value));
  if (mutation || TRANSACTION.test(path) || (!start.allowPricing && PRICE.test(path))
    || (AUTH.test(path) && !start.allowAuthOrigins.includes(new URL(url).origin))) browseFail('BROWSE_SENSITIVE_ACTION', 'transactional, authentication or pricing navigation excluded');
  return url;
}
export function authorizeBrowseControl(control: BrowseControl, start: Start): void {
  const label = `${control.label} ${control.href ? new URL(control.href).pathname : ''}`;
  if (TRANSACTION.test(label) || AUTH.test(label) || (!start.allowPricing && PRICE.test(label)) || control.download) browseFail('BROWSE_SENSITIVE_ACTION', 'purchase/trial/checkout/authentication/destructive controls are never automated');
  if (control.tag === 'A' && control.href) { authorizeBrowseDestination(control.href, start); return; }
  if (control.tag === 'SUMMARY' || (control.tag === 'BUTTON' && control.type === 'button'
    && (control.role === 'tab' || (control.controls !== null && control.expanded !== null)))) return;
  browseFail('BROWSE_CONTROL', 'only public links, summaries, tabs and explicit disclosure controls are read-only; to keep a gallery result that is not a link, use shot --selector <that item\'s img>; to clear a cookie notice, use cookie --text <its necessary-only button label>');
}
/** The model judges from the label that this is the necessary-only choice; only the label's safety is checked here. */
export function authorizeCookieChoice(control: BrowseControl): void {
  if (control.tag !== 'BUTTON' || control.href || control.download || TRANSACTION.test(control.label) || AUTH.test(control.label) || PRICE.test(control.label)) {
    browseFail('BROWSE_COOKIE_CHOICE', 'a cookie choice is a plain button whose label declines optional cookies');
  }
}
export type ReferenceStateControl = Readonly<{
  tag: string;
  type: string | null;
  label: string;
  href: string | null;
  download: boolean;
  formAction: string | null;
}>;
export function authorizeReferenceStateControl(control: ReferenceStateControl): void {
  const label = `${control.label} ${control.href ?? ''} ${control.formAction ?? ''}`;
  if (TRANSACTION.test(label) || AUTH.test(label) || PRICE.test(label)) {
    browseFail('BROWSE_SENSITIVE_ACTION', 'transactional, authentication, pricing or destructive state controls are never automated');
  }
  if (control.tag === 'A' || control.href !== null || control.download
    || control.formAction !== null
    || control.type === 'submit' || control.type === 'reset' || control.type === 'image') {
    browseFail('BROWSE_CONTROL', 'reference state actions cannot target navigation, download or form-submission controls');
  }
}
/** Authority is the authenticated route request, not a model-supplied flag. Exact opt-in command
 * clauses are deliberately required until hosts offer a typed browse-consent capability. */
export function authorizeBrowseConsent(start: Start, request: string, sourceContractSha256: string, now: number): Consent | null {
  if (start.mode === 'headless') return null;
  const grants = request.split(/[\r\n]/).filter(line => /^\s*omd ref browse start\b/u.test(line)).map(line => line.trim().split(/\s+/u));
  const grant = grants.find(tokens => tokens.includes('--user-opt-in') && tokens[tokens.indexOf('--mode') + 1] === start.mode);
  const grantedPair = (flag: string, value: string) => grant?.some((token, index) => token === flag && grant[index + 1] === value) === true;
  const grantedCdp = grant?.[grant.indexOf('--cdp-url') + 1];
  if (!start.userOptIn || !grant
    || (start.headed && !grant.includes('--headed')) || (start.allowPricing && !grant.includes('--allow-pricing'))
    || start.allowAuthOrigins.some(origin => !grantedPair('--allow-auth-origin', origin))
    || (start.mode === 'cdp' && (!grantedCdp || cdpEndpoint(grantedCdp) !== start.cdpUrl))) {
    browseFail('BROWSE_CONSENT_REQUIRED', 'current authenticated request must explicitly grant this exact opt-in start command; flag alone is not user consent', 2);
  }
  return { mode: start.mode, requestSha256: sha256(request), sourceContractSha256, cdpEndpointSha256: start.cdpUrl ? sha256(start.cdpUrl) : null,
    allowAuthOrigins: start.allowAuthOrigins, allowPricing: start.allowPricing, headed: start.headed,
    expiresAt: new Date(now + start.budgetMinutes * 60_000).toISOString() };
}
