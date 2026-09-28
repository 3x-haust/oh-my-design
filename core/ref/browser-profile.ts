import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BrowserContext, BrowserType, Page } from 'playwright';
import { browserProfilePath } from './browser-consent.ts';
import { publicDiscoveryUrl } from './discovery-record.ts';

export type PersistentLauncher = Pick<BrowserType, 'launchPersistentContext'>;
export async function launchBrowserProfileLogin(input: Readonly<{
  sites: readonly string[]; signal?: AbortSignal; timeoutMs?: number; home?: string; launcher?: PersistentLauncher;
}>): Promise<'closed' | 'timeout' | 'cancelled'> {
  const { chromium } = await import('playwright');
  const path = browserProfilePath(input.home);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const context = await (input.launcher ?? chromium).launchPersistentContext(path, { headless: false });
  try {
    for (const site of input.sites) {
      const page = await context.newPage();
      await page.goto(publicDiscoveryUrl(site), { waitUntil: 'domcontentloaded', timeout: 20_000 });
    }
    return await new Promise<'closed' | 'timeout' | 'cancelled'>(resolve => {
      let done = false;
      const finish = (result: 'closed' | 'timeout' | 'cancelled') => {
        if (done) return; done = true;
        clearTimeout(timer); input.signal?.removeEventListener('abort', cancel);
        context.off('close', closed);
        resolve(result);
      };
      const closed = () => finish('closed');
      const cancel = () => finish('cancelled');
      const timer = setTimeout(() => finish('timeout'), input.timeoutMs ?? 600_000);
      context.once('close', closed);
      input.signal?.addEventListener('abort', cancel, { once: true });
      if (input.signal?.aborted) cancel();
    });
  } finally { await context.close(); }
}

export async function loginWallDetected(page: Pick<Page, 'locator'>): Promise<boolean> {
  return await page.locator('input[type="password"]').first().isVisible().catch(() => false);
}

/** Hand off an exact challenged URL to a headed profile; user closes the window after clearance. */
export async function handoffBrowserChallenge(input: Readonly<{
  url: string; cleared: (page: Page) => Promise<boolean>; signal?: AbortSignal; timeoutMs?: number;
  home?: string; launcher?: PersistentLauncher;
}>): Promise<boolean> {
  const { chromium } = await import('playwright');
  const path = browserProfilePath(input.home);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const context: BrowserContext = await (input.launcher ?? chromium).launchPersistentContext(path, { headless: false });
  try {
    const page = await context.newPage();
    await page.goto(publicDiscoveryUrl(input.url), { waitUntil: 'domcontentloaded', timeout: 20_000 });
    if (await input.cleared(page)) return true;
    return await new Promise<boolean>(resolve => {
      let done = false;
      const finish = (value: boolean) => {
        if (done) return; done = true;
        clearTimeout(timer); context.off('close', check); page.off('load', check);
        input.signal?.removeEventListener('abort', cancel); resolve(value);
      };
      const check = () => { void input.cleared(page).then(finish).catch(() => finish(false)); };
      const cancel = () => finish(false);
      const timer = setTimeout(() => finish(false), input.timeoutMs ?? 120_000);
      context.on('close', check); page.on('load', check);
      input.signal?.addEventListener('abort', cancel, { once: true });
      if (input.signal?.aborted) cancel();
    });
  } finally { await context.close(); }
}
