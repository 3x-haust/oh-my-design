import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { extractIr, withBrowser } from '../core/render/index.ts';
import { captureBlueprint } from '../core/ref/blueprint.ts';
import { extractInPage } from '../core/ir/dom.ts';
import type { RawIr } from '../core/types.ts';

const fixture = fileURLToPath(new URL('./fixtures/ir-display-contents.html', import.meta.url));
const viewport = { width: 390, height: 844 };

test('display:contents preserves measured descendants and their layout-parent links without inventing a wrapper box', async () => {
  const direct = await extractIr(fixture, { selector: '#direct', viewport });
  const wrapped = await extractIr(fixture, { selector: '#wrapped', viewport });
  assert.equal(direct.nodes.length, 7, 'independent box-producing fixture baseline');
  assert.equal(wrapped.nodes.length, direct.nodes.length, 'boxless wrappers must not erase visible descendants');
  const directBlueprint = captureBlueprint(direct.nodes, '#direct');
  const wrappedBlueprint = captureBlueprint(wrapped.nodes, '#wrapped');
  assert.deepEqual(wrappedBlueprint.nodes, directBlueprint.nodes, 'same rendered geometry and typography, despite extra DOM wrappers');
  assert.equal(wrapped.nodes.some((node) => node.name.endsWith('.contents')), false);
  assert.deepEqual(wrapped.nodes[0]!.children, ['n1', 'n2', 'n3', 'n4']);
  assert.deepEqual(wrapped.nodes[4]!.children, ['n5', 'n6']);
  assert.equal(wrapped.nodes.find((node) => node.text === '급수 펌프')!.parent, 'n4');
  assert.equal(wrapped.nodes.filter((node) => node.referenceMeasurement?.anchor === '@root').length, 1);
});

test('display:contents traversal does not reveal hidden or clipped zero-box branches', async () => {
  const raw = await extractIr(fixture, { selector: '#negative', viewport });
  assert.equal(raw.nodes.some((node) => node.text === '표시된 항목'), true);
  for (const text of ['숨긴 항목', '가린 항목', '잘린 항목']) {
    assert.equal(raw.nodes.some((node) => node.text === text), false, text);
  }
  assert.equal(raw.nodes.length, 2);
});

test('boxless wrappers preserve the node limit and do not become an unmeasured capture root', async () => {
  await withBrowser(async (browser) => {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(new URL('./fixtures/ir-display-contents.html', import.meta.url).href);
      const raw = await page.evaluate<RawIr>(`(${extractInPage.toString()})(2, '#wrapped')`);
      assert.equal(raw.nodes.length, 2);
      assert.deepEqual(raw.nodes[0]!.children, ['n1']);
      assert.equal(raw.nodes[1]!.parent, 'n0');
      const boxlessRoot = await page.evaluate<RawIr>(`(${extractInPage.toString()})(20, '#wrapped > .contents')`);
      assert.deepEqual(boxlessRoot.nodes, []);
    } finally {
      await page.close();
    }
  });
});
