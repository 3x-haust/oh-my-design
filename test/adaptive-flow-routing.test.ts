import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ADAPTIVE_ROUTE_RECORD_SCHEMA,
  ADAPTIVE_STAGE_GRAPH,
  ADAPTIVE_STAGE_IDS,
  AdaptiveRouteError,
  MANDATORY_ADAPTIVE_GATES,
  parseRouteRecord,
  pathsOutsideScope,
  routeAdaptiveFlow,
  validateAdaptiveStageGraph,
  validateAdaptiveStageOrder,
  type AdaptiveRouteErrorCode,
  type AdaptiveStageId,
} from '../core/route/index.ts';
import { validateAdaptiveStrategyRails } from '../core/route/adaptive-flow.ts';

const fixturePath = (name: string): string => fileURLToPath(new URL(`fixtures/adaptive-flow/${name}.json`, import.meta.url));
const fixture = (name: string): unknown => JSON.parse(readFileSync(fixturePath(name), 'utf8'));

function changed(name: string, update: (value: object) => void): unknown {
  const value: unknown = fixture(name);
  assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value));
  update(value);
  return value;
}

function routeError(run: () => unknown, code: AdaptiveRouteErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof AdaptiveRouteError);
    assert.equal(error.code, code);
    return true;
  });
}

test('copy-only work skips unnecessary discovery and design stages with written reasons', () => {
  const routed = routeAdaptiveFlow(fixture('copy-only'));

  assert.equal(routed.schema, ADAPTIVE_ROUTE_RECORD_SCHEMA);
  assert.equal(routed.strategy.owner, 'user-selected-model');
  assert.deepEqual(routed.strategy.roles, ['omd-writer', 'omd-hand', 'omd-eye']);
  assert.deepEqual(routed.strategy.stages, ['copy', 'production', 'browser-evidence', 'independent-review']);
  assert.deepEqual(routed.strategy.methods, [
    'design-strategy-balanced-delivery',
    'model-capability-probe',
    'evidence-claim-accounting',
    'decision-linked-browser-observation',
    'copy-repair-workflow',
  ]);
  assert.deepEqual(routed.strategy.skips.map((item) => item.id), [
    'reference-discovery', 'domain', 'depth', 'frame', 'acquisition', 'scout',
    'reference-board', 'reference-selection', 'art-direction', 'type-proof',
    'composition', 'candidate-generation', 'safety-validation', 'reflection-in-action',
    'reference-distance', 'image-first-draft', 'evidence-driven-refinement',
    'motion-one', 'ai-shipped-asset',
  ]);
  assert.equal(routed.strategy.skips.every((item) => item.reason.length > 0), true);
  assert.equal(routed.references.decision, 'skip');
  assert.equal(Object.hasOwn(routed.references, 'min'), false);
  assert.equal(Object.hasOwn(routed.references, 'max'), false);
  assert.equal(Object.hasOwn(routed.references, 'candidates'), false);
  assert.deepEqual(routed.gates.slice(0, MANDATORY_ADAPTIVE_GATES.length), MANDATORY_ADAPTIVE_GATES);
  assert.equal(routed.strategy.stages.at(-1), 'independent-review');
  assert.equal(routed.strategy.roles.at(-1), 'omd-eye');
});

test('medical new-product work keeps safety, UX, evidence, and review while preserving model order', () => {
  const routed = routeAdaptiveFlow(fixture('medical-new-product'));

  assert.equal(routed.strategy.owner, 'user-selected-model');
  assert.deepEqual(routed.strategy.roles, [
    'omd-framer', 'omd-scout', 'omd-composer', 'omd-writer', 'omd-hand', 'omd-eye',
  ]);
  assert.deepEqual(routed.strategy.stages, [
    'frame', 'scout', 'safety-validation', 'copy', 'composition',
    'production', 'browser-evidence', 'independent-review',
  ]);
  assert.ok(routed.strategy.methods.includes('design-strategy-safety-recovery'));
  assert.ok(routed.strategy.methods.includes('reference-discovery'));
  assert.ok(routed.strategy.methods.includes('rigorous-task-accessibility-validation'));
  assert.ok(routed.strategy.methods.includes('validated-learning:medical-recovery-copy'));
  assert.ok(routed.gates.includes('hard-safety:protect-patient-data'));
  assert.ok(routed.gates.includes('required-outcome:medication-error-recovery'));
  assert.deepEqual(routed.gates.slice(0, MANDATORY_ADAPTIVE_GATES.length), MANDATORY_ADAPTIVE_GATES);
  assert.equal(routed.strategy.stages.at(-2), 'browser-evidence');
  assert.equal(routed.strategy.stages.at(-1), 'independent-review');
});

