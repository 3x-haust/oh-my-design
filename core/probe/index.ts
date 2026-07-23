import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type ProjectWriteAdapter, requireProjectWriteAdapter } from '../runtime/project-write.ts';
import { pathToFileURL } from 'node:url';

type Expectation =
  | { type: 'visible' | 'hidden'; selector: string }
  | { type: 'text'; selector: string; value: string }
  | { type: 'url'; value: string }
  | { type: 'attribute'; selector: string; name: string; value: string };
type Step = { action: 'click' | 'fill' | 'press'; selector?: string; value?: string; key?: string; expect?: Expectation[] };
export interface ProbePlan {
  name: string;
  destructive: false;
  expectedTabOrder?: string[];
  steps: Step[];
}
export interface ProbeWarning { id: 'PROBE-TAB-DISORDER' | 'PROBE-DEAD-CONTROL'; severity: 'warn'; message: string }
export interface ProbeResult {
  name: string;
  target: string;
  viewport: { width: number; height: number };
  steps: Array<{
    action: 'click' | 'fill' | 'press';
    selector?: string;
    key?: string;
    ok: boolean;
    expectations: Array<{ type: Expectation['type']; selector?: string; name?: string; value?: string; ok: boolean }>;
  }>;
  warnings: ProbeWarning[];
  tabOrder?: string[];
}

const PRESS_KEYS = new Set([
  'Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
]);
const CREDENTIAL_SELECTOR = /password|token|secret|credential|auth/i;

function localUrl(target: string): string {
  if (!/^https?:\/\//.test(target)) {
    const path = resolve(target);
    if (!existsSync(path)) throw new Error(`no such page: ${target}`);
    return pathToFileURL(path).href;
  }
  const url = new URL(target);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('probe refuses remote targets');
  if (url.username || url.password) throw new Error('probe refuses authenticated targets');
  return url.href;
}

export function validateProbePlan(input: unknown): ProbePlan {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('probe plan requires name, destructive:false, and steps[]');
  }
  const raw = input as Record<string, unknown>;
  if (typeof raw['name'] !== 'string' || !raw['name'].trim() || raw['destructive'] !== false || !Array.isArray(raw['steps'])) {
    throw new Error('probe plan requires name, destructive:false, and steps[]');
  }
  const planKeys = new Set(['name', 'destructive', 'expectedTabOrder', 'steps']);
  if (Object.keys(raw).some((key) => !planKeys.has(key))) {
    throw new Error('probe refuses authenticated plans');
  }
  const tabOrder = raw['expectedTabOrder'];
  if (tabOrder !== undefined && (!Array.isArray(tabOrder) || tabOrder.some((s) => typeof s !== 'string' || !s.trim()))) {
    throw new Error('expectedTabOrder must contain selectors');
  }
  for (const value of raw['steps']) validateProbeStep(value);
  return input as ProbePlan;
}

/** Validate one probe expectation (visible/hidden/text/url/attribute) with its closed field shape. */
export function validateProbeExpectation(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('unsupported probe expectation');
  const exp = value as Record<string, unknown>;
  const type = exp['type'];
  if (typeof type !== 'string' || !['visible', 'hidden', 'text', 'url', 'attribute'].includes(type)) {
    throw new Error('unsupported probe expectation');
  }
  const allowed = type === 'url' ? ['type', 'value']
    : type === 'attribute' ? ['type', 'selector', 'name', 'value']
      : type === 'text' ? ['type', 'selector', 'value'] : ['type', 'selector'];
  if (Object.keys(exp).some((key) => !allowed.includes(key))) throw new Error('invalid probe expectation fields');
  if (type !== 'url' && (typeof exp['selector'] !== 'string' || !exp['selector'].trim())) throw new Error('expectation requires selector');
  if (['text', 'url', 'attribute'].includes(type) && (typeof exp['value'] !== 'string' || (type !== 'attribute' && !exp['value']))) throw new Error('expectation requires value');
  if (type === 'attribute' && (typeof exp['name'] !== 'string' || !exp['name'].trim())) throw new Error('attribute expectation requires name');
}

