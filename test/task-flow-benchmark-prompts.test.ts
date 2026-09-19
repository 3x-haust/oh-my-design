import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (name: string) =>
  readFileSync(new URL(`../src/agents/${name}.agent.yaml`, import.meta.url), 'utf8');

test('selected roles carry the task-flow benchmark ABI', () => {
  for (const role of ['scout', 'composer', 'sketch', 'hand', 'eye']) {
    assert.match(read(role), /TASK_FLOW_BENCHMARK_ABI_V2/, role);
  }
});

test('benchmark roles separate observed sources from destination authority', () => {
  const scout = read('scout');
  assert.match(scout, /omd schema task-flow-benchmark[\s\S]*omd benchmark set/);
  assert.match(scout, /same destination domain[\s\S]*adjacent-domain sources/);
  assert.match(scout, /omd benchmark set/);
  assert.match(scout, /sanitized\s+projection/);

  const hand = read('hand');
  assert.match(hand, /generic wizard, dashboard shell, or label-swapped form/);
  assert.match(hand, /never authority to copy source brands/);
  assert.match(hand, /data-omd-task-id/);
  assert.match(hand, /data-omd-consequence-for/);

  const framer = read('framer');
  assert.match(framer, /omd schema\s+entry-surface-contract/);
  assert.match(framer, /Do not put CSS selectors, verdicts, source identities/);

  const eye = read('eye');
  assert.match(eye, /omd lifecycle plan/);
});

test('composer and eye bind structural alternatives to final comparison', () => {
  const composer = read('composer');
  assert.match(composer, /2–3 structurally distinct UX models/);
  assert.match(composer, /unrelated-domain noun swap/);

  const eye = read('eye');
  assert.match(eye, /interactionBenchmarkFit/);
  assert.match(eye, /domainSpecificity/);
  assert.match(eye, /marketing\/showpiece policy/);
});
