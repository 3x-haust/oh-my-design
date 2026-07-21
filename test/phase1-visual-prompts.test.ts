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
  assert.match(eye, /register-fit signature\s+moment/i);
  assert.match(hand, /gray box/i);
  assert.match(eye, /gray box/i);
  assert.match(composer, /bare placeholder/i);

  assert.match(hand, /gradient-mesh\.md[\s\S]*noise-grain-texture\.md[\s\S]*svg-geometric-patterns\.md[\s\S]*css-illustration-primitives\.md/);
  assert.match(hand, /`theory\/expressive\.md`, and `motion\/recipes\/`/);

  assert.match(composer, /gradient-mesh, noise-grain[\s\S]*texture, svg-geometric patterns, css-illustration primitives/);
  assert.match(composer, /`theory\/expressive\.md`[\s\S]*`motion\/recipes\/` entry/);

  assert.match(eye, /gradient-mesh, noise-grain, svg-geometric, css-illustration,[\s\S]*or motion/);
});

test('hand, composer, and eye require restraint to exactly one signature moment and forbid fabricated carriers', () => {
  const hand = read('src/agents/hand.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');

  assert.match(hand, /a `marketing` or showpiece surface must carry\s+exactly one signature moment/i);
  assert.match(hand, /Never a catalogue of techniques — one bold concept committed/i);
  assert.match(hand, /Never fabricate assets, data, or product facts to justify a\s+carrier/i);

  assert.match(composer, /On a `marketing` or showpiece surface assign exactly one signature/i);
  assert.match(composer, /Never stack multiple carriers into a decorative catalogue/i);
  assert.match(composer, /Never invent the asset or fact the carrier depends\s+on/i);

  assert.match(eye, /one register-fit signature\s+moment with a decorative catalogue/i);
});

test('eye flags an absent visual carrier as a hierarchy defect, not a style preference', () => {
  const eye = read('src/agents/eye.agent.yaml');
  assert.match(eye, /When the dominant anchor has no purposeful\s+visual carrier[\s\S]*name that absence as a hierarchy defect, not a style preference/i);
});
