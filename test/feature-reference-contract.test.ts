import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

test('adaptive coordinator checks stage entry separately from bounded role projection', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const roleBrief = read('core/brief/role.ts');

  assert.match(skill, /`omd stage next --json`/);
  assert.match(skill, /`omd brief <stage> --check --json` separately/);
  assert.match(skill, /`omd brief <stage> --role <role> \[--mode <mode>\] --json`/);
  assert.match(skill, /exclusive owner publish, check outputs and recompute/i);
  assert.match(roleBrief, /schema: 'role-brief-v1'/);
  assert.match(roleBrief, /delivery: 'owner-task-not-review-authority'/);
  assert.match(roleBrief, /contracts: brief\.contracts, schemas: brief\.schemas, checks: brief\.judgedBy/);
  assert.doesNotMatch(skill, /Branch A — explicit functions/);
  assert.doesNotMatch(skill, /### Feature:/);
});

test('route selection preserves the user model and independent terminal review', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  assert.match(skill, /Preserve the original request and user-selected model/i);
  assert.match(skill, /applicable route-input, product-route-input or design-route-input schema/i);
  assert.match(skill, /exact native review\/finalization follows the current host contract/i);
  assert.doesNotMatch(skill, /3–5 component captures/);
});

test('selected reference owners receive native handoffs while production and review stay isolated', () => {
  const scout = read('src/agents/scout.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');

  assert.match(scout, /omd ref discover-plan --json/);
  assert.match(scout, /omd ref browse start --lane domain\|design --mode headless --json/);
  assert.match(scout, /omd ref browse analysis-set --input <analysis\.json> --json/);
  assert.match(scout, /ref browse handoff --for concept\|composer\|hand/);
  assert.match(scout, /Eye\/Glance\/blind handoffs exclude\s+reference images, identity and maker rationale/i);
  assert.match(hand, /`omd brief production --role omd-hand --mode source --json`/);
  assert.match(hand, /separate checked entry outcome/i);
  assert.match(hand, /authorized whole-screen references with Scout analysis and\s+per-surface application/i);
  assert.match(eye, /You did not build this work/i);
  assert.match(eye, /Blind modes receive anonymous pixels\/current native facts and task constraints, never source/i);
  assert.match(eye, /one-use read_reviewer_evidence transport/);
});

test('selected refinement remains observation-led and independently finalized', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const hand = read('src/agents/hand.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');
  const protocol = read('core/protocol/human-design-loop.md');

  assert.match(skill, /full surface\/state\/view expansion -> actual audit\/stress\/repair/i);
  assert.match(skill, /Hand alone writes production/i);
  assert.match(skill, /exact native review\/finalization follows the current host contract/i);
  assert.match(hand, /source -> observer capture -> pixel inspection -> craft decision/i);
  assert.match(eye, /You did not build this work/i);
  assert.match(protocol, /Any unmet applicable criterion is RED/i);
  assert.match(protocol, /no route manufactures a pairwise round for an initial clean review/i);
});
