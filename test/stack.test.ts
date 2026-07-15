import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeStack } from '../core/stack/index.ts';

// `omd stack` computes the stack from folder evidence so the agent cannot misread a blank
// greenfield — or its own leftover index.html — as an existing vanilla-HTML project.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const dir = (): string => mkdtempSync(join(tmpdir(), 'omd-stack-'));

test('a truly blank folder resolves to React + Vite + TypeScript', () => {
  const d = computeStack(dir());
  assert.equal(d.stack, 'react-vite-typescript');
  assert.equal(d.greenfield, true);
  assert.equal(d.htmlOverrideAllowed, true);
});

test('a folder with only a leftover index.html/.css/.js is still a greenfield (not an existing HTML stack)', () => {
  const cwd = dir();
  writeFileSync(join(cwd, 'index.html'), '<!doctype html><html></html>');
  writeFileSync(join(cwd, 'styles.css'), 'body{}');
  writeFileSync(join(cwd, 'script.js'), '');
  mkdirSync(join(cwd, '.omd'), { recursive: true }); // OMD ran here before — still not a user stack
  const d = computeStack(cwd);
  assert.equal(d.stack, 'react-vite-typescript', 'leftover OMD output must not pin the stack to vanilla');
  assert.equal(d.greenfield, true);
});

test('an existing React project (package.json) is preserved, never scaffolded over', () => {
  const cwd = dir();
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ dependencies: { react: '18' } }));
  const d = computeStack(cwd);
  assert.equal(d.stack, 'existing');
  assert.equal(d.framework, 'react');
  assert.equal(d.greenfield, false);
  assert.equal(d.htmlOverrideAllowed, false);
});

test('a build config without package.json is an existing toolchain, not a greenfield', () => {
  const cwd = dir();
  writeFileSync(join(cwd, 'vite.config.ts'), 'export default {}');
  const d = computeStack(cwd);
  assert.equal(d.stack, 'existing');
  assert.equal(d.greenfield, false);
});

test('omd stack CLI reports react-vite-typescript for a blank directory', () => {
  const cwd = dir();
  const result = spawnSync(process.execPath, [CLI, 'stack', '--json'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((JSON.parse(result.stdout) as { stack: string }).stack, 'react-vite-typescript');
});
