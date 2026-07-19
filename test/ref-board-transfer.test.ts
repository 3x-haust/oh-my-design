import assert from 'node:assert/strict';
import test from 'node:test';
import { componentCaptureTransfer } from '../core/ref/board-transfer.ts';
import type { BlueprintNode, Invariants, Reference } from '../core/types.ts';

type ComponentFixture = { readonly invariants: Invariants; readonly node: BlueprintNode; readonly reference: Reference };

const fixture = (): ComponentFixture => {
  const invariants: Invariants = {
    spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8,
    typeScale: [16], fontFamilies: [], weightLadder: [400], motionDurations: [120], easingVocab: [], animatedShare: 0,
    hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [],
  };
  const node: BlueprintNode = { id: 'source-node', role: 'container', children: [], box: { w: 160, h: 40 }, motionDurations: [120], motionEasings: ['ease-out'] };
  return {
    invariants, node,
    reference: {
      source: 'https://source.example/card', component: 'card', kind: 'component', capturedAt: '2026-07-18T00:00:00.000Z',
      selector: '[data-source="card"]', invariants, principles: ['Keep hierarchy distinct.'],
      blueprint: { selector: '[data-source="card"]', capturedAt: '2026-07-18T00:00:00.000Z', nodes: [node] },
    },
  };
};

test('component transfer preserves normal local font and easing values', () => {
  // Given: measured component values that describe design behavior rather than a source location.
  const value = fixture(); value.invariants.fontFamilies.push('Inter'); value.invariants.easingVocab.push('cubic-bezier(0.2, 0, 0, 1)'); value.invariants.animatedProperties.push('transform');

  // When: the component is converted to a downstream transfer.
  const transfer = componentCaptureTransfer(value.reference, 'ref-0000000000000000');

  // Then: ordinary local measurements remain available in its sanitized output.
  assert.deepEqual(transfer.invariants.fontFamilies, ['Inter']); assert.deepEqual(transfer.invariants.easingVocab, ['cubic-bezier(0.2, 0, 0, 1)']); assert.deepEqual(transfer.blueprint.nodes[0]?.motionEasings, ['ease-out']);
});

test('component transfer rejects source payloads and malformed emitted measurements', () => {
  // Given: raw reference-shaped values, as the JSON loader can produce at runtime.
  const textFields: readonly (readonly [string, (value: ComponentFixture, payload: string) => void])[] = [
    ['principle', (value, payload) => { value.reference.principles[0] = payload; }], ['font', (value, payload) => { value.invariants.fontFamilies.push(payload); }],
    ['easing', (value, payload) => { value.invariants.easingVocab.push(payload); }], ['animated property', (value, payload) => { value.invariants.animatedProperties.push(payload); }], ['node easing', (value, payload) => { value.node.motionEasings = [payload]; }],
  ];
  const payloads = ['https://source.example', '//source.example', 'source.unlisted', 'source.xn--3e0b707e', 'source.example.', '192.0.2.1', '[2001:db8::1]', '::1', '1::', 'fe80::1', '[fe80::1]', 'localhost', 'javascript:alert(1)', 'mailto:source@example.test', 'custom+scheme:payload', 'data:image/png;base64,x', 'file:///secret', 'blob:https://source.example/x', '<img src=x>', 'text\u0000payload', './capture.png', '../capture.png', '.\\capture.png', '..\\capture.png', 'capture.png', 'assets/crop.png', 'assets\\crop.png', '.omd/refs/crop.png', '.omd\\refs\\crop.png', 'assets/reference/crop', './capture', '../capture', 'folder\\capture', '/', '%2Fprivate%2Fcrop', 'capture', 'screenshot', 'crop', 'reference', 'image', 'fragment-0123456789abcdef', 'ref-0123456789abcdef'];
  const malformed: readonly (readonly [string, (value: ComponentFixture) => void])[] = [
    ['empty principle list', (value) => { value.reference.principles.splice(0); }],
    ['non-finite invariant number', (value) => { value.invariants.spacingLadder.push(Number.NaN); }], ['non-finite box number', (value) => { Object.assign(value.node.box, { w: Number.POSITIVE_INFINITY }); }],
    ['invalid node enum', (value) => { Object.assign(value.node, { role: 'unknown' }); }], ['invalid node array', (value) => { Object.assign(value.node, { motionDurations: ['bad'] }); }],
    ['invalid padding shape', (value) => { Object.assign(value.node, { padding: [1, 2] }); }], ['invalid scroll measurement', (value) => { Object.assign(value.invariants, { scrollChoreography: [{ step: 1, fired: 'bad', entered: 0 }] }); }],
  ];

  // When / Then: every source/pixel carrier and malformed emitted shape fails before copying.
  for (const [_field, set] of textFields) for (const payload of payloads) { const value = fixture(); set(value, payload); assert.throws(() => componentCaptureTransfer(value.reference, 'ref-0000000000000000')); }
  for (const [_label, poison] of malformed) { const value = fixture(); poison(value); assert.throws(() => componentCaptureTransfer(value.reference, 'ref-0000000000000000')); }
});
