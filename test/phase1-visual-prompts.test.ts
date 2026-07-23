import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

test('hand, composer, and eye actively steer toward register-fit visual carriers, not bare gray boxes', () => {
  const hand = read('src/agents/hand.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');

  for (const source of [hand, composer]) {
    assert.match(source, /register \(quiet\/confident\/showpiece\)/i);
  }
  assert.match(eye, /purposeful\s+visual carrier/i);
  assert.match(hand, /gray box/i);
  assert.match(eye, /gray box/i);
  assert.match(composer, /bare placeholder/i);

  assert.match(hand, /gradient-mesh\.md[\s\S]*noise-grain-texture\.md[\s\S]*svg-geometric-patterns\.md[\s\S]*css-illustration-primitives\.md/);
  assert.match(hand, /`theory\/expressive\.md`, and `motion\/recipes\/`/);

  assert.match(composer, /gradient-mesh, noise-grain[\s\S]*texture, svg-geometric patterns, css-illustration primitives/);
  assert.match(composer, /`theory\/expressive\.md`[\s\S]*`motion\/recipes\/` entry/);

  assert.match(eye, /purposeful\s+visual carrier/i);
  assert.match(eye, /signature or static template break/i);
});

test('a marketing surface defaults to the confident register even from a silent brief', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const protocol = read('core/protocol/human-design-loop.md');
  const eye = read('src/agents/eye.agent.yaml');

  // The silent-brief default is asymmetric: marketing/landing defaults up to confident
  // (one committed signature moment + a template departure), never a quiet document.
  for (const source of [skill, protocol]) {
    assert.match(source, /`marketing` surface[\s\S]*defaults to at least the `confident` register/i);
    assert.match(source, /silent `quiet`\/restraint default is reserved for a `product`\/tool-operating surface/i);
    assert.match(source, /single-column marketing page whose only carrier is a functional element[\s\S]*silent-default failure/i);
  }
  // It must not invert the product default: quiet stays correct on a product/tool surface.
  assert.match(eye, /On a `product` or quiet surface the correct risk is functional/i);
});

test('a restrained-colour marketing surface carries its register through scale, with a systematic craft advisory', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  const composer = read('src/agents/composer.agent.yaml');

  // Monochrome/restrained palette must be carried by scale + structure, not uniform body type.
  assert.match(protocol, /Restrained-colour ambition is part of the GREEN target[\s\S]*carried by scale and structure[\s\S]*display-scale type moment/i);
  assert.match(protocol, /Uniform body-scale type across an evenly-stacked monochrome marketing page is the silent-default failure \(RED\)/i);
  // Product/quiet stays exempt — no over-application down-register.
  assert.match(protocol, /A `product`\/quiet surface is exempt — its clarity comes from density, not a display moment/i);

  // Craft detail is advisory and must never become a decorative catalogue.
  assert.match(composer, /One systematic detail layer may reinforce the anchor[\s\S]*never a decorative catalogue and never a substitute for the one signature moment/i);
});

test('deciding the stack is not permission to build before framing and research', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const protocol = read('core/protocol/human-design-loop.md');
  for (const source of [skill, protocol]) {
    // No production write — scaffolding included — before the frame and the scout's research.
    assert.match(source, /Deciding the stack is not permission to build it/i);
    assert.match(source, /no production write[\s\S]*before[\s\S]*fram/i);
    // An explicit stack request records the decision only; it never licenses building first.
    assert.match(source, /explicit stack request[\s\S]*omd decision/i);
    assert.match(source, /routing defect, not a lawful shortcut/i);
  }
});

test('a marketing surface commits a real colour identity and a built visual-material carrier', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  const composer = read('src/agents/composer.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');

  // Colour under-commitment (characterless white/black) is the convergence failure, not restraint.
  assert.match(protocol, /Colour commitment is the other half of the target[\s\S]*characterless near-greyscale default[\s\S]*convergence-to-the-mean failure \(RED\)/i);
  assert.match(protocol, /60-30-10 governs how colour is distributed, never a licence to ship no colour/i);
  // A real built visual-material carrier is expected; a text-only page is a carrier failure.
  assert.match(protocol, /Visual-material carrier is part of the GREEN target[\s\S]*never a text-only page/i);
  assert.match(protocol, /a page with no built visual material is a defect/i);
  // The builders carry the same rule and never settle for text-in-boxes.
  for (const builder of [composer, hand]) {
    assert.match(builder, /still (composes|builds) a (real|genuine) visual carrier[\s\S]*never (text-in-boxes|a text-only page)/i);
    assert.match(builder, /characterless white\/black[\s\S]*convergence-to-the-mean failure, not restraint/i);
  }
});

