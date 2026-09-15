import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
const instructions = (role: 'composer' | 'hand' | 'eye' | 'writer'): string => {
  const agent = parse(read(`src/agents/${role}.agent.yaml`)) as { instructions?: unknown };
  if (typeof agent.instructions !== 'string') throw new Error(`${role} instructions are missing`);
  return agent.instructions;
};

test('canonical visual roles carry the machine-consumed anti-literal sentinels', () => {
  const expected = {
    composer: '[metaphor-contract:visual-consumer]',
    hand: '[metaphor-contract:visual-consumer]',
    eye: '[metaphor-contract:literal-rejection-review]',
  } as const;
  for (const role of ['composer', 'hand', 'eye'] as const) {
    const prompt = instructions(role);
    assert.ok(prompt.includes(expected[role]));
    assert.ok(prompt.includes('metaphorQualities'));
    assert.ok(prompt.includes('literalPropsToReject'));
  }

  const coordinator = read('src/skills/omd-ultradesign/SKILL.md');
  assert.ok(coordinator.includes('[metaphor-contract:typed-router]'));
  // The coordinator forwards the typed object, while each visual consumer above
  // owns the field-level contract. Do not require a second copy of those fields.
  assert.match(coordinator, /pass the immutable visual contract unchanged to visual owners/);
  assert.match(coordinator, /writer receives only its copy-safe projection/);
});

test('canonical authoring prompts route the current versioned decision contract', () => {
  const composer = instructions('composer');
  const writer = instructions('writer');
  assert.ok(composer.includes('art-direction-v2'));
  assert.ok(composer.includes('art-direction-record-v3'));
  assert.ok(writer.includes('art-direction-v2'));
  assert.ok(!composer.includes('art-direction-v1'));
  assert.ok(!writer.includes('art-direction-v1'));
});

test('writer carries only the copy-exclusion sentinel', () => {
  const prompt = instructions('writer');
  assert.ok(prompt.includes('[metaphor-contract:copy-excluded]'));
  assert.ok(prompt.includes('metaphorQualities'));
  assert.ok(prompt.includes('literalPropsToReject'));
  assert.ok(!prompt.includes('[metaphor-contract:visual-consumer]'));
});
