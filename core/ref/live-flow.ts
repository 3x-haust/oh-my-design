import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Browser, Page } from 'playwright';
import { stateObject, stateText, parseViewAssertions, assertViewState, inspectionDeadline, type ViewAssertion } from '../render/stateful.ts';
import { waitForDocumentFonts, detectBlockReason } from '../render/index.ts';
import { canonicalJson } from './board-artifacts.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../runtime/project-write.ts';
import { readStableProjectFile, nodeStableProjectFileSystem } from '../runtime/stable-project-file.ts';
import { decodePng } from '../motion/energy.ts';
import { clearReferenceNotices, hasSuspendedReferenceScripts, prepareSuppressedReferenceLink, resumeScriptsOnNewReferenceDocument, type NoticeDismissal } from './notice-overlay.ts';

type Receipt = { path: string; sha256: string };
type StepInput = { screenId: string; state: string; clicks: string[]; assertions: ViewAssertion[] };
type Input = { schema: 'reference-flow-input-v1'; sourceId: string; flowId: string; url: string; viewport: { width: number; height: number }; steps: StepInput[] };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fail = (message: string): never => { throw new Error(`REFERENCE_FLOW: ${message}`); };
function publicUrl(value: unknown): string {
  const text = stateText(value), url = new URL(text);
  if (url.protocol !== 'https:' || url.username || url.password || /^(?:localhost|.*\.localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[|0\.)/.test(url.hostname)) return fail('use a public HTTPS reference, without credentials or private/local addresses');
  return url.href;
}
export function parseLiveFlowInput(value: unknown): Input {
  const row = stateObject(value, ['schema', 'sourceId', 'flowId', 'url', 'viewport', 'steps']);
  if (row.schema !== 'reference-flow-input-v1') return fail('invalid schema');
  const viewport = stateObject(row.viewport, ['width', 'height']);
  if (![viewport.width, viewport.height].every(n => typeof n === 'number' && Number.isInteger(n) && n >= 240 && n <= 2560)) return fail('invalid viewport');
  if (!Array.isArray(row.steps) || !row.steps.length || row.steps.length > 24) return fail('steps need 1–24 entries');
  const steps = row.steps.map(value => {
    const step = stateObject(value, ['screenId', 'state', 'clicks', 'assertions']);
    if (!Array.isArray(step.clicks) || step.clicks.length > 8) return fail('each step supports 0–8 navigation/disclosure clicks, never form entry or submission');
    const assertions = parseViewAssertions(step.assertions);
    if (!assertions.some(assertion => assertion.state === 'visible')) return fail('each captured step needs a visible feature assertion');
    return { screenId: stateText(step.screenId), state: stateText(step.state), clicks: step.clicks.map(stateText), assertions };
  });
  if (new Set(steps.map(step => step.screenId)).size !== steps.length) return fail('each captured state needs a distinct screenId');
  return { schema: 'reference-flow-input-v1', sourceId: stateText(row.sourceId), flowId: stateText(row.flowId), url: publicUrl(row.url), viewport: viewport as Input['viewport'], steps };
}
const actionLabel = (step: StepInput) => step.clicks.length ? step.clicks.map(selector => `click: ${selector}`).join(' → ') : 'observe current screen';
const resultLabel = (step: StepInput) => step.assertions.map(item => `${item.state}: ${item.selector}${item.text === undefined ? '' : ` contains ${item.text}`}`).join('; ');

async function frameVisibleAssertions(page: Page, assertions: readonly ViewAssertion[]): Promise<void> {
  const visible = assertions.filter(assertion => assertion.state === 'visible');
  if (!visible.length) return;
  await page.locator(visible.at(-1)!.selector).scrollIntoViewIfNeeded({ timeout: 3000 });
  const viewport = page.viewportSize();
  if (!viewport) return fail('missing capture viewport');
  for (const assertion of visible) {
    const box = await page.locator(assertion.selector).boundingBox();
    if (!box) return fail(`visible assertion has no capture box: ${assertion.selector}`);
    const width = Math.max(0, Math.min(box.x + box.width, viewport.width) - Math.max(box.x, 0));
    const height = Math.max(0, Math.min(box.y + box.height, viewport.height) - Math.max(box.y, 0));
    const requiredArea = Math.min(box.width * box.height, viewport.width * viewport.height) * 0.25;
    if (width * height < requiredArea) return fail(`asserted feature is outside the captured viewport; split this step into separately captured states: ${assertion.selector}`);
  }
}

async function safeClick(page: Page, selector: string, origin: string): Promise<void> {
  const control = page.locator(selector);
  await control.waitFor({ state: 'visible', timeout: 3000 });
  if (await control.count() !== 1) return fail('ambiguous click target');
  const info = await control.evaluate(node => ({ tag: node.tagName, type: node.getAttribute('type'), role: node.getAttribute('role'), href: node.getAttribute('href'), target: node.getAttribute('target'), download: node.hasAttribute('download'), expanded: node.getAttribute('aria-expanded'), controls: node.getAttribute('aria-controls'), label: [node.textContent, node.getAttribute('aria-label'), node.getAttribute('title')].filter(Boolean).join(' ') }));
  // Read-only public navigation only. No submit/login/payment/delete actions, even if a site uses GET.
  if (/log\s*(?:in|out)|sign\s*(?:in|out|up)|purchase|pay\b|checkout|delete|remove|unsubscribe|submit|apply\s+now|로그인|로그아웃|가입|결제|구매|삭제|탈퇴|제출|신청하기/i.test(`${info.label} ${info.href ?? ''}`)) return fail('sensitive action is excluded; record an authentication/payment/destructive-action gap');
  const link = info.tag === 'A' && info.href !== null;
  if (link) {
    if ((info.target && info.target.toLowerCase() !== '_self') || info.download) return fail('new-window, frame-targeted and download links are excluded from reference clicks');
    if (new URL(publicUrl(new URL(info.href!, page.url()).href)).origin !== origin) return fail('cross-service navigation requires a separate flow');
  }
  else if (!(info.tag === 'SUMMARY' || (info.tag === 'BUTTON' && info.type === 'button' && ((info.controls && info.expanded !== null) || info.role === 'tab')))) return fail('only links, disclosure buttons, summary and tabs are safe reference clicks');
  if (info.tag === 'BUTTON' && hasSuspendedReferenceScripts(page)) return fail('same-document scripted action is unavailable after visual-only notice suppression; record a bounded gap or inspect another public source');
  const previousUrl = page.url();
  if (link && hasSuspendedReferenceScripts(page)) {
    const destination = new URL(info.href!, previousUrl);
    if (destination.pathname !== new URL(previousUrl).pathname || destination.search !== new URL(previousUrl).search)
      prepareSuppressedReferenceLink(page, destination.href);
  }
  await control.click({ timeout: 3000, noWaitAfter: false });
  if (link) await resumeScriptsOnNewReferenceDocument(page, previousUrl);
}

/** One fresh browser context preserves the actual step-to-step state; no authored receipt input. */
export async function recordLiveReferenceFlow(browser: Browser, rootInput: string, value: unknown, writer: ProjectWriteAdapter) {
  const root = resolve(rootInput); requireProjectWriteAdapter(root, writer);
  const input = parseLiveFlowInput(value), origin = new URL(input.url).origin;
  const save = (directory: string, bytes: Buffer | string, ext: string): Receipt => {
    const sha256 = hash(bytes), path = `.omd/refs/domain/flows/${directory}/${sha256}.${ext}`;
    writer.writeContentAddressed(path, bytes); return { path, sha256 };
  };
  const startedAt = new Date().toISOString();
  const steps: { order: number; screenId: string; state: string; url: string; action: string; result: string; evidence: Receipt; capture: Receipt; noticeDismissals: NoticeDismissal[] }[] = [];
  const blocked: string[] = [];
  let limitation: string | null = null;
  try {
    await inspectionDeadline(async own => {
    const context = await own(browser.newContext({ viewport: input.viewport, serviceWorkers: 'block', acceptDownloads: false }));
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (!['GET', 'HEAD'].includes(request.method()) || (request.isNavigationRequest() && url.origin !== origin)
        || !['https:', 'data:'].includes(url.protocol)) { blocked.push('non-read-only or cross-service request'); return route.abort(); }
      return route.continue();
    });
    await context.routeWebSocket('**/*', socket => { blocked.push('WebSocket unavailable in read-only reference research'); socket.close(); });
    const page = await context.newPage();
    page.on('dialog', dialog => { blocked.push('unexpected dialog'); void dialog.dismiss(); });
    context.on('page', other => { if (other !== page) { blocked.push('popup excluded'); void other.close(); } });
    let response = await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    page.on('response', r => { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) response = r; });
    const initialDismissals = await clearReferenceNotices(page,
      input.steps[0]!.assertions.filter(assertion => assertion.state === 'visible').map(assertion => assertion.selector), 1000);
    for (const [index, step] of input.steps.entries()) {
      const beforeUrl = page.url();
      for (const selector of step.clicks) await safeClick(page, selector, origin);
      const allowedStateSelectors = step.assertions.filter(assertion => assertion.state === 'visible').map(assertion => assertion.selector);
      const noticeDismissals = [...(index === 0 ? initialDismissals : []), ...await clearReferenceNotices(page, allowedStateSelectors, index === 0 ? 0 : 400)];
      await assertViewState(page, step.assertions);
      await waitForDocumentFonts(page);
      const reason = detectBlockReason(await page.title(), (await page.locator('body').innerText()).trim().length, response?.status() ?? null);
      if (reason) return fail(reason);
      if (blocked.length || new URL(page.url()).origin !== origin) return fail(blocked[0] ?? 'left reference service');
      await frameVisibleAssertions(page, step.assertions);
      const capturedUrl = page.url();
      let png = await page.screenshot({ timeout: 5000 });
      const lateDismissals = await clearReferenceNotices(page, allowedStateSelectors);
      noticeDismissals.push(...lateDismissals);
      if (lateDismissals.length) png = await page.screenshot({ timeout: 5000 });
      await assertViewState(page, step.assertions);
      if (blocked.length || page.url() !== capturedUrl) return fail(blocked[0] ?? 'state navigated during capture');
      const capture = save('captures', png, 'png');
      const observed = { schema: 'reference-flow-step-v1', sourceId: input.sourceId, flowId: input.flowId, order: index + 1,
        screenId: step.screenId, state: step.state, beforeUrl, url: page.url(), action: actionLabel(step), result: resultLabel(step), assertions: step.assertions, capture, noticeDismissals,
        predecessorSha256: steps.at(-1)?.evidence.sha256 ?? null };
      const evidence = save('steps', `${canonicalJson(observed)}\n`, 'json');
      steps.push({ order: index + 1, screenId: step.screenId, state: step.state, url: page.url(), action: observed.action, result: observed.result, evidence, capture, noticeDismissals });
    }
    }, 120000);
  } catch (error) { limitation = (error instanceof Error ? error.message : String(error)).slice(0, 2000); }
  const record = { schema: 'reference-flow-execution-v1', input, startedAt, completedAt: new Date().toISOString(), status: limitation === null ? 'completed' : 'blocked', limitation, steps };
  const digest = hash(canonicalJson(record));
  const execution = save('executions', `${canonicalJson({ ...record, signature: signNativeObservation(root, 'reference-flow-v1', digest) })}\n`, 'json');
  return { execution, ...record, limitations: 'Only these public navigation/disclosure states were executed; no authenticated or transactional controls tested.' };
}

