import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logRun, readHistory } from '../core/history/index.ts';
import { analyse } from '../core/coach/index.ts';
import { must } from './helpers.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import type { Run, Violation } from '../core/types.ts';

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-coach-'));

const violation = (id: string, nodeId: string): Violation => ({
  id, severity: 'warn', layer: 1,
  category: id.startsWith('SLOP') ? 'slop' : id.startsWith('CONTRAST') || id.startsWith('HIT') ? 'a11y' : 'system',
  nodeId, path: `body/${nodeId}`, value: null, message: `${id} fired`,
});

/** n runs, each with `perRun[i]` violations of `rule`. */
function seed(dir: string, rule: string, perRun: number[]): void {
  perRun.forEach((n, i) => {
    const vs = Array.from({ length: n }, (_, k) => violation(rule, `n${k}`));
    logRun(dir, `page-${i}.html`, vs, createTestProjectWriteAdapter(dir), new Date(Date.UTC(2026, 0, i + 1)).toISOString());
  });
}

// ── history ──

test('logRun appends one line per run and readHistory reads them back in order', () => {
  const dir = project();
  logRun(dir, 'a.html', [violation('CONTRAST-001', 'n1'), violation('CONTRAST-001', 'n2')], createTestProjectWriteAdapter(dir));
  logRun(dir, 'b.html', [violation('SLOP-COPY', 'n1')], createTestProjectWriteAdapter(dir));

  const history = readHistory(dir);
  assert.equal(history.length, 2);
  assert.equal(must(history[0]).page, 'a.html');
  assert.equal(must(history[0]).counts['CONTRAST-001'], 2);
  assert.equal(must(history[0]).total, 2);
  assert.equal(must(history[1]).counts['SLOP-COPY'], 1);
});

test('logRun records a clean run too — zero findings is the signal that you improved', () => {
  const dir = project();
  logRun(dir, 'clean.html', [], createTestProjectWriteAdapter(dir));
  const run = must(readHistory(dir)[0]) as Run;
  assert.equal(run.total, 0);
  assert.deepEqual(run.counts, {});
});

test('readHistory on a project with no history returns empty, not a crash', () => {
  assert.deepEqual(readHistory(project()), []);
});

test('readHistory skips a corrupt line rather than losing the whole log', () => {
  const dir = project();
  logRun(dir, 'a.html', [violation('HIT-002', 'n1')], createTestProjectWriteAdapter(dir));
  mkdirSync(join(dir, '.omd'), { recursive: true });
  const path = join(dir, '.omd', 'history.jsonl');
  writeFileSync(path, `${readFileSync(path, 'utf8')}{ not json\n`);
  assert.equal(readHistory(dir).length, 1);
});

// ── coach: the honesty properties ──

test('with too little history, coach refuses to claim a trend', () => {
  const dir = project();
  seed(dir, 'CONTRAST-001', [5, 3]);
  const report = analyse(readHistory(dir), []);

  assert.equal(report.confident, false);
  assert.equal(must(report.recurring[0]).trend, 'insufficient');
  assert.equal(must(report.recurring[0]).changePct, null);
});

test('a rule that keeps recurring across enough runs gets a measured trend', () => {
  const dir = project();
  seed(dir, 'CONTRAST-001', [10, 10, 3, 3]);
  const report = analyse(readHistory(dir), []);

  assert.equal(report.confident, true);
  const contrast = must(report.recurring.find((r) => r.rule === 'CONTRAST-001'));
  assert.equal(contrast.total, 26);
  assert.equal(contrast.runs, 4);
  assert.equal(contrast.trend, 'improving');
  assert.equal(contrast.changePct, -70);
});

test('a worsening rule is named as worsening', () => {
  const dir = project();
  seed(dir, 'SLOP-EVERYTHING-CENTERED', [2, 2, 6, 6]);
  const r = must(analyse(readHistory(dir), []).recurring[0]);
  assert.equal(r.trend, 'worsening');
  assert.equal(r.changePct, 200);
});

