import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { capturePageForRef, extractIr, withBrowser } from '../core/render/index.ts';
import { normalize } from '../core/ir/normalize.ts';
import { captureBlueprint } from '../core/ref/blueprint.ts';
import { similarity } from '../core/ref/distance.ts';
import { extractInvariants } from '../core/ref/invariants.ts';

test('HTTP component examples are measurable without admitting hollow or blocked pages', async () => {
  const server = createServer((request, response) => {
    const path = request.url;
    response.statusCode = path === '/forbidden' ? 403 : 200;
    response.setHeader('content-type', 'text/html');
    if (path === '/iframe-host') {
      response.end(`<!doctype html><title>Component examples</title>
        <p>${'Documentation around embedded component examples. '.repeat(8)}</p>
        <iframe class="example-frame" title="Default example" src="/embedded-default"></iframe>
        <iframe class="example-frame" title="Intended success state" src="/embedded-success"></iframe>`);
      return;
    }
    if (path === '/embedded-default') {
      response.end('<!doctype html><title>Default</title><p class="default">A different first example.</p>');
      return;
    }
    if (path === '/embedded-error') {
      response.end(`<!doctype html><title>Error example</title><style>
        .error-card{display:flex;flex-direction:column;gap:8px;padding:16px 24px;border-radius:4px}
        .error-card h2{font-size:24px}.error-card p{font-size:16px}.error-card strong{font-weight:700}
      </style><section class="error-card"><h2>There is a problem</h2><p><strong>Error:</strong> enter a valid date.</p></section>`);
      return;
    }
    if (path === '/embedded-success') {
      response.end(`<!doctype html><title>Success example</title><style>
        .success-card{display:grid;gap:20px;padding:32px;border-radius:16px}
        .success-card header{display:flex;padding:12px}.success-card h2{font-size:32px}
        .success-card p{font-size:18px}.success-card a{font-size:18px;font-weight:600}
      </style><section class="success-card"><header><h2>Saved</h2></header><p>Your application was received.</p><a href="#next">Continue</a></section>`);
      return;
    }
    response.end(`<!doctype html><title>${path === '/challenge' ? 'Just a moment...' : 'Component example'}</title>
      <style>.feedback{padding:24px;border:4px solid #176f44} .hidden{display:none}</style>
      <main style="opacity:${path === '/transparent-parent' ? 0 : 1}">
      <section class="feedback ${path === '/hidden' ? 'hidden' : ''}" role="status">
      ${path === '/empty' ? '' : '<h2>Saved</h2><p>Your changes are ready.</p>'}</section></main>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const viewport = { width: 1440, height: 900 };
  try {
    const raw = await extractIr(base, { viewport, selector: '.feedback' });
    assert.ok(raw.nodes.length > 0, 'real component geometry must be extracted');
    for (const selector of [null, 'body', 'html', '*', '.missing']) {
      await assert.rejects(() => extractIr(base, { viewport, selector }), /near-empty body/);
    }
    for (const path of ['/empty', '/hidden', '/transparent-parent']) {
      await assert.rejects(() => extractIr(base + path, { viewport, selector: '.feedback' }), /near-empty body/);
    }
    await assert.rejects(() => extractIr(base + '/forbidden', { viewport, selector: '.feedback' }), /HTTP 403/);
    await assert.rejects(() => extractIr(base + '/challenge', { viewport, selector: '.feedback' }), /challenge page/);

    await withBrowser(async (browser) => {
      await assert.rejects(
        () => capturePageForRef(browser, base + '/iframe-host', viewport, { selector: 'iframe.example-frame' }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /opaque iframe/);
          assert.match(error.message, new RegExp(`${base}/embedded-default`));
          assert.match(error.message, /inspect the intended iframe and state/i);
          assert.match(error.message, /do not assume the first matching frame/i);
          return true;
        },
      );
    });

    // Recapturing the embedded documents themselves yields real, distinct component anatomy.
    const errorRaw = await extractIr(base + '/embedded-error', { viewport, selector: '.error-card' });
    const successRaw = await extractIr(base + '/embedded-success', { viewport, selector: '.success-card' });
    const errorBlueprint = captureBlueprint(errorRaw.nodes, '.error-card');
    const successBlueprint = captureBlueprint(successRaw.nodes, '.success-card');
    const errorInvariants = extractInvariants(normalize(errorRaw));
    const successInvariants = extractInvariants(normalize(successRaw));
    assert.ok(errorBlueprint.nodes.length >= 3 && successBlueprint.nodes.length >= 4);
    assert.ok(errorInvariants.typeScale.length > 0 && successInvariants.typeScale.length > 0);
    assert.notDeepEqual(errorBlueprint.nodes, successBlueprint.nodes);
    assert.ok(similarity(errorInvariants, successInvariants) < 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
