import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { connect } from 'node:net';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { captureReferenceNavigation, readReferenceDiscoveryAttempt, ReferenceNavigationError } from '../core/ref/navigation-capture.ts';
import { validateDiscoveryCoverage } from '../core/ref/discovery-coverage.ts';
import { readCurrentDirectDiscoveryEntry, readDirectDiscoveryEntry, readStrictDiscoveryNavigation,
  type DirectDiscoveryEntry } from '../core/ref/discovery-record.ts';
import { designDiscoveryDirectoryProvider } from '../core/ref/design-discovery-sources.ts';
import { assertPublicNetworkUrl, createPublicNetworkProxy, publicIpAddress } from '../core/ref/public-network.ts';
import { loadRefs } from '../core/ref/store.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { discoveryBrowser, discoveryFixture, directoryHtml, PUBLIC_DIRECTORY, DOMAIN_ITEM, GALLERY_DIRECTORY, GALLERY_ITEM,
  type DiscoveryScenario } from './helpers/discovery-capture.ts';

test('new navigation binds only rendered links to its captured viewport', async t => {
  // Given a real page with one visible destination and one hidden destination.
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: PUBLIC_DIRECTORY,
      html: `${directoryHtml(DOMAIN_ITEM)}<a style="display:none" href="https://hidden.example/">Hidden</a>` });
    // When the existing native navigation API captures it.
    const receipt = await captureReferenceNavigation(observed.browser, PUBLIC_DIRECTORY, 'domain', createTestProjectWriteAdapter(root));
    const record = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
    // Then hidden DOM anchors cannot become discovery edges.
    assert.deepEqual(record.acquisition.links, [DOMAIN_ITEM]);
    assert.equal(record.schema, 'reference-navigation-capture-v4');
    assert.deepEqual(readStrictDiscoveryNavigation(root, receipt), { url: PUBLIC_DIRECTORY, finalUrl: PUBLIC_DIRECTORY, links: [DOMAIN_ITEM] });
    assert.throws(() => readDirectDiscoveryEntry(root, { method: 'direct-public', entry: 'public-directory', ...receipt }), /purpose path/);
  });
});

test('a validated CONNECT proxy loopback address is not mistaken for the public destination', async t => {
  const result = await capture(t, {
    url: GALLERY_DIRECTORY,
    html: directoryHtml(GALLERY_ITEM),
    serverAddress: '127.0.0.1',
  });
  assert.ok(result.receipt.capture.path.startsWith('.omd/discovery/design/entries/'));
});

const entryLanes = { 'public-directory': 'domain', 'free-gallery': 'design' } as const;
async function capture(t: { after(fn: () => void): void }, scenario: DiscoveryScenario, entry: DirectDiscoveryEntry = 'free-gallery') {
  const root = discoveryFixture(t);
  return withBrowser(async browser => {
    const observed = discoveryBrowser(browser, scenario);
    const receipt = await captureReferenceNavigation(observed.browser, scenario.url, entryLanes[entry], createTestProjectWriteAdapter(root), entry);
    return { root, receipt, observed };
  });
}