test('an unchanged rule is flat, not spuriously trending', () => {
  const dir = project();
  seed(dir, 'TOKEN-003', [4, 4, 4, 4]);
  const r = must(analyse(readHistory(dir), []).recurring[0]);
  assert.equal(r.trend, 'flat');
  assert.equal(r.changePct, 0);
});

test('a rule you fixed completely shows -100%, not a division by zero', () => {
  const dir = project();
  seed(dir, 'CONTRAST-001', [8, 8, 0, 0]);
  const r = must(analyse(readHistory(dir), []).recurring[0]);
  assert.equal(r.changePct, -100);
  assert.equal(r.trend, 'improving');
});

// A rule absent from the first half has no baseline, so a percent change does not exist.
// Reporting one — "+500%" because it went from 0 to 5 — is inventing a statistic. The
// trend is knowable; the percentage is not, and `null` says exactly that.
test('a rule appearing for the first time is worsening, with no percentage claimed', () => {
  const dir = project();
  seed(dir, 'HIT-002', [0, 0, 5, 5]);
  const r = must(analyse(readHistory(dir), []).recurring[0]);
  assert.equal(r.trend, 'worsening');
  assert.equal(r.changePct, null, 'no baseline means no percentage');
});

test('a one-off finding is not called recurring', () => {
  const dir = project();
  logRun(dir, 'a.html', [violation('SLOP-COPY', 'n1')], createTestProjectWriteAdapter(dir));
  logRun(dir, 'b.html', [], createTestProjectWriteAdapter(dir));
  logRun(dir, 'c.html', [], createTestProjectWriteAdapter(dir));
  logRun(dir, 'd.html', [], createTestProjectWriteAdapter(dir));
  assert.deepEqual(analyse(readHistory(dir), []).recurring, []);
});

test('recurring rules are ranked by how much they cost, worst first', () => {
  const dir = project();
  seed(dir, 'CONTRAST-001', [1, 1, 1, 1]);
  seed(dir, 'SLOP-COPY', [9, 9, 9, 9]);
  const rules = analyse(readHistory(dir), []).recurring.map((r) => r.rule);
  assert.equal(rules[0], 'SLOP-COPY');
});

test('coach reports the span of the history it read', () => {
  const dir = project();
  seed(dir, 'TOKEN-003', [1, 1, 1, 1]);
  const span = must(analyse(readHistory(dir), []).span);
  assert.ok(span.from < span.to);
});

test('coach on an empty history says nothing rather than inventing something', () => {
  const report = analyse([], []);
  assert.equal(report.runs, 0);
  assert.equal(report.confident, false);
  assert.deepEqual(report.recurring, []);
  assert.equal(report.span, null);
});

// ── taste and skill must not mix ──
//
// "You prefer dense layouts" has no right answer — professional designers agree at
// α = 0.248. "You keep missing contrast" has one. Coach only ever speaks about the second.

test('coach never reads the taste log', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd', 'taste'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'taste', 'preferences.jsonl'), JSON.stringify({ chose: 'c3', among: ['c1', 'c3'] }) + '\n');
  seed(dir, 'CONTRAST-001', [2, 2, 2, 2]);

  const report = analyse(readHistory(dir), []);
  const dump = JSON.stringify(report);
  assert.ok(!dump.includes('c3'), 'a preference must never appear in a skill report');
  assert.ok(report.recurring.every((r) => r.category === 'a11y' || r.category === 'slop' || r.category === 'system'));
});

test('coach counts the slop rules the user overruled', () => {
  const decisions = [
    'Kept the violet gradient — SLOP-GRADIENT — the brand primary is #7C3AED',
    'Kept the violet gradient again — SLOP-GRADIENT — same brand',
    'Centred the hero — SLOP-EVERYTHING-CENTERED — it is a single call to action',
  ];
  const report = analyse([], decisions);
  assert.deepEqual(report.overrules, [
    { rule: 'SLOP-GRADIENT', count: 2 },
    { rule: 'SLOP-EVERYTHING-CENTERED', count: 1 },
  ]);
});
