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

test('source candidates are scanned, blindly triaged, repaired, and rescanned without becoming lint', () => {
  const protocol = read('core/protocol/slop-review.md');
  const loop = read('core/protocol/human-design-loop.md');
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const eye = read('src/agents/eye.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');
  const writer = read('src/agents/writer.agent.yaml');

  assert.ok(skill.indexOf('Production source now exists') < skill.indexOf('Now render sharp'));
  assert.ok(skill.indexOf('Now render sharp') < skill.lastIndexOf('`omd slop scan`'));
  assert.match(protocol, /confirmed[\s\S]*dismissed[\s\S]*needs-render/);
  assert.match(protocol, /`needs-render` is transitional[\s\S]*both `untriaged = 0` and `needs-render = 0`[\s\S]*not `candidates = 0`/);
  assert.match(loop, /Candidate presence is not a\s+failed gate/);
  assert.match(skill, /Final untriaged and needs-render counts are both zero/);
  assert.match(protocol, /never added together or\s+double-counted/i);
  assert.match(protocol, /rendered IR is authoritative/i);
  assert.match(eye, /candidate id, controlled signals, and review question[\s\S]*Never receive candidate path,[\s\S]*source line\/excerpt,[\s\S]*authorship/i);
  assert.match(hand, /repair only confirmed visual\/source candidates[\s\S]*rerender[\s\S]*`omd check`[\s\S]*rescan/i);
  assert.match(writer, /sole deck owner[\s\S]*repair the deck first[\s\S]*production\s+source to omd-hand/i);
  assert.match(protocol, /only `omd-writer` may modify `.omd\/copy-deck\.md`/);
});

test('source-review provenance is conceptual and does not recreate an upstream catalogue', () => {
  const protocol = read('core/protocol/slop-review.md');
  const rules = read('core/rules/builtin/slop.yaml');
  assert.match(protocol, /yetone\/kill-ai-slop/);
  assert.match(protocol, /accessed\s+2026-07-13/);
  assert.match(protocol, /no explicit licence[\s\S]*no upstream code, wording, example copy,\s+assets, catalogue, identifiers, or catalogue ordering/i);
  assert.doesNotMatch(protocol, /32[- ]tell|#(?:[1-9]|[12]\d|3[0-2])\b/i);
  assert.doesNotMatch(rules, /32-tell catalogue|Bucket \([abc]\)/i);
});

test('humanize uses discourse repair modes and preserves evidence without rhythm choreography', () => {
  const humanize = read('src/skills/omd-humanize/SKILL.md');
  const voice = read('core/theory/voice.md');
  const copy = read('core/protocol/copy-deck.md');
  assert.match(humanize, /Mode A — local repair[\s\S]*Mode B — reconstruct from facts/);
  assert.match(humanize, /Speaker[\s\S]*Listener[\s\S]*Situation[\s\S]*Intended change \/ next move[\s\S]*Genre and register[\s\S]*Facts and quotes/);
  assert.match(humanize, /Only `verified` facts may support shipped claims[\s\S]*`open` and\s+`fixture` facts cannot ship/);
  assert.match(humanize, /quote cannot stay\s+verbatim, remove it; never paraphrase it as a quote/i);
  assert.match(humanize, /Only\s+`omd-writer` changes `.omd\/copy-deck\.md`/);
  assert.match(copy, /Input contract[\s\S]*Mode[\s\S]*Fidelity[\s\S]*Root cause[\s\S]*Next action[\s\S]*Owner handoff/);
  assert.match(voice, /Static copy and live dialogue have different situations/);
  assert.match(voice, /no individual signal establishes authorship/i);
  assert.match(voice, /Product copy has no universal speech-level/i);
  assert.match(voice, /Use breath as contextual evidence, not a universal sentence rule/);
  assert.match(voice, /documentation, comparisons, and feature[\s\S]*may explain mechanism/i);
  assert.doesNotMatch(humanize, /30%|50%|only rewrite what a rule tagged|after two long sentences|four-word one/i);
  assert.doesNotMatch(voice, /vary deliberately|After two long sentences|dramatically short sentence/i);
  assert.doesNotMatch(voice, /any one of these signals[\s\S]*model wrote|Product\s+copy[^.]*해요체[^.]*without exception|No human founder|mark the\s+text as generated|Two Korean AI tells are real/i);
  assert.doesNotMatch(voice, /will not need connectives|never explains the product's own mechanism/i);
});
