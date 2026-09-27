import { createHash } from 'node:crypto';
import { realpathSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import {
  MEASURED_BROWSER_RECEIPT_SCHEMA,
  TRUSTED_BROWSER_RECEIPT_SCHEMA,
  trustedBrowserReceiptSha256,
  type TrustedBrowserCapture,
  type TrustedBrowserReceipt,
} from '../core/runtime/trusted-browser-receipt.ts';
import type {
  TrustedEntrySurface,
  TrustedLifecycleManifest,
} from '../core/runtime/trusted-evaluation-contract.ts';
import { serveProjectEntry } from '../core/render/serve.ts';
import { waitForDocumentFonts } from '../core/render/index.ts';
import { withLocalView, pageRoute } from '../core/render/stateful.ts';
import { withZoomedLocalView, ensureMeasuredLayoutZoom } from '../core/render/browser-zoom.ts';
import { captureMeasuredView } from '../core/measure/capture.ts';
import { loadContracts, methodIdentity, sourceDigest } from '../core/measure/inputs.ts';
import { canonicalBytes, digest } from '../core/measure/identity.ts';
import { measureCaptures, type RetainedCapture } from '../core/measure/engine.ts';
import { sealNativeMeasurement } from '../core/measure/files.ts';
import type { ViewRequest, ViewSpec, VisualMeasurement } from '../core/measure/types.ts';
import { parseMeasureScope } from '../core/measure/schema.ts';
import { BASELINE_VIEWS } from '../core/measure/types.ts';

type Binding = Readonly<{
  runId: string;
  routeSha256: string;
  sourceContractSha256: string;
  activationBuildSha256: string;
  productionRevisionSha256: string;
  productionPath: string;
  decisionGraphSha256: string;
  requiredOutcomeRefs: readonly string[];
  confirmedClaimRefs: readonly string[];
  decisionRefs: readonly string[];
}>;

export type TrustedBrowserEvaluationResult = Readonly<{
  receipt: TrustedBrowserReceipt;
  receiptSha256: string;
  actionLog: readonly string[];
}>;

const issuedEvaluations = new WeakSet<object>();

export function requireTrustedBrowserEvaluation(
  value: unknown,
): TrustedBrowserEvaluationResult {
  if (typeof value !== 'object' || value === null || !issuedEvaluations.has(value)) {
    throw new Error('UNAUTHORIZED_TRUSTED_BROWSER_RECEIPT');
  }
  return value as TrustedBrowserEvaluationResult;
}

export type TrustedBrowserArtifactSink = Readonly<{
  write(relativePath: string, bytes: Uint8Array): void;
}>;


export const TRUSTED_BROWSER_EVALUATOR_REVISION = 'trusted-browser-evaluator-v7-measured' as const;

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Observe the painted state after frame-scheduled CSS/WAAPI work, without disabling animations.
 * Infinite animations and arbitrary later timers are not claimed to have finished. A timeout
 * fails the browser outcome; it never converts an intermediate screenshot into passing evidence.
 */
async function settleTrustedRender(page: Page): Promise<boolean> {
  try {
    await waitForDocumentFonts(page);
    return await page.evaluate(async () => {
      let expired = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Keep serialized browser callbacks self-contained under both native TypeScript and tsx;
      // named local function expressions can acquire module-only __name helpers under tsx.
      const settling = (async (): Promise<boolean> => {
        await new Promise<void>((resolveFrames) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolveFrames())));
        while (!expired) {
          const animations = document.getAnimations().filter((animation) =>
            (animation.playState === 'running' || animation.pending)
            && Number.isFinite(animation.effect?.getComputedTiming().endTime));
          if (animations.length !== 0) {
            await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
          }
          await new Promise<void>((resolveFrames) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolveFrames())));
          if (document.getAnimations().every((animation) =>
            (animation.playState !== 'running' && !animation.pending)
            || !Number.isFinite(animation.effect?.getComputedTiming().endTime))) return !expired;
        }
        return false;
      })();
      try {
        return await Promise.race([
          settling,
          new Promise<false>((resolveTimeout) => {
            timer = setTimeout(() => { expired = true; resolveTimeout(false); }, 5_000);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    });
  } catch { return false; }
}

async function resultIsRendered(page: Page, selector: string, text: string): Promise<boolean> {
  return page.locator(selector).filter({ hasText: text }).evaluateAll((elements) => {
    const element = elements.length === 1 ? elements[0] : undefined;
    if (element === undefined) return false;
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;
    const ownStyle = getComputedStyle(element);
    if (ownStyle.visibility === 'hidden' || ownStyle.visibility === 'collapse') return false;
    for (let ancestor: Element | null = element; ancestor !== null; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.display === 'none' || Number(style.opacity) <= 0) return false;
    }
    return true;
  }).catch(() => false);
}

async function waitForRenderedResult(page: Page, selector: string, text: string): Promise<boolean> {
  const deadline = performance.now() + 2_000;
  try {
    await page.locator(selector).filter({ hasText: text }).waitFor({ state: 'visible', timeout: 2_000 });
    do {
      if (await resultIsRendered(page, selector, text)) return true;
      await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame())));
    } while (performance.now() < deadline);
  } catch { /* A missing or replaced state is a measured failed signal. */ }
  return false;
}

