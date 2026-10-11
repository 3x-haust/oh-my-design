import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { loadRefs } from '../core/ref/store.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { parseSearchInput } from '../core/ref/search-execution.ts';
import { captureReferenceNavigation, readReferenceDiscoveryAttempt, ReferenceNavigationError } from '../core/ref/navigation-capture.ts';
import { readCurrentDiscoveryNavigation } from '../core/ref/discovery-record.ts';
import { withBrowser } from '../core/render/index.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { discoveryBrowser, directoryHtml, GALLERY_DIRECTORY, GALLERY_ITEM } from './helpers/discovery-capture.ts';

test('search input skeleton gives the coordinator a valid exact-query transport', () => {
  const skeleton = inputSkeleton('reference-search');
  assert.doesNotThrow(() => parseSearchInput(skeleton.skeleton));
});

test('HTTP 202 blank gallery mockup is an unavailable signed attempt, not reusable navigation', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-blank-gallery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = 'https://dribbble.com/shots/27610524-Task-Management-Dashboard-Ui-Design';
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url: source, html: '', status: 202 });
    await assert.rejects(captureReferenceNavigation(observed.browser, source, 'design', createTestProjectWriteAdapter(root)), error => {
      assert.ok(error instanceof ReferenceNavigationError);
      assert.ok(error.attempt);
      const attempt = readReferenceDiscoveryAttempt(root, error.attempt);
      assert.equal(attempt.source, source);
      assert.equal(attempt.httpStatus, 202);
      assert.equal(attempt.reason, 'entry-unusable');
      return true;
    });
  });
  assert.equal(existsSync(join(root, '.omd/discovery/design/navigation')), false);
});

test('an image-only gallery item with a loaded visible original is not a blank page', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-image-gallery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = 'https://dribbble.com/shots/27514201-task-screen';
  const imageUrl = `${source}/original.png`;
  const bytes = readFileSync(fileURLToPath(new URL('./fixtures/trusted-lifecycle-project/.omd/evaluation-runs/sha256-7ed1e6c5732c6c42e5be64be04ced2d264d25c1c3220582e16f1f636c24906de/1280x900.png', import.meta.url)));
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, {
      url: source, html: `<img src="${imageUrl}" alt="" width="1280" height="900">`,
      image: { url: imageUrl, bytes },
    });
    const receipt = await captureReferenceNavigation(observed.browser, source, 'design', createTestProjectWriteAdapter(root));
    const record = JSON.parse(readFileSync(join(root, receipt.capture.path), 'utf8'));
    assert.equal(record.imageCandidates.length, 1);
    assert.equal(record.imageCandidates[0].naturalWidth, 1280);
  });
});

test('ordinary product navigation exposes a current unique image selector without admitting a reference', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-product-images-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = 'https://personal-work.example.com/';
  const imageUrl = `${source}workspace.png`;
  const bytes = readFileSync(fileURLToPath(new URL('./fixtures/trusted-lifecycle-project/.omd/evaluation-runs/sha256-7ed1e6c5732c6c42e5be64be04ced2d264d25c1c3220582e16f1f636c24906de/1280x900.png', import.meta.url)));
  const receipt = await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, {
      url: source, html: `${directoryHtml()}<img id="task-view" src="${imageUrl}" width="600" height="422">`,
      image: { url: imageUrl, bytes }, loadedImageSelector: '#task-view',
    });
    return captureReferenceNavigation(observed.browser, source, 'design', createTestProjectWriteAdapter(root));
  });
  const observation = readCurrentDiscoveryNavigation(root, receipt);
  assert.deepEqual(observation.imageCandidates?.map(item => item.selector), ['#task-view']);
  assert.equal(observation.imageCandidates?.[0]?.naturalWidth, 1280);
  assert.equal(loadRefs(root, { includeDomain: true }).length, 0);
  assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
});

test('ordinary product navigation refuses image selectors that change during its capture', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-product-image-drift-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = 'https://personal-work.example.com/';
  const imageUrl = `${source}workspace.png`;
  const bytes = readFileSync(fileURLToPath(new URL('./fixtures/trusted-lifecycle-project/.omd/evaluation-runs/sha256-7ed1e6c5732c6c42e5be64be04ced2d264d25c1c3220582e16f1f636c24906de/1280x900.png', import.meta.url)));
  await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, {
      url: source, html: `${directoryHtml()}<img id="task-view" src="${imageUrl}" width="600" height="422">`,
      image: { url: imageUrl, bytes }, loadedImageSelector: '#task-view',
      afterCapture: async page => {
        await page.locator('#task-view').evaluate(element => { element.id = 'changed-task-view'; });
      },
    });
    await assert.rejects(captureReferenceNavigation(observed.browser, source, 'design', createTestProjectWriteAdapter(root)),
      error => error instanceof ReferenceNavigationError && error.message.includes('image candidates changed during capture'));
  });
  assert.equal(existsSync(join(root, '.omd/discovery/design/navigation')), false);
  assert.equal(loadRefs(root, { includeDomain: true }).length, 0);
});

