import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// These tests lock the Phase-0..3 advisory modules into the `omd` CLI surface: text-slop,
// visual-richness, asset, interaction, and eval. Every one is advisory and MUST exit 0 on a
// real evaluation (usage errors are the only non-zero path). None of them may gate the loop.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const run = (args: string[], cwd?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-cli-wiring-'));

function writeFile(dir: string, rel: string, content: string): string {
  const path = join(dir, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  return path;
}

// ── text-slop ──────────────────────────────────────────────────────────────

test('text-slop flags AI-cliche phrases and stays advisory (exit 0)', () => {
  const dir = project();
  const file = writeFile(dir, 'copy.md', 'We unlock the power of a fast-paced world to revolutionize your day.');
  const result = run(['text-slop', file, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { candidates: Array<{ candidateId: string; gating: boolean }> };
  assert.ok(parsed.candidates.length >= 2, result.stdout);
  assert.ok(parsed.candidates.every((c) => c.gating === false), 'every text-slop candidate is non-gating');
  assert.ok(parsed.candidates.some((c) => c.candidateId === 'unlock-the-power'));
});

test('text-slop on clean copy reports zero candidates and still exits 0', () => {
  const dir = project();
  const file = writeFile(dir, 'copy.md', 'The dashboard shows deploy status for each service in one view.');
  const result = run(['text-slop', file]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /candidates: 0/);
  assert.match(result.stdout, /advisory only/);
});

test('text-slop does not match phrases inside fenced code', () => {
  const dir = project();
  const file = writeFile(dir, 'copy.md', '```\nunlock the power\n```\nPlain copy without cliches.');
  const result = run(['text-slop', file, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { candidates: unknown[] };
  assert.equal(parsed.candidates.length, 0, result.stdout);
});

// ── visual-richness ─────────────────────────────────────────────────────────

const COMPOSITION = [
  '## Focal hierarchy',
  '',
  'One dominant anchor with a value/proof/CTA relationship.',
  '',
  '## Media roles',
  '',
  'No carrier named here yet.',
].join('\n');

test('visual-richness surfaces carrier advisories for a confident register (exit 0)', () => {
  const dir = project();
  const file = writeFile(dir, 'composition.md', COMPOSITION);
  const result = run(['visual-richness', file, '--register', 'confident', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { findings: Array<{ id: string; severity: string }> };
  assert.ok(parsed.findings.length >= 1, result.stdout);
  assert.ok(parsed.findings.every((f) => f.id === 'CARRIER-ADVISORY' && f.severity === 'advisory'));
});

test('visual-richness quiet register yields no findings (register-aware, never gates)', () => {
  const dir = project();
  const file = writeFile(dir, 'composition.md', COMPOSITION);
  const result = run(['visual-richness', file, '--register', 'quiet', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as { findings: unknown[] };
  assert.equal(parsed.findings.length, 0, result.stdout);
});