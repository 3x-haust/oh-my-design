import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, contrastRatio } from '../core/ir/normalize.mjs';

const raw = JSON.parse(readFileSync(new URL('./fixtures/ir.raw.json', import.meta.url)));
const ir = normalize(raw);
const byId = Object.fromEntries(ir.nodes.map((n) => [n.id, n]));

test('contrastRatio implements WCAG relative luminance', () => {
  assert.equal(contrastRatio('#FFFFFF', '#000000').toFixed(2), '21.00');
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF').toFixed(2), '1.00');
  // #8A8A8A text on #F0F0F0 surface — the failing Pay Now button
  assert.ok(Math.abs(contrastRatio('#8A8A8A', '#F0F0F0') - 3.03) < 0.02);
});

test('normalize is pure — raw input is not mutated', () => {
  const again = JSON.parse(readFileSync(new URL('./fixtures/ir.raw.json', import.meta.url)));
  assert.deepEqual(raw, again);
});

test('computed.depth counts ancestors', () => {
  assert.equal(byId['1:1'].computed.depth, 0);
  assert.equal(byId['1:10'].computed.depth, 1);
});

test('computed.contrastWithParent uses text color when present, else fill', () => {
  assert.equal(byId['1:1'].computed.contrastWithParent, null); // root has no parent
  assert.ok(Math.abs(byId['1:30'].computed.contrastWithParent - 3.03) < 0.02);
  assert.equal(byId['1:10'].computed.contrastWithParent.toFixed(2), '1.00');
});

test('computed.siblingPaddingMode excludes self — an outlier cannot vote for itself', () => {
  assert.deepEqual(byId['1:20'].computed.siblingPaddingMode, [16, 16, 16, 16]);
  assert.deepEqual(byId['1:10'].computed.siblingPaddingMode, [16, 16, 14, 16]);
  assert.equal(byId['1:30'].computed.siblingPaddingMode, null); // no layout.padding
});

test('computed.tokenCoverage = tokenised props / present tokenable props', () => {
  assert.equal(byId['1:10'].computed.tokenCoverage, 1); // fill + radius both tokenised
  assert.equal(byId['1:20'].computed.tokenCoverage, 0); // neither
  assert.equal(byId['1:1'].computed.tokenCoverage, 1); // fill only, tokenised
  assert.equal(byId['1:30'].computed.tokenCoverage, 0); // fill only, not tokenised
});

test('computed.hitArea and isInteractive', () => {
  assert.deepEqual(byId['1:30'].computed.hitArea, { w: 343, h: 38 });
  assert.equal(byId['1:30'].computed.isInteractive, true);
  assert.equal(byId['1:10'].computed.isInteractive, false);
});

test('stats.spacingHistogram counts every padding value and gap', () => {
  assert.deepEqual(ir.stats.spacingHistogram, { 8: 2, 14: 1, 16: 7 });
});

test('stats.colorHistogram counts fill values', () => {
  assert.deepEqual(ir.stats.colorHistogram, { '#FFFFFF': 2, '#FEFEFE': 1, '#F0F0F0': 1 });
});

test('stats.orphanStyles lists fills used exactly once, sorted', () => {
  assert.deepEqual(ir.stats.orphanStyles, ['#F0F0F0', '#FEFEFE']);
});

test('stats.componentReuse counts node names', () => {
  assert.equal(ir.stats.componentReuse.CardGood, 1);
  assert.equal(Object.keys(ir.stats.componentReuse).length, 4);
});
