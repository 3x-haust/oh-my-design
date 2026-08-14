import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  aiAssetDecisionAuthorityBytes,
  commitAiAssetDecision,
  decideAssetStrategy,
  evaluateWebglEscalation,
  validateAiImageUsage,
  type AssetStrategyInputs,
} from '../core/asset-sourcing/index.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectRunInvocation,
  createTestProjectWriteAdapter,
} from './helpers/project-write.ts';

// --- decideAssetStrategy -----------------------------------------------

test('decideAssetStrategy: user asset always wins regardless of other inputs', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: true,
    hostHasImageGen: true,
    zone: 'abstract',
    explicitWebglRequest: true,
    perfBudgetDeclared: true,
  });
  assert.equal(decision.strategy, 'user-asset-duotone');
  assert.match(decision.reason, /user-provided asset/);
});

test('decideAssetStrategy: abstract zone with host image-gen capability yields ai-image', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: false,
    hostHasImageGen: true,
    zone: 'abstract',
  });
  assert.equal(decision.strategy, 'ai-image');
});

test('decideAssetStrategy: atmospheric zone with host image-gen capability yields ai-image', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: false,
    hostHasImageGen: true,
    zone: 'atmospheric',
  });
  assert.equal(decision.strategy, 'ai-image');
});

test('decideAssetStrategy: factual zone never resolves to ai-image, even with host capability', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: false,
    hostHasImageGen: true,
    zone: 'factual',
  });
  assert.notEqual(decision.strategy, 'ai-image');
  assert.equal(decision.strategy, 'css-svg-fallback');
});

test('decideAssetStrategy: factual zone with explicit webgl authorisation escalates to webgl-3d, not ai-image', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: false,
    hostHasImageGen: true,
    zone: 'factual',
    explicitWebglRequest: true,
    perfBudgetDeclared: true,
  });
  assert.notEqual(decision.strategy, 'ai-image');
  assert.equal(decision.strategy, 'webgl-3d');
});

test('decideAssetStrategy: eligible zone without host image-gen capability falls back to css-svg', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: false,
    hostHasImageGen: false,
    zone: 'abstract',
  });
  assert.equal(decision.strategy, 'css-svg-fallback');
});

test('decideAssetStrategy: structural zone with host capability does not use ai-image', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: false,
    hostHasImageGen: true,
    zone: 'structural',
  });
  assert.notEqual(decision.strategy, 'ai-image');
});

test('decideAssetStrategy: explicit webgl request plus declared perf budget yields webgl-3d', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: false,
    hostHasImageGen: false,
    zone: 'structural',
    explicitWebglRequest: true,
    perfBudgetDeclared: true,
  });
  assert.equal(decision.strategy, 'webgl-3d');
});

test('decideAssetStrategy: greenfield concept necessity plus declared perf budget yields webgl-3d', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: false,
    hostHasImageGen: false,
    zone: 'structural',
    greenfieldConceptNecessity: true,
    perfBudgetDeclared: true,
  });
  assert.equal(decision.strategy, 'webgl-3d');
});

test('decideAssetStrategy: webgl hand precedence without a declared perf budget does not escalate', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: false,
    hostHasImageGen: false,
    zone: 'structural',
    explicitWebglRequest: true,
    perfBudgetDeclared: false,
  });
  assert.equal(decision.strategy, 'css-svg-fallback');
});

test('decideAssetStrategy: no user asset, no eligible ai path, no webgl authorisation falls back to css-svg', () => {
  const decision = decideAssetStrategy({
    hasUserAsset: false,
    hostHasImageGen: false,
    zone: 'structural',
  });
  assert.equal(decision.strategy, 'css-svg-fallback');
});

test('decideAssetStrategy: fallbackChain always terminates in css-svg-fallback', () => {
  const scenarios: AssetStrategyInputs[] = [
    { hasUserAsset: true, hostHasImageGen: false, zone: 'factual' },
    { hasUserAsset: false, hostHasImageGen: true, zone: 'abstract' },
    { hasUserAsset: false, hostHasImageGen: false, zone: 'structural', explicitWebglRequest: true, perfBudgetDeclared: true },
    { hasUserAsset: false, hostHasImageGen: false, zone: 'factual' },
  ];
  for (const inputs of scenarios) {
    const decision = decideAssetStrategy(inputs);
    assert.equal(decision.fallbackChain.at(-1), 'css-svg-fallback', JSON.stringify(inputs));
  }
});

// --- validateAiImageUsage ------------------------------------------------

const aiUsageRoots: string[] = [];
after(() => {
  for (const root of aiUsageRoots) rmSync(root, { recursive: true, force: true });
});
function committedAiUsage(zone: 'abstract' | 'atmospheric', prompt: string) {
  const root = mkdtempSync(join(tmpdir(), 'omd-ai-usage-'));
  aiUsageRoots.push(root);
  const invocation = createTestProjectRunInvocation(root, `${zone}-asset`);
  const input = {
    decisionId: `${zone}-asset`, prompt, provider: 'example-provider',
    reason: 'The selected generated carrier is required by the current direction.',
  };
  const authority = aiAssetDecisionAuthorityBytes(root, input, invocation);
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'ai-asset-decision', payload: authority }]);
  const decision = commitAiAssetDecision(root, input, createTestProjectWriteAdapter(root, invocation), invocation);
  return {
    zone, hostHasImageGen: true, provenance: { prompt, provider: input.provider },
    decision, currentDecision: decision, projectRoot: root, invocation,
  };
}

