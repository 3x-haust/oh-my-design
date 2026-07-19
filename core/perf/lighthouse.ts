/**
 * Performance gate over a Lighthouse JSON report.
 *
 * OMD does not bundle or run Lighthouse — the agent runs it (for example
 * `npx lighthouse <url> --output=json --output-path=.omd/.cache/lighthouse.json`
 * against the built page) and gates the report with `omd lighthouse <report.json>`.
 * This module is a pure decision core: given a report and a budget it reports a
 * pass/fail and the specific findings, so it is deterministic and testable without Chrome.
 */

export interface LighthouseBudget {
  /** Minimum Lighthouse performance category score (0..1). Default 0.9. */
  minPerformance?: number;
  /** Max Largest Contentful Paint in ms. Default 2500. */
  maxLcpMs?: number;
  /** Max Total Blocking Time in ms. Default 200. */
  maxTbtMs?: number;
  /** Max Cumulative Layout Shift (unitless). Default 0.1. */
  maxCls?: number;
}

export interface LighthouseMetrics {
  performance: number | null;
  lcpMs: number | null;
  tbtMs: number | null;
  cls: number | null;
}

export interface LighthouseGateResult {
  pass: boolean;
  metrics: LighthouseMetrics;
  budget: Required<LighthouseBudget>;
  findings: string[];
}

/** Core Web Vitals "good" thresholds plus a 90 performance floor. */
const DEFAULT_BUDGET: Required<LighthouseBudget> = {
  minPerformance: 0.9,
  maxLcpMs: 2500,
  maxTbtMs: 200,
  maxCls: 0.1,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const auditValue = (report: Record<string, unknown>, id: string): number | null => {
  const audits = report['audits'];
  if (!isRecord(audits)) return null;
  const entry = audits[id];
  if (!isRecord(entry)) return null;
  return finiteNumber(entry['numericValue']);
};

export function extractLighthouseMetrics(report: unknown): LighthouseMetrics {
  if (!isRecord(report)) return { performance: null, lcpMs: null, tbtMs: null, cls: null };
  const categories = report['categories'];
  const performanceCategory =
    isRecord(categories) && isRecord(categories['performance']) ? categories['performance'] : undefined;
  return {
    performance: performanceCategory ? finiteNumber(performanceCategory['score']) : null,
    lcpMs: auditValue(report, 'largest-contentful-paint'),
    tbtMs: auditValue(report, 'total-blocking-time'),
    cls: auditValue(report, 'cumulative-layout-shift'),
  };
}

export function evaluateLighthouse(report: unknown, budget: LighthouseBudget = {}): LighthouseGateResult {
  const resolved: Required<LighthouseBudget> = { ...DEFAULT_BUDGET, ...budget };
  const metrics = extractLighthouseMetrics(report);
  const findings: string[] = [];

  if (metrics.performance === null) {
    findings.push(
      'no performance category score in the report — run `npx lighthouse <url> --output=json` against the built page and gate its report',
    );
  } else if (metrics.performance < resolved.minPerformance) {
    findings.push(
      `performance ${Math.round(metrics.performance * 100)} is below the budget ${Math.round(resolved.minPerformance * 100)}`,
    );
  }
  if (metrics.lcpMs !== null && metrics.lcpMs > resolved.maxLcpMs) {
    findings.push(`LCP ${Math.round(metrics.lcpMs)}ms exceeds the ${resolved.maxLcpMs}ms budget`);
  }
  if (metrics.tbtMs !== null && metrics.tbtMs > resolved.maxTbtMs) {
    findings.push(`TBT ${Math.round(metrics.tbtMs)}ms exceeds the ${resolved.maxTbtMs}ms budget`);
  }
  if (metrics.cls !== null && metrics.cls > resolved.maxCls) {
    findings.push(`CLS ${metrics.cls.toFixed(3)} exceeds the ${resolved.maxCls} budget`);
  }

  return { pass: findings.length === 0, metrics, budget: resolved, findings };
}
