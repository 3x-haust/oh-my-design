import { AXIS_METRICS, MeasurementIndex, type MeasuredAxis } from '../measure/citations.ts';
import * as v from '../measure/validation.ts';
import { digest } from '../measure/identity.ts';
export const MEASURED_DESIGN_QUALITY_SCHEMA = 'design-quality-contract-v2' as const;
export const MEASURED_DESIGN_QUALITY_AXES = Object.freeze(Object.keys(AXIS_METRICS) as MeasuredAxis[]);
export const MEASURED_DESIGN_QUALITY_FLOORS = Object.freeze({ typography: 3, spacingRhythm: 3, contrastColorRoles: 3, density: 3, hierarchy: 4, composition: 4, beautyDesirability: 4, domainSpecificity: 3, humanAuthorship: 3, usability: 3, responsiveCraft: 3 } satisfies Record<MeasuredAxis, 3 | 4>);
export type MeasuredEvidence = { observationSha256: string; captureSha256: string; viewId: string; state: string; regionSubjectIds: string[]; packetSha256: string; measurementIds: string[]; visibleCondition: string; userConsequence: string };
export type MeasuredAssessment = { axis: MeasuredAxis; verdict: 'GREEN' | 'RED'; score: number; crossViewport: 'preserved' | 'weakened' | 'contradicted'; criticalFailure: string | null; evidence: MeasuredEvidence[] };
export type MeasuredDesignQuality = { schema: typeof MEASURED_DESIGN_QUALITY_SCHEMA; axes: MeasuredAssessment[] };
export type MeasuredQualityContext = { index: MeasurementIndex; requiredViewIds: readonly string[]; policySha256: string; advisoryDispositionIds: readonly string[]; advisoryDispositionPolicy: 'separate-slop-review' | 'integrated-final-review'; bindings: readonly { observationSha256: string; captureSha256: string; packetSha256: string; viewId: string; state: string; browserZoom: 1 | 2 }[] };
export function parseMeasuredDesignQuality(input: unknown): MeasuredDesignQuality {
  const assessment = (value: unknown) => {
    v.object({ axis: v.enumeration(...MEASURED_DESIGN_QUALITY_AXES), verdict: v.enumeration('GREEN', 'RED'), score: v.enumeration(0, 1, 2, 3, 4), crossViewport: v.enumeration('preserved', 'weakened', 'contradicted'), criticalFailure: v.nullable(v.text), evidence: v.array(v.object({ observationSha256: v.sha, captureSha256: v.sha, viewId: v.text, state: v.text, regionSubjectIds: v.array(v.text), packetSha256: v.sha, measurementIds: v.array(v.pattern(/^vm1:[a-f0-9]{64}$/)), visibleCondition: v.text, userConsequence: v.text })) })(value);
  };
  v.object({ schema: v.enumeration(MEASURED_DESIGN_QUALITY_SCHEMA), axes: v.array(assessment) })(input);
  const c = input as MeasuredDesignQuality;
  if (c.axes.length !== MEASURED_DESIGN_QUALITY_AXES.length || c.axes.some((a, i) => a.axis !== MEASURED_DESIGN_QUALITY_AXES[i])) v.fail('all eleven independent axes are required in canonical order');
  for (const a of c.axes) {
    if (!a.evidence.length || a.evidence.length > 96) v.fail('bounded measured evidence is required');
    v.unique(a.evidence.map(e => `${e.packetSha256}:${e.viewId}:${e.state}`), 'axis evidence');
    for (const e of a.evidence) { v.unique(e.measurementIds, 'measurement citation'); v.unique(e.regionSubjectIds, 'region subject'); if (!e.measurementIds.length) v.fail('GREEN cannot cite prose instead of measurements'); }
    if (a.verdict === 'GREEN' && (a.score < MEASURED_DESIGN_QUALITY_FLOORS[a.axis] || a.crossViewport === 'contradicted' || a.criticalFailure !== null)) v.fail(`DESIGN_QUALITY_AXIS_RED:${a.axis}`);
  }
  return c;
}
/** Context is mandatory. Syntax and scores alone cannot authorize any new measured GREEN. */
export function assertMeasuredDesignQualityGreen(input: unknown, context: MeasuredQualityContext): MeasuredDesignQuality {
  const c = parseMeasuredDesignQuality(input);
  v.sha(context.policySha256);
  if (!(context.index instanceof MeasurementIndex) || !context.requiredViewIds.length) v.fail('trusted measured quality context required');
  for (const a of c.axes) {
    if (a.verdict !== 'GREEN') v.fail(`DESIGN_QUALITY_AXIS_RED:${a.axis}`);
    assertAxisCitations(a, context);
  }
  const uncited = uncitedViews(c.axes, context);
  if (uncited.length) v.fail(`required view/state not cited by any axis: ${uncited.join(', ')}`);
  return c;
}

