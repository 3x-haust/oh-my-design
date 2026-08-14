import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DESIGN_AXIS_INPUT_SCHEMA,
  DesignAxisRoutingError,
  parseDesignAxisInput,
  routeDesignAxes,
  routeReferenceDiscovery,
  routeTaskOutcome,
  type DesignAxisRoutingErrorCode,
} from '../core/route/index.ts';
import { TASK_OUTCOME_CONTRACT_SCHEMA } from '../core/brief/task-outcome.ts';
import { UX_POLICY_SCHEMA, checkUxPolicy, parseUxPolicy } from '../core/ux/index.ts';

const fixturePath = (name: string): string => fileURLToPath(new URL(`fixtures/design-axis/${name}.json`, import.meta.url));
const fixture = (name: string): unknown => JSON.parse(readFileSync(fixturePath(name), 'utf8'));

function fixtureWith(name: string, key: PropertyKey, value: unknown): object {
  const input = fixture(name);
  assert.ok(typeof input === 'object' && input !== null);
  Object.defineProperty(input, key, { value, enumerable: true, configurable: true, writable: true });
  return input;
}

function assertRoutingError(run: () => unknown, code: DesignAxisRoutingErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof DesignAxisRoutingError);
    assert.equal(error.name, 'DesignAxisRoutingError');
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test('admin, medical, and campaign fixtures route to distinct observable strategies', () => {
  const admin = routeDesignAxes(fixture('admin'));
  const medical = routeDesignAxes(fixture('medical'));
  const campaign = routeDesignAxes(fixture('campaign'));

  assert.equal(admin.strategy.method, 'operational-ux');
  assert.equal(admin.strategy.failureHandling, 'error-prevention-and-recovery');
  assert.equal(admin.strategy.expressiveDirection, 'restrained-system');

  assert.equal(medical.strategy.method, 'safety-recovery');
  assert.equal(medical.strategy.failureHandling, 'safety-critical-recovery-validation');
  assert.equal(medical.strategy.uxRigor, 'rigorous-task-accessibility-validation');
  assert.equal(medical.strategy.expressiveDirection, 'restrained-system');

  assert.equal(campaign.strategy.method, 'expressive-campaign');
  assert.equal(campaign.strategy.taskExecution, 'system-scale');
  assert.equal(campaign.strategy.uxRigor, 'rigorous-task-accessibility-validation');
  assert.equal(campaign.strategy.expressiveDirection, 'showpiece-with-accessible-motion');
  assert.equal(campaign.strategy.accessibility, 'required');

  assert.equal(new Set([admin.strategy.method, medical.strategy.method, campaign.strategy.method]).size, 3);
});

test('all four axes remain explicit and independent in parsed input and routed output', () => {
  const parsed = parseDesignAxisInput(fixture('campaign'));
  const routed = routeDesignAxes(fixture('campaign'));

  assert.deepEqual(parsed, {
    schema: DESIGN_AXIS_INPUT_SCHEMA,
    taskSize: 'large',
    failureRisk: 'moderate',
    uxNeed: 'rigorous',
    expressiveDesignNeed: 'showpiece',
  });
  assert.deepEqual(routed.axes, {
    taskSize: 'large',
    failureRisk: 'moderate',
    uxNeed: 'rigorous',
    expressiveDesignNeed: 'showpiece',
  });
  assert.equal(Object.hasOwn(routed.axes, 'score'), false);
  assert.equal(Object.hasOwn(routed.strategy, 'score'), false);
  assert.equal(Object.hasOwn(routed.strategy, 'intensity'), false);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(routed), true);
  assert.equal(Object.isFrozen(routed.axes), true);
  assert.equal(Object.isFrozen(routed.strategy), true);
  assert.equal(Object.isFrozen(routed.strategy.recommendation), true);
});

test('UX rigor and expressive quality do not average into one scalar', () => {
  const admin = routeDesignAxes(fixture('admin'));
  const campaign = routeDesignAxes(fixture('campaign'));
  const medical = routeDesignAxes(fixture('medical'));

  assert.equal(admin.axes.uxNeed, campaign.axes.uxNeed);
  assert.notEqual(admin.axes.expressiveDesignNeed, campaign.axes.expressiveDesignNeed);
  assert.equal(admin.strategy.uxRigor, campaign.strategy.uxRigor);
  assert.notEqual(admin.strategy.expressiveDirection, campaign.strategy.expressiveDirection);

  assert.equal(admin.axes.expressiveDesignNeed, medical.axes.expressiveDesignNeed);
  assert.notEqual(admin.axes.failureRisk, medical.axes.failureRisk);
  assert.equal(admin.strategy.expressiveDirection, medical.strategy.expressiveDirection);
  assert.notEqual(admin.strategy.failureHandling, medical.strategy.failureHandling);
});

test('routing recommendations compose with outcome, reference, policy, and model ownership contracts', () => {
  const outcome = routeTaskOutcome({
    schema: TASK_OUTCOME_CONTRACT_SCHEMA,
    goal: 'Publish a legible campaign landing page.',
    mustHave: ['Keyboard access remains complete.'],
    mustNotHave: ['Do not remove reduced-motion support.'],
    completionEvidence: ['Desktop and mobile task probes pass.'],
    strategyFreedom: ['Choose the visual composition.'],
  });
  const reference = routeReferenceDiscovery({
    schema: 'reference-discovery-input-v1',
    taskNeed: 'new-product',
    uncertainty: 'unresolved',
    existingEvidence: 'none',
    intendedUse: 'Establish an evidence-backed campaign direction.',
    existingEvidenceUse: null,
    skipReason: null,
  });
  const axes = routeDesignAxes(fixture('campaign'));
  const checked = checkUxPolicy(parseUxPolicy({
    schema: UX_POLICY_SCHEMA,
    decisions: [axes.strategy.recommendation, reference.recommendation],
  }));

  assert.equal(outcome.strategy.owner, 'user-selected-model');
  assert.equal(axes.strategy.owner, outcome.strategy.owner);
  assert.deepEqual(checked.recommendations.map((item) => item.id), [
    'design-strategy-expressive-campaign',
    'reference-discovery',
  ]);
  assert.equal(checked.recommendations.every((item) => item.status === 'selected'), true);
});

