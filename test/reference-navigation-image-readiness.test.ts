import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Browser } from 'playwright';
import { withBrowser } from '../core/render/index.ts';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { readCurrentDiscoveryNavigation } from '../core/ref/discovery-record.ts';
import { loadRefs } from '../core/ref/store.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { directoryHtml } from './helpers/discovery-capture.ts';
import { trustedLifecyclePng } from './helpers/trusted-lifecycle-png.ts';

test('product navigation captures eager originals that finish loading during preparation', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-eager-original-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = 'https://personal-work.example.com/';
  const imageUrl = `${source}workspace.png`;
  const bytes = trustedLifecyclePng('1280x900');
  let releaseResponse: (() => void) | undefined;
  const responseReady = new Promise<void>(resolve => { releaseResponse = resolve; });
  assert.ok(releaseResponse);
  const release = releaseResponse;
  t.after(release);
  let closed = 0;
  const receipt = await withBrowser(async browser => {
    const observed = new Proxy(browser, {
      get(target, property) {
        if (property !== 'newContext') return Reflect.get(target, property, target);
        return async (options: Parameters<Browser['newContext']>[0]) => {
          const context = await target.newContext(options);
          context.on('close', () => { closed++; });
          const newPage = context.newPage.bind(context);
          context.newPage = async () => {
            const page = await newPage();
            await page.exposeBinding('imageListener', release);
            await page.addInitScript(() => {
              const add = HTMLImageElement.prototype.addEventListener;
              HTMLImageElement.prototype.addEventListener = function (this: HTMLImageElement, ...args: Parameters<typeof add>) {
                const result = add.apply(this, args);
                if (args[0] === 'load') {
                  const signal: unknown = Reflect.get(window, 'imageListener');
                  if (typeof signal === 'function') void signal();
                }
                return result;
              };
            });
            await page.route(imageUrl, async route => {
              await responseReady;
              await route.fulfill({ contentType: 'image/png', body: bytes });
            });
            await page.route(source, route => route.fulfill({
              contentType: 'text/html',
              body: `${directoryHtml()}<img id="task-view" src="${imageUrl}" width="600" height="422">`,
            }));
            const screenshot = page.screenshot.bind(page);
            page.screenshot = async options => {
              release();
              await page.locator('#task-view').evaluate(element => {
                if (!(element instanceof HTMLImageElement)) throw new Error('image expected');
                return element.decode();
              });
              return screenshot(options);
            };
            return page;
          };
          return context;
        };
      },
    });
    return captureReferenceNavigation(observed, source, 'design', createTestProjectWriteAdapter(root));
  });
  const observation = readCurrentDiscoveryNavigation(root, receipt);
  assert.deepEqual(observation.imageCandidates?.map(item => item.selector), ['#task-view']);
  assert.equal(observation.imageCandidates?.[0]?.naturalWidth, 1280);
  const pixels = readFileSync(join(root, receipt.evidence.path));
  assert.equal(pixels.readUInt32BE(16), 2560);
  assert.equal(pixels.readUInt32BE(20), 1800);
  assert.equal(loadRefs(root, { includeDomain: true }).length, 0);
  assert.equal(closed, 1);
});

test('product navigation prepares late high-ranked images beyond eight pending elements', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-ninth-original-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = 'https://personal-work.example.com/';
  const bytes = trustedLifecyclePng('1280x900');
  const pending = Array.from({ length: 9 }, (_, index) => {
    let release: (() => void) | undefined;
    const ready = new Promise<void>(resolve => { release = resolve; });
    assert.ok(release);
    return { id: `image-${index}`, ready, release };
  });
  t.after(() => pending.forEach(image => image.release()));
  const receipt = await withBrowser(async browser => {
    const observed = new Proxy(browser, {
      get(target, property) {
        if (property !== 'newContext') return Reflect.get(target, property, target);
        return async (options: Parameters<Browser['newContext']>[0]) => {
          const context = await target.newContext(options);
          const newPage = context.newPage.bind(context);
          context.newPage = async () => {
            const page = await newPage();
            await page.exposeBinding('imageListener', (_source, id: unknown) => {
              const image = pending.find(item => item.id === id);
              assert.ok(image);
              image.release();
            });
            await page.addInitScript(() => {
              const add = HTMLImageElement.prototype.addEventListener;
              HTMLImageElement.prototype.addEventListener = function (this: HTMLImageElement, ...args: Parameters<typeof add>) {
                const result = add.apply(this, args);
                if (args[0] === 'load') {
                  const signal: unknown = Reflect.get(window, 'imageListener');
                  if (typeof signal === 'function') void signal(this.id);
                }
                return result;
              };
            });
            for (const image of pending) {
              await page.route(`${source}${image.id}.png`, async route => {
                await image.ready;
                await route.fulfill({ contentType: 'image/png', body: bytes });
              });
            }
            await page.route(source, route => route.fulfill({
              contentType: 'text/html',
              body: `${directoryHtml()}${pending.map((image, index) =>
                `<img id="${image.id}" src="${source}${image.id}.png" width="${index === 8 ? 800 : 100}" height="${index === 8 ? 500 : 100}">`).join('')}`,
            }));
            const screenshot = page.screenshot.bind(page);
            page.screenshot = async options => {
              pending.forEach(image => image.release());
              await page.locator('#image-8').evaluate(element => {
                if (!(element instanceof HTMLImageElement)) throw new Error('image expected');
                return element.decode();
              });
              return screenshot(options);
            };
            return page;
          };
          return context;
        };
      },
    });
    return captureReferenceNavigation(observed, source, 'design', createTestProjectWriteAdapter(root));
  });
  const observation = readCurrentDiscoveryNavigation(root, receipt);
  assert.equal(observation.imageCandidates?.length, 8);
  assert.equal(observation.imageCandidates?.[0]?.selector, '#image-8');
  assert.equal(loadRefs(root, { includeDomain: true }).length, 0);
});
