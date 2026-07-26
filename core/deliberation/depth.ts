// Adaptive design-loop depth. Depth changes ceremony, never artifact ownership.

export const DEPTH_INPUT_SCHEMA = 'design-depth-input-v1' as const;
export type DepthLevel = 'L1' | 'L2' | 'L3' | 'L4';
export type DepthInput = {
  readonly schema: typeof DEPTH_INPUT_SCHEMA;
  readonly scope: 'component-change' | 'single-section' | 'single-surface' | 'multi-surface';
  readonly zoneCount: number;
  readonly newPrimaryCta: boolean;
  readonly newInformationArchitecture: boolean;
  readonly multiScreenState: boolean;
  readonly costlyError: boolean;
  readonly brandDirectionChange: boolean;
  readonly showpieceMotion: boolean;
  readonly webgl: boolean;
  readonly referenceZones: number;
};
export type DepthResult = {
  readonly level: DepthLevel;
  readonly reasons: readonly string[];
  readonly stages: readonly string[];
  readonly requiresDeliberation: boolean;
};

const BASE: Record<DepthLevel, readonly string[]> = {
  L1: ['frame-check', 'hand', 'render-observe', 'eye'],
  L2: ['frame', 'targeted-scout', 'composition', 'hand', 'render-observe', 'eye'],
  L3: ['domain', 'frame', 'scout', 'writer', 'typesetter', 'composer', 'sketch', 'blind-selection', 'hand', 'render-observe', 'glance', 'eye', 'red-green'],
  L4: ['domain', 'frame', 'scout', 'writer', 'typesetter', 'composer', 'design-deliberation', 'sketch', 'blind-selection', 'hand', 'render-observe', 'glance', 'constraint-deliberation', 'eye', 'red-green'],
};

export function classifyDepth(input: DepthInput): DepthResult {
  if (input.schema !== DEPTH_INPUT_SCHEMA) throw new Error(`depth schema must be ${DEPTH_INPUT_SCHEMA}`);
  if (!Number.isSafeInteger(input.zoneCount) || input.zoneCount < 1) throw new Error('zoneCount must be a positive integer');
  if (!Number.isSafeInteger(input.referenceZones) || input.referenceZones < 0) throw new Error('referenceZones must be a non-negative integer');

  let level: DepthLevel = input.scope === 'component-change' ? 'L1' : input.scope === 'single-section' ? 'L2' : 'L3';
  const reasons = [`scope:${input.scope}`];
  const raise = (to: DepthLevel, reason: string): void => {
    const rank: Record<DepthLevel, number> = { L1: 1, L2: 2, L3: 3, L4: 4 };
    if (rank[to] > rank[level]) level = to;
    reasons.push(reason);
  };
  if (input.zoneCount >= 3 || input.referenceZones >= 3) raise('L3', 'three-or-more-composed-zones');
  if (input.newPrimaryCta) raise('L3', 'new-primary-cta');
  if (input.newInformationArchitecture) raise('L3', 'new-information-architecture');
  if (input.multiScreenState) raise('L3', 'multi-screen-state');
  if (input.costlyError) raise('L4', 'costly-error-and-recovery');
  if (input.brandDirectionChange) raise('L4', 'brand-direction-change');
  if (input.showpieceMotion) raise('L4', 'showpiece-motion');
  if (input.webgl) raise('L4', 'webgl-safety-envelope');
  if (input.scope === 'multi-surface') raise('L4', 'multi-surface-system');

  return { level, reasons, stages: BASE[level], requiresDeliberation: (level as DepthLevel) === 'L4' };
}
