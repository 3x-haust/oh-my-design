import type { Invariants } from '../types.ts';

export interface DesignSignal { score: number; missing: string[] }

/** Below this, a page has made almost no visual decisions — a warning, not a gate. */
export const LOW_SIGNAL = 0.4;

const round = (value: number, dp: number): number => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

/**
 * Eight binary-ish component signals over an already-measured page. danluu.com has almost
 * no design — no radii, no shadows, no motion, no tokens — so as a *visual* reference it
 * teaches nothing; this catches that deterministically instead of relying on a model to notice.
 */
export function designSignal(inv: Invariants): DesignSignal {
  const checks: [string, boolean][] = [
    ['radius', inv.radiusLadder.length >= 2], // at least two materials
    ['elevation', inv.elevationLevels >= 1],
    ['type', inv.typeScale.length >= 3], // a deliberate scale, not browser default
    ['weights', inv.weightLadder.length >= 2], // weight used as hierarchy
    ['motion', inv.motionDurations.length >= 1],
    ['tokens', inv.tokenCoverage >= 0.2],
    ['spacing', inv.spacingLadder.length >= 4], // a scale, not incidental values
    ['padding', inv.paddingWeight >= 4], // someone spaced things on purpose
  ];

  const missing = checks.filter(([, pass]) => !pass).map(([name]) => name);
  const score = round(checks.reduce((sum, [, pass]) => sum + (pass ? 1 : 0), 0) / checks.length, 2);

  return { score, missing };
}
