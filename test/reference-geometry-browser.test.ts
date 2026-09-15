import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { extractIr } from '../core/render/index.ts';
import { captureBlueprint } from '../core/ref/blueprint.ts';
import { compareReferenceGeometry, referenceGeometry, parseGeometryComparison } from '../core/ref/geometry-comparison.ts';
import { similarity } from '../core/ref/distance.ts';
import { extractInvariants } from '../core/ref/invariants.ts';
import { normalize } from '../core/ir/normalize.ts';

test('real browser: opposite spatial hierarchy is detected while style ladders are identical', async () => {
  const options = { selector: '.hero', viewport: { width: 1280, height: 900 } };
  const a = await extractIr(fileURLToPath(new URL('./fixtures/reference-fidelity/geometry-source.html', import.meta.url)), options);
  const b = await extractIr(fileURLToPath(new URL('./fixtures/reference-fidelity/geometry-swapped.html', import.meta.url)), options);
  const titleA = a.nodes.find(node => node.heading === 1)!;
  const titleB = b.nodes.find(node => node.heading === 1)!;
  assert.equal(titleA.box.x, 80);
  assert.equal(titleB.box.x, 600);
  assert.equal(similarity(extractInvariants(normalize(a)), extractInvariants(normalize(b))), 1);
  const first = referenceGeometry(captureBlueprint(a.nodes, '.hero'))!;
  const second = referenceGeometry(captureBlueprint(b.nodes, '.hero'))!;
  const comparison = compareReferenceGeometry(first, second);
  assert.equal(comparison.matchedAnchors, 3);
  assert.ok(comparison.scores.structure! < .6, JSON.stringify(comparison.scores));
  assert.equal(comparison.scores.proportion, 1);
});

test('real browser: density measures union occupancy independently of tag roles and item counts', async () => {
  const path = fileURLToPath(new URL('./fixtures/reference-fidelity/density-correspondence.html', import.meta.url));
  const measure = async (selector: string) => {
    const raw = await extractIr(path, { selector, viewport: { width: 1280, height: 900 } });
    assert.equal(raw.nodes[0]!.box.w, 400);
    assert.equal(raw.nodes[0]!.box.h, 200);
    return referenceGeometry(captureBlueprint(raw.nodes, selector))!;
  };
  const source = await measure('.source');
  const equivalent = await measure('.equivalent');
  const sparse = await measure('.sparse');
  assert.equal(source.anchors.length, 2);
  assert.equal(equivalent.anchors.length, 4);
  assert.equal(sparse.anchors.length, 1);
  // Both occupy 25,600 of 80,000 CSS square pixels, despite different semantic markup/counts.
  assert.equal(Math.round(source.anchors.reduce((area, a) => area + a.w * a.h, 0) * 80000), 25600);
  assert.equal(Math.round(equivalent.anchors.reduce((area, a) => area + a.w * a.h, 0) * 80000), 25600);
  const sameArea = compareReferenceGeometry(source, equivalent);
  assert.equal(sameArea.matchedAnchors, 1, 'role correspondence remains independently reported');
  assert.equal(sameArea.scores.density, 1, 'equal occupied area is equal density, not equal meaning');
  assert.ok(sameArea.scores.structure! < .6, 'density cannot replace promised structural correspondence');
  const reduced = compareReferenceGeometry(source, sparse);
  assert.equal(reduced.scores.density, .25, 'removing three quarters of the occupied area fails the existing gate');
  assert.throws(() => parseGeometryComparison({ ...reduced, scores: { ...reduced.scores, density: 1 } }), /differs/);
});
