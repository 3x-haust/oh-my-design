import {
  AiAssetDecisionError,
  parseAiAssetDecisionBinding,
  requireCommittedAiAssetDecision,
  type AiAssetDecisionReference,
} from '../asset-sourcing/ai-decision.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { failAdaptiveRoute, type AdaptiveStrategyDecision } from './adaptive-flow-domain.ts';

export type AdaptiveAiAsset = Readonly<{
  assetId: string;
  zone: 'abstract' | 'atmospheric';
  prompt: string;
  provider: string;
  decision: AiAssetDecisionReference;
  currentDecision: AiAssetDecisionReference;
}>;

const KEYS = ['assetId', 'zone', 'prompt', 'provider', 'decision', 'currentDecision'] as const;
const ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;

function fields(value: unknown): ReadonlyMap<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== KEYS.length
    || keys.some((key) => typeof key !== 'string' || !KEYS.includes(key as never))) {
    return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
  }
  const result = new Map<string, unknown>();
  for (const key of KEYS) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
    }
    result.set(key, descriptor.value);
  }
  return result;
}

function parse(value: unknown): AdaptiveAiAsset {
  const item = fields(value);
  const assetId = item.get('assetId');
  const zone = item.get('zone');
  if (typeof assetId !== 'string' || !ID.test(assetId)
    || (zone !== 'abstract' && zone !== 'atmospheric')) {
    return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
  }
  try {
    const binding = parseAiAssetDecisionBinding({
      prompt: item.get('prompt'), provider: item.get('provider'),
      decision: item.get('decision'), currentDecision: item.get('currentDecision'),
    });
    return Object.freeze({ assetId, zone, ...binding });
  } catch (error) {
    if (error instanceof AiAssetDecisionError) return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
    throw error;
  }
}

export function parseAdaptiveAiAssets(value: unknown): readonly AdaptiveAiAsset[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
  }
  const keys = Reflect.ownKeys(value);
  const expected = ['length', ...Array.from({ length: value.length }, (_, index) => String(index))];
  if (keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
  }
  const assets = Array.from({ length: value.length }, (_, index) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
    }
    return parse(descriptor.value);
  });
  if (new Set(assets.map((asset) => asset.assetId)).size !== assets.length) {
    return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
  }
  return Object.freeze(assets);
}

export function validateAdaptiveAiAssetSelection(
  strategy: AdaptiveStrategyDecision,
  authority?: Readonly<{ root: string; invocation: ProjectRunInvocation }>,
): void {
  const selected = strategy.methods.includes('ai-shipped-asset');
  if (selected !== (strategy.aiAssets.length > 0)) return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
  if (!selected) return;
  if (authority === undefined) return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
  try {
    for (const asset of strategy.aiAssets) {
      requireCommittedAiAssetDecision(authority.root, {
        prompt: asset.prompt, provider: asset.provider,
        decision: asset.decision, currentDecision: asset.currentDecision,
      }, authority.invocation);
    }
  } catch (error) {
    if (error instanceof AiAssetDecisionError) return failAdaptiveRoute('AI_ASSET_DECISION_INVALID');
    throw error;
  }
}
