import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import {
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

const VIEWPORTS = Object.freeze([
  Object.freeze({ id: '1280x900' as const, width: 1280, height: 900 }),
  Object.freeze({ id: '390x844' as const, width: 390, height: 844 }),
]);
export const TRUSTED_BROWSER_EVALUATOR_REVISION = 'trusted-browser-evaluator-v6' as const;

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
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.on('console', (message) => {
        if (message.type() === 'error') safetyFindings.add('browser-console-error');
      });
      page.on('pageerror', () => safetyFindings.add('browser-page-error'));
      page.on('requestfailed', () => safetyFindings.add('browser-request-failed'));
      try {
        const response = await page.goto(served.url, { waitUntil: 'load' });
        if (response === null || !response.ok()) {
          safetyFindings.add('browser-navigation-failed');
          for (const findings of behaviorByOutcome.values()) findings.add('required-page-unavailable');
        }
        if (input.manifest.entrySurface !== undefined) {
          await collectEntrySurfaceFindings(
            page,
            input.manifest.entrySurface,
            viewport,
            entrySurfaceFindings,
          );
          for (const finding of entrySurfaceFindings) accessFindings.add(finding);
          await collectInteractiveLabelFindings(page, viewport, accessFindings);
          const reset = await page.goto(served.url, { waitUntil: 'load' });
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
          if (observedUrl.origin !== new URL(served.url).origin) throw new Error('TRUSTED_BROWSER_CAPTURE_LEFT_PRODUCTION');
          const captureBytes = await page.screenshot({ fullPage: false });
          if (page.url() !== observedUrl.href) throw new Error('TRUSTED_BROWSER_CAPTURE_STATE_CHANGED');
          const captureSha256 = sha256(captureBytes);
          const capturePath = join(
            output,
            `${viewport.width}x${viewport.height}-${String(scriptIndex).padStart(2, '0')}-${sha256(Buffer.from(script.outcomeRef)).slice(0, 12)}-sha256-${captureSha256}.png`,
          );
          input.artifacts.write(capturePath, captureBytes);
          captures.push(Object.freeze({
            path: capturePath,
            sha256: captureSha256,
            width: viewport.width,
            height: viewport.height,
            outcomeRef: script.outcomeRef,
            // The ephemeral server port is not state; the actual post-action route/query/hash is.
            testedUrl: new URL(`${observedUrl.pathname}${observedUrl.search}${observedUrl.hash}`, 'http://127.0.0.1').href,
          }));
        }
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth);
        if (overflow) accessFindings.add(`horizontal-overflow:${viewport.width}x${viewport.height}`);
      } finally {
        await context.close();
      }
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
  const receipt: TrustedBrowserReceipt = Object.freeze({
    schema: TRUSTED_BROWSER_RECEIPT_SCHEMA,
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
    captures: Object.freeze(captures),
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
