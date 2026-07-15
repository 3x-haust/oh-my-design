import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Locks the bounded RED/GREEN refinement loop into the durable contract and the skill: it must be
// evidence-driven, bounded (never an unbounded automatic retry), and driven by `omd eval-loop`.

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

test('ultradesign SKILL wires the RED/GREEN refinement rounds with evidence and stop conditions', () => {
  const s = read('skills/ultradesign/SKILL.md');
  assert.match(s, /RED\/GREEN/);
  assert.match(s, /CONTINUE only while/);
  assert.match(s, /a round with no evidence does not count/i);
  assert.match(s, /round budget/i);
  assert.match(s, /On GREEN/i);
});

test('the human-design-loop protocol carries the bounded RED/GREEN loop and forbids unbounded retry', () => {
  const p = read('core/protocol/human-design-loop.md');
  assert.match(p, /RED\/GREEN refinement loop/);
  assert.match(p, /advances only on measured improvement/);
  assert.match(p, /a round with no evidence does not count/i);
  assert.match(p, /never an unbounded automatic retry/i);
});

test('the protocol keeps the loop subordinate to the existing gates', () => {
  const p = read('core/protocol/human-design-loop.md');
  assert.match(p, /never overrides the gates above/i);
});
