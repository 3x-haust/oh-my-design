import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserCallback } from '../ref/browser-evaluation.ts';
import { resolveRenderTarget } from '../render/serve.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { pageIdeaPreview } from './idea-image.ts';
import { besideImage } from './studio-look.ts';
import type { PageFinding } from './studio-page-check.ts';
import { STUDIO_DIR } from './studio-paths.ts';

/**
 * A product is many screens that must read as one hand, and a redesign is a product that already has users. Both are judged
 * across screens: a product by whether each role (page title, section title, body, primary button, field) is built the same
 * way everywhere, a redesign by whether everything the old screen let a person do is still there unless the ledger says it
 * was changed on purpose.
 */
export type ScreenRoles = Readonly<{
  title: string | null; sectionTitle: string | null; body: string | null; primary: string | null; field: string | null;
  controls: readonly string[]; routes: readonly string[]; sizes: readonly number[]; weights: readonly number[];
}>;

const measureScreen = browserCallback((): ScreenRoles => {
  const visible = (element: Element) => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const label = (element: Element) => (element.getAttribute('aria-label') ?? (element as HTMLInputElement).placeholder ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
  const type = (element: Element | undefined) => {
    if (element === undefined) return null;
    const style = getComputedStyle(element);
    return `${Math.round(parseFloat(style.fontSize))}px/${style.fontWeight}`;
  };
  const most = (values: readonly string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const texts = [...document.querySelectorAll('body *')].filter(visible).filter(element => [...element.childNodes].some(node => node.nodeType === 3 && (node.textContent ?? '').trim().length > 1));
  const paragraphs = texts.filter(element => (element.textContent ?? '').trim().length >= 40 && element.closest('button, a, h1, h2, h3') === null);
  const filled = [...document.querySelectorAll('button, a, [role="button"]')].filter(visible).filter(element => {
    const style = getComputedStyle(element), color = /rgba?\(([^)]+)\)/.exec(style.backgroundColor)?.[1]?.split(/[,/\s]+/).filter(Boolean).map(Number) ?? [];
    const spread = Math.max(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0) - Math.min(color[0] ?? 0, color[1] ?? 0, color[2] ?? 0);
    const dark = (color[0] ?? 255) + (color[1] ?? 255) + (color[2] ?? 255) < 240;
    return (color[3] ?? 1) > 0.9 && color.length >= 3 && (spread > 40 || dark) && element.getBoundingClientRect().height >= 24;
  });
  const anatomy = (element: Element) => {
    const style = getComputedStyle(element);
    return `${Math.round(element.getBoundingClientRect().height)}px tall, ${style.borderTopLeftRadius} radius, ${Math.round(parseFloat(style.fontSize))}px/${style.fontWeight}, ${style.backgroundColor}`;
  };
  const fields = [...document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="hidden"]), select, textarea')].filter(visible);
  const fieldAnatomy = (element: Element) => {
    const style = getComputedStyle(element);
    return `${element.tagName === 'TEXTAREA' ? 'area' : `${Math.round(element.getBoundingClientRect().height)}px tall`}, ${style.borderTopLeftRadius} radius, ${Math.round(parseFloat(style.fontSize))}px`;
  };
  const controls = [...document.querySelectorAll('button, [role="button"], input, select, textarea, a[href]')].filter(visible).map(label).filter(text => text.length > 0);
  const routes = [...document.querySelectorAll('a[href]')].filter(visible).map(anchor => { try { const url = new URL((anchor as HTMLAnchorElement).href); return url.origin === location.origin ? url.pathname : ''; } catch { return ''; } })
    .filter(path => path !== '' && path !== location.pathname);
  return {
    title: type([...document.querySelectorAll('h1')].filter(visible)[0]), sectionTitle: most([...document.querySelectorAll('h2')].filter(visible).map(element => type(element)!)),
    body: most(paragraphs.map(element => type(element)!)), primary: most(filled.map(anatomy)), field: most(fields.filter(element => element.tagName !== 'TEXTAREA').map(fieldAnatomy)),
    controls: [...new Set(controls)].slice(0, 120), routes: [...new Set(routes)].slice(0, 80),
    sizes: [...new Set(texts.map(element => Math.round(parseFloat(getComputedStyle(element).fontSize))))].sort((a, b) => a - b),
    weights: [...new Set(texts.map(element => Number(getComputedStyle(element).fontWeight)))].sort((a, b) => a - b),
  };
});

export type MeasuredScreen = Readonly<{ screen: string; roles: ScreenRoles; desktop: Buffer; mobile: Buffer; overflow: number }>;

/** Open each screen at desktop and phone width, shoot it and read how its roles are built. */
export async function measureScreens(targets: readonly string[]): Promise<readonly MeasuredScreen[]> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const screens: MeasuredScreen[] = [];
    for (const target of targets) {
      const resolved = await resolveRenderTarget(target);
      try {
        const shots: Buffer[] = [];
        let roles: ScreenRoles | null = null, overflow = 0;
        for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
          const page = await browser.newPage({ viewport: size });
          try {
            await page.goto(resolved.url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => undefined);
            await page.waitForTimeout(600);
            if (roles === null) roles = await page.evaluate(measureScreen);
            else overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
            shots.push(pageIdeaPreview(await page.screenshot({ fullPage: true }), size.width));
          } finally { await page.close(); }
        }
        screens.push({ screen: target, roles: roles!, desktop: shots[0]!, mobile: shots[1]!, overflow });
      } finally { await resolved.close(); }
    }
    return screens;
  } finally { await browser.close(); }
}

