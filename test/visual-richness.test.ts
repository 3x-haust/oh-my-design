import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVisualRichness } from '../core/composition-contract/visual-richness.ts';

function contract(overrides: Partial<Record<string, string>> = {}): string {
  const section = (name: string, fallback: string): string =>
    `## ${name}\n\n${overrides[name] ?? fallback}\n\n`;
  return [
    section('Grid and alignment', 'A 12-column grid with one intentional break forming a deliberate pattern at the anchor.'),
    section('Density and visual mass', 'Density rises toward the anchor via a gradient of visual weight then relaxes for recovery.'),
    section('Focal hierarchy', 'The anchor is concept-bearing typography stating the value claim.'),
    section('Domain form grammar', 'Workflow steps map to a repeating pattern of numbered rows.'),
    section('Media roles', 'The hero section carries a gradient field as an explanatory backdrop.'),
    section('Responsive recomposition', 'The typographic block reflows to a single column at 320px.'),
  ].join('');
}

test('confident register flags a content section with no declared carrier', () => {
  const markdown = contract({ 'Domain form grammar': 'Workflow steps map to functional UI roles with limits noted.' });
  const findings = evaluateVisualRichness({ contract: markdown, register: 'confident' });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.id, 'CARRIER-ADVISORY');
  assert.equal(findings[0]!.section, 'Domain form grammar');
  assert.equal(findings[0]!.severity, 'advisory');
  assert.match(findings[0]!.message, /visual-mass budget/);
});

test('confident register finds nothing when every content section names a carrier', () => {
  const findings = evaluateVisualRichness({ contract: contract(), register: 'confident' });
  assert.deepEqual(findings, []);
});

test('typographic-block and concept-bearing-line phrasing both count as a carrier', () => {
  const markdown = contract({
    'Focal hierarchy': 'The anchor is a concept-bearing line of type stating the value claim.',
    'Responsive recomposition': 'The typographic block reflows to a single column at 320px.',
  });
  const findings = evaluateVisualRichness({ contract: markdown, register: 'confident' });
  assert.deepEqual(findings, []);
});

test('quiet register never advises, even when no section names a carrier', () => {
  const bare = contract({
    'Grid and alignment': 'A 12-column grid with no intentional breaks.',
    'Density and visual mass': 'Density stays flat and restrained throughout.',
    'Focal hierarchy': 'The anchor is a short heading and a single line of body copy.',
    'Domain form grammar': 'Workflow steps map to functional UI roles with limits noted.',
    'Media roles': 'No section carries anything beyond restrained copy.',
    'Responsive recomposition': 'Sections stack in source order at 320px.',
  });
  const findings = evaluateVisualRichness({ contract: bare, register: 'quiet' });
  assert.deepEqual(findings, []);
});

test('register is inferred as quiet from Density and visual mass wording', () => {
  const bare = contract({
    'Density and visual mass': 'This is a deliberately quiet, restrained composition throughout.',
    'Domain form grammar': 'Workflow steps map to functional UI roles with limits noted.',
  });
  const findings = evaluateVisualRichness({ contract: bare });
  assert.deepEqual(findings, []);
});

test('register is inferred as showpiece from Focal hierarchy wording and applies stricter carrier matching', () => {
  const markdown = contract({
    'Focal hierarchy': 'This is a showpiece anchor; media carries the value claim.',
    'Media roles': 'The hero section carries supporting media only.',
  });
  const findings = evaluateVisualRichness({ contract: markdown });
  // "media" alone is too generic for showpiece strictness -> Media roles should be flagged
  assert.ok(findings.some((f) => f.section === 'Media roles'));
});

test('showpiece register accepts a specifically named carrier for Media roles', () => {
  const markdown = contract({
    'Focal hierarchy': 'This is a showpiece anchor; a hero photograph carries the value claim.',
    'Media roles': 'The hero section carries a hero photograph as evidence, not decoration.',
  });
  const findings = evaluateVisualRichness({ contract: markdown, register: 'showpiece' });
  assert.equal(findings.some((f) => f.section === 'Media roles'), false);
});

test('a missing content section produces no finding for that section (index.ts already gates missing sections)', () => {
  const markdown = '## Focal hierarchy\n\nThe anchor is concept-bearing typography.\n';
  const findings = evaluateVisualRichness({ contract: markdown, register: 'confident' });
  assert.deepEqual(findings, []);
});
