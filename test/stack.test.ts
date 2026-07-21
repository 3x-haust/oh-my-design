import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeStack } from '../core/stack/index.ts';

// `omd stack` computes the stack from folder evidence. The default is plain HTML/CSS/JS; a framework
// is only reached for on an explicit user request or a genuinely stateful app. An existing project is
// built in as-is.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const dir = (): string => mkdtempSync(join(tmpdir(), 'omd-stack-'));

test('a truly blank folder defaults to plain HTML/CSS/JS', () => {
  const d = computeStack(dir());
  assert.equal(d.stack, 'plain-html-css-js');
  assert.equal(d.greenfield, true);
  assert.equal(d.framework, null);
  // the default is not a framework; one is reached for only on request or a stateful app
  assert.match(d.reason, /default to plain HTML\/CSS\/JS/i);
  assert.match(d.reason, /only when the user explicitly asks/i);
});

test('a folder with only a leftover index.html/.css/.js is a plain-HTML greenfield, not an existing stack', () => {
  const cwd = dir();
  writeFileSync(join(cwd, 'index.html'), '<!doctype html><html></html>');
  writeFileSync(join(cwd, 'styles.css'), 'body{}');
  writeFileSync(join(cwd, 'script.js'), '');
  mkdirSync(join(cwd, '.omd'), { recursive: true }); // OMD ran here before — still not a user stack
  const d = computeStack(cwd);
  assert.equal(d.stack, 'plain-html-css-js');
  assert.equal(d.greenfield, true, 'leftover OMD output must not be read as an existing project');
});

test('an existing React project (package.json) is preserved, never replaced', () => {
  const cwd = dir();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { react: '18' } }));
  const d = computeStack(cwd);
  assert.equal(d.stack, 'existing');
  assert.equal(d.framework, 'react');
  assert.equal(d.greenfield, false);
});

test('a build config without package.json is an existing toolchain, not a greenfield', () => {
  const cwd = dir();
  writeFileSync(join(cwd, 'vite.config.ts'), 'export default {}');
  const d = computeStack(cwd);
  assert.equal(d.stack, 'existing');
  assert.equal(d.greenfield, false);
});

test('omd stack CLI reports plain-html-css-js for a blank directory', () => {
  const cwd = dir();
  const result = spawnSync(process.execPath, [CLI, 'stack', '--json'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((JSON.parse(result.stdout) as { stack: string }).stack, 'plain-html-css-js');
});
