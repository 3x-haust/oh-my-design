import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { connect } from 'node:net';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
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
    assert.equal(record.schema, 'reference-navigation-capture-v2');
    assert.deepEqual(readStrictDiscoveryNavigation(root, receipt), { url: PUBLIC_DIRECTORY, finalUrl: PUBLIC_DIRECTORY, links: [DOMAIN_ITEM] });
    assert.throws(() => readDirectDiscoveryEntry(root, { method: 'direct-public', entry: 'public-directory', ...receipt }), /purpose path/);
  });
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
    assert.equal(record.schema, 'reference-discovery-entry-v3');
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
    html: `<main><h1>Global service directory</h1><p>Available services<span style="display:none"> South Korea residents market</span><span style="clip-path:inset(100%)"> South Korea service market</span><span style="color:transparent"> South Korea product audience</span></p><a href="${DOMAIN_ITEM}">Inspect service</a></main>` },
  'public-directory');
  const observation = readCurrentDirectDiscoveryEntry(result.root, result.receipt);
  assert.match(observation.observedText ?? '', /Global service directory/);
  assert.doesNotMatch(observation.observedText ?? '', /South Korea/);
});

test('direct-entry visible text excludes copy covered by an opaque child overlay', async t => {
  const result = await capture(t, { url: PUBLIC_DIRECTORY,
    html: `<main><h1>Global directory</h1><p style="position:relative">South Korea service directory for residents<span style="position:absolute;inset:0;background:white;pointer-events:none">Global catalogue</span></p><a href="${DOMAIN_ITEM}">Inspect service</a></main>` },
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
      await assert.rejects(captureReferenceNavigation(observed.browser, row.scenario.url, 'design', createTestProjectWriteAdapter(root), 'free-gallery'), row.error);
      assert.equal(observed.closed(), 1);
      assert.equal(existsSync(join(root, '.omd/discovery')), false);
    });
  });
}

test('a self-link alone cannot make a domain page a discovery root', async t => {
  await assert.rejects(capture(t, { url: PUBLIC_DIRECTORY, html: directoryHtml(PUBLIC_DIRECTORY) }, 'public-directory'), /visible followable/);
});

test('snapshot changes are recaptured once and a second change leaves no image', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY, html: directoryHtml(GALLERY_ITEM),
      afterCapture: async (page, count) => {
        await page.evaluate(count => { const anchor = document.querySelector('a'); if (anchor) anchor.href = `https://www.siteinspire.com/website/${count}-changed`; }, count);
      } });
    await assert.rejects(captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design', createTestProjectWriteAdapter(root), 'free-gallery'), /both bounded captures/);
    assert.equal(observed.captures.length, 2);
    assert.equal(existsSync(join(root, '.omd/discovery')), false);
  });
});

test('public-list classification excludes items, account pages and lookalike hosts', () => {
  assert.equal(designDiscoveryDirectoryProvider(GALLERY_DIRECTORY), 'Siteinspire');
  for (const url of [GALLERY_ITEM, 'https://www.siteinspire.com/login', 'https://www.siteinspire.com/pricing', 'https://siteinspire.com.evil.example/']) {
    assert.equal(designDiscoveryDirectoryProvider(url), null);
  }
});