test('thin and deep fixtures are observably adaptive without universal role, stage, reference, or candidate quotas', () => {
  const thin = routeAdaptiveFlow(fixture('copy-only'));
  const deep = routeAdaptiveFlow(fixture('medical-new-product'));

  assert.notDeepEqual(thin.strategy.roles, deep.strategy.roles);
  assert.notDeepEqual(thin.strategy.stages, deep.strategy.stages);
  assert.notDeepEqual(thin.strategy.methods, deep.strategy.methods);
  assert.equal(thin.references.decision, 'skip');
  assert.equal(deep.references.decision, 'discover');
  assert.deepEqual(thin.gates.slice(0, MANDATORY_ADAPTIVE_GATES.length), deep.gates.slice(0, MANDATORY_ADAPTIVE_GATES.length));
});

test('missing or malformed adaptive decision contexts fail closed', () => {
  routeError(() => routeAdaptiveFlow(null), 'MALFORMED_ADAPTIVE_ROUTE');
  routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
    Reflect.deleteProperty(value, 'browserDecisionContext');
  })), 'MALFORMED_ADAPTIVE_ROUTE');
  routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
    Reflect.set(value, 'unknownAuthority', 'replace-model');
  })), 'UNEXPECTED_ADAPTIVE_ROUTE_FIELD');
  routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
    Reflect.set(value, 'validatedLearningContext', { schema: 'adaptive-learning-context-v1', status: 'none', learningIds: [], reason: '' });
  })), 'ADAPTIVE_SKIP_REASON_REQUIRED');
});

test('optional stages cannot disappear without reasons and hard rails cannot become skips', () => {
  routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null && !Array.isArray(strategy));
    const skips = Reflect.get(strategy, 'skips');
    assert.ok(Array.isArray(skips));
    Reflect.set(strategy, 'skips', skips.filter((item) => typeof item === 'object' && item !== null && Reflect.get(item, 'id') !== 'composition'));
  })), 'OPTIONAL_SKIP_REASON_REQUIRED');

  routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null && !Array.isArray(strategy));
    const skips = Reflect.get(strategy, 'skips');
    assert.ok(Array.isArray(skips));
    skips.push({ id: 'final-evidence-v2', reason: 'Try to save time.' });
  })), 'HARD_GATE_CANNOT_SKIP');
});

test('high-risk safety and outcome gates fail closed instead of becoming optional methods', () => {
  routeError(() => routeAdaptiveFlow(changed('medical-new-product', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null && !Array.isArray(strategy));
    Reflect.set(strategy, 'stages', ['frame', 'scout', 'copy', 'composition', 'production', 'browser-evidence', 'independent-review']);
  })), 'SAFETY_WORK_REQUIRED');

  routeError(() => routeAdaptiveFlow(changed('medical-new-product', (value) => {
    const policy = Reflect.get(value, 'uxPolicy');
    assert.ok(typeof policy === 'object' && policy !== null && !Array.isArray(policy));
    Reflect.set(policy, 'decisions', [{ id: 'medication-error-recovery', kind: 'required_outcome', status: 'required' }]);
  })), 'SAFETY_WORK_REQUIRED');
});

test('every omitted optional stage or method is accounted for and selected stages retain their named owners', () => {
  routeError(() => routeAdaptiveFlow(changed('medical-new-product', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null && !Array.isArray(strategy));
    const skips = Reflect.get(strategy, 'skips');
    assert.ok(Array.isArray(skips));
    Reflect.set(strategy, 'skips', skips.filter((item) => typeof item === 'object' && item !== null && Reflect.get(item, 'id') !== 'domain'));
  })), 'OPTIONAL_SKIP_REASON_REQUIRED');

  routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null && !Array.isArray(strategy));
    const skips = Reflect.get(strategy, 'skips');
    assert.ok(Array.isArray(skips));
    Reflect.set(strategy, 'skips', skips.filter((item) => typeof item === 'object' && item !== null && Reflect.get(item, 'id') !== 'reference-distance'));
  })), 'OPTIONAL_SKIP_REASON_REQUIRED');

  routeError(() => routeAdaptiveFlow(changed('medical-new-product', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null && !Array.isArray(strategy));
    Reflect.set(strategy, 'roles', ['omd-framer', 'omd-scout', 'omd-writer', 'omd-hand', 'omd-eye']);
  })), 'MODEL_OWNER_REQUIRED');
});

