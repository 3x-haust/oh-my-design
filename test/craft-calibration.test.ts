import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const craft = readFileSync(join(root, 'core', 'theory', 'craft.md'), 'utf8');
const flat = craft.replace(/\s+/g, ' ');

test('craft.md carries a Human calibration section that names the LLM-self-eval asymmetry', () => {
  assert.ok(craft.includes('## Human calibration'), 'craft.md missing the Human calibration section');
  // The verdict is currently an LLM judging a model — the gap voice.md already closed on the prose side.
  assert.match(flat, /`omd-eye`[\s\S]*still a language model judging a model's output/i);
  assert.match(flat, /`theory\/voice\.md`[\s\S]*Calibration evidence/i);
  assert.match(flat, /Visual craft has no equivalent yet/i);
});

test('the calibration protocol samples, rates blind, compares to the eye, and feeds divergences back', () => {
  assert.match(flat, /1\. \*\*Sample\*\*[\s\S]*versioned set of OMD renders/i);
  assert.match(flat, /2\. \*\*Rate\*\*[\s\S]*real human designers[\s\S]*blind[\s\S]*A\/B or forced-choice/i);
  assert.match(flat, /3\. \*\*Compare\*\*[\s\S]*divergences[\s\S]*where the model eye and real designers disagree[\s\S]*are the evidence/i);
  assert.match(flat, /4\. \*\*Feed back\*\*[\s\S]*slop-intake\.md` evidence bar/i);
});

test('calibration data reuses .omd/taste/preferences.jsonl and stays honest about having no dataset yet', () => {
  assert.match(flat, /`\.omd\/taste\/preferences\.jsonl`/);
  assert.match(flat, /Coach never reads `\.omd\/taste\/`/i);
  // The section must not overclaim: it is a methodology, and the eye is explicitly a proxy until data exists.
  assert.match(flat, /no calibration dataset has been collected yet/i);
  assert.match(flat, /`omd-eye`'s verdict is explicitly a proxy for human taste, not ground truth/i);
});
