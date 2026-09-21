// First-render gestalt critic.
//
// The existing final Eye checks many things after a page is already complete. That is too late for the
// failure shown by a real OMD run: the measured reference packet was coherent, but the first screen
// still had no clear reason to exist. A one-shot generator looked better because it optimised the
// whole viewport at once — sidebar, search, card weight, spacing, and type hierarchy — while OMD
// passed local observations downstream as if they were global rules.
//
// This critic is intentionally earlier and coarser. It asks whether the first render communicates
// the design hypothesis in two seconds, before detail polish can hide a bad composition:
//
//   - What is the dominant object?
//   - Are navigation and utility controls subordinate?
//   - Can the user compare the representative objects in one viewport?
//   - Does trust come from explicit evidence/state rather than austere styling or AI ornament?
//
// It is a diagnostic, not a pixel score. A screenshot cannot prove all of these from pixels alone, so
// callers supply the rendered text/landmark projection the browser already collected. The critic
// reports what is missing and the exact hypothesis it contradicts; it never invents a fix.

import { createHash } from 'node:crypto';
import type { DesignHypothesis } from './judgment.ts';

export const FIRST_RENDER_CRITIC_SCHEMA = 'first-render-gestalt-critic-v1' as const;

export type FirstRenderSurface = Readonly<{
  /** The visible viewport's main heading or purpose statement. */
  heading: string;
  /** Visible landmarks in reading order, e.g. sidebar, search, filter, benefit-card-grid. */
  landmarks: readonly string[];
  /** Representative content objects visibly repeated in the viewport. */
  repeatedObjects: readonly string[];
  /** Visible labels/states carrying trust or actionable status. */
  trustSignals: readonly string[];
  /** Text tokens/labels visible in the initial viewport, normalized by the browser adapter. */
  visibleText: readonly string[];
  /** Approximate share of visible landmark area, 0..1; optional when no geometry was measured. */
  dominantAreaShare?: number;
}>;

export type FirstRenderCriticFinding = Readonly<{
  id: 'PURPOSE_UNCLEAR' | 'DOMINANT_OBJECT_MISSING' | 'UTILITY_OVERRIDES_TASK' | 'COMPARISON_TOO_THIN' | 'TRUST_SIGNAL_MISSING' | 'HYPOTHESIS_UNPROVEN';
  severity: 'critical' | 'advisory';
  message: string;
  hypothesisField: keyof DesignHypothesis | 'none';
}>;

export type FirstRenderCriticReport = Readonly<{
  schema: typeof FIRST_RENDER_CRITIC_SCHEMA;
  verdict: 'revise' | 'retain';
  findings: readonly FirstRenderCriticFinding[];
  hypothesisSha256: string;
}>;

export class FirstRenderCriticError extends Error {
  override readonly name = 'FirstRenderCriticError';
  constructor(reason: string) { super(`first render critic input is invalid: ${reason}`); }
}

const fail = (reason: string): never => { throw new FirstRenderCriticError(reason); };
const clean = (value: unknown, label: string): string => typeof value === 'string' && value.trim() !== '' ? value.trim().toLowerCase() : fail(`${label} must be a non-empty string`);
const list = (value: unknown, label: string): readonly string[] => {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return Object.freeze((value as unknown[]).map((item, index) => clean(item, `${label}[${index}]`)));
};

export function parseFirstRenderSurface(value: unknown): FirstRenderSurface {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('surface must be an object');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ['heading', 'landmarks', 'repeatedObjects', 'trustSignals', 'visibleText', 'dominantAreaShare'].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail('surface has unknown or missing keys');
  const share = record.dominantAreaShare;
  if (typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > 1) fail('dominantAreaShare must be 0..1');
  const dominantAreaShare = share as number;
  return Object.freeze({
    heading: clean(record.heading, 'heading'),
    landmarks: list(record.landmarks, 'landmarks'),
    repeatedObjects: list(record.repeatedObjects, 'repeatedObjects'),
    trustSignals: list(record.trustSignals, 'trustSignals'),
    visibleText: list(record.visibleText, 'visibleText'),
    dominantAreaShare,
  });
}

const includesAny = (haystack: readonly string[], needles: readonly string[]): boolean => needles.some((needle) => haystack.some((item) => item.includes(needle.toLowerCase())));
const hypothesisSha256 = (hypothesis: DesignHypothesis): string => createHash('sha256').update(JSON.stringify(hypothesis)).digest('hex');

