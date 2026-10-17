import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { EventEmitter, once } from 'node:events';
import type { UserBrowserDriver, UserBrowserSession } from '../core/browser/contracts.ts';
import { createReferenceAcquisitionSession } from '../core/ref/acquisition-session.ts';
import { browserExpression } from '../core/ref/browser-evaluation.ts';
import { addRefsBatch } from '../core/ref/batch.ts';
import { loadRefs } from '../core/ref/store.ts';
import { inspectDesignReferenceAdmission } from '../core/ref/design-admission.ts';
import { captureUserBrowserPageForRef, withBrowser } from '../core/render/index.ts';
import { CAPTURE_PREPARATION_SCHEMA, type CapturePreparation } from '../core/ref/capture-preparation.ts';
import { observeUserBrowserPreparation } from '../core/ref/user-browser-preparation.ts';
import { cropUserBrowserPng } from '../core/ref/acquisition-png.ts';
import { readCurrentDiscoveryNavigation, readCurrentDirectDiscoveryEntry } from '../core/ref/discovery-record.ts';
import { readDomainObservation } from '../core/ref/domain-observation.ts';
import { readReferenceDiscoveryAttempt } from '../core/ref/navigation-capture.ts';
import { writeUserBrowserConsent } from '../core/ref/browser-consent.ts';
import { discoveryFixture, GALLERY_DIRECTORY, GALLERY_ITEM } from './helpers/discovery-capture.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const SOURCE = 'https://example.com/'; const LINK = 'https://example.com/item';
const lookup = async () => [{ address: '93.184.215.14', family: 4 }];
const png = (width = 2560, height = 1800) => PNG.sync.write(new PNG({ width, height }));
const state = (challenge = false) => ({ url: SOURCE, title: challenge ? 'Just a moment' : 'Example page',
  body: challenge ? 'Just a moment' : 'Visible public reference information. '.repeat(12),
  visibleText: 'Visible public reference information. '.repeat(12), taskText: 'Reference information',
  links: [LINK], linkLabels: [{ url: LINK, text: 'View item' }], viewport: { width: 1280, height: 900 },
  identity: 1234, loginOccludes: false });
