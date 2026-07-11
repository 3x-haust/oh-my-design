import type { Invariants } from '../types.ts';

/**
 * A cross-page consistency finding. Not a per-node violation — these have no
 * single node to anchor to. The `pages` array names every page involved.
 */
export interface SiteViolation {
  id: 'SITE-TOKEN-DRIFT' | 'SITE-LADDER-DRIFT';
  severity: 'warn';
  /** All page paths involved in the comparison. */
  pages: string[];
  message: string;
}

/**
 * One page's extracted data for site-level comparison.
 *
 * `invariants` must already be extracted (via extractInvariants in
 * core/ref/invariants.ts). Keeping the comparison logic pure — no Ir, no
 * browser — lets it be tested against synthetic fixtures without Playwright.
 *
 * `tokens` is the raw token map from RawIr.tokens (CSS custom property names
 * → values). Absent for pages loaded from pre-computed IR files that pre-date
 * the tokens field; treated as an empty set in that case.
 */
export interface SitePage {
  path: string;
  invariants: Invariants;
  tokens?: Record<string, string>;
}

/**
 * Cross-page consistency check. Pure function: no filesystem, no browser.
 *
 * SITE-LADDER-DRIFT fires when any of the three design ladders (type scale,
 * spacing, radius) has a step count that differs by more than one across pages.
 * A difference of one step is tolerated — a detail page may legitimately use
 * one fewer text size than the index. A difference of two or more means the
 * pages were built from different scales.
 *
 * SITE-TOKEN-DRIFT fires when token coverage varies by more than 0.3 across
 * pages. Token coverage is the fraction of tokenable nodes (fill, radius) that
 * cite a CSS custom property rather than an inline value. A page at 0.9 and
 * another at 0.1 were built from different design-system disciplines.
 *
 * Returns an empty array for a single page — a site has no cross-page
 * comparison to make.
 */
export function checkSite(pages: SitePage[]): SiteViolation[] {
  if (pages.length < 2) return [];

  const violations: SiteViolation[] = [];
  const allPaths = pages.map((p) => p.path);

  // ── Ladder drift ────────────────────────────────────────────────────────────

  const ladderChecks: Array<{ name: string; get: (inv: Invariants) => number[] }> = [
    { name: 'type scale', get: (inv) => inv.typeScale },
    { name: 'spacing ladder', get: (inv) => inv.spacingLadder },
    { name: 'radius ladder', get: (inv) => inv.radiusLadder },
  ];

  for (const { name, get } of ladderChecks) {
    const entries = pages.map((p) => ({ path: p.path, steps: get(p.invariants).length }));
    const stepCounts = entries.map((e) => e.steps);
    const min = Math.min(...stepCounts);
    const max = Math.max(...stepCounts);

    if (max - min > 1) {
      const detail = entries.map((e) => `${e.path}: ${e.steps}`).join(', ');
      violations.push({
        id: 'SITE-LADDER-DRIFT',
        severity: 'warn',
        pages: allPaths,
        message: `${name} step count disagrees across pages (${detail})`,
      });
    }
  }

  // ── Token-coverage drift ────────────────────────────────────────────────────

  const coverages = pages.map((p) => p.invariants.tokenCoverage);
  const minCoverage = Math.min(...coverages);
  const maxCoverage = Math.max(...coverages);

  // Round to 4dp before comparing to avoid 0.9 - 0.6 = 0.30000000000000004 false-positives.
  if (Math.round((maxCoverage - minCoverage) * 10000) / 10000 > 0.3) {
    const detail = pages
      .map((p) => `${p.path}: ${p.invariants.tokenCoverage.toFixed(2)}`)
      .join(', ');
    violations.push({
      id: 'SITE-TOKEN-DRIFT',
      severity: 'warn',
      pages: allPaths,
      message: `token coverage varies by ${(maxCoverage - minCoverage).toFixed(2)} across pages (${detail})`,
    });
  }

  return violations;
}
