import { canonicalJson } from '../ref/board-artifacts.ts';
import { piDigest, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { DESIGN_QUALITY_AXES, type DesignQualityAxis } from '../evidence/final-v2-design-quality.ts';

export const FIRST_RENDER_REVIEW_TRANSPORT = 'first-render-reviewer-transport-v2';
export const FIRST_RENDER_REVIEW_HANDBACK = 'first-render-reviewer-handback-v2';
export const FIRST_RENDER_REPAIR_SCOPES = ['direction', 'composition', 'type', 'copy', 'surface'] as const;
export const FIRST_RENDER_REVIEW_TASK = [
  'Inspect both anonymous fixed desktop and mobile images as an early design checkpoint, not a completed product.',
  'Judge purpose, dominant work object, visual hierarchy, typography, proportion, containment, and desirability.',
  'A quiet interface still needs deliberate visual craft; do not demand decoration or new product facts.',
  'Explicitly assess every supplied quality axis in each current viewport, citing its capture digest and visible condition. Clarity, alignment, functionality or fidelity cannot compensate for an unattractive or generic result.',
  'Human authorship means visible, context-shaped writing and deliberate visual choices, not a claim about who made the image. Distinguish purposeful simplicity from arbitrary spacing, poster-sized work objects, decorative counts and repeated generic components that displace the actual task.',
  'When selected-first-party-target images are supplied, compare each production viewport directly with its target: macro composition, relative scale, grouping, density, spacing rhythm and control treatment must survive unless the target itself needs reframing.',
  'A generic list/detail relationship or working controls do not prove visual fidelity. Localize any lost target character and require repair; reconcile only departures grounded in the supplied destination constraints.',
  'A selected target is not proof of beauty. If its direction or composition is the problem, request reframe rather than faithfully reproducing a weak target or prescribing another small spacing adjustment.',
  'Numeric diagnostics are advisory, not a desired verdict. Unbuilt downstream screens are outside this checkpoint.',
  'Return retain, revise, or reframe with localized observations, user consequences, and observable repair criteria.',
  'Give every failed or insufficient axis a localized finding and a repairScope. Direction or composition repairs require reframe; type, copy and surface repairs require revise.',
  'Resolve every supplied prior criterion against the new pixels with capture-bound observations. Preserve each unresolved identifier, axis, viewport and repair criterion; changed wording is not progress.',
  'For repair progress, compare current production with the repair-baseline images bound to that criterion in priorBaselines. Those are the original failed production pixels and remain fixed while the criterion is unresolved. A newly selected target is a fidelity reference, never a replacement repair baseline.',
  'Keep absolute current quality, current-target fidelity and progress from the failed baseline separate. A close match to a newly reframed target does not mean no repair occurred. Resolve a met prior criterion with the current evidence even if a different current defect needs a new localized finding.',
  'Do not infer source identity, authorship, implementation, or final approval. Return exactly the output contract.',
].join(' ');

export type FirstRenderFinding = Readonly<{
  id: string;
  viewport: 'desktop' | 'mobile' | 'both';
  axis: DesignQualityAxis;
  repairScope: (typeof FIRST_RENDER_REPAIR_SCOPES)[number];
  observation: string;
  consequence: string;
  repairCriterion: string;
}>;
export type FirstRenderCaptureBinding = Readonly<{
  viewport: 'desktop' | 'mobile'; captureSha256: string;
}>;
export type FirstRenderQualityAssessment = FirstRenderCaptureBinding & Readonly<{
  axis: DesignQualityAxis; verdict: 'pass' | 'fail' | 'insufficient';
  observation: string; consequence: string;
}>;
export type FirstRenderResolution = Readonly<{
  id: string;
  evidence: readonly (FirstRenderCaptureBinding & Readonly<{ observation: string }>)[];
}>;
export type FirstRenderReview = Readonly<{
  decision: 'retain' | 'revise' | 'reframe';
  qualityAssessments: readonly FirstRenderQualityAssessment[];
  findings: readonly FirstRenderFinding[];
  resolvedFindings: readonly FirstRenderResolution[];
}>;
export type FirstRenderReviewBindings = Readonly<{
  buildSha256: string;
  briefSha256: string;
  evidenceSha256: string;
  browserSha256: string;
  captureReportSha256: string;
  previousReviewSha256: string | null;
  candidateTargetSha256?: string;
}>;

export class FirstRenderReviewError extends Error {
  override readonly name = 'FirstRenderReviewError';
  constructor(reason: string) { super(`FIRST_RENDER_REVIEW_INVALID: ${reason}`); }
}
function fail(reason: string): never { throw new FirstRenderReviewError(reason); }
const exact = (value: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(value).sort().join() !== [...keys].sort().join()) fail('unexpected or missing fields');
};

export function parseFirstRenderCaptures(value: unknown): readonly FirstRenderCaptureBinding[] {
  if (!Array.isArray(value) || value.length !== 2) return fail('capture coverage');
  const captures = value.map((item): FirstRenderCaptureBinding => {
    const row = piRecord(item, 'first-render-capture-binding');
    exact(row, ['viewport', 'captureSha256']);
    if (row.viewport !== 'desktop' && row.viewport !== 'mobile') return fail('capture viewport');
    return { viewport: row.viewport, captureSha256: piDigest(row.captureSha256, 'capture-sha') };
  });
  if (new Set(captures.map(item => item.viewport)).size !== 2) return fail('capture coverage');
  return captures;
}