function fake(options: { challenge?: boolean; login?: boolean; helpOutcome?: string; fail?: boolean;
  onStop?: () => void; onHelp?: () => void; onResize?: () => void; onEmulate?: (input: unknown) => void;
  onScreenshot?: (fullPage: boolean) => void;
  url?: string; link?: string; imageSelector?: string; oneX?: boolean; blank?: boolean; scrollbar?: boolean } = {}): UserBrowserDriver {
  let cleared = !options.challenge && !options.login;
  const session: UserBrowserSession = {
    resize: async () => { options.onResize?.(); }, navigate: async () => {},
    evaluate: async expression => options.fail ? { ok: false, error: 'never expose upstream error' }
      : { ok: true, value: expression === browserExpression('() => location.href') ? options.url ?? SOURCE
        : expression.includes('performance.timeOrigin') && expression.includes('linkLabels')
          ? { ...state(Boolean(options.challenge && !cleared)), loginOccludes: Boolean(options.login && !cleared),
            url: options.url ?? SOURCE, body: options.blank ? '' : state(Boolean(options.challenge && !cleared)).body,
            visibleText: options.blank ? '' : state(Boolean(options.challenge && !cleared)).visibleText,
            taskText: options.blank ? '' : state(Boolean(options.challenge && !cleared)).taskText,
            links: options.blank ? [] : [options.link ?? LINK],
            linkLabels: options.blank ? [] : [{ url: options.link ?? LINK, text: 'View item' }] }
          : expression.includes('const selectorFor = image') ? options.imageSelector
            ? [{ selector: options.imageSelector, width: 400, height: 300, naturalWidth: 800, naturalHeight: 600 }] : []
          : expression.includes('function extractInPage') ? { nodes: [], meta: {} }
            : expression.includes('document.documentElement.clientWidth')
              ? { dpr: options.oneX ? 1 : 2, clientWidth: options.scrollbar ? 1265 : 1280 }
            : expression.includes('devicePixelRatio') ? options.oneX ? 1 : 2
            : expression.includes('scrollIntoView') ? { x: 10, y: 10, width: 40, height: 20,
              viewport: { width: 1280, height: 900 }, url: SOURCE, identity: 1234 } : null },
    screenshot: async input => {
      options.onScreenshot?.('fullPage' in input);
      return { buffer: options.oneX ? png(1280, 900) : png(options.scrollbar ? 2530 : 2560),
        width: options.oneX ? 1280 : options.scrollbar ? 2530 : 2560, height: options.oneX ? 900 : 1800, format: 'png' };
    },
    requestHelp: async () => { options.onHelp?.(); cleared = true; return { outcome: options.helpOutcome ?? 'completed' }; },
    stop: async () => { options.onStop?.(); },
  };
  Object.assign(session, { emulate: async (input: unknown) => { options.onEmulate?.(input); } });
  return { connectUserBrowserSession: async input => { assert.equal(input.focused, false); return session; },
    userBrowserBridgeDoctor: async () => ({ ready: true, cli: { installed: true }, daemon: { running: true },
      identification: { needsChoice: false, candidates: [] }, primary: { id: 'aside', label: 'Aside' }, browsers: [{}] }),
    userBrowserBridgeOnboard: async () => { throw Error('unexpected install'); } };
}
test('browser operation and cleanup failures are both retained without reporting success', async () => {
  for (const operationFails of [true, false]) {
    const operationError = new Error('REFERENCE_CAPTURE_VISUAL_OBSTRUCTION');
    const cleanupError = new Error('CLEANUP_FAILURE');
    let disconnected = false;
    const connector = {
      connectOverCDP: chromium.connectOverCDP.bind(chromium),
      launch: async (options: Parameters<typeof chromium.launch>[0]) => {
        const browser = await chromium.launch(options);
        const close = browser.close.bind(browser);
        browser.once('disconnected', () => { disconnected = true; });
        browser.close = async () => { await close(); throw cleanupError; };
        return browser;
      },
    };
    await assert.rejects(withBrowser(async () => {
      if (operationFails) throw operationError;
      return 'completed-operation';
    }, undefined, { reference: true, config: { mode: 'default' }, connector }), error => {
      if (operationFails) {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [operationError, cleanupError]);
        assert.equal(error.cause, operationError);
        assert.match(error.message, /REFERENCE_CAPTURE_VISUAL_OBSTRUCTION/);
        assert.match(error.message, /CLEANUP_FAILURE/);
      } else assert.equal(error, cleanupError);
      return true;
    });
    assert.equal(disconnected, true);
  }
});

test('cleanup deadline preserves the rejected operation and the real cleanup timeout', async t => {
  const operationError = new Error('REFERENCE_CAPTURE_VISUAL_OBSTRUCTION');
  const lifecycle = new EventEmitter();
  const closing = once(lifecycle, 'closing', { signal: AbortSignal.timeout(15000) });
  let closeUnderlying: (() => Promise<void>) | undefined;
  const connector = {
    connectOverCDP: chromium.connectOverCDP.bind(chromium),
    launch: async (options: Parameters<typeof chromium.launch>[0]) => {
      const browser = await chromium.launch(options);
      closeUnderlying = browser.close.bind(browser);
      browser.close = async () => {
        lifecycle.emit('closing');
        return new Promise<void>(() => {});
      };
      return browser;
    },
  };
  const rejected = assert.rejects(withBrowser(async browser => {
    assert.ok(closeUnderlying);
    await closeUnderlying();
    assert.equal(browser.isConnected(), false);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    throw operationError;
  }, undefined, { reference: true, config: { mode: 'default' }, connector }), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, operationError);
    assert.equal(error.errors[0], operationError);
    assert.match(error.message, /REFERENCE_CAPTURE_VISUAL_OBSTRUCTION/);
    assert.match(error.message, /browser cleanup timed out after 5000ms/);
    return true;
  });
  try {
    await closing;
    t.mock.timers.tick(5000);
    await rejected;
  } finally { t.mock.timers.reset(); }
});