test('validateAiImageUsage: abstract zone, host capable, full provenance is allowed', () => {
  const result = validateAiImageUsage(committedAiUsage('abstract', 'a soft gradient wash'));
  assert.equal(result.allowed, true);
  assert.deepEqual(result.violations, []);
});

test('validateAiImageUsage: atmospheric zone, host capable, full provenance is allowed', () => {
  const result = validateAiImageUsage(committedAiUsage('atmospheric', 'misty forest ambience'));
  assert.equal(result.allowed, true);
});

test('validateAiImageUsage: factual zone is never allowed', () => {
  const result = validateAiImageUsage({
    zone: 'factual',
    hostHasImageGen: true,
    provenance: { prompt: 'team headshot', provider: 'example-provider' },
  });
  assert.equal(result.allowed, false);
  assert.ok(result.violations.some((v) => v.includes('factual carrier')));
});

test('validateAiImageUsage: ineligible (structural) zone is not allowed even with host capability and provenance', () => {
  const result = validateAiImageUsage({
    zone: 'structural',
    hostHasImageGen: true,
    provenance: { prompt: 'divider texture', provider: 'example-provider' },
  });
  assert.equal(result.allowed, false);
  assert.ok(result.violations.some((v) => v.includes('ineligible zone')));
});

test('validateAiImageUsage: host without image-gen capability is not allowed', () => {
  const result = validateAiImageUsage({
    zone: 'abstract',
    hostHasImageGen: false,
    provenance: { prompt: 'abstract shapes', provider: 'example-provider' },
  });
  assert.equal(result.allowed, false);
  assert.ok(result.violations.some((v) => v.includes('host capability')));
});

test('validateAiImageUsage: missing provenance prompt produces a violation', () => {
  const result = validateAiImageUsage({
    zone: 'abstract',
    hostHasImageGen: true,
    provenance: { provider: 'example-provider' },
  });
  assert.equal(result.allowed, false);
  assert.ok(result.violations.some((v) => v.toLowerCase().includes('prompt')));
});

test('validateAiImageUsage: missing provenance provider produces a violation', () => {
  const result = validateAiImageUsage({
    zone: 'abstract',
    hostHasImageGen: true,
    provenance: { prompt: 'abstract shapes' },
  });
  assert.equal(result.allowed, false);
  assert.ok(result.violations.some((v) => v.toLowerCase().includes('provider')));
});

test('validateAiImageUsage: missing provenance and decision binding produces three violations', () => {
  const result = validateAiImageUsage({
    zone: 'abstract',
    hostHasImageGen: true,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.violations.length, 3);
});

// --- evaluateWebglEscalation ---------------------------------------------

test('evaluateWebglEscalation: explicit request + budget + fallback is permitted', () => {
  const result = evaluateWebglEscalation({
    explicitUserRequest: true,
    greenfieldConceptNecessity: false,
    perfBudgetDeclared: true,
    semanticFallbackPresent: true,
  });
  assert.equal(result.permitted, true);
  assert.deepEqual(result.reasons, []);
});

test('evaluateWebglEscalation: greenfield necessity + budget + fallback is permitted', () => {
  const result = evaluateWebglEscalation({
    explicitUserRequest: false,
    greenfieldConceptNecessity: true,
    perfBudgetDeclared: true,
    semanticFallbackPresent: true,
  });
  assert.equal(result.permitted, true);
});

test('evaluateWebglEscalation: no hand precedence is refused even with budget and fallback', () => {
  const result = evaluateWebglEscalation({
    explicitUserRequest: false,
    greenfieldConceptNecessity: false,
    perfBudgetDeclared: true,
    semanticFallbackPresent: true,
  });
  assert.equal(result.permitted, false);
  assert.ok(result.reasons.some((r) => r.includes('hand precedence')));
});

test('evaluateWebglEscalation: hand precedence without a declared perf budget is refused', () => {
  const result = evaluateWebglEscalation({
    explicitUserRequest: true,
    greenfieldConceptNecessity: false,
    perfBudgetDeclared: false,
    semanticFallbackPresent: true,
  });
  assert.equal(result.permitted, false);
  assert.ok(result.reasons.some((r) => r.includes('performance budget')));
});

test('evaluateWebglEscalation: hand precedence and budget without a semantic fallback is refused', () => {
  const result = evaluateWebglEscalation({
    explicitUserRequest: true,
    greenfieldConceptNecessity: false,
    perfBudgetDeclared: true,
    semanticFallbackPresent: false,
  });
  assert.equal(result.permitted, false);
  assert.ok(result.reasons.some((r) => r.includes('semantic fallback')));
});

test('evaluateWebglEscalation: every gate missing lists all three reasons', () => {
  const result = evaluateWebglEscalation({
    explicitUserRequest: false,
    greenfieldConceptNecessity: false,
    perfBudgetDeclared: false,
    semanticFallbackPresent: false,
  });
  assert.equal(result.permitted, false);
  assert.equal(result.reasons.length, 3);
});
