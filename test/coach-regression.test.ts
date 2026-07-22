import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse } from '../core/coach/index.ts';
import { logRun } from '../core/history/index.ts';
import { must } from './helpers.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import type { Run, Violation } from '../core/types.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const project = (): string => mkdtempSync(join(tmpdir(), 'omd-coachreg-'));

const run = (counts: Record<string, number>, day: number): Run => ({
  ts: new Date(Date.UTC(2026, 0, day)).toISOString(),
  page: `p${day}.html`,
  counts,
  total: Object.values(counts).reduce((a, b) => a + b, 0),
});

const violation = (id: string): Violation => ({
  id, severity: 'warn', layer: 1, category: 'slop',
  nodeId: 'n1', path: 'body/n1', value: null, message: 'x',
});

// Found in review: with a zero baseline the implementation returned `Math.round(100 *
// second)`, so a rule going from none to five was reported as "+500%". A percent change
// against nothing is not a small number, it is an undefined one.
test('no baseline means no percentage — the direction is reported, the magnitude is not', () => {
  const history = [run({}, 1), run({}, 2), run({ 'HIT-002': 5 }, 3), run({ 'HIT-002': 5 }, 4)];
  const r = must(analyse(history, []).recurring[0]);
  assert.equal(r.changePct, null);
  assert.equal(r.trend, 'worsening');
});

test('the CLI prints "appeared" rather than a fabricated percentage', () => {
  const dir = project();
  for (const day of [1, 2]) logRun(dir, `p${day}.html`, [], createTestProjectWriteAdapter(dir), new Date(Date.UTC(2026, 0, day)).toISOString());
  for (const day of [3, 4]) {
    logRun(dir, `p${day}.html`, [violation('SLOP-COPY'), violation('SLOP-COPY')], createTestProjectWriteAdapter(dir), new Date(Date.UTC(2026, 0, day)).toISOString());
  }
  const out = spawnSync(process.execPath, [CLI, 'coach'], { cwd: dir, encoding: 'utf8' });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /SLOP-COPY.*appeared.*worsening/);
  assert.ok(!/\d+%/.test(out.stdout), `no percentage may be invented: ${out.stdout}`);
});

// Found in review: overrules were counted per line. A decision naming its rule in both the
// title and the reason — which `omd decision` writes by default — was counted twice.
test('one decision is one overrule, however many times it names the rule', () => {
  const block = [
    'Kept the violet gradient — SLOP-GRADIENT',
    '',
    '- When: 2026-01-01T00:00:00.000Z',
    '- Why: SLOP-GRADIENT is wrong here; the brand primary is #7C3AED',
  ].join('\n');
  assert.deepEqual(analyse([], [block]).overrules, [{ rule: 'SLOP-GRADIENT', count: 1 }]);
});

test('the CLI counts a real decisions.md the same way', () => {
  const dir = project();
  const omd = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });
  omd(['decision', 'Kept the violet gradient (SLOP-GRADIENT)', '--why', 'SLOP-GRADIENT is wrong here: brand primary is #7C3AED']);
  for (const day of [1, 2, 3, 4]) logRun(dir, 'p.html', [], createTestProjectWriteAdapter(dir), new Date(Date.UTC(2026, 0, day)).toISOString());

  const out = omd(['coach']);
  assert.match(out.stdout, /SLOP-GRADIENT\s+x1/, `counted more than once:\n${out.stdout}`);
});

// Found in review: overrules were sorted with localeCompare, so tie order depended on the
// host's ICU locale — the same defect the violation sort had.
test('overrule order does not depend on the ICU locale', () => {
  const blocks = ['SLOP-COPY', 'SLOP-GRADIENT', 'SLOP-EMOJI-HEADING'];
  const order = analyse([], blocks).overrules.map((o) => o.rule);
  assert.deepEqual(order, ['SLOP-COPY', 'SLOP-EMOJI-HEADING', 'SLOP-GRADIENT']);
});

test('recurring ties break deterministically, not by insertion order', () => {
  const history = [
    run({ 'SLOP-COPY': 2, 'TOKEN-003': 2 }, 1), run({ 'SLOP-COPY': 2, 'TOKEN-003': 2 }, 2),
    run({ 'SLOP-COPY': 2, 'TOKEN-003': 2 }, 3), run({ 'SLOP-COPY': 2, 'TOKEN-003': 2 }, 4),
  ];
  const first = analyse(history, []).recurring.map((r) => r.rule);
  const again = analyse(history, []).recurring.map((r) => r.rule);
  assert.deepEqual(first, again);
  assert.deepEqual(first, ['SLOP-COPY', 'TOKEN-003']);
});

// `omd check` must remember, or coach has nothing to read.
test('omd check appends to history, and --no-log does not', () => {
  const dir = project();
  const page = fileURLToPath(new URL('./fixtures/slop.html', import.meta.url));
  const omd = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8' });

  omd(['check', page]);
  assert.match(omd(['coach']).stdout, /Seen 1 run/);

  omd(['check', page, '--no-log']);
  assert.match(omd(['coach']).stdout, /Seen 1 run/, '--no-log must not pollute the history');
});
