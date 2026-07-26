import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const digest = 'a'.repeat(64);
const perspective = (position: string) => ({ inputSha256: digest, position, evidence: ['bounded:evidence'], objections: [], conditions: ['Keep the primary action reachable.'] });
const receipt = {
  schema: 'design-deliberation-v1', id: 'art-direction', decisionId: 'art-direction', trigger: 'Select the local art direction.', moderator: 'omd-eye',
  perspectives: { ux: perspective('confident'), artDirection: perspective('confident'), production: perspective('confident') },
  resolution: { selected: 'confident', rationale: 'The evidence-bearing stage rail preserves task clarity and feasible production.', conditions: ['Keep the primary action reachable.'] },
};
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-deliberation-preserve-'));
const run = (root: string, input: string) => spawnSync(process.execPath, ['--experimental-strip-types', CLI, 'deliberate', 'preserve', '--input', input, '--json'], { cwd: root, encoding: 'utf8' });

test('preserve validates the read-only moderator handback and writes its exact JSON bytes', () => {
  const root = project(); const input = join(root, 'moderator.json');
  const body = JSON.stringify(receipt, null, 2);
  writeFileSync(input, body);
  const first = run(root, input);
  assert.equal(first.status, 0, first.stderr);
  const output = join(root, '.omd', 'deliberations', 'art-direction.json');
  assert.equal(existsSync(output), true);
  assert.equal(readFileSync(output, 'utf8'), `${body}\n`);
  assert.equal(run(root, input).status, 0, 'replaying identical bytes is idempotent');
});

test('preserve rejects Markdown fences and conflicting reuse of a moderator id', () => {
  const root = project(); const input = join(root, 'moderator.json');
  writeFileSync(input, JSON.stringify(receipt));
  assert.equal(run(root, input).status, 0);
  writeFileSync(input, JSON.stringify({ ...receipt, resolution: { ...receipt.resolution, rationale: 'A different rationale.' } }));
  const conflict = run(root, input);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /DELIBERATION_IMMUTABLE_CONFLICT/);
  const fenced = join(root, 'fenced.json');
  writeFileSync(fenced, `\`\`\`json\n${JSON.stringify({ ...receipt, id: 'other' })}\n\`\`\``);
  const invalid = run(root, fenced);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /DELIBERATION_MODERATOR_JSON_INVALID/);
});
