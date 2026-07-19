import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLighthouse, extractLighthouseMetrics } from '../core/perf/lighthouse.ts';

const report = (perf: number, lcp: number, tbt: number, cls: number): unknown => ({
  categories: { performance: { score: perf } },
  audits: {
    'largest-contentful-paint': { numericValue: lcp },
    'total-blocking-time': { numericValue: tbt },
    'cumulative-layout-shift': { numericValue: cls },
  },
});

test('a report within the default budget passes with no findings', () => {
  const result = evaluateLighthouse(report(0.95, 2000, 100, 0.05));
  assert.equal(result.pass, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.metrics.performance, 0.95);
});

test('a slow report fails with one finding per breached metric', () => {
  const result = evaluateLighthouse(report(0.5, 4000, 500, 0.3));
  assert.equal(result.pass, false);
  assert.equal(result.findings.length, 4);
  const joined = result.findings.join('\n');
  assert.match(joined, /performance 50 is below the budget 90/);
  assert.match(joined, /LCP 4000ms exceeds the 2500ms budget/);
  assert.match(joined, /TBT 500ms exceeds the 200ms budget/);
  assert.match(joined, /CLS 0\.300 exceeds the 0\.1 budget/);
});

test('a missing performance score is a finding, never a silent pass', () => {
  const result = evaluateLighthouse({ audits: {} });
  assert.equal(result.pass, false);
  assert.match(result.findings[0]!, /no performance category score/);
  assert.deepEqual(result.metrics, { performance: null, lcpMs: null, tbtMs: null, cls: null });
});

test('a custom budget can tighten or relax the gate', () => {
  const strict = evaluateLighthouse(report(0.92, 2400, 190, 0.09), { minPerformance: 0.95 });
  assert.equal(strict.pass, false);
  assert.match(strict.findings[0]!, /performance 92 is below the budget 95/);

  const relaxed = evaluateLighthouse(report(0.7, 3000, 300, 0.2), {
    minPerformance: 0.6,
    maxLcpMs: 3500,
    maxTbtMs: 400,
    maxCls: 0.25,
  });
  assert.equal(relaxed.pass, true);
  assert.deepEqual(relaxed.findings, []);
});

test('extractLighthouseMetrics ignores non-finite and malformed values', () => {
  const metrics = extractLighthouseMetrics({
    categories: { performance: { score: 'fast' } },
    audits: { 'largest-contentful-paint': { numericValue: Infinity } },
  });
  assert.deepEqual(metrics, { performance: null, lcpMs: null, tbtMs: null, cls: null });
});
