import * as v from './validation.ts';
import type { MetricKind } from './types.ts';
const { object: o, array: a, number: n, nonnegative: pos, integer: int, text: t, string: s, nullable: maybe, enumeration: en, boolean: b, box, rgba } = v;
const texts = a(t), nums = a(n), scroll = o({ width: pos, height: pos, clientWidth: pos, clientHeight: pos });
const clipped = a(o({ ancestor: t, sides: texts, amount: pos, scrollEscape: b }));
const tokens = a(o({ text: t, lines: a(int), split: b, oneSyllableTail: b }));
export const metricSchemas: Record<MetricKind, v.Validator> = {
  'type-ladder': o({ clusters: a(o({ minSize: pos, maxSize: pos, weight: n, families: texts, leading: a(v => v === 'normal' ? undefined : n(v)), nodeCount: int, graphemes: int, textArea: pos, viewportShare: pos, roles: texts, subjectIds: texts })) }),
  'text-minimum': o({ minimumByRole: a(o({ role: t, size: pos })), total: int, under12: int, from12To14: int, under12Area: pos, small: a(o({ subjectId: t, size: pos, role: t, control: maybe(t), excerpt: s, box })) }),
  'line-lengths': o({ subjects: a(o({ subjectId: t, role: t, script: en('hangul', 'latin', 'mixed'), lineCount: int, graphemes: a(int), widths: nums, em: nums, p50: n, p95: n, max: n, lastLineShare: maybe(n) })) }),
  'spacing-clusters': o({ clusters: a(o({ value: pos, count: int })), zeros: int, samples: a(o({ subjectId: t, property: t, value: n })) }),
  'spacing-rhythm': o({ groups: a(o({ parentId: t, subjectIds: texts, gaps: nums, overlaps: nums, status: en('measured', 'insufficient-samples'), median: maybe(n), mad: maybe(n), coefficientOfVariation: maybe(n), offClusterCount: maybe(int), separationRatio: maybe(n) })) }),
  'contrast-pair': o({ pairs: a(o({ subjectId: t, foreground: rgba, backdrop: maybe(rgba), chain: a(rgba), size: pos, weight: n, ratio: maybe(pos), threshold: pos, result: en('pass', 'fail', 'unmeasured', 'not-applicable'), reason: maybe(t) })) }),
  'salience-regions': o({ regions: a(o({ subjectId: t, score: pos, share: maybe(pos), areaShare: pos, centroid: o({ x: n, y: n }) })), regionCount: int, totalScore: pos, remainderShare: maybe(pos) }),
  'first-viewport-density': o({ graphemesPer10000: pos, textArea: pos, controlCount: int, controlArea: pos, mediaArea: pos, contentArea: pos, taskObjectCount: maybe(int), viewportArea: pos }),
  'empty-canvas': o({ emptyRatio: pos, canvasPaintShare: pos, method: en('rectangle-union'), gridStep: pos, samplingErrorBound: pos }),
  'canvas-color': o({ root: rgba, dominant: maybe(rgba), exactShare: pos, isTrueWhite: b, classification: en('neutral', 'tinted'), largestPanel: maybe(rgba) }),
  'accent-distribution': o({ clusters: a(o({ hue: n, pixelShare: pos, sampleCount: int, subjectIds: texts, role: en('unassigned', 'success', 'error', 'data-viz') })), gridStep: pos, unattributedShare: pos, samplingErrorBound: pos }),
  'clipping-overflow': o({ documentOverflowX: pos, subjects: a(o({ subjectId: t, control: b, position: t, scroll, clipped, visibleFraction: pos })) }),
  'control-word-wrap': o({ controls: a(o({ subjectId: t, tokens })), splitCount: int }),
  'cross-viewport-order': o({ pairs: a(o({ fromView: t, toView: t, matched: int, inversions: a(v.tuple(t, t)), normalizedInversions: pos, hidden: texts, introduced: texts, ambiguous: texts, domOrder: texts, visualOrder: texts, tabOrder: texts })) }),
  'contract-conformance': o({ observations: a(o({ role: t, property: t, subjectIds: texts, expected: s, actual: a(s), result: en('pass', 'mismatch', 'unmeasured', 'not-applicable'), field: t })), applicability: en('selected', 'missing', 'route-authorized') }),
};
export const coverageSchema = o({ status: en('complete', 'partial', 'unsupported'), measured: int, eligible: int, excluded: a(o({ subjectId: t, reason: t })) });
export const observedViewportSchema = o({ innerWidth: pos, innerHeight: pos, clientWidth: pos, clientHeight: pos, devicePixelRatio: pos, visualViewportScale: pos, scrollX: n, scrollY: n });
export const fontsSchema = o({ ready: b, failedFamilies: texts });
