import type { CoachReport, Category, Recurring, Run } from '../types.ts';

/** Below this many runs, a trend is noise, not a signal. */
const MIN_RUNS_FOR_CONFIDENCE = 4;

/** A rule must show up in at least this many distinct runs to be called recurring. */
const MIN_DISTINCT_RUNS = 2;

function categoryOf(ruleId: string): Category {
  if (ruleId.startsWith('SLOP-')) return 'slop';
  if (ruleId.startsWith('CONTRAST-') || ruleId.startsWith('HIT-')) return 'a11y';
  return 'system';
}

function mean(runs: Run[], ruleId: string): number {
  if (runs.length === 0) return 0;
  const sum = runs.reduce((acc, r) => acc + (r.counts[ruleId] ?? 0), 0);
  return sum / runs.length;
}

/**
 * The change between the first and second half of the runs.
 *
 * A rule absent from the first half has no baseline, so a percent change does not exist.
 * Reporting one — "+500%" because it went from zero to five — invents a statistic. The
 * direction is knowable; the percentage is not, and `null` says so.
 */
function changeFor(runs: Run[], ruleId: string): { changePct: number | null; trend: Recurring['trend'] } {
  const mid = Math.floor(runs.length / 2);
  const first = mean(runs.slice(0, mid), ruleId);
  const second = mean(runs.slice(mid), ruleId);

  if (first === 0) {
    if (second === 0) return { changePct: 0, trend: 'flat' };
    return { changePct: null, trend: 'worsening' };
  }

  const changePct = Math.round(((second - first) / first) * 100);
  if (changePct <= -10) return { changePct, trend: 'improving' };
  if (changePct >= 10) return { changePct, trend: 'worsening' };
  return { changePct, trend: 'flat' };
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Skill, not taste. Coach only ever looks at `history` (what the linter found) and
 * `decisions` (what the user overruled and why it was written down) — never
 * `.omd/taste/`, which records preferences that have no right answer.
 */
export function analyse(history: Run[], decisions: string[]): CoachReport {
  const confident = history.length >= MIN_RUNS_FOR_CONFIDENCE;

  const span = history.length === 0
    ? null
    : { from: history[0]!.ts, to: history[history.length - 1]!.ts };

  const ruleIds = new Set<string>();
  for (const run of history) for (const ruleId of Object.keys(run.counts)) ruleIds.add(ruleId);

  const recurring: Recurring[] = [];
  for (const ruleId of ruleIds) {
    const appearances = history.filter((r) => (r.counts[ruleId] ?? 0) > 0);
    if (appearances.length < MIN_DISTINCT_RUNS) continue;

    const total = history.reduce((acc, r) => acc + (r.counts[ruleId] ?? 0), 0);

    if (!confident) {
      recurring.push({
        rule: ruleId, category: categoryOf(ruleId), total, runs: appearances.length,
        trend: 'insufficient', changePct: null,
      });
      continue;
    }

    const { changePct, trend } = changeFor(history, ruleId);
    recurring.push({
      rule: ruleId, category: categoryOf(ruleId), total, runs: appearances.length,
      trend, changePct,
    });
  }

  recurring.sort((a, b) => b.total - a.total || byCodeUnit(a.rule, b.rule));

  // One decision is one overrule, however many times it names the rule. A decision that
  // mentions SLOP-GRADIENT in both its title and its reason was still a single choice.
  const overruleCounts = new Map<string, number>();
  for (const decision of decisions) {
    for (const rule of new Set(decision.match(/\bSLOP-[A-Z-]+\b/g) ?? [])) {
      overruleCounts.set(rule, (overruleCounts.get(rule) ?? 0) + 1);
    }
  }
  const overrules = [...overruleCounts.entries()]
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count || byCodeUnit(a.rule, b.rule));

  return { runs: history.length, span, recurring, overrules, confident };
}
