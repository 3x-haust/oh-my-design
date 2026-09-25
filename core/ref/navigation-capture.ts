import { resolve } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import { detectBlockReason } from '../render/index.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { canonicalJson } from './board-artifacts.ts';
import { designDiscoveryDirectoryProvider } from './design-discovery-sources.ts';
import { captureDiscoveryObservation } from './reference-capture-observation.ts';
import { observeDocumentResponses, type DocumentObserver } from './document-observation.ts';
import { createPublicNetworkProxy } from './public-network.ts';
import { disableUnproxiedRealtimeTransports } from './browser-security.ts';
import { searchChallengeReason } from './search-execution.ts';
import { DISCOVERY_LIMITATIONS, ReferenceDiscoveryError, directDiscoveryEntry, discoveryDigest, discoveryLane, publicDiscoveryUrl, validateDirectDiscoveryLinks,
  type DirectDiscoveryEntry, type DirectDiscoveryReceipt, type DiscoveryCaptureRecord, type DiscoveryLane, type DiscoveryNavigationReceipt } from './discovery-record.ts';

const ATTEMPT_SCHEMA = 'reference-discovery-attempt-v1' as const;
type AttemptReason = 'http-failure' | 'login-overlay' | 'challenge-page' | 'entry-unusable'
  | 'unstable-render' | 'timeout' | 'network-failure' | 'capture-failure';
