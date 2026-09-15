import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer, type ServerResponse } from 'node:http';
import { captureReferenceCraft } from '../core/ref/reference-craft-capture.ts';
import { onPage, withBrowser } from '../core/render/index.ts';

const fixture = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
const viewport = { width: 800, height: 600 };

test('captureReferenceCraft measures reveal motion and scroll-linkage on a real reveal fixture', async () => {
  const craft = await captureReferenceCraft(fixture('craft-reveal.html'), {
    source: 'fixture', as: 'reveal-part', technique: 'scroll reveal', viewport, selector: '#part',
  });
  assert.equal(craft.schema, 'reference-craft-v1');
  assert.equal(craft.selector, '#part');
  assert.ok(craft.motion.peakEnergy > 0.01, `expected observed motion, got ${craft.motion.peakEnergy}`);
  assert.equal(craft.motion.scrollLinked, true);
  assert.equal(craft.motion.reducedMotionSafe, true);
});

test('captureReferenceCraft records a static part as not moving and not scroll-linked', async () => {
  const craft = await captureReferenceCraft(fixture('craft-static.html'), {
    source: 'fixture', as: 'static-part', technique: 'none', viewport, selector: '#part',
  });
  assert.ok(craft.motion.peakEnergy < 0.01, `expected static, got ${craft.motion.peakEnergy}`);
  assert.equal(craft.motion.scrollLinked, false);
  assert.equal(craft.motion.reducedMotionSafe, true);
});

test('craft capture rejects an absent named target instead of measuring the document fallback', async () => {
  await assert.rejects(captureReferenceCraft(fixture('craft-static.html'), {
    source: 'fixture', as: 'missing-part', technique: 'none', viewport, selector: '#missing-part',
  }), /missing-part/);
});

test('craft capture retains first-match semantics for selectors matching several elements', async () => {
  const craft = await captureReferenceCraft(fixture('craft-static.html'), {
    source: 'fixture', as: 'first-match', technique: 'none', viewport, selector: '#hero, #part',
  });
  assert.equal(craft.selector, '#hero, #part');
  assert.ok(craft.motion.peakEnergy < 0.01);
  assert.equal(craft.motion.reducedMotionSafe, true);
});

test('craft capture observes a loaded component while background requests remain open', async () => {
  const streams = new Set<ServerResponse>();
  let streamRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === '/stream') {
      streamRequests++;
      streams.add(response);
      response.setHeader('content-type', 'text/plain');
      response.write('connected\n');
      response.on('close', () => streams.delete(response));
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><title>Live connection fixture</title>
      <style>body{margin:0}#part{width:400px;height:300px;background:red;animation:pulse .8s linear infinite alternate}
      @keyframes pulse{to{background:blue}}@media(prefers-reduced-motion:reduce){#part{animation:none}}</style>
      <section id="part">Visible component with a persistent background request</section>
      <script>fetch('/stream').then(response=>response.text());</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    await withBrowser(browser => onPage(browser, url, viewport, async page => {
      assert.equal(await page.evaluate(() => document.readyState), 'complete');
      assert.equal(await page.locator('#part').isVisible(), true);
      assert.ok(streams.size > 0, 'outside server observes a pending request despite a loaded component');
    }));
    const baselineRequests = streamRequests;
    const craft = await captureReferenceCraft(url, {
      source: url, as: 'live-part', technique: 'observed color transition', viewport, selector: '#part',
    });
    assert.ok(craft.motion.peakEnergy > 0.01);
    assert.equal(craft.motion.reducedMotionSafe, true);
    assert.ok(streamRequests >= baselineRequests + 2, 'normal and fresh reduced-motion documents both keep a live request');
  } finally {
    for (const stream of streams) stream.end();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
