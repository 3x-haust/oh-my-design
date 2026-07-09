import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSession, startSession, endSession, isGuarded, DEFAULT_SCOPE } from '../core/session/index.ts';
import { preTool } from '../core/hook/dispatch.ts';
import { must } from './helpers.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));

const run = (args: string[], opts: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {}) =>
  spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });

function bareDir(): string {
  return mkdtempSync(join(tmpdir(), 'omd-session-'));
}

function approvedProject(): string {
  const dir = bareDir();
  startSession(dir, 'test brief');
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(
    join(dir, '.omd', 'frame.md'),
    '---\napproved: true\nwhy: "리뷰 표본 n=240"\n---\n\n결정 마비 문제다. 충분히 긴 본문.\n',
  );
  return dir;
}

function unapprovedProject(): string {
  const dir = bareDir();
  startSession(dir, 'test brief');
  return dir;
}

// ── The headline behaviour: installing OMD globally must not break unrelated repos. ──

test('a project with no session: hook pre-tool exits 0 even with no .omd/ at all', () => {
  const dir = bareDir();
  const r = run(['hook', 'pre-tool'], { cwd: dir, input: JSON.stringify({ tool_input: { file_path: 'x.css' } }) });
  assert.equal(r.status, 0);
});

test('session open + unapproved frame + a .css path -> exit 2', () => {
  const dir = unapprovedProject();
  const r = run(['hook', 'pre-tool'], { cwd: dir, input: JSON.stringify({ tool_input: { file_path: 'style.css' } }) });
  assert.equal(r.status, 2);
});

test('session open + unapproved frame + a README.md path -> exit 0 (out of scope)', () => {
  const dir = unapprovedProject();
  const r = run(['hook', 'pre-tool'], { cwd: dir, input: JSON.stringify({ tool_input: { file_path: 'README.md' } }) });
  assert.equal(r.status, 0);
});

test('session open + approved frame + a .css path -> exit 0', () => {
  const dir = approvedProject();
  const r = run(['hook', 'pre-tool'], { cwd: dir, input: JSON.stringify({ tool_input: { file_path: 'style.css' } }) });
  assert.equal(r.status, 0);
});

test('omd session end re-opens the world: the same .css write now exits 0', () => {
  const dir = unapprovedProject();
  const cssPayload = JSON.stringify({ tool_input: { file_path: 'style.css' } });
  assert.equal(run(['hook', 'pre-tool'], { cwd: dir, input: cssPayload }).status, 2);
  const endResult = run(['session', 'end'], { cwd: dir });
  assert.equal(endResult.status, 0);
  assert.equal(run(['hook', 'pre-tool'], { cwd: dir, input: cssPayload }).status, 0);
});

// ── fail closed ──

test('fail-closed: unreadable/corrupt session.json -> exit 2, never 0', () => {
  const dir = bareDir();
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'session.json'), 'not json at all {{{');
  const r = run(['hook', 'pre-tool'], { cwd: dir, input: JSON.stringify({ tool_input: { file_path: 'style.css' } }) });
  assert.equal(r.status, 2);
});

test('preTool fails closed on a corrupt session.json even via direct call', async () => {
  const dir = bareDir();
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'session.json'), 'not json at all {{{');
  const result = await preTool({ cwd: dir, filePath: join(dir, 'style.css') });
  assert.equal(result.decision, 'deny');
});

// ── matchesGlob relative-path behaviour ──

test('matchesGlob relative-path behaviour for a path outside cwd', () => {
  const dir = bareDir();
  startSession(dir, 'test brief');
  const outside = join(tmpdir(), 'somewhere-else.css');
  assert.equal(isGuarded(dir, outside), false, 'a path outside cwd is not guarded');
  assert.equal(isGuarded(dir, join(dir, 'style.css')), true, 'a matching path inside cwd is guarded');
  assert.equal(isGuarded(dir, join(dir, 'README.md')), false, 'a non-matching path inside cwd is not guarded');
});

// ── core session module ──

test('readSession returns null when no session file exists', () => {
  assert.equal(readSession(bareDir()), null);
});

test('readSession throws on corrupt JSON rather than silently allowing', () => {
  const dir = bareDir();
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'session.json'), '{ broken');
  assert.throws(() => readSession(dir));
});

test('startSession writes session.json and a stub frame.md when none exists', () => {
  const dir = bareDir();
  const session = startSession(dir, 'my brief');
  assert.equal(session.brief, 'my brief');
  assert.deepEqual(session.scope, DEFAULT_SCOPE);
  const read = must(readSession(dir), 'session');
  assert.equal(read.brief, 'my brief');
  const frame = readSession(dir); // sanity: session file itself parses
  assert.ok(frame);
});

test('startSession does not clobber an existing frame.md', () => {
  const dir = bareDir();
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'frame.md'), '---\napproved: true\n---\n\nkeep me\n');
  startSession(dir, 'brief');
  const text = must(readSession(dir), 'session');
  assert.ok(text);
  // frame.md content unchanged
  assert.match(readFileSync(join(dir, '.omd', 'frame.md'), 'utf8'), /keep me/);
});

test('endSession is idempotent', () => {
  const dir = bareDir();
  startSession(dir, 'brief');
  endSession(dir);
  assert.equal(readSession(dir), null);
  assert.doesNotThrow(() => endSession(dir));
});

test('isGuarded is false when no session is open', () => {
  const dir = bareDir();
  assert.equal(isGuarded(dir, join(dir, 'style.css')), false);
});

test('sanity: node matchesGlob exists and matches relative posix paths', () => {
  assert.equal(matchesGlob('src/App.tsx', '**/*.tsx'), true);
  assert.equal(matchesGlob('README.md', '**/*.tsx'), false);
});
