import { canonicalJson } from '../ref/board-artifacts.ts';
import { piDigest, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { DESIGN_QUALITY_AXES, type DesignQualityAxis } from '../evidence/final-v2-design-quality.ts';
import { parseReferenceComparisons, type FirstRenderReferenceCapture, type FirstRenderReferenceComparison } from './first-render-reference-comparison.ts';
import {
  REVIEWER_ITERATION_DISCIPLINE_CHECKLIST,
  WORDS_TYPE_FLOW_REVIEW_CHECKLIST,
} from '../runtime/reviewer-task-checklist.ts';

export const FIRST_RENDER_REVIEW_TRANSPORT = 'first-render-reviewer-transport-v3';
export const FIRST_RENDER_REVIEW_HANDBACK = 'first-render-reviewer-handback-v5';
export const LEGACY_FIRST_RENDER_REVIEW_HANDBACK_V7 = 'first-render-reviewer-handback-v4';
export const LEGACY_FIRST_RENDER_REVIEW_HANDBACK_V6 = 'first-render-reviewer-handback-v4';
export const LEGACY_FIRST_RENDER_REVIEW_HANDBACK = 'first-render-reviewer-handback-v3';
export const FIRST_RENDER_REPAIR_SCOPES = ['direction', 'composition', 'type', 'copy', 'surface'] as const;
const FIRST_RENDER_VISUAL_TASK = [
  'Inspect both anonymous fixed desktop and mobile images as an early design checkpoint, not a completed product.',
  'Judge purpose, dominant work object, visual hierarchy, typography, proportion, containment, and desirability.',
  'A quiet interface still needs deliberate visual craft; do not demand decoration or new product facts.',
  'Judge icons, typography, controls and surrounding surfaces as one visual system: optical scale, weight, silhouettes, density and containment should agree. Uniform generic strokes or repeated rounded containers are not automatically coherent craft; neither are filled icons or decorative variety automatically better. Localize the visible mismatch rather than prescribing an icon-library swap or unrequested features.',
  'Explicitly assess every supplied quality axis in each current viewport, citing its capture digest and visible condition. Clarity, alignment, functionality or fidelity cannot compensate for an unattractive or generic result.',
  'Human authorship means visible, context-shaped writing and deliberate visual choices, not a claim about who made the image. Distinguish purposeful simplicity from arbitrary spacing, poster-sized work objects, decorative counts and repeated generic components that displace the actual task.',
  'When selected-first-party-target images are supplied, compare each production viewport directly with its target: macro composition, relative scale, grouping, density, spacing rhythm and control treatment must survive unless the target itself needs reframing.',
  'A generic list/detail relationship or working controls do not prove visual fidelity. Localize any lost target character and require repair; reconcile only departures grounded in the supplied destination constraints.',
  'A selected target is not proof of beauty. If its direction or composition is the problem, request reframe rather than faithfully reproducing a weak target or prescribing another small spacing adjustment.',
].join(' ');
const LEGACY_CONSULTED_ORIGINAL_TASK = 'Consulted-external-original images are reported comparison material, not approved references, first-party targets or rejected output baselines. Independently describe the primary original visual identity before comparing production: dominant image/type relationships, macro proportions, hierarchy, density and visible control craft. A shared motif such as offset pictures is not enough. Localize lost character and require reframe when composition or direction is lost. Preserve explicit destination constraints without treating unrelated departures as required. Do not infer source mobile behavior, hidden states, product capabilities or human approval from an original. If no originals are supplied, do not claim external-reference fidelity.';
const FIRST_RENDER_EVIDENCE_TASK = [
  'Numeric diagnostics are advisory, not a desired verdict. Unbuilt downstream screens are outside this checkpoint.',
  'Return retain, revise, or reframe with localized observations, user consequences, and observable repair criteria.',
  'Give every failed or insufficient axis a localized finding and a repairScope. Direction or composition repairs require reframe; type, copy and surface repairs require revise.',
  'Resolve every supplied prior criterion against the new pixels with capture-bound observations. Preserve each unresolved identifier, axis, viewport and repair criterion; changed wording is not progress.',
  'For repair progress, compare current production with the repair-baseline images bound to that criterion in priorBaselines. Those are the original failed production pixels and remain fixed while the criterion is unresolved. A newly selected target is a fidelity reference, never a replacement repair baseline.',
  'Keep absolute current quality, current-target fidelity and progress from the failed baseline separate. A close match to a newly reframed target does not mean no repair occurred. Resolve a met prior criterion with the current evidence even if a different current defect needs a new localized finding.',
  'When reported-feedback-baseline images are supplied, compare their whole visual system with current pixels for the matching viewport/state. They are reported comparison material, not references, verified human ratings or approved targets. In quality observations cite both digests and distinguish materially changed, substantially same, or uncertain movement. Fewer panels, lower density or removed decoration alone do not establish improvement. A substantially unchanged or uncertain rejected visual system requires a localized finding and reframe; material change still must pass absolute current quality independently. Do not infer why a person rejected an image from these pixels.',
  'Do not infer source identity, authorship, implementation, or final approval. Return exactly the output contract.',
].join(' ');
export const LEGACY_FIRST_RENDER_REVIEW_TASK = [
  FIRST_RENDER_VISUAL_TASK, LEGACY_CONSULTED_ORIGINAL_TASK, FIRST_RENDER_EVIDENCE_TASK,
].join(' ');
export const LEGACY_FIRST_RENDER_REVIEW_TASK_V4 = LEGACY_FIRST_RENDER_REVIEW_TASK + ' '
  + 'For each primary consulted original, complete every supplied referenceComparisons binding. Describe its whole sourceIdentity before evaluating the current production viewport. Assess actual typography (family character, weight, scale and line rhythm), macro proportions, grouping, density and control anatomy, not merely list/detail structure. Report preservedTraits and every material departure; distinguish destination-required departures from invented restyling. A desktop source can inform visual character on mobile but does not prove its responsive behavior. Pass only when the visible source system is recognizably reproduced within explicit destination constraints; fail or insufficient requires current localized findingIds and cannot retain. Comparison-only means no source admission or human approval, not permission to ignore fidelity. Supplemental references have limited jobs and do not override the primary. Keep this comparison separate from absolute beauty and repair progress.'
  + 'Make repair criteria describe the visible content relationship that must change and the task facts or working relationships that must survive, rather than prescribe a cosmetic recipe. For example, require a price, its billing unit and the corresponding plan action to remain clearly associated and comparable, not a particular font size, card count or accent. Distinguish the observed failure from a suspected cause; do not require a wholesale rewrite for a local defect or accept token polish when the composition is the failure. Judge the integrated current pixels after repair, not effort, novelty or an isolated attractive component; do not infer business impact from a visual preference.';
export const LEGACY_FIRST_RENDER_REVIEW_TASK_V5 =
  `${LEGACY_FIRST_RENDER_REVIEW_TASK_V4} ${WORDS_TYPE_FLOW_REVIEW_CHECKLIST}`;
export const LEGACY_FIRST_RENDER_REVIEW_TASK_V6 =
  `${LEGACY_FIRST_RENDER_REVIEW_TASK_V5} ${REVIEWER_ITERATION_DISCIPLINE_CHECKLIST} `
  + 'Designer-source-frame images and designerCases are attributable worked examples, not destination visual references, target renders, evidence of human approval or source instructions. Inspect the native caption cues and whole frames, including the original task and counterexamples. Analyst notes are separate interpretations, not quotations. Use an applicable decision to diagnose the current content relationship; do not demand the teacher example layout, copy its assets or infer unseen outcomes. Judge the current whole product independently. The ordinary current quality and reference-comparison requirements remain unchanged.';
export const LEGACY_FIRST_RENDER_REVIEW_TASK_V7 = [
  FIRST_RENDER_VISUAL_TASK,
  FIRST_RENDER_EVIDENCE_TASK,
  WORDS_TYPE_FLOW_REVIEW_CHECKLIST,
  REVIEWER_ITERATION_DISCIPLINE_CHECKLIST,
  'Resolve the role of each original from the actual request and its provenance before judging correspondence. A requested reproduction or user-designated delivery target requires faithful visual-system transfer. A reference independently discovered to design a new product is study material, not an instruction to recreate that brand or page. The presence of a primary reference alone does not select reproduction. Do not infer the role from keywords or the maker calling a source primary.',
  'Complete every supplied referenceComparisons binding. Describe the actual whole sourceIdentity, then use preservedTraits and departures to explain which visible relationships transfer to this task and why. For a reproduction, judge source typography, proportions, grouping, density and complete control anatomy against the target, allowing only grounded destination constraints. For a new product, judge whether the learned relationships support a coherent design for the actual content and task; literal source resemblance is neither required nor sufficient. Familiar motifs pasted onto a generic form fail, as does an unrelated restyle justified only by novelty. Do not demand difference for its own sake, invent business differentiation, or accept arbitrary departures. Failed or insufficient correspondence requires localized findingIds and cannot retain. A desktop original does not establish unseen mobile behavior or hidden states.',
  'Judge the product as one authored visual system across the supplied desktop/mobile screens and states. Typography, image treatment, shape, weight, spacing and emphasis need deliberate role relationships. Different roles may have different silhouettes; equal corner radii everywhere do not prove coherence. A locally attractive control, copied palette, recognizable artwork or improved task clarity cannot compensate for an incoherent or undesirable whole. Localize the broken relationship and its consequence rather than prescribe a universal shape, brand or component library.',
  'Repair criteria must identify the content relationship to change and the facts or working relationships to preserve. Separate an observed failure from a suspected cause. Recompose when token polish preserves the cause, but do not require a wholesale rewrite for a local defect. Assess the current whole after repair, not effort, an isolated component or imagined business outcomes.',
  'Designer-source-frame images and designerCases are worked decisions, not destination targets, permissions, human approval or instructions. Inspect the native words with their actual situation and whole frames; analyst notes are interpretations. State which reasoning applies and its limits. A purpose/CTA case alone does not establish an entire visual direction. Do not import the teacher layout or assets, infer unseen outcomes, or claim that receiving a case proves designer judgment.',
].join(' ');
export const FIRST_RENDER_REVIEW_TASK = `${LEGACY_FIRST_RENDER_REVIEW_TASK_V7} `
  + 'designerJudgments are questions professional designers ask when critiquing real work. Answer every supplied judgment once in judgmentChecks against the current pixels: not-applicable when its look situation is absent from these screens or its notWhen condition holds; holds when the situation is present and the screens already satisfy its ask; violated when present and failing. A violated judgment cites the current findingIds that localize it as a content relationship to change and preserve; the finding must stand on its own observation and consequence, not on the card text. Judgments diagnose; they are not style rules, quotas or reasons to add decoration. Never demand a move its notWhen excludes, and do not invent a violation to show diligence or mark a visible failure not-applicable to keep a retain. Keep checks short: a holds or not-applicable check sets viewport and observation to null; only a violated check names its viewport and observation, and its detail belongs to its findings. A judgment listed in attestedJudgmentIds is answered in writing whatever the verdict: name its viewport and say what you saw; when a templateTell bears on it, answer holds only when the pixels contradict the tell. '
  + 'designBrief, when supplied, is the maker\'s own plan for a new surface: audience, the visitor\'s questions, one message, a section per question, what was cut and why, and a concept from the product\'s material. Judge whether the rendered page leaves that message first, whether each section answers its question, and whether cut material came back as labels, captions or extra sections; a page that drifts from its brief is a finding. Apply its competitor test to the pixels: with the nearest competitor\'s name on the page, would it still work? Walk the entry as each of its personas: what they believe after five seconds, whether a deal-breaker shows, and whether the hero gives the proof its heroProof promised. The brief is a plan, not approval or a style rule. '
  + 'When motion and a motion-contact-sheet are supplied, they sample the same build loading and scrolling at desktop size: which element moves first, beats and staggers, easing, triggered and scroll-linked groups, pinned content, layout jumps and a reduced-motion pass. Still captures cannot show motion, so judge choreography, and motion judgments, from that observation within its sampling limits. Absent or uniform motion is not a defect by itself; judge it against the task context and the applicable judgments. Motion a visitor would not notice (a few short fades of a few pixels) is absent motion: when the task asks for motion, or the consulted references visibly stage their content on load or scroll, raise it as a finding naming what should move and why. Content left invisible under reduced motion is a usability failure. Do not demand motion the task does not call for or claim smoothness or frame rate the samples cannot show. '
  + 'scroll-section renders are full-size desktop frames of the same build scrolled below the entry: judge below-the-fold content and graphics from them. Bind such a finding to the desktop viewport and name its scroll position; resolve it from the current section frames rather than the unchanged entry capture, and judge its progress against the previous-scroll-section frames of the previous iteration at the nearest scroll position. Never raise or keep a finding about content readable only in the contact-sheet thumbnails. '
  + 'pageIdeas, when supplied, are the maker\'s own generated drafts of sections, made before building to settle the composition: ideation that never ships and is not a target or approval. Compare the build with them only to catch what was lost on the way (hierarchy, scale, depth, a proof shrunk to a thumbnail); the build may depart from a draft and may be better. Never demand pixel matching, a draft\'s invented details or its rendered text. '
  + 'When the previous review retained the page, any progress verdict other than regressed (same, improved, different-not-better) keeps it retained; only a change that made something worse can withdraw that, and then progress is regressed, with findings localizing what got worse. Progress covers everything that changed, including the motion observation and the sections below the entry, not only the two fixed captures. '
  + 'unchangedSinceRetainedReview, when supplied, says both fixed captures are pixel-identical to a review that retained them: keep that review\'s passing assessments for those captures and retain unless something that did change (the motion observation, scroll-section frames) newly fails; a fresh look at the same pixels is not new evidence. '
  + 'A repair criterion names a change the next captures will show, never a report, test or verification the maker cannot put in the pixels; when a number decides it (contrast, size), measurementDiagnostics carries the measurement. Resolve a criterion once the current pixels meet it; keeping it open for missing paperwork stalls the loop on a fixed defect. '
  + 'Advisory measurementDiagnostics are leads in the same way. SMALL_TEXT_DOMINANT, TEXT_UNDER_12 and low contrast on text a visitor must read mean the page reads as gray fine print at normal distance and in a reduced view of the whole page, however refined it looks at full size: confirm it in the pixels and raise a typography finding naming the roles that need their reading size or contrast back, or dismiss it when the small text is genuinely incidental (legal lines, footnotes). '
  + 'When the request names a device (a mobile interface, a phone app screen, a watch face), the desktop capture must still present that device interface, at its width centred or in a quiet frame; a layout recomposed into desktop columns the request did not ask for is a task-fit finding. A generic requirement elsewhere in the request (responsive, mobile-friendly, works on every screen) asks that interface to adapt; it does not turn a named device into a desktop product. '
  + 'templateTells are machine-detected leads: template patterns, focus, heading-order and Korean wrapping problems in the rendered structure, such as a typed arrow standing in for an icon, and source-only candidates (viewId source) such as a form that never submits. Confirm each in the pixels and treat a confirmed one as a visible craft or authorship defect with a localized finding; dismiss one the pixels contradict. They are leads, not verdicts or a checklist.';

export function firstRenderReviewTaskForSchema(schema: string): string | null {
  if (schema === 'first-render-review-v3') return LEGACY_FIRST_RENDER_REVIEW_TASK;
  if (schema === 'first-render-review-v4') return LEGACY_FIRST_RENDER_REVIEW_TASK_V4;
  if (schema === 'first-render-review-v5') return LEGACY_FIRST_RENDER_REVIEW_TASK_V5;
  if (schema === 'first-render-review-v6') return LEGACY_FIRST_RENDER_REVIEW_TASK_V6;
  if (schema === 'first-render-review-v7') return LEGACY_FIRST_RENDER_REVIEW_TASK_V7;
  if (schema === 'first-render-review-v8') return FIRST_RENDER_REVIEW_TASK;
  return null;
}

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
export type FirstRenderProgress = Readonly<{
  verdict: 'improved' | 'same' | 'regressed' | 'different-not-better';
  comparisons: readonly Readonly<{
    viewport: 'desktop' | 'mobile';
    previousCaptureSha256: string;
    currentCaptureSha256: string;
    observation: string;
  }>[];
  findingIds: readonly string[];
}>;
export const JUDGMENT_CHECK_VERDICTS = ['not-applicable', 'holds', 'violated'] as const;
export type FirstRenderJudgmentCheck = Readonly<{
  judgmentId: string;
  verdict: (typeof JUDGMENT_CHECK_VERDICTS)[number];
  viewport: 'desktop' | 'mobile' | 'both' | null;
  observation: string | null;
  findingIds: readonly string[];
}>;
export type FirstRenderReview = Readonly<{
  decision: 'retain' | 'revise' | 'reframe';
  qualityAssessments: readonly FirstRenderQualityAssessment[];
  findings: readonly FirstRenderFinding[];
  resolvedFindings: readonly FirstRenderResolution[];
  progress: FirstRenderProgress | null;
  referenceComparisons?: readonly FirstRenderReferenceComparison[];
  judgmentChecks?: readonly FirstRenderJudgmentCheck[];
}>;
export type FirstRenderReviewBindings = Readonly<{
  buildSha256: string;
  briefSha256: string;
  evidenceSha256: string;
  browserSha256: string;
  captureReportSha256: string;
  previousReviewSha256: string | null;
  candidateTargetSha256?: string;
  reportedFeedbackSha256?: string;
  consultedReferencesSha256?: string;
  designerCasesSha256?: string;
  designerJudgmentsSha256?: string;
}>;

export class FirstRenderReviewError extends Error {
  override readonly name = 'FirstRenderReviewError';
  constructor(reason: string) { super(`FIRST_RENDER_REVIEW_INVALID: ${reason}`); }
}
function fail(reason: string): never { throw new FirstRenderReviewError(reason); }
const PROGRESS_COVERAGE = 'progress capture coverage: progress.comparisons needs exactly two rows, one desktop and one mobile, copied from the responseTemplate; previous scroll-section frames are context, not comparison rows';
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

/** Every supplied judgment is answered once; a violation must point at a current localized finding. */
export function parseJudgmentChecks(value: unknown, judgmentIds: readonly string[],
  findings: readonly FirstRenderFinding[], attested: readonly string[] = []): readonly FirstRenderJudgmentCheck[] {
  if (!Array.isArray(value) || value.length !== judgmentIds.length) return fail('judgment check coverage');
  const checks = value.map((item): FirstRenderJudgmentCheck => {
    const row = piRecord(item, 'first-render-judgment-check');
    exact(row, ['judgmentId', 'verdict', 'viewport', 'observation', 'findingIds']);
    if (typeof row.judgmentId !== 'string' || !judgmentIds.includes(row.judgmentId)) return fail('judgment check coverage');
    const verdict = JUDGMENT_CHECK_VERDICTS.find(verdict => verdict === row.verdict);
    if (verdict === undefined) return fail('judgment check verdict');
    // Only a violated judgment needs its place and observation; the detail lives in its findings.
    // An attested judgment answered without a note is still an answer; voiding the whole review for it reruns minutes of
    // review for nothing, so a non-violated attested check with no viewport and no observation is read as a quiet one.
    const unwritten = verdict !== 'violated' && row.viewport === null && (row.observation === null || row.observation === '');
    const quiet = verdict !== 'violated' && (!attested.includes(row.judgmentId) || unwritten);
    const attestedNote = attested.includes(row.judgmentId) ? ` (${row.judgmentId} is in attestedJudgmentIds: name its viewport and write what you saw)` : '';
    // A written observation without a viewport speaks for the page as a whole; rejecting it would rerun a whole review.
    const observed = typeof row.observation === 'string' && row.observation.trim() !== '';
    const viewport = row.viewport === null && !quiet && observed ? 'both' : row.viewport;
    if (viewport !== 'desktop' && viewport !== 'mobile' && viewport !== 'both'
      && !(quiet && viewport === null)) return fail(`judgment check viewport${attestedNote}`);
    if (!quiet && (typeof row.observation !== 'string' || !row.observation.trim())) return fail(`judgment check observation${attestedNote}`);
    const findingIds = row.findingIds;
    if (!Array.isArray(findingIds) || findingIds.some(id => typeof id !== 'string')
      || new Set(findingIds).size !== findingIds.length
      || findingIds.some(id => !findings.some(finding => finding.id === id))
      || (verdict === 'violated') !== (findingIds.length > 0)) return fail('judgment check finding binding');
    return { judgmentId: row.judgmentId, verdict, viewport: viewport as FirstRenderJudgmentCheck['viewport'],
      observation: quiet && (row.observation === null || row.observation === '') ? null : piText(row.observation, 'judgment-check-observation'),
      findingIds: [...findingIds] as string[] };
  });
  if (new Set(checks.map(check => check.judgmentId)).size !== checks.length) return fail('judgment check coverage');
  return checks;
}

export function parseFirstRenderReview(
  value: unknown, bindings: FirstRenderReviewBindings, prior: readonly FirstRenderFinding[],
  captures: readonly FirstRenderCaptureBinding[],
  references?: readonly FirstRenderReferenceCapture[],
  legacy = false,
  previousCaptures?: readonly FirstRenderCaptureBinding[],
  expectedSchema = legacy ? 'first-render-reviewer-handback-v2' : FIRST_RENDER_REVIEW_HANDBACK,
  judgmentIds?: readonly string[],
  attestedJudgmentIds?: readonly string[],
  previousDecision?: FirstRenderReview['decision'],
): FirstRenderReview {
  const input = piRecord(value, 'first-render-review');
  const comparisonRequired = !legacy && bindings.consultedReferencesSha256 !== undefined;
  const judgmentsRequired = bindings.designerJudgmentsSha256 !== undefined;
  const progressRequired = previousCaptures !== undefined;
  if (comparisonRequired && input.referenceComparisons === undefined) return fail('reference comparison coverage');
  if (judgmentsRequired && input.judgmentChecks === undefined) return fail('judgment check coverage');
  exact(input, ['schema', 'fixedBindings', 'decision', 'qualityAssessments', 'findings', 'resolvedFindings',
    ...(progressRequired ? ['progress'] : []),
    ...(comparisonRequired ? ['referenceComparisons'] : []),
    ...(judgmentsRequired ? ['judgmentChecks'] : [])]);
  if (input.schema !== expectedSchema
    || canonicalJson(input.fixedBindings) !== canonicalJson(bindings)) return fail('evidence bindings changed');
  if (input.decision !== 'retain' && input.decision !== 'revise' && input.decision !== 'reframe') return fail('decision');
  const findings = parseFirstRenderFindings(input.findings);
  if (comparisonRequired && references === undefined) return fail('reference comparison source bindings');
  const referenceComparisons = comparisonRequired
    ? parseReferenceComparisons(input.referenceComparisons, references ?? [], captures, findings) : undefined;
  if (judgmentsRequired && judgmentIds === undefined) return fail('judgment check source bindings');
  const judgmentChecks = judgmentsRequired ? parseJudgmentChecks(input.judgmentChecks, judgmentIds ?? [], findings, attestedJudgmentIds) : undefined;
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
    const coverage = `resolution coverage: ${previous.id} needs exactly one evidence row for each of ${viewports.join(' and ')}`;
    if (!Array.isArray(row.evidence) || row.evidence.length !== viewports.length) return fail(coverage);
    const evidence = row.evidence.map(item => {
      const observation = piRecord(item, 'resolution-evidence');
      exact(observation, ['viewport', 'captureSha256', 'observation']);
      const capture = captures.find(item => item.viewport === observation.viewport && item.captureSha256 === observation.captureSha256);
      if (capture === undefined || !viewports.includes(capture.viewport)) return fail('resolution capture binding');
      return { ...capture, observation: piText(observation.observation, 'resolution-observation') };
    });
    if (new Set(evidence.map(item => item.viewport)).size !== evidence.length) return fail(coverage);
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
  const progress = progressRequired ? (() => {
    const row = piRecord(input.progress, 'first-render-progress');
    exact(row, ['verdict', 'comparisons', 'findingIds']);
    if (row.verdict !== 'improved' && row.verdict !== 'same' && row.verdict !== 'regressed'
      && row.verdict !== 'different-not-better') return fail('progress verdict');
    const listed: unknown[] = Array.isArray(row.comparisons) ? row.comparisons : [];
    if (listed.length < 2) return fail(PROGRESS_COVERAGE);
    // Extra rows comparing scroll-section frames are context the reviewer volunteered; keep the one row per fixed
    // viewport capture rather than voiding the whole review.
    const binds = (value: unknown, viewport: 'desktop' | 'mobile'): boolean => {
      const comparison = value as Record<string, unknown>;
      return comparison?.viewport === viewport
        && captures.some(capture => capture.viewport === viewport && capture.captureSha256 === comparison.currentCaptureSha256)
        && previousCaptures.some(capture => capture.viewport === viewport && capture.captureSha256 === comparison.previousCaptureSha256);
    };
    const rows = listed.length === 2 ? listed
      : (['desktop', 'mobile'] as const).flatMap(viewport => listed.filter(value => binds(value, viewport)).slice(0, 1));
    if (rows.length !== 2) return fail(PROGRESS_COVERAGE);
    const comparisons = rows.map((value: unknown) => {
      const comparison = piRecord(value, 'first-render-progress-comparison');
      exact(comparison, ['viewport', 'previousCaptureSha256', 'currentCaptureSha256', 'observation']);
      const current = captures.find(capture => capture.viewport === comparison.viewport
        && capture.captureSha256 === comparison.currentCaptureSha256);
      const previous = previousCaptures.find(capture => capture.viewport === comparison.viewport
        && capture.captureSha256 === comparison.previousCaptureSha256);
      if (current === undefined || previous === undefined) return fail('progress capture binding');
      return {
        viewport: current.viewport,
        previousCaptureSha256: previous.captureSha256,
        currentCaptureSha256: current.captureSha256,
        observation: piText(comparison.observation, 'progress-observation'),
      };
    });
    if (new Set(comparisons.map(comparison => comparison.viewport)).size !== 2) return fail(PROGRESS_COVERAGE);
    if (!Array.isArray(row.findingIds)
      || row.findingIds.some(id => typeof id !== 'string' || !id.trim())
      || new Set(row.findingIds).size !== row.findingIds.length
      || row.findingIds.some(id => !findings.some(finding => finding.id === id))) return fail('progress finding binding');
    if (row.verdict === 'regressed' && row.findingIds.length === 0) return fail('regressed progress requires a localized finding');
    return {
      verdict: row.verdict,
      comparisons,
      findingIds: [...row.findingIds] as string[],
    } satisfies FirstRenderProgress;
  })() : null;
  // A page the last review retained, which this review itself finds the same or better, is still retained: a fresh look
  // at what already passed is not new evidence. Worse is said as regressed, with findings that localize it.
  if (previousDecision === 'retain' && progress !== null && progress.verdict !== 'regressed' && input.decision !== 'retain') {
    return fail(`the previous review retained this page and progress says ${progress.verdict}. Either the change made something worse `
      + '(in the captures, in the motion observation or in a section below the entry): then set progress to regressed and keep the findings '
      + 'that localize it; or nothing got worse: then retain, with every quality axis pass and no findings');
  }
  for (const [key, value] of Object.entries(bindings)) {
    if (key !== 'previousReviewSha256' || value !== null) piDigest(value, `binding-${key}`);
  }
  return { decision: input.decision, qualityAssessments, findings, resolvedFindings, progress,
    ...(referenceComparisons === undefined ? {} : { referenceComparisons }),
    ...(judgmentChecks === undefined ? {} : { judgmentChecks }) };
}