test('production, linked evidence, independent review, scope, and model ownership remain mandatory', () => {
  const cases: readonly (readonly [string, unknown, AdaptiveRouteErrorCode])[] = [
    ['roles', ['omd-writer', 'omd-hand'], 'INDEPENDENT_REVIEW_REQUIRED'],
    ['stages', ['copy', 'production', 'independent-review'], 'FINAL_EVIDENCE_REQUIRED'],
    ['owner', 'coordinator-selected-model', 'MODEL_OWNER_REQUIRED'],
  ];
  for (const [field, replacement, code] of cases) {
    routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
      const strategy = Reflect.get(value, 'strategyDecision');
      assert.ok(typeof strategy === 'object' && strategy !== null && !Array.isArray(strategy));
      Reflect.set(strategy, field, replacement);
    })), code);
  }

  const routed = routeAdaptiveFlow(fixture('copy-only'));
  assert.deepEqual(pathsOutsideScope(routed, ['src/copy/Confirmation.tsx', '.omd/route.json', 'LICENSE']), ['LICENSE']);
});

test('execution waves enforce actual scout-writer concurrency and closed dependency-safe ownership', () => {
  const routed = routeAdaptiveFlow(fixture('medical-new-product'));
  assert.deepEqual(routed.strategy.executionWaves[1], {
    id: 'parallel-research-copy', mode: 'concurrent', roles: ['omd-scout', 'omd-writer'],
  });

  routeError(() => routeAdaptiveFlow(changed('medical-new-product', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null);
    Reflect.set(strategy, 'executionWaves', [
      { id: 'frame', mode: 'concurrent', roles: ['omd-framer'] },
      { id: 'scout', mode: 'concurrent', roles: ['omd-scout'] },
      { id: 'copy', mode: 'concurrent', roles: ['omd-writer'] },
      { id: 'composition', mode: 'concurrent', roles: ['omd-composer'] },
      { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
      { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
    ]);
  })), 'ADAPTIVE_EXECUTION_WAVE_INVALID');

  const mutations: readonly (readonly [string, readonly object[]])[] = [
    ['unknown role', [
      { id: 'work', mode: 'concurrent', roles: ['omd-writer', 'omd-invented'] },
      { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
      { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
    ]],
    ['non-concurrent mode', [
      { id: 'copy', mode: 'sequential', roles: ['omd-writer'] },
      { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
      { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
    ]],
    ['duplicate role', [
      { id: 'copy', mode: 'concurrent', roles: ['omd-writer'] },
      { id: 'again', mode: 'concurrent', roles: ['omd-writer'] },
      { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
      { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
    ]],
    ['missing role', [
      { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
      { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
    ]],
    ['duplicate wave id', [
      { id: 'work', mode: 'concurrent', roles: ['omd-writer'] },
      { id: 'work', mode: 'concurrent', roles: ['omd-hand'] },
      { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
    ]],
    ['dependency inversion', [
      { id: 'composition', mode: 'concurrent', roles: ['omd-composer'] },
      { id: 'inputs', mode: 'concurrent', roles: ['omd-framer', 'omd-scout', 'omd-writer'] },
      { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
      { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
    ]],
  ];
  for (const [label, executionWaves] of mutations) {
    routeError(() => routeAdaptiveFlow(changed(label === 'dependency inversion' ? 'medical-new-product' : 'copy-only', (value) => {
      const strategy = Reflect.get(value, 'strategyDecision');
      assert.ok(typeof strategy === 'object' && strategy !== null);
      Reflect.set(strategy, 'executionWaves', executionWaves);
    })), 'ADAPTIVE_EXECUTION_WAVE_INVALID');
  }
});

test('strategy roles and stages are closed, duplicate-free, and dependency ordered', () => {
  routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null);
    Reflect.set(strategy, 'roles', ['omd-writer', 'omd-invented', 'omd-hand', 'omd-eye']);
  })), 'UNKNOWN_ADAPTIVE_ROLE');
  routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null);
    Reflect.set(strategy, 'stages', ['copy', 'invented-stage', 'production', 'browser-evidence', 'independent-review']);
  })), 'UNKNOWN_ADAPTIVE_STAGE');
  routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null);
    Reflect.set(strategy, 'stages', ['copy', 'copy', 'production', 'browser-evidence', 'independent-review']);
  })), 'ADAPTIVE_STRATEGY_DUPLICATE');
  routeError(() => routeAdaptiveFlow(changed('medical-new-product', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null);
    Reflect.set(strategy, 'stages', [
      'frame', 'scout', 'safety-validation', 'composition', 'copy',
      'production', 'browser-evidence', 'independent-review',
    ]);
  })), 'ADAPTIVE_STAGE_ORDER_INVALID');
});

