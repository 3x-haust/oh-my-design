import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipesDir = join(root, 'core', 'composition');

// ── Required heading structure (must appear in every composition recipe) ─────
// Composition recipes do not use React or Reduced-motion headings (motion is not
// their concern). The five headings below are the standardised structure chosen
// for this cookbook: condition gates, token slots, HTML+CSS skeleton, responsive
// behaviour at 375/768/1280, and explicit combination prohibitions.
const REQUIRED_HEADINGS = [
  '## When it earns its place / When it does not',
  '## Parameters',
  '## Implementation',
  '## Responsive behavior',
  '## Do not combine with',
];

// ── Exactly 8 recipe files ────────────────────────────────────────────────────
const EXPECTED_RECIPES = [
  'typographic-hero.md',
  'asymmetric-diagonal-grid.md',
  'editorial-index-labels.md',
  'section-inversion.md',
  'sidebar-margin-annotation.md',
  'bento-grid.md',
  'split-screen-hero.md',
  'sticky-sidebar-scroll.md',
];

test('core/composition/ directory exists', () => {
  assert.ok(existsSync(recipesDir), `composition directory not found at ${recipesDir}`);
});

test('all 8 expected composition recipe files exist', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    assert.ok(existsSync(path), `missing composition recipe: ${name}`);
  }
});

test('composition directory contains exactly 8 .md files', () => {
  const files = readdirSync(recipesDir).filter((f) => f.endsWith('.md'));
  assert.equal(
    files.length,
    8,
    `expected 8 composition recipe files, found ${files.length}: ${files.join(', ')}`
  );
});

// ── Each recipe contains all five required sections ───────────────────────────

for (const name of EXPECTED_RECIPES) {
  test(`${name} contains all required headings`, () => {
    const path = join(recipesDir, name);
    if (!existsSync(path)) {
      assert.fail(`composition recipe file not found: ${name}`);
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

// ── Each recipe cites layout.md or expressive.md ─────────────────────────────

test('every composition recipe cites layout.md or expressive.md', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    const citesBoth =
      content.includes('layout.md') || content.includes('expressive.md');
    assert.ok(
      citesBoth,
      `${name}: does not cite core/theory/layout.md or expressive.md`
    );
  }
});

// ── Each recipe references CSS custom properties (token slots) ───────────────

test('every composition recipe declares at least one CSS custom property', () => {
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

// ── Each recipe contains responsive breakpoint coverage ──────────────────────
// The Responsive behavior section must mention at least one of the three
// required viewport widths: 375, 768, or 1280.

test('every composition recipe covers responsive viewports in Responsive behavior section', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    const respMatch = /## Responsive behavior([\s\S]*?)(?=\n## |\n# |$)/.exec(content);
    const respSection = respMatch?.[1] ?? '';
    const coversViewports =
      respSection.includes('375') ||
      respSection.includes('768') ||
      respSection.includes('1280');
    assert.ok(
      coversViewports,
      `${name}: Responsive behavior section does not mention any of 375/768/1280 viewport widths`
    );
  }
});

// ── bento-grid.md must contain the anti-slop clause ─────────────────────────

test('bento-grid.md contains SLOP-TRIPLE-CARD anti-slop clause', () => {
  const path = join(recipesDir, 'bento-grid.md');
  if (!existsSync(path)) {
    assert.fail('bento-grid.md not found');
  }
  const content = readFileSync(path, 'utf8');
  assert.ok(
    content.includes('SLOP-TRIPLE-CARD'),
    'bento-grid.md: missing SLOP-TRIPLE-CARD anti-slop clause'
  );
  // The clause must appear in the condition gate section, not only in a "do not combine" note.
  const conditionSection =
    /## When it earns its place \/ When it does not([\s\S]*?)(?=\n## |\n# |$)/.exec(content)?.[1] ?? '';
  assert.ok(
    conditionSection.includes('SLOP-TRIPLE-CARD'),
    'bento-grid.md: SLOP-TRIPLE-CARD clause must appear in the condition gate section'
  );
});

// ── Each recipe's Implementation section references transform or a structural CSS property ──
// Composition recipes use layout properties (grid, flex, position) rather than transform/opacity.
// The check verifies the Implementation section contains meaningful CSS rather than being empty.

test('every composition recipe has substantive Implementation section', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    const implMatch = /## Implementation([\s\S]*?)(?=\n## |\n# |$)/.exec(content);
    const implSection = implMatch?.[1] ?? '';
    // Must contain at least a CSS code block or HTML snippet.
    const hasCode = implSection.includes('```');
    assert.ok(
      hasCode,
      `${name}: Implementation section contains no code block`
    );
  }
});
