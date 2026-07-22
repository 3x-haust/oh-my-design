import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  clusterColorRoles,
  captureBlueprint,
  deriveNodeRole,
  deriveTextLength,
  relativeLuminance,
  hexSaturation,
  type ColorEntry,
} from '../core/ref/blueprint.ts';
import { saveRef, loadRefs } from '../core/ref/store.ts';
import type { Blueprint, BlueprintNode, Reference } from '../core/types.ts';
import type { RawNode } from '../core/types.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-bp-'));

// ── helpers ───────────────────────────────────────────────────────────────────

function rawNode(overrides: Partial<RawNode> & { id: string }): RawNode {
  return {
    name: 'div',
    type: 'FRAME',
    path: `body/${overrides.id}`,
    parent: null,
    box: { x: 0, y: 0, w: 100, h: 40 },
    children: [],
    ...overrides,
  };
}

// ── relativeLuminance ─────────────────────────────────────────────────────────

test('relativeLuminance: black is 0', () => {
  assert.equal(relativeLuminance('#000000'), 0);
});

test('relativeLuminance: white is 1', () => {
  assert.ok(Math.abs(relativeLuminance('#FFFFFF') - 1) < 0.001);
});

test('relativeLuminance: dark color has lower luminance than light color', () => {
  assert.ok(relativeLuminance('#111111') < relativeLuminance('#EEEEEE'));
});

// ── hexSaturation ─────────────────────────────────────────────────────────────

test('hexSaturation: grey has zero saturation', () => {
  assert.equal(hexSaturation('#888888'), 0);
  assert.equal(hexSaturation('#000000'), 0);
  assert.equal(hexSaturation('#FFFFFF'), 0);
});

test('hexSaturation: vivid color has high saturation', () => {
  // #FF3366 is a vivid red-pink
  assert.ok(hexSaturation('#FF3366') > 0.8);
  assert.ok(hexSaturation('#0066FF') > 0.8);
});

// ── clusterColorRoles ─────────────────────────────────────────────────────────

test('clusterColorRoles: dominant dark fill maps to bg', () => {
  const colors: ColorEntry[] = [
    { hex: '#111111', count: 20, isFill: true },
    { hex: '#EEEEEE', count: 15, isFill: false },
  ];
  const roles = clusterColorRoles(colors);
  assert.equal(roles.get('#111111'), 'bg');
  assert.equal(roles.get('#EEEEEE'), 'fg');
});

test('clusterColorRoles: dominant light fill maps to bg, secondary fill to surface', () => {
  const colors: ColorEntry[] = [
    { hex: '#FFFFFF', count: 30, isFill: true },
    { hex: '#F5F5F5', count: 12, isFill: true },
    { hex: '#111111', count: 20, isFill: false },
  ];
  const roles = clusterColorRoles(colors);
  assert.equal(roles.get('#FFFFFF'), 'bg');
  assert.equal(roles.get('#F5F5F5'), 'surface');
  assert.equal(roles.get('#111111'), 'fg');
});

test('clusterColorRoles: high-saturation minority fill maps to accent', () => {
  const colors: ColorEntry[] = [
    { hex: '#111111', count: 20, isFill: true },
    { hex: '#FF3366', count: 2, isFill: true },  // bright, minority → accent
    { hex: '#EEEEEE', count: 15, isFill: false },
  ];
  const roles = clusterColorRoles(colors);
  assert.equal(roles.get('#FF3366'), 'accent');
  assert.equal(roles.get('#111111'), 'bg');
  assert.equal(roles.get('#EEEEEE'), 'fg');
});

test('clusterColorRoles: high-saturation minority text color maps to accent', () => {
  const colors: ColorEntry[] = [
    { hex: '#FFFFFF', count: 20, isFill: true },
    { hex: '#111111', count: 18, isFill: false }, // dominant text → fg
    { hex: '#0066FF', count: 3, isFill: false },  // saturated, minority text → accent
  ];
  const roles = clusterColorRoles(colors);
  assert.equal(roles.get('#0066FF'), 'accent');
  assert.equal(roles.get('#111111'), 'fg');
  assert.equal(roles.get('#FFFFFF'), 'bg');
});

test('clusterColorRoles: secondary text color maps to muted', () => {
  const colors: ColorEntry[] = [
    { hex: '#FFFFFF', count: 20, isFill: true },
    { hex: '#111111', count: 15, isFill: false },
    { hex: '#888888', count: 8, isFill: false },
  ];
  const roles = clusterColorRoles(colors);
  assert.equal(roles.get('#111111'), 'fg');
  assert.equal(roles.get('#888888'), 'muted');
});

