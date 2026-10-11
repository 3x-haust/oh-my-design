import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { capturePageForRef, withBrowser } from '../core/render/index.ts';
import { captureOriginalImage } from '../core/ref/native-image-capture.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const originalPixels = new PNG({ width: 1600, height: 1280 });
for (let offset = 0; offset < originalPixels.data.length; offset += 4) {
  const left = (offset / 4) % originalPixels.width < originalPixels.width / 2;
  originalPixels.data[offset] = left ? 32 : 232;
  originalPixels.data[offset + 1] = left ? 98 : 215;
  originalPixels.data[offset + 2] = left ? 202 : 181;
  originalPixels.data[offset + 3] = 255;
}
const original = PNG.sync.write(originalPixels);
const thumbnail = PNG.sync.write(new PNG({ width: 319, height: 309 }));
const lookup = async () => [{ address: '93.184.215.14', family: 4 }];

for (const contentType of ['application/octet-stream', 'binary/octet-stream']) {
  test(`native original PNG retains exact pixels and digest when served as ${contentType}`, async () => {
    await withBrowser(async browser => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await page.route('https://images.example/**', route =>
          route.fulfill({ status: 200, contentType: 'image/png', body: original }));
        await page.setContent('<img id="original" src="https://images.example/original.png">');
        await page.locator('#original').evaluate(image => {
          if (!(image instanceof HTMLImageElement)) throw new Error('Expected original image');
          return image.decode();
        });
        const captured = await captureOriginalImage(page, '#original', lookup,
          async () => ({ status: 200, contentType, bytes: original }));
        assert.deepEqual(captured.bytes, original);
        assert.deepEqual([captured.width, captured.height], [1600, 1280]);
        assert.equal(captured.sourceSha256, createHash('sha256').update(original).digest('hex'));
      } finally { await context.close(); }
    });
  });
}

test('binary PNG recognition still refuses non-images, corrupt PNGs and exceeded bounds', async t => {
  await withBrowser(async browser => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.route('https://images.example/**', route =>
        route.fulfill({ status: 200, contentType: 'image/png', body: original }));
      await page.setContent('<img id="original" src="https://images.example/original.png">');
      await page.locator('#original').evaluate(image => {
        if (!(image instanceof HTMLImageElement)) throw new Error('Expected original image');
        return image.decode();
      });
      const oversizedDimensions = Buffer.from(original);
      oversizedDimensions.writeUInt32BE(8193, 16);
      const cases = [
        { name: 'binary non-image', contentType: 'binary/octet-stream', bytes: Buffer.from('<html>not an image or reference</html>') },
        { name: 'explicit HTML MIME', contentType: 'text/html', bytes: original },
        { name: 'truncated PNG', contentType: 'application/octet-stream', bytes: original.subarray(0, 24) },
        { name: 'truncated image MIME PNG', contentType: 'image/png', bytes: original.subarray(0, 24) },
        { name: 'oversized bytes', contentType: 'binary/octet-stream', bytes: Buffer.alloc(32_000_001) },
        { name: 'oversized native dimensions', contentType: 'binary/octet-stream', bytes: oversizedDimensions },
      ];
      for (const fixture of cases) {
        await t.test(fixture.name, async () => {
          await assert.rejects(captureOriginalImage(page, '#original', lookup,
            async () => ({ status: 200, contentType: fixture.contentType, bytes: fixture.bytes })));
        });
      }
    } finally { await context.close(); }
  });
});

test('test-048 list-card thumbnail is replaced by the complete largest srcset original and source digest', async () => {
  await withBrowser(async browser => {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    try {
      const page = await context.newPage();
      await page.route('https://images.example/**', route => route.fulfill({ status: 200, contentType: 'image/png',
        body: route.request().url().endsWith('original.png') ? original : thumbnail }));
      await page.setContent('<main><article><img id="card" src="https://images.example/thumb.png" srcset="https://images.example/thumb.png 319w, https://images.example/original.png 1600w" style="width:319px;height:309px"></article></main>');
      await page.locator('#card').evaluate(image => (image as HTMLImageElement).decode());
      const result = await captureOriginalImage(page, '#card', lookup, async url => {
        assert.equal(url, 'https://images.example/original.png');
        return { status: 200, contentType: 'image/png', bytes: original };
      });
      assert.equal(result.sourceUrl, 'https://images.example/original.png');
      assert.deepEqual(result.bytes, original);
      assert.deepEqual([result.width, result.height], [1600, 1280]);
      assert.equal(result.sourceSha256, createHash('sha256').update(original).digest('hex'));
      assert.notDeepEqual(result.bytes, thumbnail);
    } finally { await context.close(); }
  });
});

for (const scenario of ['product', 'image-document', 'lazy-product'] as const) {
  const imageDocument = scenario === 'image-document';
  const lazy = scenario === 'lazy-product';
  test(`native reference capture retains original pixels for ${imageDocument ? 'an image document' : lazy ? 'a below-fold lazy product-page image' : 'a product-page image selector'}`, async t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-native-product-image-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const adapter = createTestProjectWriteAdapter(root);
    await withBrowser(async browser => {
      const routedBrowser = new Proxy(browser, {
        get(target, property) {
          if (property === 'newPage') return async (options: Parameters<typeof browser.newPage>[0]) => {
            const page = await target.newPage(options);
            await page.route('https://images.example/**', route =>
              route.fulfill({ status: 200, contentType: 'image/png', body: original }));
            await page.route('https://product.example/**', route => route.fulfill({
              status: 200, contentType: 'text/html',
              body: `<main><h1>Product documentation</h1><p>${'Instructions surrounding the released product screenshot. '.repeat(8)}</p>
                <img id="product-screen" loading="${lazy ? 'lazy' : 'eager'}" src="https://images.example/original.png"
                  style="width:319px;height:255px${lazy ? ';margin-top:12000px' : ''}"></main>`,
            }));
            return page;
          };
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const captured = await capturePageForRef(routedBrowser,
        imageDocument ? 'https://images.example/original.png' : 'https://product.example/help',
        { width: 1440, height: 900 }, {
          ...(imageDocument ? {} : { selector: '#product-screen' }),
          shotOut: join(root, '.omd/refs/design/original.png'), adapter, deferShotWrite: true,
          viewportShot: true, imageLookup: lookup,
          imageFetch: async url => {
            assert.equal(url, 'https://images.example/original.png');
            if (lazy) {
              const page = browser.contexts()[0]?.pages()[0];
              assert.ok(page);
              assert.deepEqual(await page.evaluate(() => ({ scroll: scrollY,
                loaded: document.querySelector<HTMLImageElement>('#product-screen')?.complete })), {
                scroll: 0, loaded: false,
              });
            }
            return { status: 200, contentType: 'image/png', bytes: original };
          },
        });
      assert.equal(captured.acquisition.sourceImage, 'https://images.example/original.png');
      assert.deepEqual(captured.shotBytes, original);
      assert.deepEqual(captured.acquisition.imageDimensions, { width: 1600, height: 1280 });
      assert.equal(captured.acquisition.sourceImageSha256, createHash('sha256').update(original).digest('hex'));
    });
  });
}