/** Every required view/state is looked at: each must be cited by at least one axis. */
function uncitedViews(axes: MeasuredDesignQuality['axes'], context: MeasuredQualityContext): string[] {
  const required = new Set(context.requiredViewIds);
  for (const a of axes) for (const e of a.evidence) for (const view of context.index.packet(e.packetSha256).scope) required.add(view.id);
  return [...required].filter(id => !axes.some(a => a.evidence.some(e => e.viewId === id)));
}

/**
 * The citation half of a GREEN axis: the at-rest desktop and mobile views and any other view it bears on, cited with
 * authenticated captures and the measured inventories its axis needs; every required view is covered across axes. Checked while the reviewer can still correct an omission; RED axes are judgments, not
 * formats, and are left to publication.
 */
export function assertMeasuredCitations(input: unknown, context: MeasuredQualityContext): void {
  const axes = parseMeasuredDesignQuality(input).axes, green = axes.filter(a => a.verdict === 'GREEN');
  // Every gap at once, short enough to act on.
  const short = (id: string) => `${id.startsWith('mobile') ? 'mobile' : 'desktop'} ${id.includes(':outcome-') ? id.split(':outcome-')[1]!.slice(0, 8) : 'at rest'}`;
  const uncited = uncitedViews(axes, context);
  if (uncited.length) {
    v.fail(`every required view/state is cited by at least one axis. Not cited by any axis: ${uncited.map(short).join(', ')}. Add a `
      + 'row for each under the axis it bears on (its viewId, state, captureSha256, observationSha256 and packetSha256 come from the supplied '
      + 'observation bindings for that view)');
  }
  for (const a of green) assertAxisCitations(a, context);
}

function assertAxisCitations(a: MeasuredDesignQuality['axes'][number], context: MeasuredQualityContext): void {
  {
    for (const e of a.evidence) {
      const packet = context.index.packet(e.packetSha256), view = packet.scope.find(s => s.id === e.viewId), capture = packet.captures.find(s => s.viewId === e.viewId);
      if (packet.summary.deterministicVerdict !== 'PASS') v.fail('deterministic RED/incomplete scope cannot be overruled by GREEN');
      if (context.advisoryDispositionPolicy !== 'integrated-final-review'
        && packet.findings.some(f => f.severity === 'advisory' && f.viewIds.includes(e.viewId) && f.axes.includes(a.axis)
          && !context.advisoryDispositionIds.includes(f.id))) v.fail('advisory finding needs a validated scoped disposition before GREEN');
      if (!view || view.state !== e.state || capture?.capture.sha256 !== e.captureSha256 || !context.bindings.some(b => b.observationSha256 === e.observationSha256 && b.captureSha256 === e.captureSha256 && b.packetSha256 === e.packetSha256 && b.viewId === e.viewId && b.state === e.state && b.browserZoom === view.browserZoom)) v.fail('measurement citation does not join the authenticated observation capture/state/zoom');
      context.index.assertAxis(a.axis, e.viewId, e.measurementIds.map(measurementId => ({ packetSha256: e.packetSha256, measurementId })), e.regionSubjectIds);
    }
    const dimensions = a.evidence.map(e => context.index.packet(e.packetSha256).scope.find(v => v.id === e.viewId)!);
    if (!dimensions.some(v => v.state === 'initial' && v.viewport.width === 1280 && v.viewport.height === 900 && v.browserZoom === 1) || !dimensions.some(v => v.state === 'initial' && v.viewport.width === 390 && v.viewport.height === 844 && v.browserZoom === 1)) v.fail('baseline initial desktop/mobile evidence required');
  }
}
export function aggregateMeasuredDesignQuality(contracts: readonly MeasuredDesignQuality[], context: MeasuredQualityContext): MeasuredDesignQuality {
  if (!contracts.length) v.fail('reviewer quorum is empty');
  const checked = contracts.map(c => assertMeasuredDesignQualityGreen(c, context)), severity = { preserved: 0, weakened: 1, contradicted: 2 };
  const result: MeasuredDesignQuality = { schema: MEASURED_DESIGN_QUALITY_SCHEMA, axes: MEASURED_DESIGN_QUALITY_AXES.map((axis, i) => {
    const all = checked.map(c => c.axes[i]!), minimum = Math.min(...all.map(a => a.score)), selected = all.filter(a => a.score === minimum).sort((a, b) => digest(a.evidence) < digest(b.evidence) ? -1 : 1)[0]!;
    return { ...selected, axis, score: minimum, crossViewport: all.reduce<MeasuredAssessment['crossViewport']>((worst, a) => severity[a.crossViewport] > severity[worst] ? a.crossViewport : worst, 'preserved') };
  }) };
  return assertMeasuredDesignQualityGreen(result, context);
}