test('routing returns a detached immutable snapshot of mutable input', () => {
  const input = {
    schema: 'design-axis-input-v1',
    taskSize: 'medium',
    failureRisk: 'moderate',
    uxNeed: 'rigorous',
    expressiveDesignNeed: 'restrained',
  };
  const parsed = parseDesignAxisInput(input);
  const routed = routeDesignAxes(input);

  input.taskSize = 'large';
  input.failureRisk = 'high';
  input.uxNeed = 'baseline';
  input.expressiveDesignNeed = 'showpiece';

  assert.deepEqual(parsed, {
    schema: DESIGN_AXIS_INPUT_SCHEMA,
    taskSize: 'medium',
    failureRisk: 'moderate',
    uxNeed: 'rigorous',
    expressiveDesignNeed: 'restrained',
  });
  assert.deepEqual(routed.axes, {
    taskSize: 'medium',
    failureRisk: 'moderate',
    uxNeed: 'rigorous',
    expressiveDesignNeed: 'restrained',
  });
});

test('unknown, hidden, and Symbol own keys fail closed', () => {
  assertRoutingError(
    () => parseDesignAxisInput(fixtureWith('admin', 'extra', true)),
    'UNEXPECTED_DESIGN_AXIS_FIELD',
  );

  const hidden = fixture('admin');
  assert.ok(typeof hidden === 'object' && hidden !== null);
  Object.defineProperty(hidden, 'concealed', { value: true });
  assertRoutingError(() => routeDesignAxes(hidden), 'UNEXPECTED_DESIGN_AXIS_FIELD');

  const symbol = fixture('admin');
  assert.ok(typeof symbol === 'object' && symbol !== null);
  Object.defineProperty(symbol, Symbol('concealed'), { value: true });
  assertRoutingError(() => routeDesignAxes(symbol), 'UNEXPECTED_DESIGN_AXIS_FIELD');
});

test('accessors and hostile proxies fail closed without executing field getters', () => {
  let getterRead = false;
  const accessor = fixture('admin');
  assert.ok(typeof accessor === 'object' && accessor !== null);
  Object.defineProperty(accessor, 'failureRisk', {
    enumerable: true,
    get: () => {
      getterRead = true;
      return 'low';
    },
  });
  assertRoutingError(() => parseDesignAxisInput(accessor), 'MALFORMED_DESIGN_AXIS_INPUT');
  assert.equal(getterRead, false);

  const hostile = new Proxy({}, {
    ownKeys: () => { throw new Error('proxy trap'); },
  });
  assertRoutingError(() => routeDesignAxes(hostile), 'MALFORMED_DESIGN_AXIS_INPUT');
});

test('invalid axis values have stable typed errors', () => {
  const invalid = [
    ['taskSize', 'enormous', 'INVALID_TASK_SIZE'],
    ['failureRisk', 'catastrophic', 'INVALID_FAILURE_RISK'],
    ['uxNeed', 'award-winning', 'INVALID_UX_NEED'],
    ['expressiveDesignNeed', 'eleven', 'INVALID_EXPRESSIVE_DESIGN_NEED'],
  ];

  for (const [key, value, code] of invalid) {
    assert.ok(typeof key === 'string');
    assert.ok(typeof code === 'string');
    switch (code) {
      case 'INVALID_TASK_SIZE':
      case 'INVALID_FAILURE_RISK':
      case 'INVALID_UX_NEED':
      case 'INVALID_EXPRESSIVE_DESIGN_NEED':
        assertRoutingError(() => routeDesignAxes(fixtureWith('admin', key, value)), code);
        break;
      default:
        assert.fail(`unexpected test error code ${code}`);
    }
  }
});

test('malformed shapes and contradictory high-risk UX states fail closed', () => {
  assertRoutingError(() => routeDesignAxes(null), 'MALFORMED_DESIGN_AXIS_INPUT');
  assertRoutingError(() => routeDesignAxes([]), 'MALFORMED_DESIGN_AXIS_INPUT');
  assertRoutingError(() => routeDesignAxes(fixtureWith('admin', 'schema', 'future-schema')), 'MALFORMED_DESIGN_AXIS_INPUT');

  const missing = fixture('admin');
  assert.ok(typeof missing === 'object' && missing !== null);
  assert.equal(Reflect.deleteProperty(missing, 'uxNeed'), true);
  assertRoutingError(() => routeDesignAxes(missing), 'MALFORMED_DESIGN_AXIS_INPUT');

  for (const uxNeed of ['baseline', 'focused']) {
    assertRoutingError(() => routeDesignAxes({
      schema: DESIGN_AXIS_INPUT_SCHEMA,
      taskSize: 'medium',
      failureRisk: 'high',
      uxNeed,
      expressiveDesignNeed: 'restrained',
    }), 'CONTRADICTORY_DESIGN_AXIS_STATE');
  }
});
