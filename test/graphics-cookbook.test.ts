import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipesDir = join(root, 'core', 'graphics');

// ── Required heading structure (must appear in every graphics recipe) ─────────
// Graphics recipes use a five-heading structure: condition gates, token slots,
// working code, linter integration notes (SLOP rules and opacity limits), and
// explicit combination prohibitions.
const REQUIRED_HEADINGS = [
  '## When it earns its place / When it does not',
  '## Parameters',
  '## Implementation',
  '## Linter notes',
  '## Do not combine with',
];

// ── Exactly 6 recipe files ────────────────────────────────────────────────────
const EXPECTED_RECIPES = [
  'gradient-mesh.md',
  'noise-grain-texture.md',
  'svg-geometric-patterns.md',
  'css-illustration-primitives.md',
  'duotone-image-presets.md',
  'placeholder-policy.md',
];

test('core/graphics/ directory exists', () => {
  assert.ok(existsSync(recipesDir), `graphics directory not found at ${recipesDir}`);
});

test('all 6 expected graphics recipe files exist', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    assert.ok(existsSync(path), `missing graphics recipe: ${name}`);
  }
});

test('graphics directory contains exactly 6 .md files', () => {
  const files = readdirSync(recipesDir).filter((f) => f.endsWith('.md'));
  assert.equal(
    files.length,
    6,
    `expected 6 graphics recipe files, found ${files.length}: ${files.join(', ')}`
  );
});

// ── Each recipe contains all five required sections ───────────────────────────

for (const name of EXPECTED_RECIPES) {
  test(`${name} contains all required headings`, () => {
    const path = join(recipesDir, name);
    if (!existsSync(path)) {
      assert.fail(`graphics recipe file not found: ${name}`);
    }
    const content = readFileSync(path, 'utf8');
    for (const heading of REQUIRED_HEADINGS) {
      assert.ok(
        content.includes(heading),
        `${name}: missing heading "${heading}"`
      );
    }
  });
}

// ── gradient-mesh.md must document the SLOP-GRADIENT hue bands ───────────────

test('gradient-mesh.md documents SLOP-GRADIENT hue combinations', () => {
  const path = join(recipesDir, 'gradient-mesh.md');
  if (!existsSync(path)) {
    assert.fail('gradient-mesh.md not found');
  }
  const content = readFileSync(path, 'utf8');
  assert.ok(
    content.includes('SLOP-GRADIENT'),
    'gradient-mesh.md: missing SLOP-GRADIENT rule reference'
  );
  // Must name at least one specific flagged hue combination.
  const namesHueCombination =
    content.includes('indigo') ||
    content.includes('violet') ||
    content.includes('purple') ||
    content.includes('hue-rotate');
  assert.ok(
    namesHueCombination,
    'gradient-mesh.md: Linter notes must name specific flagged hue combinations'
  );
});

// ── placeholder-policy.md must contain the core defect sentence ──────────────

test('placeholder-policy.md states grey box is a design defect', () => {
  const path = join(recipesDir, 'placeholder-policy.md');
  if (!existsSync(path)) {
    assert.fail('placeholder-policy.md not found');
  }
  const content = readFileSync(path, 'utf8');
  assert.ok(
    content.includes('defect'),
    'placeholder-policy.md: must state that a grey box is a design defect'
  );
  // The policy must name all three alternative strategies.
  assert.ok(
    content.includes('typographic'),
    'placeholder-policy.md: must document typographic block alternative'
  );
  assert.ok(
    content.includes('pattern'),
    'placeholder-policy.md: must document pattern fill alternative'
  );
  assert.ok(
    content.includes('gradient'),
    'placeholder-policy.md: must document generated gradient alternative'
  );
});

// ── noise-grain-texture.md must document the data-URI approach ───────────────

test('noise-grain-texture.md uses SVG feTurbulence data-URI technique', () => {
  const path = join(recipesDir, 'noise-grain-texture.md');
  if (!existsSync(path)) {
    assert.fail('noise-grain-texture.md not found');
  }
  const content = readFileSync(path, 'utf8');
  assert.ok(
    content.includes('feTurbulence') || content.includes('data:image/svg'),
    'noise-grain-texture.md: must document SVG feTurbulence data-URI technique'
  );
});

// ── Each recipe references CSS custom properties (token slots) ───────────────

test('every graphics recipe declares at least one CSS custom property', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    assert.ok(
      content.includes('--'),
      `${name}: no CSS custom properties found — recipe must include token slots`
    );
  }
});

// ── Each recipe's Implementation section contains a code block ───────────────

test('every graphics recipe has a code block in Implementation section', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    const implMatch = /## Implementation([\s\S]*?)(?=\n## |\n# |$)/.exec(content);
    const implSection = implMatch?.[1] ?? '';
    assert.ok(
      implSection.includes('```'),
      `${name}: Implementation section contains no code block`
    );
  }
});

// ── Each recipe's Linter notes section is substantive ────────────────────────

test('every graphics recipe has substantive Linter notes section', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    const linterMatch = /## Linter notes([\s\S]*?)(?=\n## |\n# |$)/.exec(content);
    const linterSection = linterMatch?.[1] ?? '';
    assert.ok(
      linterSection.trim().length > 100,
      `${name}: Linter notes section is suspiciously short (< 100 chars) — likely missing content`
    );
  }
});
