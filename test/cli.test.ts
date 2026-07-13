import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Frame, Violation } from '../core/types.ts';
import { must } from './helpers.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/ir.raw.json', import.meta.url));
const PROBE_FIXTURE = fileURLToPath(new URL('./fixtures/probe.html', import.meta.url));

const run = (args: string[], cwd?: string) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...(cwd ? { cwd } : {}) });

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-cli-'));

const EVIDENCE = 'App store reviews, n=240: 31% say "too many choices"';

test('omd check exits 1 when violations exist — usable as a CI design linter', () => {
  const r = run(['check', '--ir', FIXTURE], project());
  assert.equal(r.status, 1);
  assert.match(r.stdout, /CONTRAST-001/);
});

test('omd check --json emits a parseable violation array', () => {
  const parsed = JSON.parse(run(['check', '--ir', FIXTURE, '--json'], project()).stdout) as Violation[];
  assert.ok(parsed.length > 0);
  assert.ok(parsed.every((v) => v.id && v.nodeId && v.path && v.severity && v.category));
});

test('omd check exits 0 on a clean IR', () => {
  const dir = project();
  const clean = join(dir, 'clean.json');
  writeFileSync(clean, JSON.stringify({ meta: {}, tokens: {}, nodes: [] }));
  assert.equal(run(['check', '--ir', clean], dir).status, 0);
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

test('omd choose is agent taste and the default profile excludes it', () => {
  const dir = project();
  run(['choose', 'c1', 'c2', '--chose', 'c2', '--why', 'denser'], dir);
  const out = run(['taste', 'profile'], dir).stdout;
  assert.match(out, /No explicit user taste/);
  const all = run(['taste', 'profile', '--all'], dir).stdout;
  assert.match(all, /\[agent\] c2 over c1/);
});

test('omd taste record requires explicit verbatim user evidence', () => {
  const dir = project();
  assert.equal(run(['taste', 'record', 'serif hero', '--kind', 'praise', '--evidence', '이 타이포가 좋다'], dir).status, 1);
  assert.equal(run(['taste', 'record', 'serif hero', '--kind', 'praise', '--evidence', '이 타이포가 좋다', '--from-user'], dir).status, 0);
  const out = run(['taste', 'profile'], dir).stdout;
  assert.match(out, /\[user\] praise: serif hero/);
  assert.match(out, /이 타이포가 좋다/);
});

test('legacy choices normalize to unknown and are not injected as user taste', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd', 'taste'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'taste', 'preferences.jsonl'), `${JSON.stringify({ ts: 'old', among: ['a', 'b'], chose: 'b', why: 'old' })}\n`);
  assert.match(run(['taste', 'profile'], dir).stdout, /No explicit user taste/);
  assert.match(run(['taste', 'profile', '--all'], dir).stdout, /\[unknown\] b over a/);
});

test('omd config defaults to no checkpoint and persists opt-in values', () => {
  const dir = project();
  assert.deepEqual(JSON.parse(run(['config', 'show'], dir).stdout), { checkpoint: 'none' });
  assert.equal(run(['config', 'set', 'checkpoint', 'both'], dir).status, 0);
  assert.deepEqual(JSON.parse(run(['config', 'show'], dir).stdout), { checkpoint: 'both' });
  assert.notEqual(run(['config', 'set', 'checkpoint', 'always'], dir).status, 0);
});

test('omd craft requires an observed change and reports structured status', () => {
  const dir = project();
  assert.notEqual(run(['craft', 'checkpoint', 'semantic', '--render', 'a.png', '--observed', 'hero wraps', '--changed', 'no change'], dir).status, 0);
  assert.equal(run(['craft', 'checkpoint', 'semantic', '--render', 'a.png', '--observed', 'hero wraps at mobile', '--changed', 'reduced heading max width'], dir).status, 0);
  const records = JSON.parse(run(['craft', 'status', '--json'], dir).stdout) as Array<{ phase: string; changed: string }>;
  assert.equal(records[0]?.phase, 'semantic');
  assert.equal(records[0]?.changed, 'reduced heading max width');
});

test('omd probe uses the durable default plan and writes a disposable result', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd', 'probes'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'probes', 'primary.json'), JSON.stringify({
    name: 'primary', destructive: false,
    steps: [{ action: 'click', selector: '#toggle', expect: [{ type: 'visible', selector: '#panel' }] }],
  }));
  const r = run(['probe', PROBE_FIXTURE, '--json'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual((JSON.parse(r.stdout) as { warnings: unknown[] }).warnings, []);
  assert.ok(existsSync(join(dir, '.omd', '.cache', 'probes', 'primary.json')));
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

// ── omd pack: host-neutral pack-path resolution ──
//
// pack dir / list / <relpath> let any host locate knowledge-pack files without
// knowing the installation path, and without relying on env vars like CLAUDE_PLUGIN_ROOT.

test('omd pack dir prints an absolute path that exists and ends with core', () => {
  const r = run(['pack', 'dir']);
  assert.equal(r.status, 0);
  const printed = r.stdout.trim();
  assert.ok(existsSync(printed), `pack dir path does not exist: ${printed}`);
  assert.ok(printed.endsWith('core'), `expected path ending in 'core', got: ${printed}`);
});

test('omd pack list enumerates .md files, each with a relative path', () => {
  const r = run(['pack', 'list']);
  assert.equal(r.status, 0);
  const lines = r.stdout.trim().split('\n').filter(Boolean);
  assert.ok(lines.length > 0, 'omd pack list returned no files');
  assert.ok(lines.every((l) => l.endsWith('.md')), `non-.md line in pack list: ${lines.find((l) => !l.endsWith('.md'))}`);
  assert.ok(lines.some((l) => l.startsWith('theory/')), 'expected at least one theory/ file in pack list');
});

test('omd pack <relpath> prints a real pack file to stdout', () => {
  const r = run(['pack', 'theory/color.md']);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.length > 0, 'omd pack theory/color.md returned empty output');
});

test('omd pack with no subcommand exits non-zero', () => {
  assert.notEqual(run(['pack']).status, 0);
});

test('omd pack <missing-file> exits non-zero with an error message', () => {
  const r = run(['pack', 'theory/does-not-exist.md']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not found/);
});
