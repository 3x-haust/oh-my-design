export type DesignExecutionMode = 'autonomous' | 'developer-evaluation';
export type DesignExecutionPolicy = Readonly<{
  mode: DesignExecutionMode;
  selectionActor: 'harness';
  designQuestions: boolean;
  criteriaVersion: 'autonomous-design-v1' | 'model-led-design-v1';
}>;

export class DesignExecutionPolicyError extends Error {
  override readonly name = 'DesignExecutionPolicyError';
  constructor() { super('OMD_DESIGN_MODE_INVALID: use autonomous or developer-evaluation; OMD_DESIGN_WORKFLOW is no longer supported'); }
}

/** Capture at host startup, never from a project file, model argument or external page. */
export function captureDesignExecutionPolicy(environment: Readonly<Record<string, string | undefined>>): DesignExecutionPolicy {
  const mode = environment.OMD_DESIGN_MODE ?? 'autonomous';
  if (mode !== 'autonomous' && mode !== 'developer-evaluation') throw new DesignExecutionPolicyError();
  if (environment.OMD_DESIGN_WORKFLOW !== undefined) throw new DesignExecutionPolicyError();
  return Object.freeze({
    mode, selectionActor: 'harness', designQuestions: mode === 'developer-evaluation',
    criteriaVersion: 'model-led-design-v1',
  });
}

export function parseDesignExecutionPolicy(value: unknown): DesignExecutionPolicy {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'criteriaVersion,designQuestions,mode,selectionActor') {
    throw new DesignExecutionPolicyError();
  }
  const mode = Reflect.get(value, 'mode');
  if (mode !== 'autonomous' && mode !== 'developer-evaluation') throw new DesignExecutionPolicyError();
  const criteriaVersion = Reflect.get(value, 'criteriaVersion');
  if (criteriaVersion !== 'autonomous-design-v1' && criteriaVersion !== 'model-led-design-v1') throw new DesignExecutionPolicyError();
  const expected = Object.freeze({
    mode, selectionActor: 'harness' as const, designQuestions: mode === 'developer-evaluation',
    criteriaVersion,
  });
  if (Reflect.get(value, 'selectionActor') !== expected.selectionActor
    || Reflect.get(value, 'designQuestions') !== expected.designQuestions) throw new DesignExecutionPolicyError();
  return expected;
}

export function designExecutionGuidance(policy: DesignExecutionPolicy): string {
  if (policy.criteriaVersion !== 'model-led-design-v1') {
    throw new DesignExecutionPolicyError();
  }
  return [
    `OMD design execution: ${policy.mode}; criteria ${policy.criteriaVersion}; selection actor: harness.`,
    'Understand the requested outcome, inspect strong finished-product visual references before inventing a new visual direction, build directly, inspect the real result and repair concrete problems. Choose methods and delegation yourself; candidate competitions, role handoffs and intermediate design documents are not prerequisites.',
    'Choose design assumptions, references, interpretations and candidates internally. Do not call a question tool for taste, direction, candidate selection, missing references or aesthetic approval.',
    'An agent decision is not user approval. Keep missing product facts unknown; omit unsupported claims and distinguish demo content. Never invent features, prices, testimonials, authority or consent.',
    'Use accessible public or already-authorized sources when a provider is unavailable. Do not ask the user to gather references or set up accounts as a prerequisite.',
    'Preserve external-action permission boundaries. Do not purchase, submit, delete, message or change an account without the required authority; deliver the possible result with precise limitations.',
    'Use concrete observed repair criteria and preserve strengths. Regression requires the existing authenticated rollback path; a budget stop is not a quality pass.',
    'When the user rejects a rendered result, preserve the exact feedback and rejected pixels as the comparison baseline. Do not reduce a broad aesthetic rejection to one border, color or control fix, infer an unstated preferred style, or call a new result improved before comparing it.',
    'Resolve a coherent primary visual direction from inspected populated whole-product screens before styling. Supplemental references have named limited jobs; do not average incompatible palettes, density, shapes and control systems into a generic composite. Functional similarity is not evidence of aesthetic fit. Prefer complementary states from the same visual system when available.',
    'Compare the actual first render directly with the chosen primary original for macro proportions, hierarchy, density, typography and small-control anatomy, not merely list/detail semantics. Treat input borders, padding, focus/disabled states, resizing, overflow and adjacent actions as one finished control system. A native affordance is a deliberate usability decision, not an unexamined default. Preserve accessible operation and user content when refining it.',
    'After the first usable build, use omd first-render check --page <actual-build-entry> --json for independent desktop/mobile quality feedback before full behavioral scenarios. This route uses authenticated task facts, not an invented design hypothesis. Repair the whole visible system, including icon optical scale, weight and silhouette in context. Early model retention is not human satisfaction or external-reference fidelity.',
    'Present actual consulted reference originals and source URLs alongside the generated desktop/mobile screens, identifying the visible structure transferred and what was not transferred. If no visual reference was inspected, say so; never attach a source retrospectively as evidence of earlier use. Reference images are comparison evidence, not assets to ship in the product.',
    policy.mode === 'developer-evaluation'
      ? 'Developer evaluation is an explicit host command after rendered output. It never changes the shared production engine or pauses production awaiting an interview.'
      : 'Developer interviews are disabled. Voluntary follow-up feedback is a new local input, not permission to collect a shared evaluation dataset.',
  ].join('\n');
}
