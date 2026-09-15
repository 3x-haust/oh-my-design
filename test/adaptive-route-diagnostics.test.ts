import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AdaptiveRouteError, type AdaptiveStrategyDecision } from '../core/route/adaptive-flow-domain.ts';
import { validateAdaptiveExecutionWaves } from '../core/route/adaptive-execution-waves.ts';
import { validateAdaptiveStageOrder } from '../core/route/adaptive-stage-graph.ts';
import { routeAdaptiveFlow, validateOptionalStageAccounting } from '../core/route/adaptive-flow.ts';
import { validateAttributionCoverage } from '../core/route/adaptive-attribution.ts';
import { inputSkeleton } from '../core/schema/inputs.ts';
import { REFERENCE_DISCOVERY_TASK_NEEDS } from '../core/ref/reference-discovery-routing.ts';

function input() {
  return JSON.parse(readFileSync(new URL('./fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
}

function strategy(): AdaptiveStrategyDecision {
  return input().strategyDecision;
}

test('route authoring exposes accepted discovery needs and wave constraints before the first attempt', () => {
  const constraints = inputSkeleton('route-input').constraints!.join('\n');
  for (const need of REFERENCE_DISCOVERY_TASK_NEEDS) assert.ok(constraints.includes(need));
  assert.match(constraints, /new marketing page uses new-marketing/);
  assert.match(constraints, /existingEvidenceUse=null, skipReason=null/);
  assert.match(constraints, /Both null keys are required/);
  assert.match(constraints, /prerequisite owners precede consumer owners/);
  assert.match(constraints, /parallel-reference-acquisition puts Scout and Writer in the same wave/);
});

test('route input separates expression axes from register and discloses complete accounting vocabulary', () => {
  const constraints = inputSkeleton('route-input').constraints!.join('\n');
  assert.match(constraints, /expressiveDesignNeed=restrained\|balanced\|showpiece/);
  assert.match(constraints, /register confident is not a designAxes value/);
  assert.match(constraints, /including copy-repair-workflow when writing fresh copy/);
  assert.match(constraints, /exact order: tokens, motion, composition, graphics/);
  assert.match(constraints, /Typography is not a category/);
});

test('missing optional stage and method errors name the precise omission without accepting it', () => {
  const value = strategy();
  for (const [id, kind] of [['depth', 'stage'], ['image-first-draft', 'method']] as const) {
    const omitted = { ...value, skips: value.skips.filter(skip => skip.id !== id) };
    assert.throws(() => validateOptionalStageAccounting(omitted), (error: unknown) => {
      assert.ok(error instanceof AdaptiveRouteError);
      assert.equal(error.code, 'OPTIONAL_SKIP_REASON_REQUIRED');
      assert.ok(error.message.includes(`optional ${kind} ${id} must be selected or have a non-empty strategyDecision.skips reason`));
      return true;
    });
  }
  assert.doesNotThrow(() => validateOptionalStageAccounting(value));
});

test('attribution diagnostics report the required strategy-derived list while retaining exact order checks', () => {
  const expected = ['tokens', 'composition'] as const;
  for (const value of [['tokens', 'typography'], ['composition', 'tokens']]) {
    assert.throws(() => validateAttributionCoverage(value, expected), (error: unknown) => {
      assert.ok(error instanceof AdaptiveRouteError);
      assert.equal(error.code, 'ATTRIBUTION_COVERAGE_INVALID');
      assert.match(error.message, /must be exactly \[tokens, composition\] in that order/);
      return true;
    });
  }
  assert.deepEqual(validateAttributionCoverage(expected, expected), expected);
});

test('a wave dependency error names its producer and consumer without changing the error code', () => {
  const value = strategy();
  const waves = value.executionWaves.map((wave) => ({ ...wave, roles: [...wave.roles] }));
  const producer = waves.find((wave) => wave.roles.includes('omd-writer'))!;
  const consumer = waves.find((wave) => wave.roles.includes('omd-composer'))!;
  producer.roles.push('omd-composer');
  const changed = { ...value, executionWaves: waves.filter((wave) => wave !== consumer) };
  assert.throws(() => validateAdaptiveExecutionWaves(changed), (error: unknown) => {
    assert.ok(error instanceof AdaptiveRouteError);
    assert.equal(error.code, 'ADAPTIVE_EXECUTION_WAVE_INVALID');
    assert.match(error.message, /composition \(omd-composer\).*later execution wave than (?:copy \(omd-writer\)|scout \(omd-scout\))/);
    return true;
  });
  assert.doesNotThrow(() => validateAdaptiveExecutionWaves(value));
});

test('a missing wave identifies the selected owner that needs scheduling', () => {
  const value = strategy();
  const executionWaves = value.executionWaves.filter((wave) => !wave.roles.includes('omd-eye'));
  assert.throws(() => validateAdaptiveExecutionWaves({ ...value, executionWaves }), /selected role omd-eye needs an execution wave/);
});

test('a stage order error gives the precise dependency to repair', () => {
  const value = strategy();
  const stages = ['composition', ...value.stages.filter((stage) => stage !== 'composition')];
  assert.throws(() => validateAdaptiveStageOrder({ ...value, stages }), (error: unknown) => {
    assert.ok(error instanceof AdaptiveRouteError);
    assert.equal(error.code, 'ADAPTIVE_STAGE_ORDER_INVALID');
    assert.match(error.message, /strategyDecision.stages must include frame before composition/);
    return true;
  });
  assert.doesNotThrow(() => validateAdaptiveStageOrder(value));
});

test('missing required method diagnostics name the method, not only the category', () => {
  const value = input();
  value.strategyDecision.methods = value.strategyDecision.methods.filter((method: string) => method !== 'model-capability-probe');
  assert.throws(() => routeAdaptiveFlow(value), (error: unknown) => {
    assert.ok(error instanceof AdaptiveRouteError);
    assert.equal(error.code, 'REQUIRED_METHOD_MISSING');
    assert.match(error.message, /selected method model-capability-probe must appear in strategyDecision.methods/);
    return true;
  });
});
