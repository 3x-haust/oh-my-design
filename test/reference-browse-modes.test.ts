import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { parseBrowseCommand } from '../core/ref/browse/parser.ts';
import { authorizeBrowseConsent } from '../core/ref/browse/safety.ts';
import { openBrowseBrowser } from '../core/ref/browse/browser.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { executeBrowseCommand, type BrowseConnection } from '../core/ref/browse/client.ts';
import { verifyBrowseSession } from '../core/ref/browse/verification.ts';
import { runBrowseDriver } from '../core/ref/browse/driver.ts';
import { issueBrowseCommandTicket } from '../core/ref/browse/authority.ts';
import { browseFixture } from './helpers/browse-fixture.ts';
import type { Binding, Start } from '../core/ref/browse/contract.ts';

test('dead driver recovery certifies only the last signed prefix and does not resume browser history', { timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-recovery-test-'));
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  const current = { sourceContractSha256: 'a'.repeat(64), request: 'Inspect reference screens' };
  const child = fork(fileURLToPath(new URL('../core/ref/browse/daemon.ts', import.meta.url)), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] });
  try {
    await executeBrowseCommand(root, parseBrowseCommand(['start', '--lane', 'design']), current, invocation, writer, {
      launch: async binding => {
        const ready = once(child, 'message', { signal: AbortSignal.timeout(15_000) }); child.send(binding);
        const [value] = await ready; assert.equal(value.ready, true); return value as BrowseConnection;
      },
    });
    const exited = once(child, 'exit', { signal: AbortSignal.timeout(10_000) }); child.kill('SIGKILL'); await exited;
    const result = await executeBrowseCommand(root, parseBrowseCommand(['end', '--reason', 'interrupted']), current, invocation, writer);
    assert.equal(result.outcome, 'recovered-interrupted');
    const verified = verifyBrowseSession(root, result.seal!); assert.equal(verified.events.length, 2); assert.ok(verified.seal.recovery); assert.equal(verified.seal.stopReason, 'interrupted');
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); rmSync(root, { recursive: true, force: true }); }
});

function binding(root: string, argv: string[]): Binding {
  const start = parseBrowseCommand(argv).action as Start, now = Date.now(), contract = 'a'.repeat(64);
  return { root, sessionId: 'b'.repeat(32), sourceContractSha256: contract, buildSha256: 'c'.repeat(64), start,
    consent: authorizeBrowseConsent(start, `omd ref browse ${argv.join(' ')}`, contract, now),
    budget: { startedAt: new Date(now).toISOString(), deadline: new Date(now + 60_000).toISOString(), maxActions: 60, actions: 0, metadataEvents: 0 } };
}
test('profile is opt-in, persists only browser state and does not pretend to continue a prior trace', { timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-profile-test-')), profile = mkdtempSync(join(tmpdir(), 'omd-browser-profile-'));
  const value = binding(root, ['start', '--lane', 'design', '--mode', 'profile', '--user-opt-in', '--allow-auth-origin', 'https://app.fixture.test']);
  try {
    await assert.rejects(openBrowseBrowser({ ...value, consent: null }, { profilePath: profile }), /CONSENT_REQUIRED/);
    const first = await openBrowseBrowser(value, { profilePath: profile });
    await first.context.addCookies([{ name: 'session', value: 'fixture-private-cookie', url: 'https://app.fixture.test', expires: Math.floor(Date.now() / 1000) + 3600 }]);
    await first.close();
    const second = await openBrowseBrowser({ ...value, sessionId: 'd'.repeat(32) }, { profilePath: profile });
    try { assert.equal((await second.context.cookies('https://app.fixture.test')).find(cookie => cookie.name === 'session')?.value, 'fixture-private-cookie'); assert.equal(second.page.url(), 'about:blank'); }
    finally { await second.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true }); }
});

test('CDP creates a guarded separate context, imports only approved cookies and leaves the original browser/tab alive', { timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-cdp-test-')), profile = mkdtempSync(join(tmpdir(), 'omd-cdp-profile-'));
  const chrome = spawn(chromium.executablePath(), ['--headless', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let output = '';
  const endpoint = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not publish its CDP endpoint')), 15_000);
    chrome.once('error', error => { clearTimeout(timer); reject(error); });
    chrome.stderr.on('data', chunk => { output += String(chunk); const match = /DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/.exec(output); if (match) { clearTimeout(timer); resolve(match[1]!); } });
  });
  const original = await chromium.connectOverCDP(endpoint), originalContext = original.contexts()[0]!, tab = originalContext.pages()[0]!;
  try {
    await tab.setContent('<title>Original tab survives</title><h1>User content</h1>');
    await originalContext.addCookies([{ name: 'approved', value: 'yes', url: 'https://app.fixture.test' }, { name: 'unrelated', value: 'no', url: 'https://other.fixture.test' }]);
    const value = binding(root, ['start', '--lane', 'design', '--mode', 'cdp', '--cdp-url', endpoint, '--user-opt-in', '--allow-auth-origin', 'https://app.fixture.test']);
    const browser = await openBrowseBrowser(value);
    assert.notEqual(browser.context, originalContext);
    assert.deepEqual((await browser.context.cookies()).map(cookie => cookie.name), ['approved']);
    await browser.close();
    assert.equal(await tab.title(), 'Original tab survives'); assert.equal(original.isConnected(), true);
  } finally {
    await original.close(); const exited = once(chrome, 'exit', { signal: AbortSignal.timeout(10_000) }); chrome.kill(); await exited;
    rmSync(root, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true });
  }
});

test('pending command retry is replay-safe and an unacknowledged click is published before the next action', { timeout: 60_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-rpc-test-')), fixture = await browseFixture();
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation), current = { sourceContractSha256: 'a'.repeat(64), request: 'Inspect account details' };
  let driver: Awaited<ReturnType<typeof runBrowseDriver>> | undefined, bound: Binding | undefined, clock = 0;
  const run = (args: string[]) => executeBrowseCommand(root, parseBrowseCommand(args), current, invocation, writer, {
    launch: async input => { bound = input; driver = await runBrowseDriver(input, { transport: fixture.transport, monotonic: () => clock += 1001 }); return driver; },
  });
  try {
    await run(['start', '--lane', 'design']);
    const viewed = await run(['goto', 'https://app.fixture.test/item', '--reason', 'Inspect the real account details tab in its current state.']);
    const args = { operation: 'action' as const, action: parseBrowseCommand(['click', '--selector', '#tab']).action, expectHead: viewed.head };
    const ticket = issueBrowseCommandTicket(bound!, driver!.challenge, 'same-request', args, invocation, writer);
    const send = async () => { const response = await fetch(driver!.endpoint, { method: 'POST', headers: { authorization: `Bearer ${driver!.capability}`, 'content-type': 'application/json' }, body: JSON.stringify({ ticket, args }) }); assert.equal(response.status, 200); return response.json(); };
    const first = await send(), repeated = await send(); assert.deepEqual(repeated, first);
    const result = await run(['shot', '--assert-visible', '#details']); assert.equal(result.ok, true); assert.equal(/invocations: (\d+)/.exec(result.observation!.text)?.[1], '1');
    const end = await run(['end']); assert.equal(end.ok, true);
  } finally { await driver?.close(); await fixture.close(); rmSync(root, { recursive: true, force: true }); }
});
