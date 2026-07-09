import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractInPage } from '../ir/dom.ts';
import type { RawIr } from '../types.ts';

const MAX_NODES = 4000;

export interface Viewport { width: number; height: number }

function toUrl(target: string): string {
  if (/^https?:\/\//.test(target)) return target;
  const path = resolve(target);
  if (!existsSync(path)) throw new Error(`no such page: ${target}`);
  return pathToFileURL(path).href;
}

async function withPage<T>(target: string, viewport: Viewport, fn: (page: import('playwright').Page) => Promise<T>): Promise<T> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(toUrl(target), { waitUntil: 'networkidle' });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export function parseViewport(s = '390x844'): Viewport {
  const [width, height] = s.split('x').map(Number);
  if (!width || !height) throw new Error(`bad viewport: ${s}`);
  return { width, height };
}

export function renderPage(target: string, opts: { viewport: Viewport; out: string }): Promise<string> {
  return withPage(target, opts.viewport, async (page) => {
    await page.screenshot({ path: opts.out, fullPage: true });
    return opts.out;
  });
}

export function extractIr(target: string, opts: { viewport: Viewport; selector?: string | null }): Promise<RawIr> {
  // Node strips the types, so toString() yields runnable JS for the browser.
  return withPage(target, opts.viewport, (page) =>
    page.evaluate(`(${extractInPage.toString()})(${MAX_NODES}, ${JSON.stringify(opts.selector ?? null)})`) as Promise<RawIr>);
}