test('reference viewport uses explicit per-tab 2x emulation without resizing the browser window', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let windowResizes = 0;
  const emulations: unknown[] = [];
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    browserConfig: { mode: 'default' }, consentHome: root, explicitUserBrowser: true,
    userBrowserDriver: fake({ onResize: () => windowResizes++, onEmulate: input => emulations.push(input) }),
    userBrowserLookup: lookup,
  });
  await session.navigate(SOURCE, 'design');
  assert.equal(windowResizes, 0);
  assert.deepEqual(emulations, [{ overrides: { width: 1280, height: 900, device_scale_factor: 2, mobile: false } }]);
});
test('whole-page 2x capture accepts measured content width excluding a native scrollbar', async () => {
  const capture = await captureUserBrowserPageForRef(SOURCE, { width: 1280, height: 900 }, {
    shot: true, lookup, driver: fake({ scrollbar: true }),
  });
  assert.equal(capture.shotBytes?.readUInt32BE(16), 2530);
});
test('zero-action user-browser preparation observes real DOM before recording capture readiness', async () => {
  await withBrowser(async browser => {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const NativeObserver = MutationObserver;
      window.MutationObserver = class extends NativeObserver {
        override observe(...args: Parameters<MutationObserver['observe']>) {
          super.observe(...args); console.log('PREPARATION_OBSERVER_SUBSCRIBED');
        }
      };
    });
    await page.route(SOURCE, route => route.fulfill({ contentType: 'text/html',
      body: `<h1>Public task</h1><p>${'Visible public task information. '.repeat(12)}</p>` }));
    const session: UserBrowserSession = {
      navigate: async url => { await page.goto(url); },
      resize: async () => { throw new Error('window resize must not be used'); },
      emulate: async ({ overrides }) => { await page.setViewportSize(overrides); },
      evaluate: async expression => ({ ok: true, value: await page.evaluate(expression) }),
      screenshot: async options => {
        const buffer = await page.screenshot({ fullPage: 'fullPage' in options });
        return { buffer, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
      },
      requestHelp: async () => { throw new Error('unexpected help'); },
      stop: async () => { await context.close(); },
    };
    const driver = fake();
    const options = { shot: true, lookup, driver: { ...driver, connectUserBrowserSession: async () => session },
      preparation: { schema: CAPTURE_PREPARATION_SCHEMA, actions: [],
        assertions: [{ selector: '#visitors', state: 'visible' }] } satisfies CapturePreparation };
    const subscribed = page.waitForEvent('console', { timeout: 5000,
      predicate: message => message.text() === 'PREPARATION_OBSERVER_SUBSCRIBED' });
    const pendingCapture = captureUserBrowserPageForRef(SOURCE, { width: 1280, height: 900 }, options);
    await subscribed;
    await page.evaluate(() => {
      const visitors = document.createElement('p'); visitors.id = 'visitors';
      visitors.textContent = '17.5k'; document.body.append(visitors);
    });
    const capture = await pendingCapture;
    assert.deepEqual(capture.capturePreparation?.observations, [{ selector: '#visitors', state: 'visible', passed: true }]);
    assert.ok(capture.shotBytes);
  });
});
test('user-browser preparation refuses clicks before opening a session', async () => {
  let connected = 0;
  const driver = fake();
  await assert.rejects(captureUserBrowserPageForRef(SOURCE, { width: 1280, height: 900 }, {
    driver: { ...driver, connectUserBrowserSession: async input => { connected++; return driver.connectUserBrowserSession(input); } },
    preparation: { schema: CAPTURE_PREPARATION_SCHEMA, actions: [{ kind: 'click', selector: 'button' }],
      assertions: [{ selector: '#result', state: 'visible' }] },
  }), /USER_BROWSER_PREPARATION_ACTION_UNSUPPORTED/);
  assert.equal(connected, 0);
});
test('user-browser visibility assertions refuse duplicate targets and missing hidden targets', async () => {
  await withBrowser(async browser => {
    const page = await browser.newPage();
    try {
      await page.setContent('<p class="duplicate">One</p><p class="duplicate">Two</p><p id="hidden" hidden>Hidden</p>');
      const observedPage = { evaluate: <T>(expression: string) => page.evaluate<T>(expression) };
      for (const assertion of [{ selector: '.duplicate', state: 'visible' as const },
        { selector: '#missing', state: 'hidden' as const }]) {
        await assert.rejects(observeUserBrowserPreparation(observedPage, {
          schema: CAPTURE_PREPARATION_SCHEMA, actions: [], assertions: [assertion],
        }), /exactly one existing element/);
      }
      assert.deepEqual(await observeUserBrowserPreparation(observedPage, {
        schema: CAPTURE_PREPARATION_SCHEMA, actions: [], assertions: [{ selector: '#hidden', state: 'hidden' }],
      }), [{ selector: '#hidden', state: 'hidden', passed: true }]);
    } finally { await page.close(); }
  });
});
test('consented design navigation signs nullable-status engine receipt without inferring challenge from prose; session stops', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let stopped = 0; let helped = 0;
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    browserConfig: { mode: 'default' }, consentHome: root, explicitUserBrowser: true, userBrowserDriver: fake({ challenge: true,
      onStop: () => stopped++, onHelp: () => helped++ }), userBrowserLookup: lookup });
  const receipt = await session.navigate(SOURCE, 'design');
  const observed = readCurrentDiscoveryNavigation(root, receipt);
  assert.deepEqual(observed.links, [LINK]);
  const saved = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
  assert.equal(saved.schema, 'reference-navigation-capture-v7');
  assert.equal(saved.acquisition.engine, 'user-browser');
  assert.equal(saved.acquisition.httpStatus, null);
  assert.equal(saved.acquisition.networkIsolation, 'initial-url-check-only');
  assert.equal(saved.acquisition.getOnlyEnforced, false);
  assert.equal(helped, 0); assert.equal(stopped, 1);
  await assert.rejects(() => session.navigate('https://localhost/', 'design'));
});
test('unjudged login prose does not trigger a human handoff; unavailable attempt stops without fallback', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let stopped = 0; let helped = 0;
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    browserConfig: { mode: 'default' }, consentHome: root, explicitUserBrowser: true,
    userBrowserDriver: fake({ login: true, helpOutcome: 'cancelled', onStop: () => stopped++, onHelp: () => helped++ }),
    userBrowserLookup: lookup });
  await assert.rejects(session.navigate(SOURCE, 'design'), error => {
    const receipt = (error as { attempt: { path: string; sha256: string } }).attempt;
    assert.equal(readReferenceDiscoveryAttempt(root, receipt).engine, 'user-browser');
    return true;
  });
  assert.equal(helped, 0); assert.equal(stopped, 1);
});
test('explicit everyday browser cannot publish a blank gallery item; the signed attempt advances the pointer', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let stopped = 0;
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    browserConfig: { mode: 'default' }, consentHome: root, explicitUserBrowser: true,
    userBrowserDriver: fake({ blank: true, onStop: () => stopped++ }), userBrowserLookup: lookup });
  await assert.rejects(session.navigate(SOURCE, 'design'), error => {
    const receipt = (error as { attempt: { path: string; sha256: string } }).attempt;
    assert.equal(readReferenceDiscoveryAttempt(root, receipt).reason, 'entry-unusable');
    return true;
  });
  assert.equal(stopped, 1);
});

