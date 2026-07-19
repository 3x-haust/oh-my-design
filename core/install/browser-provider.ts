import { existsSync } from 'node:fs';
import {
  doctorBrowserRs,
  type BrowserRsDoctorDependencies,
  type BrowserRsHealth,
} from './browser-rs.ts';

export type PlaywrightFallbackHealth =
  | { readonly kind: 'ready'; readonly path: string }
  | { readonly kind: 'unhealthy'; readonly reason: 'module-missing' | 'chromium-missing'; readonly detail?: string };

export type PlaywrightFallback = () => Promise<PlaywrightFallbackHealth>;

export type BrowserProviderDoctorOptions = {
  readonly browser?: BrowserRsDoctorDependencies;
  readonly fallback?: PlaywrightFallback;
};

export type BrowserProviderHealth =
  | { readonly browser: Exclude<BrowserRsHealth, { readonly kind: 'unsupported' }>; readonly healthy: boolean }
  | { readonly browser: Extract<BrowserRsHealth, { readonly kind: 'unsupported' }>; readonly fallback: PlaywrightFallbackHealth; readonly healthy: boolean };

export async function doctorBrowserProvider(options: BrowserProviderDoctorOptions = {}): Promise<BrowserProviderHealth> {
  const browser = await doctorBrowserRs(options.browser);
  if (browser.kind !== 'unsupported') return { browser, healthy: browser.kind === 'healthy' };
  const fallback = await (options.fallback ?? playwrightFallback)();
  return { browser, fallback, healthy: fallback.kind === 'ready' };
}

async function playwrightFallback(): Promise<PlaywrightFallbackHealth> { // no-excuse-ok: catch
  try {
    const { chromium } = await import('playwright');
    const path = chromium.executablePath();
    return existsSync(path)
      ? { kind: 'ready', path }
      : { kind: 'unhealthy', reason: 'chromium-missing', detail: path };
  } catch (error) {
    if (error instanceof Error) return { kind: 'unhealthy', reason: 'module-missing', detail: error.message };
    throw error;
  }
}
