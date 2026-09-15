import assert from 'node:assert/strict';
import test from 'node:test';
import type { Blueprint, RawIr } from '../core/types.ts';
import { compareReferenceFeatures, parseReferenceFeatureComparisons, parseReferenceFeatureMeasurements, sourceFeatureWitness, type ReferenceFeatureMeasurement } from '../core/ref/feature-measurement.ts';
import { compareReferenceGeometry, referenceGeometry } from '../core/ref/geometry-comparison.ts';
import { captureBlueprint } from '../core/ref/blueprint.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';

const source = (): Blueprint => ({ selector: '.group', capturedAt: '2026-09-10', nodes: [
  { id: 'r', role: 'container', box: { w: 800, h: 400 }, position: { x: 0, y: 0 }, children: ['h', 'p', 'a'] },
  { id: 'h', role: 'heading', box: { w: 700, h: 60 }, position: { x: 20, y: 20 }, fontSize: 52, children: [] },
  { id: 'p', role: 'text', box: { w: 700, h: 120 }, position: { x: 20, y: 92 }, fontSize: 16, children: [] },
  { id: 'a', role: 'interactive', box: { w: 100, h: 24 }, position: { x: 20, y: 228 }, fontSize: 16, children: [] },
] });
const target = (): RawIr => ({ nodes: [
  { id: 'r', name: 'section', path: '.target', type: 'FRAME', parent: null, box: { x: 60, y: 1000, w: 400, h: 300 }, children: ['h', 'p', 'a', 'extra'] },
  { id: 'h', name: 'h1', path: '.target h1', type: 'TEXT', parent: 'r', box: { x: 80, y: 1020, w: 300, h: 120 }, heading: 1, fontSize: 52, children: [], referenceMeasurement: { anchor: 'display', fontSize: 52, visible: true } },
  { id: 'p', name: 'p', path: '.target p', type: 'TEXT', parent: 'r', box: { x: 80, y: 1152, w: 300, h: 24 }, fontSize: 16, children: [], referenceMeasurement: { anchor: 'body', fontSize: 16, visible: true } },
  { id: 'a', name: 'a', path: '.target a', type: 'TEXT', parent: 'r', box: { x: 80, y: 1192, w: 100, h: 24 }, fontSize: 16, interactive: true, children: [], referenceMeasurement: { anchor: 'action', fontSize: 16, visible: true } },
  { id: 'extra', name: 'p', path: '.target .extra', type: 'TEXT', parent: 'r', box: { x: 80, y: 1230, w: 100, h: 24 }, fontSize: 16, children: [] },
] });
const scale = (): ReferenceFeatureMeasurement => ({ id: 'display-to-body', quantity: 'font-size-ratio', sourceNodes: [1, 2], targetAnchors: ['display', 'body'] });
const spacing = (): readonly ReferenceFeatureMeasurement[] => [
  { id: 'title-body', quantity: 'gap-y', sourceNodes: [1, 2], targetAnchors: ['display', 'body'] },
  { id: 'body-action', quantity: 'gap-y', sourceNodes: [2, 3], targetAnchors: ['body', 'action'] },
  { id: 'shared-edge', quantity: 'left-edge-offset', sourceNodes: [1, 3], targetAnchors: ['display', 'action'] },
];

test('declared type ratio survives different line counts, component height and additional real content', () => {
  const a = source(); const b = target();
  const whole = compareReferenceGeometry(referenceGeometry(a)!, referenceGeometry(captureBlueprint(b.nodes, '.target'))!);
  assert.ok(whole.scores.proportion! < .6, 'the whole-component metric is not the named type ratio');
  const [feature] = compareReferenceFeatures(a, b, [scale()]);
  assert.equal(feature!.sourceValue, 3.25);
  assert.equal(feature!.targetValue, 3.25);
  assert.equal(feature!.similarity, 1);
  b.nodes[1]!.referenceMeasurement!.fontSize = 26;
  assert.equal(compareReferenceFeatures(a, b, [scale()])[0]!.similarity, .5);
});

