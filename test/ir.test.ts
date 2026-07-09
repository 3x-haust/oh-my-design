import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, contrastRatio } from '../core/ir/normalize.ts';
import type { Node, RawIr } from '../core/types.ts';
import { must, readJson } from './helpers.ts';

const raw = readJson<RawIr>(new URL('./fixtures/ir.raw.json', import.meta.url));
const ir = normalize(raw);
const byId: Record<string, Node> = Object.fromEntries(ir.nodes.map((n) => [n.id, n]));
const at = (id: string): Node => must(byId[id], id);

test('contrastRatio implements WCAG relative luminance', () => {
  assert.equal(contrastRatio('#FFFFFF', '#000000').toFixed(2), '21.00');
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(2), '21.00');
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF').toFixed(2), '1.00');
  // #8A8A8A text on #F0F0F0 surface — the failing Pay Now button
  assert.ok(Math.abs(contrastRatio('#8A8A8A', '#F0F0F0') - 3.03) < 0.02);
});

test('normalize is pure — raw input is not mutated', () => {
  const again = readJson<RawIr>(new URL('./fixtures/ir.raw.json', import.meta.url));
  assert.deepEqual(raw, again);
});

test('computed.depth counts ancestors', () => {
  assert.equal(at('1:1').computed.depth, 0);
  assert.equal(at('1:10').computed.depth, 1);
});

test('computed.contrastWithParent uses text color when present, else fill', () => {
  assert.equal(at('1:1').computed.contrastWithParent, null); // root has no parent
  assert.ok(Math.abs(must(at('1:30').computed.contrastWithParent, 'contrastWithParent') - 3.03) < 0.02);
  assert.equal(must(at('1:10').computed.contrastWithParent, 'contrastWithParent').toFixed(2), '1.00');
});

test('computed.siblingPaddingMode excludes self — an outlier cannot vote for itself', () => {
  assert.deepEqual(at('1:20').computed.siblingPaddingMode, [16, 16, 16, 16]);
  assert.deepEqual(at('1:10').computed.siblingPaddingMode, [16, 16, 14, 16]);
  assert.equal(at('1:30').computed.siblingPaddingMode, null); // no layout.padding
});

test('computed.tokenCoverage = tokenised props / present tokenable props', () => {
  assert.equal(at('1:10').computed.tokenCoverage, 1); // fill + radius both tokenised
  assert.equal(at('1:20').computed.tokenCoverage, 0); // neither
  assert.equal(at('1:1').computed.tokenCoverage, 1); // fill only, tokenised
  assert.equal(at('1:30').computed.tokenCoverage, 0); // fill only, not tokenised
});

test('computed.hitArea and isInteractive', () => {
  assert.deepEqual(at('1:30').computed.hitArea, { w: 343, h: 38 });
  assert.equal(at('1:30').computed.isInteractive, true);
  assert.equal(at('1:10').computed.isInteractive, false);
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
  assert.equal(ir.stats.componentReuse['CardGood'], 1);
  assert.equal(Object.keys(ir.stats.componentReuse).length, 4);
});

test('computed.identicalSiblings counts shape-matching siblings, including self', () => {
  assert.equal(at('1:40').computed.identicalSiblings, 3);
  assert.equal(at('1:41').computed.identicalSiblings, 3);
  assert.equal(at('1:42').computed.identicalSiblings, 3);
  assert.equal(at('1:10').computed.identicalSiblings, 1); // no other node shares its shape
  assert.equal(at('1:1').computed.identicalSiblings, 0); // root has no parent
});

test('stats.radiusHistogram counts nodes by radius value', () => {
  assert.deepEqual(ir.stats.radiusHistogram, { 8: 2, 12: 3 });
});

test('stats.shadowHistogram counts nodes by shadow value', () => {
  assert.deepEqual(ir.stats.shadowHistogram, { '0 2px 4px rgba(0,0,0,0.2)': 1 });
});

test('stats.centeredTextRatio is the fraction of text-bearing nodes that are centred', () => {
  assert.equal(ir.stats.centeredTextRatio, 0.3333);
});

test('stats.gradients lists distinct gradients in first-seen order', () => {
  assert.deepEqual(ir.stats.gradients, ['linear-gradient(90deg, #FF5A1F, #FFB199)']);
});
