import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

test('adaptive coordinator supplies bounded measured reference briefs instead of a duplicated transfer catalogue', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  assert.match(skill, /At each selected boundary, read `omd brief <stage>` as coordinator intake/i);
  assert.match(skill, /§Evidence handoff/);
  const handoff = read('core/protocol/human-design-loop.md');
  assert.match(handoff, /It derives ownership,\s+measured references, delivered contracts, schemas, renderer, prior renders, judges and blockers\s+from current disk/i);
  assert.match(handoff, /Never append it\s+unchanged to an isolated owner's task/i);
  assert.match(skill, /protocol excerpts come from `omd pack <file> --section <heading>`/i);
  assert.match(skill, /Roles do not inspect `core\/\*\*`\s+to\s+guess an input shape/i);
  assert.doesNotMatch(skill, /Branch A — explicit functions/);
  assert.doesNotMatch(skill, /### Feature:/);
});

test('route changes stages and reference evidence without removing independent review', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');

  assert.match(skill, /user-selected model owns role\/stage order and optional methods/i);
  assert.match(skill, /When reference discovery is selected[\s\S]*there\s+is no reference quota/i);
  assert.match(skill, /When it is skipped, use the recorded existing evidence/i);
  assert.match(skill, /Independent review and final evidence apply at every task size/i);
  assert.doesNotMatch(skill, /3–5 component captures/);
});

test('selected reference owners receive measured records while production and review stay isolated', () => {
  const scout = read('src/agents/scout.agent.yaml');
  const hand = read('src/agents/hand.agent.yaml');
  const eye = read('src/agents/eye.agent.yaml');

  assert.match(scout, /If discovery is selected, gather only for the named[\s\S]*unresolved decisions/i);
  assert.match(scout, /no reference[\s\S]*quota and no default candidate count/i);
  assert.match(scout, /intended and actual evidence use/i);
  assert.match(hand, /coordinator reads\s+`omd brief production`/i);
  assert.match(hand, /passes `omd brief production --check --json`/);
  assert.match(hand, /supplies the\s+current entry outcome with permitted selected evidence/i);
  assert.match(hand, /Do not reopen\s+the source-aware raw brief/i);
  assert.match(hand, /Do not inspect source URLs or unselected\/raw source material/i);
  assert.match(eye, /You did not build this work/i);
  assert.match(eye, /must not open reference artifacts[\s\S]*source URLs[\s\S]*screenshots/i);
  assert.match(eye, /Never open `\.omd\/frame\.md`[\s\S]*\.omd\/refs\//);
});

test('selected refinement is grounded in observed evidence and a fresh reviewer', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const protocol = read('core/protocol/human-design-loop.md');

  assert.match(skill, /independent reviewer receives opaque renders[\s\S]*deterministic findings/i);
  assert.match(skill, /Only the production owner repairs production/i);
  assert.match(skill, /complete RED\/GREEN\s+repair-pair and rendered-refinement checkpoint contract in `protocol\/human-design-loop\.md`/i);
  assert.match(protocol, /Any unmet applicable criterion is RED/i);
  assert.match(protocol, /no route manufactures a pairwise round for an initial clean review/i);
});
