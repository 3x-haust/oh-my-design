import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { normalize } from '../core/ir/normalize.ts';
import { loadRules, check } from '../core/rules/engine.ts';
import type { RawIr, RawNode } from '../core/types.ts';

const BUILTIN_DIR = fileURLToPath(new URL('../core/rules/builtin/', import.meta.url)).replace(/\/$/, '');

// Load only the UX rules to keep assertions tight.
const uxRules = loadRules(BUILTIN_DIR).filter((r) => r.id.startsWith('UX-'));

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a normalised IR from a flat node list. */
function makeIr(nodes: Partial<RawNode>[]): ReturnType<typeof normalize> {
  const full = nodes.map((n, i) => ({
    id: `n${i}`,
    name: 'div',
    type: 'FRAME' as const,
    path: `body/div${i}`,
    parent: null as string | null,
    box: { x: 0, y: 0, w: 100, h: 100 },
    children: [] as string[],
    ...n,
  }));
  return normalize({ nodes: full } as RawIr);
}

/** Make a primary-looking button node (interactive, authored fill, button-sized). */
function primaryBtn(parent: string, fillHex: string, overrides: Partial<RawNode> = {}): Partial<RawNode> {
  return {
    interactive: true,
    parent,
    box: { x: 0, y: 0, w: 120, h: 44 },
    fill: { value: fillHex, token: null, authored: true },
    ...overrides,
  };
}

// ── UX-TWO-PRIMARIES ─────────────────────────────────────────────────────────

test('UX-TWO-PRIMARIES fires when two sibling buttons share the same authored fill', () => {
  const ir = makeIr([
    // n0: root
    { parent: null },
    // n1, n2: two primary buttons, same fill, same parent (n0)
    primaryBtn('n0', '#3B82F6'),
    primaryBtn('n0', '#3B82F6'),
  ]);
  const v = check(ir, uxRules);
  assert.ok(v.some((x) => x.id === 'UX-TWO-PRIMARIES'), 'expected UX-TWO-PRIMARIES to fire');
});

