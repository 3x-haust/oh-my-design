import { checkCurrentDesignJudgment } from '../design/current-judgment.ts';
import { readReferenceBoardArtifacts } from '../ref/board-artifacts.ts';
import { readPublishedReferenceResearch, validateReferenceResearch } from '../ref/reference-research.ts';
import { checkReferenceApplication } from '../ref/reference-application.ts';

export function referenceResearchWork(root: string, options: Readonly<{
  expectedSourceContractSha256: string; benchmarkRequired: boolean; expectedRequest: string;
}>) {
  try { readReferenceBoardArtifacts(root); } catch { return null; }
  try { validateReferenceResearch(root, readPublishedReferenceResearch(root), options); }
  catch (error) {
    return {
      action: 'author-research', problems: [error instanceof Error ? error.message : String(error)],
      next: 'omd schema reference-research',
      instruction: 'The board exists but current research is not published. This is Scout work inside reference-board, not a new route stage. Read schema reference-research and ref research-check --json; inspect both lanes and actual captures, repair the named input/evidence, then publish with ref research-set --input <research-input.json> --json. For a selected product benchmark use schema reference-flow-input and task-flow-benchmark, execute benchmark record and its publisher before binding its digest. Failed or irrelevant search pages are gaps: use a usable public alternative and inspect its actual links, never invent provenance. Recompute stage next after research-check succeeds; do not author the application before its research inputs pass.',
    };
  }
  try { checkReferenceApplication(root, options); }
  catch (error) {
    return {
      action: 'apply-references', problems: [error instanceof Error ? error.message : String(error)],
      next: 'omd ref apply-plan --json',
      instruction: 'Current research passes. This is Scout application work inside reference-board, not a new route stage. Read ref apply-plan --json; inspect the actual lane evidence and fill each destination surface with distinct domain/design decisions, exclusions, gaps and checks. Publish with ref apply-set --input <application-input.json> --json, run ref apply-check --json, then recompute stage next. The plan supplies current bindings, never judgments or approval; never fill it by copying source claims.',
    };
  }
  return null;
}

export function referenceInterpretationWork(root: string) {
  let problems: readonly string[];
  try { problems = checkCurrentDesignJudgment(root).findings; }
  catch (error) { problems = [error instanceof Error ? error.message : String(error)]; }
  if (problems.length === 0) return null;
  return {
    stage: 'reference-interpretation', owner: 'coordinator', action: 'interpret-references', problems,
    entryBlockers: [], next: 'omd judgment input --json',
    schemas: [{ name: 'design-judgment', command: 'omd schema design-judgment' }], contracts: [],
    judgedBy: [{ command: 'omd judgment check --json', fails: 'the interpretation is missing, malformed, nonspecific or bound to another current board' }],
    instruction: 'This is coordinator prerequisite work, not a new adaptive route stage. Read judgment input and schema design-judgment. Inspect the current observations, author the hypothesis and reference interpretations into .omd/.cache/design-judgment-input.json, then use omd judgment publish --input .omd/.cache/design-judgment-input.json --json. Never copy an old verdict onto a new hash or manufacture observations. Check the result and recompute stage next before entering the consumer. Scout remains the observation owner; Composer consumes the published interpretation.',
  };
}