const ROLE_NAMES = { title: 'the page title', sectionTitle: 'section titles', body: 'body text', primary: 'the primary button', field: 'form fields' } as const;

/** One role built two ways on two screens, sizes or weights outside the system, a screen wider than a phone. */
export function screenFindings(screens: readonly Readonly<{ screen: string; roles: ScreenRoles; overflow: number }>[],
  system: Readonly<{ sizes: readonly number[]; weights: readonly number[] }> | null): readonly PageFinding[] {
  const findings: PageFinding[] = [];
  for (const role of Object.keys(ROLE_NAMES) as (keyof typeof ROLE_NAMES)[]) {
    const built = new Map<string, string[]>();
    for (const screen of screens) { const value = screen.roles[role]; if (value !== null) built.set(value, [...built.get(value) ?? [], screen.screen]); }
    if (built.size > 1) {
      findings.push({ tier: 'defect', id: 'role-styled-differently', viewport: 'desktop', message: `${ROLE_NAMES[role]} are built ${built.size} ways across screens (${[...built.entries()]
        .map(([value, where]) => `${value} on ${where.slice(0, 2).join(', ')}`).join(' / ')}): one component from the system file, used on every screen` });
    }
  }
  for (const screen of screens) {
    if (screen.overflow > 1) findings.push({ tier: 'defect', id: 'horizontal-overflow', viewport: 'mobile', message: `${screen.screen} scrolls sideways by ${screen.overflow}px on a phone: let tables scroll inside their own box and the rest wrap` });
    if (system === null) continue;
    const sizes = screen.roles.sizes.filter(size => !system.sizes.some(step => Math.abs(step - size) <= 1));
    const weights = screen.roles.weights.filter(weight => !system.weights.includes(weight));
    if (sizes.length > 0) findings.push({ tier: 'defect', id: 'off-system-type', viewport: 'desktop', message: `${screen.screen} sets type in ${sizes.join(', ')}px, outside the system's ${system.sizes.join('/')}` });
    if (weights.length > 0) findings.push({ tier: 'defect', id: 'off-system-type', viewport: 'desktop', message: `${screen.screen} uses weights ${weights.join(', ')}, outside the system's ${system.weights.join('/')}` });
  }
  return findings;
}

export const STUDIO_BASELINE_DIR = `${STUDIO_DIR}/baseline`;
export const STUDIO_LEDGER = `${STUDIO_DIR}/ledger.json`;
export const STUDIO_REDESIGN_DIR = `${STUDIO_DIR}/redesign`;

