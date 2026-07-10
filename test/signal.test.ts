import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { designSignal, LOW_SIGNAL } from '../core/ref/signal.ts';
import type { Invariants } from '../core/types.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const SLOP = fileURLToPath(new URL('./fixtures/slop.html', import.meta.url));
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-signal-'));
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd });

/** Real invariants measured from https://linear.app (test/distance-regression.test.ts). */
const LINEAR: Invariants = {
  spacingLadder: [1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 28, 40, 48],
  radiusLadder: [4, 6, 8, 12, 16, 50, 9999],
  elevationLevels: 3,
  centeredRatio: 0.0929,
  tokenCoverage: 0.7068,
  paddingWeight: 10.47,
  typeScale: [13, 14, 16, 21],
  fontFamilies: ['inter'],
  weightLadder: [400, 510],
  motionDurations: [100, 160],
  easingVocab: ['ease', 'ease-out'],
  animatedShare: 0.05,
  hoverCoverage: 0.75,
  focusCoverage: 0.8,
};

/** danluu.com-shaped: almost no design decisions of any kind. */
const DANLUU: Invariants = {
  spacingLadder: [8],
  radiusLadder: [],
  elevationLevels: 0,
  centeredRatio: 0,
  tokenCoverage: 0,
  paddingWeight: 2,
  typeScale: [16],
  fontFamilies: ['times'],
  weightLadder: [400],
  motionDurations: [],
  easingVocab: [],
  animatedShare: 0,
  hoverCoverage: 0,
  focusCoverage: 0,
};

test('a danluu-shaped page scores low and names what is missing', () => {
  const { score, missing } = designSignal(DANLUU);
  assert.ok(score <= 0.25, `expected <= 0.25, got ${score}`);
  for (const name of ['radius', 'elevation', 'motion', 'tokens']) {
    assert.ok(missing.includes(name), `expected missing to include ${name}, got ${missing.join(',')}`);
  }
});

test('a Linear-shaped page scores high with little or nothing missing', () => {
  const { score, missing } = designSignal(LINEAR);
  assert.ok(score >= 0.75, `expected >= 0.75, got ${score}`);
  assert.ok(missing.length <= 2, `expected a short missing list, got ${missing.join(',')}`);
});

test('boundary: exactly meeting every threshold scores 1', () => {
  const inv: Invariants = {
    ...LINEAR,
    radiusLadder: [4, 8],
    elevationLevels: 1,
    typeScale: [14, 16, 18],
    weightLadder: [400, 700],
    motionDurations: [150],
    tokenCoverage: 0.2,
    spacingLadder: [4, 8, 12, 16],
    paddingWeight: 4,
    hoverCoverage: 0.3,
  };
  assert.equal(designSignal(inv).score, 1);
  assert.deepEqual(designSignal(inv).missing, []);
});

// Forced contract change: designSignal now checks nine signals, not eight (the
// `interaction` signal added alongside hoverCoverage/focusCoverage — see core/ref/
// signal.ts). Failing every threshold therefore now names nine missing signals, not eight.
test('boundary: failing every threshold scores 0', () => {
  const inv: Invariants = {
    ...LINEAR,
    radiusLadder: [],
    elevationLevels: 0,
    typeScale: [16],
    weightLadder: [400],
    motionDurations: [],
    tokenCoverage: 0.1,
    spacingLadder: [8],
    paddingWeight: 3,
    hoverCoverage: 0.29,
  };
  assert.equal(designSignal(inv).score, 0);
  assert.equal(designSignal(inv).missing.length, 9);
});

// ── CLI wiring ──
//
// slop.html has radius, shadow and a type scale (measured 0.5, above LOW_SIGNAL) — probed
// first, so this asserts what designSignal actually returns, not a guess.
test('omd ref add on a page with real design decisions does not warn', () => {
  const dir = project();
  const r = run(['ref', 'add', SLOP, '--as', 'page'], dir);
  assert.equal(r.status, 0);
  const { score } = designSignal(JSON.parse(
    r.stdout.slice(r.stdout.indexOf('{')),
  ) as Invariants);
  assert.ok(score >= LOW_SIGNAL, `expected slop.html to clear the threshold, scored ${score}`);
  assert.doesNotMatch(r.stderr, /low design signal/);
});

test('omd ref add on an undesigned page warns on stderr and still exits 0', () => {
  const dir = project();
  const plain = join(dir, 'plain.html');
  writeFileSync(
    plain,
    '<meta charset="utf-8"><title>plain</title>'
    + '<p>Just some plain text on a page with no styling at all.</p>'
    + '<p>Another paragraph, nothing decided here.</p>',
  );

  const add = run(['ref', 'add', plain, '--as', 'plain'], dir);
  assert.equal(add.status, 0);
  assert.match(add.stderr, /low design signal/);
  assert.match(add.stderr, /teaches nothing/);

  const list = run(['ref', 'list'], dir);
  assert.match(list.stdout, /\[low-signal/);
});
