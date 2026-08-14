import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bridgeGlobals, detectAppShell, renderTargetHint } from '../core/stack/shell.ts';
import { computeStack } from '../core/stack/index.ts';
import { requiresHttpOrigin, resolveRenderTarget } from '../core/render/serve.ts';

function project(pkg: object, files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-shell-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const electronPkg = {
  name: 'tenuis',
  scripts: { dev: 'electron-vite dev', build: 'electron-vite build' },
  dependencies: { react: '^19.2.0', 'styled-components': '^6.4.4' },
  devDependencies: { electron: '^43.2.0', 'electron-vite': '^5.0.0', vite: '^7.0.0' },
};

// The observed failure: an Electron app is React under the hood, so the loop called it a web
// project and went looking for a website to test.
test('an electron-vite project is a desktop shell, not a plain react web project', () => {
  const root = project(electronPkg, { 'electron.vite.config.ts': 'export default {}\n' });
  const shell = detectAppShell(root);
  assert.equal(shell.kind, 'electron');
  assert.ok(shell.evidence.some((entry) => entry.includes('electron-vite')));
  assert.ok(shell.evidence.includes('electron.vite.config.ts'));
  assert.equal(shell.devUrl, 'http://localhost:5173');
  assert.equal(shell.builtEntry, 'out/renderer/index.html');
  assert.equal(shell.devCommand, 'npm run dev');
  assert.equal(shell.buildCommand, 'npm run build');
  // the stack decision still says "existing react project" — the shell is what was missing
  const stack = computeStack(root);
  assert.equal(stack.framework, 'react');
  assert.equal(stack.shell.kind, 'electron');
});

test('the renderer target names a servable URL and a buildable entry', () => {
  const root = project(electronPkg, { 'electron.vite.config.ts': 'export default {}\n' });
  const hint = renderTargetHint(detectAppShell(root));
  assert.match(hint, /http:\/\/localhost:5173/);
  assert.match(hint, /out\/renderer\/index\.html/);
  assert.match(hint, /build it with `npm run build` first/);
});

test('a configured renderer port is read rather than assumed', () => {
  const root = project(electronPkg, {
    'electron.vite.config.ts': 'export default { renderer: { server: { port: 4310 } } }\n',
  });
  assert.equal(detectAppShell(root).devUrl, 'http://localhost:4310');
});

// Every one of these has been chased on a desktop run that had no website to chase them on.
test('a desktop shell names the web-only checks that cannot apply', () => {
  const shell = detectAppShell(project(electronPkg));
  const listed = shell.inapplicableChecks.join('\n');
  assert.match(listed, /omd no-js/);
  assert.match(listed, /omd award/);
  assert.match(listed, /SEO/);
  assert.match(listed, /separate "web version" surface/);
});

test('a tauri project is a desktop shell with its own default port', () => {
  const root = project({
    name: 'app',
    scripts: { dev: 'tauri dev', build: 'tauri build' },
    devDependencies: { '@tauri-apps/cli': '^2.0.0' },
  });
  mkdirSync(join(root, 'src-tauri'), { recursive: true });
  const shell = detectAppShell(root);
  assert.equal(shell.kind, 'tauri');
  assert.equal(shell.devUrl, 'http://localhost:1420');
});

test('an ordinary web project keeps the browser shell and every web check', () => {
  const shell = detectAppShell(project({ name: 'site', dependencies: { react: '^19.0.0' } }));
  assert.equal(shell.kind, 'browser');
  assert.deepEqual([...shell.inapplicableChecks], []);
  assert.equal(shell.devUrl, null);
  assert.equal(renderTargetHint(shell), 'render the page or route directly');
});

// The exact silent failure: a built entry rendered from file:// is a blank white screenshot,
// because Chromium refuses ES modules over an opaque origin.
test('a built application entry is served over loopback, not opened as file://', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-serve-'));
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(join(root, 'assets', 'app.js'), 'document.title = "booted";\n');
  writeFileSync(join(root, 'index.html'), '<!doctype html><html><head><script type="module" crossorigin src="./assets/app.js"></script></head><body><div id="root"></div></body></html>');

  const resolved = await resolveRenderTarget(join(root, 'index.html'));
  try {
    assert.match(resolved.url, /^http:\/\/127\.0\.0\.1:\d+\/index\.html$/);
    const origin = new URL(resolved.url).origin;
    const served = await fetch(`${origin}/assets/app.js`);
    assert.equal(served.status, 200);
    const escaped = await fetch(`${origin}/../../etc/passwd`);
    assert.ok(escaped.status === 403 || escaped.status === 404, `traversal returned ${escaped.status}`);
  } finally {
    await resolved.close();
  }
});

test('a plain fixture keeps the cheap file:// path', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-serve-plain-'));
  writeFileSync(join(root, 'fixture.html'), '<!doctype html><html><body><h1>fixture</h1></body></html>');
  const resolved = await resolveRenderTarget(join(root, 'fixture.html'));
  assert.match(resolved.url, /^file:\/\//);
  await resolved.close();
  assert.equal(requiresHttpOrigin('<html><script src="a.js"></script></html>'), false);
  assert.equal(requiresHttpOrigin('<html><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></html>'), true);
});

// A boot error from the missing preload bridge is the harness, not a design defect.
test('the preload bridge globals are read from the built preload', () => {
  const root = project(electronPkg);
  mkdirSync(join(root, 'out', 'preload'), { recursive: true });
  writeFileSync(join(root, 'out', 'preload', 'index.js'), 'contextBridge.exposeInMainWorld("tenuis", api);\n');
  assert.deepEqual([...bridgeGlobals(root, detectAppShell(root))], ['tenuis']);
  const web = project({ name: 'site' });
  assert.deepEqual([...bridgeGlobals(web, detectAppShell(web))], []);
});

// Senpi keeps no plugin cache, so the Codex uninstall path removed none of its OMD install and
// still reported success.
test('uninstalling Senpi removes its skills, roles, pack, and host contract only', async () => {
  const { uninstall } = await import('../core/install/install.ts');
  const home = mkdtempSync(join(tmpdir(), 'omd-senpi-home-'));
  mkdirSync(join(home, 'skills', 'omd-ultradesign'), { recursive: true });
  mkdirSync(join(home, 'skills', 'my-own-skill'), { recursive: true });
  mkdirSync(join(home, 'omd-agents'), { recursive: true });
  mkdirSync(join(home, 'omd-pack', 'theory'), { recursive: true });
  writeFileSync(join(home, 'omd-agents', 'omd-hand.md'), 'role');
  writeFileSync(join(home, 'omd-host.json'), '{}');
  writeFileSync(join(home, 'settings.json'), '{"keep":true}');

  const changes = uninstall([{ host: 'senpi', home }], { keepBrowser: true });
  assert.equal(existsSync(join(home, 'skills', 'omd-ultradesign')), false);
  assert.equal(existsSync(join(home, 'omd-agents')), false);
  assert.equal(existsSync(join(home, 'omd-pack')), false);
  assert.equal(existsSync(join(home, 'omd-host.json')), false);
  // the user's own skill and settings survive, and a scoped uninstall keeps the shared browser
  assert.equal(existsSync(join(home, 'skills', 'my-own-skill')), true);
  assert.equal(readFileSync(join(home, 'settings.json'), 'utf8'), '{"keep":true}');
  assert.ok(changes.some((line) => /browser-rs: kept/.test(line)), changes.join('\n'));
});
