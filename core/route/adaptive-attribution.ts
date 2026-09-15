import { failAdaptiveRoute, type AdaptiveStrategyDecision } from './adaptive-flow-domain.ts';

export const ADAPTIVE_ATTRIBUTION_CATEGORIES = Object.freeze([
  'tokens', 'motion', 'composition', 'graphics',
] as const);
export type AdaptiveAttributionCategory = typeof ADAPTIVE_ATTRIBUTION_CATEGORIES[number];

function strictArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Reflect.getPrototypeOf(value) !== Array.prototype) {
    return failAdaptiveRoute('ATTRIBUTION_COVERAGE_INVALID');
  }
  const keys = Reflect.ownKeys(value);
  const expected = ['length', ...Array.from({ length: value.length }, (_, index) => String(index))];
  if (keys.length !== expected.length
    || keys.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    return failAdaptiveRoute('ATTRIBUTION_COVERAGE_INVALID');
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return failAdaptiveRoute('ATTRIBUTION_COVERAGE_INVALID');
    }
    return descriptor.value;
  });
}

export function validateAttributionCoverage(
  value: unknown,
  expected: readonly AdaptiveAttributionCategory[],
): readonly AdaptiveAttributionCategory[] {
  const values = strictArray(value);
  if (values.length !== expected.length
    || new Set(values).size !== values.length
    || values.some((entry, index) => entry !== expected[index])
    || values.some((entry) => !ADAPTIVE_ATTRIBUTION_CATEGORIES.includes(entry as never))) {
    return failAdaptiveRoute('ATTRIBUTION_COVERAGE_INVALID', `strategyDecision.attributionCategories must be exactly [${expected.join(', ')}] in that order for the selected strategy`);
  }
  return Object.freeze([...expected]);
}

export function requiredAttributionCategories(
  strategy: AdaptiveStrategyDecision,
): readonly AdaptiveAttributionCategory[] {
  const required = new Set<AdaptiveAttributionCategory>(['tokens']);
  if (strategy.methods.includes('motion-one')) required.add('motion');
  if (strategy.stages.includes('composition')) required.add('composition');
  if (strategy.aiAssets.length !== 0) required.add('graphics');
  return Object.freeze(ADAPTIVE_ATTRIBUTION_CATEGORIES.filter((category) => required.has(category)));
}
