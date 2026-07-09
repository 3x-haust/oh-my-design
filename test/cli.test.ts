import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Frame, Violation } from '../core/types.ts';
import { must } from './helpers.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/ir.raw.json', import.meta.url));

const run = (args: string[], cwd?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-cli-'));

const EVIDENCE = 'App store reviews, n=240: 31% say "too many choices"';

test('omd check exits 1 when violations exist — usable as a CI design linter', () => {
  const r = run(['check', '--ir', FIXTURE]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /CONTRAST-001/);
});

test('omd check --json emits a parseable violation array', () => {
  const parsed = JSON.parse(run(['check', '--ir', FIXTURE, '--json']).stdout) as Violation[];
  assert.ok(parsed.length > 0);
  assert.ok(parsed.every((v) => v.id && v.nodeId && v.path && v.severity && v.category));
});

test('omd check exits 0 on a clean IR', () => {
  const dir = project();
  const clean = join(dir, 'clean.json');
  writeFileSync(clean, JSON.stringify({ meta: {}, tokens: {}, nodes: [] }));
  assert.equal(run(['check', '--ir', clean]).status, 0);
});

// ── The frame is a record the loop keeps, not a gate a human signs. ──

test('there is no approval command any more', () => {
  assert.notEqual(run(['frame', 'approve'], project()).status, 0);
});

test('nothing blocks a write: there is no hook subcommand', () => {
  assert.notEqual(run(['hook', 'pre-tool']).status, 0);
});

test('omd frame set refuses a reframing with no cited evidence', () => {
  const r = run(['frame', 'set', '--problem', 'a blog', '--reframe', 'a reading problem'], project());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /without a cited observation is a guess/);
});

test('omd frame set writes a record that needs no signature', () => {
  const dir = project();
  assert.equal(run(['frame', 'set', '--problem', 'a blog', '--reframe', 'a reading problem', '--why', EVIDENCE], dir).status, 0);

  const frame = JSON.parse(run(['frame', 'show'], dir).stdout) as Frame;
  assert.equal(frame.why, EVIDENCE);
  assert.ok(frame.writtenAt);
  assert.equal(frame['approved'], undefined, 'approval is not a concept any more');
  assert.match(frame.body, /## The reframing/);
});

test('omd frame reframe appends a revision rather than overwriting the old framing', () => {
  const dir = project();
  run(['frame', 'set', '--problem', 'a blog', '--reframe', 'a reading problem', '--why', EVIDENCE], dir);
  run(['frame', 'reframe', '--to', 'two modes: new and returning', '--because', 'c3 cannot be skimmed'], dir);

  const frame = JSON.parse(run(['frame', 'show'], dir).stdout) as Frame;
  assert.equal(frame.revision, 1);
  assert.match(frame.body, /a reading problem/, 'the original framing survives');
  assert.match(frame.body, /## Reframing 1/);
  assert.match(frame.body, /c3 cannot be skimmed/);

  run(['frame', 'reframe', '--to', 'three modes', '--because', 'the render showed a third'], dir);
  const twice = JSON.parse(run(['frame', 'show'], dir).stdout) as Frame;
  assert.equal(twice.revision, 2);
  assert.match(twice.body, /## Reframing 1/);
  assert.match(twice.body, /## Reframing 2/);
});

test('omd frame generator records the point of view', () => {
  const dir = project();
  run(['frame', 'set', '--problem', 'p', '--reframe', 'r', '--why', EVIDENCE], dir);
  run(['frame', 'generator', '--set', 'a trustworthy accountant'], dir);
  const frame = JSON.parse(run(['frame', 'show'], dir).stdout) as Frame;
  assert.equal(frame.generator, 'a trustworthy accountant');
});

// ── choose records; it does not halt and wait for a human. ──

test('omd choose records the pick and its reason without stopping the loop', () => {
  const dir = project();
  const r = run(['choose', 'c1', 'c2', 'c3', '--chose', 'c3', '--why', 'conversational fits the metaphor'], dir);
  assert.equal(r.status, 0);

  const line = readFileSync(join(dir, '.omd', 'taste', 'preferences.jsonl'), 'utf8').trim();
  const rec = JSON.parse(line) as { chose: string; among: string[]; why: string };
  assert.equal(rec.chose, 'c3');
  assert.deepEqual(rec.among, ['c1', 'c2', 'c3']);
  assert.equal(rec.why, 'conversational fits the metaphor');
});

test('omd choose refuses a pick with no reason — a choice without one teaches nothing', () => {
  const r = run(['choose', 'c1', 'c2', '--chose', 'c1'], project());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /reason/);
});

test('omd decision requires a why', () => {
  const dir = project();
  assert.equal(run(['decision', 'rejected the green CTA'], dir).status, 1);
  assert.equal(run(['decision', 'rejected the green CTA', '--why', 'fintech cliche'], dir).status, 0);
  assert.match(readFileSync(join(dir, '.omd', 'decisions.md'), 'utf8'), /fintech cliche/);
});

test('omd taste profile summarises accumulated choices', () => {
  const dir = project();
  run(['choose', 'c1', 'c2', '--chose', 'c2', '--why', 'denser'], dir);
  const out = run(['taste', 'profile'], dir).stdout;
  assert.match(out, /1 choices/);
  assert.match(out, /c2 over c1/);
});

test('frame.md survives a hand-written file with no frontmatter', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'frame.md'), 'just prose, no frontmatter\n');
  const frame = JSON.parse(run(['frame', 'show'], dir).stdout) as Frame;
  assert.match(must(frame.body), /just prose/);
});

test('omd --version and unknown commands behave', () => {
  assert.equal(run(['--version']).status, 0);
  assert.notEqual(run(['nonsense-command']).status, 0);
});
