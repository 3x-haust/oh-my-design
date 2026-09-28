import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import type { UserBrowserDriver, UserBrowserSession } from '../core/browser/contracts.ts';
import { createReferenceAcquisitionSession } from '../core/ref/acquisition-session.ts';
import { browserExpression } from '../core/ref/browser-evaluation.ts';
import { addRefsBatch } from '../core/ref/batch.ts';
import { loadRefs } from '../core/ref/store.ts';
import { inspectDesignReferenceAdmission } from '../core/ref/design-admission.ts';
import { captureUserBrowserPageForRef } from '../core/render/index.ts';
import { cropUserBrowserPng } from '../core/ref/acquisition-png.ts';
import { readCurrentDiscoveryNavigation, readCurrentDirectDiscoveryEntry } from '../core/ref/discovery-record.ts';
import { readDomainObservation } from '../core/ref/domain-observation.ts';
import { readReferenceDiscoveryAttempt } from '../core/ref/navigation-capture.ts';
import { writeUserBrowserConsent } from '../core/ref/browser-consent.ts';
import { discoveryFixture, GALLERY_DIRECTORY, GALLERY_ITEM } from './helpers/discovery-capture.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const SOURCE = 'https://example.com/'; const LINK = 'https://example.com/item';
const lookup = async () => [{ address: '93.184.215.14', family: 4 }];
const png = (width = 1280, height = 900) => PNG.sync.write(new PNG({ width, height }));
const state = (challenge = false) => ({ url: SOURCE, title: challenge ? 'Just a moment' : 'Example page',
  body: challenge ? 'Just a moment' : 'Visible public reference information. '.repeat(12),
  visibleText: 'Visible public reference information. '.repeat(12), taskText: 'Reference information',
  links: [LINK], linkLabels: [{ url: LINK, text: 'View item' }], viewport: { width: 1280, height: 900 },
  identity: 1234, loginOccludes: false });
