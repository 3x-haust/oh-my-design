import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { browserRsMcpLauncher } from '../core/install/browser-rs-mcp-main.ts';
import { chromeWithoutCodeSignClone } from '../core/install/chrome-code-sign-clone.ts';

const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].find(existsSync);

test('browser-rs launches Chrome through a wrapper that switches off the app-bundle copy, unless the user chose the browser', {
  skip: process.platform !== 'darwin' || chrome === undefined ? 'needs Chrome on macOS' : false,
}, t => {
  const home = mkdtempSync(join(tmpdir(), 'omd-chrome-clone-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const environment = chromeWithoutCodeSignClone({ HOME: home, PATH: '/usr/bin' });
  const wrapper = join(home, '.local/share/oh-my-design/browser-rs/chrome-without-code-sign-clone');
  assert.equal(environment.AB_CHROME, wrapper);
  assert.equal(environment.PATH, '/usr/bin');
  const script = readFileSync(wrapper, 'utf8');
  assert.match(script, /^#!\/bin\/sh\n/);
  assert.ok(script.includes(`exec '${chrome!.replace(/'/g, "'\\''")}' --disable-features=MacAppCodeSignClone "$@"`), script);
  // Executable by the user who runs browser-rs (the umask decides the rest).
  assert.equal(statSync(wrapper).mode & 0o100, 0o100);
  // A second launch reuses the same wrapper.
  assert.equal(chromeWithoutCodeSignClone({ HOME: home }).AB_CHROME, wrapper);
  // A browser the user names, or one browser-rs attaches to, is theirs.
  assert.equal(chromeWithoutCodeSignClone({ HOME: home, AB_CHROME: '/opt/chrome' }).AB_CHROME, '/opt/chrome');
  assert.equal(chromeWithoutCodeSignClone({ HOME: home, AB_CONNECT: '9222' }).AB_CHROME, undefined);
});

test('the standalone MCP launcher hands browser-rs the clone-free Chrome environment', () => {
  const launcher = browserRsMcpLauncher([], 'v0.0.0', 'receipt-v1');
  assert.match(launcher, /function chromeWithoutCodeSignClone\(environment\)/);
  assert.match(launcher, /environment: chromeWithoutCodeSignClone\(environment\)/);
  assert.doesNotThrow(() => new Function(launcher.replace(/main\(\)\.catch[\s\S]*$/, '')));
});