async function collectInteractiveLabelFindings(
  page: Page,
  viewport: Readonly<{ width: number; height: number }>,
  findings: Set<string>,
): Promise<void> {
  const observed = await page.locator([
    'button',
    'a[href]',
    'input[type="button"]',
    'input[type="submit"]',
    'input[type="reset"]',
    '[role="button"]',
  ].join(',')).evaluateAll((elements) => {
    return elements.flatMap((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const visible = style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && box.width > 0
        && box.height > 0
        && box.bottom > 0
        && box.right > 0
        && box.top < innerHeight
        && box.left < innerWidth;
      if (!visible) return [];
      const textBoxes: DOMRect[] = [];
      let tokenSplit = false;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.textContent ?? '';
        for (const token of text.matchAll(/\S+/gu)) {
          const range = document.createRange();
          range.setStart(node, token.index ?? 0);
          range.setEnd(node, (token.index ?? 0) + token[0].length);
          const boxes = [...range.getClientRects()].filter(
            (textBox) => textBox.width > 0 && textBox.height > 0,
          );
          textBoxes.push(...boxes);
          if (new Set(boxes.map((textBox) => Math.round(textBox.top))).size > 1) tokenSplit = true;
        }
      }
      let clipped = element instanceof HTMLElement
        && (element.scrollWidth > element.clientWidth + 1
          || element.scrollHeight > element.clientHeight + 1);
      let viewportFixed = false;
      let ancestor: Element | null = element;
      while (ancestor !== null && ancestor !== document.documentElement) {
        const ancestorStyle = getComputedStyle(ancestor);
        viewportFixed ||= ancestorStyle.position === 'fixed';
        const clipsX = ancestorStyle.overflowX === 'hidden' || ancestorStyle.overflowX === 'clip';
        const clipsY = ancestorStyle.overflowY === 'hidden' || ancestorStyle.overflowY === 'clip';
        if (clipsX || clipsY) {
          const ancestorBox = ancestor.getBoundingClientRect();
          clipped ||= textBoxes.some((textBox) =>
            (clipsX && (textBox.left < ancestorBox.left - 1
              || textBox.right > ancestorBox.right + 1))
            || (clipsY && (textBox.top < ancestorBox.top - 1
              || textBox.bottom > ancestorBox.bottom + 1)));
        }
        ancestor = ancestor.parentElement;
      }
      // A viewport is a window into a scrollable document. Crossing its top/bottom edge does
      // not cut off a label that the reader can bring into view. Fixed controls and document
      // content outside the reachable scroll extent still fail, as do actual clipping ancestors.
      const scrollRoot = document.scrollingElement ?? document.documentElement;
      const documentClipsY = [document.documentElement, document.body].some((root) =>
        ['hidden', 'clip'].includes(getComputedStyle(root).overflowY));
      clipped ||= textBoxes.some((textBox) =>
        textBox.left < -1 || textBox.right > innerWidth + 1
        || ((textBox.top < -1 || textBox.bottom > innerHeight + 1)
          && (viewportFixed || documentClipsY
            || textBox.top + scrollY < -1
            || textBox.bottom + scrollY > scrollRoot.scrollHeight + 1)));
      return [Object.freeze({ tokenSplit, clipped })];
    });
  });
  if (observed.some((item) => item.tokenSplit)) {
    findings.add(`interactive-label-token-split:${viewport.width}x${viewport.height}`);
  }
  if (observed.some((item) => item.clipped)) {
    findings.add(`interactive-label-clipped:${viewport.width}x${viewport.height}`);
  }
}