for (const entry of ['public-directory', 'free-gallery'] as const) {
  test(`native ${entry} entry binds exact pixels, links and purpose without a retained reference`, async t => {
    const url = entry === 'public-directory' ? PUBLIC_DIRECTORY : GALLERY_DIRECTORY;
    const target = entry === 'public-directory' ? DOMAIN_ITEM : GALLERY_ITEM;
    const value = await capture(t, { url, html: directoryHtml(target) }, entry);
    const record = JSON.parse(readFileSync(join(value.root, value.receipt.capture.path), 'utf8'));
    assert.equal(record.schema, 'reference-discovery-entry-v4');
    assert.deepEqual(record.linkLabels, [{ url: target, text: 'Inspect entry 1' }]);
    assert.equal(value.receipt.method, 'direct-public');
    assert.equal(value.receipt.entry, entry);
    assert.deepEqual(readDirectDiscoveryEntry(value.root, value.receipt), { url, finalUrl: url, links: [target] });
    assert.match(readCurrentDirectDiscoveryEntry(value.root, value.receipt).observedText ?? '', /Public directory/);
    assert.deepEqual(readFileSync(join(value.root, value.receipt.evidence.path)), value.observed.captures[0]);
    assert.equal(value.observed.contextOptions.length, 1);
    const contextOptions = value.observed.contextOptions[0]!;
    assert.deepEqual({ ...contextOptions, proxy: undefined }, {
      viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false, proxy: undefined,
    });
    assert.match(contextOptions.proxy?.server ?? '', /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(value.observed.closed(), 1);
    assert.equal(existsSync(join(value.root, '.omd/refs')), false);
    assert.deepEqual(loadRefs(value.root, { includeDomain: true }), []);
    assert.throws(() => readStrictDiscoveryNavigation(value.root, value.receipt), /expected exactly/);
  });
}

test('a direct entry blocks POST requests before they can reach the endpoint', async t => {
  const result = await capture(t, { url: GALLERY_DIRECTORY,
    html: `${directoryHtml(GALLERY_ITEM)}<script>fetch('/test-submit', {method:'POST'}).catch(() => {});</script>` });
  assert.deepEqual(result.observed.abortedMethods, ['POST']);
});

test('direct discovery disables browser transports that bypass the pinned HTTP proxy', async t => {
  const html = `<main><script>document.write('<h1>' +
    ([typeof RTCPeerConnection, typeof globalThis.webkitRTCPeerConnection, typeof WebTransport].every(value => value === 'undefined')
      ? 'Realtime transports disabled' : 'Unsafe realtime transport') + '</h1>')</script><a href="${DOMAIN_ITEM}">Inspect service</a></main>`;
  const result = await capture(t, { url: PUBLIC_DIRECTORY, html }, 'public-directory');
  assert.match(readCurrentDirectDiscoveryEntry(result.root, result.receipt).observedText ?? '', /Realtime transports disabled/);
});

test('direct-entry visible text excludes hidden descendant market claims', async t => {
  const result = await capture(t, { url: PUBLIC_DIRECTORY,
    html: `<main><h1>Global service directory</h1><p>Available services<span style="display:none"> South Korea residents market</span><span style="clip-path:inset(100%)"> South Korea service market</span><span style="color:transparent"> South Korea product audience</span><span style="color:rgba(0,0,0,.01)"> South Korea resident service</span><span style="color:white;background:white"> South Korea benefit service</span><span style="font-size:1px;line-height:1px"> South Korea resident platform</span><span style="transform:scale(.05)"> South Korea service portal</span><span style="transform:scale(.001)"> South Korea support platform</span><span style="transform:scale(.2)"><span style="transform:scale(.2)"> South Korea support directory</span></span><span style="filter:opacity(.001)"> South Korea product service</span><span style="opacity:.1"><span style="opacity:.1"><span style="opacity:.1"> South Korea service for residents</span></span></span></p><a href="${DOMAIN_ITEM}">Inspect service</a></main>` },
  'public-directory');
  const observation = readCurrentDirectDiscoveryEntry(result.root, result.receipt);
  assert.match(observation.observedText ?? '', /Global service directory/);
  assert.doesNotMatch(observation.observedText ?? '', /South Korea/);
});

test('direct-entry visible text excludes copy covered by an opaque child overlay', async t => {
  const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3Crect width="100%25" height="100%25" fill="white"/%3E%3C/svg%3E';
  const result = await capture(t, { url: PUBLIC_DIRECTORY,
    html: `<main><h1>Global directory</h1><p style="position:relative">South Korea service directory for residents<span style="position:absolute;inset:0;background:white;pointer-events:none">Global catalogue</span></p><p style="position:relative">South Korea product market<img src='${image}' style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1"></p><a href="${DOMAIN_ITEM}">Inspect service</a></main>` },
  'public-directory');
  const observation = readCurrentDirectDiscoveryEntry(result.root, result.receipt);
  assert.match(observation.observedText ?? '', /Global catalogue/);
  assert.doesNotMatch(observation.observedText ?? '', /South Korea/);
});

test('the observed Siteinspire category-list route supports direct entry when item links are visible', async t => {
  const url = 'https://www.siteinspire.com/websites/category/minimal';
  const result = await capture(t, { url, html: directoryHtml(GALLERY_ITEM) });
  assert.deepEqual(readDirectDiscoveryEntry(result.root, result.receipt), { url, finalUrl: url, links: [GALLERY_ITEM] });
});

test('invalid mode, lane and public-list inputs refuse before opening a browser context', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY, html: directoryHtml(GALLERY_ITEM) });
    for (const [url, lane, entry] of [
      [GALLERY_DIRECTORY, 'design', 'unknown'], [GALLERY_DIRECTORY, 'other', 'free-gallery'],
      [GALLERY_DIRECTORY, 'domain', 'free-gallery'], [PUBLIC_DIRECTORY, 'design', 'public-directory'],
      [GALLERY_ITEM, 'design', 'free-gallery'], ['https://www.siteinspire.com/login', 'design', 'free-gallery'],
      ['https://siteinspire.com.evil.example/', 'design', 'free-gallery'], ['http://127.0.0.1:1234/', 'domain', 'public-directory'],
      ['https://127.0.0.1.nip.io/', 'domain', 'public-directory'], ['https://metadata.google.internal/', 'domain', 'public-directory'],
    ]) {
      assert.ok(url && lane && entry);
      await assert.rejects(captureReferenceNavigation(observed.browser, url, lane, createTestProjectWriteAdapter(root), entry), /REFERENCE_DISCOVERY/);
    }
    assert.deepEqual(observed.contextOptions, []);
    assert.equal(existsSync(join(root, '.omd/discovery')), false);
  });
});

