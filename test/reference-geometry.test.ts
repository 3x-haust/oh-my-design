import assert from 'node:assert/strict';
import test from 'node:test';
import { captureBlueprint } from '../core/ref/blueprint.ts';
import { compareReferenceGeometry, referenceGeometry, parseGeometryComparison } from '../core/ref/geometry-comparison.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import type { Blueprint, RawNode } from '../core/types.ts';

const source = (): Blueprint => ({ selector: '.hero', capturedAt: '2026-09-10', nodes: [
  { id: 'root', role: 'container', children: ['title', 'body', 'image'], box: { w: 1000, h: 600 }, position: { x: 0, y: 0 }, gap: 24 },
  { id: 'title', role: 'heading', children: [], box: { w: 400, h: 160 }, position: { x: 40, y: 60 }, fontSize: 60 },
  { id: 'body', role: 'text', children: [], box: { w: 400, h: 80 }, position: { x: 40, y: 250 }, fontSize: 20 },
  { id: 'image', role: 'image', children: [], box: { w: 400, h: 400 }, position: { x: 560, y: 60 } },
] });
const compare = (a: Blueprint, b: Blueprint) => compareReferenceGeometry(referenceGeometry(a)!, referenceGeometry(b)!);

test('captured positions are component-relative and survive nonzero page offsets', () => {
  const nodes: RawNode[] = [
    { id: 'r', name: 'section', type: 'FRAME', path: '.hero', parent: null, children: ['t'], box: { x: 100, y: 800, w: 800, h: 400 } },
    { id: 't', name: 'h1', type: 'TEXT', path: '.title', parent: 'r', children: [], heading: 1, box: { x: 700, y: 850, w: 200, h: 100 } },
  ];
  const result = captureBlueprint(nodes, '.hero');
  assert.deepEqual(result.nodes.map(node => node.position), [{ x: 0, y: 0 }, { x: 600, y: 50 }]);
});
test('identical geometry and uniformly scaled geometry preserve all measured relationships', () => {
  const a = source(); const b = source();
  for (const node of b.nodes) {
    node.position!.x *= 2; node.position!.y *= 2; node.box.w *= 2; node.box.h *= 2;
    if (node.fontSize) node.fontSize *= 2;
    if (node.gap) node.gap *= 2;
  }
  assert.deepEqual(compare(a, b).scores, { structure: 1, proportion: 1, density: 1, rhythm: 1 });
});
test('moving the same boxes to the opposite sides fails structure despite identical style and dimensions', () => {
  const b = source();
  b.nodes[1]!.position!.x = 560; b.nodes[2]!.position!.x = 560; b.nodes[3]!.position!.x = 40;
  const result = compare(source(), b);
  assert.ok(result.scores.structure! < .6);
  assert.equal(result.scores.proportion, 1);
});
test('missing anchors and altered typography ratios cannot hide behind shared styles', () => {
  const b = source(); b.nodes.pop(); b.nodes[0]!.children.pop();
  assert.equal(compare(source(), b).missingSourceAnchors, 1);
  b.nodes[1]!.fontSize = 20;
  assert.ok(compare(source(), b).scores.proportion! < .6);
});
test('legacy, invalid and empty geometry remain unmeasured rather than fabricated', () => {
  const old = source(); delete old.nodes[1]!.position;
  assert.equal(referenceGeometry(old), null);
  const empty = source(); empty.nodes = [empty.nodes[0]!];
  assert.equal(referenceGeometry(empty), null);
  const invalid = source(); invalid.nodes[1]!.position!.x = Infinity;
  assert.equal(referenceGeometry(invalid), null);
  const noGap = source(); delete noGap.nodes[0]!.gap;
  assert.equal(compare(noGap, noGap).scores.rhythm, 1, 'actual box separation measures margins without a CSS gap declaration');
  noGap.nodes = noGap.nodes.slice(0, 2);
  assert.equal(compare(noGap, noGap).scores.rhythm, null, 'one anchor has no inter-anchor rhythm');
});
test('serialized geometry scores are recomputed; forged pass and unexpected keys fail', () => {
  const result = compare(source(), source());
  assert.deepEqual(parseGeometryComparison(JSON.parse(canonicalJson(result))), result);
  assert.throws(() => parseGeometryComparison({ ...result, scores: { ...result.scores, structure: .9 } }), /differs/);
  assert.throws(() => parseGeometryComparison({ ...result, approved: true }), /differs/);
});
