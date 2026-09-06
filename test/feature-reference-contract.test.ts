import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

test('adaptive coordinator supplies bounded measured reference briefs instead of a duplicated transfer catalogue', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  assert.match(skill, /At each selected stage boundary run `omd brief <stage>`/i);
  assert.match(skill, /applicable references with measured principles/i);
  assert.match(skill, /protocol excerpts come from `omd pack <file> --section <heading>`/i);
  assert.match(skill, /Roles do not inspect `core\/\*\*`\s+to\s+guess an input shape/i);
  assert.doesNotMatch(skill, /Branch A — explicit functions/);
  assert.doesNotMatch(skill, /### Feature:/);
});

test('route changes stages and reference evidence without removing independent review', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  assert.match(skill, /user-selected model owns strategy: role order, stage order, and optional methods/i);
  assert.match(skill, /When reference discovery is selected[\s\S]*there\s+is no reference quota/i);
  assert.match(skill, /When it is skipped, use the recorded existing evidence/i);
  assert.match(skill, /Independent review and final evidence are required on both a one-line[\s\S]*safety-critical new product/i);
  assert.doesNotMatch(skill, /3–5 component captures/);
});

test('selected reference owners receive measured records while production and review stay isolated', () => {
  const scout = read('src/agents/scout.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');

  assert.match(scout, /If discovery is selected, gather only for the named[\s\S]*unresolved decisions/i);
  assert.match(scout, /no reference[\s\S]*quota and no default candidate count/i);
  assert.match(scout, /intended and actual evidence use/i);
  assert.match(hand, /`omd brief production`[\s\S]*principle each one was kept for/i);
  assert.match(hand, /Do not inspect source URLs or unselected\/raw source material/i);
  assert.match(eye, /You did not build this work/i);
  assert.match(eye, /must not open reference artifacts[\s\S]*source URLs[\s\S]*screenshots/i);
  assert.match(eye, /Never open `\.omd\/frame\.md`[\s\S]*\.omd\/refs\//);
});

test('selected refinement is grounded in observed evidence and a fresh reviewer', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  assert.match(skill, /independent reviewer receives opaque renders[\s\S]*deterministic findings/i);
  assert.match(skill, /Only the production owner repairs production/i);
  assert.match(skill, /RED records an observed mismatch; GREEN records the new\s+observation and check that closed it/i);
  assert.match(skill, /Do not manufacture rounds after required outcomes and review are clean/i);
});
