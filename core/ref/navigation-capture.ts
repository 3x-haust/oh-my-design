import { browserCallback } from './browser-evaluation.ts';
import { assessPageAccess, type ReferenceJudgmentBinding } from './judgment-policy.ts';
import { USER_BROWSER_LIMITATIONS } from './user-browser-provenance.ts';
import { resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { detectBlockReason } from '../render/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { canonicalJson } from './board-artifacts.ts';
import { designDiscoveryDirectoryProvider, designDiscoveryItemIdentity } from './design-discovery-sources.ts';
import { captureDiscoveryObservation, captureDomainObservation } from './reference-capture-observation.ts';
import { collectGalleryImageCandidates } from './gallery-image-candidates.ts';
import { readDomainObservation, DOMAIN_OBSERVATION_LIMITATIONS, DOMAIN_OBSERVATION_SCHEMA,
  type DomainObservationReceipt, type DomainObservationRecord } from './domain-observation.ts';
import { classifyKoreanServiceText } from './market-reference.ts';
import { withAcquisitionDeadline, NAVIGATION_BUDGET_MS, AcquisitionTimeoutError,
  type AcquisitionDeadlineScope } from './acquisition-deadline.ts';
import { recoverDirectDiscoveryScroll, type DiscoveryScroll } from './discovery-entry-scroll.ts';
import { observeDocumentResponses, type DocumentObserver } from './document-observation.ts';
import { createPublicNetworkProxy } from './public-network.ts';
import { disableUnproxiedRealtimeTransports } from './browser-security.ts';
import { searchChallengeReason } from './search-execution.ts';
import { clearCheckboxChallenge } from './challenge-clearance.ts';
import type { ReferenceBrowserConfig } from './browser-config.ts';
import { readCurrentDiscoveryNavigation } from './discovery-record.ts';
import { DISCOVERY_LIMITATIONS, DISCOVERY_SCROLL_LIMITATIONS, DirectDiscoveryLinksError, ReferenceDiscoveryError, directDiscoveryEntry, discoveryDigest, discoveryLane, publicDiscoveryUrl, validateDirectDiscoveryLinks,
  type DirectDiscoveryEntry, type DirectDiscoveryReceipt, type DiscoveryCaptureRecord, type DiscoveryLane, type DiscoveryNavigationReceipt } from './discovery-record.ts';

export async function assessCapturedNavigationAccess(root: string, receipt: ReferenceNavigationReceipt,
  binding?: ReferenceJudgmentBinding) {
  // Reading first authenticates the signed capture and its current document identity.
  const observation = receipt.capture.path.includes('/observations/')
    ? readDomainObservation(root, { url: receipt.url, capture: receipt.capture })
    : readCurrentDiscoveryNavigation(root, receipt as DiscoveryNavigationReceipt);
  return { observation, access: await assessPageAccess(observation.url, binding) };
}

const ATTEMPT_SCHEMA = 'reference-discovery-attempt-v1' as const;
type AttemptReason = 'http-failure' | 'login-overlay' | 'challenge-page' | 'entry-unusable'
  | 'unstable-render' | 'timeout' | 'network-failure' | 'capture-failure';
export type ReferenceDiscoveryAttemptReceipt = Readonly<{ path: string; sha256: string }>;
export type ReferenceDiscoveryAttempt = Readonly<{
  schema: typeof ATTEMPT_SCHEMA | 'reference-discovery-attempt-v2'; source: string; researchLane: DiscoveryLane;
  method: 'direct-public' | 'navigation'; entry: DirectDiscoveryEntry | null;
  capturedAt: string; httpStatus: number | null; outcome: 'unavailable'; reason: AttemptReason; signature: string;
  engine?: 'user-browser'; limitations?: string;
}>;
const ATTEMPT_REASONS: readonly AttemptReason[] = [
  'http-failure', 'login-overlay', 'challenge-page', 'entry-unusable',
  'unstable-render', 'timeout', 'network-failure', 'capture-failure',
];

function attemptReason(error: unknown): AttemptReason {
  const message = error instanceof Error ? error.message : '';
  if (/successful native HTTP/.test(message)) return 'http-failure';
  if (/login form/.test(message)) return 'login-overlay';
  if (/challenge page|Just a moment/i.test(message)) return 'challenge-page';
  if (/visible followable|same-provider|supported public list/.test(message)) return 'entry-unusable';
  if (/both bounded captures/.test(message)) return 'unstable-render';
  if (/timeout|timed out/i.test(message)) return 'timeout';
  if (/net::ERR_|ERR_/i.test(message)) return 'network-failure';
  return 'capture-failure';
}

export function publishFailedAttempt(writer: ProjectWriteAdapter, source: string, researchLane: DiscoveryLane,
  entry: DirectDiscoveryEntry | undefined, httpStatus: number | null, error: unknown, engine?: 'user-browser'): ReferenceDiscoveryAttemptReceipt {
  const schema = engine ? 'reference-discovery-attempt-v2' as const : ATTEMPT_SCHEMA;
  const unsigned = {
    schema, source, researchLane, method: entry === undefined ? 'navigation' : 'direct-public',
    entry: entry ?? null, capturedAt: new Date().toISOString(), httpStatus, outcome: 'unavailable', reason: attemptReason(error),
    ...(engine ? { engine, limitations: USER_BROWSER_LIMITATIONS } : {}),
  } as const;
  const record: ReferenceDiscoveryAttempt = { ...unsigned,
    signature: signNativeObservation(writer.projectRoot, schema, discoveryDigest(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const sha256 = discoveryDigest(bytes);
  const path = `.omd/discovery/${researchLane}/attempts/${sha256}.json`;
  writer.writeContentAddressed(path, bytes);
  return { path, sha256 };
}

export function readReferenceDiscoveryAttempt(root: string, receipt: ReferenceDiscoveryAttemptReceipt): ReferenceDiscoveryAttempt {
  if (!/^[a-f0-9]{64}$/.test(receipt.sha256)) throw new ReferenceNavigationError('invalid attempt digest');
  const match = /^\.omd\/discovery\/(domain|design)\/attempts\/([a-f0-9]{64})\.json$/.exec(receipt.path);
  if (!match || match[2] !== receipt.sha256) throw new ReferenceNavigationError('attempt requires its exact content-addressed lane path');
  const bytes = readStableProjectFile({ root: resolve(root), path: resolve(root, receipt.path), label: receipt.path,
    fs: nodeStableProjectFileSystem() });
  if (discoveryDigest(bytes) !== receipt.sha256) throw new ReferenceNavigationError('attempt evidence changed');
  let decoded: unknown;
  try { decoded = JSON.parse(bytes.toString('utf8')); }
  catch { throw new ReferenceNavigationError('invalid attempt JSON'); }
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)
    || Object.getPrototypeOf(decoded) !== Object.prototype) throw new ReferenceNavigationError('invalid attempt record');
  const row = decoded as Record<string, unknown>;
  const userBrowser = row.schema === 'reference-discovery-attempt-v2';
  const keys = ['schema', 'source', 'researchLane', 'method', 'entry', 'capturedAt', 'httpStatus', 'outcome', 'reason', 'signature',
    ...(userBrowser ? ['engine', 'limitations'] : [])];
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) {
    throw new ReferenceNavigationError('invalid attempt fields');
  }
  const lane = match[1] as DiscoveryLane;
  if ((!userBrowser && row.schema !== ATTEMPT_SCHEMA) || (userBrowser && (row.engine !== 'user-browser' || row.limitations !== USER_BROWSER_LIMITATIONS))
    || row.researchLane !== lane || row.outcome !== 'unavailable'
    || typeof row.source !== 'string' || publicDiscoveryUrl(row.source) !== row.source
    || (row.method !== 'navigation' && row.method !== 'direct-public')
    || (row.method === 'navigation' && row.entry !== null)
    || (row.method === 'direct-public' && directDiscoveryEntry(row.entry, lane) !== row.entry)
    || typeof row.capturedAt !== 'string' || !Number.isFinite(Date.parse(row.capturedAt))
    || new Date(row.capturedAt).toISOString() !== row.capturedAt
    || (row.httpStatus !== null && (!Number.isInteger(row.httpStatus) || (row.httpStatus as number) < 100 || (row.httpStatus as number) > 599))
    || !ATTEMPT_REASONS.includes(row.reason as AttemptReason)
    || typeof row.signature !== 'string') throw new ReferenceNavigationError('invalid attempt provenance');
  const { signature, ...unsigned } = row;
  if (!verifyNativeObservation(root, userBrowser ? 'reference-discovery-attempt-v2' : ATTEMPT_SCHEMA,
    discoveryDigest(canonicalJson(unsigned)), signature)) {
    throw new ReferenceNavigationError('native attempt signature invalid');
  }
  return row as ReferenceDiscoveryAttempt;
}

export class ReferenceNavigationError extends ReferenceDiscoveryError {
  override readonly name = 'ReferenceNavigationError';
  readonly attempt: ReferenceDiscoveryAttemptReceipt | undefined;
  readonly httpStatus: number | null;
  constructor(message: string, attempt?: ReferenceDiscoveryAttemptReceipt, httpStatus: number | null = null) {
    super(message);
    this.attempt = attempt;
    this.httpStatus = httpStatus;
  }
}
async function loginOccludes(page: Page): Promise<boolean> {
  return page.evaluate(browserCallback(() => Array.from(document.querySelectorAll('input[type="password"]')).some(input => {
    const box = input.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0 || getComputedStyle(input).visibility === 'hidden') return false;
    const form = input.closest('form, [role="dialog"], [aria-modal="true"]');
    const centre = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return form !== null && centre !== null && form.contains(centre);
  })));
}
async function closeContext(context: BrowserContext): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([context.close(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ReferenceNavigationError('context cleanup timed out after 2000ms')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}
export type ReferenceNavigationReceipt = DiscoveryNavigationReceipt | DirectDiscoveryReceipt | DomainObservationReceipt;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: 'domain', writer: ProjectWriteAdapter, entry?: 'public-directory'): Promise<DomainObservationReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: 'design', writer: ProjectWriteAdapter): Promise<DiscoveryNavigationReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: 'design', writer: ProjectWriteAdapter, entry: 'free-gallery'): Promise<DirectDiscoveryReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: 'domain', writer: ProjectWriteAdapter, entry: 'public-directory'): Promise<DomainObservationReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: DiscoveryLane, writer: ProjectWriteAdapter, entry?: DirectDiscoveryEntry): Promise<ReferenceNavigationReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter, entry?: unknown): Promise<ReferenceNavigationReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter,
  entry: unknown, parentScope?: AcquisitionDeadlineScope, config?: ReferenceBrowserConfig,
  publishFailure?: boolean): Promise<ReferenceNavigationReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter,
  requestedEntry?: unknown, parentScope?: AcquisitionDeadlineScope, config?: ReferenceBrowserConfig,
  publishFailure = true): Promise<ReferenceNavigationReceipt> {
  const lane = discoveryLane(requestedLane);
  const url = publicDiscoveryUrl(source);
  const entry = requestedEntry === undefined ? undefined : directDiscoveryEntry(requestedEntry, lane);
  if (entry === 'free-gallery' && designDiscoveryDirectoryProvider(url) === null)
    throw new ReferenceNavigationError('free-gallery entry requires a supported public list URL');
  try {
    return await withAcquisitionDeadline({ budgetMs: NAVIGATION_BUDGET_MS, phase: 'ref navigate' },
      scope => captureNavigationWithinDeadline(browser, url, lane, writer, entry, scope, parentScope, config));
  } catch (error) {
    if (parentScope?.signal.aborted) throw error;
    const attempt = publishFailure ? publishFailedAttempt(writer, url, lane, entry,
      error instanceof ReferenceNavigationError ? error.httpStatus : null, error) : undefined;
    const message = error instanceof Error ? error.message.replace(/^REFERENCE_DISCOVERY: /, '') : 'native navigation failed';
    throw new ReferenceNavigationError(message, attempt);
  }
}
async function captureNavigationWithinDeadline(browser: Browser, source: string, requestedLane: unknown,
  writer: ProjectWriteAdapter, requestedEntry: unknown, scope: AcquisitionDeadlineScope,
  parentScope?: AcquisitionDeadlineScope, config?: ReferenceBrowserConfig): Promise<ReferenceNavigationReceipt> {
  const lane = discoveryLane(requestedLane);
  const url = publicDiscoveryUrl(source);
  const entry = requestedEntry === undefined ? undefined : directDiscoveryEntry(requestedEntry, lane);
  if (entry === 'free-gallery' && designDiscoveryDirectoryProvider(url) === null) throw new ReferenceNavigationError('free-gallery entry requires a supported public list URL');
  const networkProxy = scope.own(await createPublicNetworkProxy());
  let context: BrowserContext | undefined;
  let documents: DocumentObserver | undefined;
  const pending: Array<{ path: string; bytes: string | Buffer }> = [];
  try {
    context = scope.own(await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false,
      proxy: { server: networkProxy.server }, ...(config?.storageState ? { storageState: config.storageState } : {}) }));
    await disableUnproxiedRealtimeTransports(context);
    await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    context.setDefaultTimeout(10000);
    const page = await context.newPage();
    documents = await observeDocumentResponses(page);
    let status: number | null = null;
    let observation: Awaited<ReturnType<typeof captureDiscoveryObservation>>;
    let finalUrl: string;
    let links: string[];
    let scroll: DiscoveryScroll | undefined;
    let imageCandidates: Awaited<ReturnType<typeof collectGalleryImageCandidates>> = [];
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      status = response?.status() ?? null;
      if (!response?.ok()) throw new ReferenceNavigationError('a successful native HTTP capture is required');
      const observer = documents;
      if (lane === 'domain') {
        let captured = await captureDomainObservation(page, observer);
        status = captured.httpStatus;
        if (status < 200 || status >= 300) throw new ReferenceNavigationError('a successful native HTTP capture is required');
        let capturedUrl = publicDiscoveryUrl(captured.url);
        let capturedLinks = captured.links.filter(link => {
          try { publicDiscoveryUrl(link); return true; }
          catch (error) { if (error instanceof ReferenceDiscoveryError) return false; throw error; }
        });
        const blocked = searchChallengeReason(captured.body)
          ?? detectBlockReason(await page.title(), captured.body.trim().length, status, capturedLinks.length > 0);
        if (blocked && !(await clearCheckboxChallenge(page, async () => {
          const title = await page.title(); const body = await page.locator('body').innerText();
          return Boolean(searchChallengeReason(body) ?? detectBlockReason(title, body.length, status, false));
        }, scope.signal))) throw new ReferenceNavigationError(blocked);
        if (blocked) {
          captured = await captureDomainObservation(page, observer);
          capturedUrl = publicDiscoveryUrl(captured.url);
          capturedLinks = captured.links.filter(link => { try { publicDiscoveryUrl(link); return true; } catch { return false; } });
          if (searchChallengeReason(captured.body)) throw new ReferenceNavigationError('challenge page remains after clearance');
        }
        if (entry !== undefined) validateDirectDiscoveryLinks(entry, { url, finalUrl: capturedUrl, links: capturedLinks });
        const unsigned = { schema: DOMAIN_OBSERVATION_SCHEMA, source: url, researchLane: 'domain' as const,
          method: entry === undefined ? 'navigation' as const : 'direct-public' as const,
          entry: entry === undefined ? null : 'public-directory' as const, capturedAt: new Date().toISOString(),
          acquisition: { requestedUrl: url, finalUrl: capturedUrl, httpStatus: status, links: capturedLinks },
          observedText: captured.visibleText, taskText: captured.taskText, linkLabels: captured.results,
          language: classifyKoreanServiceText(captured.visibleText), limitations: DOMAIN_OBSERVATION_LIMITATIONS } as const;
        const record: DomainObservationRecord = { ...unsigned, signature: signNativeObservation(writer.projectRoot,
          DOMAIN_OBSERVATION_SCHEMA, discoveryDigest(canonicalJson(unsigned))) };
        const bytes = `${JSON.stringify(record, null, 2)}\n`;
        const sha256 = discoveryDigest(bytes);
        const capture = { path: `.omd/discovery/domain/observations/${sha256}.json`, sha256 };
        scope.assertLive(); parentScope?.assertLive();
        pending.push({ path: capture.path, bytes });
        return { url, capture };
      }
      if (await loginOccludes(page)) throw new ReferenceNavigationError('login form obscures the public discovery list');
      const galleryCandidatesBefore = entry === undefined && designDiscoveryItemIdentity(page.url()) !== null
        ? await collectGalleryImageCandidates(page) : [];
      const observe = async () => {
        let captured = await captureDiscoveryObservation(page, observer);
        status = captured.httpStatus;
        if (status < 200 || status >= 300) throw new ReferenceNavigationError('a successful native HTTP capture is required');
        let capturedUrl = publicDiscoveryUrl(captured.url);
        let capturedLinks = captured.links.filter(link => {
          try { publicDiscoveryUrl(link); return true; }
          catch (error) { if (error instanceof ReferenceDiscoveryError) return false; throw error; }
        });
        const blocked = searchChallengeReason(captured.body)
          ?? detectBlockReason(await page.title(), captured.body.trim().length, status, capturedLinks.length > 0);
        if (blocked && !(await clearCheckboxChallenge(page, async () => {
          const title = await page.title(); const body = await page.locator('body').innerText();
          return Boolean(searchChallengeReason(body) ?? detectBlockReason(title, body.length, status, false));
        }, scope.signal))) throw new ReferenceNavigationError(blocked);
        if (blocked) {
          captured = await captureDiscoveryObservation(page, observer);
          capturedUrl = publicDiscoveryUrl(captured.url);
          capturedLinks = captured.links.filter(link => { try { publicDiscoveryUrl(link); return true; } catch { return false; } });
          if (searchChallengeReason(captured.body)) throw new ReferenceNavigationError('challenge page remains after clearance');
        }
        if (lane === 'design' && await loginOccludes(page)) throw new ReferenceNavigationError('login form obscures the public discovery list');
        if (entry !== undefined) validateDirectDiscoveryLinks(entry, { url, finalUrl: capturedUrl, links: capturedLinks });
        return { ...captured, url: capturedUrl, links: capturedLinks };
      };
      try { observation = await observe(); }
      catch (error) {
        if (entry === undefined || !(error instanceof DirectDiscoveryLinksError)) throw error;
        const recovered = await recoverDirectDiscoveryScroll({ page, documents: observer, observe });
        if (recovered === null) throw error;
        observation = recovered.observation;
        scroll = recovered.scroll;
      }
      status = observation.httpStatus;
      finalUrl = observation.url;
      links = observation.links;
      const galleryCandidatesAfter = entry === undefined && designDiscoveryItemIdentity(page.url()) !== null
        ? await collectGalleryImageCandidates(page) : [];
      if (JSON.stringify(galleryCandidatesBefore) !== JSON.stringify(galleryCandidatesAfter))
        throw new ReferenceNavigationError('gallery image candidates changed during capture');
      imageCandidates = galleryCandidatesAfter;
    } catch (error) {
      if (error instanceof AcquisitionTimeoutError) throw error;
      const message = error instanceof Error ? error.message.replace(/^REFERENCE_DISCOVERY: /, '') : 'native navigation failed';
      throw new ReferenceNavigationError(message, undefined, status);
    }
    const directory = `.omd/discovery/${lane}/${entry === undefined ? 'navigation' : 'entries'}`;
    const imageSha256 = discoveryDigest(observation.bytes);
    const imagePath = `${directory}/${imageSha256}.png`;
    const common = {
      source: url, researchLane: lane, kind: 'page', capturedAt: new Date().toISOString(), imagePath,
      acquisition: { requestedUrl: url, finalUrl, httpStatus: status, links, imageSha256 },
      limitations: scroll === undefined ? DISCOVERY_LIMITATIONS : DISCOVERY_SCROLL_LIMITATIONS,
    } as const;
    const unsigned = entry === undefined
      ? { schema: 'reference-navigation-capture-v6' as const, ...common, imageCandidates,
        observedText: observation.visibleText, taskText: observation.taskText, linkLabels: observation.results }
      : { ...(scroll === undefined ? { schema: 'reference-discovery-entry-v4' as const }
        : { schema: 'reference-discovery-entry-v5' as const, scroll }), method: 'direct-public' as const, entry,
        ...common, observedText: observation.visibleText, taskText: observation.taskText,
        linkLabels: observation.results };
    const record: DiscoveryCaptureRecord = { ...unsigned, signature: signNativeObservation(writer.projectRoot,
      unsigned.schema, discoveryDigest(canonicalJson(unsigned))) };
    const bytes = `${JSON.stringify(record, null, 2)}\n`;
    const sha256 = discoveryDigest(bytes);
    const capture = { path: `${directory}/${sha256}.json`, sha256 };
    scope.assertLive(); parentScope?.assertLive();
    pending.push({ path: imagePath, bytes: observation.bytes }, { path: capture.path, bytes });
    const receipt = { url, evidence: { path: imagePath, sha256: imageSha256 }, capture };
    return entry === undefined ? receipt : { method: 'direct-public', entry, ...receipt };
  } finally {
    try { await documents?.close(); }
    finally {
      try { if (context !== undefined) await closeContext(context); }
      finally { await networkProxy.close(); }
    }
    scope.assertLive(); parentScope?.assertLive();
    for (const item of pending) writer.writeContentAddressed(item.path, item.bytes);
  }
}
