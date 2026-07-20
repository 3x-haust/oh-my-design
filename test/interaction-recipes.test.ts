import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipesDir = join(root, 'core', 'interaction', 'recipes');
const signatureLightingFile = join(recipesDir, 'signature-lighting.md');

// ── Required heading structure ────────────────────────────────────────────

const REQUIRED_HEADINGS = [
  '## When it earns its place / When it does not',
  '## Parameters',
  '## Implementation',
  '## WebGL escalation',
  '## Reduced-motion variant',
  '## Performance note',
];

test('core/interaction/recipes/ directory exists', () => {
  assert.ok(existsSync(recipesDir), `recipes directory not found at ${recipesDir}`);
});

test('core/interaction/recipes/signature-lighting.md exists', () => {
  assert.ok(
    existsSync(signatureLightingFile),
    `signature-lighting.md not found at ${signatureLightingFile}`
  );
});

test('signature-lighting.md contains all required headings', () => {
  const content = readFileSync(signatureLightingFile, 'utf8');
  for (const heading of REQUIRED_HEADINGS) {
    assert.ok(content.includes(heading), `signature-lighting.md: missing heading "${heading}"`);
  }
});

test('signature-lighting.md mentions prefers-reduced-motion', () => {
  const content = readFileSync(signatureLightingFile, 'utf8');
  assert.ok(
    content.includes('prefers-reduced-motion'),
    'signature-lighting.md does not mention prefers-reduced-motion'
  );
});

test('signature-lighting.md describes a CSS default lane and a gated WebGL escalation', () => {
  const content = readFileSync(signatureLightingFile, 'utf8');

  // CSS is named as the default lane.
  assert.match(content, /CSS is the default lane/i);
  assert.match(content, /radial-gradient/);

  // WebGL escalation section names its gates explicitly.
  const escalationMatch = /## WebGL escalation([\s\S]*?)(?=\n## |$)/.exec(content);
  assert.ok(escalationMatch, 'signature-lighting.md missing WebGL escalation section body');
  const escalation = escalationMatch![1]!;
  assert.match(escalation, /explicit user request/i);
  assert.match(escalation, /performance budget/i);
  assert.match(escalation, /non-canvas semantic fallback/i);
  assert.match(escalation, /Three\.js/);
});

test('signature-lighting.md cites kaolti as a reference with a restraint self-critique basis', () => {
  const content = readFileSync(signatureLightingFile, 'utf8');
  assert.match(content, /kaolti/i);
  assert.match(content, /Three\.js/);
  assert.match(content, /Fable/i);
  // The reference's own self-critique about excess visual noise grounds the
  // restraint calibration — this must not be a bare citation.
  assert.match(content, /(?:visual noise|too much)[\s\S]*restraint/i);
});

test('signature-lighting.md does not gate its reference against core/ref/distance.ts scoring', () => {
  const content = readFileSync(signatureLightingFile, 'utf8');
  assert.doesNotMatch(content, /distance\.ts/);
  assert.doesNotMatch(content, /WEIGHTS/);
});

// ── Existing motion/composition recipe-count contracts stay untouched ──────

test('core/interaction/recipes/ does not disturb the motion recipe count', () => {
  const motionRecipesDir = join(root, 'core', 'motion', 'recipes');
  const files = readdirSync(motionRecipesDir).filter((f) => f.endsWith('.md'));
  assert.equal(files.length, 12, `expected motion recipes to remain 12, found ${files.length}`);
});

test('core/interaction/recipes/ does not disturb the composition recipe count', () => {
  const compositionDir = join(root, 'core', 'composition');
  const files = readdirSync(compositionDir).filter((f) => f.endsWith('.md'));
  assert.equal(
    files.length,
    12,
    `expected composition recipes to remain 12 (9 editorial + 3 product-surface), found ${files.length}`
  );
});
