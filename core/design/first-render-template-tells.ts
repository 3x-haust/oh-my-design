import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSlopSource } from '../slop/index.ts';
import { normalize } from '../ir/normalize.ts';
import { readArtifact } from '../measure/inputs.ts';
import type { MeasuredIr, VisualMeasurement } from '../measure/types.ts';
import { check, loadRules } from '../rules/engine.ts';

const RULES_ROOT = fileURLToPath(new URL('../rules/builtin', import.meta.url));
const LANDING_RULES_ROOT = fileURLToPath(new URL('../rules/landing', import.meta.url));
const LIMIT = 24;
const A11Y_TELLS = /^(?:FOCUS-|A11Y-HEADING-|KO-(?:MIDWORD|DISPLAY)-)/;

export type FirstRenderTemplateTell = Readonly<{ viewId: string; rule: string; path: string; message: string }>;

/**
 * The builtin slop rules over the IR the first-render measurement already rendered — the machine-detectable
 * template tells (typed arrows as icons, emoji headings, uniform cards…) — with the focus, heading-order and
 * Korean wrapping rules and the source scan's candidates, handed to the early reviewer as advisory leads to
 * confirm or dismiss in the pixels, while the design can still change.
 */
export function firstRenderTemplateTells(root: string, measurement: VisualMeasurement, landing = false): readonly FirstRenderTemplateTell[] {
  // Slop tells, plus the focus, heading-order and Korean wrapping rules the first-render measurement does not cover,
  // and on a new landing the conventions of landing pages that would be wrong on a product screen.
  const rules = [...loadRules(RULES_ROOT).filter(rule => rule.category === 'slop' || A11Y_TELLS.test(rule.id)),
    ...(landing ? loadRules(LANDING_RULES_ROOT) : [])];
  const tells: FirstRenderTemplateTell[] = measurement.captures.flatMap(capture => {
    const { measurement: _measurement, ...raw } = JSON.parse(readArtifact(root, capture.ir.path).toString('utf8')) as MeasuredIr;
    return check(normalize(raw), rules).map(violation => ({
      viewId: capture.viewId, rule: violation.id, path: violation.path, message: violation.message,
    }));
  });
  // Source-only tells the pixels cannot show (a form that never submits, transition-all, the default font pair).
  const source = existsSync(join(root, 'src')) ? scanSlopSource(join(root, 'src')).candidates.map(candidate => ({
    viewId: 'source', rule: candidate.candidateId, path: `src/${candidate.path}:${candidate.line}`, message: candidate.reviewQuestion,
  })) : [];
  tells.push(...source);
  const unique = [...new Map(tells.map(tell => [`${tell.viewId}\u0000${tell.rule}\u0000${tell.message}`, tell])).values()];
  return unique.sort((a, b) => a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : a.viewId < b.viewId ? -1 : a.viewId > b.viewId ? 1 : 0)
    .slice(0, LIMIT);
}

/**
 * A measured tell that bears on a designer judgment: the reviewer may still find the judgment holds, but
 * not quietly; it writes what it saw in the pixels, so a measured excess cannot be waved through unread.
 */
const TELL_JUDGMENTS: Readonly<Record<string, string>> = {
  'SLOP-ANNOTATION-LOAD': 'subtract-until-it-points',
  'SLOP-NAV-LINK-ICON': 'icon-earns-its-place',
  'SLOP-TYPED-ARROW-ICON': 'icon-earns-its-place',
  'SLOP-PAPER-TONE': 'identity-from-the-real-artifact',
  'PAGE-HEADER-SCROLLS-AWAY': 'header-stays-in-reach',
  'SLOP-MIDDOT-META': 'subtract-until-it-points',
  'PAGE-PLACED-RASTER': 'feature-art-shows-the-product-at-work',
  'SLOP-SCREEN-WORDS': 'subtract-until-it-points',
};

/**
 * On a new landing the page-level judgments that decide whether it reads as designed — one point per screen,
 * an identity taken from the product, type and graphic composed together, and a level of at least considered —
 * are always answered in writing.
 */
const LANDING_JUDGMENTS = ['subtract-until-it-points', 'section-answers-the-visitor', 'identity-from-the-real-artifact', 'graphic-and-type-interlock',
  'page-reaches-considered'];

export function attestedJudgmentIds(tells: readonly FirstRenderTemplateTell[], judgmentIds: readonly string[], landing = false): string[] {
  return [...new Set([...tells.flatMap(tell => TELL_JUDGMENTS[tell.rule] ?? []), ...(landing ? LANDING_JUDGMENTS : [])])]
    .filter(id => judgmentIds.includes(id)).sort();
}