test('public network validation refuses private DNS answers and reserved address families', async () => {
  await assert.rejects(assertPublicNetworkUrl('https://public.example/', async () => [
    { address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 },
  ]), /non-public/);
  await assert.rejects(assertPublicNetworkUrl('https://public.example/', async () => [
    { address: 'fe80::1', family: 6 },
  ]), /non-public/);
  await assert.doesNotReject(assertPublicNetworkUrl('https://public.example/', async () => [
    { address: '93.184.216.34', family: 4 }, { address: '2606:4700:4700::1111', family: 6 },
  ]));
  for (const address of ['127.0.0.1', '169.254.169.254', '192.31.196.1', '192.52.193.1',
    '192.175.48.1', '::1', '::ffff:127.0.0.1',
    '64:ff9b:1::a9fe:a9fe', '100:0:0:1::1', '2620:4f:8000::1', 'fc00::1', 'fec0::1',
    '2001:db8::1', '3fff::1', '5f00::1']) {
    assert.equal(publicIpAddress(address), false);
    await assert.rejects(assertPublicNetworkUrl('https://public.example/', async () => [
      { address, family: address.includes(':') ? 6 : 4 },
    ]), /non-public/);
  }
});

test('the CONNECT proxy pins the socket to the exact validated DNS answer', async t => {
  const connected: string[] = [];
  const proxy = await createPublicNetworkProxy({
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    connect: address => {
      connected.push(address);
      const stream = new PassThrough();
      queueMicrotask(() => stream.emit('connect'));
      return stream;
    },
  });
  t.after(() => proxy.close());
  const port = Number(new URL(proxy.server).port);
  const client = connect(port, '127.0.0.1');
  t.after(() => client.destroy());
  await once(client, 'connect');
  client.write('CONNECT rebinding.example:443 HTTP/1.1\r\nHost: rebinding.example:443\r\n\r\n');
  const [bytes] = await once(client, 'data') as [Buffer];
  assert.match(bytes.toString('utf8'), /^HTTP\/1\.1 200/);
  assert.deepEqual(connected, ['93.184.216.34']);
});

test('the CONNECT proxy absorbs repeated upstream socket errors after closing the client', async t => {
  let upstream: PassThrough | undefined;
  const proxy = await createPublicNetworkProxy({
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    connect: () => {
      upstream = new PassThrough();
      queueMicrotask(() => upstream?.emit('connect'));
      return upstream;
    },
  });
  t.after(() => proxy.close());
  const client = connect(Number(new URL(proxy.server).port), '127.0.0.1');
  t.after(() => client.destroy());
  await once(client, 'connect');
  client.write('CONNECT reset.example:443 HTTP/1.1\r\nHost: reset.example:443\r\n\r\n');
  const [bytes] = await once(client, 'data') as [Buffer];
  assert.match(bytes.toString('utf8'), /^HTTP\/1\.1 200/);
  assert.ok(upstream);
  upstream.emit('error', new Error('first reset'));
  assert.doesNotThrow(() => upstream?.emit('error', new Error('late reset')));
});