test('every topological permutation passes and every dependency inversion fails', () => {
  const nodes = ['frame', 'scout', 'safety-validation', 'copy', 'composition'] as const;
  const permutations = (values: readonly string[]): readonly (readonly string[])[] => values.length === 0
    ? [[]]
    : values.flatMap((value, index) => permutations(values.filter((_, item) => item !== index))
      .map((rest) => [value, ...rest]));
  let valid = 0;
  for (const order of permutations(nodes)) {
    const value = changed('medical-new-product', (input) => {
      const strategy = Reflect.get(input, 'strategyDecision');
      assert.ok(typeof strategy === 'object' && strategy !== null);
      Reflect.set(strategy, 'stages', [...order, 'production', 'browser-evidence', 'independent-review']);
    });
    const topological = order.indexOf('composition') > order.indexOf('frame')
      && order.indexOf('composition') > order.indexOf('scout')
      && order.indexOf('composition') > order.indexOf('copy');
    if (topological) {
      assert.doesNotThrow(() => routeAdaptiveFlow(value), order.join(' -> '));
      valid += 1;
    } else {
      routeError(() => routeAdaptiveFlow(value), 'ADAPTIVE_STAGE_ORDER_INVALID');
    }
  }
  assert.equal(valid, 30);
});

test('every graph edge accepts dependency order and rejects its inversion', () => {
  const base = routeAdaptiveFlow(fixture('copy-only')).strategy;
  const requiredClosure = (targets: readonly AdaptiveStageId[]): readonly AdaptiveStageId[] => {
    const ordered: AdaptiveStageId[] = [];
    const add = (stage: AdaptiveStageId): void => {
      for (const prerequisite of ADAPTIVE_STAGE_GRAPH[stage].prerequisites) add(prerequisite);
      if (!ordered.includes(stage)) ordered.push(stage);
    };
    for (const target of targets) add(target);
    return ordered;
  };
  for (const stage of ADAPTIVE_STAGE_IDS) {
    const node = ADAPTIVE_STAGE_GRAPH[stage];
    for (const dependency of [...node.prerequisites, ...node.afterIfSelected]) {
      const selected = requiredClosure([stage, dependency]);
      const ordered: AdaptiveStageId[] = [];
      while (ordered.length < selected.length) {
        const next = selected.find((candidate) => !ordered.includes(candidate)
          && [...ADAPTIVE_STAGE_GRAPH[candidate].prerequisites,
            ...ADAPTIVE_STAGE_GRAPH[candidate].afterIfSelected]
            .every((edge) => !selected.includes(edge) || ordered.includes(edge)));
        assert.ok(next, `${dependency} -> ${stage} must have a topological order`);
        ordered.push(next);
      }
      const valid = structuredClone(base);
      Reflect.set(valid, 'stages', ordered);
      assert.doesNotThrow(() => validateAdaptiveStageOrder(valid), `${dependency} -> ${stage}`);
      const invertedOrder = ordered.filter((item) => item !== stage && item !== dependency);
      const dependencyIndex = ordered.indexOf(dependency);
      invertedOrder.splice(dependencyIndex, 0, stage, dependency);
      const inverted = structuredClone(base);
      Reflect.set(inverted, 'stages', invertedOrder);
      routeError(() => validateAdaptiveStageOrder(inverted), 'ADAPTIVE_STAGE_ORDER_INVALID');
    }
  }
});

test('every required graph edge rejects its missing prerequisite', () => {
  const base = routeAdaptiveFlow(fixture('copy-only')).strategy;
  for (const stage of ADAPTIVE_STAGE_IDS) {
    for (const prerequisite of ADAPTIVE_STAGE_GRAPH[stage].prerequisites) {
      const missing = structuredClone(base);
      Reflect.set(missing, 'stages', [stage]);
      routeError(() => validateAdaptiveStageOrder(missing), 'ADAPTIVE_STAGE_ORDER_INVALID');
      assert.notEqual(prerequisite, stage);
    }
  }
});

