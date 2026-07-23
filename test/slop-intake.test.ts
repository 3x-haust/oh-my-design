import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const intake = join(root, 'core', 'rules', 'slop-intake.md');
const slopYaml = join(root, 'core', 'rules', 'builtin', 'slop.yaml');

test('the slop intake routine document exists', () => {
  assert.ok(existsSync(intake), `slop-intake.md not found at ${intake}`);
});

test('the intake routine names a cadence, sources, an evidence bar, retirement, and a candidate template', () => {
  const md = readFileSync(intake, 'utf8');
  for (const heading of ['## Cadence', '## Sources to scan', '## The evidence bar', '## Retirement', '## Flow', '## Candidate template']) {
    assert.ok(md.includes(heading), `slop-intake.md missing "${heading}"`);
  }
  const flat = md.replace(/\s+/g, ' ');
  // Aesthetics drift both ways: new rules added AND stale ones retired, each only with a documented case.
  assert.match(flat, /drift[\s\S]*6.12 month cycle/i);
  assert.match(flat, /No case, no rule/i);
  assert.match(flat, /false-positive analysis/i);
  assert.match(flat, /retired with the same rigor|retired only with a documented case/i);
  // Positive AND negative tests are required by repo convention.
  assert.match(flat, /positive \*\*and\*\* negative|negative prompt-contract\/rules tests/i);
});

test('slop.yaml points at the intake routine so the taxonomy stays current', () => {
  const yaml = readFileSync(slopYaml, 'utf8');
  assert.match(yaml, /`core\/rules\/slop-intake\.md`/);
  assert.match(yaml, /drift on a 6.12 month cycle/i);
});