async function collectEntrySurfaceFindings(
  page: Page,
  entry: TrustedEntrySurface,
  viewport: Readonly<{ width: number; height: number }>,
  findings: Set<string>,
): Promise<void> {
  const code = (reason: string): void => {
    findings.add(`entry-surface-${reason}:${viewport.width}x${viewport.height}`);
  };
  const uniqueVisibleInViewport = async (selector: string): Promise<boolean> => {
    const locator = page.locator(selector);
    if (await locator.count() !== 1 || !await locator.isVisible().catch(() => false)) return false;
    return locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0
        && box.height > 0
        && box.left >= -1
        && box.top >= -1
        && box.right <= innerWidth + 1
        && box.bottom <= innerHeight + 1;
    }).catch(() => false);
  };
  const uniqueStartsInViewport = async (selector: string): Promise<boolean> => {
    const locator = page.locator(selector);
    if (await locator.count() !== 1 || !await locator.isVisible().catch(() => false)) return false;
    return locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0
        && box.height > 0
        && box.left >= -1
        && box.top >= -1
        && box.left < innerWidth
        && box.top < innerHeight;
    }).catch(() => false);
  };
  const textEquals = async (selector: string, expected: string): Promise<boolean> =>
    page.locator(selector).evaluate((element, value) =>
      (element.textContent ?? '').replace(/\s+/gu, ' ').trim() === value, expected).catch(() => false);
  const accessibleNameEquals = async (selector: string, expected: string): Promise<boolean> =>
    page.locator(selector).evaluate((element, value) => {
      const visibleText = element instanceof HTMLInputElement
        ? element.value
        : element.textContent;
      const name = element.getAttribute('aria-label') ?? visibleText ?? '';
      return name.replace(/\s+/gu, ' ').trim() === value;
    }, expected).catch(() => false);
  const unavailable = async (selector: string): Promise<boolean> =>
    page.locator(selector).evaluate((element) => element.matches(':disabled')
      || element.getAttribute('aria-disabled') === 'true'
      || element.closest('[inert]') !== null).catch(() => false);
  const workObject = page.locator(entry.workObject.selector);
  const contained = async (selector: string): Promise<boolean> => {
    const candidate = page.locator(selector);
    if (await workObject.count() !== 1 || await candidate.count() !== 1) return false;
    return workObject.evaluate((parent, child) => parent.contains(child), await candidate.elementHandle())
      .catch(() => false);
  };

  if (!await uniqueVisibleInViewport(entry.purpose.selector)
    || !await textEquals(entry.purpose.selector, entry.purpose.text)) code('purpose-missing');
  if (!await uniqueStartsInViewport(entry.workObject.selector)) code('work-object-missing');
  if (!await uniqueVisibleInViewport(entry.workObject.anchorSelector)
    || !await contained(entry.workObject.anchorSelector)
    || !await textEquals(entry.workObject.anchorSelector, entry.workObject.anchorText)) {
    code('work-anchor-missing');
  }
  if (entry.nextAction !== undefined) {
    if (!await uniqueVisibleInViewport(entry.nextAction.selector)
      || !await contained(entry.nextAction.selector)
      || !await accessibleNameEquals(entry.nextAction.selector, entry.nextAction.accessibleName)) {
      code('next-action-missing');
    }
    if (!await unavailable(entry.nextAction.selector)) code('dependent-action-prematurely-available');
  }
  if (!await contained(entry.trigger.selector)) code('trigger-outside-work-object');
  if (!await contained(entry.consequence.selector)) code('consequence-outside-work-object');

  const screens = await page.locator('[data-screen]').evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) > 0
      && box.width > 0
      && box.height > 0;
  }).length);
  if (screens > 1) code('route-not-exclusive');

  const consequence = page.locator(entry.consequence.selector);
  const beforeVisible = await consequence.filter({ hasText: entry.consequence.beforeText })
    .isVisible().catch(() => false);
  const afterSignal = consequence.filter({ hasText: entry.consequence.afterText })
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true, () => false);
  try {
    const trigger = page.locator(entry.trigger.selector);
    if (entry.trigger.kind === 'click') await trigger.click({ timeout: 2_000 });
    else await trigger.fill(entry.trigger.value, { timeout: 2_000 });
  } catch {
    code('trigger-unavailable');
  }
  if (!beforeVisible || !await afterSignal) code('consequence-missing');
  if (entry.nextAction !== undefined && await unavailable(entry.nextAction.selector)) {
    code('dependent-action-still-unavailable');
  }
}

