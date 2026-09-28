import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

test('route starter exposes machine-consumed discovery and strategy fields', () => {
  const starter = inputSkeleton('route-input').skeleton as Record<string, any>;
  assert.ok(REFERENCE_DISCOVERY_TASK_NEEDS.includes(starter.referenceDiscovery.taskNeed));
  assert.equal(Object.hasOwn(starter.referenceDiscovery, 'existingEvidenceUse'), true);
  assert.equal(Object.hasOwn(starter.referenceDiscovery, 'skipReason'), true);
  assert.ok(Array.isArray(starter.strategyDecision.executionWaves));
});

test('route starter separates design axes and strategy categories', () => {
  const starter = inputSkeleton('route-input').skeleton as Record<string, any>;
  assert.equal(typeof starter.designAxes.expressiveDesignNeed, 'string');
  assert.ok(Array.isArray(starter.strategyDecision.attributionCategories));
});

test('missing optional work does not become a publication prerequisite', () => {
  const value = strategy();
  for (const id of ['depth', 'image-first-draft'])
    assert.doesNotThrow(() => validateOptionalStageAccounting({ ...value, skips: value.skips.filter(skip => skip.id !== id) }));
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

test('omitted recommended method does not block route publication', () => {
  const value = input();
  value.strategyDecision.methods = value.strategyDecision.methods.filter((method: string) => method !== 'model-capability-probe');
  assert.equal(routeAdaptiveFlow(value).route, 'adaptive');
});

test('test-012 failures identify safety methods, terminal stage order and contradictory skips', () => {
  const safety = input();
  safety.strategyDecision.methods = safety.strategyDecision.methods.filter((id: string) => id !== 'design-strategy-safety-recovery');
  assert.equal(routeAdaptiveFlow(safety).route, 'adaptive');
  const final = input(); final.strategyDecision.stages = final.strategyDecision.stages.filter((id: string) => id !== 'browser-evidence');
  assert.throws(() => routeAdaptiveFlow(final), /FINAL_EVIDENCE_REQUIRED/);
  const contradictory = strategy();
  assert.throws(() => validateOptionalStageAccounting({ ...contradictory, skips: [...contradictory.skips, { id: 'frame', reason: 'incorrect skip' }] }), /stage frame is both selected and skipped/);
  assert.doesNotThrow(() => routeAdaptiveFlow(input()));
});

test('greenfield new-product discovery may omit reference selection with a recorded reason', () => {
  const value = input();
  value.strategyDecision.stages = value.strategyDecision.stages.filter((stage: string) => stage !== 'reference-selection');
  value.strategyDecision.skips.push({ id: 'reference-selection', reason: 'Skip selection.' });
  assert.equal(routeAdaptiveFlow(value).route, 'adaptive');
  assert.ok(value.strategyDecision.skips.some((skip: { id: string }) => skip.id === 'reference-selection'));
});

test('test-012 missing route is unclassified, not malformed or a request for external activation', t => {
  const dir = mkdtempSync(join(tmpdir(), 'omd-unclassified-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('../bin/omd.mjs', import.meta.url)), 'guard', 'completion', '--json'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }), (error: unknown) => {
    const stderr = String((error as { stderr: unknown }).stderr);
    assert.match(stderr, /ROUTE_UNCLASSIFIED:.*route validate.*route classify/);
    assert.doesNotMatch(stderr, /MALFORMED_ADAPTIVE_ROUTE/);
    return true;
  });
});