test('direct design entry and fetch-first domain use separate signed receipt schemas', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let connected = 0;
  const driver = fake({ url: GALLERY_DIRECTORY, link: GALLERY_ITEM });
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    browserConfig: { mode: 'default' }, consentHome: root, explicitUserBrowser: true,
    userBrowserDriver: { ...driver, connectUserBrowserSession: async options => { connected++; return driver.connectUserBrowserSession(options); } },
    userBrowserLookup: lookup,
    fetchDomain: async () => ({ kind: 'observation', finalUrl: SOURCE, status: 200,
      observation: { observedText: 'Korean service', taskText: 'Service', shell: false,
        links: [LINK], linkLabels: [{ url: LINK, text: 'Visit' }] } }),
  });
  const direct = await session.navigate(GALLERY_DIRECTORY, 'design', 'free-gallery');
  assert.deepEqual(readCurrentDirectDiscoveryEntry(root, direct).links, [GALLERY_ITEM]);
  const domain = await session.navigate(SOURCE, 'domain', 'public-directory');
  assert.equal(readDomainObservation(root, domain).finalUrl, SOURCE);
  assert.equal(connected, 1, 'native fetch does not connect a second browser');
});
test('gallery item navigation retains stable actionable UI image selectors', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    browserConfig: { mode: 'default' }, consentHome: root, explicitUserBrowser: true,
    userBrowserDriver: fake({ url: GALLERY_ITEM, imageSelector: 'img[data-testid="screen"]' }),
    userBrowserLookup: lookup });
  const receipt = await session.navigate(GALLERY_ITEM, 'design');
  const observation = readCurrentDiscoveryNavigation(root, receipt);
  assert.equal(observation.imageCandidates?.[0]?.selector, 'img[data-testid="screen"]');
});
test('render fallback emits v2 domain receipt and one terminal v2 failure without switching browsers', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let stopped = 0;
  const options = { browserConfig: { mode: 'default' as const }, consentHome: root, explicitUserBrowser: true, userBrowserLookup: lookup,
    fetchDomain: async () => ({ kind: 'fallback' as const, reason: 'javascript required' }) };
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    ...options, userBrowserDriver: fake({ onStop: () => stopped++ }) });
  const receipt = await session.navigate(SOURCE, 'domain');
  assert.equal(readDomainObservation(root, receipt).observedText?.includes('Visible public'), true);
  const record = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
  assert.equal(record.schema, 'reference-domain-observation-v2');
  assert.equal(record.acquisition.engine, 'user-browser');
  assert.equal(stopped, 1);
  const failing = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    ...options, userBrowserDriver: fake({ fail: true, onStop: () => stopped++ }) });
  await assert.rejects(failing.navigate(SOURCE, 'domain'), error => {
    const receipt = (error as { attempt: { path: string; sha256: string } }).attempt;
    assert.equal(readReferenceDiscoveryAttempt(root, receipt).engine, 'user-browser');
    return true;
  });
  assert.equal(stopped, 2);
});
test('element crop uses observed pixel scale and rejects clipped elements', () => {
  const image = new PNG({ width: 8, height: 8 });
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const index = (y * 8 + x) * 4; image.data[index] = x; image.data[index + 1] = y; image.data[index + 3] = 255;
  }
  const geometry = { x: 1, y: 1, width: 2, height: 2, viewport: { width: 4, height: 4 }, url: SOURCE, identity: 1 };
  const cropped = PNG.sync.read(cropUserBrowserPng(PNG.sync.write(image), geometry));
  assert.equal(cropped.width, 4); assert.equal(cropped.height, 4);
  assert.equal(cropped.data[0], 2); assert.equal(cropped.data[1], 2);
  assert.throws(() => cropUserBrowserPng(PNG.sync.write(image), { ...geometry, x: 3 }), /does not fit/);
});
test('ref add-batch publishes a scoped user-browser image with explicit unmeasured probes', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let stopped = 0;
  const fullPageCalls: boolean[] = [];
  const result = await addRefsBatch(root, [{ source: SOURCE, as: 'card', lane: 'design', fromUser: true,
    selector: '.card', shot: true, viewport: '1280x900' }], {
    rulesRoot: fileURLToPath(new URL('../core/rules/builtin', import.meta.url)), concurrency: 1,
    browserConfig: { mode: 'default' }, consentHome: root, explicitUserBrowser: true,
    userBrowserDriver: fake({ onStop: () => stopped++, onScreenshot: fullPage => fullPageCalls.push(fullPage) }),
    userBrowserLookup: lookup,
  }, createTestProjectWriteAdapter(root));
  assert.equal(result.outcomes[0]?.ok, true, result.outcomes[0]?.error ?? 'user-browser capture failed');
  const ref = loadRefs(root)[0]!;
  assert.equal(ref.acquisition?.engine, 'user-browser');
  assert.equal(inspectDesignReferenceAdmission(root, ref).eligible, true);
  assert.equal(ref.acquisition?.captureMethod, 'viewport');
  assert.deepEqual(fullPageCalls, [false]);
  assert.equal(ref.energyCurve, undefined);
  assert.deepEqual(ref.invariants?.measurementCoverage, {
    interactionProbe: 'not-measured', motionProbe: 'not-measured', energyCurve: 'not-measured' });
  const imagePath = ref.imagePath;
  if (!imagePath) throw new Error('missing retained screenshot');
  assert.equal(PNG.sync.read(readFileSync(join(root, imagePath))).width, 2560);
  assert.equal(stopped, 1);
});
test('a 1x user browser cannot publish a new design capture as 2x evidence', async () => {
  await assert.rejects(captureUserBrowserPageForRef(SOURCE, { width: 1280, height: 900 },
    { selector: '.card', shot: true, driver: fake({ oneX: true }), lookup }), /requires a 2x whole-page capture/);
});
test('ref element captures DOM-only measurement and the entire 2x screen without cropping', async () => {
  const result = await captureUserBrowserPageForRef(SOURCE, { width: 1280, height: 900 }, {
    selector: '.card', shot: true, driver: fake(), lookup });
  assert.equal(result.acquisition.captureMethod, 'full-page');
  assert.equal(result.acquisition.httpStatus, null);
  assert.deepEqual(result.raw.meta?.measurementCoverage, {
    interactionProbe: 'not-measured', motionProbe: 'not-measured', energyCurve: 'not-measured' });
  assert.equal(PNG.sync.read(result.shotBytes!).width, 2560);
});
