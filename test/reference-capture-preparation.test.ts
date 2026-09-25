import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { addRefsBatch, type RefSpec } from '../core/ref/batch.ts';
import { observeCapturePreparation, parseCapturePreparation, type CapturePreparation } from '../core/ref/capture-preparation.ts';
import { loadRefs, refImagePath } from '../core/ref/store.ts';
import { capturePageForRef, onPage, withBrowser } from '../core/render/index.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { decodePng } from '../core/motion/energy.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const RULES = new URL('../core/rules/builtin', import.meta.url).pathname;
const CLI = new URL('../bin/omd.ts', import.meta.url).pathname;
const preparation = (): CapturePreparation => ({
  schema: 'reference-capture-preparation-v1', actions: [{ kind: 'click', selector: '#menu-toggle' }],
  assertions: [{ selector: '#menu', state: 'visible' }],
});
const project = () => mkdtempSync(join(tmpdir(), 'omd-capture-preparation-'));
function bluePixels(path: string): number {
  const { pixels, channels } = decodePng(readFileSync(path));
  let count = 0;
  for (let i = 0; i < pixels.length; i += channels) {
    if (pixels[i] === 0 && pixels[i + 1] === 0 && pixels[i + 2] === 255) count++;
  }
  return count;
}
async function fixture(run: (url: string, requests: string[]) => Promise<void>): Promise<void> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><title>Disclosure capture test fixture</title>
      <style>body{font:18px system-ui;padding:36px;background:#f3f5f7}#fixture{width:420px;padding:24px;background:white}button{padding:12px}#menu{margin-top:16px;padding:20px;background:#173b4d;color:white}li{padding:8px}</style>
      <section id="fixture"><h1>Capture test fixture</h1><p>A local menu used only to verify capture behavior.</p>
      <button type="button" id="menu-toggle" aria-expanded="false" aria-controls="menu">Open menu</button>
      <div id="menu" hidden><strong>Visible after explicit click</strong><ul><li>Overview</li><li>Saved items</li><li>Preferences</li></ul></div>
      <form action="/submitted"><button id="submit" aria-expanded="false" aria-controls="menu">Submit</button></form></section>
      <script>const button=document.querySelector('#menu-toggle'); const menu=document.querySelector('#menu');
      button.addEventListener('click',()=>{menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));});
      button.addEventListener('blur',()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');});</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try { await run(`http://127.0.0.1:${address.port}`, requests); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
function runCli(root: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: root });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('capture preparation schema permits only explicit disclosure clicks and visibility assertions', () => {
  assert.deepEqual(parseCapturePreparation(inputSkeleton('reference-capture-preparation').skeleton), preparation());
  for (const value of [
    { ...preparation(), script: 'menu.open()' },
    { ...preparation(), assertions: [] }, { ...preparation(), actions: Array(9).fill(preparation().actions[0]) },
    { ...preparation(), actions: [{ kind: 'press', selector: '#menu-toggle', key: 'Enter' }] },
    { ...preparation(), actions: [{ kind: 'click', selector: '#menu-toggle', script: 'submit()' }] },
    { ...preparation(), assertions: [{ selector: '#menu', state: 'selected' }] },
  ]) assert.throws(() => parseCapturePreparation(value), /reference capture preparation/);
});