export function parseFirstRenderFindings(value: unknown): readonly FirstRenderFinding[] {
  if (!Array.isArray(value) || value.length > 12) return fail('findings');
  const findings = value.map((value): FirstRenderFinding => {
    const row = piRecord(value, 'first-render-finding');
    exact(row, ['id', 'axis', 'repairScope', 'viewport', 'observation', 'consequence', 'repairCriterion']);
    if (row.viewport !== 'desktop' && row.viewport !== 'mobile' && row.viewport !== 'both') return fail('finding viewport');
    const axis = DESIGN_QUALITY_AXES.find(axis => axis === row.axis);
    const repairScope = FIRST_RENDER_REPAIR_SCOPES.find(scope => scope === row.repairScope);
    if (axis === undefined || repairScope === undefined) return fail('finding axis or repair scope');
    return {
      id: piText(row.id, 'finding-id'), viewport: row.viewport, axis, repairScope,
      observation: piText(row.observation, 'finding-observation'),
      consequence: piText(row.consequence, 'finding-consequence'),
      repairCriterion: piText(row.repairCriterion, 'finding-repair-criterion'),
    };
  });
  if (new Set(findings.map(row => row.id)).size !== findings.length) return fail('duplicate finding');
  return findings;
}

export function parseFirstRenderReview(
  value: unknown, bindings: FirstRenderReviewBindings, prior: readonly FirstRenderFinding[],
  captures: readonly FirstRenderCaptureBinding[],
): FirstRenderReview {
  const input = piRecord(value, 'first-render-review');
  exact(input, ['schema', 'fixedBindings', 'decision', 'qualityAssessments', 'findings', 'resolvedFindings']);
  if (input.schema !== FIRST_RENDER_REVIEW_HANDBACK
    || canonicalJson(input.fixedBindings) !== canonicalJson(bindings)) return fail('evidence bindings changed');
  if (input.decision !== 'retain' && input.decision !== 'revise' && input.decision !== 'reframe') return fail('decision');
  const findings = parseFirstRenderFindings(input.findings);
  if (!Array.isArray(input.qualityAssessments) || input.qualityAssessments.length !== DESIGN_QUALITY_AXES.length * 2) return fail('quality coverage');
  const qualityAssessments = input.qualityAssessments.map((value): FirstRenderQualityAssessment => {
    const row = piRecord(value, 'first-render-quality');
    exact(row, ['axis', 'viewport', 'captureSha256', 'verdict', 'observation', 'consequence']);
    const axis = DESIGN_QUALITY_AXES.find(axis => axis === row.axis);
    const capture = captures.find(item => item.viewport === row.viewport && item.captureSha256 === row.captureSha256);
    if (axis === undefined || capture === undefined) return fail('quality capture binding');
    if (row.verdict !== 'pass' && row.verdict !== 'fail' && row.verdict !== 'insufficient') return fail('quality verdict');
    return { axis, ...capture, verdict: row.verdict, observation: piText(row.observation, 'quality-observation'),
      consequence: piText(row.consequence, 'quality-consequence') };
  });
  if (new Set(qualityAssessments.map(row => `${row.axis}/${row.viewport}`)).size !== qualityAssessments.length) return fail('quality coverage');
  for (const assessment of qualityAssessments) {
    const related = findings.filter(finding => finding.axis === assessment.axis
      && (finding.viewport === 'both' || finding.viewport === assessment.viewport));
    if ((assessment.verdict === 'pass') !== (related.length === 0)) return fail('decision contradicts quality findings');
  }
  if (!Array.isArray(input.resolvedFindings)) return fail('resolutions');
  const resolvedFindings = input.resolvedFindings.map((value): FirstRenderResolution => {
    const row = piRecord(value, 'first-render-resolution');
    exact(row, ['id', 'evidence']);
    const previous = prior.find(finding => finding.id === row.id);
    if (previous === undefined) return fail('prior criteria not reconciled');
    const viewports = previous.viewport === 'both' ? ['desktop', 'mobile'] : [previous.viewport];
    if (!Array.isArray(row.evidence) || row.evidence.length !== viewports.length) return fail('resolution coverage');
    const evidence = row.evidence.map(item => {
      const observation = piRecord(item, 'resolution-evidence');
      exact(observation, ['viewport', 'captureSha256', 'observation']);
      const capture = captures.find(item => item.viewport === observation.viewport && item.captureSha256 === observation.captureSha256);
      if (capture === undefined || !viewports.includes(capture.viewport)) return fail('resolution capture binding');
      return { ...capture, observation: piText(observation.observation, 'resolution-observation') };
    });
    if (new Set(evidence.map(item => item.viewport)).size !== evidence.length) return fail('resolution coverage');
    return { id: previous.id, evidence };
  });
  const resolvedFindingIds = resolvedFindings.map(row => row.id);
  const ids = findings.map(finding => finding.id), previous = prior.map(finding => finding.id);
  if (new Set(ids).size !== ids.length || new Set(resolvedFindingIds).size !== resolvedFindingIds.length
    || resolvedFindingIds.some(id => !previous.includes(id) || ids.includes(id))
    || previous.some(id => !ids.includes(id) && !resolvedFindingIds.includes(id))) return fail('prior criteria not reconciled');
  if ((input.decision === 'retain') !== (findings.length === 0)) return fail('decision contradicts findings');
  for (const finding of findings) {
    const previous = prior.find(item => item.id === finding.id);
    if (previous && (previous.axis !== finding.axis || previous.viewport !== finding.viewport
      || previous.repairCriterion !== finding.repairCriterion)) return fail('prior criterion changed instead of resolving it');
  }
  const reframe = findings.some(finding => finding.repairScope === 'direction' || finding.repairScope === 'composition');
  if ((input.decision === 'reframe') !== reframe) return fail('direction or composition repair requires reframe');
  for (const [key, value] of Object.entries(bindings)) {
    if (key !== 'previousReviewSha256' || value !== null) piDigest(value, `binding-${key}`);
  }
  return { decision: input.decision, qualityAssessments, findings, resolvedFindings };
}