export type ReferenceDiscoveryAttemptReceipt = Readonly<{ path: string; sha256: string }>;
export type ReferenceDiscoveryAttempt = Readonly<{
  schema: typeof ATTEMPT_SCHEMA; source: string; researchLane: DiscoveryLane;
  method: 'direct-public' | 'navigation'; entry: DirectDiscoveryEntry | null;
  capturedAt: string; httpStatus: number | null; outcome: 'unavailable'; reason: AttemptReason; signature: string;
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

function publishFailedAttempt(writer: ProjectWriteAdapter, source: string, researchLane: DiscoveryLane,
  entry: DirectDiscoveryEntry | undefined, httpStatus: number | null, error: unknown): ReferenceDiscoveryAttemptReceipt {
  const unsigned = {
    schema: ATTEMPT_SCHEMA, source, researchLane, method: entry === undefined ? 'navigation' : 'direct-public',
    entry: entry ?? null, capturedAt: new Date().toISOString(), httpStatus, outcome: 'unavailable', reason: attemptReason(error),
  } as const;
  const record: ReferenceDiscoveryAttempt = { ...unsigned,
    signature: signNativeObservation(writer.projectRoot, ATTEMPT_SCHEMA, discoveryDigest(canonicalJson(unsigned))) };
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
  const keys = ['schema', 'source', 'researchLane', 'method', 'entry', 'capturedAt', 'httpStatus', 'outcome', 'reason', 'signature'];
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) {
    throw new ReferenceNavigationError('invalid attempt fields');
  }
  const lane = match[1] as DiscoveryLane;
  if (row.schema !== ATTEMPT_SCHEMA || row.researchLane !== lane || row.outcome !== 'unavailable'
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
  if (!verifyNativeObservation(root, ATTEMPT_SCHEMA, discoveryDigest(canonicalJson(unsigned)), signature)) {
    throw new ReferenceNavigationError('native attempt signature invalid');
  }
  return row as ReferenceDiscoveryAttempt;
}

export class ReferenceNavigationError extends ReferenceDiscoveryError {
  override readonly name = 'ReferenceNavigationError';
  readonly attempt: ReferenceDiscoveryAttemptReceipt | undefined;
  constructor(message: string, attempt?: ReferenceDiscoveryAttemptReceipt) {
    super(message);
    this.attempt = attempt;
  }
}
async function loginOccludes(page: Page): Promise<boolean> {
  return page.evaluate(() => Array.from(document.querySelectorAll('input[type="password"]')).some(input => {
    const box = input.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0 || getComputedStyle(input).visibility === 'hidden') return false;
    const form = input.closest('form, [role="dialog"], [aria-modal="true"]');
    const centre = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return form !== null && centre !== null && form.contains(centre);
  }));
}
async function closeContext(context: BrowserContext): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([context.close(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ReferenceNavigationError('context cleanup timed out after 2000ms')), 2000);
    })]);
  } finally { clearTimeout(timer); }
}
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter): Promise<DiscoveryNavigationReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter, entry: DirectDiscoveryEntry): Promise<DirectDiscoveryReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter, entry: unknown): Promise<DiscoveryNavigationReceipt | DirectDiscoveryReceipt>;
export async function captureReferenceNavigation(browser: Browser, source: string, requestedLane: unknown, writer: ProjectWriteAdapter, requestedEntry?: unknown): Promise<DiscoveryNavigationReceipt | DirectDiscoveryReceipt> {
  const lane = discoveryLane(requestedLane);
  const url = publicDiscoveryUrl(source);
  const entry = requestedEntry === undefined ? undefined : directDiscoveryEntry(requestedEntry, lane);
  if (entry === 'free-gallery' && designDiscoveryDirectoryProvider(url) === null) throw new ReferenceNavigationError('free-gallery entry requires a supported public list URL');
  const networkProxy = await createPublicNetworkProxy();
  let context: BrowserContext | undefined;
  let documents: DocumentObserver | undefined;
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false,
      proxy: { server: networkProxy.server } });
    await disableUnproxiedRealtimeTransports(context);
    await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    context.setDefaultTimeout(10000);
    const page = await context.newPage();
    documents = await observeDocumentResponses(page);
    let status: number | null = null;
    let observation: Awaited<ReturnType<typeof captureDiscoveryObservation>>;
    let finalUrl: string;
    let links: string[];
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      status = response?.status() ?? null;
      if (!response?.ok()) throw new ReferenceNavigationError('a successful native HTTP capture is required');
      if (lane === 'design' && await loginOccludes(page)) throw new ReferenceNavigationError('login form obscures the public discovery list');
      observation = await captureDiscoveryObservation(page, documents);
      status = observation.httpStatus;
      if (status < 200 || status >= 300) throw new ReferenceNavigationError('a successful native HTTP capture is required');
      finalUrl = publicDiscoveryUrl(observation.url);
      links = observation.links.filter(link => {
        try { publicDiscoveryUrl(link); return true; }
        catch (error) { if (error instanceof ReferenceDiscoveryError) return false; throw error; }
      });
      const blocked = searchChallengeReason(observation.body)
        ?? detectBlockReason(await page.title(), observation.body.trim().length, status, links.length > 0);
      if (blocked) throw new ReferenceNavigationError(blocked);
      if (lane === 'design' && await loginOccludes(page)) throw new ReferenceNavigationError('login form obscures the public discovery list');
      if (entry !== undefined) validateDirectDiscoveryLinks(entry, { url, finalUrl, links });
    } catch (error) {
      const attempt = publishFailedAttempt(writer, url, lane, entry, status, error);
      const message = error instanceof Error ? error.message.replace(/^REFERENCE_DISCOVERY: /, '') : 'native navigation failed';
      throw new ReferenceNavigationError(message, attempt);
    }
    const directory = `.omd/discovery/${lane}/${entry === undefined ? 'navigation' : 'entries'}`;
    const imageSha256 = discoveryDigest(observation.bytes);
    const imagePath = `${directory}/${imageSha256}.png`;
    const common = {
      source: url, researchLane: lane, kind: 'page', capturedAt: new Date().toISOString(), imagePath,
      acquisition: { requestedUrl: url, finalUrl, httpStatus: status, links, imageSha256 },
      limitations: DISCOVERY_LIMITATIONS,
    } as const;
    const record: DiscoveryCaptureRecord = entry === undefined
      ? { schema: 'reference-navigation-capture-v2', ...common }
      : (() => {
        const unsigned = { schema: 'reference-discovery-entry-v3' as const, method: 'direct-public' as const, entry,
          ...common, observedText: observation.visibleText, linkLabels: observation.results };
        return { ...unsigned, signature: signNativeObservation(writer.projectRoot, unsigned.schema,
          discoveryDigest(canonicalJson(unsigned))) };
      })();
    const bytes = `${JSON.stringify(record, null, 2)}\n`;
    const sha256 = discoveryDigest(bytes);
    const capture = { path: `${directory}/${sha256}.json`, sha256 };
    writer.writeContentAddressed(imagePath, observation.bytes);
    writer.writeContentAddressed(capture.path, bytes);
    const receipt = { url, evidence: { path: imagePath, sha256: imageSha256 }, capture };
    return entry === undefined ? receipt : { method: 'direct-public', entry, ...receipt };
  } finally {
    try { await documents?.close(); }
    finally {
      try { if (context !== undefined) await closeContext(context); }
      finally { await networkProxy.close(); }
    }
  }
}
