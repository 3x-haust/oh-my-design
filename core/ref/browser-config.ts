import { existsSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { Browser, BrowserContext, BrowserType } from 'playwright';
import { browserProfilePath, readBrowserConsent, readUserBrowserConsent } from './browser-consent.ts';
import { userBrowserDoctor } from '../browser/setup.ts';
import type { UserBrowserDriver } from '../browser/contracts.ts';

export class ReferenceBrowserConfigError extends Error {
  readonly code = 'REFERENCE_BROWSER_CONFIG_INVALID';
  constructor(detail: string) { super(`REFERENCE_BROWSER_CONFIG_INVALID: ${detail}`); }
}

export type ReferenceBrowserConfig = Readonly<{
  mode: 'cdp' | 'stealth' | 'profile' | 'default'; cdpUrl?: string; executablePath?: string; storageState?: string;
  profilePath?: string;
}>;
export type BrowserConnector = Readonly<{
  connectOverCDP(url: string): Promise<Browser>;
  launch(options: Parameters<BrowserType['launch']>[0]): Promise<Browser>;
  launchPersistentContext?(path: string, options: Parameters<BrowserType['launchPersistentContext']>[1]): Promise<BrowserContext>;
}>;

export async function selectReferenceAcquisitionEngine(config: ReferenceBrowserConfig,
  options: { home?: string; driver?: UserBrowserDriver } = {}): Promise<'cdp' | 'custom-browser' | 'user-browser' | 'omd-profile' | 'headless'> {
  if (config.cdpUrl) return 'cdp';
  if (config.executablePath || config.storageState) return 'custom-browser';
  if (readUserBrowserConsent(options.home) === 'consented'
    && (await userBrowserDoctor(undefined, options.driver)).state === 'ready') return 'user-browser';
  return config.mode === 'profile' ? 'omd-profile' : 'headless';
}

export function readReferenceBrowserConfig(env: NodeJS.ProcessEnv = process.env, home?: string): ReferenceBrowserConfig {
  const cdpUrl = env.OMD_BROWSER_CDP_URL;
  const executablePath = env.OMD_STEALTH_BROWSER_PATH;
  const storageState = env.OMD_BROWSER_STORAGE_STATE;
  if (cdpUrl !== undefined) {
    try {
      const url = new URL(cdpUrl);
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error();
    } catch { throw new ReferenceBrowserConfigError('OMD_BROWSER_CDP_URL must be a valid Chromium CDP endpoint'); }
  }
  for (const [name, path] of [['OMD_STEALTH_BROWSER_PATH', executablePath], ['OMD_BROWSER_STORAGE_STATE', storageState]] as const) {
    if (path === undefined) continue;
    if (!path || !isAbsolute(path) || !existsSync(path) || !lstatSync(path).isFile())
      throw new ReferenceBrowserConfigError(`${name} must name an existing absolute regular file`);
  }
  const profilePath = browserProfilePath(home);
  const profile = cdpUrl === undefined && executablePath === undefined && storageState === undefined
    && readBrowserConsent(home) === 'consented' && existsSync(profilePath);
  return { mode: cdpUrl !== undefined ? 'cdp' : executablePath !== undefined ? 'stealth' : profile ? 'profile' : 'default',
    ...(profile ? { profilePath } : {}),
    ...(cdpUrl === undefined ? {} : { cdpUrl }), ...(executablePath === undefined ? {} : { executablePath }),
    ...(storageState === undefined ? {} : { storageState }) };
}
