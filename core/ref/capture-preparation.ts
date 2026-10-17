import type { Page } from 'playwright';
import { authorizeReferenceStateControl } from './browse/safety.ts';
import { browserCallback } from './browser-evaluation.ts';

export const CAPTURE_PREPARATION_SCHEMA = 'reference-capture-preparation-v1';
export type CapturePreparationAction = Readonly<{
  kind: 'click' | 'hover' | 'focus' | 'press-start';
  selector: string;
}>;
export type CapturePreparationAssertion = Readonly<{
  selector: string;
  state: 'visible' | 'hidden' | 'hovered' | 'focused' | 'focus-visible' | 'pressed' | 'expanded';
}>;
export interface CapturePreparation {
  schema: typeof CAPTURE_PREPARATION_SCHEMA;
  actions: CapturePreparationAction[];
  assertions: CapturePreparationAssertion[];
}
export interface CapturePreparationReceipt {
  schema: 'reference-capture-preparation-receipt-v1';
  executedActions: CapturePreparation['actions'];
  observations: Array<CapturePreparation['assertions'][number] & { passed: true }>;
  observedAt: string;
  viewport: { width: number; height: number };
  captureSha256: string | null;
  notMeasured: ['interaction-probe', 'motion-probe', 'energy-curve'];
}
const fail = (message: string): never => { throw new Error(`reference capture preparation: ${message}`); };
function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(`${label} must be an object`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some(key => !(key in result))) return fail(`${label} has unsupported or missing keys`);
  return result;
}
function selector(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 500 || /[\u0000-\u001f]/.test(value)) return fail('selector must be a non-empty selector of at most 500 characters');
  return value;
}
export function parseCapturePreparation(value: unknown): CapturePreparation {
  const input = record(value, ['schema', 'actions', 'assertions'], 'input');
  if (input.schema !== CAPTURE_PREPARATION_SCHEMA) return fail(`schema must be ${CAPTURE_PREPARATION_SCHEMA}`);
  // Empty actions observe an existing state without perturbing it; assertions remain mandatory.
  if (!Array.isArray(input.actions) || input.actions.length > 8) return fail('actions must contain 0 to 8 explicit state actions');
  if (!Array.isArray(input.assertions) || input.assertions.length < 1 || input.assertions.length > 8) return fail('assertions must contain 1 to 8 observations');
  return {
    schema: CAPTURE_PREPARATION_SCHEMA,
    actions: input.actions.map(value => {
      const action = record(value, ['kind', 'selector'], 'action');
      if (action.kind !== 'click' && action.kind !== 'hover'
        && action.kind !== 'focus' && action.kind !== 'press-start') {
        return fail('action kind must be click, hover, focus or press-start');
      }
      return { kind: action.kind, selector: selector(action.selector) };
    }),
    assertions: input.assertions.map(value => {
      const assertion = record(value, ['selector', 'state'], 'assertion');
      if (assertion.state !== 'visible' && assertion.state !== 'hidden'
        && assertion.state !== 'hovered' && assertion.state !== 'focused'
        && assertion.state !== 'focus-visible' && assertion.state !== 'pressed'
        && assertion.state !== 'expanded') {
        return fail('assertion state must be visible, hidden, hovered, focused, focus-visible, pressed or expanded');
      }
      return { selector: selector(assertion.selector), state: assertion.state };
    }),
  } satisfies CapturePreparation;
}

