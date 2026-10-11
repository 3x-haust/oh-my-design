export type DesignExecutionMode = 'autonomous' | 'developer-evaluation';
export type DesignExecutionPolicy = Readonly<{
  mode: DesignExecutionMode;
  selectionActor: 'harness';
  designQuestions: boolean;
  criteriaVersion: 'autonomous-design-v1';
}>;

export class DesignExecutionPolicyError extends Error {
  override readonly name = 'DesignExecutionPolicyError';
  constructor() { super('OMD_DESIGN_MODE_INVALID: use autonomous or developer-evaluation in the host configuration'); }
}

/** Capture at host startup, never from a project file, model argument or external page. */
export function captureDesignExecutionPolicy(environment: Readonly<Record<string, string | undefined>>): DesignExecutionPolicy {
  const mode = environment.OMD_DESIGN_MODE ?? 'autonomous';
  if (mode !== 'autonomous' && mode !== 'developer-evaluation') throw new DesignExecutionPolicyError();
  return Object.freeze({
    mode, selectionActor: 'harness', designQuestions: mode === 'developer-evaluation',
    criteriaVersion: 'autonomous-design-v1',
  });
}

export function parseDesignExecutionPolicy(value: unknown): DesignExecutionPolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'criteriaVersion,designQuestions,mode,selectionActor') {
    throw new DesignExecutionPolicyError();
  }
  const mode = Reflect.get(value, 'mode');
  if (mode !== 'autonomous' && mode !== 'developer-evaluation') throw new DesignExecutionPolicyError();
  const expected = captureDesignExecutionPolicy({ OMD_DESIGN_MODE: mode });
  if (Reflect.get(value, 'selectionActor') !== expected.selectionActor
    || Reflect.get(value, 'designQuestions') !== expected.designQuestions
    || Reflect.get(value, 'criteriaVersion') !== expected.criteriaVersion) throw new DesignExecutionPolicyError();
  return expected;
}

export function designExecutionGuidance(policy: DesignExecutionPolicy): string {
  return [
    `OMD design execution: ${policy.mode}; criteria ${policy.criteriaVersion}; selection actor: harness.`,
    'Complete one selected result through the shared research, maker, render, review and bounded repair engine.',
    'Choose design assumptions, references, interpretations and candidates internally. Do not call a question tool for taste, direction, candidate selection, missing references or aesthetic approval.',
    'An agent decision is not user approval. Keep missing product facts unknown; omit unsupported claims and distinguish demo content. Never invent features, prices, testimonials, authority or consent.',
    'Use accessible public or already-authorized sources when a provider is unavailable. Do not ask the user to gather references or set up accounts as a prerequisite.',
    'Preserve external-action permission boundaries. Do not purchase, submit, delete, message or change an account without the required authority; deliver the possible result with precise limitations.',
    'Use concrete observed repair criteria and preserve strengths. Regression requires the existing authenticated rollback path; a budget stop is not a quality pass.',
    policy.mode === 'developer-evaluation'
      ? 'Developer evaluation is an explicit host command after rendered output. It never changes the shared production engine or pauses production awaiting an interview.'
      : 'Developer interviews are disabled. Voluntary follow-up feedback is a new local input, not permission to collect a shared evaluation dataset.',
  ].join('\n');
}
