import { forbiddenPublicHostname } from '../public-network.ts';
import { sha256 } from '../board-artifacts.ts';
import { browseFail, type BrowseControl, type Consent, type Start } from './contract.ts';

const TRANSACTION = /(?:check[\s_-]*out|cart\b|purchase|buy\b|payment|pay\b|trial|subscribe|unsubscribe|delete|remove|destroy|logout|log[\s_-]*out|sign[\s_-]*out|결제|구매|삭제|탈퇴|구독|무료\s*체험)/iu;
const AUTH = /(?:log[\s_-]*in|sign[\s_-]*(?:in|up)|register|oauth|authorize|password|로그인|가입)/iu;
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
  duckduckgo: 'https://duckduckgo.com/?q={query}', daum: 'https://search.daum.net/search?q={query}',
  pinterest: 'https://www.pinterest.com/search/pins/?q={query}', dribbble: 'https://dribbble.com/search/{query}', siteinspire: 'https://www.siteinspire.com/websites?search={query}' };
export function searchUrl(provider: string, query: string, parameter: string): string {
  const source = SEARCH[provider] ?? provider;
  const occurrences = source.split('{query}').length - 1;
  if (occurrences > 1) browseFail('BROWSE_SEARCH', 'exactly one query substitution allowed', 2);
  if (occurrences === 1) return browseUrl(source.replace('{query}', encodeURIComponent(query)));
  const url = new URL(browseUrl(source)); url.searchParams.set(parameter, query); return url.href;
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
  browseFail('BROWSE_CONTROL', 'only public links, summaries, tabs and explicit disclosure controls are read-only');
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
