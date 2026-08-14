import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
  TRUSTED_BROWSER_RECEIPT_SCHEMA,
  trustedBrowserReceiptSha256,
  type TrustedBrowserCapture,
  type TrustedBrowserReceipt,
} from '../core/runtime/trusted-browser-receipt.ts';
import type { TrustedLifecycleManifest } from '../core/runtime/trusted-evaluation-contract.ts';
import { serveProjectEntry } from '../core/render/serve.ts';

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
  Object.freeze({ width: 1280, height: 900 }),
  Object.freeze({ width: 390, height: 844 }),
]);

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

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
        await page.keyboard.press('Tab');
        const focusable = page.locator('button, [href], input, select, textarea, [tabindex]').first();
        const focused = await focusable.count() > 0
          && await focusable.evaluate((element) => element === document.activeElement).catch(() => false);
        if (!focused) accessFindings.add(`keyboard-focus-missing:${viewport.width}x${viewport.height}`);
        for (const script of input.manifest.scripts) {
          const findings = behaviorByOutcome.get(script.outcomeRef);
          if (findings === undefined) {
            safetyFindings.add('browser-outcome-binding-missing');
            continue;
          }
          // Attach each visible-state waiter before triggering actions, but convert rejection to a
          // measured boolean immediately so a fast timeout can never become an unhandled rejection.
          const initiallyVisible = await Promise.all(script.assertions.map((assertion) =>
            assertion.kind === 'visible-text'
              ? page.locator(assertion.selector).filter({ hasText: assertion.text })
                .isVisible().catch(() => false)
              : false));
          const signals = script.assertions.map((assertion) =>
            assertion.kind === 'visible-text'
              ? page.locator(assertion.selector).filter({ hasText: assertion.text })
                .waitFor({ state: 'visible', timeout: 2_000 })
                .then(() => true, () => false)
              : undefined);
          for (const action of script.actions) {
            actionLog.push(`click ${action.selector} @ ${viewport.width}x${viewport.height}`);
            transcript.push(`action-click:${sha256(Buffer.from(action.selector))}`);
            try {
              await page.locator(action.selector).click({ timeout: 2_000 });
            } catch {
              findings.add('required-action-unavailable');
            }
          }
          for (const [index, assertion] of script.assertions.entries()) {
            const passed = assertion.kind === 'visible-text'
              ? await signals[index] && (script.actions.length === 0 || !initiallyVisible[index])
              : !await page.locator(assertion.selector).filter({ hasText: assertion.text })
                .isVisible().catch(() => false);
            if (passed) {
              transcript.push(`assertion-pass:${sha256(Buffer.from(`${assertion.selector}\0${assertion.text}`))}`);
            } else {
              findings.add(assertion.kind === 'visible-text' && initiallyVisible[index]
                && script.actions.length > 0
                ? 'required-state-transition-missing'
                : 'required-visible-result-missing');
              transcript.push(`assertion-fail:${sha256(Buffer.from(`${assertion.selector}\0${assertion.text}`))}`);
            }
          }
        }
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth);
        if (overflow) accessFindings.add(`horizontal-overflow:${viewport.width}x${viewport.height}`);
        const capturePath = join(output, `${viewport.width}x${viewport.height}.png`);
        const captureBytes = await page.screenshot({ fullPage: false });
        input.artifacts.write(capturePath, captureBytes);
        captures.push(Object.freeze({
          path: capturePath,
          sha256: sha256(captureBytes),
          width: viewport.width,
          height: viewport.height,
        }));
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
  const receipt: TrustedBrowserReceipt = Object.freeze({
    schema: TRUSTED_BROWSER_RECEIPT_SCHEMA,
    runId: input.binding.runId,
    routeSha256: input.binding.routeSha256,
    sourceContractSha256: input.binding.sourceContractSha256,
    activationBuildSha256: input.binding.activationBuildSha256,
    productionRevisionSha256: input.binding.productionRevisionSha256,
    productionPath: input.binding.productionPath,
    testedUrl: served.url,
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
