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
