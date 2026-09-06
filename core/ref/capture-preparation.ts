import type { Page } from 'playwright';

export const CAPTURE_PREPARATION_SCHEMA = 'reference-capture-preparation-v1';
export interface CapturePreparation {
  schema: typeof CAPTURE_PREPARATION_SCHEMA;
  actions: Array<{ kind: 'click'; selector: string }>;
  assertions: Array<{ selector: string; state: 'visible' | 'hidden' }>;
}
export interface CapturePreparationReceipt {
  schema: 'reference-capture-preparation-receipt-v1';
  executedActions: CapturePreparation['actions'];
  observations: Array<CapturePreparation['assertions'][number] & { passed: true }>;
  observedAt: string;
  viewport: { width: number; height: number };
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
  if (!Array.isArray(input.actions) || input.actions.length < 1 || input.actions.length > 8) return fail('actions must contain 1 to 8 explicit disclosure clicks');
  if (!Array.isArray(input.assertions) || input.assertions.length < 1 || input.assertions.length > 8) return fail('assertions must contain 1 to 8 observations');
  return {
    schema: CAPTURE_PREPARATION_SCHEMA,
    actions: input.actions.map(value => {
      const action = record(value, ['kind', 'selector'], 'action');
      if (action.kind !== 'click') return fail('only disclosure-button click is supported');
      return { kind: 'click', selector: selector(action.selector) };
    }),
    assertions: input.assertions.map(value => {
      const assertion = record(value, ['selector', 'state'], 'assertion');
      if (assertion.state !== 'visible' && assertion.state !== 'hidden') return fail('assertion state must be visible or hidden');
      return { selector: selector(assertion.selector), state: assertion.state };
    }),
  };
}

/** Observe only the named DOM visibility; this is not a proof of a state's full meaning. */
export async function observeCapturePreparation(page: Page, preparation: CapturePreparation): Promise<CapturePreparationReceipt['observations']> {
  const observations: CapturePreparationReceipt['observations'] = [];
  for (const assertion of preparation.assertions) {
    const target = page.locator(assertion.selector);
    if (await target.count() !== 1) return fail(`assertion ${assertion.selector} must identify exactly one existing element`);
    await target.waitFor({ state: assertion.state, timeout: 2000 });
    if (await target.count() !== 1 || await target.isVisible() !== (assertion.state === 'visible')) return fail(`assertion ${assertion.selector} did not remain ${assertion.state}`);
    observations.push({ ...assertion, passed: true });
  }
  return observations;
}

export async function prepareReferenceCapture(page: Page, preparation: CapturePreparation): Promise<CapturePreparation['actions']> {
  const executedActions: CapturePreparation['actions'] = [];
  for (const action of preparation.actions) {
    const control = page.locator(action.selector);
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
  return executedActions;
}