test('clusterColorRoles: at-max-frequency color is not accent even if saturated', () => {
  // When a saturated color is the most frequent, it is structural, not an accent.
  const colors: ColorEntry[] = [
    { hex: '#0066FF', count: 20, isFill: true }, // dominant fill, even though saturated
    { hex: '#FFFFFF', count: 10, isFill: false },
  ];
  const roles = clusterColorRoles(colors);
  // accent requires count < maxCount; 20 === maxCount, so not accent
  assert.notEqual(roles.get('#0066FF'), 'accent');
  assert.equal(roles.get('#0066FF'), 'bg');
});

test('clusterColorRoles: empty colors returns empty map', () => {
  assert.equal(clusterColorRoles([]).size, 0);
});

test('clusterColorRoles: single fill returns bg, single text returns fg', () => {
  const roles = clusterColorRoles([
    { hex: '#222222', count: 5, isFill: true },
    { hex: '#FFFFFF', count: 5, isFill: false },
  ]);
  // Both at maxCount → neither is accent
  assert.equal(roles.get('#222222'), 'bg');
  assert.equal(roles.get('#FFFFFF'), 'fg');
});

// ── deriveNodeRole ─────────────────────────────────────────────────────────────

test('deriveNodeRole: interactive flag → interactive', () => {
  assert.equal(deriveNodeRole({ type: 'FRAME', interactive: true, name: 'button' }), 'interactive');
});

test('deriveNodeRole: heading present → heading', () => {
  assert.equal(deriveNodeRole({ type: 'TEXT', heading: 1, name: 'h1' }), 'heading');
});

test('deriveNodeRole: TEXT type without heading → text', () => {
  assert.equal(deriveNodeRole({ type: 'TEXT', name: 'p' }), 'text');
});

test('deriveNodeRole: img tag → image', () => {
  assert.equal(deriveNodeRole({ type: 'FRAME', name: 'img.hero' }), 'image');
});

test('deriveNodeRole: svg tag → image', () => {
  assert.equal(deriveNodeRole({ type: 'FRAME', name: 'svg' }), 'image');
});

test('deriveNodeRole: container FRAME → container', () => {
  assert.equal(deriveNodeRole({ type: 'FRAME', name: 'div.card' }), 'container');
});

// ── deriveTextLength ──────────────────────────────────────────────────────────

test('deriveTextLength: short text → label', () => {
  assert.equal(deriveTextLength('Submit'), 'label');
  assert.equal(deriveTextLength('Learn more'), 'label');
  assert.equal(deriveTextLength('A'.repeat(20)), 'label');
});

test('deriveTextLength: medium text → phrase', () => {
  assert.equal(deriveTextLength('Build beautiful interfaces faster'), 'phrase');
  assert.equal(deriveTextLength('A'.repeat(21)), 'phrase');
  assert.equal(deriveTextLength('A'.repeat(80)), 'phrase');
});

test('deriveTextLength: long text → paragraph', () => {
  assert.equal(deriveTextLength('A'.repeat(81)), 'paragraph');
  assert.equal(deriveTextLength('Our platform helps thousands of designers build stunning interfaces every day and night.'), 'paragraph');
});

// ── captureBlueprint ──────────────────────────────────────────────────────────

test('captureBlueprint: text content is absent from stored nodes', () => {
  const nodes: RawNode[] = [
    rawNode({
      id: 'n0',
      type: 'TEXT',
      text: 'Hello world, this is some text content that must not be stored',
      color: '#111111',
    }),
    rawNode({
      id: 'n1',
      type: 'TEXT',
      text: 'Submit',
      color: '#111111',
    }),
  ];
  const bp = captureBlueprint(nodes, '.component');
  for (const node of bp.nodes) {
    assert.equal(
      (node as unknown as Record<string, unknown>)['text'],
      undefined,
      `node ${node.id} must not have a text field`,
    );
  }
});

test('captureBlueprint: textLength is set from text content, not the content itself', () => {
  const nodes: RawNode[] = [
    rawNode({ id: 'n0', type: 'TEXT', text: 'Submit' }),              // ≤20 → label
    rawNode({ id: 'n1', type: 'TEXT', text: 'Build better products' }), // 21 → phrase
    rawNode({
      id: 'n2',
      type: 'TEXT',
      text: 'Our platform helps thousands of designers and developers create stunning interfaces every day.',
    }), // >80 → paragraph
    rawNode({ id: 'n3', type: 'FRAME' }), // no text → no textLength
  ];
  const bp = captureBlueprint(nodes, '.component');
  assert.equal(bp.nodes[0]?.textLength, 'label');
  assert.equal(bp.nodes[1]?.textLength, 'phrase');
  assert.equal(bp.nodes[2]?.textLength, 'paragraph');
  assert.equal(bp.nodes[3]?.textLength, undefined);
});