test('UX-TWO-PRIMARIES does not fire when only one button has primary fill', () => {
  const ir = makeIr([
    { parent: null },
    primaryBtn('n0', '#3B82F6'),
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-TWO-PRIMARIES'), 'UX-TWO-PRIMARIES should not fire for a single primary button');
});

test('UX-TWO-PRIMARIES does not fire when buttons have different fill colours', () => {
  const ir = makeIr([
    { parent: null },
    // primary (filled blue)
    primaryBtn('n0', '#3B82F6'),
    // secondary has a different fill colour
    primaryBtn('n0', '#E5E7EB'),
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-TWO-PRIMARIES'), 'UX-TWO-PRIMARIES should not fire when fills differ');
});

test('UX-TWO-PRIMARIES does not fire when same-fill buttons are under different parents', () => {
  // hero section has one primary CTA; footer section has the same-coloured CTA —
  // these are in different containers and do not compete at the same visual level.
  const ir = makeIr([
    { parent: null },                           // n0: root
    { parent: 'n0' },                           // n1: hero section
    primaryBtn('n1', '#3B82F6'),                // n2: hero CTA (parent=n1)
    { parent: 'n0' },                           // n3: footer section
    primaryBtn('n3', '#3B82F6'),                // n4: footer CTA (parent=n3)
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-TWO-PRIMARIES'), 'same-fill CTAs in different sections should not trigger UX-TWO-PRIMARIES');
});

test('UX-TWO-PRIMARIES does not fire for equal-choice buttons inside a dialog or toolbar', () => {
  const ir = makeIr([
    { parent: null },                                  // n0: root
    { parent: 'n0', role: 'alertdialog' },             // n1: equal-choice dialog
    { parent: 'n1' },                                  // n2: dialog action row
    primaryBtn('n2', '#3B82F6'),
    primaryBtn('n2', '#3B82F6'),
    { parent: 'n0', role: 'toolbar' },                 // n5: peer tools
    primaryBtn('n5', '#111827'),
    primaryBtn('n5', '#111827'),
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-TWO-PRIMARIES'), 'declared peer contexts are exempt');
});

test('UX-TWO-PRIMARIES still fires for same-fill siblings outside a peer context', () => {
  const ir = makeIr([
    { parent: null },                                  // n0: root
    { parent: 'n0', role: 'region' },                  // n1: ordinary region
    primaryBtn('n1', '#3B82F6'),
    primaryBtn('n1', '#3B82F6'),
  ]);
  const v = check(ir, uxRules);
  assert.ok(v.some((x) => x.id === 'UX-TWO-PRIMARIES'), 'a plain region is not a peer context');
});

test('UX-TWO-PRIMARIES does not fire when buttons are too small (h < 36, icon buttons)', () => {
  const ir = makeIr([
    { parent: null },
    // Two icon-sized interactive nodes with the same fill — not primary buttons
    primaryBtn('n0', '#3B82F6', { box: { x: 0, y: 0, w: 24, h: 24 } }),
    primaryBtn('n0', '#3B82F6', { box: { x: 30, y: 0, w: 24, h: 24 } }),
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-TWO-PRIMARIES'), 'small icon buttons (h < 36) should not trigger UX-TWO-PRIMARIES');
});

test('UX-TWO-PRIMARIES does not fire when fill is not authored (inherited)', () => {
  // fill.authored=false means the browser, not the author, chose this fill.
  const ir = makeIr([
    { parent: null },
    {
      interactive: true,
      parent: 'n0',
      box: { x: 0, y: 0, w: 120, h: 44 },
      fill: { value: '#3B82F6', token: null, authored: false },
    },
    {
      interactive: true,
      parent: 'n0',
      box: { x: 130, y: 0, w: 120, h: 44 },
      fill: { value: '#3B82F6', token: null, authored: false },
    },
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-TWO-PRIMARIES'), 'inherited fills (authored=false) should not trigger UX-TWO-PRIMARIES');
});

test('UX-TWO-PRIMARIES does not fire when one button has no fill (text/ghost button)', () => {
  const ir = makeIr([
    { parent: null },
    // primary (filled)
    primaryBtn('n0', '#3B82F6'),
    // ghost/text button — no fill
    {
      interactive: true,
      parent: 'n0',
      box: { x: 130, y: 0, w: 120, h: 44 },
    },
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-TWO-PRIMARIES'), 'a ghost button (no fill) alongside a primary should not fire');
});

test('UX-ACTION-BELOW-FOLD is absent until IR binds the committed frequent-action locator', () => {
  assert.ok(!uxRules.some((rule) => rule.id === 'UX-ACTION-BELOW-FOLD'));
});

// ── UX-NO-KEYBOARD-PATH ──────────────────────────────────────��────────────────

test('UX-NO-KEYBOARD-PATH fires when every interactive element has focusable:false', () => {
  const ir = makeIr([
    { parent: null },
    { interactive: true, focusable: false },
    { interactive: true, focusable: false },
  ]);
  const v = check(ir, uxRules);
  assert.ok(v.some((x) => x.id === 'UX-NO-KEYBOARD-PATH'), 'expected UX-NO-KEYBOARD-PATH to fire');
});

test('UX-NO-KEYBOARD-PATH does not fire when at least one interactive element is focusable', () => {
  const ir = makeIr([
    { parent: null },
    { interactive: true, focusable: false },
    { interactive: true, focusable: true },
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-NO-KEYBOARD-PATH'), 'one focusable element is enough');
});

test('UX-NO-KEYBOARD-PATH does not fire when there are no interactive elements', () => {
  const ir = makeIr([
    { parent: null },
    { type: 'TEXT', text: 'Static content' },
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-NO-KEYBOARD-PATH'), 'no interactive elements — no finding');
});

test('UX-NO-KEYBOARD-PATH does not fire when interactive elements have no focusable data (old IR)', () => {
  // interactive nodes without a focusable field — old IRs, pre-extractor update
  const ir = makeIr([
    { parent: null },
    { interactive: true }, // focusable absent
    { interactive: true }, // focusable absent
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-NO-KEYBOARD-PATH'), 'should not fire when focusable data is absent (old IR)');
});

test('UX-NO-KEYBOARD-PATH does not fire when interactive element is focusable with no explicit tabindex', () => {
  // focusable:true represents a natively focusable button
  const ir = makeIr([
    { parent: null },
    { interactive: true, focusable: true },
  ]);
  const v = check(ir, uxRules);
  assert.ok(!v.some((x) => x.id === 'UX-NO-KEYBOARD-PATH'), 'natively focusable button should not fire');
});

test('UX-TWO-PRIMARIES value reports the number of competing sibling groups', () => {
  // Two separate containers each with two competing primaries: value should be 2.
  const ir = makeIr([
    { parent: null },                           // n0: root
    { parent: 'n0' },                           // n1: section A
    primaryBtn('n1', '#3B82F6'),                // n2: primary A1
    primaryBtn('n1', '#3B82F6'),                // n3: primary A2 — competes with A1
    { parent: 'n0' },                           // n4: section B
    primaryBtn('n4', '#10B981'),                // n5: primary B1 (different colour)
    primaryBtn('n4', '#10B981'),                // n6: primary B2 — competes with B1
  ]);
  const v = check(ir, uxRules);
  const finding = v.find((x) => x.id === 'UX-TWO-PRIMARIES');
  assert.ok(finding, 'UX-TWO-PRIMARIES should fire');
  assert.equal(finding?.value, 2, 'value should count both competing groups');
});
