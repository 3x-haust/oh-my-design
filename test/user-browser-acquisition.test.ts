import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { userBrowserDoctor, installUserBrowserBridge } from '../core/browser/setup.ts';
import { openUserBrowserPage, withUserBrowserPage } from '../core/ref/user-browser-engine.ts';
import { browserExpression } from '../core/ref/browser-evaluation.ts';
import { readUserBrowserConsent, readBrowserConsent, writeUserBrowserConsent } from '../core/ref/browser-consent.ts';
import { selectReferenceAcquisitionEngine } from '../core/ref/browser-config.ts';
import type { UserBrowserDriver } from '../core/browser/contracts.ts';

const report = (ready = false) => ({ ready, cli: { installed: true }, daemon: { running: true },
  identification: { needsChoice: false, candidates: [{ id: 'aside', label: 'Aside', signals: ['default'] }],
    defaultBrowser: { label: 'Aside', supported: true } }, primary: { id: 'aside', label: 'Aside' }, browsers: [{}] });
const fake = (overrides: Partial<UserBrowserDriver> = {}): UserBrowserDriver => ({
  userBrowserBridgeDoctor: async () => report(), userBrowserBridgeOnboard: async () => ({ ready: false, humanStep: 'Relaunch Aside and click Enable' }),
  connectUserBrowserSession: async () => { throw Error('unexpected connection'); }, ...overrides,
});
test('doctor is read-only; setup reports pending human step for supported default browser', async () => {
  let installs = 0; let connects = 0;
  const driver = fake({ userBrowserBridgeOnboard: async () => { installs++; return { ready: false, humanStep: 'Relaunch Aside and click Enable' }; },
    connectUserBrowserSession: async () => { connects++; throw Error('unexpected'); } });
  assert.equal((await userBrowserDoctor(undefined, driver)).browser?.id, 'aside');
  assert.equal(installs, 0); assert.equal(connects, 0);
  assert.deepEqual(await installUserBrowserBridge(undefined, driver), { state: 'pending-human-step',
    humanStep: 'Relaunch Aside and click Enable', candidates: [{ id: 'aside', label: 'Aside', signals: ['default'] }] });
  assert.equal(installs, 1); assert.equal(connects, 0);
});
test('legacy profile permission never authorizes user browser; overrides win', async () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-browser-consent-'));
  try {
    mkdirSync(join(home, '.omd'));
    writeFileSync(join(home, '.omd/browser-consent.json'), '{"decision":"consented"}\n');
    assert.equal(readUserBrowserConsent(home), null);
    writeUserBrowserConsent('consented', home);
    assert.equal(readBrowserConsent(home), 'consented');
    assert.equal(readUserBrowserConsent(home), 'consented');
    const driver = fake({ userBrowserBridgeDoctor: async () => report(true) });
    assert.equal(await selectReferenceAcquisitionEngine({ mode: 'default' }, { home, driver }), 'user-browser');
    assert.equal(await selectReferenceAcquisitionEngine({ mode: 'default', storageState: '/state' }, { home, driver }), 'custom-browser');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
test('unsupported default needs an explicit Chromium-family browser choice', async () => {
  let installed = false;
  const driver = fake({ userBrowserBridgeDoctor: async () => ({ ...report(), identification: { ...report().identification,
    defaultBrowser: { label: 'Unsupported', supported: false } } }),
    userBrowserBridgeOnboard: async () => { installed = true; throw Error('must not install'); } });
  assert.equal((await installUserBrowserBridge(undefined, driver)).state, 'needs-browser-choice');
  assert.equal(installed, false);
});
test('user browser validates URLs, evaluates success, and always stops explicitly', async () => {
  let navigated = 0; let stopped = 0;
  const driver = fake({ connectUserBrowserSession: async options => {
    assert.equal(options.focused, false);
    return { resize: async () => {}, navigate: async () => { navigated++; }, evaluate: async expression => ({ ok: true, value: expression === browserExpression('() => location.href') ? 'https://example.com/' : 42 }),
      screenshot: async () => ({ buffer: Buffer.alloc(0), width: 1, height: 1 }),
      requestHelp: async () => ({ outcome: 'completed' }), stop: async () => { stopped++; } };
  } });
  const page = await openUserBrowserPage({ driver, lookup: async () => [{ address: '93.184.215.14', family: 4 }] });
  try {
    await assert.rejects(page.navigate('https://localhost/'));
    assert.equal(navigated, 0);
    assert.equal((await page.navigate('https://example.com/')).httpStatus, null);
    assert.equal(await page.evaluate<number>('42'), 42);
    assert.equal(await page.requestHelp({ prompt: 'Please log in' }), 'completed');
    await assert.rejects(page.screenshot(), /PNG/);
  } finally { await page.close(); }
  assert.equal(stopped, 1);
});
test('private DNS rejects an OMD-chosen URL before issuing browser navigation', async () => {
  let navigated = 0; let stopped = 0;
  const driver = fake({ connectUserBrowserSession: async () => ({
    resize: async () => {}, navigate: async () => { navigated++; },
    evaluate: async () => ({ ok: true, value: 'https://example.com/' }),
    screenshot: async () => ({ buffer: Buffer.alloc(0), width: 0, height: 0 }),
    requestHelp: async () => ({ outcome: 'cancelled' }), stop: async () => { stopped++; },
  }) });
  await assert.rejects(withUserBrowserPage({ driver,
    lookup: async () => [{ address: '127.0.0.1', family: 4 }] }, page => page.navigate('https://example.com/')),
  /non-public network/);
  assert.equal(navigated, 0);
  assert.equal(stopped, 1);
});
test('abort closes the active session without waiting for an unresolved page RPC', async () => {
  const controller = new AbortController();
  let started!: () => void;
  const evaluationStarted = new Promise<void>(resolve => { started = resolve; });
  let stopped = 0;
  const driver = fake({ connectUserBrowserSession: async () => ({
    resize: async () => {}, navigate: async () => {},
    evaluate: async () => { started(); return new Promise<never>(() => {}); },
    screenshot: async () => ({ buffer: Buffer.alloc(0), width: 0, height: 0 }),
    requestHelp: async () => ({ outcome: 'cancelled' }), stop: async () => { stopped++; },
  }) });
  const capture = withUserBrowserPage({ driver, signal: controller.signal }, page => page.evaluate('location.href'));
  await evaluationStarted;
  controller.abort(new Error('task cancelled'));
  await assert.rejects(capture, /task cancelled/);
  assert.equal(stopped, 1);
});
test('capture failure closes the owned session before propagating', async () => {
  let stopped = 0;
  const driver = fake({ connectUserBrowserSession: async () => ({
    resize: async () => {}, navigate: async () => {}, evaluate: async () => ({ ok: false, error: { text: 'private detail' } }),
    screenshot: async () => ({ buffer: Buffer.alloc(0), width: 0, height: 0 }),
    requestHelp: async () => ({ outcome: 'cancelled' }), stop: async () => { stopped++; },
  }) });
  await assert.rejects(withUserBrowserPage({ driver }, page => page.evaluate('location.href')), /evaluation failed/);
  assert.equal(stopped, 1);
});