test('declared spacing measures actual role edges, not component-height-normalized nearest descendants', () => {
  const a = source(); const b = target();
  const rows = compareReferenceFeatures(a, b, spacing());
  assert.deepEqual(rows.map(row => [row.sourceValue, row.targetValue, row.similarity]), [[12, 12, 1], [16, 16, 1], [0, 0, 1]]);
  b.nodes[3]!.box.y += 32;
  b.nodes[3]!.box.x += 20;
  assert.deepEqual(compareReferenceFeatures(a, b, spacing()).map(row => row.similarity), [1, .333333, 0]);
});

test('declared feature syntax rejects axis laundering, duplicated endpoints and unknown fields', () => {
  assert.deepEqual(parseReferenceFeatureMeasurements([scale()], 'proportion'), [scale()]);
  assert.throws(() => parseReferenceFeatureMeasurements([scale()], 'structure'), /does not measure/);
  assert.throws(() => parseReferenceFeatureMeasurements([{ ...scale(), sourceNodes: [1, 1] }], 'proportion'), /distinct source/);
  assert.throws(() => parseReferenceFeatureMeasurements([{ ...scale(), targetAnchors: ['display', 'display'] }], 'proportion'), /distinct target/);
  assert.throws(() => parseReferenceFeatureMeasurements([{ ...scale(), approved: true }], 'proportion'), /unknown or missing/);
  assert.throws(() => parseReferenceFeatureMeasurements([scale(), scale()], 'proportion'), /unique/);
  assert.throws(() => parseReferenceFeatureMeasurements([{ ...scale(), targetAnchors: ['https://example.com', 'body'] }], 'proportion'), /target anchors/);
  assert.throws(() => parseReferenceFeatureMeasurements([], 'proportion'), /1..24/);
});

test('source features require actual measured nodes and no guessed legacy positions', () => {
  const a = source();
  assert.throws(() => sourceFeatureWitness(a, { ...scale(), sourceNodes: [1, 999] }), /captured position/);
  delete a.nodes[1]!.position;
  assert.throws(() => sourceFeatureWitness(a, scale()), /captured position/);
  a.nodes[1]!.position = { x: 20, y: 20 };
  delete a.nodes[1]!.fontSize;
  assert.throws(() => sourceFeatureWitness(a, scale()), /measured font sizes/);
});

test('target features reject missing, duplicate and invisible anchors rather than finding a convenient substitute', () => {
  const a = source(); const b = target();
  delete b.nodes[1]!.referenceMeasurement;
  assert.throws(() => compareReferenceFeatures(a, b, [scale()]), /exactly one node/);
  b.nodes[1]!.referenceMeasurement = { anchor: 'display', fontSize: 52, visible: false };
  assert.throws(() => compareReferenceFeatures(a, b, [scale()]), /not visibly rendered/);
  b.nodes[1]!.referenceMeasurement.visible = true;
  b.nodes[4]!.referenceMeasurement = { anchor: 'display', fontSize: 52, visible: true };
  assert.throws(() => compareReferenceFeatures(a, b, [scale()]), /found 2/);
});

test('serialized feature results recompute values and scores from both measured witnesses', () => {
  const rows = compareReferenceFeatures(source(), target(), [scale()]);
  assert.deepEqual(parseReferenceFeatureComparisons(JSON.parse(canonicalJson(rows)), 'proportion'), rows);
  const changed = structuredClone(rows) as any;
  changed[0].target.nodes[0].fontSize = 26;
  assert.throws(() => parseReferenceFeatureComparisons(changed, 'proportion'), /differs/);
  assert.throws(() => parseReferenceFeatureComparisons([{ ...rows[0], accepted: true }], 'proportion'), /differs/);
  assert.throws(() => parseReferenceFeatureComparisons([{ ...rows[0], sourceValue: 1 }], 'proportion'), /differs/);
});
