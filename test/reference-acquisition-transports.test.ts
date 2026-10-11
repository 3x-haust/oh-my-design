import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReferenceAcquisitionSession } from '../core/ref/acquisition-session.ts';
import { addRefsBatch } from '../core/ref/batch.ts';
import { loadRefs } from '../core/ref/store.ts';
import { extractStaticHtml } from '../core/ref/html-observation.ts';
import { readDomainObservation, DOMAIN_STATIC_FETCH_LIMITATIONS } from '../core/ref/domain-observation.ts';
import { readReferenceBrowserConfig } from '../core/ref/browser-config.ts';
import { browserProfilePath, readBrowserConsent, writeBrowserConsent, forgetBrowserConsent, writeUserBrowserConsent } from '../core/ref/browser-consent.ts';
import { launchBrowserProfileLogin, handoffBrowserChallenge, profileLoginResult } from '../core/ref/browser-profile.ts';
import { clearCheckboxChallenge } from '../core/ref/challenge-clearance.ts';
import { captureUserBrowserPageForRef, withBrowser } from '../core/render/index.ts';
import { EventEmitter } from 'node:events';
import type { BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { discoveryFixture, PUBLIC_DIRECTORY, DOMAIN_ITEM } from './helpers/discovery-capture.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import type { UserBrowserDriver, UserBrowserSession } from '../core/browser/contracts.ts';

const html = `<html><head><meta charset="euc-kr"></head><body><nav>Site menu</nav><main><h1>복지 서비스 신청 안내</h1><p>${'신청 자격과 혜택 안내입니다. '.repeat(20)}</p><a href="${DOMAIN_ITEM}">신청 확인</a><p hidden>hidden secret</p><script>secret script</script></main></body></html>`;

test('ordinary selected user-browser img retains its original and rejects ambiguous or replaced images', async t => {
  const original = PNG.sync.write(new PNG({ width: 1280, height: 960 }));
  const source = 'https://example.com/original.png';
  const markup = `<main><h1>Public product documentation</h1>
    <p>${'A public description of the original image. '.repeat(12)}</p>
    <img id="screen" src="${source}" style="width:160px;height:120px"></main>`;
  let body = markup;
  let afterExtract: (() => Promise<void>) | undefined;
  await withBrowser(async browser => {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    try {
      await page.route('https://example.com/**', route => route.fulfill(route.request().url() === source
        ? { contentType: 'image/png', body: original }
        : { contentType: 'text/html', body }));
      const session: UserBrowserSession = {
        navigate: async url => { await page.goto(url); },
        resize: async () => { throw new Error('window resize forbidden'); },
        emulate: async ({ overrides }) => { await page.setViewportSize(overrides); },
        evaluate: async expression => {
          const value = await page.evaluate(expression);
          if (expression.includes('function extractInPage')) await afterExtract?.();
          return { ok: true, value };
        },
        screenshot: async options => {
          const buffer = await page.screenshot({ fullPage: 'fullPage' in options });
          return { buffer, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
        },
        requestHelp: async () => { throw new Error('unexpected handoff'); },
        stop: async () => {},
      };
      const driver: UserBrowserDriver = {
        connectUserBrowserSession: async () => session,
        userBrowserBridgeDoctor: async () => ({ ready: true, cli: { installed: true },
          daemon: { running: true }, identification: { needsChoice: false, candidates: [] },
          primary: { id: 'aside', label: 'Aside' }, browsers: [{}] }),
        userBrowserBridgeOnboard: async () => { throw new Error('unexpected onboarding'); },
      };
      const captured = await captureUserBrowserPageForRef('https://example.com/', { width: 1280, height: 900 },
        { selector: '#screen', shot: true, viewportShot: true, driver,
          lookup: async () => [{ address: '93.184.215.14', family: 4 }] });
      assert.equal(createHash('sha256').update(captured.shotBytes!).digest('hex'),
        createHash('sha256').update(original).digest('hex'));
      assert.equal(captured.acquisition.sourceImage, source);
      assert.deepEqual(captured.acquisition.imageDimensions, { width: 1280, height: 960 });
      assert.equal(captured.acquisition.sourceImageSha256,
        createHash('sha256').update(original).digest('hex'));
      assert.equal(captured.acquisition.captureMethod, 'full-page');
      body = markup.replace(`src="${source}"`, `loading="lazy" data-src="${source}"`)
        .replace('width:160px;height:120px', 'width:160px;height:120px;margin-top:5000px')
        + `<script>new IntersectionObserver((entries, observer) => {
          for (const entry of entries) if (entry.isIntersecting) {
            entry.target.src = entry.target.dataset.src;
            observer.disconnect();
          }
        }).observe(document.querySelector('#screen'));</script>`;
      const lazy = await captureUserBrowserPageForRef('https://example.com/', { width: 1280, height: 900 },
        { selector: '#screen', shot: true, requireImageElement: true, driver,
          lookup: async () => [{ address: '93.184.215.14', family: 4 }] });
      assert.equal(lazy.acquisition.sourceImage, source);
      assert.equal(createHash('sha256').update(lazy.shotBytes!).digest('hex'),
        createHash('sha256').update(original).digest('hex'));
      body = markup;
      const gallery = await captureUserBrowserPageForRef('https://example.com/', { width: 1280, height: 900 },
        { selector: '#screen', shot: true, viewportShot: true, requireImageElement: true, driver,
          lookup: async () => [{ address: '93.184.215.14', family: 4 }] });
      assert.equal(gallery.acquisition.sourceImage, source);
      await assert.rejects(captureUserBrowserPageForRef('https://example.com/', { width: 1280, height: 900 },
        { selector: '#screen', shot: false, requireImageElement: true, driver,
          lookup: async () => [{ address: '93.184.215.14', family: 4 }] }),
      /DESIGN_GALLERY_IMAGE_REQUIRED/);
      const root = discoveryFixture(t);
      writeUserBrowserConsent('consented', root);
      const batchOptions = { rulesRoot: fileURLToPath(new URL('../core/rules/builtin', import.meta.url)),
        browserConfig: { mode: 'default' as const }, consentHome: root, explicitUserBrowser: true,
        userBrowserDriver: driver, userBrowserLookup: async () => [{ address: '93.184.215.14', family: 4 }] };
      const spec = { source: 'https://example.com/', as: 'screen', lane: 'design' as const, fromUser: true,
        selector: '#screen', shot: true, energy: false };
      const adapter = createTestProjectWriteAdapter(root);
      const batch = await addRefsBatch(root, [spec], batchOptions, adapter);
      assert.equal(batch.outcomes[0]?.ok, true, batch.outcomes[0]?.error ?? 'reference capture failed');
      const reference = loadRefs(root)[0];
      assert.ok(reference?.imagePath);
      assert.equal(reference.kind, 'image');
      assert.equal(reference.acquisition?.sourceImage, source);
      assert.equal(createHash('sha256').update(readFileSync(join(root, reference.imagePath))).digest('hex'),
        createHash('sha256').update(original).digest('hex'));
      const options = { selector: '#screen', shot: true, viewportShot: true, driver,
        lookup: async () => [{ address: '93.184.215.14', family: 4 }] };
      body = markup.replace('id="screen"', 'class="screen"').replace('</main>',
        `<img class="screen" src="${source}" style="width:160px;height:120px"></main>`);
      await assert.rejects(captureUserBrowserPageForRef('https://example.com/', { width: 1280, height: 900 },
        { ...options, selector: 'img' }), /DESIGN_IMAGE_SELECTOR_AMBIGUOUS/);
      body = markup;
      afterExtract = async () => { await page.evaluate(() => {
        const image = document.querySelector('#screen');
        image?.replaceWith(image.cloneNode(true));
      }); };
      await assert.rejects(captureUserBrowserPageForRef('https://example.com/', { width: 1280, height: 900 },
        options), /DESIGN_IMAGE_CHANGED/);
      const refused = await addRefsBatch(root, [{ ...spec, as: 'replaced' }], batchOptions, adapter);
      assert.equal(refused.outcomes[0]?.ok, false);
      assert.match(refused.outcomes[0]?.error ?? '', /DESIGN_IMAGE_CHANGED/);
      assert.equal(loadRefs(root).length, 1, 'replaced image never publishes a second reference');
      afterExtract = undefined;
      await assert.rejects(captureUserBrowserPageForRef('https://example.com/', { width: 1280, height: 900 },
        { ...options, selector: 'main', requireImageElement: true }), /DESIGN_GALLERY_IMAGE_REQUIRED/);
    } finally { await context.close(); }
  });
});

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

test('the real Playwright launcher retains its context when using a consented profile', async t => {
  const home = discoveryFixture(t); const profile = browserProfilePath(home);
  await withBrowser(async browser => {
    const context = await browser.newContext();
    const page = await context.newPage();
    assert.deepEqual(page.viewportSize(), { width: 1280, height: 900 });
    assert.equal(await page.evaluate(() => document.title), '');
    const alternate = await browser.newPage({ viewport: { width: 960, height: 720 } });
    assert.deepEqual(alternate.viewportSize(), { width: 960, height: 720 });
    await alternate.close();
  }, undefined, { reference: true, config: { mode: 'profile', profilePath: profile } });
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

test('unattended headed profile timeout is reported without treating window cleanup as a human close', async t => {
  const home = discoveryFixture(t); const events = new EventEmitter(); let cleanup = false;
  const context = Object.assign(events, {
    newPage: async () => ({ goto: async () => undefined }),
    close: async () => { cleanup = true; events.emit('close'); },
  }) as unknown as BrowserContext;
  const outcome = await launchBrowserProfileLogin({ home, sites: [PUBLIC_DIRECTORY], timeoutMs: 1,
    launcher: { launchPersistentContext: async () => context } as unknown as typeof chromium });
  assert.equal(outcome, 'timeout');
  assert.deepEqual(profileLoginResult(outcome), { exitCode: 0,
    limitation: 'No human completed the dedicated login window; continue public research without assuming a logged-in profile.' });
  assert.equal(profileLoginResult('cancelled').exitCode, 1);
  assert.equal(cleanup, true);
  assert.equal(readBrowserConsent(home), null);
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