test('ordinary product navigation observes a lazy original and restores its capture viewport', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-product-lazy-image-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = 'https://personal-work.example.com/';
  const imageUrl = `${source}workspace.png`;
  const bytes = readFileSync(fileURLToPath(new URL('./fixtures/trusted-lifecycle-project/.omd/evaluation-runs/sha256-7ed1e6c5732c6c42e5be64be04ced2d264d25c1c3220582e16f1f636c24906de/1280x900.png', import.meta.url)));
  const scrollPositions: number[] = [];
  const receipt = await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, {
      url: source,
      html: `${directoryHtml()}<img id="task-view" loading="lazy" src="${imageUrl}" width="600" height="422" style="margin-top:5000px">`,
      image: { url: imageUrl, bytes },
      afterCapture: async page => { scrollPositions.push(await page.evaluate(() => scrollY)); },
    });
    return captureReferenceNavigation(observed.browser, source, 'design', createTestProjectWriteAdapter(root));
  });
  const observation = readCurrentDiscoveryNavigation(root, receipt);
  assert.deepEqual(observation.imageCandidates?.map(item => item.selector), ['#task-view']);
  assert.equal(observation.imageCandidates?.[0]?.naturalWidth, 1280);
  assert.deepEqual(scrollPositions, [0]);
});

for (const [label, source, html, refused] of [
  ['directory thumbnails', GALLERY_DIRECTORY, directoryHtml(GALLERY_ITEM), false],
  ['textless ordinary image', 'https://personal-work.example.com/', '', true],
] as const) {
  test(`ordinary image observation does not admit ${label}`, async t => {
    const root = mkdtempSync(join(tmpdir(), 'omd-image-boundary-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const imageUrl = `${source}image.png`;
    const bytes = readFileSync(fileURLToPath(new URL('./fixtures/trusted-lifecycle-project/.omd/evaluation-runs/sha256-7ed1e6c5732c6c42e5be64be04ced2d264d25c1c3220582e16f1f636c24906de/1280x900.png', import.meta.url)));
    await withBrowser(async browser => {
      const observed = discoveryBrowser(browser, {
        url: source, html: `${html}<img id="task-view" src="${imageUrl}" width="600" height="422">`,
        image: { url: imageUrl, bytes }, loadedImageSelector: '#task-view',
      });
      const capture = () => captureReferenceNavigation(observed.browser, source, 'design', createTestProjectWriteAdapter(root));
      if (refused) {
        await assert.rejects(capture(), ReferenceNavigationError);
        assert.equal(existsSync(join(root, '.omd/discovery/design/navigation')), false);
      } else {
        const receipt = await capture();
        assert.deepEqual(readCurrentDiscoveryNavigation(root, receipt).imageCandidates, []);
      }
    });
    assert.equal(loadRefs(root, { includeDomain: true }).length, 0);
  });
}

test('navigation-only capture preserves observed gallery hops without entering the reference board inventory', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'omd-navigation-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const url = GALLERY_DIRECTORY;
  const cli = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
  const result = await withBrowser(async browser => {
    const observed = discoveryBrowser(browser, { url, html: directoryHtml(GALLERY_ITEM) });
    return captureReferenceNavigation(observed.browser, url, 'design', createTestProjectWriteAdapter(cwd));
  });
  assert.equal(result.url, url);
  assert.equal(existsSync(join(cwd, '.omd/refs')), false, 'navigation execution must not create retained reference files');
  for (const receipt of [result.evidence, result.capture]) {
    assert.ok(receipt.path.startsWith('.omd/discovery/design/navigation/'));
    const bytes = readFileSync(join(cwd, receipt.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256);
  }
  const record = JSON.parse(readFileSync(join(cwd, result.capture.path), 'utf8'));
  assert.equal(record.component, undefined);
  assert.equal(record.kind, 'page');
  assert.equal(record.schema, 'reference-navigation-capture-v6');
  assert.ok(record.observedText.length > 0);
  assert.ok(record.linkLabels.some((label: { url: string }) => label.url === GALLERY_ITEM));
  assert.equal(record.researchLane, 'design');
  assert.equal(record.acquisition.httpStatus, 200);
  assert.ok(record.acquisition.links.includes(GALLERY_ITEM));
  assert.equal(record.acquisition.imageSha256, result.evidence.sha256);
  assert.equal(loadRefs(cwd, { includeDomain: true }).length, 0);
  assert.equal(existsSync(join(cwd, '.omd/reference-board.json')), false);
  await assert.rejects(promisify(execFile)(process.execPath, [cli, 'ref', 'navigate', url, '--lane', 'other'], { cwd, env }));
  await assert.rejects(promisify(execFile)(process.execPath, [cli, 'ref', 'navigate', 'http://127.0.0.1:1234/', '--lane', 'domain'], { cwd, env }));
});