test('captureBlueprint: no literal hex values in nodes', () => {
  const nodes: RawNode[] = [
    rawNode({
      id: 'n0',
      type: 'FRAME',
      fill: { value: '#1A1A2E', token: null, authored: true },
    }),
    rawNode({
      id: 'n1',
      type: 'TEXT',
      color: '#EEEEEE',
      fill: { value: '#1A1A2E', token: null, inherited: true }, // inherited — not tracked
    }),
  ];
  const bp = captureBlueprint(nodes, '.nav');
  for (const node of bp.nodes) {
    const n = node as unknown as Record<string, unknown>;
    // fillRole and textRole are role strings, not hex
    if (n['fillRole'] !== undefined) {
      assert.ok(
        ['bg', 'surface', 'fg', 'muted', 'accent'].includes(n['fillRole'] as string),
        `fillRole must be a role, got ${n['fillRole']}`,
      );
    }
    if (n['textRole'] !== undefined) {
      assert.ok(
        ['bg', 'surface', 'fg', 'muted', 'accent'].includes(n['textRole'] as string),
        `textRole must be a role, got ${n['textRole']}`,
      );
    }
    // There must be no field containing a bare hex string
    for (const [key, val] of Object.entries(n)) {
      if (key === 'id' || key === 'children') continue;
      assert.ok(
        typeof val !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(val),
        `node ${node.id} field "${key}" contains a raw hex: ${val}`,
      );
    }
  }
});

test('captureBlueprint: inherited fills do not contribute to color roles', () => {
  // One authored fill on n0; n1 inherits it. The role map should only have one fill.
  const nodes: RawNode[] = [
    rawNode({
      id: 'n0',
      fill: { value: '#222222', token: null, authored: true },
    }),
    rawNode({
      id: 'n1',
      parent: 'n0',
      fill: { value: '#222222', token: null, inherited: true }, // borrowed — must not appear twice
    }),
  ];
  const bp = captureBlueprint(nodes, '.card');
  const n0 = bp.nodes.find((n) => n.id === 'n0');
  const n1 = bp.nodes.find((n) => n.id === 'n1');
  assert.equal(n0?.fillRole, 'bg'); // only authored fill → becomes bg
  assert.equal(n1?.fillRole, undefined); // inherited fill → no role
});

test('captureBlueprint: layout fields are stored from IR', () => {
  const nodes: RawNode[] = [
    rawNode({
      id: 'n0',
      layout: { mode: 'HORIZONTAL', gap: 16, padding: [8, 16, 8, 16] },
    }),
  ];
  const bp = captureBlueprint(nodes, '.nav');
  const n = bp.nodes[0]!;
  assert.deepEqual(n.padding, [8, 16, 8, 16]);
  assert.equal(n.gap, 16);
  assert.equal(n.direction, 'HORIZONTAL');
});

test('captureBlueprint: motion fields are stored from IR', () => {
  const nodes: RawNode[] = [
    rawNode({
      id: 'n0',
      motion: { durations: [150, 300], animationNames: [], easings: ['ease-out', 'ease-in-out'] },
    }),
  ];
  const bp = captureBlueprint(nodes, '.nav');
  const n = bp.nodes[0]!;
  assert.deepEqual(n.motionDurations, [150, 300]);
  assert.deepEqual(n.motionEasings, ['ease-out', 'ease-in-out']);
});

test('captureBlueprint: selector and node count are recorded', () => {
  const nodes: RawNode[] = [
    rawNode({ id: 'n0' }),
    rawNode({ id: 'n1', parent: 'n0' }),
  ];
  const bp = captureBlueprint(nodes, '.main-nav');
  assert.equal(bp.selector, '.main-nav');
  assert.equal(bp.nodes.length, 2);
  assert.ok(typeof bp.capturedAt === 'string' && bp.capturedAt.length > 0);
});

// ── round-trip through saveRef / loadRefs ─────────────────────────────────────

const baseInvariants = {
  spacingLadder: [8, 16], radiusLadder: [4], elevationLevels: 1,
  centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8,
  typeScale: [14, 21], fontFamilies: ['inter'], weightLadder: [400, 600],
  motionDurations: [150], easingVocab: ['ease-out'], animatedShare: 0,
  hoverCoverage: 0, focusCoverage: 0,
  animatedProperties: [], hasReducedMotion: false, scrollChoreography: [],
};

