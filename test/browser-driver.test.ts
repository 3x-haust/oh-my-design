import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { loadUserBrowserDriver, UserBrowserError } from '../core/browser/driver.ts';
import { userBrowserDoctor } from '../core/browser/setup.ts';

test('committed driver loads offline from its verified sibling bundle', async () => {
  const driver = await loadUserBrowserDriver();
  assert.equal(typeof driver.userBrowserBridgeDoctor, 'function');
  assert.equal(typeof driver.connectUserBrowserSession, 'function');
});
test('bundled driver and OMD code carry no upstream branding outside bridge protocols', async () => {
  const root = resolve(import.meta.dirname, '..');
  const forbidden = new RegExp(['omo' + 'wright', 'Browser' + 'Skill', 'bsk' + '(?=[A-Z])'].join('|'), 'gi');
  const protocol = [
    'com.omo' + 'wright.cloakbridge',
    'https://raw.githubusercontent.com/Tencent/Browser' + 'Skill/main/install.sh',
    'https://raw.githubusercontent.com/Tencent/Browser' + 'Skill/main/install.ps1',
    '/addons/detail/browser' + 'skill/',
  ];
  for (const name of ['index.js', 'page-bundle.js']) {
    const text = await readFile(resolve(root, 'vendor/omd-browser', name), 'utf8');
    const withoutHeaders = text.replace(/\/\*![\s\S]*?\*\/|\/\*[^]*?@license[^]*?\*\//g, '');
    const withoutProtocol = protocol.reduce((source, value) => source.replaceAll(value, ''), withoutHeaders);
    assert.equal(withoutProtocol.match(forbidden), null, `${name} includes upstream branding`);
  }
  for (const dir of ['core', 'bin', 'extensions', 'src', 'scripts']) {
    for (const entry of await readdir(resolve(root, dir), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const file = resolve(entry.parentPath, entry.name);
      const text = await readFile(file, 'utf8');
      assert.equal(text.match(forbidden), null, `${file} includes upstream branding`);
    }
  }
});

test('invalid override is reported without leaking dependency internals', async () => {
  await assert.rejects(loadUserBrowserDriver('/nonexistent/omd-browser-driver'),
    (error: unknown) => error instanceof UserBrowserError && error.code === 'driver-unavailable');
  assert.equal((await userBrowserDoctor(undefined, undefined)).state === 'driver-unavailable', false);
});