test('a showpiece surface aims its one verified load scene at award-level ambition without adding unverifiable triggers', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  assert.match(protocol, /Motion ambition is part of the GREEN target on a `showpiece` surface/i);
  assert.match(protocol, /as ambitious as the studied award work[\s\S]*not a token fade or a bare opacity transition/i);
  assert.match(protocol, /A minimal or absent signature scene at showpiece is under-reach, not restraint \(RED\)/i);
  // It raises the ceiling of the verified scene only — the evidence contract is not relaxed.
  assert.match(protocol, /never adds an unverifiable scroll-, pointer-, or state-triggered trigger, and the single-load-scene motion-evidence contract is unchanged/i);
});

test('art direction is evidence-bound autonomous none|one with carrier and decision-fit floors', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  const hand = read('src/agents/hand.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');

  assert.match(protocol, /explicit current-user register or motion instruction is a lock[\s\S]*preserved[\s\S]*never inferred from silence/i);
  assert.match(protocol, /For `marketing`, compare exactly three evidence-grounded directions silently[\s\S]*do not ask the user/i);
  assert.match(protocol, /Never default motion to `one`, invent a motion scene, or convert a user lock into a preference/i);
  assert.match(protocol, /A merely functional element — a working copy button, a form, a nav, or a terminal that only runs a command — is baseline function, never the signature moment[\s\S]*For `motionDecision: none`, require a designed static template break; for `one`, it cannot count as the triggered scene/i);
  for (const source of [hand, composer]) {
    assert.match(source, /register \(quiet\/confident\/showpiece\)/i);
  }

  assert.match(hand, /`motionDecision: one` requires exactly one real[\s\S]*triggered scene/i);
  assert.match(hand, /`motionDecision: none` permits no[\s\S]*triggered scene[\s\S]*designed static template break/i);
  assert.match(eye, /`motionDecision` is implemented exactly \(`one` is one real triggered scene; `none` has none\)/i);
  assert.match(eye, /purposeful\s+visual carrier/i);
  assert.match(eye, /`decision-fit`/i);
  assert.match(eye, /every critical score must be at least 3/i);
  assert.match(eye, /Never demand a signature moment on a quiet\/product surface beyond its recorded art-direction decision/i);
  assert.match(eye, /any file not explicitly\s+supplied\.\s+A fidelity eye receives only the canonical selected projections and handoff receipts/i);
  assert.match(eye, /fidelity-projection exception is limited to those artifacts/i);
  assert.match(eye, /A merely functional element — a working copy button, a form, a nav, or a terminal that only runs a command — is baseline function, never the signature moment[\s\S]*For `motionDecision: none`, require a designed static template break; for `one`, it cannot count as the triggered scene/i);

  assert.match(hand, /Never fabricate assets, data, or product facts to justify a\s+carrier/i);
  assert.match(composer, /Never invent the asset or fact the carrier depends\s+on/i);
  assert.match(composer, /Never stack multiple carriers into a decorative catalogue/i);
});

test('eye flags an absent visual carrier as a hierarchy defect, not a style preference', () => {
  const eye = read('src/agents/eye.agent.yaml');
  assert.match(eye, /When the dominant anchor has no purposeful\s+visual carrier[\s\S]*name that absence as a hierarchy defect, not a\s+style preference/i);
});
test('a showpiece scroll journey is lawful only as scroll-scene-evidence, never as an unsettleable claim', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  assert.match(protocol, /A `showpiece` scroll journey is a lawful escalation only as verified evidence/i);
  assert.match(protocol, /each scene is scroll-position-scrubbed/i);
  assert.match(protocol, /`final-evidence-v2` binds this as `scroll-scene-evidence-v1`/i);
  assert.match(protocol, /Time-triggered scroll animation stays out of scope because it cannot be deterministically settled/i);
  assert.match(protocol, /`confident`\/`quiet`\/`product` surfaces never take this escalation/i);
});
test('an all-neutral marketing palette is a machine-flagged colourless failure, not restraint', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  assert.match(protocol, /`SLOP-COLORLESS`/);
  assert.match(protocol, /on a `marketing`\/showpiece surface that is RED, not a mere warn/i);
});
test('enumerated visual directions must genuinely diverge in colour and generator, not converge to monochrome variants', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  assert.match(protocol, /The enumerated directions must genuinely diverge, not converge/i);
  assert.match(protocol, /each commits a distinct colour identity[\s\S]*never white\/black by default/i);
  assert.match(protocol, /one guess wearing three hats, and the blind selection rejects the set and re-enumerates/i);
});
test('a showpiece landing expects a scroll-motion narrative; its total absence is under-reach', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  assert.match(protocol, /Scroll-motion ambition is part of the GREEN target on a `showpiece` marketing landing/i);
  assert.match(protocol, /scrolls as a plain static document with no scroll-linked motion is under-reach \(RED\)/i);
  assert.match(protocol, /scroll-position-scrubbed motion[\s\S]*satisfies the `scroll-scene-evidence-v1` protocol/i);
  assert.match(protocol, /never a time-triggered scroll animation/i);
});
