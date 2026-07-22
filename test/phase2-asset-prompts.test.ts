import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

test('hand and composer state the three-path asset sourcing precedence with duotone default', () => {
  const hand = read('src/agents/hand.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');

  for (const source of [hand, composer]) {
    assert.match(source, /asset sourcing precedence|OMD's precedence/i);
    assert.match(source, /\(default\)[\s\S]*user-provided asset[\s\S]*duotone/i);
    assert.match(source, /\(conditional\)[\s\S]*AI-generated imagery/i);
    assert.match(source, /\(additive\)[\s\S]*WebGL\/3D/i);
  }
});

test('hand and composer confine AI-generated imagery to abstract/atmospheric zones and forbid factual carriers', () => {
  const hand = read('src/agents/hand.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');

  for (const source of [hand, composer]) {
    assert.match(source, /host environment declares\s+image-generation\s+capability/i);
    assert.match(source, /(?:only for|only when the .* zone permits)\s+an?\s+abstract or atmospheric\s+zone/i);
    assert.match(source, /factual[\s\S]*team photo, product screenshot, real person, (?:or )?logo/i);
    assert.match(source, /never\s+(?:be satisfied by AI-generated imagery|for a\s+factual\s+carrier)/i);
  }
});

test('hand and composer require committed provenance for AI-generated imagery', () => {
  const hand = read('src/agents/hand.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');

  assert.match(hand, /committed provenance \(the prompt and the\s+provider\) recorded with `omd decision`/i);
  assert.match(composer, /committed\s+provenance \(prompt and provider\)/i);
});

test('hand and composer gate WebGL/3D on hand precedence, a performance budget, and a non-canvas semantic fallback', () => {
  const hand = read('src/agents/hand.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');

  for (const source of [hand, composer]) {
    assert.match(source, /hand\s+precedence \(an explicit user request or a greenfield concept\s+necessity\)/i);
    assert.match(source, /declared performance budget/i);
    assert.match(source, /non-canvas semantic fallback/i);
  }
});

test('hand and composer fall back to user asset or CSS\\/SVG per the placeholder policy when no path applies', () => {
  const hand = read('src/agents/hand.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');

  for (const source of [hand, composer]) {
    assert.match(source, /existing\s+CSS\/SVG graphics recipes/i);
    assert.match(source, /grey box is a\s+defect, never the final answer/i);
  }
});

test('asset sourcing preserves evidence-bound carrier and dependency locks', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  const hand = read('src/agents/hand.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');

  // G0 stack precedence + no-unnecessary-dependencies lock (hand only).
  assert.match(hand, /Framework scaffold dependencies[\s\S]*are allowed[\s\S]*do not add unnecessary dependencies to an existing project/);

  // G1 media/carrier locks preserved verbatim on both agents.
  assert.match(hand, /Do not mandate a photo or invent product facts\/assets/);
  assert.match(composer, /never mandate a photo or invent facts\/assets/);
  assert.match(hand, /Never fabricate assets, data, or product facts to justify a\s+carrier/i);
  assert.match(composer, /Never invent the asset or fact the carrier depends\s+on/i);

  // Autonomous direction selection is locked by explicit user input and never defaults to motion.
  assert.match(protocol, /explicit current-user register or motion instruction is a lock[\s\S]*never inferred from silence/i);
  assert.match(protocol, /compare exactly three evidence-grounded directions silently[\s\S]*do not ask the user/i);
  assert.match(protocol, /`none` is legal[\s\S]*adequate static proof[\s\S]*`one` is legal only when one declared motion hypothesis is eligible/i);
  assert.match(hand, /`motionDecision: one` requires exactly one real[\s\S]*triggered scene/i);
  assert.match(hand, /`motionDecision: none` permits no[\s\S]*triggered scene[\s\S]*designed static template break/i);

  // The asset sections narrow *how*, not whether/what, a carrier is sourced.
  assert.match(hand, /never overrides the carrier\s+or restraint rules above/i);
  assert.match(composer, /never overrides the media-role or restraint rules above/i);
});