/** Observe only the named DOM visibility; this is not a proof of a state's full meaning. */
export async function observeCapturePreparation(page: Page, preparation: CapturePreparation): Promise<CapturePreparationReceipt['observations']> {
  const observations: CapturePreparationReceipt['observations'] = [];
  for (const assertion of preparation.assertions) {
    const target = page.locator(assertion.selector);
    // A visible assertion may name content mounted by ordinary asynchronous hydration.
    // Wait for that actual element before checking uniqueness; an immediate count of
    // zero otherwise rejects the state before the existing visibility wait can run.
    // Hidden assertions still require an existing element, so a typo cannot pass.
    if (assertion.state === 'visible') {
      try { await target.waitFor({ state: 'attached', timeout: 2000 }); }
      catch { return fail(`assertion ${assertion.selector} must identify exactly one existing element`); }
    }
    if (await target.count() !== 1) return fail(`assertion ${assertion.selector} must identify exactly one existing element`);
    if (assertion.state === 'visible' || assertion.state === 'hidden') {
      await target.waitFor({ state: assertion.state, timeout: 2000 });
      if (await target.count() !== 1 || await target.isVisible() !== (assertion.state === 'visible')) {
        return fail(`assertion ${assertion.selector} did not remain ${assertion.state}`);
      }
    } else {
      const passed = await target.evaluate(browserCallback((element: Element, expected: CapturePreparationAssertion['state']) => {
        if (expected === 'hovered') return element.matches(':hover');
        if (expected === 'focused') return element === document.activeElement;
        if (expected === 'focus-visible') return element.matches(':focus-visible');
        if (expected === 'pressed') return element.matches(':active') || element.getAttribute('aria-pressed') === 'true';
        return element.getAttribute('aria-expanded') === 'true';
      }), assertion.state);
      if (!passed) return fail(`assertion ${assertion.selector} did not remain ${assertion.state}`);
    }
    observations.push({ ...assertion, passed: true });
  }
  return observations;
}

async function authorizeStateAction(page: Page, action: CapturePreparationAction): Promise<void> {
  const control = page.locator(action.selector);
  if (await control.count() !== 1 || !await control.isVisible()) {
    return fail(`${action.kind} requires exactly one visible element`);
  }
  authorizeReferenceStateControl(await control.evaluate(browserCallback((element: Element) => {
    const html = element as HTMLElement;
    const formControl = element as HTMLButtonElement | HTMLInputElement;
    return {
      tag: element.tagName,
      type: 'type' in formControl ? String(formControl.type || '').toLowerCase() || null : null,
      label: `${html.innerText ?? ''} ${element.getAttribute('aria-label') ?? ''}`.trim(),
      href: element instanceof HTMLAnchorElement ? element.href : element.getAttribute('href'),
      download: element instanceof HTMLAnchorElement && element.hasAttribute('download'),
      formAction: element.getAttribute('formaction'),
    };
  })));
}

export async function prepareReferenceCapture(
  page: Page,
  preparation: CapturePreparation,
): Promise<Readonly<{
  executedActions: CapturePreparation['actions'];
  release: () => Promise<void>;
}>> {
  const executedActions: CapturePreparation['actions'] = [];
  let pressStarted = false;
  const release = async () => {
    if (pressStarted) {
      pressStarted = false;
      await page.mouse.move(0, 0);
      await page.mouse.up();
    }
  };
  try {
  for (const action of preparation.actions) {
    const control = page.locator(action.selector);
    await authorizeStateAction(page, action);
    if (action.kind === 'hover') {
      await control.hover({ timeout: 2000 });
      executedActions.push({ ...action });
      continue;
    }
    if (action.kind === 'focus') {
      await control.focus({ timeout: 2000 });
      executedActions.push({ ...action });
      continue;
    }
    if (action.kind === 'press-start') {
      if (pressStarted || action !== preparation.actions.at(-1)) return fail('press-start must be the sole final pointer-down action');
      const box = await control.boundingBox();
      if (box === null) return fail('press-start target must have a visible bounding box');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      pressStarted = true;
      executedActions.push({ ...action });
      continue;
    }
    const disclosure = control.and(page.locator('button[type="button"][aria-controls][aria-expanded]'));
    if (await control.count() !== 1 || await disclosure.count() !== 1) return fail('click requires exactly one explicit button[type=button] disclosure with aria-controls and aria-expanded');
    const expanded = await control.getAttribute('aria-expanded');
    if (expanded !== 'true' && expanded !== 'false') return fail('disclosure aria-expanded must be true or false');
    const controlledIds = (await control.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean);
    let observedControlledElement = false;
    for (const assertion of preparation.assertions) {
      const target = page.locator(assertion.selector);
      if (await target.count() === 1 && controlledIds.includes(await target.getAttribute('id') ?? '')) observedControlledElement = true;
    }
    if (!observedControlledElement) return fail('each disclosure must control an element named by an assertion');
    await control.click({ timeout: 2000 });
    executedActions.push({ ...action });
  }
  await observeCapturePreparation(page, preparation);
  return {
    executedActions,
    release,
  };
  } catch (error) {
    await release();
    throw error;
  }
}
