import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type BrowserConsent = 'consented' | 'skipped-this-run' | 'never-ask';
export const browserProfilePath = (home = homedir()): string => join(home, '.omd', 'browser-profile');
export const browserConsentPath = (home = homedir()): string => join(home, '.omd', 'browser-consent.json');

export function readBrowserConsent(home = homedir()): BrowserConsent | null {
  let contents: string;
  try { contents = readFileSync(browserConsentPath(home), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  const value: unknown = JSON.parse(contents);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid browser consent record');
  if ((value as { schema?: unknown }).schema === 2) {
    if (Object.keys(value).length !== 3 || ['schema', 'profile', 'userBrowser'].some(key => !Object.hasOwn(value, key)))
      throw new Error('invalid browser consent record');
    const row = value as { profile?: unknown; userBrowser?: unknown };
    if (!['consented', 'skipped-this-run', 'never-ask', null].includes(row.profile as null)
      || !['consented', 'skipped-this-run', 'never-ask', null].includes(row.userBrowser as null))
      throw new Error('invalid browser consent record');
    return row.profile as BrowserConsent | null;
  }
  if (Object.keys(value).length !== 1 || !Object.hasOwn(value, 'decision')) throw new Error('invalid browser consent record');
  const decision = (value as { decision: unknown }).decision;
  if (decision !== 'consented' && decision !== 'skipped-this-run' && decision !== 'never-ask')
    throw new Error('invalid browser consent decision');
  return decision;
}
export function writeBrowserConsent(decision: BrowserConsent, home = homedir()): void {
  if (!['consented', 'skipped-this-run', 'never-ask'].includes(decision)) throw new Error('invalid browser consent decision');
  const path = browserConsentPath(home);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  const userBrowser = readUserBrowserConsent(home);
  try { writeFileSync(temporary, JSON.stringify({ schema: 2, profile: decision, userBrowser }) + '\n',
    { mode: 0o600, flag: 'wx' }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
export function readUserBrowserConsent(home = homedir()): BrowserConsent | null {
  let value: unknown;
  try { value = JSON.parse(readFileSync(browserConsentPath(home), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  if (!value || typeof value !== 'object' || (value as { schema?: unknown }).schema !== 2) return null;
  readBrowserConsent(home); // Validate the complete versioned record before granting user-browser access.
  return (value as { userBrowser: BrowserConsent | null }).userBrowser;
}
export function writeUserBrowserConsent(decision: BrowserConsent, home = homedir()): void {
  const profile = readBrowserConsent(home);
  if (!['consented', 'skipped-this-run', 'never-ask'].includes(decision)) throw new Error('invalid browser consent decision');
  const path = browserConsentPath(home);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  try { writeFileSync(temporary, JSON.stringify({ schema: 2, profile, userBrowser: decision }) + '\n',
    { mode: 0o600, flag: 'wx' }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
export function clearBrowserSessionSkip(home = homedir()): void {
  const profile = readBrowserConsent(home);
  const userBrowser = readUserBrowserConsent(home);
  if (profile !== 'skipped-this-run' && userBrowser !== 'skipped-this-run') return;
  const nextProfile = profile === 'skipped-this-run' ? null : profile;
  const nextUserBrowser = userBrowser === 'skipped-this-run' ? null : userBrowser;
  if (nextProfile === null && nextUserBrowser === null) { forgetBrowserConsent(home); return; }
  const path = browserConsentPath(home);
  const temporary = `${path}.${process.pid}.tmp`;
  try { writeFileSync(temporary, JSON.stringify({ schema: 2, profile: nextProfile, userBrowser: nextUserBrowser }) + '\n',
    { mode: 0o600, flag: 'wx' }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
export function forgetBrowserConsent(home = homedir()): void { rmSync(browserConsentPath(home), { force: true }); }
