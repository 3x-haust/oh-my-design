/**
 * Asset sourcing policy core.
 *
 * OMD supports three asset paths, in order of precedence:
 *   1. (default) User-provided assets, optionally treated with a duotone filter
 *      (see `core/graphics/duotone-image-presets.md`) for visual unification.
 *   2. (conditional) AI-generated imagery — only when the host environment
 *      declares image-generation capability, and only for abstract/atmospheric
 *      zones. Factual carriers (team photos, product screenshots, real people,
 *      logos) may never be satisfied by AI-generated imagery.
 *   3. (additive) WebGL/3D — gated on hand precedence (explicit user request OR
 *      greenfield concept necessity), a declared performance budget, and a
 *      non-canvas semantic fallback.
 * When none of these apply, the design falls back to CSS/SVG treatments per
 * `core/graphics/placeholder-policy.md` — a grey box is a defect, never the
 * final answer.
 *
 * RUNTIME SCOPE NOTE: this module is a pure decision/gate core. It contains
 * no I/O and calls no external services — it decides *whether* a path is
 * permitted, never executes it. AI image generation IS wired at the agent
 * layer: on a host that provides an image-generation capability (Codex,
 * Claude Code), the composer/hand invoke it per `core/theory/imagegen.md`
 * for image-first concept drafts and for abstract/atmospheric shipped assets,
 * with this module as the admissibility gate and committed provenance recorded
 * via `omd decision`. What remains environment-dependent is 3D/WebGL
 * performance MEASUREMENT (render tracing, Lighthouse-style budgets): those
 * adapters are intentionally NOT stubbed here and must not fabricate a fake
 * "success" result for a capability the environment cannot exercise.
 */

export type AssetZone = 'factual' | 'abstract' | 'atmospheric' | 'structural';

export type AssetStrategy =
  | 'user-asset-duotone'
  | 'ai-image'
  | 'webgl-3d'
  | 'css-svg-fallback';

export interface AssetStrategyInputs {
  hasUserAsset: boolean;
  hostHasImageGen: boolean;
  explicitWebglRequest?: boolean;
  greenfieldConceptNecessity?: boolean;
  perfBudgetDeclared?: boolean;
  zone: AssetZone;
}

export interface AssetStrategyDecision {
  strategy: AssetStrategy;
  reason: string;
  fallbackChain: string[];
}

/**
 * Decide the asset sourcing strategy for a single content slot. Pure
 * decision function — no I/O, no runtime capability checks beyond the
 * declared inputs.
 */
export function decideAssetStrategy(inputs: AssetStrategyInputs): AssetStrategyDecision {
  const { hasUserAsset, hostHasImageGen, zone } = inputs;
  const explicitWebglRequest = inputs.explicitWebglRequest ?? false;
  const greenfieldConceptNecessity = inputs.greenfieldConceptNecessity ?? false;
  const perfBudgetDeclared = inputs.perfBudgetDeclared ?? false;

  if (hasUserAsset) {
    return {
      strategy: 'user-asset-duotone',
      reason: 'A user-provided asset is available; it is the default source and takes precedence over AI generation or WebGL.',
      fallbackChain: ['user-asset-duotone', 'css-svg-fallback'],
    };
  }

  // Factual carriers (team photos, product screenshots, real people, logos)
  // may never be satisfied by AI-generated imagery, regardless of host
  // capability. See `validateAiImageUsage` for the corresponding gate.
  const aiImageEligibleZone = zone === 'abstract' || zone === 'atmospheric';
  if (zone !== 'factual' && aiImageEligibleZone && hostHasImageGen) {
    return {
      strategy: 'ai-image',
      reason: `No user asset is available; the "${zone}" zone permits AI-generated imagery and the host declares image-generation capability.`,
      fallbackChain: ['ai-image', 'css-svg-fallback'],
    };
  }

  const handPrecedence = explicitWebglRequest || greenfieldConceptNecessity;
  if (handPrecedence && perfBudgetDeclared) {
    return {
      strategy: 'webgl-3d',
      reason: 'No user asset or AI image path applies; WebGL/3D escalation is permitted by hand precedence and a declared performance budget.',
      fallbackChain: ['webgl-3d', 'css-svg-fallback'],
    };
  }

  return {
    strategy: 'css-svg-fallback',
    reason: zone === 'factual'
      ? 'The zone is factual: AI-generated imagery is never permitted, no user asset was provided, and WebGL escalation was not authorised. Falling back to CSS/SVG per the placeholder policy.'
      : 'No user asset, no eligible AI-image path, and no authorised WebGL escalation. Falling back to CSS/SVG per the placeholder policy.',
    fallbackChain: ['css-svg-fallback'],
  };
}

export interface AiImageUsageInputs {
  zone: AssetZone;
  hostHasImageGen: boolean;
  provenance?: {
    prompt?: string;
    provider?: string;
  };
}

export interface AiImageUsageValidation {
  allowed: boolean;
  violations: string[];
}

/**
 * Gate for whether a specific AI-generated image is permitted to ship.
 * Pure validation — the actual image generation call is a Phase 2 runtime
 * adapter concern (see module header); this only decides admissibility.
 */
export function validateAiImageUsage(inputs: AiImageUsageInputs): AiImageUsageValidation {
  const violations: string[] = [];

  if (inputs.zone === 'factual') {
    violations.push('factual carrier: AI-generated imagery is never permitted for factual slots (team photos, product screenshots, real people, logos).');
  } else if (inputs.zone !== 'abstract' && inputs.zone !== 'atmospheric') {
    violations.push(`ineligible zone: AI-generated imagery is only permitted in abstract or atmospheric zones, not "${inputs.zone}".`);
  }

  if (!inputs.hostHasImageGen) {
    violations.push('host capability: the host environment does not declare image-generation capability.');
  }

  if (!inputs.provenance?.prompt) {
    violations.push('provenance missing: prompt is required to record how the image was generated.');
  }

  if (!inputs.provenance?.provider) {
    violations.push('provenance missing: provider is required to record how the image was generated.');
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

export interface WebglEscalationInputs {
  explicitUserRequest: boolean;
  greenfieldConceptNecessity: boolean;
  perfBudgetDeclared: boolean;
  semanticFallbackPresent: boolean;
}

export interface WebglEscalationDecision {
  permitted: boolean;
  reasons: string[];
}

/**
 * Gate for whether a WebGL/3D escalation is permitted. Pure decision —
 * actual 3D performance measurement (render tracing, frame-budget
 * verification) is a Phase 2 runtime adapter concern (see module header);
 * this only decides admissibility from declared inputs.
 */
export function evaluateWebglEscalation(inputs: WebglEscalationInputs): WebglEscalationDecision {
  const reasons: string[] = [];

  const handPrecedence = inputs.explicitUserRequest || inputs.greenfieldConceptNecessity;
  if (!handPrecedence) {
    reasons.push('hand precedence not established: neither an explicit user request nor a greenfield concept necessity was declared.');
  }

  if (!inputs.perfBudgetDeclared) {
    reasons.push('performance budget not declared: a WebGL/3D escalation requires an explicit performance budget.');
  }

  if (!inputs.semanticFallbackPresent) {
    reasons.push('semantic fallback missing: a non-canvas semantic fallback is required before a WebGL/3D escalation ships.');
  }

  return {
    permitted: reasons.length === 0,
    reasons,
  };
}