export function readLiveReferenceFlow(rootInput: string, receipt: Receipt) {
  const root = resolve(rootInput);
  const read = (item: Receipt, directory: string, extension: string) => {
    if (!/^[a-f0-9]{64}$/.test(item.sha256) || item.path !== `.omd/refs/domain/flows/${directory}/${item.sha256}.${extension}`) return fail('invalid native receipt path');
    const bytes = readStableProjectFile({ root, path: resolve(root, item.path), label: item.path, fs: nodeStableProjectFileSystem() });
    if (hash(bytes) !== item.sha256) return fail('native evidence changed');
    return bytes;
  };
  const { signature, ...record } = JSON.parse(read(receipt, 'executions', 'json').toString('utf8'));
  if (record.schema !== 'reference-flow-execution-v1' || typeof signature !== 'string'
    || !verifyNativeObservation(root, 'reference-flow-v1', hash(canonicalJson(record)), signature)) return fail('native execution signature invalid');
  const input = parseLiveFlowInput(record.input);
  if (!Array.isArray(record.steps) || record.steps.length > input.steps.length || (record.status === 'completed' && record.steps.length !== input.steps.length)) return fail('native step coverage invalid');
  for (const [index, step] of record.steps.entries()) {
    const evidence = JSON.parse(read(step.evidence, 'steps', 'json').toString('utf8'));
    const planned = input.steps[index]!;
    if (step.order !== index + 1 || step.screenId !== planned.screenId || step.state !== planned.state || step.action !== actionLabel(planned) || step.result !== resultLabel(planned)
      || evidence.predecessorSha256 !== (record.steps[index - 1]?.evidence.sha256 ?? null)
      || evidence.capture.sha256 !== step.capture.sha256 || evidence.url !== step.url
      || JSON.stringify(evidence.noticeDismissals) !== JSON.stringify(step.noticeDismissals)) return fail('native transition chain differs');
    const png = decodePng(read(step.capture, 'captures', 'png'));
    if (png.width !== input.viewport.width || png.height !== input.viewport.height) return fail('native capture viewport differs');
  }
  return record as { schema: string; input: Input; status: 'completed' | 'blocked'; limitation: string | null; steps: { order: number; screenId: string; state: string; url: string; action: string; result: string; evidence: Receipt; capture: Receipt; noticeDismissals?: NoticeDismissal[] }[] };
}