test('every artifact-producing stage rejects a missing required prerequisite', () => {
  const base = routeAdaptiveFlow(fixture('copy-only')).strategy;
  const cases = [
    ['acquisition', 'omd-framer'],
    ['reference-board', 'omd-scout'],
    ['reference-selection', ''],
    ['type-proof', 'omd-typesetter'],
    ['composition', 'omd-composer'],
    ['candidate-generation', 'omd-sketch'],
  ] as const;
  for (const [stage, owner] of cases) {
    const strategy = structuredClone(base);
    if (owner !== '') Reflect.set(strategy, 'roles', [...strategy.roles, owner]);
    Reflect.set(strategy, 'stages', [stage, 'production', 'browser-evidence', 'independent-review']);
    routeError(() => validateAdaptiveStrategyRails(strategy), 'ADAPTIVE_STAGE_ORDER_INVALID');
  }
});

test('the closed graph audit rejects unknown edges and cycles', () => {
  const unknown = structuredClone(ADAPTIVE_STAGE_GRAPH);
  Reflect.set(unknown.composition, 'afterIfSelected', ['invented-stage']);
  routeError(() => validateAdaptiveStageGraph(unknown), 'UNKNOWN_ADAPTIVE_STAGE');

  const cyclic = structuredClone(ADAPTIVE_STAGE_GRAPH);
  Reflect.set(cyclic.frame, 'afterIfSelected', ['composition']);
  routeError(() => validateAdaptiveStageGraph(cyclic), 'ADAPTIVE_STAGE_ORDER_INVALID');
});

test('adaptive boundaries reject exotic objects, accessors, proxies, and invisible reasons', () => {
  const inheritedRoot = fixture('copy-only');
  assert.ok(typeof inheritedRoot === 'object' && inheritedRoot !== null);
  Object.setPrototypeOf(inheritedRoot, { widened: true });
  routeError(() => routeAdaptiveFlow(inheritedRoot), 'MALFORMED_ADAPTIVE_ROUTE');

  const inheritedProvider = changed('copy-only', (value) => {
    const capability = Reflect.get(value, 'modelCapability');
    assert.ok(typeof capability === 'object' && capability !== null);
    const routing = Reflect.get(capability, 'routingInput');
    assert.ok(typeof routing === 'object' && routing !== null);
    const selected = Reflect.get(routing, 'selectedModel');
    assert.ok(typeof selected === 'object' && selected !== null);
    Reflect.deleteProperty(selected, 'provider');
    Object.setPrototypeOf(selected, { provider: 'forged-provider' });
  });
  routeError(() => routeAdaptiveFlow(inheritedProvider), 'MALFORMED_ADAPTIVE_ROUTE');

  let getterCalls = 0;
  const accessor = changed('copy-only', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null);
    const skips = Reflect.get(strategy, 'skips');
    assert.ok(Array.isArray(skips));
    const first = skips[0];
    assert.ok(typeof first === 'object' && first !== null);
    Object.defineProperty(first, 'reason', { enumerable: true, get() { getterCalls += 1; return 'forged'; } });
  });
  routeError(() => routeAdaptiveFlow(accessor), 'MALFORMED_ADAPTIVE_ROUTE');
  assert.equal(getterCalls, 0);

  const proxied = changed('copy-only', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null);
    Reflect.set(value, 'strategyDecision', new Proxy(strategy, { ownKeys() { throw new Error('trap'); } }));
  });
  routeError(() => routeAdaptiveFlow(proxied), 'MALFORMED_ADAPTIVE_ROUTE');

  routeError(() => routeAdaptiveFlow(changed('copy-only', (value) => {
    const strategy = Reflect.get(value, 'strategyDecision');
    assert.ok(typeof strategy === 'object' && strategy !== null);
    const skips = Reflect.get(strategy, 'skips');
    assert.ok(Array.isArray(skips));
    const first = skips[0];
    assert.ok(typeof first === 'object' && first !== null);
    Reflect.set(first, 'reason', '\u0000\u00ad\u200b\u2800\u3164\ufe0f\uffa0');
  })), 'ADAPTIVE_SKIP_REASON_REQUIRED');
});

test('persisted route records cannot discard mandatory gates or terminal owners', () => {
  const withoutGate = structuredClone(routeAdaptiveFlow(fixture('copy-only')));
  Reflect.set(withoutGate, 'gates', withoutGate.gates.slice(1));
  routeError(() => parseRouteRecord(withoutGate), 'SOURCE_CONTRACT_MISMATCH');

  const withoutEye = structuredClone(routeAdaptiveFlow(fixture('copy-only')));
  Reflect.set(withoutEye.strategy, 'roles', withoutEye.strategy.roles.filter((role) => role !== 'omd-eye'));
  routeError(() => parseRouteRecord(withoutEye), 'INDEPENDENT_REVIEW_REQUIRED');
});
