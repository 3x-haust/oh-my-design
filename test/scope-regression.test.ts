import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isGuarded, startSession } from '../core/session/index.ts';
import { preTool } from '../core/hook/dispatch.ts';

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'omd-scope-'));
  startSession(dir, 'brief');
  return dir;
}

// Found in review: isGuarded called relative(cwd, filePath) directly. For a bare
// `style.css` that resolves against process.cwd(), not the project, producing `../..`,
// which reads as "outside the project" and silently opens the gate.
test('a relative design path is guarded, not waved through', () => {
  const dir = project();
  assert.equal(isGuarded(dir, 'style.css'), true);
  assert.equal(isGuarded(dir, 'src/app.tsx'), true);
  assert.equal(isGuarded(dir, join(dir, 'style.css')), true);
});

test('a relative non-design path is still out of scope', () => {
  const dir = project();
  assert.equal(isGuarded(dir, 'README.md'), false);
  assert.equal(isGuarded(dir, 'test/app.test.ts'), false);
});

test('a path genuinely outside the project is never guarded', () => {
  const dir = project();
  assert.equal(isGuarded(dir, '/etc/passwd'), false);
  assert.equal(isGuarded(dir, join(dir, '..', 'elsewhere.css')), false);
});

test('the gate blocks a relative .css write during an unapproved session', async () => {
  const dir = project();
  const r = await preTool({ cwd: dir, filePath: 'style.css', env: {} });
  assert.equal(r.decision, 'deny');
});

// The headline promise of installing globally: unrelated repositories keep working.
test('with no session open, nothing is guarded and every write passes', async () => {
  const bare = mkdtempSync(join(tmpdir(), 'omd-bare-'));
  assert.equal(isGuarded(bare, 'style.css'), false);
  const r = await preTool({ cwd: bare, filePath: 'style.css', env: {} });
  assert.equal(r.decision, 'allow');
});

test('a corrupt session.json blocks rather than passes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-corrupt-'));
  mkdirSync(join(dir, '.omd'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'session.json'), '{ not json');
  const r = await preTool({ cwd: dir, filePath: 'style.css', env: {} });
  assert.equal(r.decision, 'deny');
});
