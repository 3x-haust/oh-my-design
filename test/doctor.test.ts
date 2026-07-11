import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

const run = (args: string[], cwd?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-doctor-'));

// omd doctor prints one line per check: "pass  <label>" or "fail  <label>".
// The test does not assert exit code because the playwright/chromium check may
// legitimately fail in a fresh CI environment — that is exactly what doctor is
// designed to surface, not a test defect.

test('omd doctor prints a line for each expected check', () => {
  const r = run(['doctor'], project());

  // Every output line is either "pass  …" or "fail  …"
  const lines = r.stdout.trim().split('\n').filter((l) => l.length > 0);
  assert.ok(lines.length > 0, 'doctor produced no output');
  for (const line of lines) {
    assert.match(line, /^(pass|fail)\s+/, `unexpected line format: ${line}`);
  }
});

test('omd doctor reports node version check', () => {
  const r = run(['doctor'], project());
  assert.match(r.stdout, /node >=22\.18/);
});

test('omd doctor passes the node version check on the current runtime', () => {
  const r = run(['doctor'], project());
  // We require node >=22.18; the test suite itself runs on this node, so it must pass.
  assert.match(r.stdout, /^pass\s+node >=22\.18/m);
});

test('omd doctor reports theory-pack presence', () => {
  const r = run(['doctor'], project());
  assert.match(r.stdout, /theory\/color\.md/);
  assert.match(r.stdout, /theory\/typography\.md/);
  assert.match(r.stdout, /theory\/expressive\.md/);
});

test('omd doctor passes all theory-pack checks when run from the repo', () => {
  // Theory files live at <repo>/core/theory/ — always present in a checkout.
  const r = run(['doctor'], project());
  const theoryLines = r.stdout.split('\n').filter((l) => l.includes('theory/'));
  assert.ok(theoryLines.length > 0, 'no theory lines in output');
  for (const line of theoryLines) {
    assert.match(line, /^pass\s+theory\//, `theory file missing: ${line}`);
  }
});

test('omd doctor reports .omd/ writability', () => {
  const r = run(['doctor'], project());
  assert.match(r.stdout, /\.omd\/ writable/);
});

test('omd doctor passes .omd/ writability in a writable temp dir', () => {
  const r = run(['doctor'], project());
  assert.match(r.stdout, /^pass\s+\.omd\/ writable/m);
});
