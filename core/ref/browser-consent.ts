import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type BrowserConsent = 'consented' | 'skipped-this-run' | 'never-ask';
export type BrowserInterpretation = Readonly<{ questionDigest: string; userText: string; agentInterpretation: 'user-browser' | 'omd-profile' | 'skipped-this-run' | 'never-ask' }>;
export type BrowserAnswerReceipt = Pick<BrowserInterpretation, 'questionDigest' | 'userText'>;
function answerReceipt(home: string): BrowserAnswerReceipt | undefined {
  try { return (JSON.parse(readFileSync(browserConsentPath(home), 'utf8')) as { answerReceipt?: BrowserAnswerReceipt }).answerReceipt; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
export function readBrowserAnswerReceipt(home = homedir()): BrowserAnswerReceipt | undefined {
  readBrowserConsent(home);
  return answerReceipt(home);
}
export function writeBrowserAnswerReceipt(value: BrowserAnswerReceipt, home = homedir()): void {
  if (!/^[a-f0-9]{64}$/.test(value.questionDigest) || !value.userText.trim()) throw new Error('invalid browser answer receipt');
  const profile = readBrowserConsent(home), userBrowser = readUserBrowserConsent(home);
  const path = browserConsentPath(home);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  try { writeFileSync(temporary, JSON.stringify({ schema: 2, profile, userBrowser, answerReceipt: value,
    ...(interpretation(home) ? { interpretation: interpretation(home) } : {}) }) + '\n', { mode: 0o600, flag: 'wx' }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
export function clearBrowserAnswerReceipt(home = homedir()): void {
  if (!answerReceipt(home)) return;
  const profile = readBrowserConsent(home), userBrowser = readUserBrowserConsent(home);
  const path = browserConsentPath(home);
  const temporary = `${path}.${process.pid}.tmp`;
  try { writeFileSync(temporary, JSON.stringify({ schema: 2, profile, userBrowser,
    ...(interpretation(home) ? { interpretation: interpretation(home) } : {}) }) + '\n', { mode: 0o600, flag: 'wx' }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
function interpretation(home: string): BrowserInterpretation | undefined {
  try { return (JSON.parse(readFileSync(browserConsentPath(home), 'utf8')) as { interpretation?: BrowserInterpretation }).interpretation; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
export function readBrowserInterpretation(home = homedir()): BrowserInterpretation | undefined {
  readBrowserConsent(home);
  return interpretation(home);
}
export function writeBrowserInterpretation(value: BrowserInterpretation, home = homedir()): void {
  if (!/^[a-f0-9]{64}$/.test(value.questionDigest) || !value.userText.trim()
    || !['user-browser', 'omd-profile', 'skipped-this-run', 'never-ask'].includes(value.agentInterpretation))
    throw new Error('invalid browser interpretation');
  const profile = readBrowserConsent(home), userBrowser = readUserBrowserConsent(home);
  const path = browserConsentPath(home);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  try { writeFileSync(temporary, JSON.stringify({ schema: 2, profile, userBrowser, interpretation: value }) + '\n',
    { mode: 0o600, flag: 'wx' }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
export const browserProfilePath = (home = homedir()): string => join(home, '.omd', 'browser-profile');
/** The consent/profile store is a user-level adapter, not a project-run writer. */
export function prepareBrowserProfile(home = homedir()): string {
  const path = browserProfilePath(home);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  return path;
}
export function forgetBrowserProfile(home = homedir()): void {
  rmSync(browserProfilePath(home), { recursive: true, force: true });
}
export const browserConsentPath = (home = homedir()): string => join(home, '.omd', 'browser-consent.json');

export function readBrowserConsent(home = homedir()): BrowserConsent | null {
  let contents: string;
  try { contents = readFileSync(browserConsentPath(home), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  const value: unknown = JSON.parse(contents);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid browser consent record');
  if ((value as { schema?: unknown }).schema === 2) {
    if (Object.keys(value).some(key => !['schema', 'profile', 'userBrowser', 'interpretation', 'answerReceipt'].includes(key))
      || ['schema', 'profile', 'userBrowser'].some(key => !Object.hasOwn(value, key)))
      throw new Error('invalid browser consent record');
    const row = value as { profile?: unknown; userBrowser?: unknown };
    if (!['consented', 'skipped-this-run', 'never-ask', null].includes(row.profile as null)
      || !['consented', 'skipped-this-run', 'never-ask', null].includes(row.userBrowser as null))
      throw new Error('invalid browser consent record');
    if (Object.hasOwn(value, 'answerReceipt')) {
      const receipt = (value as { answerReceipt: BrowserAnswerReceipt }).answerReceipt;
      if (!receipt || typeof receipt !== 'object' || Object.keys(receipt).length !== 2
        || typeof receipt.questionDigest !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.questionDigest)
        || typeof receipt.userText !== 'string' || !receipt.userText.trim()) throw new Error('invalid browser consent record');
    }
    if (Object.hasOwn(value, 'interpretation')) {
      const evidence = (value as { interpretation: BrowserInterpretation }).interpretation;
      if (!evidence || typeof evidence !== 'object' || Object.keys(evidence).length !== 3
        || !/^[a-f0-9]{64}$/.test(evidence.questionDigest) || typeof evidence.userText !== 'string' || !evidence.userText.trim()
        || !['user-browser', 'omd-profile', 'skipped-this-run', 'never-ask'].includes(evidence.agentInterpretation))
        throw new Error('invalid browser consent record');
    }
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
  try { writeFileSync(temporary, JSON.stringify({ schema: 2, profile: decision, userBrowser, ...(interpretation(home) ? { interpretation: interpretation(home) } : {}),
    ...(answerReceipt(home) ? { answerReceipt: answerReceipt(home) } : {}) }) + '\n',
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
  try { writeFileSync(temporary, JSON.stringify({ schema: 2, profile, userBrowser: decision, ...(interpretation(home) ? { interpretation: interpretation(home) } : {}),
    ...(answerReceipt(home) ? { answerReceipt: answerReceipt(home) } : {}) }) + '\n',
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
