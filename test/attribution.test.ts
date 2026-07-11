import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../core/ir/normalize.ts';
import { checkAttribution } from '../core/rules/attribution.ts';
import type { RawIr, RawNode } from '../core/types.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

const run = (args: string[], cwd?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-attribution-'));

// ── helpers ──────────────────────────────────────────────────────────────────

function irWithTokens(tokens: Record<string, unknown>): ReturnType<typeof normalize> {
  const node: RawNode = {
    id: 'r1',
    name: 'Root',
    type: 'FRAME',
    path: 'Root',
    parent: null,
    box: { x: 0, y: 0, w: 1440, h: 900 },
    children: [],
  };
  const raw: RawIr = { nodes: [node], tokens: tokens as Record<string, string> };
  return normalize(raw);
}

// Flat token map: keys use the CSS custom property naming convention (-- stripped).
const COLOR_TOKENS = { 'color-brand-primary': '#FF5A1F', 'color-surface': '#FFFFFF' };
const TYPE_TOKENS = { 'font-size-lg': '18px', 'font-family-base': 'Inter' };
const SPACING_TOKENS = { 'spacing-md': '16px', 'spacing-lg': '24px' };
const RADIUS_TOKENS = { 'radius-sm': '4px', 'radius-md': '8px' };
const MOTION_TOKENS = { 'duration-fast': '150ms', 'ease-out': 'cubic-bezier(0,0,0.3,1)' };

// Nested (Figma-style) token map: top-level key is the group name.
const NESTED_COLOR_TOKENS = { color: { 'brand/primary': '#FF5A1F' } };
const NESTED_TYPE_TOKENS = { font: { 'size-lg': '18px' } };

const CAPTURE_NAMES = ['linear.com.hero', 'apple.com.global', 'stripe.com.pricing'];
const THEORY_NAMES = ['color', 'typography', 'layout', 'motion', 'expressive', 'components', 'craft'];

// ── ATTR-MISSING ─────────────────────────────────────────────────────────────

test('ATTR-MISSING fires when a color token group is on the page but attribution.md has no color row', () => {
  const ir = irWithTokens(COLOR_TOKENS);
  const md = `| Group | Source |\n|---|---|\n| type | linear.com.hero |\n`;
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  assert.ok(v.some((x) => x.id === 'ATTR-MISSING' && String(x.value) === 'color'), 'expected ATTR-MISSING for color');
});

test('ATTR-MISSING fires for every unattributed group, not just the first', () => {
  const ir = irWithTokens({ ...COLOR_TOKENS, ...SPACING_TOKENS });
  const md = `| Group | Source |\n|---|---|\n`;  // empty table, no rows
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  const ids = v.filter((x) => x.id === 'ATTR-MISSING').map((x) => x.value).sort();
  assert.deepEqual(ids, ['color', 'spacing']);
});

test('ATTR-MISSING does not fire when every present token group has a matching row', () => {
  const ir = irWithTokens({ ...COLOR_TOKENS, ...TYPE_TOKENS });
  const md = [
    '| Group | Source |',
    '|---|---|',
    '| color | linear.com.hero |',
    '| type  | theory/typography |',
  ].join('\n');
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  assert.equal(v.filter((x) => x.id === 'ATTR-MISSING').length, 0);
});

test('ATTR-MISSING handles flat CSS property names for all five token groups', () => {
  const ir = irWithTokens({
    ...COLOR_TOKENS,
    ...TYPE_TOKENS,
    ...SPACING_TOKENS,
    ...RADIUS_TOKENS,
    ...MOTION_TOKENS,
  });
  const md = `| Group | Source |\n|---|---|\n`;  // nothing attributed
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  const missing = v.filter((x) => x.id === 'ATTR-MISSING').map((x) => String(x.value)).sort();
  assert.deepEqual(missing, ['color', 'motion', 'radius', 'spacing', 'type']);
});

test('ATTR-MISSING handles nested (Figma-style) token maps', () => {
  const ir = irWithTokens({ ...NESTED_COLOR_TOKENS, ...NESTED_TYPE_TOKENS });
  const md = `| Group | Source |\n|---|---|\n`;
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  const missing = v.filter((x) => x.id === 'ATTR-MISSING').map((x) => String(x.value)).sort();
  assert.ok(missing.includes('color'), 'expected color in missing');
});

test('ATTR-MISSING does not fire when the page has no tokens at all', () => {
  const ir = irWithTokens({});
  const md = `| Group | Source |\n|---|---|\n`;
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  assert.equal(v.filter((x) => x.id === 'ATTR-MISSING').length, 0);
});

// ── ATTR-UNKNOWN-SOURCE ───────────────────────────────────────────────────────

test('ATTR-UNKNOWN-SOURCE fires when a row source is neither a capture name nor a theory ref', () => {
  const ir = irWithTokens(COLOR_TOKENS);
  const md = `| Group | Source |\n|---|---|\n| color | some-random-text |\n`;
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  assert.ok(v.some((x) => x.id === 'ATTR-UNKNOWN-SOURCE'), 'expected ATTR-UNKNOWN-SOURCE');
});

test('ATTR-UNKNOWN-SOURCE does not fire when source is a known capture slug', () => {
  const ir = irWithTokens(COLOR_TOKENS);
  const md = `| Group | Source |\n|---|---|\n| color | linear.com.hero |\n`;
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  assert.equal(v.filter((x) => x.id === 'ATTR-UNKNOWN-SOURCE').length, 0);
});

test('ATTR-UNKNOWN-SOURCE does not fire when source is a theory/<name> reference', () => {
  const ir = irWithTokens(TYPE_TOKENS);
  const md = `| Group | Source |\n|---|---|\n| type | theory/typography |\n`;
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  assert.equal(v.filter((x) => x.id === 'ATTR-UNKNOWN-SOURCE').length, 0);
});

test('ATTR-UNKNOWN-SOURCE fires for theory/<name> when the name is not in the theory pack', () => {
  const ir = irWithTokens(COLOR_TOKENS);
  const md = `| Group | Source |\n|---|---|\n| color | theory/nonexistent |\n`;
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  assert.ok(v.some((x) => x.id === 'ATTR-UNKNOWN-SOURCE'), 'expected ATTR-UNKNOWN-SOURCE for unknown theory ref');
});

test('ATTR-UNKNOWN-SOURCE and ATTR-MISSING can both fire in the same run', () => {
  // spacing is on the page (ATTR-MISSING); color row points to an invalid source (ATTR-UNKNOWN-SOURCE)
  const ir = irWithTokens({ ...COLOR_TOKENS, ...SPACING_TOKENS });
  const md = `| Group | Source |\n|---|---|\n| color | typo-slug-here |\n`;
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  assert.ok(v.some((x) => x.id === 'ATTR-MISSING' && String(x.value) === 'spacing'));
  assert.ok(v.some((x) => x.id === 'ATTR-UNKNOWN-SOURCE'));
});

test('checkAttribution returns empty when attribution.md has no table rows', () => {
  const ir = irWithTokens(COLOR_TOKENS);
  const md = '# Attribution\n\nNo table yet.\n';
  const v = checkAttribution(ir, md, CAPTURE_NAMES, THEORY_NAMES);
  // ATTR-MISSING should still fire (tokens present, no row), but no ATTR-UNKNOWN-SOURCE
  assert.equal(v.filter((x) => x.id === 'ATTR-UNKNOWN-SOURCE').length, 0);
});

// ── CLI integration ───────────────────────────────────────────────────────────

test('CLI: omd check exits 1 and reports ATTR-MISSING when attribution.md exists but group is unattributed', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd'), { recursive: true });

  // Write an attribution.md with no rows — page has color tokens, nothing attributed.
  writeFileSync(join(dir, '.omd', 'attribution.md'), '| Group | Source |\n|---|---|\n');

  const irPath = join(dir, 'page.json');
  const raw: RawIr = {
    nodes: [{ id: 'r1', name: 'Root', type: 'FRAME', path: 'Root', parent: null, box: { x: 0, y: 0, w: 1440, h: 900 }, children: [] }],
    tokens: { 'color-brand': '#FF5A1F' } as Record<string, string>,
  };
  writeFileSync(irPath, JSON.stringify(raw));

  const r = run(['check', '--ir', irPath, '--no-log'], dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /ATTR-MISSING/);
});