test('the CONNECT proxy does not create an upstream after its client closes during DNS', async t => {
  let releaseLookup: (() => void) | undefined;
  let markLookupStarted: (() => void) | undefined;
  const lookupStarted = new Promise<void>(resolve => { markLookupStarted = resolve; });
  const lookupReleased = new Promise<void>(resolve => { releaseLookup = resolve; });
  let upstreamCreated = 0;
  let upstream: PassThrough | undefined;
  const proxy = await createPublicNetworkProxy({
    lookup: async () => {
      markLookupStarted?.();
      await lookupReleased;
      return [{ address: '93.184.216.34', family: 4 }];
    },
    connect: () => { upstreamCreated++; upstream = new PassThrough(); return upstream; },
  });
  t.after(() => proxy.close());
  const client = connect(Number(new URL(proxy.server).port), '127.0.0.1');
  await once(client, 'connect');
  client.write('CONNECT delayed.example:443 HTTP/1.1\r\nHost: delayed.example:443\r\n\r\n');
  await lookupStarted;
  client.destroy();
  await once(client, 'close');
  releaseLookup?.();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(upstreamCreated === 0 || upstream?.destroyed);
});

const unavailable: readonly Readonly<{ name: string; scenario: DiscoveryScenario; error: RegExp }>[] = [
  { name: 'hidden item', scenario: { url: GALLERY_DIRECTORY, html: `<p>${'Public list '.repeat(30)}</p><a style="display:none" href="${GALLERY_ITEM}">Hidden</a>` }, error: /visible followable/ },
  { name: 'offscreen item', scenario: { url: GALLERY_DIRECTORY, html: `<p>${'Public list '.repeat(30)}</p><a style="position:absolute;top:1600px" href="${GALLERY_ITEM}">Below fold</a>` }, error: /visible followable/ },
  { name: 'login overlay', scenario: { url: GALLERY_DIRECTORY, html: `${directoryHtml(GALLERY_ITEM)}<form style="position:fixed;inset:0;background:white"><input type="password"></form>` }, error: /login form/ },
  { name: 'challenge', scenario: { url: GALLERY_DIRECTORY, html: `<title>Just a moment</title>${directoryHtml(GALLERY_ITEM)}` }, error: /challenge page/ },
  { name: 'HTTP failure', scenario: { url: GALLERY_DIRECTORY, status: 403, html: directoryHtml(GALLERY_ITEM) }, error: /successful native HTTP/ },
  { name: 'foreign provider item', scenario: { url: GALLERY_DIRECTORY, html: directoryHtml('https://dribbble.com/shots/123-dashboard') }, error: /same-provider/ },
  { name: 'provider redirect', scenario: { url: GALLERY_DIRECTORY, finalUrl: 'https://dribbble.com/', html: directoryHtml('https://dribbble.com/shots/123-dashboard') }, error: /supported public list/ },
];
for (const row of unavailable) {
  test(`${row.name} cannot publish a direct discovery entry`, async t => {
    const root = discoveryFixture(t);
    await withBrowser(async browser => {
      const observed = discoveryBrowser(browser, row.scenario);
      let failure: unknown;
      try {
        await captureReferenceNavigation(observed.browser, row.scenario.url, 'design', createTestProjectWriteAdapter(root), 'free-gallery');
      } catch (error) { failure = error; }
      assert.ok(failure instanceof ReferenceNavigationError);
      assert.match(failure.message, row.error);
      assert.ok(failure.attempt, 'a real failed public-list visit should leave a diagnostic receipt');
      const attempt = readReferenceDiscoveryAttempt(root, failure.attempt);
      assert.equal(attempt.source, row.scenario.url);
      assert.equal(attempt.researchLane, 'design');
      assert.equal(attempt.entry, 'free-gallery');
      assert.equal(attempt.outcome, 'unavailable');
      assert.equal(attempt.httpStatus, row.scenario.status ?? 200);
      assert.equal(observed.closed(), 1);
      assert.equal(existsSync(join(root, '.omd/refs')), false);
    });
  });
}

