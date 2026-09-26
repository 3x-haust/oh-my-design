import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { captureReferenceNavigation, readReferenceDiscoveryAttempt, ReferenceNavigationError } from '../core/ref/navigation-capture.ts';
import { discoveryDigest, readCurrentDirectDiscoveryEntry } from '../core/ref/discovery-record.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { discoveryBrowser, discoveryFixture, GALLERY_DIRECTORY, GALLERY_ITEM } from './helpers/discovery-capture.ts';

test('direct discovery observes a below-fold gallery item through bounded same-page scrolling', async t => {
  // Given: a visible gallery link exists below the initial viewport, beside a hidden link.
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY,
      html: `<p>${'Public list '.repeat(30)}</p><a style="position:absolute;top:1600px" href="${GALLERY_ITEM}">Below fold</a>
        <a style="display:none" href="https://www.siteinspire.com/website/456-hidden">Hidden</a>` });
    // When: native direct entry acquisition explores the same public page.
    const receipt = await captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design',
      createTestProjectWriteAdapter(root), 'free-gallery');
    // Then: only the final viewport's link and matching pixels become signed evidence.
    const record = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
    assert.equal(record.schema, 'reference-discovery-entry-v5');
    assert.deepEqual(readCurrentDirectDiscoveryEntry(root, receipt).links, [GALLERY_ITEM]);
    assert.equal(record.scroll.strategy, 'bounded-same-page-scroll');
    assert.deepEqual(record.scroll.initialOffset, { x: 0, y: 0 });
    assert.equal(record.scroll.finalOffset.x, 0);
    assert.ok(record.scroll.finalOffset.y > 0);
    assert.ok(record.scroll.steps > 0 && record.scroll.steps <= 3);
    assert.equal(observed.captures.length, record.scroll.steps + 1);
    assert.deepEqual(readFileSync(join(root, receipt.evidence.path)), observed.captures.at(-1));
    assert.equal(observed.closed(), 1);
  });
});

test('scroll discovery retains only the final viewport rather than merging earlier links', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY,
      html: `<p>${'Public list '.repeat(30)}</p><a href="https://other.example/">Earlier link</a>
        <a style="position:absolute;top:1600px" href="${GALLERY_ITEM}">Later gallery item</a>` });
    const receipt = await captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design',
      createTestProjectWriteAdapter(root), 'free-gallery');
    assert.deepEqual(readCurrentDirectDiscoveryEntry(root, receipt).links, [GALLERY_ITEM]);
    assert.deepEqual(readFileSync(join(root, receipt.evidence.path)), observed.captures.at(-1));
  });
});

test('scroll recovery completes when the page never calls requestAnimationFrame callbacks', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY,
      html: `<p>${'Public list '.repeat(30)}</p><a style="position:absolute;top:1600px" href="${GALLERY_ITEM}">Below fold</a>
        <script>window.requestAnimationFrame = () => 0;</script>` });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const receipt = await Promise.race([
        captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design', createTestProjectWriteAdapter(root), 'free-gallery'),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('scroll recovery waited for a page-owned animation callback')), 3000);
        }),
      ]);
      assert.deepEqual(readCurrentDirectDiscoveryEntry(root, receipt).links, [GALLERY_ITEM]);
      assert.equal(observed.closed(), 1);
    } finally { clearTimeout(timer); }
  });
});

test('scroll discovery binds offset metadata to its signature and refuses invalid signed metadata', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY,
      html: `<p>${'Public list '.repeat(30)}</p><a style="position:absolute;top:1600px" href="${GALLERY_ITEM}">Below fold</a>` });
    const receipt = await captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design',
      createTestProjectWriteAdapter(root), 'free-gallery');
    const record = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
    const changed = (scroll: unknown, resign: boolean) => {
      const { signature, ...unsigned } = { ...record, scroll };
      const result = { ...unsigned, signature: resign
        ? signNativeObservation(root, 'reference-discovery-entry-v5', discoveryDigest(canonicalJson(unsigned))) : signature };
      const bytes = `${JSON.stringify(result, null, 2)}\n`;
      const sha256 = discoveryDigest(bytes);
      const capture = { path: `.omd/discovery/design/entries/${sha256}.json`, sha256 };
      writeFileSync(join(root, capture.path), bytes);
      return { ...receipt, capture };
    };
    assert.throws(() => readCurrentDirectDiscoveryEntry(root, changed({ ...record.scroll, steps: record.scroll.steps + 1 }, false)), /signature/);
    for (const scroll of [
      { ...record.scroll, steps: 4 },
      { ...record.scroll, strategy: 'arbitrary-scroll' },
      { ...record.scroll, finalOffset: { x: 0, y: 4000 } },
      { ...record.scroll, finalOffset: record.scroll.initialOffset },
      { ...record.scroll, finalOffset: { x: 1, y: record.scroll.finalOffset.y } },
      { ...record.scroll, initialOffset: { x: 0, y: -1 } },
      { ...record.scroll, hiddenLinks: [GALLERY_ITEM] },
      { ...record.scroll, finalOffset: { ...record.scroll.finalOffset, extra: true } },
    ]) {
      assert.throws(() => readCurrentDirectDiscoveryEntry(root, changed(scroll, true)), /bounded discovery scroll|expected exactly/);
    }
  });
});

test('an unstable scrolled viewport cannot publish a discovery entry or screenshot', async t => {
  const root = discoveryFixture(t);
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY,
      html: `<p>${'Public list '.repeat(30)}</p><a style="position:absolute;top:1200px" href="${GALLERY_ITEM}">Below fold</a>`,
      afterCapture: async (page, count) => {
        if (count < 2) return;
        await page.locator('a').evaluate((anchor, count) => {
          anchor.setAttribute('href', `https://www.siteinspire.com/website/${count}-changed`);
        }, count);
      } });
    await assert.rejects(captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design',
      createTestProjectWriteAdapter(root), 'free-gallery'), error => {
      assert.ok(error instanceof ReferenceNavigationError);
      assert.ok(error.attempt);
      assert.equal(readReferenceDiscoveryAttempt(root, error.attempt).reason, 'unstable-render');
      return true;
    });
    assert.equal(observed.captures.length, 3);
    assert.equal(existsSync(join(root, '.omd/discovery/design/entries')), false);
  });
});

for (const scenario of [
  { name: 'login overlay', mutation: `document.body.insertAdjacentHTML('beforeend','<form style="position:fixed;inset:0;background:white"><input type="password"></form>')`, error: /login form/ },
  { name: 'challenge', mutation: `document.title = 'Just a moment'`, error: /challenge page/ },
  { name: 'URL change', mutation: `history.replaceState(null, '', '/websites')`, error: /document, URL/ },
]) {
  test(`scroll recovery refuses a ${scenario.name} appearing after the initial observation`, async t => {
    const root = discoveryFixture(t);
    await withBrowser(async browser => {
      const observed = discoveryBrowser(browser, { url: GALLERY_DIRECTORY,
        html: `<p>${'Public list '.repeat(30)}</p><a style="position:absolute;top:1600px" href="${GALLERY_ITEM}">Below fold</a>
          <script>addEventListener('scroll', () => { ${scenario.mutation} }, { once: true });</script>` });
      await assert.rejects(captureReferenceNavigation(observed.browser, GALLERY_DIRECTORY, 'design',
        createTestProjectWriteAdapter(root), 'free-gallery'), scenario.error);
      assert.equal(existsSync(join(root, '.omd/discovery/design/entries')), false);
    });
  });
}
