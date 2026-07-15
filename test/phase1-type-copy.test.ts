import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

test('typesetter prompt names the four typography-expression fronts and Korean composition quality', () => {
  const typesetter = read('src/agents/typesetter.agent.yaml');
  assert.match(typesetter, /expressive or variable-font face/i);
  assert.match(typesetter, /bold hierarchy with deliberate scale and contrast/i);
  assert.match(typesetter, /experimental\s+typographic treatment for the one signature moment/i);
  assert.match(typesetter, /Korean typesetting quality[\s\S]*syllable-block density, punctuation alignment, and mixed\s+Korean\/Latin\/numeral rhythm/i);
  assert.match(typesetter, /Never trade Hangul composition quality for a display effect/);
});

test('typesetter prompt sets a font performance budget aligned with the type-proof record', () => {
  const typesetter = read('src/agents/typesetter.agent.yaml');
  assert.match(typesetter, /subset each family to the scripts and glyphs/i);
  assert.match(typesetter, /declare\s+`unicode-range`\s+per subset/);
  assert.match(typesetter, /choose\s+`font-display`\s+from\s+the loading behaviour you tested/i);
  assert.match(typesetter, /request only the variable axes the proof actually\s+exercises/i);
  assert.match(typesetter, /unshipped weight the fast-loading type-proof record must justify or drop/i);
});

test('writer prompt names the three copy-sharpening fronts and keeps blind review as the gate', () => {
  const writer = read('src/agents/writer.agent.yaml');
  assert.match(writer, /Sharpen copy on three fronts/);
  assert.match(writer, /sharp, concrete lines grounded in a verified fact or the\s+brief, not a generic claim/i);
  assert.match(writer, /align every headline, label,\s+and CTA with the concept the visual carrier actually shows/i);
  assert.match(writer, /remove AI stock phrasing, hedges, and cliché per\s+`theory\/voice\.md`/i);
  assert.match(writer, /Awareness of text-slop patterns is advisory context for your own drafting, never a\s+gate you self-certify/i);
  assert.match(writer, /the blind copy review remains the enforcement point/);
});

test('writer prompt preserves the pre-existing deck-ownership and fact-policy boundaries verbatim', () => {
  const writer = read('src/agents/writer.agent.yaml');
  assert.match(writer, /only `.omd\/copy-deck\.md`/);
  assert.match(writer, /Never edit UI, code, components, styles, layout/);
  assert.match(writer, /sole deck owner[\s\S]*repair the deck first[\s\S]*production\s+source to omd-hand/i);
});
