// Causal comparison for OMD: same model, prompt, and budget; blind scores only.

export const COMPARISON_SCHEMA = 'design-comparison-v1' as const;
const AXES = ['hierarchy', 'originality', 'composition', 'typography', 'interaction', 'production'] as const;
type Axis = typeof AXES[number];
export type ComparisonVariant = {
  readonly id: 'baseline' | 'design-prompt' | 'omd-adaptive' | 'omd-deliberation';
  readonly model: string;
  readonly promptSha256: string;
  readonly budget: { readonly tokens: number; readonly seconds: number };
  readonly blind: true;
  readonly scores: Record<Axis, number>;
  readonly taskSuccess: number;
  readonly accessibilityErrors: number;
  readonly mobileOverflow: boolean;
  readonly noJsContentLoss: number;
  readonly revisions: number;
};
export type Comparison = { readonly schema: typeof COMPARISON_SCHEMA; readonly variants: readonly ComparisonVariant[] };
export type VariantScore = { readonly id: string; readonly quality: number; readonly cost: number; readonly qualityPerCost: number };

export function scoreComparison(value: Comparison): VariantScore[] {
  if (value.schema !== COMPARISON_SCHEMA || !Array.isArray(value.variants) || value.variants.length !== 4) throw new Error('comparison requires exactly four variants');
  const ids = new Set(value.variants.map((v) => v.id));
  for (const id of ['baseline', 'design-prompt', 'omd-adaptive', 'omd-deliberation']) if (!ids.has(id as ComparisonVariant['id'])) throw new Error(`comparison missing ${id}`);
  const model = value.variants[0]!.model; const prompt = value.variants[0]!.promptSha256; const budget = value.variants[0]!.budget;
  if (!model || !/^[a-f0-9]{64}$/.test(prompt)) throw new Error('comparison needs a concrete model and prompt digest');
  for (const v of value.variants) {
    if (v.model !== model || v.promptSha256 !== prompt) throw new Error('all variants must use the same model and prompt bytes');
    if (v.blind !== true) throw new Error('scores must be blind');
    if (!Number.isSafeInteger(v.budget.tokens) || v.budget.tokens <= 0 || !Number.isFinite(v.budget.seconds) || v.budget.seconds <= 0) throw new Error('budget must be positive');
    if (v.budget.tokens !== budget.tokens || v.budget.seconds !== budget.seconds) throw new Error('all variants must use the same token and time budget');
    if (!Number.isSafeInteger(v.accessibilityErrors) || v.accessibilityErrors < 0 || !Number.isSafeInteger(v.noJsContentLoss) || v.noJsContentLoss < 0) throw new Error(`${v.id} error counts must be non-negative integers`);
    for (const axis of AXES) if (!Number.isFinite(v.scores[axis]) || v.scores[axis] < 0 || v.scores[axis] > 10) throw new Error(`${v.id}.${axis} must be 0..10`);
    if (!Number.isFinite(v.taskSuccess) || v.taskSuccess < 0 || v.taskSuccess > 1) throw new Error(`${v.id}.taskSuccess must be 0..1`);
  }
  return value.variants.map((v) => {
    const creative = AXES.reduce((sum, axis) => sum + v.scores[axis], 0) / AXES.length;
    const penalties = Math.min(3, v.accessibilityErrors * 0.15 + v.noJsContentLoss * 0.5 + (v.mobileOverflow ? 1 : 0));
    const quality = Math.max(0, creative * 0.75 + v.taskSuccess * 10 * 0.25 - penalties);
    const cost = v.budget.tokens / 100_000 + v.budget.seconds / 600;
    return { id: v.id, quality: Number(quality.toFixed(3)), cost: Number(cost.toFixed(3)), qualityPerCost: Number((quality / cost).toFixed(3)) };
  });
}