test('CLI: omd check does not report ATTR-MISSING or ATTR-UNKNOWN-SOURCE when no attribution.md is present', () => {
  const dir = project();
  // No .omd/attribution.md — attribution check is inactive.
  const irPath = join(dir, 'page.json');
  const raw: RawIr = {
    nodes: [{ id: 'r1', name: 'Root', type: 'FRAME', path: 'Root', parent: null, box: { x: 0, y: 0, w: 1440, h: 900 }, children: [] }],
    tokens: { 'color-brand': '#FF5A1F' } as Record<string, string>,
  };
  writeFileSync(irPath, JSON.stringify(raw));

  const r = run(['check', '--ir', irPath, '--no-log'], dir);
  assert.doesNotMatch(r.stdout, /ATTR-MISSING/);
  assert.doesNotMatch(r.stdout, /ATTR-UNKNOWN-SOURCE/);
});

test('CLI: omd check exits 0 when all token groups are properly attributed', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd', 'refs'), { recursive: true });

  // Write a fake capture so the source slug resolves.
  writeFileSync(join(dir, '.omd', 'refs', 'example.com.hero.json'), JSON.stringify({
    source: 'https://example.com', component: 'hero', kind: 'page',
    capturedAt: new Date().toISOString(), invariants: null, principles: [],
  }));
  writeFileSync(join(dir, '.omd', 'attribution.md'), [
    '| Group | Source |',
    '|---|---|',
    '| color | example.com.hero |',
  ].join('\n'));

  const irPath = join(dir, 'page.json');
  const raw: RawIr = {
    nodes: [{ id: 'r1', name: 'Root', type: 'FRAME', path: 'Root', parent: null, box: { x: 0, y: 0, w: 1440, h: 900 }, children: [] }],
    tokens: { 'color-brand': '#FF5A1F' } as Record<string, string>,
  };
  writeFileSync(irPath, JSON.stringify(raw));

  const r = run(['check', '--ir', irPath, '--no-log'], dir);
  assert.doesNotMatch(r.stdout, /ATTR-MISSING/);
  assert.doesNotMatch(r.stdout, /ATTR-UNKNOWN-SOURCE/);
});
