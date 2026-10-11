import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { UserBrowserDriver, UserBrowserSession } from './contracts.ts';

export class UserBrowserError extends Error {
  readonly code: 'driver-unavailable' | 'driver-incompatible' | 'bridge-failure';
  constructor(code: 'driver-unavailable' | 'driver-incompatible' | 'bridge-failure', detail: string) {
    super(`OMD Browser ${code}: ${detail}`);
    this.code = code;
  }
}
const bundled = resolve(dirname(fileURLToPath(import.meta.url)), '../../vendor/omd-browser');
export async function loadUserBrowserDriver(path = process.env.OMD_BROWSER_DRIVER_PATH): Promise<UserBrowserDriver> {
  const directory = path === undefined ? bundled : path;
  if (!isAbsolute(directory)) throw new UserBrowserError('driver-unavailable', 'driver override must be an absolute directory');
  try {
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    if (manifest.schema !== 1 || manifest.component !== 'omd-browser') throw new Error('invalid manifest');
    for (const name of ['index.js', 'page-bundle.js']) {
      const bytes = await readFile(join(directory, name));
      if (createHash('sha256').update(bytes).digest('hex') !== manifest.files[name]) throw new Error(`${name} digest mismatch`);
    }
    const driver: unknown = await import(pathToFileURL(join(directory, 'index.js')).href);
    if (!driver || typeof driver !== 'object' || ['connectUserBrowserSession', 'userBrowserBridgeDoctor', 'userBrowserBridgeOnboard'].some(key =>
      typeof (driver as Record<string, unknown>)[key] !== 'function')) throw new UserBrowserError('driver-incompatible', 'required browser capabilities missing');
    return driver as UserBrowserDriver;
  } catch (error) {
    if (error instanceof UserBrowserError) throw error;
    throw new UserBrowserError('driver-unavailable', error instanceof Error && /digest mismatch/.test(error.message)
      ? 'bundle integrity check failed' : 'bundle cannot be loaded');
  }
}
export async function connectUserBrowser(name: string, driver?: UserBrowserDriver): Promise<UserBrowserSession> {
  try {
    const session = await (driver ?? await loadUserBrowserDriver()).connectUserBrowserSession({ name, focused: false });
    if (!session || ['navigate', 'resize', 'evaluate', 'screenshot', 'requestHelp', 'stop'].some(key =>
      typeof session[key as keyof UserBrowserSession] !== 'function')) throw new UserBrowserError('driver-incompatible', 'session capabilities missing');
    return session;
  } catch (error) {
    if (error instanceof UserBrowserError) throw error;
    throw new UserBrowserError('bridge-failure', 'could not connect to the user browser');
  }
}
