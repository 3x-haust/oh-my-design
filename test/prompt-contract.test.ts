import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertRoleDelivery, promptRoot } from './helpers/prompt-delivery.ts';
import { readBuildAgents } from '../adapters/build-identity.ts';
import { CURRENT_COMPOSITION_SECTIONS, SYNTHESIS_SECTION } from '../core/composition-contract/index.ts';
import { adaptiveStageGraph, adaptiveStageOwners } from '../core/route/adaptive-stage-graph.ts';
import { loadRoleProfile } from '../core/brief/profiles.ts';
import { emitClaudePlugin } from '../adapters/claude.ts';
import { INPUT_SKELETONS } from '../core/schema/inputs.ts';

// Static prose is not an executable gate. Owner, authority, capture/currentness and workflow
// refusals are exercised by their domain suites; this file tests the actual prompt transport ABI.
for (const agent of readBuildAgents(promptRoot)) test(`source prompt is delivered unchanged with inherited model: ${agent.name}`, () => {
  assertRoleDelivery(agent.name.slice(4));
});

test('current concept team precedes selected type/composition while legacy graph remains inspectable', () => {
  const current = adaptiveStageGraph(true), legacy = adaptiveStageGraph(false);
  assert.deepEqual(current['candidate-generation'].prerequisites, ['frame']);
  assert.ok(legacy['candidate-generation'].prerequisites.includes('composition'));
  assert.equal(adaptiveStageOwners(true)['candidate-generation'], 'omd-art-director');
  assert.equal(adaptiveStageOwners(false)['candidate-generation'], 'omd-sketch');
  assert.ok(current.composition.afterIfSelected.includes('candidate-generation'));
});

test('selected copy work remains an isolated writer boundary', () => {
  const owners = adaptiveStageOwners(true);
  assert.equal(owners.copy, 'omd-writer');
  assert.equal(owners.production, 'omd-hand');
  assert.equal(owners['independent-review'], 'omd-eye');
  assert.notEqual(owners.copy, owners.production);
  assert.notEqual(owners.copy, owners['independent-review']);
});

test('composition machine-consumed headings are unique in the delivered contract', () => {
  const protocol = readFileSync(join(promptRoot, 'core/protocol/composition-contract.md'), 'utf8');
  for (const section of [...CURRENT_COMPOSITION_SECTIONS, SYNTHESIS_SECTION, 'Needed components', 'Expansion mapping', 'Measurement contract']) {
    assert.equal(protocol.split('\n').filter(line => line === `## ${section}`).length, 1, section);
  }
});

test('plugin references include Art Director and Study but preserve executable owner identifiers', () => {
  const agent = { name: 'omd-art-director', description: 'omd-study', reasoning: 'high', instructions: 'omd-art-director\nomd-study\nowner: omd-art-director\n--agent omd-study\n' };
  const output = emitClaudePlugin({ agents: [agent] }).files['agents/art-director.md'] as string;
  assert.ok(output.includes('oh-my-design:study'));
  assert.ok(output.includes('owner: omd-art-director'));
  assert.ok(output.includes('--agent omd-study'));
});

test('closed mode delivery refuses unknown Eye/Sketch modes', () => {
  assert.throws(() => loadRoleProfile('omd-eye', 'automatic-winner'));
  assert.throws(() => loadRoleProfile('omd-sketch', 'showpiece'));
  assert.equal(loadRoleProfile('omd-eye', 'copy-editor').mode, 'copy-editor');
  assert.equal(loadRoleProfile('omd-sketch', 'visual-study').mode, 'visual-study');
});

test('legacy evaluator skeleton preserves the explicit pending motion slot ABI', () => {
  const skeleton = INPUT_SKELETONS.find(input => input.name === 'art-direction-check')!;
  assert.equal(skeleton.command, 'omd art-direction check --input .omd/.cache/art-direction-check.json --json');
  const result = (skeleton.skeleton as { evaluatorResult: { motionResolution: { slots: unknown[] } } }).evaluatorResult;
  assert.equal(result.motionResolution.slots.length, 1);
});

test('held-out layout evaluation input bytes retain their frozen identities', () => {
  const paths = ['01_magnetic-bearing', '02_oral-history', '03_hospital-maintenance'];
  assert.deepEqual(paths.map(name => createHash('sha256').update(readFileSync(join(promptRoot, `evals/layout-composition/prompts/${name}.md`))).digest('hex')), [
    'd8c91a5c8115cb4fe22be631918c6ae4503a84a75dddadb7e93c75fa819adb75',
    'a6feb3c5c8d5b3f29c6f40cae743c106154107ee02223bed819d9e349ba2851b',
    '9c2db1b49cf0d221320eebab53d4808f8c1f72f3e4e621847da0fed745b41cd4',
  ]);
});
