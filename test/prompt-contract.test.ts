import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

test('durable protocol, coordinator, and hand share the same stack precedence', () => {
  const sources = [
    read('core/protocol/human-design-loop.md'),
    read('src/skills/omd-ultradesign/SKILL.md'),
    read('src/agents/hand.agent.yaml'),
  ];
  for (const source of sources) {
    const contract = source.replace(/\s+/g, ' ');
    assert.match(contract, /explicit user request > existing repository stack\/toolchain.*React \+ Vite \+ TypeScript only for a truly blank greenfield/);
    assert.match(contract, /Plain HTML greenfield.*(?:explicit user request|user explicitly requests)/i);
    assert.match(source, /no autonomous single-static|no autonomous single-static-page|There is no autonomous\s+single-static-surface/i);
    assert.match(source, /unrecognised package\/toolchain|unrecognised package\s+or toolchain/i);
    assert.doesNotMatch(source, /plain HTML (?:is|as) the (?:greenfield )?default/i);
  }
});

test('hand records stack evidence before first write and preserves existing surfaces', () => {
  const hand = read('src/agents/hand.agent.yaml');
  assert.match(hand, /Before the first write[\s\S]*brief[\s\S]*package\.json[\s\S]*representative existing surface or component/);
  assert.match(hand, /Record the stack choice and[\s\S]*evidence/);
  assert.match(hand, /existing vanilla HTML/);
  assert.match(hand, /Greenfield scaffold dependencies are allowed[\s\S]*do not add unnecessary\s+dependencies to an existing project/);
});

test('copy is an isolated writer-editor boundary before sketches', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const writer = read('src/agents/writer.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  assert.ok(skill.indexOf('Spawn `omd-writer`') < skill.indexOf('omd-sketch'));
  assert.match(skill, /omd copy --check[\s\S]*fresh `omd-eye` in copy-editor mode[\s\S]*writer[\s\S]*omd copy --check/);
  assert.match(skill, /coordinator does not author copy/i);
  assert.match(writer, /only `.omd\/copy-deck\.md`/);
  assert.match(writer, /Never edit UI, code, components, styles, layout/);
  assert.match(eye, /copy-editor mode[\s\S]*Do not receive or inspect renders, code, layout, build\s+rationale/);
});

test('copy fact policy uses explicit IDs and never semantic AI detection', () => {
  const protocol = read('core/protocol/copy-deck.md');
  const writer = read('src/agents/writer.agent.yaml');
  for (const source of [protocol, writer]) {
    const contract = source.replace(/\s+/g, ' ');
    assert.match(contract, /verified\|fixture\|open|`verified`.*`fixture`.*`open`/);
    assert.match(contract, /fixture.*never ship/i);
    assert.match(contract, /open.*(?:cannot|never) support|open facts never support/i);
  }
  assert.match(protocol, /never judges AI-ness[\s\S]*sentence variance[\s\S]*perplexity/i);
  for (const field of ['Audience', 'Language', 'Register', 'Main message', 'Supporting fact', 'Next action', 'Claim refs']) {
    assert.match(protocol, new RegExp(field));
  }
  assert.match(protocol, /every page or surface[\s\S]*H3 block[\s\S]*exactly one/i);
});

test('UX acceptance and probe applicability do not fabricate recovery states', () => {
  const protocol = read('core/protocol/human-design-loop.md');
  const hand = read('src/agents/hand.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  for (const source of [protocol, skill, hand, eye]) {
    const contract = source.replace(/\s+/g, ' ');
    for (const phrase of ['primary task', 'frequent action', 'costliest', 'reachable state', 'visible feedback', 'mobile reach']) {
      assert.match(contract, new RegExp(phrase, 'i'));
    }
  }
  for (const source of [protocol, skill, hand]) {
    assert.match(source, /stateful[\s\S]*primary\.json[\s\S]*recovery\.json[\s\S]*navigation-only[\s\S]*primary probe[\s\S]*static[\s\S]*N\/A/i);
  }
  const handContract = hand.replace(/\s+/g, ' ');
  for (const phrase of ['native semantics', 'Preserve entered form values on error', 'block duplicate submission', 'reduced motion']) {
    assert.match(handContract, new RegExp(phrase, 'i'));
  }
  assert.match(eye, /no\s+interaction claim without matching probe evidence/i);
  assert.match(protocol, /Never add fake error, empty, or\s+recovery UI/);
  assert.doesNotMatch(protocol, /navigation-only requires[^.]*recovery\.json/i);
  assert.doesNotMatch(protocol, /static requires[^.]*probe/i);
});

test('Claude plugin reference rewriting knows omd-writer', () => {
  const claude = read('adapters/claude.ts');
  assert.match(claude, /AGENT_REF[^\n]*writer/);
});
