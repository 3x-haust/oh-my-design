import { checkCurrentDesignJudgment } from '../design/current-judgment.ts';

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