const sampleBlueprint: Blueprint = {
  selector: '.nav',
  capturedAt: '2026-07-12T00:00:00.000Z',
  nodes: [
    {
      id: 'n0',
      role: 'container',
      children: ['n1'],
      box: { w: 1440, h: 72 },
      padding: [0, 24, 0, 24],
      gap: 16,
      direction: 'HORIZONTAL',
      fillRole: 'bg',
    },
    {
      id: 'n1',
      role: 'text',
      children: [],
      box: { w: 120, h: 20 },
      fontSize: 14,
      fontWeight: 600,
      lineHeight: 1.4,
      textRole: 'fg',
      textLength: 'label',
    },
  ],
};

test('blueprint round-trips through saveRef and loadRefs intact', () => {
  const dir = project();
  const ref: Reference = {
    source: 'https://linear.app',
    component: 'nav-blueprint',
    kind: 'component',
    capturedAt: new Date().toISOString(),
    selector: '.nav',
    invariants: baseInvariants,
    principles: ['Navigation uses HORIZONTAL layout with 24px horizontal padding.'],
    blueprint: sampleBlueprint,
  };
  saveRef(dir, ref, createTestProjectWriteAdapter(dir));
  const [loaded] = loadRefs(dir);
  assert.ok(loaded?.blueprint, 'blueprint must be present after round-trip');
  assert.equal(loaded?.blueprint?.selector, '.nav');
  assert.equal(loaded?.blueprint?.nodes.length, 2);
  const n0 = loaded?.blueprint?.nodes[0];
  assert.equal(n0?.role, 'container');
  assert.equal(n0?.fillRole, 'bg');
  assert.deepEqual(n0?.padding, [0, 24, 0, 24]);
  const n1 = loaded?.blueprint?.nodes[1];
  assert.equal(n1?.role, 'text');
  assert.equal(n1?.textLength, 'label');
  assert.equal(n1?.textRole, 'fg');
  assert.equal(n1?.fontSize, 14);
});

test('loadRefs: record without blueprint field loads without blueprint (backward compat)', () => {
  const dir = project();
  // Write a record that predates the blueprint field — simulates a reference captured
  // before --blueprint was introduced.
  const old = {
    source: 'https://stripe.com',
    component: 'legacy-nav',
    kind: 'component',
    capturedAt: new Date().toISOString(),
    selector: '.nav',
    invariants: baseInvariants,
    principles: [],
  };
  mkdirSync(join(dir, '.omd', 'refs'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'refs', 'stripe.com.legacy-nav.json'), `${JSON.stringify(old, null, 2)}\n`);
  const [loaded] = loadRefs(dir);
  assert.equal(loaded?.blueprint, undefined, 'absent blueprint must remain absent — treat as no blueprint');
});

test('saveRef/loadRefs preserves blueprint nodes with all optional fields', () => {
  const dir = project();
  const complexBlueprint: Blueprint = {
    selector: '.card',
    capturedAt: '2026-07-12T00:00:00.000Z',
    nodes: [
      {
        id: 'n0',
        role: 'container',
        children: ['n1', 'n2'],
        box: { w: 320, h: 200 },
        padding: [16, 16, 16, 16],
        gap: 12,
        direction: 'VERTICAL',
        fillRole: 'surface',
        radius: 8,
        hasShadow: true,
      },
      {
        id: 'n1',
        role: 'heading',
        children: [],
        box: { w: 288, h: 28 },
        fontSize: 20,
        fontWeight: 700,
        lineHeight: 1.3,
        textRole: 'fg',
        textLength: 'phrase',
        motionDurations: [160],
        motionEasings: ['ease-out'],
      },
      {
        id: 'n2',
        role: 'interactive',
        children: [],
        box: { w: 120, h: 40 },
        radius: 6,
        fillRole: 'accent',
        textRole: 'bg',
        textLength: 'label',
      },
    ],
  };
  const ref: Reference = {
    source: 'https://vercel.com',
    component: 'feature-card',
    kind: 'component',
    capturedAt: new Date().toISOString(),
    invariants: baseInvariants,
    principles: [],
    blueprint: complexBlueprint,
  };
  saveRef(dir, ref, createTestProjectWriteAdapter(dir));
  const [loaded] = loadRefs(dir);
  const bp = loaded?.blueprint;
  assert.ok(bp, 'blueprint must be present');
  assert.equal(bp?.nodes.length, 3);
  const container = bp?.nodes[0];
  assert.equal(container?.radius, 8);
  assert.equal(container?.hasShadow, true);
  assert.equal(container?.fillRole, 'surface');
  const heading = bp?.nodes[1];
  assert.deepEqual(heading?.motionDurations, [160]);
  assert.deepEqual(heading?.motionEasings, ['ease-out']);
  const cta = bp?.nodes[2];
  assert.equal(cta?.fillRole, 'accent');
  assert.equal(cta?.textLength, 'label');
});