async function collectRenderedKoreanCopyFindings(
  page: Page,
  viewport: Readonly<{ width: number; height: number }>,
  findings: Set<string>,
): Promise<void> {
  const text = await page.locator('body').innerText().catch(() => '');
  if (/(?:합니다|했습니다|됩니다|되었습니다|입니다)\.(?:입니다|합니다|했습니다|됩니다|되었습니다)(?=[\s.!?]|$)/u
    .test(text)) {
    findings.add(`korean-result-ending-duplicated:${viewport.width}x${viewport.height}`);
  }
  for (const match of text.matchAll(
    /(?:상태|처분|결과|값|단계|모드)(?:를|을)\s+([가-힣]+)(으로|로)\s+(?:바꿨|변경|설정|전환)/gu,
  )) {
    const noun = match[1]!;
    const particle = match[2]!;
    const finalCode = noun.charCodeAt(noun.length - 1);
    const jongseong = finalCode >= 0xac00 && finalCode <= 0xd7a3
      ? (finalCode - 0xac00) % 28
      : 0;
    const expected = jongseong === 0 || jongseong === 8 ? '로' : '으로';
    if (particle !== expected) {
      findings.add(`korean-result-particle-mismatch:${viewport.width}x${viewport.height}`);
    }
  }
}

export async function runTrustedBrowserEvaluation(input: Readonly<{
  root: string;
  manifest: TrustedLifecycleManifest;
  binding: Binding;
  artifacts: TrustedBrowserArtifactSink;
}>): Promise<TrustedBrowserEvaluationResult> {
  if (input.manifest.entryPath !== input.binding.productionPath) {
    throw new Error('TRUSTED_BROWSER_PRODUCTION_BINDING_MISMATCH');
  }
  const loadedContracts = loadContracts(input.root);
  // Historical un-routed evaluator consumers retain v1. Routed production always uses the
  // measured ABI, and current-process terminal gates independently reject v1 observations.
  const measuredMode = existsSync(join(input.root, '.omd/route.json'));
  const sourceSha256 = measuredMode ? sourceDigest(input.root) : null;
  const compositionReceipt = loadedContracts.inputs.find(item => item.kind === 'composition')?.receipt;
  const captureContext = compositionReceipt ? { compositionReceipt } : {};
  const requests: ViewRequest[] = [...BASELINE_VIEWS];
  for (const request of measuredMode ? [...loadedContracts.contracts.type?.requiredViews ?? [], ...loadedContracts.contracts.composition?.requiredViews ?? []] : []) {
    const previous = requests.find(item => item.id === request.id);
    if (previous && digest(previous) !== digest(request)) throw new Error('TRUSTED_BROWSER_REQUIRED_VIEW_CONFLICT');
    if (!previous) requests.push(request);
  }
  parseMeasureScope({ schema: 'visual-measurement-scope-v1', views: requests });
  if (input.manifest.measurementViews !== undefined && digest(input.manifest.measurementViews) !== digest(requests)) throw new Error('TRUSTED_BROWSER_MEASUREMENT_PLAN_CHANGED');
  const served = await serveProjectEntry(input.root, input.binding.productionPath);
  try {
    if (served.productionRevisionSha256 !== input.binding.productionRevisionSha256) {
      throw new Error('TRUSTED_BROWSER_PRODUCTION_REVISION_MISMATCH');
    }
  } catch (error) {
    await served.close();
    throw error;
  }
  const output = join('.omd', 'evaluation-runs', input.binding.runId);
  const browser = await chromium.launch({ headless: true }).catch(async (error: unknown) => {
    await served.close();
    throw error;
  });
  const transcript: string[] = [];
  const actionLog: string[] = [];
  const captures: TrustedBrowserCapture[] = [];
  const measured: RetainedCapture[] = [];
  const measurementMethod = measuredMode ? methodIdentity(browser.version()) : undefined;
  const capture = async (page: Page, view: ViewSpec, outcomeRef?: string): Promise<void> => {
    if (!measuredMode) {
      const url = page.url(), bytes = await page.screenshot({ fullPage: false });
      if (page.url() !== url) throw new Error('TRUSTED_BROWSER_CAPTURE_STATE_CHANGED');
      const hash = sha256(bytes), path = join(output, `${String(captures.length).padStart(3, '0')}-sha256-${hash}.png`);
      input.artifacts.write(path, bytes);
      captures.push({ path, sha256: hash, ...view.viewport, ...(outcomeRef ? { outcomeRef } : {}), testedUrl: new URL(view.route, 'http://127.0.0.1').href });
      return;
    }
    const retained = await captureMeasuredView(page, view, loadedContracts.contracts, captureContext);
    measured.push(retained);
    const path = join(output, `${String(measured.length).padStart(3, '0')}-sha256-${retained.binding.capture.sha256}.png`);
    // This is the exact buffer whose pixels and DOM facts form the immutable measurement packet.
    input.artifacts.write(path, retained.png);
    captures.push({ path, sha256: retained.binding.capture.sha256, width: retained.binding.image.width, height: retained.binding.image.height,
      ...(outcomeRef === undefined ? {} : { outcomeRef }), testedUrl: new URL(view.route, 'http://127.0.0.1').href });
  };
  const behaviorByOutcome = new Map(
    input.binding.requiredOutcomeRefs.map((outcomeRef) => [outcomeRef, new Set<string>()]),
  );
  const scriptedOutcomes = new Set(input.manifest.scripts.map((script) => script.outcomeRef));
  for (const [outcomeRef, findings] of behaviorByOutcome) {
    if (!scriptedOutcomes.has(outcomeRef)) findings.add('required-browser-script-missing');
  }
  const accessFindings = new Set<string>();
  const entrySurfaceFindings = new Set<string>();
  const safetyFindings = new Set<string>();
  try {
    for (const request of requests.filter(item => item.state === undefined)) {
      const viewport = { ...request.viewport, id: request.viewport.width <= 600 ? '390x844' as const : '1280x900' as const };
      const inspect = async (page: Page): Promise<void> => {
      page.on('console', (message) => {
        if (message.type() === 'error') safetyFindings.add('browser-console-error');
      });
      page.on('pageerror', () => safetyFindings.add('browser-page-error'));
      page.on('requestfailed', () => safetyFindings.add('browser-request-failed'));
        const initialUrl = measuredMode ? page.url() : served.url;
        const response = await page.goto(initialUrl, { waitUntil: 'load' });
        if (request.browserZoom === 2) await ensureMeasuredLayoutZoom(page, request.viewport);
        if (response === null || !response.ok()) {
          safetyFindings.add('browser-navigation-failed');
          for (const findings of behaviorByOutcome.values()) findings.add('required-page-unavailable');
        }
        if (measuredMode) await capture(page, { id: request.id, viewport: request.viewport, browserZoom: request.browserZoom, route: pageRoute(page), state: 'initial', stateRecipeSha256: digest({ state: 'initial' }) });
        if (input.manifest.entrySurface !== undefined) {
          await collectEntrySurfaceFindings(
            page,
            input.manifest.entrySurface,
            viewport,
            entrySurfaceFindings,
          );
          for (const finding of entrySurfaceFindings) accessFindings.add(finding);
          await collectInteractiveLabelFindings(page, viewport, accessFindings);
          const reset = await page.goto(initialUrl, { waitUntil: 'load' });
          if (request.browserZoom === 2) await ensureMeasuredLayoutZoom(page, request.viewport);
          if (reset === null || !reset.ok()) safetyFindings.add('browser-navigation-failed');
        }
        await page.keyboard.press('Tab');
        // Browser tab order skips hidden, disabled and inert elements and may differ from DOM
        // order. Inspect the element actually reached instead of comparing with the first tag.
        const focused = await page.evaluate(() => {
          let element = document.activeElement;
          while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
          return element !== null && element !== document.body
            && element !== document.documentElement
            && element.matches('button, a[href], input, select, textarea, [tabindex], [contenteditable]')
            && !element.matches(':disabled') && element.closest('[inert]') === null;
        }).catch(() => false);
        if (!focused) accessFindings.add(`keyboard-focus-missing:${viewport.width}x${viewport.height}`);
        await collectInteractiveLabelFindings(page, viewport, accessFindings);
        await collectRenderedKoreanCopyFindings(page, viewport, accessFindings);
        for (const [scriptIndex, script] of input.manifest.scripts.entries()) {
          const findings = behaviorByOutcome.get(script.outcomeRef);
          if (findings === undefined) {
            safetyFindings.add('browser-outcome-binding-missing');
            continue;
          }
          const actions = script.actions.filter((action) =>
            action.viewports === undefined || action.viewports.includes(viewport.id));
          const transitionActions = actions.filter((action) => action.kind === 'click');
          // Attach each visible-state waiter before triggering actions, but convert rejection to a
          // measured boolean immediately so a fast timeout can never become an unhandled rejection.
          const initiallyVisible = await Promise.all(script.assertions.map((assertion) =>
            assertion.kind === 'visible-text'
              ? resultIsRendered(page, assertion.selector, assertion.text)
              : false));
          const visibleSignals = () => script.assertions.map((assertion) =>
            assertion.kind === 'visible-text'
              ? waitForRenderedResult(page, assertion.selector, assertion.text)
              : undefined);
          let signals = actions.length === 0 ? visibleSignals() : [];
          for (const [actionIndex, action] of actions.entries()) {
            // Prerequisite actions may legitimately consume the whole assertion timeout. Subscribe
            // immediately before the final triggering/barrier action so the bounded waiter measures
            // the resulting state rather than expiring while the script is still preparing it.
            if (actionIndex === actions.length - 1) signals = visibleSignals();
            actionLog.push(`${action.kind} ${action.selector} @ ${viewport.width}x${viewport.height}`);
            transcript.push(`action-${action.kind}:${sha256(Buffer.from(action.selector))}`);
            try {
              if (action.kind === 'click') await page.locator(action.selector).click({ timeout: 2_000 });
              else await page.locator(action.selector).fill(action.value, { timeout: 2_000 });
              if (request.browserZoom === 2) await ensureMeasuredLayoutZoom(page, request.viewport);
            } catch {
              findings.add('required-action-unavailable');
            }
          }
          const observedSignals = await Promise.all(signals.map((signal) => signal ?? false));
          if (!await settleTrustedRender(page)) findings.add('required-render-not-settled');
          for (const [index, assertion] of script.assertions.entries()) {
            const rendered = assertion.kind !== 'visible-text'
              || await resultIsRendered(page, assertion.selector, assertion.text);
            if (assertion.kind === 'visible-text' && !rendered) {
              findings.add('required-result-not-rendered');
            }
            const passed = assertion.kind === 'visible-text'
              ? observedSignals[index] && rendered && (transitionActions.length === 0 || !initiallyVisible[index])
              : !await page.locator(assertion.selector).filter({ hasText: assertion.text })
                .isVisible().catch(() => false);
            if (passed) {
              transcript.push(`assertion-pass:${sha256(Buffer.from(`${assertion.selector}\0${assertion.text}`))}`);
            } else {
              findings.add(assertion.kind === 'visible-text' && initiallyVisible[index]
                && transitionActions.length > 0
                ? 'required-state-transition-missing'
                : 'required-visible-result-missing');
              transcript.push(`assertion-fail:${sha256(Buffer.from(`${assertion.selector}\0${assertion.text}`))}`);
            }
          }
          await collectInteractiveLabelFindings(page, viewport, accessFindings);
          await collectRenderedKoreanCopyFindings(page, viewport, accessFindings);
          const observedUrl = new URL(page.url());
          if (observedUrl.origin !== new URL(initialUrl).origin) throw new Error('TRUSTED_BROWSER_CAPTURE_LEFT_PRODUCTION');
          const state = `outcome-${sha256(Buffer.from(script.outcomeRef)).slice(0, 16)}`;
          await capture(page, { id: `${request.id}:${state}`, viewport: request.viewport, browserZoom: request.browserZoom,
            route: pageRoute(page), state, stateRecipeSha256: digest({ focusProbe: 'Tab', scripts: input.manifest.scripts.slice(0, scriptIndex + 1).map(s => ({ ...s, actions: s.actions.filter(a => a.viewports === undefined || a.viewports.includes(viewport.id)) })) }) }, script.outcomeRef);
        }
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth);
        if (overflow) accessFindings.add(`horizontal-overflow:${viewport.width}x${viewport.height}`);
      };
      if (!measuredMode) {
        const context = await browser.newContext({ viewport: request.viewport });
        try { await inspect(await context.newPage()); } finally { await context.close(); }
      } else if (request.browserZoom === 2) await withZoomedLocalView(input.root, input.binding.productionPath, request.viewport, undefined, inspect);
      else await withLocalView(browser, input.root, { page: input.binding.productionPath, viewport: request.viewport }, inspect);
    }
    for (const request of requests.filter(item => item.state !== undefined)) {
      const state = request.state!;
      const view: ViewSpec = { id: request.id, viewport: request.viewport, browserZoom: request.browserZoom, route: state.route, state: state.name, stateRecipeSha256: digest(state) };
      const inspect = (page: Page) => capture(page, view);
      if (request.browserZoom === 2) await withZoomedLocalView(input.root, input.binding.productionPath, request.viewport, state, inspect);
      else await withLocalView(browser, input.root, { page: input.binding.productionPath, viewport: request.viewport, state }, inspect);
    }
    try {
      served.assertSourceCurrent();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown source mutation';
      throw new Error(`TRUSTED_BROWSER_PRODUCTION_REVISION_CHANGED: ${reason}`);
    }
  } finally {
    await served.close();
    await browser.close();
  }
  const outcomeResults = input.binding.requiredOutcomeRefs.map((outcomeRef) => {
    const findings = [...(behaviorByOutcome.get(outcomeRef) ?? ['required-browser-script-missing'])];
    return Object.freeze({
      outcomeRef,
      status: findings.length === 0 ? 'pass' as const : 'fail' as const,
      findings: Object.freeze(findings),
    });
  });
  const behaviorStatus = outcomeResults.every((result) => result.status === 'pass')
    ? 'pass' as const : 'fail' as const;
  // Keep the measured reasons inside the signed transcript so repair can identify the failed
  // viewport and condition. A bare access/safety status cannot explain what must change.
  transcript.push(...[...accessFindings].sort().map((finding) => `access-finding:${finding}`));
  transcript.push(...[...safetyFindings].sort().map((finding) => `safety-finding:${finding}`));
  const sealed = measuredMode ? (() => {
  if (sourceDigest(input.root) !== sourceSha256 || digest(loadContracts(input.root).inputs) !== digest(loadedContracts.inputs)) throw new Error('TRUSTED_BROWSER_MEASUREMENT_INPUTS_CHANGED');
  const method = measurementMethod!;
  const scope = measured.map(c => c.view);
  const packet: VisualMeasurement = { schema: 'visual-measurement-v1', method,
    binding: { authority: 'native-local', projectIdentitySha256: digest(realpathSync(input.root)), routeSha256: input.binding.routeSha256,
      sourceContractSha256: input.binding.sourceContractSha256, activationBuildSha256: input.binding.activationBuildSha256,
      sourceSha256, production: [{ entry: input.binding.productionPath, servedTreeSha256: input.binding.productionRevisionSha256 }], inputs: loadedContracts.inputs, scopeSha256: digest(scope) },
    scope, captures: measured.map(c => c.binding), ...measureCaptures(measured, scope, loadedContracts.contracts, method),
    attestation: { kind: 'diagnostic-only', payloadSha256: '0'.repeat(64), signature: null } };
  return sealNativeMeasurement(input.root, packet, measured);
  })() : undefined;
  for (const retained of measured) {
    input.artifacts.write(retained.binding.capture.path, retained.png);
    input.artifacts.write(retained.binding.ir.path, canonicalBytes(retained.raw));
  }
  if (sealed) input.artifacts.write(sealed.receipt.path, sealed.bytes);
  const receipt: TrustedBrowserReceipt = Object.freeze({
    schema: sealed ? MEASURED_BROWSER_RECEIPT_SCHEMA : TRUSTED_BROWSER_RECEIPT_SCHEMA,
    runId: input.binding.runId,
    routeSha256: input.binding.routeSha256,
    sourceContractSha256: input.binding.sourceContractSha256,
    activationBuildSha256: input.binding.activationBuildSha256,
    productionRevisionSha256: input.binding.productionRevisionSha256,
    productionPath: input.binding.productionPath,
    testedUrl: new URL(input.binding.productionPath, 'http://127.0.0.1/').href,
    decisionGraphSha256: input.binding.decisionGraphSha256,
    outcomeResults: Object.freeze(outcomeResults),
    confirmedClaimRefs: Object.freeze([...input.binding.confirmedClaimRefs]),
    decisionRefs: Object.freeze([...input.binding.decisionRefs]),
    hardFloors: Object.freeze({
      behavior: behaviorStatus,
      access: accessFindings.size === 0 ? 'pass' : 'fail',
      safety: safetyFindings.size === 0 ? 'pass' : 'fail',
    }),
    captures: Object.freeze(captures.map((item, index) => {
      if (!sealed) return Object.freeze(item);
      const retained = measured[index]!;
      return Object.freeze({ ...item, measurement: { packet: sealed.receipt, viewId: retained.view.id, browserZoom: retained.view.browserZoom,
        state: retained.view.state, stateRecipeSha256: retained.view.stateRecipeSha256, viewport: retained.view.viewport,
        layoutViewport: { width: retained.binding.observedViewport.innerWidth, height: retained.binding.observedViewport.innerHeight } } });
    })),
    transcript: Object.freeze(transcript),
    ...(input.manifest.entrySurface === undefined
      ? {}
      : {
        entrySurface: Object.freeze({
          benchmarkProjectionSha256: input.manifest.entrySurface.benchmarkProjectionSha256,
          prerequisiteTaskId: input.manifest.entrySurface.prerequisiteTaskId,
          dependentTaskId: input.manifest.entrySurface.dependentTaskId,
          status: entrySurfaceFindings.size === 0 ? 'pass' as const : 'fail' as const,
        }),
      }),
  });
  const receiptSha256 = trustedBrowserReceiptSha256(receipt);
  const result = Object.freeze({
    receipt,
    receiptSha256,
    actionLog: Object.freeze(actionLog),
  });
  issuedEvaluations.add(result);
  return result;
}