const slug = (target: string): string => {
  try { const url = new URL(target); return (url.pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home').toLowerCase(); }
  catch { return target.replace(/\.html?$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'home'; }
};
const routeOf = (target: string): string => { try { const url = new URL(target); return `${url.pathname}${url.search}`; } catch { return target; } };

export type BaselineScreen = Readonly<{ name: string; url: string; route: string; controls: readonly string[]; routes: readonly string[] }>;

/** Capture every existing screen before anything changes: the picture, what a person can do on it and where it leads. */
export async function captureBaseline(writer: ProjectWriteAdapter, targets: readonly string[]): Promise<readonly BaselineScreen[]> {
  const screens = await measureScreens(targets);
  return screens.map(screen => {
    const name = slug(screen.screen), dir = `${STUDIO_BASELINE_DIR}/${name}`;
    const record: BaselineScreen = { name, url: screen.screen, route: routeOf(screen.screen), controls: screen.roles.controls, routes: screen.roles.routes };
    writer.mkdir(dir);
    writer.write(`${dir}/desktop.png`, screen.desktop);
    writer.write(`${dir}/mobile.png`, screen.mobile);
    writer.write(`${dir}/screen.json`, `${JSON.stringify(record, null, 2)}\n`);
    return record;
  });
}

export function baselineScreens(root: string): readonly BaselineScreen[] {
  const base = join(root, STUDIO_BASELINE_DIR);
  if (!existsSync(base)) return [];
  return readdirSync(base).sort().flatMap(name => {
    try { return [JSON.parse(readFileSync(join(base, name, 'screen.json'), 'utf8')) as BaselineScreen]; } catch { return []; }
  });
}

export type RedesignLedger = Readonly<{ keep: readonly string[]; change: readonly Readonly<{ what: string; to: string; because: string }>[] }>;

export const STUDIO_LEDGER_GUIDANCE = `Write ${STUDIO_LEDGER} before changing a screen: {"keep": ["<what the product already owns: its mark, colours, the `
  + 'names people know, routes, behaviour, data contracts>", ...], "change": [{"what": "<the control, route or element being changed or removed, in the '
  + 'words the old screen uses>", "to": "<what replaces it>", "because": "<the problem it solves for the person using it>"}, ...]}. Everything a person '
  + 'could do on the old screen stays unless it is in "change".';

export function readLedger(root: string): RedesignLedger | null {
  const path = join(root, STUDIO_LEDGER);
  if (!existsSync(path)) return null;
  const invalid = (reason: string): never => { throw Object.assign(new Error(`STUDIO_LEDGER_INVALID: ${STUDIO_LEDGER} ${reason}. ${STUDIO_LEDGER_GUIDANCE}`), { code: 'STUDIO_LEDGER_INVALID' }); };
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { return invalid('is not JSON'); }
  const keep: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'keep') : undefined;
  const change: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'change') : undefined;
  if (!Array.isArray(keep) || keep.length === 0 || keep.some(item => typeof item !== 'string')) return invalid('needs "keep": what the product already owns');
  if (!Array.isArray(change)) return invalid('needs "change": a list, empty when nothing a person does is changed');
  const text = (item: unknown, name: string) => { const field: unknown = typeof item === 'object' && item !== null ? Reflect.get(item, name) : undefined; return typeof field === 'string' ? field.trim() : ''; };
  const changes = change.map(item => ({ what: text(item, 'what'), to: text(item, 'to'), because: text(item, 'because') }));
  if (changes.some(item => item.what.length < 2 || item.to.length < 2 || item.because.length < 12)) return invalid('needs every change as {"what", "to", "because"}');
  return { keep: keep as string[], change: changes };
}

const plain = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** What a person could do on the old screen and cannot on the new one, unless the ledger records the change. */
export function flowRegressions(before: BaselineScreen, after: Readonly<{ controls: readonly string[]; routes: readonly string[] }>, ledger: RedesignLedger): readonly PageFinding[] {
  const changed = ledger.change.map(item => plain(item.what)).filter(Boolean);
  const recorded = (text: string) => changed.some(what => plain(text).includes(what) || what.includes(plain(text)));
  const now = new Set(after.controls.map(plain));
  const lostControls = before.controls.filter(control => plain(control) !== '' && !now.has(plain(control)) && !recorded(control));
  const lostRoutes = before.routes.filter(route => !after.routes.includes(route) && !recorded(route));
  const findings: PageFinding[] = [];
  if (lostControls.length > 0) findings.push({ tier: 'defect', id: 'flow-regression', viewport: 'desktop', message: `${before.name}: controls on the old screen are gone ${lostControls.slice(0, 6)
    .map(text => `"${text}"`).join(', ')}: keep each, or record it in ${STUDIO_LEDGER} under "change" with what replaces it` });
  if (lostRoutes.length > 0) findings.push({ tier: 'defect', id: 'flow-regression', viewport: 'desktop', message: `${before.name}: the old screen led to ${lostRoutes.slice(0, 6).join(', ')} and the new one does not: `
    + `keep the way there, or record the change in ${STUDIO_LEDGER}` });
  return findings;
}

/** Shoot each baseline screen again at the same route, set old beside new, and name what a person can no longer do. */
export async function checkRedesign(root: string, writer: ProjectWriteAdapter, origin: string | null): Promise<Readonly<{ findings: readonly PageFinding[]; beside: readonly string[] }>> {
  const baseline = baselineScreens(root);
  if (baseline.length === 0) throw Object.assign(new Error('STUDIO_BASELINE_MISSING: no existing screen is captured. Run omd studio baseline <url> [<url> ...] on the '
    + 'product as it is, every screen the work touches, before changing it.'), { code: 'STUDIO_BASELINE_MISSING' });
  const ledger = readLedger(root);
  if (ledger === null) throw Object.assign(new Error(`STUDIO_LEDGER_MISSING: ${STUDIO_LEDGER_GUIDANCE}`), { code: 'STUDIO_LEDGER_MISSING' });
  const targets = baseline.map(screen => { if (origin === null) return screen.url; try { return new URL(screen.route, origin).href; } catch { return screen.url; } });
  const now = await measureScreens(targets);
  const findings: PageFinding[] = [], beside: string[] = [];
  writer.mkdir(STUDIO_REDESIGN_DIR);
  baseline.forEach((before, index) => {
    const after = now[index]!;
    for (const viewport of ['desktop', 'mobile'] as const) {
      const path = `${STUDIO_REDESIGN_DIR}/${before.name}-${viewport}.png`;
      writer.write(path, besideImage(readFileSync(join(root, STUDIO_BASELINE_DIR, before.name, `${viewport}.png`)), after[viewport], viewport === 'desktop' ? 900 : 390));
      beside.push(path);
    }
    findings.push(...flowRegressions(before, after.roles, ledger));
    if (after.overflow > 1) findings.push({ tier: 'defect', id: 'horizontal-overflow', viewport: 'mobile', message: `${before.name} scrolls sideways by ${after.overflow}px on a phone` });
  });
  findings.push(...screenFindings(now.map((screen, index) => ({ screen: baseline[index]!.name, roles: screen.roles, overflow: 0 })), null));
  return { findings, beside };
}
