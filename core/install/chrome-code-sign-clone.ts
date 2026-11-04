import { createRequire } from 'node:module';

/**
 * Google Chrome on macOS copies its whole app bundle (about 1.8 GB) into
 * $TMPDIR/../X/com.google.Chrome.code_sign_clone at every launch, so an update cannot replace the bundle under a running
 * browser, and leaves the copy behind when it is stopped by a signal. Every browser-rs session and smoke check launches
 * Chrome and every one ends with a signal, so the copies piled up to 246 GB in a week and filled the disk. browser-rs
 * passes no --disable-features of its own, so OMD points AB_CHROME at a wrapper that launches the same Chrome with the
 * clone switched off. A browser the user names through AB_CHROME, or attaches with AB_CONNECT, is left as it is.
 *
 * Inlined into the standalone MCP launcher as source; loaded below for the TypeScript callers.
 */
export const CHROME_WITHOUT_CODE_SIGN_CLONE = String.raw`
function chromeWithoutCodeSignClone(environment) {
  const { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
  const { join } = require('node:path');
  if (process.platform !== 'darwin' || environment.AB_CHROME || environment.AB_CONNECT || !environment.HOME) return environment;
  const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    .find((path) => existsSync(path));
  if (chrome === undefined) return environment;
  const directory = join(environment.HOME, '.local', 'share', 'oh-my-design', 'browser-rs');
  const wrapper = join(directory, 'chrome-without-code-sign-clone');
  const script = '#!/bin/sh\n# Launches Chrome without the app-bundle copy it makes at every start and leaves behind when signalled.\n'
    + "exec '" + chrome.replace(/'/g, "'\\''") + "' --disable-features=MacAppCodeSignClone \"$@\"\n";
  try {
    if (!existsSync(wrapper) || readFileSync(wrapper, 'utf8') !== script) {
      mkdirSync(directory, { recursive: true });
      const staged = wrapper + '.' + process.pid;
      writeFileSync(staged, script, { mode: 0o755 });
      renameSync(staged, wrapper);
    }
    return { ...environment, AB_CHROME: wrapper };
  } catch { return environment; }
}
`;

type Environment = Readonly<Record<string, string | undefined>>;

/** The environment for a browser-rs process, with AB_CHROME set to the clone-free Chrome wrapper on macOS. */
export const chromeWithoutCodeSignClone: (environment: Environment) => Environment = new Function('require', 'process',
  `${CHROME_WITHOUT_CODE_SIGN_CLONE}\nreturn chromeWithoutCodeSignClone;`)(createRequire(import.meta.url), process);
