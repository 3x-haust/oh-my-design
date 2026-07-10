import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addPrinciples, loadRefs, saveRef } from '../core/ref/store.ts';
import { must } from './helpers.ts';
import type { Reference } from '../core/types.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd });
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-prin-'));

const ref = (): Reference => ({
  source: 'https://linear.app', component: 'page', kind: 'page', capturedAt: new Date().toISOString(),
  invariants: {
    spacingLadder: [4, 8], radiusLadder: [4, 8], elevationLevels: 3, centeredRatio: 0.09, tokenCoverage: 0.7, paddingWeight: 10,
    typeScale: [14, 16], fontFamilies: ['inter'], weightLadder: [400], motionDurations: [], easingVocab: [], animatedShare: 0,
  },
  principles: [],
});

// A principle is a judgement about *why*, so a function cannot write it. The CLI records
// what an agent wrote after seeing the render — the same split as everywhere else: the
// tool measures, the model interprets.

test('a freshly captured reference has no principles — nothing has looked at it yet', () => {
  const dir = project();
  saveRef(dir, ref());
  assert.deepEqual(must(loadRefs(dir)[0]).principles, []);
});

test('addPrinciples attaches reasoning to an existing reference', () => {
  const dir = project();
  saveRef(dir, ref());
  addPrinciples(dir, 'https://linear.app', 'page', ['Radii split into rungs, so an input and a card are different materials.']);

  const loaded = must(loadRefs(dir)[0]);
  assert.equal(loaded.principles.length, 1);
  assert.match(must(loaded.principles[0]), /different materials/);
  assert.deepEqual(must(loaded.invariants).radiusLadder, [4, 8], 'measurements are untouched');
});

test('addPrinciples appends rather than replacing, and never duplicates', () => {
  const dir = project();
  saveRef(dir, ref());
  addPrinciples(dir, 'https://linear.app', 'page', ['first']);
  addPrinciples(dir, 'https://linear.app', 'page', ['second', 'first']);
  assert.deepEqual(must(loadRefs(dir)[0]).principles, ['first', 'second']);
});

test('addPrinciples on an unknown reference throws rather than silently creating one', () => {
  assert.throws(() => addPrinciples(project(), 'https://nope.com', 'page', ['x']), /no reference/i);
});

test('omd ref principles wires the same behaviour through the CLI', () => {
  const dir = project();
  saveRef(dir, ref());
  const r = run(['ref', 'principles', 'https://linear.app', '--as', 'page', '--add', 'Centring is used for emphasis only.'], dir);
  assert.equal(r.status, 0);
  assert.match(must(must(loadRefs(dir)[0]).principles[0]), /emphasis only/);
});

test('omd ref principles needs something to add', () => {
  const dir = project();
  saveRef(dir, ref());
  assert.equal(run(['ref', 'principles', 'https://linear.app', '--as', 'page'], dir).status, 1);
});

test('omd ref show prints the invariants and principles an agent needs to read', () => {
  const dir = project();
  saveRef(dir, ref());
  addPrinciples(dir, 'https://linear.app', 'page', ['Three levels of elevation, so height means something.']);

  const out = run(['ref', 'show', 'https://linear.app', '--as', 'page'], dir);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /radiusLadder/);
  assert.match(out.stdout, /height means something/);
});