test('a self-link alone cannot make a domain page a discovery root', async t => {
  await assert.rejects(capture(t, { url: PUBLIC_DIRECTORY, html: directoryHtml(PUBLIC_DIRECTORY) }, 'public-directory'), /visible followable/);
});

test('cookie and global navigation links cannot turn a page into a domain discovery root', async t => {
  const html = `<div id="cookie-banner"><a href="https://www.nhs.uk/our-policies/choose-your-cookie-settings/">Choose your cookie settings</a></div>
    <header><nav><a href="https://www.nhs.uk/">NHS home</a></nav></header><main><h1>Medicines A to Z</h1>
    <p>Browse the medicine information, understand the purpose of each treatment, and review its safety details before continuing to an individual medicine page.</p></main>`;
  await assert.rejects(capture(t, { url: PUBLIC_DIRECTORY, html }, 'public-directory'), /visible followable/);
});

test('a task-specific primary navigation link remains a valid observed service path', async t => {
  const html = `<header><nav><a href="${DOMAIN_ITEM}">Benefits</a><a href="https://site.example/cookie-settings">Cookie settings</a></nav></header>
    <main><h1>Public benefit directory</h1><p>Compare relevant support, review requirements, and follow the benefits task before preparing an application.</p></main>`;
  const result = await capture(t, { url: PUBLIC_DIRECTORY, html }, 'public-directory');
  assert.deepEqual(readCurrentDirectDiscoveryEntry(result.root, result.receipt).links, [DOMAIN_ITEM]);
});

test('global navigation alone cannot qualify a public service directory', async t => {
  const html = `<header><nav><a href="https://service.example/about">About Us</a>
    <a href="https://service.example/health-a-to-z">Health A to Z</a>
    <a href="https://service.example/nhs-services">NHS services</a></nav></header>
    <main><h1>Medicines A to Z</h1><p>Browse medicines and prescription information, compare dosage instructions, and prepare questions for your clinician before placing an order. Review the details carefully with your care team.</p></main>`;
  await assert.rejects(capture(t, { url: PUBLIC_DIRECTORY, html }, 'public-directory'), /visible followable/);
});

test('generic navigation nested in main remains chrome', async t => {
  const html = `<main><nav><a href="https://service.example/about">About Us</a></nav>
    <h1>Medicines A to Z</h1><p>Browse medicines and prescription information, compare dosage instructions, and prepare questions for your clinician before placing an order. Review the details carefully with your care team.</p></main>`;
  await assert.rejects(capture(t, { url: PUBLIC_DIRECTORY, html }, 'public-directory'), /visible followable/);
});

test('a support task described in main keeps its primary-navigation path', async t => {
  const support = 'https://service.example/support/request';
  const html = `<header><nav><a href="${support}">Support</a></nav></header>
    <main><h1>Customer support requests</h1><p>Get customer support for your order, submit a support request, and follow its status from this service workspace.</p></main>`;
  const result = await capture(t, { url: PUBLIC_DIRECTORY, html }, 'public-directory');
  assert.deepEqual(readCurrentDirectDiscoveryEntry(result.root, result.receipt).links, [support]);
});

test('page-content task links precede a contextual primary-navigation link', async t => {
  const first = 'https://service.example/apply';
  const html = `<header><nav><a href="${DOMAIN_ITEM}">Benefits</a></nav></header>
    <main><h1>Benefit directory</h1><p>Compare support and prepare an application.</p>
    <a href="${first}">Apply for a benefit</a></main>`;
  const result = await capture(t, { url: PUBLIC_DIRECTORY, html }, 'public-directory');
  assert.deepEqual(readCurrentDirectDiscoveryEntry(result.root, result.receipt).links, [first, DOMAIN_ITEM]);
});

