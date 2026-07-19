import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Locks the image-first (imagegen) art-direction wiring: the theory file exists and states the
// load-bearing rules, and composer/hand/scout/SKILL reference it without breaking OMD's
// clean-room and anti-fabrication invariants (generated image = reference not shipped asset,
// factual carriers never AI, kinship gate remains the anti-laundering backstop).

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

test('theory/imagegen.md exists and states the mandatory image-first order', () => {
  const t = read('core/theory/imagegen.md');
  assert.match(t, /image-first/i);
  assert.match(t, /Generate[\s\S]*Analyze[\s\S]*(Feed|implement)/i, 'names generate -> analyze -> implement order');
});

test('imagegen theory keeps a generated image as a design reference, never a shipped asset', () => {
  const t = read('core/theory/imagegen.md');
  assert.match(t, /never (a )?shipped (page )?asset/i);
  assert.match(t, /factual carrier[\s\S]*never (be )?AI-generated|NEVER AI-generated/i);
});

test('imagegen theory names the kinship gate as the anti-laundering backstop for reference seeding', () => {
  const t = read('core/theory/imagegen.md');
  assert.match(t, /ref distance/);
  assert.match(t, /0\.6/);
  assert.match(t, /backstop/i);
  // The builder never sees reference screenshots; seeds are synthesized, not single-reference pixels.
  assert.match(t, /never target a specific reference'?s? pixels|builder\s+never sees these reference screenshots/i);
});

test('imagegen theory carries the variation engine and the anti-AI-default tells', () => {
  const t = read('core/theory/imagegen.md');
  assert.match(t, /left-text ?\/ ?right-image/i, 'names the most overused AI hero pattern');
  assert.match(t, /composition anchor/i);
  assert.match(t, /at least 3 different anchors/i);
});

test('composer runs image-first seeded by clean-room grammar, gated by register and host capability', () => {
  const c = read('agents/composer.md');
  assert.match(c, /image-first/i);
  assert.match(c, /theory\/imagegen\.md/);
  assert.match(c, /skin-abstracted\s+blueprint/i);
  assert.doesNotMatch(c, /--shot/);
  assert.match(c, /host\/coordinator-produced\s+clean-room\s+draft\s+reference/i);
  assert.match(c, /no\s+source screenshot, URL, pixels, or visual likeness/i);
});

test('hand implements against the draft with image-to-code fidelity and never ships the draft', () => {
  const h = read('agents/hand.md');
  assert.match(h, /image-to-code/i);
  assert.match(h, /never ship the draft image|never ship the draft/i);
  assert.match(h, /ref distance/);
});

test('scout allows a per-component transplant but still forbids whole-page imitation', () => {
  const s = read('agents/scout.md');
  // The page-level clean-room invariant must survive: no whole-page imitation, distance still gates.
  assert.match(s, /Do not hand a builder a whole page or a source-page description to imitate/i);
  assert.match(s, /forbids whole-page copying/i);
  assert.match(s, /omd ref distance/);
  // A user-directed component transplant from the local part-image is intended.
  assert.match(s, /per-component transplant is intended/i);
  assert.match(s, /\.omd\/refs\//);
  // The imagegen draft-seed path (blueprint, synthesized seeds) still exists.
  assert.match(s, /blueprint/i);
  assert.match(s, /theory\/imagegen\.md/);
});

test('ultradesign SKILL wires host-owned clean-room draft generation', () => {
  const skill = read('skills/ultradesign/SKILL.md');
  assert.match(skill, /clean-room art-direction directions/i);
  assert.match(skill, /host\/coordinator owns concurrent draft generation/i);
  assert.match(skill, /cache\s+management,\s+blind\s+selection,\s+and\s+provenance\/decision\s+recording/i);
  assert.match(skill, /no source screenshot, URL,[\s\S]*pixels, or visual likeness/i);
});
