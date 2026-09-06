import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const instructions = (
  role: 'framer' | 'scout' | 'writer' | 'typesetter' | 'composer' | 'hand' | 'eye',
): string => {
  const agent = parse(read(`src/agents/${role}.agent.yaml`)) as { instructions?: unknown };
  assert.equal(typeof agent.instructions, 'string', `${role} instructions are missing`);
  return agent.instructions as string;
};
const compact = (value: string): string => value.replace(/\s+/g, ' ');

test('locale labels never become market or national-style authority', () => {
  assert.match(compact(instructions('framer')), /surface locale or likely script never supplies a market, audience, register, or national style/i);
  assert.match(compact(instructions('scout')), /locale label, likely script, or country stereotype is never evidence/i);
  assert.match(compact(instructions('typesetter')), /likely script is mechanics-only/i);
  assert.match(compact(instructions('hand')), /Never derive styling directly from a locale or country label/i);
});

test('cultural research has cross-lane evidence and a source-free consumer boundary', () => {
  const scout = compact(instructions('scout'));
  assert.match(scout, /standards, a global equivalent or a recorded unavailability, native first-party category evidence, and a counterexample/i);
  assert.match(scout, /Conflicting evidence becomes `contested`; missing evidence becomes `unknown`/i);
  assert.match(scout, /omd locale source-capture/i);
  assert.match(scout, /generic home, news, or institutional page is not equivalent/i);
  assert.match(scout, /same user task, not just the same industry noun/i);
  assert.match(scout, /citation string.*never evidence/i);
  assert.match(scout, /omd locale profile --publish/);

  for (const role of ['composer', 'hand'] as const) {
    const prompt = compact(instructions(role));
    assert.match(prompt, /cultural-design-projection\.json|cultural design projection/i, role);
    assert.match(prompt, /never (?:the cultural profile|its profile) or sources|never the cultural profile, source identities/i, role);
  }
  assert.match(compact(instructions('composer')), /Transfer only `supported` and `shared` mechanisms/i);
  assert.match(compact(instructions('hand')), /add no styling for `unknown`/i);
});

test('market-grounded reference pieces are explicitly joined to current local evidence', () => {
  const protocol = read('core/protocol/reference-assembly.md');
  const locale = read('core/protocol/locale-contract.md');
  const scout = read('src/agents/scout.agent.yaml');
  const composer = read('src/agents/composer.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');
  for (const source of [protocol, locale, scout]) {
    assert.match(source, /reference-locale-binding|locale-bind/i);
    assert.match(source, /native-category/i);
  }
  assert.match(scout, /Every\s+candidate needs a positive `native-category` component/i);
  assert.match(composer, /source-free\s+slot-to-decision map/i);
  assert.match(hand, /only to its bound slot/i);
  assert.match(composer, /never read\s+`\.omd\/reference-locale-binding-evidence\.json`/i);
  assert.match(hand, /never (?:the\s+)?binding's private evidence/i);
});

test('copy and type target explicit locale context rather than conversation language', () => {
  assert.match(compact(instructions('writer')), /surface locale, explicit market, and audience, not the conversation language/i);
  assert.match(compact(instructions('writer')), /instead of translating sentences one by one/i);
  assert.match(compact(instructions('writer')), /Keep `zh-CN` and `zh-TW`/i);
  assert.match(compact(instructions('typesetter')), /real locale copy, mixed scripts, numerals, punctuation/i);
});

test('blind review cannot promote agent judgment into a native cultural-fit claim', () => {
  const eye = compact(instructions('eye'));
  assert.match(eye, /Assess each locale as a standalone surface before comparing variants/i);
  assert.match(eye, /Sameness and difference each need a contract reason/i);
  assert.match(eye, /never claim native cultural correctness without blind target-audience human ratings/i);
});

test('locale protocol separates operational modes from cultural design authority', () => {
  const protocol = compact(read('core/protocol/locale-contract.md'));
  assert.match(protocol, /copy\/operational modes do not authorize cultural art direction/i);
  assert.match(protocol, /A language is not a country/i);
  assert.match(protocol, /`ask`.*`mechanics-only`.*`research`/i);
  assert.match(protocol, /four evidence lanes/i);
  assert.match(protocol, /A URL and digest typed into a profile are not evidence/i);
  assert.match(protocol, /Evidence-lane names are semantic obligations, not URL labels/i);
  assert.match(protocol, /Current bytes prove capture and currentness; they do not by themselves prove task equivalence/i);
  assert.match(protocol, /hashes the current `.omd\/type-proof\.md` bytes/i);
  assert.match(protocol, /Only blind ratings from the named target audience may support a cultural-fit claim/i);
});

test('English and Korean user docs expose the same locale authority and calibration boundary', () => {
  const english = compact(read('README.md'));
  const korean = compact(read('README.ko.md'));
  for (const doc of [english, korean]) {
    assert.match(doc, /locale source-capture/);
    assert.match(doc, /locale profile-check/);
    assert.match(doc, /zh-CN/);
    assert.match(doc, /zh-TW/);
  }
  assert.match(english, /does not map a language code to a country theme/i);
  assert.match(korean, /언어 코드를 국가 테마에 연결하지도 않습니다/);
  assert.match(english, /genuine blind ratings from the named target audience/i);
  assert.match(korean, /독립적인 블라인드 평가/);
});