test('a current signed task-bearing direct root can itself be the comparable service', async t => {
  const result = await capture(t, { url: PUBLIC_DIRECTORY, html: directoryHtml(DOMAIN_ITEM) }, 'public-directory');
  const observation = readCurrentDirectDiscoveryEntry(result.root, result.receipt);
  assert.doesNotThrow(() => validateDiscoveryCoverage(result.root, {
    lane: 'domain', queries: [], searches: [], sourceUrls: [PUBLIC_DIRECTORY], navigation: [], directRoots: [observation],
  }));
});

test('snapshot changes are recaptured once and a second change leaves no image', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY, html: directoryHtml(GALLERY_ITEM),
      afterCapture: async (page, count) => {
        await page.evaluate(count => { const anchor = document.querySelector('a'); if (anchor) anchor.href = `https://www.siteinspire.com/website/${count}-changed`; }, count);
      } });
    let failure: unknown;
    try {
      await captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design', createTestProjectWriteAdapter(root), 'free-gallery');
    } catch (error) { failure = error; }
    assert.ok(failure instanceof ReferenceNavigationError);
    assert.match(failure.message, /both bounded captures/);
    assert.ok(failure.attempt);
    assert.equal(readReferenceDiscoveryAttempt(root, failure.attempt).reason, 'unstable-render');
    assert.equal(observed.captures.length, 2);
    assert.equal(existsSync(join(root, '.omd/discovery/design/entries')), false);
  });
});

test('failed navigation receipts are diagnostic-only, signed, and bound to their exact bytes', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY, status: 403, html: directoryHtml(GALLERY_ITEM) });
    let failure: unknown;
    try {
      await captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design', createTestProjectWriteAdapter(root), 'free-gallery');
    } catch (error) { failure = error; }
    assert.ok(failure instanceof ReferenceNavigationError);
    assert.ok(failure.attempt);
    const receipt = failure.attempt;
    const attempt = readReferenceDiscoveryAttempt(root, receipt);
    assert.equal(attempt.httpStatus, 403);
    assert.equal(attempt.reason, 'http-failure');
    assert.ok(receipt.path.startsWith('.omd/discovery/design/attempts/'));
    assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
    assert.equal(loadRefs(root, { includeDomain: true }).length, 0);
    const path = join(root, receipt.path);
    const bytes = readFileSync(path, 'utf8');
    writeFileSync(path, bytes.replace('http-failure', 'challenge-page'));
    assert.throws(() => readReferenceDiscoveryAttempt(root, receipt), /changed|signature|digest/);
    const forgedBytes = bytes.replace('http-failure', 'challenge-page');
    const forgedSha256 = createHash('sha256').update(forgedBytes).digest('hex');
    const forged = { path: `.omd/discovery/design/attempts/${forgedSha256}.json`, sha256: forgedSha256 };
    writeFileSync(join(root, forged.path), forgedBytes);
    assert.throws(() => readReferenceDiscoveryAttempt(root, forged), /signature/);
  });
});

test('failed ordinary navigation is an attempt, not a retained reference', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: PUBLIC_DIRECTORY, status: 403, html: directoryHtml(DOMAIN_ITEM) });
    let failure: unknown;
    try {
      await captureReferenceNavigation(observed.browser, PUBLIC_DIRECTORY, 'domain', createTestProjectWriteAdapter(root));
    } catch (error) { failure = error; }
    assert.ok(failure instanceof ReferenceNavigationError);
    assert.ok(failure.attempt);
    const attempt = readReferenceDiscoveryAttempt(root, failure.attempt);
    assert.equal(attempt.method, 'navigation');
    assert.equal(attempt.entry, null);
    assert.equal(attempt.researchLane, 'domain');
    assert.equal(existsSync(join(root, '.omd/refs')), false);
  });
});

test('public-list classification excludes items, account pages and lookalike hosts', () => {
  assert.equal(designDiscoveryDirectoryProvider(GALLERY_DIRECTORY), 'Siteinspire');
  for (const url of [GALLERY_ITEM, 'https://www.siteinspire.com/login', 'https://www.siteinspire.com/pricing', 'https://siteinspire.com.evil.example/']) {
    assert.equal(designDiscoveryDirectoryProvider(url), null);
  }
});
