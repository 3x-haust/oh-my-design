import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createReferenceAcquisitionSession } from '../core/ref/acquisition-session.ts';
import { extractStaticHtml } from '../core/ref/html-observation.ts';
import { readDomainObservation, DOMAIN_STATIC_FETCH_LIMITATIONS } from '../core/ref/domain-observation.ts';
import { readReferenceBrowserConfig } from '../core/ref/browser-config.ts';
import { browserProfilePath, readBrowserConsent, writeBrowserConsent, forgetBrowserConsent } from '../core/ref/browser-consent.ts';
import { launchBrowserProfileLogin, handoffBrowserChallenge } from '../core/ref/browser-profile.ts';
import { clearCheckboxChallenge } from '../core/ref/challenge-clearance.ts';
import { withBrowser } from '../core/render/index.ts';
import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import { discoveryFixture, PUBLIC_DIRECTORY, DOMAIN_ITEM } from './helpers/discovery-capture.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const html = `<html><head><meta charset="euc-kr"></head><body><nav>Site menu</nav><main><h1>복지 서비스 신청 안내</h1><p>${'신청 자격과 혜택 안내입니다. '.repeat(20)}</p><a href="${DOMAIN_ITEM}">신청 확인</a><p hidden>hidden secret</p><script>secret script</script></main></body></html>`;

test('static Korean HTML extraction filters hidden text and resolves labeled links', () => {
  const observed = extractStaticHtml(html, PUBLIC_DIRECTORY);
  assert.match(observed.taskText, /신청 자격/);
  assert.doesNotMatch(observed.observedText, /hidden secret|secret script/);
  assert.deepEqual(observed.linkLabels, [{ url: DOMAIN_ITEM, text: '신청 확인' }]);
});

test('static domain acquisition signs the existing observation without launching a browser', async t => {
  const root = discoveryFixture(t);
  let launched = false;
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    fetchDomain: async () => ({ kind: 'observation', finalUrl: PUBLIC_DIRECTORY, status: 200,
      observation: extractStaticHtml(html, PUBLIC_DIRECTORY) }),
    browserConnector: { connectOverCDP: async () => { launched = true; throw new Error('browser unexpectedly connected'); },
      launch: async () => { launched = true; throw new Error('browser unexpectedly launched'); } },
  });
  const receipt = await session.navigate(PUBLIC_DIRECTORY, 'domain', 'public-directory');
  assert.equal(launched, false);
  assert.equal(readDomainObservation(root, receipt).language, 'korean');
  assert.equal(JSON.parse((await import('node:fs')).readFileSync(join(root, receipt.capture.path), 'utf8')).limitations,
    DOMAIN_STATIC_FETCH_LIMITATIONS);
});

test('invalid browser settings reject; CDP takes precedence without exposing storage contents', t => {
  const root = discoveryFixture(t);
  const executable = join(root, 'chromium'); const state = join(root, 'state.json');
  writeFileSync(executable, 'binary'); writeFileSync(state, '{"cookies":[{"value":"private-token"}]}');
  assert.deepEqual(readReferenceBrowserConfig({ OMD_BROWSER_CDP_URL: 'http://127.0.0.1:9222',
    OMD_STEALTH_BROWSER_PATH: executable, OMD_BROWSER_STORAGE_STATE: state }).mode, 'cdp');
  assert.throws(() => readReferenceBrowserConfig({ OMD_STEALTH_BROWSER_PATH: '/missing/browser' }), /REFERENCE_BROWSER_CONFIG_INVALID/);
});

test('consent profile is selected only without advanced browser overrides; forget removes decision', t => {
  const home = discoveryFixture(t);
  writeBrowserConsent('consented', home);
  assert.equal(readBrowserConsent(home), 'consented');
  assert.equal(browserProfilePath(home), join(home, '.omd/browser-profile'));
  mkdirSync(browserProfilePath(home));
  assert.equal(readReferenceBrowserConfig({}, home).mode, 'profile');
  assert.equal(readReferenceBrowserConfig({ OMD_BROWSER_CDP_URL: 'http://127.0.0.1:9222' }, home).mode, 'cdp');
  forgetBrowserConsent(home);
  assert.equal(readBrowserConsent(home), null);
});

test('consented headless acquisition opens persistent profile with a protected proxy', async t => {
  const home = discoveryFixture(t); const profile = browserProfilePath(home);
  let opened = false; let closed = false;
  const context = { close: async () => { closed = true; } } as unknown as BrowserContext;
  await withBrowser(async browser => {
    assert.equal(await browser.newContext(), context);
    assert.equal(opened, true);
  }, undefined, { reference: true, config: { mode: 'profile', profilePath: profile },
    connector: { connectOverCDP: async () => { throw new Error('unexpected CDP'); },
      launch: async () => { throw new Error('unexpected ordinary launch'); },
      launchPersistentContext: async (path, options) => {
        assert.equal(path, profile); assert.match(String(options?.proxy?.server), /^http:\/\/127\.0\.0\.1:/);
        assert.equal(options?.headless, true); opened = true; return context;
      } } });
  assert.equal(closed, true);
});

test('headed profile launcher observes exact close event without timing waits', async t => {
  const home = discoveryFixture(t); const events = new EventEmitter();
  const context = Object.assign(events, {
    newPage: async () => ({ goto: async () => undefined }),
    close: async () => { events.emit('close'); },
  }) as unknown as BrowserContext;
  const setup = launchBrowserProfileLogin({ home, sites: [PUBLIC_DIRECTORY],
    launcher: { launchPersistentContext: async () => context } as unknown as typeof chromium });
  events.on('newListener', event => { if (event === 'close') queueMicrotask(() => events.emit('close')); });
  assert.equal(await setup, 'closed');
});

test('injected headed challenge handoff observes clearance on page load', async t => {
  const home = discoveryFixture(t); const contextEvents = new EventEmitter();
  const pageEvents = new EventEmitter(); let cleared = false;
  const page = Object.assign(pageEvents, { goto: async () => undefined }) as unknown as Page;
  const context = Object.assign(contextEvents, { newPage: async () => page,
    close: async () => { contextEvents.emit('close'); } }) as unknown as BrowserContext;
  pageEvents.on('newListener', event => { if (event === 'load') queueMicrotask(() => { cleared = true; pageEvents.emit('load'); }); });
  const pending = handoffBrowserChallenge({ home, url: PUBLIC_DIRECTORY, cleared: async () => cleared,
    launcher: { launchPersistentContext: async () => context } as unknown as typeof chromium });
  assert.equal(await pending, true);
});

test('local iframe checkbox challenge clears after click', async () => {
  await withBrowser(async browser => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ status: 200,
        contentType: 'text/html', body: `<input type="checkbox" onclick="parent.postMessage('cleared','*')">` }));
      await page.goto('about:blank');
      await page.setContent(`<h1 id="blocked">Just a moment</h1><script>addEventListener('message',()=>document.querySelector('#blocked').remove())</script><iframe src="https://challenges.cloudflare.com/turnstile/test"></iframe>`);
      assert.equal(await clearCheckboxChallenge(page, async () => await page.locator('#blocked').count() > 0), true);
    } finally { await context.close(); }
  });
});


