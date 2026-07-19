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

test('imagegen ref distance is advisory and drafts may seed from the selected references', () => {
  const t = read('core/theory/imagegen.md');
  assert.match(t, /ref distance/);
  assert.match(t, /advisory/i);
  assert.match(t, /never blocks shipping/i);
  // Drafts may now seed from the selected references (clean-room input-class gating removed).
  assert.match(t, /seeded from the selected/i);
});

test('imagegen theory carries the variation engine and the anti-AI-default tells', () => {
  const t = read('core/theory/imagegen.md');
  assert.match(t, /left-text ?\/ ?right-image/i, 'names the most overused AI hero pattern');
  assert.match(t, /composition anchor/i);
  assert.match(t, /at least 3 different anchors/i);
});

test('composer runs image-first from the chosen draft, gated by register and host capability', () => {
  const c = read('agents/composer.md');
  assert.match(c, /image-first/i);
  assert.match(c, /theory\/imagegen\.md/);
  assert.match(c, /skin-abstracted\s+blueprint/i);
  assert.doesNotMatch(c, /--shot/);
  assert.match(c, /coordinator-chosen draft/i);
  assert.match(c, /does not generate images,[\s\S]*manage a draft cache, select a draft, or record a decision/i);
});

test('hand implements against the draft with image-to-code fidelity and never ships the draft', () => {
  const h = read('agents/hand.md');
  assert.match(h, /image-to-code/i);
  assert.match(h, /never ship the draft image|never ship the draft/i);
  assert.match(h, /ref distance/);
});

test('scout routes reference fidelity to the hand with an advisory distance signal', () => {
  const s = read('agents/scout.md');
  assert.match(s, /the hand builds from its local part-image/i);
  assert.match(s, /\.omd\/refs\//);
  assert.match(s, /image-to-code fidelity/i);
  assert.match(s, /omd ref distance` is advisory/i);
  assert.match(s, /never blocks shipping/i);
  // The imagegen draft-seed path (blueprint) still exists for the composer route.
  assert.match(s, /blueprint/i);
  assert.match(s, /theory\/imagegen\.md/);
});

test('ultradesign SKILL wires host-owned image-first draft generation', () => {
  const skill = read('skills/ultradesign/SKILL.md');
  assert.match(skill, /image-first art-direction directions/i);
  assert.match(skill, /host\/coordinator owns concurrent[\s\S]*draft generation/i);
  assert.match(skill, /cache management,? and blind selection/i);
  assert.match(skill, /coordinator-chosen draft as art-direction input/i);
});
