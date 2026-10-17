export type NativeCompletionProcedure = Readonly<{
  read: string;
  steps: readonly string[];
  limits: string;
}>;

export function nativeCompletionBrief(stage: string, referenceApplication: boolean, currentProcess = false, modelLed = false) {
  const read = 'omd pack protocol/native-pi-completion.md';
  const limits = 'Evaluation ok/executionStatus describes assertion execution; acceptanceStatus remains review-required. Entry text does not prove every behavior. Preserve the executed plan and every required route/state/viewport capture for independent protocol outcomeAssessments; keep reference application review after authenticated final publication.';
  if (modelLed && ['browser-evidence', 'independent-review', 'review'].includes(stage)) return {
    owner: 'coordinator',
    owns: ['Actual browser proposal and repairs; the harness owns execution, isolated review and publication.'],
    procedure: { read, steps: ['omd schema trusted-lifecycle-manifest --json',
      'omd lifecycle finish --json'],
    limits: 'Cover all requested outcomes from actual controls. Inspect concrete failure captures and repair changed inputs. Unselected design documents are not prerequisites; selected contracts, permissions, hard behavior/access floors and independent visual review remain binding.' },
  };
  if (stage === 'production' && modelLed) return {
    owner: 'omd-hand',
    owns: ['Route-authorized application source, authored directly by the current model or through model-selected delegation.'],
    procedure: { read, steps: [
      'omd guard production --json',
      'Use the ordinary scoped editor and execution tools to implement the requested result. Research and delegate when useful; do not create design paperwork merely to enter production.',
      'Run the relevant project checks and build. Use lifecycle verify for signed package execution records when needed.',
      'omd stage next --json',
    ], limits: 'Preserve the complete request and allowed paths. Do not write publisher-owned .omd records. Unknown facts stay unknown, external actions retain their permissions, and real browser results plus independent final review determine completion.' },
  };
  if (stage === 'candidate-generation' || stage === 'production') return {
    owner: stage === 'production' ? 'omd-hand' : 'omd-sketch',
    owns: [stage === 'production' ? 'Route-authorized application source through the fresh native maker.'
      : 'Assigned integrated candidate source through the fresh native maker; candidate select retains selection publication.'],
    procedure: { read, steps: [...(stage === 'production' ? ['omd guard production --json'] : []), 'omd schema native-maker --json',
      'omd maker run --input .omd/.cache/maker-input.json --json',
      ...(stage === 'production' ? ['omd lifecycle verify install --json',
        'omd lifecycle verify typecheck --json', 'omd lifecycle verify build --json'] : []),
      ...(stage === 'candidate-generation' ? currentProcess
        ? ['omd candidate capture --json', 'omd candidate review --json']
        : ['omd candidate select --input .omd/.cache/candidate-selection-input.json --json'] : [])],
    limits: 'Maker execution is source-only, using inherited Pi provider/model and source-owned effort. No same-session fallback. Coordinator and existing publishers retain captures, selection, review and completion.' },
  };
  if (stage === 'browser-evidence') return {
    owner: 'omd-hand',
    owns: ['Publisher-owned current browser observations, trusted receipts and actual captures; do not hand-author passing results.'],
    judgedBy: [
      { command: currentProcess
        ? 'omd lifecycle evaluate --manifest .omd/.cache/trusted-lifecycle-manifest.json --json'
        : 'omd lifecycle evaluate --json', fails: 'the project-derived browser outcomes or current native authority fail' },
      { command: 'omd slop review-check --json', fails: 'current rendered findings remain unreviewed or unresolved' },
    ],
    procedure: { read, steps: [...(currentProcess
      ? ['omd schema trusted-lifecycle-manifest --json', 'omd lifecycle evaluate --manifest .omd/.cache/trusted-lifecycle-manifest.json --json',
        'omd schema surface-captures --json', 'omd lifecycle surface-captures --input .omd/.cache/surface-captures-input.json --json']
      : ['omd lifecycle evaluate --json']), 'omd schema slop-scope',
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
