import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Google Chrome on macOS copies its whole app bundle into $TMPDIR/../X/com.google.Chrome.code_sign_clone at every
 * launch, so an update cannot replace the bundle under a running browser, and leaves the copy behind when it is stopped
 * by a signal. Every browser-rs session and smoke check launches Chrome and every one ends with a signal, so 140 copies
 * piled up in a week. browser-rs passes no --disable-features of its own, so OMD points AB_CHROME at a wrapper that
 * launches the same Chrome with the clone switched off. A browser the user names through AB_CHROME, or attaches with
 * AB_CONNECT, is left as it is.
 *
 * The installer writes the wrapper. The standalone MCP launcher only verifies it by digest before using it, so the
 * shell text never enters the plugin's MCP configuration.
 */
export const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
] as const;

type Environment = Readonly<Record<string, string | undefined>>;

export function chromeWrapperPath(home: string): string {
  return join(home, '.local', 'share', 'oh-my-design', 'browser-rs', 'chrome-without-code-sign-clone');
}

export function chromeWrapperScript(chrome: string): string {
  return '#!/bin/sh\n# Launches Chrome without the app-bundle copy it makes at every start and leaves behind when signalled.\n'
    + `exec '${chrome.replace(/'/g, "'\\''")}' --disable-features=MacAppCodeSignClone "$@"\n`;
}

const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Writes the wrapper for the installed Chrome on macOS; returns its path, or undefined when there is nothing to wrap. */
export function installChromeWithoutCodeSignClone(home: string, platform: string = process.platform): string | undefined {
  if (platform !== 'darwin') return undefined;
  const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (chrome === undefined) return undefined;
  const wrapper = chromeWrapperPath(home);
  const script = chromeWrapperScript(chrome);
  try {
    if (!existsSync(wrapper) || readFileSync(wrapper, 'utf8') !== script) {
      mkdirSync(join(wrapper, '..'), { recursive: true });
      const staged = `${wrapper}.${process.pid}`;
      writeFileSync(staged, script, { mode: 0o755 });
      renameSync(staged, wrapper);
    }
    return wrapper;
  } catch { return undefined; }
}

export function uninstallChromeWithoutCodeSignClone(home: string): void {
  rmSync(chromeWrapperPath(home), { force: true });
}

/** The environment for a browser-rs process OMD starts itself: installs the wrapper and points AB_CHROME at it. */
export function chromeWithoutCodeSignClone(environment: Environment): Environment {
  if (environment.AB_CHROME || environment.AB_CONNECT || !environment.HOME) return environment;
  const wrapper = installChromeWithoutCodeSignClone(environment.HOME);
  return wrapper === undefined ? environment : { ...environment, AB_CHROME: wrapper };
}

/** Inlined into the standalone MCP launcher: uses the installed wrapper only when its bytes are the expected script. */
export function chromeWithoutCodeSignCloneSource(): string {
  const expected = Object.fromEntries(CHROME_CANDIDATES.map((chrome) => [chrome, digest(chromeWrapperScript(chrome))]));
  return String.raw`
function chromeWithoutCodeSignClone(environment) {
  if (process.platform !== 'darwin' || environment.AB_CHROME || environment.AB_CONNECT || !environment.HOME) return environment;
  const expected = ${JSON.stringify(expected)};
  const chrome = Object.keys(expected).find((path) => executable(path));
  const wrapper = join(environment.HOME, '.local', 'share', 'oh-my-design', 'browser-rs', 'chrome-without-code-sign-clone');
  try {
    if (chrome === undefined || !executable(wrapper)) return environment;
    if (createHash('sha256').update(readFileSync(wrapper)).digest('hex') !== expected[chrome]) return environment;
    return { ...environment, AB_CHROME: wrapper };
  } catch { return environment; }
}
`;
}
