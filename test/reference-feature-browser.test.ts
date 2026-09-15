import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { extractIr } from '../core/render/index.ts';
import { captureBlueprint } from '../core/ref/blueprint.ts';
import { compareReferenceFeatures, type ReferenceFeatureMeasurement } from '../core/ref/feature-measurement.ts';
import type { RawIr } from '../core/types.ts';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/reference-fidelity/feature-${name}.html`, import.meta.url));
const measured = (name: string, selector: string) => extractIr(fixture(name), { selector, viewport: { width: 1280, height: 900 } });
const sourceIndex = (raw: RawIr, anchor: string): number => {
  const index = raw.nodes.findIndex(node => node.referenceMeasurement?.anchor === anchor);
  assert.notEqual(index, -1, `independent source landmark ${anchor}`);
  return index;
};

test('real browser: declared column and font ratios survive different copy and DOM, but swapped proportions fail', async () => {
  const a = await measured('source', '.hero');
  const b = await measured('target', '.hero');
  const bad = await measured('wrong', '.hero');
  const blueprint = captureBlueprint(a.nodes, '.hero');
  const definitions: ReferenceFeatureMeasurement[] = [
    { id: 'lead-support', quantity: 'width-ratio', sourceNodes: [sourceIndex(a, 'lead'), sourceIndex(a, 'support')], targetAnchors: ['lead', 'support'] },
    { id: 'display-body', quantity: 'font-size-ratio', sourceNodes: [sourceIndex(a, 'display'), sourceIndex(a, 'body')], targetAnchors: ['display', 'body'] },
    { id: 'group-gap', quantity: 'relative-gap-x', sourceNodes: [sourceIndex(a, 'lead'), sourceIndex(a, 'support')], targetAnchors: ['lead', 'support'] },
    { id: 'complete-height', quantity: 'height', sourceNodes: [0], targetAnchors: ['@root'] },
  ];
  assert.equal(a.nodes[sourceIndex(a, 'lead')]!.box.w, 418);
  assert.equal(b.nodes[sourceIndex(b, 'lead')]!.box.w, 418);
  assert.equal(b.nodes[sourceIndex(b, 'support')]!.box.w, 656);
  assert.equal(b.nodes[sourceIndex(b, 'display')]!.referenceMeasurement!.fontSize, 52);
  assert.equal(b.nodes[sourceIndex(b, 'body')]!.referenceMeasurement!.fontSize, 16);
  const rows = compareReferenceFeatures(blueprint, b, definitions);
  assert.deepEqual(rows.map(row => row.similarity), [1, 1, 1, 1]);
  assert.equal(rows[1]!.targetValue, 3.25);
  const changed = compareReferenceFeatures(blueprint, bad, definitions);
  assert.ok(changed[0]!.similarity < .6, 'swapping the columns changes the promised ratio');
  assert.equal(changed[1]!.similarity, .5, 'halving the actual display size is a real mismatch');
});

test('real browser: named title/body/action spacing survives paragraph wrapping and detects changed actual gaps', async () => {
  const a = await measured('source', '.detail');
  const b = await measured('target', '.detail');
  const bad = await measured('wrong', '.detail');
  const definitions: ReferenceFeatureMeasurement[] = [
    { id: 'title-body', quantity: 'gap-y', sourceNodes: [sourceIndex(a, 'detail-title'), sourceIndex(a, 'detail-body')], targetAnchors: ['detail-title', 'detail-body'] },
    { id: 'body-action', quantity: 'gap-y', sourceNodes: [sourceIndex(a, 'detail-body'), sourceIndex(a, 'detail-action')], targetAnchors: ['detail-body', 'detail-action'] },
  ];
  assert.ok(a.nodes[sourceIndex(a, 'detail-body')]!.box.h > b.nodes[sourceIndex(b, 'detail-body')]!.box.h);
  const rows = compareReferenceFeatures(captureBlueprint(a.nodes, '.detail'), b, definitions);
  assert.deepEqual(rows.map(row => [row.sourceValue, row.targetValue, row.similarity]), [[12, 12, 1], [16, 16, 1]]);
  assert.deepEqual(compareReferenceFeatures(captureBlueprint(a.nodes, '.detail'), bad, definitions).map(row => row.similarity), [.333333, .333333]);
});

test('real browser: a transparent ancestor, duplicate marker or out-of-scope counterpart cannot establish a feature', async () => {
  const a = await measured('source', '.hero');
  const definition: ReferenceFeatureMeasurement = { id: 'display-body', quantity: 'font-size-ratio',
    sourceNodes: [sourceIndex(a, 'display'), sourceIndex(a, 'body')], targetAnchors: ['display', 'body'] };
  const blueprint = captureBlueprint(a.nodes, '.hero');
  const hidden = await measured('wrong', '.guard-cases');
  assert.equal(hidden.nodes[sourceIndex(hidden, 'display')]!.referenceMeasurement!.visible, false);
  assert.throws(() => compareReferenceFeatures(blueprint, hidden, [definition]), /not visibly rendered/);
  const duplicate = await measured('wrong', '.duplicates');
  assert.throws(() => compareReferenceFeatures(blueprint, duplicate, [definition]), /found 2/);
  const scoped = await measured('wrong', '.scoped');
  assert.throws(() => compareReferenceFeatures(blueprint, scoped, [definition]), /found 0/);
  const invisibleScope = await measured('wrong', '.invisible-scope');
  assert.throws(() => compareReferenceFeatures(blueprint, invisibleScope, [
    { id: 'complete-height', quantity: 'height', sourceNodes: [0], targetAnchors: ['@root'] },
  ]), /@root is not visibly rendered/);
});