/**
 * Reads the first viewport against the hypothesis. Findings are deliberately categorical and
 * actionable: "card radius wrong" is not a gestalt diagnosis; "the dominant benefit object is absent"
 * is. Two-second communication is the anchor, not taste.
 */
export function critiqueFirstRender(hypothesis: DesignHypothesis, surfaceInput: unknown): FirstRenderCriticReport {
  const surface = parseFirstRenderSurface(surfaceInput);
  const findings: FirstRenderCriticFinding[] = [];
  const headingWords = hypothesis.twoSecondRead.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((word) => word.length > 2);
  const headingTokens = surface.heading.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((word) => word.length > 1);
  const headingClear = surface.heading.length > 0 && (
    headingWords.length === 0
    || includesAny([surface.heading], headingWords)
    || headingTokens.length >= 2
  );
  if (!headingClear) {
    findings.push(Object.freeze({
      id: 'PURPOSE_UNCLEAR', severity: 'critical', hypothesisField: 'twoSecondRead',
      message: `the first viewport heading "${surface.heading}" does not communicate the hypothesis' two-second read: "${hypothesis.twoSecondRead}". The page may be functional, but a stranger cannot tell what it is for quickly enough.`,
    }));
  }

  const dominantWords = hypothesis.dominantObject.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((word) => word.length > 2);
  const repeatedObjectWords = surface.repeatedObjects.flatMap((item) => item.split(/[^a-z0-9가-힣]+/).filter((word) => word.length > 2));
  const repeatedObjectCount = surface.repeatedObjects.length;
  // A browser projection may call the objects `benefit-card`, `혜택`, or simply `card`; the visual
  // evidence is repetition plus a meaningful dominant share, not one English token. This prevents
  // the critic from rejecting a good Korean render merely because its DOM projection used Korean.
  const dominantVisible = includesAny(surface.repeatedObjects, dominantWords)
    || repeatedObjectWords.some((word) => /card|benefit|혜택|지원금|급여|grant|aid/.test(word))
    || (repeatedObjectCount >= 2 && (surface.dominantAreaShare ?? 0) >= 0.25);
  if (!dominantVisible) {
    findings.push(Object.freeze({
      id: 'DOMINANT_OBJECT_MISSING', severity: 'critical', hypothesisField: 'dominantObject',
      message: `the hypothesis says "${hypothesis.dominantObject}" is dominant, but the first viewport shows no repeated object that names it. Composition is following the chrome instead of the task object.`,
    }));
  }

  const subordinate = hypothesis.subordinate.map((item) => item.toLowerCase());
  const sidebarOrUtility = surface.landmarks.filter((landmark) => /sidebar|nav|search|filter|utility|ai|assistant|settings/.test(landmark));
  const dominantShare = surface.dominantAreaShare ?? 0;
  const utilityAreaShare = Math.max(0, 1 - dominantShare);
  if (sidebarOrUtility.length > 0 && dominantShare < 0.25) {
    findings.push(Object.freeze({
      id: 'UTILITY_OVERRIDES_TASK', severity: 'critical', hypothesisField: 'subordinate',
      message: `${sidebarOrUtility.join(', ')} occupy an estimated utility share of ${utilityAreaShare.toFixed(2)}, contradicting the hypothesis that ${subordinate.join(', ') || 'navigation and utilities'} stay subordinate.`,
    }));
  }

  if (hypothesis.comparisonRequired === true && surface.repeatedObjects.length < 2) {
    findings.push(Object.freeze({
      id: 'COMPARISON_TOO_THIN', severity: 'advisory', hypothesisField: 'densityIntent',
      message: `only ${surface.repeatedObjects.length} representative object is visible in the first viewport. The hypothesis asks for comparison, but this screen cannot show enough candidates to compare.`,
    }));
  }

  if (surface.trustSignals.length === 0) {
    findings.push(Object.freeze({
      id: 'TRUST_SIGNAL_MISSING', severity: 'advisory', hypothesisField: 'trustSource',
      message: `the hypothesis says trust comes from "${hypothesis.trustSource}", but no visible status, evidence, provider, date, or action signal is present in the first viewport.`,
    }));
  }

  return Object.freeze({ schema: FIRST_RENDER_CRITIC_SCHEMA,
    verdict: findings.some(finding => finding.severity === 'critical') ? 'revise' : 'retain',
    findings: Object.freeze(findings), hypothesisSha256: hypothesisSha256(hypothesis) });
}

export function firstRenderCriticSha256(report: FirstRenderCriticReport): string {
  return createHash('sha256').update(JSON.stringify(report)).digest('hex');
}
