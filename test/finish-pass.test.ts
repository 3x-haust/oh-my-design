import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const craftDir = join(root, 'core', 'craft');
const finishPassFile = join(craftDir, 'finish-pass.md');

// ── Required section headings ────────────────────────────────────────────────
// Each heading corresponds to one finish-pass checklist item.
const REQUIRED_HEADINGS = [
  '## ::selection',
  '## Focus ring',
  '## Scrollbar',
  '## Optical alignment',
  '## Favicon',
  '## OG and meta',
];

// ── Presence checks ──────────────────────────────────────────────────────────

test('core/craft/ directory exists', () => {
  assert.ok(existsSync(craftDir), `craft directory not found at ${craftDir}`);
});

test('core/craft/finish-pass.md exists', () => {
  assert.ok(existsSync(finishPassFile), `finish-pass.md not found at ${finishPassFile}`);
});

test('core/craft/ contains exactly 1 .md file', () => {
  const files = readdirSync(craftDir).filter((f) => f.endsWith('.md'));
  assert.equal(
    files.length,
    1,
    `expected 1 file in core/craft/, found ${files.length}: ${files.join(', ')}`
  );
});

// ── Section structure ────────────────────────────────────────────────────────

for (const heading of REQUIRED_HEADINGS) {
  test(`finish-pass.md contains section "${heading}"`, () => {
    if (!existsSync(finishPassFile)) assert.fail('finish-pass.md not found');
    const content = readFileSync(finishPassFile, 'utf8');
    assert.ok(
      content.includes(heading),
      `finish-pass.md: missing section heading "${heading}"`
    );
  });
}

// ── Content requirements ─────────────────────────────────────────────────────

test('finish-pass.md mentions :focus-visible (not bare outline suppression)', () => {
  const content = readFileSync(finishPassFile, 'utf8');
  assert.ok(
    content.includes(':focus-visible'),
    'finish-pass.md: missing :focus-visible — must cite the correct pseudo-class'
  );
});

test('finish-pass.md cites A11Y-FOCUS-SUPPRESSED or FOCUS rule', () => {
  const content = readFileSync(finishPassFile, 'utf8');
  assert.ok(
    content.includes('A11Y-FOCUS-SUPPRESSED') || content.includes('FOCUS'),
    'finish-pass.md: must cite the FOCUS rule (A11Y-FOCUS-SUPPRESSED)'
  );
});

test('finish-pass.md mentions scrollbar-color and scrollbar-width (standards-track)', () => {
  const content = readFileSync(finishPassFile, 'utf8');
  assert.ok(
    content.includes('scrollbar-color'),
    'finish-pass.md: missing scrollbar-color (standards-track property)'
  );
  assert.ok(
    content.includes('scrollbar-width'),
    'finish-pass.md: missing scrollbar-width (standards-track property)'
  );
});

test('finish-pass.md mentions -webkit-scrollbar as fallback', () => {
  const content = readFileSync(finishPassFile, 'utf8');
  assert.ok(
    content.includes('-webkit-scrollbar'),
    'finish-pass.md: missing -webkit-scrollbar fallback'
  );
});

test('finish-pass.md favicon section contains inline SVG data-URI example', () => {
  const content = readFileSync(finishPassFile, 'utf8');
  const faviconSection = /## Favicon([\s\S]*?)(?=\n## |\n# |$)/.exec(content)?.[1] ?? '';
  assert.ok(
    faviconSection.includes('data:image/svg+xml'),
    'finish-pass.md Favicon section: missing inline SVG data-URI example'
  );
});

test('finish-pass.md ::selection section derives colour from accent token', () => {
  const content = readFileSync(finishPassFile, 'utf8');
  const selectionSection = /## ::selection([\s\S]*?)(?=\n## |\n# |$)/.exec(content)?.[1] ?? '';
  assert.ok(
    selectionSection.includes('--color-accent') || selectionSection.includes('accent'),
    'finish-pass.md ::selection section: must derive colour from the accent token'
  );
});

test('finish-pass.md OG section requires copy to pass slop rules', () => {
  const content = readFileSync(finishPassFile, 'utf8');
  const ogSection = /## OG and meta([\s\S]*?)(?=\n## |\n# |$)/.exec(content)?.[1] ?? '';
  assert.ok(
    ogSection.includes('SLOP-COPY') || ogSection.includes('slop'),
    'finish-pass.md OG section: must state that OG copy passes slop rules'
  );
});

test('finish-pass.md has substantive intro prose (not just headers)', () => {
  const content = readFileSync(finishPassFile, 'utf8');
  // The file must start with a paragraph before the first ## heading.
  const beforeFirstHeading = content.split('\n## ')[0] ?? '';
  assert.ok(
    beforeFirstHeading.length > 200,
    'finish-pass.md: intro prose is too short — the file must open with essayistic rationale'
  );
});

// ── Build dist check ─────────────────────────────────────────────────────────

test('dist/claude/core/craft/finish-pass.md exists after build', () => {
  const distPath = join(root, 'dist', 'claude', 'core', 'craft', 'finish-pass.md');
  assert.ok(
    existsSync(distPath),
    `dist/claude/core/craft/finish-pass.md not found — run npm run build`
  );
});

test('dist/codex/core/craft/finish-pass.md exists after build', () => {
  const distPath = join(root, 'dist', 'codex', 'core', 'craft', 'finish-pass.md');
  assert.ok(
    existsSync(distPath),
    `dist/codex/core/craft/finish-pass.md not found — run npm run build`
  );
});
