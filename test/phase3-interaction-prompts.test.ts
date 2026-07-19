import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('composer names the three autonomous signature-interaction mechanisms and keeps them gated', () => {
  const composer = read('src/agents/composer.agent.yaml');

  // The three mechanisms: recipe pack, generative ideation, reference signal board.
  assert.match(composer, /core\/interaction\/recipes\/`? recipe pack/);
  assert.match(composer, /generative ideation/i);
  assert.match(composer, /core\/interaction\/`? scout\s+signal board/);

  // Signal board is separated from the distance gate — measurement/principle, not
  // screenshot imitation.
  assert.match(composer, /separate collection surface from `core\/ref\/distance\.ts`/);
  assert.match(composer, /never imitate a\s+reference screenshot/i);

  // Lanes in order: CSS scroll-driven, then React animation libraries (GSAP/ScrollTrigger, Framer Motion), WebGL escalation-only.
  assert.match(composer, /interaction lanes are, in order: CSS scroll-driven/i);
  assert.match(composer, /GSAP with ScrollTrigger[\s\S]*Framer Motion \(`motion`\)/i);
  assert.match(composer, /first-class lane preferred over hand-rolled rAF/i);
  assert.match(composer, /escalating to WebGL is an escalation, not a default/i);

  // Autonomy never bypasses the existing gates.
  assert.match(
    composer,
    /autonomous ideation never bypasses\s+register-fit, the performance budget, the slop gates, hand precedence/i
  );

  // Register-fit and the one-signature-moment restraint still apply to interactions.
  assert.match(composer, /Fit the interaction to register/i);
  assert.match(composer, /one-signature-moment restraint/i);
});

test('composer additive does not weaken the pre-existing one-signature-moment and carrier lock text', () => {
  const composer = read('src/agents/composer.agent.yaml');
  assert.match(
    composer,
    /Assign at most one signature moment; do not stack multiple\s+carriers into a decorative catalogue/i
  );
  assert.match(composer, /never overrides the media-role or restraint rules above/i);
});

test('sketch represents an assigned interaction role structurally without implementing motion', () => {
  const sketch = read('src/agents/sketch.agent.yaml');

  assert.match(sketch, /interaction-based signature moment/i);
  assert.match(sketch, /core\/interaction\/recipes\/`? pack/);
  assert.match(sketch, /core\/interaction\/`? reference signal board/);
  assert.match(sketch, /structural footprint/i);
  assert.match(sketch, /Do not implement the interaction, its motion, timing, or any WebGL canvas/i);
  assert.match(sketch, /CSS scroll-driven default vs\. WebGL escalation/i);

  // Must not relax the pre-existing no-motion / no-colour-direction constraint.
  assert.match(
    sketch,
    /No production edits, colour\s+direction, motion, polished or decorative graphics, or persuasive rationale\./
  );
});

test('phase-1/phase-2 restraint and dependency locks on composer/sketch remain intact', () => {
  const composer = read('src/agents/composer.agent.yaml');
  const sketch = read('src/agents/sketch.agent.yaml');

  assert.match(composer, /never mandate a photo or invent facts\/assets/);
  assert.match(composer, /Never invent the asset or fact the carrier depends\s+on/i);
  assert.match(
    sketch,
    /approved typography and\s+composition contracts[\s\S]*one axis assigned/i
  );
  assert.match(
    sketch,
    /four structural proofs[\s\S]*1280x900[\s\S]*390x844[\s\S]*full-page desktop[\s\S]*full-page mobile/i
  );
});
