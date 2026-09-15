import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const role = (name: 'writer' | 'eye'): string => {
  const value = parse(read(`src/agents/${name}.agent.yaml`)) as { instructions: string };
  return value.instructions;
};

// These prove prompt routing and scope, not persuasion, human preference or conversion.
test('marketing copy research reaches its writer, humanizer and independent copy reviewer', () => {
  for (const content of [role('writer'), role('eye'), read('src/skills/omd-humanize/SKILL.md')]) {
    assert.match(content, /marketing, adoption, landing and homepage/i);
    assert.match(content, /theory\/web-copy\.md/);
  }
  assert.match(role('writer'), /same\s+facts; record their count and reason before drafting/);
  assert.match(read('core/protocol/copy-deck.md'), /Marketing message map/);
  assert.match(read('core/theory/voice.md'), /theory\/web-copy\.md/);
});

test('formula selection keeps evidence limits and excludes operating-product templates', () => {
  const pack = read('core/theory/web-copy.md');
  for (const method of ['AIDA', 'PAS', '4P', 'FAB', 'BAB', '4C', '4U']) {
    assert.ok(pack.includes(method), method);
  }
  assert.match(pack, /not the grammar for operating a product/);
  assert.match(pack, /Do not\s+concatenate all of them/);
  assert.match(pack, /Never manufacture anxiety/);
  assert.match(pack, /fake scarcity/);
  assert.match(pack, /not a promised\s+conversion effect/);
  assert.match(pack, /imagined after-state as an achieved result/);
  assert.match(pack, /clear factual category, specific technical mechanism, necessary/);
});

test('copy review tests the offer before writer rationale without claiming a human experiment', () => {
  const eye = role('eye');
  assert.match(eye, /First read the proposed surface strings[\s\S]*before the writer's audit or formula rationale/);
  assert.match(eye, /what is offered, for whom/);
  assert.match(eye, /model-based\s+comprehension proxy, not a timed human study or conversion result/);
  assert.match(eye, /offer that\s+is legible only in metadata/);
  assert.match(eye, /Do not reject\s+a precise category/);
});

test('copy rejection reopens owner work and source-aware brief inventory is not forwarded blindly', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const handoff = read('core/protocol/human-design-loop.md');
  assert.match(skill, /§Evidence handoff/);
  assert.match(handoff, /user rejection of copy reopens the writer's message choice/i);
  assert.match(handoff, /Reuse unaffected acquisition evidence/);
  assert.match(handoff, /Never append it\s+unchanged to an isolated owner's task/);
  assert.match(handoff, /complete required evaluator lineage/);
  assert.match(read('src/agents/hand.agent.yaml'), /Do not reopen\s+the source-aware raw brief/);
  assert.doesNotMatch(skill, /pass `omd brief <stage>` unchanged to its owner/);
});

test('web-copy evidence names primary guidance and limits historical result transfer', () => {
  const pack = read('core/theory/web-copy.md');
  for (const url of [
    'https://copyhackers.com/2015/10/copywriting-formula/',
    'https://cxl.com/blog/saas-homepage-optimization/',
    'https://toss.tech/article/21022',
    'https://toss.tech/article/Marketing_Writing',
    'https://www.w3.org/WAI/tips/writing/',
  ]) assert.ok(pack.includes(url), url);
  const voice = read('core/theory/voice.md');
  assert.doesNotMatch(voice, /largest usability gains in the\s+literature/);
  assert.doesNotMatch(voice, /confirmed the proportion had not moved/);
  assert.match(voice, /historical study-specific results/);
});