function fake(options: { challenge?: boolean; login?: boolean; helpOutcome?: string; fail?: boolean;
  onStop?: () => void; onHelp?: () => void; url?: string; link?: string; imageSelector?: string } = {}): UserBrowserDriver {
  let cleared = !options.challenge && !options.login;
  const session: UserBrowserSession = {
    resize: async () => {}, navigate: async () => {},
    evaluate: async expression => options.fail ? { ok: false, error: 'never expose upstream error' }
      : { ok: true, value: expression === browserExpression('() => location.href') ? options.url ?? SOURCE
        : expression.includes('performance.timeOrigin') && expression.includes('linkLabels')
          ? { ...state(Boolean(options.challenge && !cleared)), loginOccludes: Boolean(options.login && !cleared),
            url: options.url ?? SOURCE, links: [options.link ?? LINK],
            linkLabels: [{ url: options.link ?? LINK, text: 'View item' }] }
          : expression.includes('const selectorFor = image') ? options.imageSelector
            ? [{ selector: options.imageSelector, width: 400, height: 300, naturalWidth: 800, naturalHeight: 600 }] : []
          : expression.includes('function extractInPage') ? { nodes: [], meta: {} }
            : expression.includes('scrollIntoView') ? { x: 10, y: 10, width: 40, height: 20,
              viewport: { width: 1280, height: 900 }, url: SOURCE, identity: 1234 } : null },
    screenshot: async () => ({ buffer: png(), width: 1280, height: 900, format: 'png' }),
    requestHelp: async () => { options.onHelp?.(); cleared = true; return { outcome: options.helpOutcome ?? 'completed' }; },
    stop: async () => { options.onStop?.(); },
  };
  return { connectUserBrowserSession: async input => { assert.equal(input.focused, false); return session; },
    userBrowserBridgeDoctor: async () => ({ ready: true, cli: { installed: true }, daemon: { running: true },
      identification: { needsChoice: false, candidates: [] }, primary: { id: 'aside', label: 'Aside' }, browsers: [{}] }),
    userBrowserBridgeOnboard: async () => { throw Error('unexpected install'); } };
}
test('consented design navigation signs nullable-status engine receipt and native handoff; session stops', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let stopped = 0; let helped = 0;
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    browserConfig: { mode: 'default' }, consentHome: root, userBrowserDriver: fake({ challenge: true,
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
  assert.equal(helped, 1); assert.equal(stopped, 1);
  await assert.rejects(() => session.navigate('https://localhost/', 'design'));
});
test('login cancellation publishes one unavailable attempt and stops without a fallback launch', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let stopped = 0; let helped = 0;
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    browserConfig: { mode: 'default' }, consentHome: root,
    userBrowserDriver: fake({ login: true, helpOutcome: 'cancelled', onStop: () => stopped++, onHelp: () => helped++ }),
    userBrowserLookup: lookup });
  await assert.rejects(session.navigate(SOURCE, 'design'), error => {
    const receipt = (error as { attempt: { path: string; sha256: string } }).attempt;
    assert.equal(readReferenceDiscoveryAttempt(root, receipt).engine, 'user-browser');
    return true;
  });
  assert.equal(helped, 1); assert.equal(stopped, 1);
});
test('direct design entry and fetch-first domain use separate signed receipt schemas', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let connected = 0;
  const driver = fake({ url: GALLERY_DIRECTORY, link: GALLERY_ITEM });
  const session = createReferenceAcquisitionSession(createTestProjectWriteAdapter(root), {
    browserConfig: { mode: 'default' }, consentHome: root,
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
    browserConfig: { mode: 'default' }, consentHome: root,
    userBrowserDriver: fake({ url: GALLERY_ITEM, imageSelector: 'img[data-testid="screen"]' }),
    userBrowserLookup: lookup });
  const receipt = await session.navigate(GALLERY_ITEM, 'design');
  const observation = readCurrentDiscoveryNavigation(root, receipt);
  assert.equal(observation.imageCandidates?.[0]?.selector, 'img[data-testid="screen"]');
});
test('render fallback emits v2 domain receipt and one terminal v2 failure without switching browsers', async t => {
  const root = discoveryFixture(t); writeUserBrowserConsent('consented', root);
  let stopped = 0;
  const options = { browserConfig: { mode: 'default' as const }, consentHome: root, userBrowserLookup: lookup,
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
  const result = await addRefsBatch(root, [{ source: SOURCE, as: 'card', lane: 'design', fromUser: true,
    selector: '.card', shot: true }], {
    rulesRoot: fileURLToPath(new URL('../core/rules/builtin', import.meta.url)), concurrency: 1,
    browserConfig: { mode: 'default' }, consentHome: root,
    userBrowserDriver: fake({ onStop: () => stopped++ }), userBrowserLookup: lookup,
  }, createTestProjectWriteAdapter(root));
  assert.equal(result.outcomes[0]?.ok, true, result.outcomes[0]?.error ?? 'user-browser capture failed');
  const ref = loadRefs(root)[0]!;
  assert.equal(ref.acquisition?.engine, 'user-browser');
  assert.equal(inspectDesignReferenceAdmission(root, ref).eligible, true);
  assert.equal(ref.acquisition?.captureMethod, 'viewport-crop');
  assert.equal(ref.energyCurve, undefined);
  assert.deepEqual(ref.invariants?.measurementCoverage, {
    interactionProbe: 'not-measured', motionProbe: 'not-measured', energyCurve: 'not-measured' });
  const imagePath = ref.imagePath;
  if (!imagePath) throw new Error('missing retained screenshot');
  assert.equal(PNG.sync.read(readFileSync(join(root, imagePath))).width, 40);
  assert.equal(stopped, 1);
});
test('ref element captures DOM-only measurement and screenshot crop without a headless browser', async () => {
  const result = await captureUserBrowserPageForRef(SOURCE, { width: 1280, height: 900 }, {
    selector: '.card', shot: true, driver: fake(), lookup });
  assert.equal(result.acquisition.captureMethod, 'viewport-crop');
  assert.equal(result.acquisition.httpStatus, null);
  assert.deepEqual(result.raw.meta?.measurementCoverage, {
    interactionProbe: 'not-measured', motionProbe: 'not-measured', energyCurve: 'not-measured' });
  assert.equal(PNG.sync.read(result.shotBytes!).width, 40);
});
