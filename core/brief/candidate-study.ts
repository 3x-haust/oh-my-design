import { CANDIDATE_PLAN_PATH, parseCandidatePreview, checkCandidatePlan, checkCandidatePreview, type CandidatePreview } from './candidate-plan.ts';
import { selectedBaseTokens } from '../tokens/minimal.ts';
import * as v from './candidate-data.ts';
export type SketchBrief = Readonly<{ schema: 'sketch-brief-v1'; mode: 'structural' | 'visual-study'; plan: v.Receipt; candidateId: string; sourceDirectory: string }>;
export function parseSketchBrief(value: unknown): SketchBrief {
  const b = v.object(value, ['schema', 'mode', 'plan', 'candidateId', 'sourceDirectory']);
  const candidateId = v.id(b.candidateId), sourceDirectory = v.path(b.sourceDirectory);
  if (sourceDirectory !== `.omd/.cache/sketches/${candidateId}`) v.fail('Sketch owns only its assigned candidate directory');
  return { schema: v.enumeration(b.schema, ['sketch-brief-v1']), mode: v.enumeration(b.mode, ['structural', 'visual-study']), plan: v.receipt(b.plan), candidateId, sourceDirectory };
}
export type CandidateStudy = Readonly<{
  schema: 'structural-study-v1' | 'visual-study-v1'; plan: v.Receipt; content: v.Receipt; tokens: v.Receipt; candidateId: string;
  views: readonly CandidatePreview[]; testedRelationship: string;
  findings: readonly { kind: 'task' | 'dependency' | 'content-fit' | 'responsive' | 'feasibility' | 'density-type'; status: 'pass' | 'fail' | 'unassessed'; evidence: readonly v.Receipt[]; observation: string }[];
  limitations: readonly string[];
}>;
/** Neither branch admits self-certified final beauty/quality scores. Structural studies cannot
 * carry expression or motion fields; visual studies are provisional decision material. */
export function parseCandidateStudy(value: unknown): CandidateStudy {
  const s = v.object(value, ['schema', 'plan', 'content', 'tokens', 'candidateId', 'views', 'testedRelationship', 'findings', 'limitations']);
  const schema = v.enumeration(s.schema, ['structural-study-v1', 'visual-study-v1']);
  const findings = v.list(s.findings, value => {
    const f = v.object(value, ['kind', 'status', 'evidence', 'observation']);
    const kind = v.enumeration(f.kind, ['task', 'dependency', 'content-fit', 'responsive', 'feasibility', 'density-type']), status = v.enumeration(f.status, ['pass', 'fail', 'unassessed']), evidence = v.list(f.evidence, v.receipt);
    if (schema === 'structural-study-v1' && kind === 'density-type') v.fail('structural mode does not assess visual type treatment');
    if (status !== 'unassessed' && !evidence.length) v.fail('assessed study findings require actual evidence');
    return { kind, status, evidence, observation: v.text(f.observation) };
  });
  return { schema, plan: v.receipt(s.plan), content: v.receipt(s.content), tokens: v.receipt(s.tokens), candidateId: v.id(s.candidateId), views: v.list(s.views, parseCandidatePreview), testedRelationship: v.text(s.testedRelationship), findings, limitations: v.list(s.limitations, v.text) };
}
export function checkCandidateStudy(root: string, briefValue: unknown, studyValue: unknown, sourceContractSha256: string): CandidateStudy {
  const brief = parseSketchBrief(briefValue), study = parseCandidateStudy(studyValue);
  const pointer = v.object(JSON.parse(v.readBytes(root, CANDIDATE_PLAN_PATH).toString('utf8')), ['schema', 'plan']);
  if (pointer.schema !== 'candidate-plan-pointer-v2' || v.digest(pointer.plan) !== v.digest(brief.plan)) v.fail('study requires its current committed plan');
  const { plan, content, seed } = checkCandidatePlan(root, JSON.parse(v.readReceipt(root, brief.plan).toString('utf8')), sourceContractSha256);
  if (study.schema !== (brief.mode === 'structural' ? 'structural-study-v1' : 'visual-study-v1') || v.digest(study.plan) !== v.digest(brief.plan)
    || study.candidateId !== brief.candidateId || !plan.candidates.some(c => c.id === brief.candidateId)
    || v.digest(study.content) !== v.digest(plan.content.receipt) || v.digest(study.tokens) !== v.digest(plan.tokens)
    || v.digest(study.views.map(p => p.viewId).sort()) !== v.digest(plan.views.map(p => p.id).sort())) v.fail('study must bind its exact mode/plan/content/token/view scope');
  const source = v.fileReceipt(root, `${brief.sourceDirectory}/index.html`);
  const hypothesis = plan.candidates.find(c => c.id === brief.candidateId)!;
  for (const preview of study.views) checkCandidatePreview(root, preview, source, plan, content, selectedBaseTokens(seed, hypothesis.primitiveOverrides));
  for (const finding of study.findings) for (const receipt of finding.evidence) v.readReceipt(root, receipt);
  return study;
}
