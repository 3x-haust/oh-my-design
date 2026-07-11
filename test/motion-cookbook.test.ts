import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipesDir = join(root, 'core', 'motion', 'recipes');
const easingFile = join(root, 'core', 'motion', 'easing.md');

// ── Required heading structure (must appear in every recipe file) ────────────
// These are the six headings standardised across the cookbook.
const REQUIRED_HEADINGS = [
  '## When it earns its place / When it does not',
  '## Parameters',
  '## Implementation',
  '## React',
  '## Reduced-motion variant',
  '## Performance note',
];

// ── Exactly 12 recipe files ──────────────────────────────────────────────────
const EXPECTED_RECIPES = [
  'split-text-entrance.md',
  'scroll-reveal.md',
  'stagger-orchestrator.md',
  'sticky-scene-transition.md',
  'section-color-inversion.md',
  'marquee.md',
  'magnetic-hover.md',
  'page-loader.md',
  'number-counter.md',
  'image-hover-distortion.md',
  'view-transitions.md',
  'parallax.md',
];

test('core/motion/easing.md exists', () => {
  assert.ok(existsSync(easingFile), `easing.md not found at ${easingFile}`);
});

test('core/motion/recipes/ directory exists', () => {
  assert.ok(existsSync(recipesDir), `recipes directory not found at ${recipesDir}`);
});

test('all 12 expected recipe files exist', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    assert.ok(existsSync(path), `missing recipe: ${name}`);
  }
});

test('recipes directory contains exactly 12 .md files', () => {
  const files = readdirSync(recipesDir).filter((f) => f.endsWith('.md'));
  assert.equal(
    files.length,
    12,
    `expected 12 recipe files, found ${files.length}: ${files.join(', ')}`
  );
});

// ── Each recipe contains all six required sections ───────────────────────────

for (const name of EXPECTED_RECIPES) {
  test(`${name} contains all required headings`, () => {
    const path = join(recipesDir, name);
    if (!existsSync(path)) {
      assert.fail(`recipe file not found: ${name}`);
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

// ── easing.md contains the expected tokens ───────────────────────────────────

test('easing.md contains --ease-out-expo token', () => {
  const content = readFileSync(easingFile, 'utf8');
  assert.ok(content.includes('--ease-out-expo'), 'easing.md missing --ease-out-expo');
});

test('easing.md contains --ease-out-back token', () => {
  const content = readFileSync(easingFile, 'utf8');
  assert.ok(content.includes('--ease-out-back'), 'easing.md missing --ease-out-back');
});

test('easing.md contains --ease-spring token with linear() approximation', () => {
  const content = readFileSync(easingFile, 'utf8');
  assert.ok(content.includes('--ease-spring'), 'easing.md missing --ease-spring');
  assert.ok(content.includes('linear('), 'easing.md missing linear() spring approximation');
});

test('easing.md contains semantic guidance prose (not just token declarations)', () => {
  const content = readFileSync(easingFile, 'utf8');
  // The file must have explanatory prose beyond just CSS variable declarations.
  assert.ok(content.includes('register'), 'easing.md missing register guidance');
  assert.ok(content.length > 2000, 'easing.md suspiciously short — likely missing prose');
});

// ── Each recipe references prefers-reduced-motion ────────────────────────────

test('every recipe mentions prefers-reduced-motion', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    assert.ok(
      content.includes('prefers-reduced-motion'),
      `${name}: does not mention prefers-reduced-motion`
    );
  }
});

// ── Each recipe avoids animating layout properties ───────────────────────────
// Recipes should not instruct the hand to animate width, height, top, left, etc.
// We check that any transition declarations in the recipe explicitly name
// transform and/or opacity — not layout-triggering properties in the main
// implementation section (the performance note may mention them by name as
// a prohibition, which is correct).
// This is a soft structural check: each recipe's Implementation section must
// include at least one reference to 'transform' or 'opacity' in animation context.

test('every recipe references transform or opacity in its Implementation section', () => {
  for (const name of EXPECTED_RECIPES) {
    const path = join(recipesDir, name);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, 'utf8');
    // Extract text from ## Implementation to the next ## heading.
    const implMatch = /## Implementation([\s\S]*?)(?=\n## |\n# |$)/.exec(content);
    const implSection = implMatch?.[1] ?? '';
    const hasComposited = implSection.includes('transform') || implSection.includes('opacity');
    assert.ok(
      hasComposited,
      `${name}: Implementation section does not reference transform or opacity`
    );
  }
});
