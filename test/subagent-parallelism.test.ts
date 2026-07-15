import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Locks the subagent-utilisation improvements into the orchestration doctrine: independent lanes
// run in parallel and return sanitized summaries, build and judgment are separate agents, and the
// image-first drafts are generated concurrently.

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

test('scout and writer run in parallel where independent, with the scout returning a sanitized summary', () => {
  const skill = read('skills/ultradesign/SKILL.md');
  assert.match(skill, /voice\/audience evidence is the writer's only dependency/i);
  assert.match(skill, /spawn\s+`(?:omd-|oh-my-design:)writer`\s+concurrently/i);
  assert.match(skill, /sanitized summary[\s\S]*never raw transcripts or screenshots/i);
});

test('the RED/GREEN loop judges with a fresh eye, never the hand that built it', () => {
  const skill = read('skills/ultradesign/SKILL.md');
  assert.match(skill, /fresh\s+`(?:omd-|oh-my-design:)eye`\s+—\s+never the hand that built it/i);
  assert.match(skill, /[Bb]uild and judgment stay separate/);
});

test('image-first concept drafts are generated concurrently', () => {
  const imagegen = read('core/theory/imagegen.md');
  assert.match(imagegen, /concurrently \(they are independent — do not\s+serialize them\)/i);
  const composer = read('agents/composer.md');
  assert.match(composer, /generated concurrently \(they are independent\)/i);
});
