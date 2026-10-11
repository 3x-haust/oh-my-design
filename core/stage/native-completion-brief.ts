export type NativeCompletionProcedure = Readonly<{
  read: string;
  steps: readonly string[];
  limits: string;
}>;

export function nativeCompletionBrief(stage: string, referenceApplication: boolean) {
  const read = 'omd pack protocol/native-pi-completion.md';
  const limits = 'Evaluation ok/executionStatus describes assertion execution; acceptanceStatus remains review-required. Entry text does not prove every behavior. Preserve the executed plan and every required route/state/viewport capture for independent protocol outcomeAssessments; keep reference application review after authenticated final publication.';
  if (stage === 'candidate-generation' || stage === 'production') return {
    owner: stage === 'production' ? 'omd-hand' : 'omd-sketch',
    owns: [stage === 'production' ? 'Route-authorized application source through the fresh native maker.'
      : 'Assigned integrated candidate source through the fresh native maker; candidate select retains selection publication.'],
    procedure: { read, steps: [...(stage === 'production' ? ['omd guard production --json'] : []), 'omd schema native-maker --json',
      'omd maker run --input .omd/.cache/maker-input.json --json',
      ...(stage === 'candidate-generation' ? ['omd candidate select --input .omd/.cache/candidate-selection-input.json --json'] : [])],
    limits: 'Maker execution is source-only, using inherited Pi provider/model and source-owned effort. No same-session fallback. Coordinator and existing publishers retain captures, selection, review and completion.' },
  };
  if (stage === 'browser-evidence') return {
    owner: 'omd-hand',
    owns: ['Publisher-owned current browser observations, trusted receipts and actual captures; do not hand-author passing results.'],
    judgedBy: [
      { command: 'omd lifecycle evaluate --json', fails: 'the project-derived browser outcomes or current native authority fail' },
      { command: 'omd slop review-check --json', fails: 'current rendered findings remain unreviewed or unresolved' },
    ],
    procedure: { read, steps: ['omd lifecycle evaluate --json', 'omd schema slop-scope',
      'omd slop checkpoint --input .omd/.cache/slop-scope.json --json',
      'omd slop review-set --input <review.json> --json', 'omd slop review-check --json'], limits },
  };
  if (stage === 'independent-review' || stage === 'review') return {
    owner: 'coordinator',
    owns: ['Isolated native reviewer lane publication through omd review run; the coordinator cannot author its own verdicts.'],
    judgedBy: [{ command: 'omd review run --json', fails: 'a current isolated reviewer lane is missing, rejected, unauthorized or stale' }],
    procedure: { read, steps: ['omd review run --json', 'omd lifecycle finalize --json',
      ...(referenceApplication ? ['omd ref apply-review-plan --json', 'omd ref apply-review-set --input <review.json> --json',
        'omd ref apply-review-check --json'] : []), 'omd guard completion --json'], limits },
  };
  return undefined;
}