/** Validate one probe step (click/fill/press) with its security constraints and declared expectations. */
export function validateProbeStep(value: unknown): void {
  const step = value as Record<string, unknown>;
  if (!step || typeof step !== 'object' || Object.keys(step).some((key) => !['action', 'selector', 'value', 'key', 'expect'].includes(key))) {
    throw new Error('probe step contains unsupported or authenticated fields');
  }
  const action = step['action'];
  if (typeof action !== 'string' || !['click', 'fill', 'press'].includes(action)) throw new Error(`unsafe probe action: ${String(action)}`);
  const selector = step['selector'];
  if (action !== 'press' && (typeof selector !== 'string' || !selector.trim())) throw new Error(`${action} requires selector`);
  if (selector !== undefined && (typeof selector !== 'string' || !selector.trim())) throw new Error('probe selector must be non-empty');
  if (action === 'click' && (step['value'] !== undefined || step['key'] !== undefined)) throw new Error('click contains unsupported fields');
  if (action === 'fill') {
    if (typeof step['value'] !== 'string' || !step['value'] || CREDENTIAL_SELECTOR.test(String(selector))) {
      throw new Error('probe refuses credential or empty fills');
    }
    if (step['key'] !== undefined) throw new Error('fill contains unsupported fields');
  }
  if (action === 'press') {
    if (typeof step['key'] !== 'string' || !PRESS_KEYS.has(step['key'])) throw new Error('press key is not in the safe navigation/activation allowlist');
    if (step['value'] !== undefined) throw new Error('press contains unsupported fields');
  }
  const expects = step['expect'];
  if (!Array.isArray(expects) || expects.length === 0) throw new Error('every probe action requires at least one declared expectation');
  for (const exp of expects) validateProbeExpectation(exp);
}

export function readProbePlan(path: string): ProbePlan {
  return validateProbePlan(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}

async function checkExpectation(page: import('playwright').Page, exp: Expectation): Promise<boolean> {
  if (exp.type === 'url') return page.url().includes(exp.value);
  const el = page.locator(exp.selector).first();
  if (exp.type === 'visible') return el.isVisible().catch(() => false);
  if (exp.type === 'hidden') return el.isHidden().catch(() => false);
  if (exp.type === 'text') return (await el.textContent().catch(() => null))?.includes(exp.value) ?? false;
  if (exp.type === 'attribute') {
    const actual = exp.name === 'value'
      ? await el.inputValue().catch(() => null)
      : await el.getAttribute(exp.name).catch(() => null);
    return actual === exp.value;
  }
  return false;
}

export async function runProbe(target: string, plan: ProbePlan, viewport = { width: 390, height: 844 }): Promise<ProbeResult> {
  const validated = validateProbePlan(plan);
  const url = localUrl(target);
  const { chromium } = await import('playwright');
  // Always headless — OMD never opens a visible browser window in any situation.
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: 'networkidle' });
    const result: ProbeResult = { name: validated.name, target: url, viewport: { ...viewport }, steps: [], warnings: [] };

    if (validated.expectedTabOrder) {
      const actual: string[] = [];
      const matches: boolean[] = [];
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      for (let i = 0; i < validated.expectedTabOrder.length; i += 1) {
        await page.keyboard.press('Tab');
        const observed = await page.evaluate((expected) => {
          const el = document.activeElement as HTMLElement | null;
          const label = el?.id ? `#${el.id}` : el?.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : el?.tagName.toLowerCase() ?? '';
          return { label, matches: el?.matches(expected) ?? false };
        }, validated.expectedTabOrder[i]!);
        actual.push(observed.label);
        matches.push(observed.matches);
      }
      result.tabOrder = actual;
      if (matches.some((match) => !match)) {
        result.warnings.push({ id: 'PROBE-TAB-DISORDER', severity: 'warn', message: `expected ${validated.expectedTabOrder.join(' -> ')}, got ${actual.join(' -> ')}` });
      }
    }

    for (const step of validated.steps) {
      let actionOk = true;
      try {
        if (step.action === 'click') await page.locator(step.selector!).click();
        else if (step.action === 'fill') await page.locator(step.selector!).fill(step.value!);
        else if (step.selector) await page.locator(step.selector).press(step.key!);
        else await page.keyboard.press(step.key!);
      } catch { actionOk = false; }
      const expectations: ProbeResult['steps'][number]['expectations'] = [];
      for (const exp of step.expect ?? []) {
        expectations.push({ ...exp, ok: await checkExpectation(page, exp) });
      }
      result.steps.push({ action: step.action, ...(step.selector ? { selector: step.selector } : {}), ...(step.key ? { key: step.key } : {}), ok: actionOk, expectations });
      if (step.expect?.length && (!actionOk || expectations.some((expectation) => !expectation.ok))) {
        result.warnings.push({ id: 'PROBE-DEAD-CONTROL', severity: 'warn', message: `${step.action} failed a declared expectation` });
      }
    }
    return result;
  } finally {
    await browser.close();
  }
}

export function writeProbeResult(
  cwd: string,
  relativePath: string,
  result: ProbeResult,
  adapter: ProjectWriteAdapter,
): string {
  return requireProjectWriteAdapter(cwd, adapter)
    .write(relativePath, `${JSON.stringify(result, null, 2)}\n`);
}
