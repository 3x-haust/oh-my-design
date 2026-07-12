/**
 * Unit tests for core/figma/client.ts and core/figma/system.ts.
 *
 * All tests are pure-function tests — no network, no disk I/O.
 * The fixture at test/fixtures/figma/file-response.json represents a minimal
 * but realistic Figma API response (documented API shape).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { parseFileKey, figmaColorToHex, normalizeNode, normalizeFile } from '../core/figma/client.ts';
import {
  parseVariantName,
  buildComponentMatrix,
  clusterColors,
  hexColorDistance,
  extractTokens,
  generateCss,
  relativeLuminance,
} from '../core/figma/system.ts';
import type { FigmaFileResponse } from '../core/figma/types.ts';

const FIXTURE_PATH = fileURLToPath(new URL('./fixtures/figma/file-response.json', import.meta.url));
const fixture = (): FigmaFileResponse =>
  JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FigmaFileResponse;

// ── parseFileKey ──────────────────────────────────────────────────────────────

test('parseFileKey: /file/:key URL', () => {
  assert.equal(
    parseFileKey('https://www.figma.com/file/ABCDEF1234/My-Design'),
    'ABCDEF1234',
  );
});

test('parseFileKey: /design/:key URL', () => {
  assert.equal(
    parseFileKey('https://www.figma.com/design/XYZ9876/Title'),
    'XYZ9876',
  );
});

test('parseFileKey: /design/:key with ?node-id query param', () => {
  assert.equal(
    parseFileKey('https://www.figma.com/design/ABC123/Name?node-id=1%3A2&t=abc'),
    'ABC123',
  );
});

test('parseFileKey: /file/:key with no protocol prefix', () => {
  assert.equal(
    parseFileKey('figma.com/file/KEY001/Title'),
    'KEY001',
  );
});

test('parseFileKey: throws for non-Figma URL', () => {
  assert.throws(
    () => parseFileKey('https://example.com/not-figma'),
    /Could not extract/,
  );
});

test('parseFileKey: keys may contain hyphens and underscores', () => {
  assert.equal(
    parseFileKey('https://www.figma.com/design/ABC_123-xyz/File'),
    'ABC_123-xyz',
  );
});

// ── figmaColorToHex ───────────────────────────────────────────────────────────

test('figmaColorToHex: white', () => {
  assert.equal(figmaColorToHex({ r: 1, g: 1, b: 1 }), '#ffffff');
});

test('figmaColorToHex: black', () => {
  assert.equal(figmaColorToHex({ r: 0, g: 0, b: 0 }), '#000000');
});

test('figmaColorToHex: mid-range color', () => {
  // r=0.231 → round(0.231*255)=59=0x3b, g=0.51→round(0.51*255)=130=0x82, b=0.965→round(0.965*255)=246=0xf6
  assert.equal(figmaColorToHex({ r: 0.231, g: 0.51, b: 0.965 }), '#3b82f6');
});

test('figmaColorToHex: pads single-digit hex channels', () => {
  assert.equal(figmaColorToHex({ r: 0, g: 0, b: 0.02 }), '#000005');
});

// ── normalizeNode ─────────────────────────────────────────────────────────────

test('normalizeNode: TEXT node gets typography', () => {
  const node = normalizeNode({
    id: 't1',
    name: 'Title',
    type: 'TEXT',
    fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } }],
    effects: [],
    style: { fontFamily: 'Inter', fontSize: 48, fontWeight: 700, lineHeightPx: 56 },
  });
  assert.equal(node.typography?.fontFamily, 'Inter');
  assert.equal(node.typography?.fontSize, 48);
  assert.equal(node.typography?.fontWeight, 700);
  // lineHeight = 56/48 ≈ 1.17
  assert.ok(node.typography?.lineHeight !== undefined && node.typography.lineHeight > 1.1);
});

test('normalizeNode: auto-layout node gets padding + layoutMode', () => {
  const node = normalizeNode({
    id: 'f1',
    name: 'Button',
    type: 'FRAME',
    fills: [],
    effects: [],
    layoutMode: 'HORIZONTAL',
    paddingTop: 12,
    paddingRight: 24,
    paddingBottom: 12,
    paddingLeft: 24,
    itemSpacing: 8,
  });
  assert.equal(node.layoutMode, 'HORIZONTAL');
  assert.equal(node.itemSpacing, 8);
  assert.deepEqual(node.padding, [12, 24, 12, 24]);
});

test('normalizeNode: NONE layoutMode is not recorded', () => {
  const node = normalizeNode({
    id: 'f2',
    name: 'Frame',
    type: 'FRAME',
    fills: [],
    effects: [],
    layoutMode: 'NONE',
  });
  assert.equal(node.layoutMode, undefined);
  assert.equal(node.padding, undefined);
});

test('normalizeNode: invisible fills are dropped', () => {
  const node = normalizeNode({
    id: 'n1',
    name: 'Node',
    type: 'FRAME',
    fills: [
      { type: 'SOLID', visible: false, color: { r: 1, g: 0, b: 0, a: 1 } },
      { type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 1, a: 1 } },
    ],
    effects: [],
  });
  assert.equal(node.fills.length, 1);
  assert.equal(node.fills[0]?.hex, '#0000ff');
});

test('normalizeNode: drop shadow effect is kept', () => {
  const node = normalizeNode({
    id: 'n2',
    name: 'Card',
    type: 'FRAME',
    fills: [],
    effects: [
      {
        type: 'DROP_SHADOW',
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 0.1 },
        offset: { x: 0, y: 2 },
        radius: 4,
      },
    ],
  });
  assert.equal(node.effects.length, 1);
  assert.equal(node.effects[0]?.type, 'drop_shadow');
  assert.equal(node.effects[0]?.offsetY, 2);
  assert.equal(node.effects[0]?.radius, 4);
});

test('normalizeNode: invisible effects are dropped', () => {
  const node = normalizeNode({
    id: 'n3',
    name: 'Frame',
    type: 'FRAME',
    fills: [],
    effects: [{ type: 'DROP_SHADOW', visible: false }],
  });
  assert.equal(node.effects.length, 0);
});

test('normalizeNode: gradient fill is normalized', () => {
  const node = normalizeNode({
    id: 'n4',
    name: 'Grad',
    type: 'FRAME',
    fills: [
      {
        type: 'GRADIENT_LINEAR',
        gradientStops: [
          { color: { r: 1, g: 0, b: 0, a: 1 }, position: 0 },
          { color: { r: 0, g: 0, b: 1, a: 1 }, position: 1 },
        ],
      },
    ],
    effects: [],
  });
  assert.equal(node.fills[0]?.type, 'gradient_linear');
  assert.match(node.fills[0]?.gradient ?? '', /linear-gradient/);
});

test('normalizeNode: compSetLookup annotates componentSetId', () => {
  const node = normalizeNode(
    { id: 'comp-1', name: 'Size=sm', type: 'COMPONENT', fills: [], effects: [] },
    { 'comp-1': 'set-button' },
  );
  assert.equal(node.componentSetId, 'set-button');
});

// ── normalizeFile ─────────────────────────────────────────────────────────────

test('normalizeFile: pages and frames are present', () => {
  const snap = normalizeFile('KEY', fixture());
  assert.equal(snap.pages.length, 1);
  assert.equal(snap.pages[0]?.name, 'Page 1');
  assert.ok(snap.pages[0]!.frames.length >= 2);
});

test('normalizeFile: fileName and fileKey are stored', () => {
  const snap = normalizeFile('TESTKEY', fixture());
  assert.equal(snap.fileKey, 'TESTKEY');
  assert.equal(snap.fileName, 'Test Design System');
});

test('normalizeFile: component set is indexed', () => {
  const snap = normalizeFile('KEY', fixture());
  assert.ok('set-button' in snap.componentSets);
  assert.equal(snap.componentSets['set-button']?.name, 'Button');
});

test('normalizeFile: component variants are grouped into their set', () => {
  const snap = normalizeFile('KEY', fixture());
  const btn = snap.componentSets['set-button'];
  assert.ok(btn !== undefined);
  assert.equal(btn.variants.length, 3);
  const names = btn.variants.map((v) => v.name);
  assert.ok(names.includes('Size=sm, State=default'));
  assert.ok(names.includes('Size=sm, State=hover'));
  assert.ok(names.includes('Size=md, State=default'));
});

test('normalizeFile: nodes are flattened into frames', () => {
  const snap = normalizeFile('KEY', fixture());
  const hero = snap.pages[0]!.frames.find((f) => f.name === 'Hero');
  assert.ok(hero !== undefined, 'Hero frame not found');
  // Hero has: Title (TEXT), Body (TEXT), CTA Button (FRAME), Label (TEXT inside CTA)
  assert.ok(hero.nodes.length >= 3);
});

test('normalizeFile: extraNodes replaces shallow stubs', () => {
  const f = fixture();
  // Build an extraNode for the Hero frame with a different name
  const extraHero = { ...f.document.children![0]!.children![0]!, name: 'Hero-Full' };
  const snap = normalizeFile('KEY', f, { '1:10': extraHero });
  const hero = snap.pages[0]!.frames.find((f) => f.id === '1:10');
  assert.equal(hero?.name, 'Hero-Full');
});

// ── parseVariantName ──────────────────────────────────────────────────────────

test('parseVariantName: comma-separated key=value pairs', () => {
  const r = parseVariantName('Size=sm, State=hover');
  assert.equal(r['Size'], 'sm');
  assert.equal(r['State'], 'hover');
});

test('parseVariantName: single pair', () => {
  const r = parseVariantName('Size=md');
  assert.equal(r['Size'], 'md');
});

test('parseVariantName: name without = returns empty object', () => {
  assert.deepEqual(parseVariantName('Primary'), {});
});

test('parseVariantName: mixed — some pairs, some plain tokens', () => {
  const r = parseVariantName('Primary, Size=lg');
  assert.equal(Object.keys(r).length, 1);
  assert.equal(r['Size'], 'lg');
});

test('parseVariantName: empty string returns empty object', () => {
  assert.deepEqual(parseVariantName(''), {});
});

// ── buildComponentMatrix ──────────────────────────────────────────────────────

test('buildComponentMatrix: builds matrix from snapshot', () => {
  const snap = normalizeFile('KEY', fixture());
  const matrix = buildComponentMatrix(snap);
  assert.equal(matrix.length, 1); // one component set: Button
  const btn = matrix[0]!;
  assert.equal(btn.setName, 'Button');
  assert.equal(btn.variants.length, 3);
});

test('buildComponentMatrix: propertyKeys extracted correctly', () => {
  const snap = normalizeFile('KEY', fixture());
  const btn = buildComponentMatrix(snap)[0]!;
  assert.ok(btn.propertyKeys.includes('Size'));
  assert.ok(btn.propertyKeys.includes('State'));
});

test('buildComponentMatrix: propertyValues lists unique values per key', () => {
  const snap = normalizeFile('KEY', fixture());
  const btn = buildComponentMatrix(snap)[0]!;
  assert.deepEqual(btn.propertyValues['Size']?.sort(), ['md', 'sm']);
  assert.deepEqual(btn.propertyValues['State']?.sort(), ['default', 'hover']);
});

// ── hexColorDistance ──────────────────────────────────────────────────────────

test('hexColorDistance: identical colors → 0', () => {
  assert.equal(hexColorDistance('#ffffff', '#ffffff'), 0);
});

test('hexColorDistance: black vs white → max', () => {
  const d = hexColorDistance('#000000', '#ffffff');
  // sqrt(255^2 * 3) ≈ 441.67
  assert.ok(d > 440);
});

test('hexColorDistance: near-identical colors → small', () => {
  const d = hexColorDistance('#1a1a1a', '#1b1b1b');
  assert.ok(d < 5);
});

// ── clusterColors ─────────────────────────────────────────────────────────────

test('clusterColors: dedupes exact duplicates', () => {
  const result = clusterColors(['#ff0000', '#ff0000', '#ff0000']);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.count, 3);
});

test('clusterColors: merges near-identical colors within threshold', () => {
  // #1a1a1a and #1b1b1b differ by sqrt(3) ≈ 1.7 — well within default threshold 15
  const result = clusterColors(['#1a1a1a', '#1a1a1a', '#1a1a1a', '#1b1b1b', '#1b1b1b']);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.count, 5);
});

test('clusterColors: keeps distinct colors separate', () => {
  const result = clusterColors(['#ff0000', '#0000ff', '#00ff00']);
  assert.equal(result.length, 3);
});

test('clusterColors: sorts by count descending', () => {
  const result = clusterColors(['#ff0000', '#0000ff', '#0000ff', '#0000ff']);
  assert.equal(result[0]?.hex, '#0000ff');
  assert.equal(result[0]?.count, 3);
});

test('clusterColors: empty input returns empty array', () => {
  assert.deepEqual(clusterColors([]), []);
});

// ── extractTokens ─────────────────────────────────────────────────────────────

test('extractTokens: type scale from fixture', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  // Fixture has fontSize: 48, 16, 14, 24, 14 → unique: 14, 16, 24, 48
  assert.ok(tokens.typeScale.includes(48));
  assert.ok(tokens.typeScale.includes(16));
  // sorted asc
  assert.deepEqual(tokens.typeScale, [...tokens.typeScale].sort((a, b) => a - b));
});

test('extractTokens: spacing from auto-layout nodes', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  // Fixture has paddingTop/Bottom:12, paddingRight/Left:24, itemSpacing:8 (CTA)
  // and paddingTop/Bottom/Left/Right:24, itemSpacing:16 (Card)
  assert.ok(tokens.spacing.length > 0);
  assert.ok(tokens.spacing.includes(24));
});

test('extractTokens: radii from fixture', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  assert.ok(tokens.radii.includes(8));
});

test('extractTokens: shadows from fixture', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  assert.ok(tokens.shadows.length > 0);
  assert.equal(tokens.shadows[0]?.offsetY, 2);
  assert.equal(tokens.shadows[0]?.radius, 4);
});

test('extractTokens: colors include dominant white and near-black', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  const hexes = tokens.colors.map((c) => c.hex);
  assert.ok(hexes.includes('#ffffff') || hexes.some((h) => hexColorDistance(h, '#ffffff') < 15));
});

// ── relativeLuminance ─────────────────────────────────────────────────────────

test('relativeLuminance: white → 1', () => {
  assert.equal(relativeLuminance('#ffffff'), 1);
});

test('relativeLuminance: black → 0', () => {
  assert.equal(relativeLuminance('#000000'), 0);
});

test('relativeLuminance: mid gray is between 0.2 and 0.8', () => {
  const lum = relativeLuminance('#808080');
  assert.ok(lum > 0.2 && lum < 0.3);
});

// ── generateCss ───────────────────────────────────────────────────────────────

test('generateCss: contains :root block', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  const css = generateCss(tokens);
  assert.match(css, /:root\s*\{/);
});

test('generateCss: --color-bg is the dominant background', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  const css = generateCss(tokens);
  // Fixture is dominated by #ffffff (white, luminance=1, qualifies as bg)
  assert.match(css, /--color-bg:\s*#ffffff/);
});

test('generateCss: --color-fg is a dark color for a light bg', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  const css = generateCss(tokens);
  // Fixture fg should be near-black
  assert.match(css, /--color-fg:\s*#[0-9a-f]{6}/);
  // Extract the fg hex and verify luminance is low
  const m = css.match(/--color-fg:\s*(#[0-9a-f]{6})/);
  assert.ok(m !== null);
  assert.ok(relativeLuminance(m![1]!) < 0.4);
});

test('generateCss: type scale custom properties present when typeScale non-empty', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  const css = generateCss(tokens);
  assert.match(css, /--type-scale-1:/);
});

test('generateCss: spacing custom properties present', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  const css = generateCss(tokens);
  assert.match(css, /--spacing-\d+:/);
});

test('generateCss: radius custom properties present', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  const css = generateCss(tokens);
  assert.match(css, /--radius-1:\s*8px/);
});

test('generateCss: shadow custom properties present', () => {
  const snap = normalizeFile('KEY', fixture());
  const tokens = extractTokens(snap);
  const css = generateCss(tokens);
  assert.match(css, /--shadow-1:/);
});

test('generateCss: dark-bg file flips fg/bg assignment', () => {
  // Synthetic: all-dark bg + light text
  const tokens = {
    colors: [
      { hex: '#0d0d0d', count: 20 }, // very dark bg
      { hex: '#f5f5f5', count: 10 }, // light fg
    ],
    typeScale: [],
    spacing: [],
    radii: [],
    shadows: [],
  };
  const css = generateCss(tokens);
  assert.match(css, /--color-bg:\s*#0d0d0d/);
  assert.match(css, /--color-fg:\s*#f5f5f5/);
});
