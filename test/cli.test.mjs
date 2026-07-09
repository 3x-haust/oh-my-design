import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/ir.raw.json', import.meta.url));

const REAL_FRAME_BODY = '사람들은 배고파서가 아니라 결정하기 싫어서 앱을 연다. 선택 마비 문제다.';

function project({ approved }) {
  const dir = mkdtempSync(join(tmpdir(), 'omd-cli-'));
  mkdirSync(join(dir, '.design'), { recursive: true });
  writeFileSync(
    join(dir, '.design', 'frame.md'),
    `---\napproved: ${approved}\nwhy: "리뷰 표본 n=240, 최다 불만 31%"\n---\n\n${REAL_FRAME_BODY}\n`,
  );
  cpSync(FIXTURE, join(dir, 'ir.json'));
  return dir;
}

// An agent's Bash has no TTY. Tests are machines too, so they must say so explicitly.
const asHuman = { ...process.env, OMD_ALLOW_NONINTERACTIVE_APPROVE: '1' };

const run = (args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });

test('omd check exits 1 when violations exist — usable as a CI design linter', () => {
  const r = run(['check', '--ir', FIXTURE]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /SPACING-001/);
  assert.match(r.stdout, /CONTRAST-001/);
});

test('omd check --json emits a parseable violation array on stdout', () => {
  const r = run(['check', '--ir', FIXTURE, '--json']);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.length, 5);
  assert.ok(parsed.every((v) => v.id && v.nodeId && v.path && v.severity));
});

test('omd check exits 0 on a clean IR', () => {
  const dir = project({ approved: true });
  const clean = join(dir, 'clean.json');
  writeFileSync(clean, JSON.stringify({ meta: {}, tokens: {}, nodes: [] }));
  assert.equal(run(['check', '--ir', clean]).status, 0);
});

// ── The gate contract, exercised as the host actually exercises it. ──
// Codex treats a non-zero exit that is NOT 2 as "hook failed" and CONTINUES.
// So the handler must exit exactly 2 to block, even when it crashes internally.

test('omd hook pre-tool exits 2 and explains itself when the frame is unapproved', () => {
  const r = run(['hook', 'pre-tool'], { cwd: project({ approved: false }), input: '{}' });
  assert.equal(r.status, 2, 'exit 2 is the only code that blocks the tool call');
  assert.match(r.stderr, /omd frame approve/);
});

test('omd hook pre-tool exits 0 when the frame is approved', () => {
  const r = run(['hook', 'pre-tool'], { cwd: project({ approved: true }), input: '{}' });
  assert.equal(r.status, 0);
});

test('omd hook pre-tool FAILS CLOSED — a corrupt frame blocks rather than passes', () => {
  const dir = project({ approved: true });
  writeFileSync(join(dir, '.design', 'frame.md'), '---\n: : not: yaml: [\n---\n');
  const r = run(['hook', 'pre-tool'], { cwd: dir, input: '{}' });
  assert.equal(r.status, 2);
});

test('omd hook pre-tool never exits with a code other than 0 or 2', () => {
  for (const dir of [project({ approved: true }), project({ approved: false }), mkdtempSync(join(tmpdir(), 'omd-bare-'))]) {
    const r = run(['hook', 'pre-tool'], { cwd: dir, input: 'not json at all' });
    assert.ok([0, 2].includes(r.status), `got ${r.status}; Codex would treat anything else as "hook failed" and continue`);
  }
});

test('omd frame approve flips the gate', () => {
  const dir = project({ approved: false });
  assert.equal(run(['hook', 'pre-tool'], { cwd: dir, input: '{}' }).status, 2);
  execFileSync(process.execPath, [CLI, 'frame', 'approve'], { cwd: dir, env: asHuman });
  assert.equal(run(['hook', 'pre-tool'], { cwd: dir, input: '{}' }).status, 0);
});

// Verified against a real headless Claude Code session: told to clear the gate itself,
// the agent ran `omd frame approve` and wrote the file. The key sat inside the gate.

test('omd frame approve refuses a caller with no terminal', () => {
  const dir = project({ approved: false });
  const r = run(['frame', 'approve'], { cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /human at a terminal/);
  assert.equal(run(['hook', 'pre-tool'], { cwd: dir, input: '{}' }).status, 2, 'gate must still hold');
});

test('omd frame approve refuses a frame with no evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-noevidence-'));
  mkdirSync(join(dir, '.design'), { recursive: true });
  writeFileSync(join(dir, '.design', 'frame.md'), `---\napproved: false\n---\n\n${REAL_FRAME_BODY}\n`);
  const r = run(['frame', 'approve'], { cwd: dir, env: asHuman });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no evidence/);
});

test('omd frame approve refuses to sign off on a stub', () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-stub-'));
  mkdirSync(join(dir, '.design'), { recursive: true });
  writeFileSync(join(dir, '.design', 'frame.md'), '---\napproved: false\nwhy: "리뷰 표본 n=240"\n---\n\n가설.\n');
  const r = run(['frame', 'approve'], { cwd: dir, env: asHuman });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /stub/);
});

test('approval stamps when it happened', () => {
  const dir = project({ approved: false });
  execFileSync(process.execPath, [CLI, 'frame', 'approve'], { cwd: dir, env: asHuman });
  const out = JSON.parse(run(['frame', 'show'], { cwd: dir }).stdout);
  assert.equal(out.approved, true);
  assert.ok(Date.parse(out.approvedAt) > 0);
});

test('omd --version and unknown commands behave', () => {
  assert.equal(run(['--version']).status, 0);
  assert.notEqual(run(['nonsense-command']).status, 0);
});