test('visible preparation waits for hydrated content while missing and ambiguous observations fail', async () => {
  await withBrowser(async browser => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<section id="schedule"><p>Loading schedule</p></section>
        <script>setTimeout(() => { document.querySelector('#schedule').innerHTML = '<h2 id="class-title">Yoga Flow</h2>'; }, 150)</script>`);
      const prep: CapturePreparation = { schema: 'reference-capture-preparation-v1', actions: [], assertions: [{ selector: '#class-title', state: 'visible' }] };
      assert.equal(await page.locator('#class-title').count(), 0, 'the element is initially absent');
      assert.deepEqual(await observeCapturePreparation(page, prep), [{ selector: '#class-title', state: 'visible', passed: true }]);
      for (const state of ['visible', 'hidden'] as const) {
        await assert.rejects(observeCapturePreparation(page, { ...prep, assertions: [{ selector: '#missing', state }] }), /exactly one existing element/);
      }
      await page.setContent('<h2>First class</h2><h2>Second class</h2>');
      await assert.rejects(observeCapturePreparation(page, { ...prep, assertions: [{ selector: 'h2', state: 'visible' }] }), /exactly one existing element/);
    } finally { await page.close(); }
  });
});

test('observe-only preparation preserves actual initial focus without granting a focus action', async () => {
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><title>Initial focus capture fixture</title>
      <style>section{padding:40px}input{border:8px solid gray}input:focus{border-color:blue}output{display:block}</style>
      <section id="fixture"><label>Search <input id="query" autofocus></label><button>Other control</button><output id="state">focused</output></section>
      <script>document.querySelector('#query').focus();document.querySelector('#query').addEventListener('blur',()=>document.querySelector('#state').textContent='blurred');</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const prep: CapturePreparation = { schema: 'reference-capture-preparation-v1', actions: [], assertions: [{ selector: '#query:focus', state: 'visible' }] };
  try {
    assert.deepEqual(parseCapturePreparation(prep), prep);
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await withBrowser(browser => onPage(browser, url, viewport, async page => {
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'query');
        assert.equal(await page.locator('#state').textContent(), 'focused');
      }));
      const root = project(); const adapter = createTestProjectWriteAdapter(root);
      const shotOut = join(root, 'focused.png');
      const captured = await withBrowser(browser => capturePageForRef(browser, url, viewport, { selector: '#fixture', preparation: prep, shotOut, adapter }));
      assert.equal(captured.shotSaved, true);
      assert.deepEqual(captured.capturePreparation?.executedActions, []);
      assert.deepEqual(captured.capturePreparation?.observations, [{ selector: '#query:focus', state: 'visible', passed: true }]);
      assert.equal(captured.raw.meta?.interaction, null); assert.equal(captured.raw.meta?.motion, null);
      assert.ok(bluePixels(shotOut) > 100, 'saved PNG itself must show the focused blue border');
      console.log(`INITIAL FOCUS TEST FIXTURE ONLY: ${shotOut}`);
      const probedShot = join(root, 'probed.png');
      const probed = await withBrowser(browser => capturePageForRef(browser, url, viewport, { selector: '#fixture', shotOut: probedShot, adapter }));
      assert.ok(probed.raw.meta?.interaction, 'ordinary captures still measure interaction after retaining the initial state');
      assert.ok(bluePixels(probedShot) > 100, 'ordinary captures now preserve the focused initial-state pixels before probing');
      await assert.rejects(withBrowser(browser => capturePageForRef(browser, url, viewport, {
        selector: '#fixture', preparation: { ...prep, assertions: [{ selector: 'button:focus', state: 'visible' }] },
      })), /must identify exactly one existing element/);
    }
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('real disclosure preparation captures the opened menu on the same page and records unmeasured probes', async () => {
  await fixture(async url => {
    await withBrowser(browser => onPage(browser, url, { width: 1280, height: 900 }, async page => {
      assert.equal(await page.locator('#menu').isVisible(), false, 'fixture begins closed');
    }));
    const root = project(); const adapter = createTestProjectWriteAdapter(root);
    const source = `${url}/opened`; const spec: RefSpec = { source, as: 'opened-menu', selector: '#menu', slot: 'menu', blueprint: true, shot: true, energy: false, viewport: '390x844', preparation: preparation() };
    const result = await addRefsBatch(root, [spec], { rulesRoot: RULES }, adapter);
    assert.equal(result.outcomes[0]?.ok, true, result.outcomes[0]?.error ?? 'capture should succeed');
    const ref = loadRefs(root)[0]; assert.ok(ref?.blueprint?.nodes.length);
    assert.deepEqual(ref.viewport, { width: 390, height: 844 });
    assert.deepEqual(ref.capturePreparation?.executedActions, preparation().actions);
    assert.deepEqual(ref.capturePreparation?.observations, [{ selector: '#menu', state: 'visible', passed: true }]);
    assert.deepEqual(ref.capturePreparation?.viewport, ref.viewport);
    assert.deepEqual(ref.capturePreparation?.notMeasured, ['interaction-probe', 'motion-probe', 'energy-curve']);
    assert.deepEqual(ref.invariants?.measurementCoverage, { interactionProbe: 'not-measured', motionProbe: 'not-measured', energyCurve: 'not-measured' });
    assert.equal(ref.energyCurve, undefined);
    const image = refImagePath(root, { source, component: 'opened-menu' });
    const bytes = readFileSync(image); assert.ok(bytes.readUInt32BE(16) > 100); assert.ok(bytes.readUInt32BE(20) > 100);
    console.log(`TEST FIXTURE ONLY, not a new design: ${image}`);
    const captured = await withBrowser(browser => capturePageForRef(browser, url, { width: 1280, height: 900 }, { selector: '#menu', preparation: preparation() }));
    assert.equal(captured.raw.meta?.interaction, null); assert.equal(captured.raw.meta?.motion, null);
    assert.match(JSON.stringify(captured.raw.nodes), /Visible after explicit click/);
    const closed = await withBrowser(browser => capturePageForRef(browser, url, { width: 1280, height: 900 }, {
      selector: '#fixture', preparation: { ...preparation(), actions: [preparation().actions[0]!, preparation().actions[0]!], assertions: [{ selector: '#menu', state: 'hidden' }] },
    }));
    assert.deepEqual(closed.capturePreparation?.observations, [{ selector: '#menu', state: 'hidden', passed: true }]);
    const initial = await withBrowser(browser => capturePageForRef(browser, url, { width: 1280, height: 900 }, { selector: '#fixture' }));
    assert.equal(initial.capturePreparation, undefined); assert.ok(initial.raw.meta?.interaction);
  });
});

test('failed assertions and unsupported controls publish neither a capture nor a reference', async () => {
  await fixture(async (url, requests) => {
    for (const prep of [
      { ...preparation(), assertions: [{ selector: '#menu', state: 'hidden' as const }] },
      { ...preparation(), actions: [{ kind: 'click' as const, selector: '#submit' }] },
      { ...preparation(), assertions: [{ selector: '#fixture', state: 'visible' as const }] },
    ]) {
      const root = project(); const source = `${url}/failed`;
      const result = await addRefsBatch(root, [{ source, as: 'failed-menu', selector: '#menu', blueprint: true, shot: true, energy: false, preparation: prep }], { rulesRoot: RULES }, createTestProjectWriteAdapter(root));
      assert.equal(result.outcomes[0]?.ok, false);
      assert.equal(loadRefs(root).length, 0);
      assert.equal(existsSync(refImagePath(root, { source, component: 'failed-menu' })), false);
    }
    assert.ok(requests.every(request => !request.includes('/submitted')));
  });
});

test('prepared batches reject energy unless explicitly disabled before navigation', async () => {
  await fixture(async (url, requests) => {
    const root = project();
    for (const energy of [undefined, true]) {
      const result = await addRefsBatch(root, [{ source: url, as: 'energy', preparation: preparation(), ...(energy === undefined ? {} : { energy }) }], { rulesRoot: RULES }, createTestProjectWriteAdapter(root));
      assert.equal(result.outcomes[0]?.ok, false); assert.match(result.outcomes[0]?.error ?? '', /requires energy:false/);
    }
    assert.deepEqual(requests, []); assert.deepEqual(loadRefs(root), []);
  });
});

test('a missing prepared screenshot target fails closed and a failed retry preserves existing evidence', async () => {
  await fixture(async url => {
    const root = project(); const adapter = createTestProjectWriteAdapter(root);
    const spec: RefSpec = { source: url, as: 'stable', selector: '#menu', shot: true, energy: false, preparation: preparation() };
    const missing = await addRefsBatch(root, [{ ...spec, selector: '#missing' }], { rulesRoot: RULES }, adapter);
    assert.equal(missing.outcomes[0]?.ok, false); assert.deepEqual(loadRefs(root), []);
    const image = refImagePath(root, { source: url, component: 'stable' }); assert.equal(existsSync(image), false);
    const first = await addRefsBatch(root, [spec], { rulesRoot: RULES }, adapter); assert.equal(first.outcomes[0]?.ok, true);
    const bytes = readFileSync(image); const record = readFileSync(image.replace(/\.png$/, '.json'));
    const retry = await addRefsBatch(root, [{ ...spec, preparation: { ...preparation(), assertions: [{ selector: '#menu', state: 'hidden' }] } }], { rulesRoot: RULES }, adapter);
    assert.equal(retry.outcomes[0]?.ok, false);
    assert.deepEqual(readFileSync(image), bytes); assert.deepEqual(readFileSync(image.replace(/\.png$/, '.json')), record);
  });
});

test('ref add CLI uses the same preparation path and requires --no-energy', async () => {
  await fixture(async url => {
    const root = project(); const path = join(root, 'preparation.json'); writeFileSync(path, JSON.stringify(preparation()));
    const args = ['ref', 'add', url, '--as', 'cli-menu', '--selector', '#menu', '--blueprint', '--shot', '--preparation', path];
    const invalid = await runCli(root, args); assert.notEqual(invalid.code, 0); assert.match(invalid.stderr, /requires a rendered reference and --no-energy/);
    const captured = await runCli(root, [...args, '--no-energy']); assert.equal(captured.code, 0, captured.stderr);
    assert.deepEqual(loadRefs(root)[0]?.capturePreparation?.observations, [{ selector: '#menu', state: 'visible', passed: true }]);
  });
});
