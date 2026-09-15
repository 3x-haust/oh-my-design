import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  EntrySurfaceContractError,
  parseEntrySurfaceContract,
  requireEntrySurfaceOutcomeCoverage,
} from '../core/frame/entry-surface-contract.ts';
import { writeFrame } from '../core/frame/write.ts';
import {
  parseTaskFlowBenchmark,
  projectTaskFlowBenchmark,
} from '../core/ref/task-flow-benchmark.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import {
  deriveTrustedEvaluationPlan,
  deriveTrustedEvaluationPlanFromProject,
  TrustedEvaluationPlanError,
} from '../core/runtime/trusted-evaluation-plan.ts';
import {
  parseTrustedLifecycleManifest,
  trustedEvaluationPlanBytes,
} from '../core/runtime/trusted-evaluation-contract.ts';
import { runTrustedLifecycle } from '../adapters/trusted-lifecycle-runtime.ts';
import { redactObservationEvidence } from '../core/runtime/observation.ts';
import { writeBrowserDecisionFixture } from './helpers/browser-observation-decision-links.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectWriteAdapter,
  publishTestAdaptiveRoute,
} from './helpers/project-write.ts';

const fixtureUrl = new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url);
const routeInput = (): Record<string, unknown> => {
  const value = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as Record<string, unknown>;
  value.request = 'Build a fixture-labelled cold-chain exception work screen.';
  value.allowedPaths = ['src/cold-chain/**'];
  value.taskOutcome = taskOutcome;
  return value;
};
const taskOutcome = {
  schema: 'task-outcome-contract-v1' as const,
  goal: 'Inspect recorded temperature evidence before choosing a disposition.',
  mustHave: ['Temperature evidence can be inspected before disposition.'],
  mustNotHave: ['Do not claim that the shipment is ready for release.'],
  completionEvidence: ['The inspection consequence is visible at both required viewports.'],
  strategyFreedom: ['Choose the quiet product composition without inventing shipment facts.'],
  executionRequirements: [{
    requirement: 'Use the authorized writer and complete independent review and terminal preflight.',
    enforcedBy: ['project-write-boundary', 'independent-review', 'completion-preflight'] as const,
  }],
};
const defaultTaskIds = ['inspect-temperature-evidence', 'record-disposition-result'] as const;
const entrySurfaceInput = (taskIds: readonly [string, string] = defaultTaskIds) => ({
  schema: 'entry-surface-contract-v1',
  entryPath: 'src/cold-chain/index.html',
  prerequisiteTaskId: taskIds[0],
  dependentTaskId: taskIds[1],
  purposeText: 'Resolve cold-chain shipment exceptions',
  workObjectAnchorText: 'Shipment under review',
  nextActionName: 'Choose disposition',
  beforeText: 'Temperature evidence required',
  afterText: 'Qualified determination required',
  outcomeWitnesses: [
    {
      kind: 'mustHave', index: 0, phase: 'after-prerequisite', assertion: 'visible-text',
      target: 'consequence',
    },
    {
      kind: 'mustNotHave', index: 0, phase: 'initial', assertion: 'absent-text',
      target: 'body',
    },
    {
      kind: 'completionEvidence', index: 0, phase: 'after-prerequisite', assertion: 'visible-text',
      target: 'consequence',
    },
  ],
});

function projection(sourceContractSha256: string, taskIds: readonly [string, string] = defaultTaskIds, surface: 'product' | 'editorial' = 'product') {
  return projectTaskFlowBenchmark(parseTaskFlowBenchmark({
    schema: 'task-flow-benchmark-v1',
    surface,
    domain: 'cold-chain-shipment-exception',
    sourceContractSha256,
    sources: [
      {
        id: 'authority-a', url: 'https://example.com/authority-a', observedAt: '2026-09-02',
        observedPatterns: ['temperature evidence precedes disposition'],
        forbiddenTransfers: ['identity and policy'],
      },
      {
        id: 'authority-b', url: 'https://example.org/authority-b', observedAt: '2026-09-02',
        observedPatterns: ['unresolved goods remain on hold'],
        forbiddenTransfers: ['thresholds and operational claims'],
      },
    ],
    taskSteps: [
      {
        id: taskIds[0], intent: 'inspect supplied temperature evidence',
        dependsOn: [], evidenceSourceIds: ['authority-a', 'authority-b'],
      },
      {
        id: taskIds[1], intent: 'record a qualified disposition result',
        dependsOn: [taskIds[0]], evidenceSourceIds: ['authority-a', 'authority-b'],
      },
    ],
    counterexamples: [
      {
        id: 'premature-disposition', reason: 'unlocks disposition before evidence review',
        evidenceSourceIds: ['authority-a'],
      },
      {
        id: 'automatic-release', reason: 'turns an alert into a release decision',
        evidenceSourceIds: ['authority-b'],
      },
    ],
  }));
}

test('entry-surface contract is selector-free, closed, and outcome-complete', () => {
  const contract = parseEntrySurfaceContract(entrySurfaceInput());
  assert.doesNotThrow(() => requireEntrySurfaceOutcomeCoverage(contract, taskOutcome));
  assert.equal(JSON.stringify(contract).includes('selector'), false);

  assert.throws(
    () => parseEntrySurfaceContract({ ...entrySurfaceInput(), selector: '#caller-answer' }),
    (error: unknown) => error instanceof EntrySurfaceContractError
      && error.code === 'MALFORMED_ENTRY_SURFACE_CONTRACT',
  );
  const freeText = entrySurfaceInput();
  Object.assign(freeText.outcomeWitnesses[0]!, { text: 'easy caller-authored answer' });
  assert.throws(
    () => parseEntrySurfaceContract(freeText),
    (error: unknown) => error instanceof EntrySurfaceContractError
      && error.code === 'MALFORMED_ENTRY_SURFACE_CONTRACT',
  );
  assert.throws(
    () => requireEntrySurfaceOutcomeCoverage(
      parseEntrySurfaceContract({
        ...entrySurfaceInput(),
        outcomeWitnesses: entrySurfaceInput().outcomeWitnesses.slice(0, 2),
      }),
      taskOutcome,
    ),
    (error: unknown) => error instanceof EntrySurfaceContractError
      && error.code === 'INCOMPLETE_ENTRY_SURFACE_OUTCOME_COVERAGE',
  );

  const consequenceOnly = parseEntrySurfaceContract({
    ...entrySurfaceInput(),
    nextActionName: null,
  });
  assert.equal(consequenceOnly.nextActionName, null);
  assert.throws(
    () => parseEntrySurfaceContract({
      ...entrySurfaceInput(),
      nextActionName: null,
      outcomeWitnesses: entrySurfaceInput().outcomeWitnesses.map((item, index) =>
        index === 0 ? { ...item, target: 'nextAction' } : item),
    }),
    (error: unknown) => error instanceof EntrySurfaceContractError
      && error.code === 'MALFORMED_ENTRY_SURFACE_CONTRACT',
  );
});

test('entry witnesses preserve canonical frame task IDs without admitting arbitrary uppercase selectors', () => {
  const input = entrySurfaceInput(['T2', 'T3']);
  const parsed = parseEntrySurfaceContract(input);
  assert.equal(parsed.prerequisiteTaskId, 'T2');
  assert.equal(parsed.dependentTaskId, 'T3');
  assert.doesNotThrow(() => requireEntrySurfaceOutcomeCoverage(parsed, taskOutcome));

  for (const invalidId of ['T0', 'T01', 'T-2', 'Task2', 'T2"]', `T${'2'.repeat(64)}`]) {
    assert.throws(
      () => parseEntrySurfaceContract({ ...input, prerequisiteTaskId: invalidId }),
      (error: unknown) => error instanceof EntrySurfaceContractError
        && error.code === 'MALFORMED_ENTRY_SURFACE_CONTRACT',
      invalidId,
    );
  }
});

test('observation redaction preserves valid frame IDs only in the typed task fields', () => {
  const taskId = `T${'2'.repeat(30)}`;
  assert.deepEqual(redactObservationEvidence({
    prerequisiteTaskId: taskId,
    dependentTaskId: 'T3',
    note: taskId,
    token: taskId,
  }), {
    prerequisiteTaskId: taskId,
    dependentTaskId: 'T3',
    note: '[REDACTED]',
    token: '[REDACTED]',
  });
});

test('trusted plan derives every selector and outcome script from semantic records', () => {
  const sourceContractSha256 = 'a'.repeat(64);
  const benchmarkProjection = projection(sourceContractSha256);
  const benchmarkBytes = Buffer.from(`${JSON.stringify(benchmarkProjection)}\n`);
  const manifest = deriveTrustedEvaluationPlan({
    sourceContractSha256,
    taskOutcome,
    evidenceClaims: {
      schema: 'evidence-claim-publication-v1',
      claims: [{
        id: 'fixture-task', text: 'The user requested a cold-chain exception fixture.',
        status: 'confirmed', userEvidence: [{
          kind: 'explicit-user-evidence', source: 'user-message', reference: 'message-1',
          excerpt: 'cold-chain shipment exceptions',
        }],
      }],
      userFacts: ['fixture-task'],
      workingContext: [],
    },
    allowedPaths: ['src/cold-chain/**'],
    entrySurface: parseEntrySurfaceContract(entrySurfaceInput()),
    benchmarkProjection,
    benchmarkProjectionSha256: createHash('sha256').update(benchmarkBytes).digest('hex'),
  });

  assert.deepEqual(manifest.scripts.map(({ outcomeRef }) => outcomeRef), [
    'mustHave:0', 'mustNotHave:0', 'completionEvidence:0',
  ]);
  assert.deepEqual(manifest.scripts[0]?.actions, [{
    kind: 'click', selector: '[data-omd-task-id="inspect-temperature-evidence"]',
  }]);
  assert.equal(manifest.scripts[1]?.assertions[0]?.selector, 'body');
  assert.equal(manifest.scripts[1]?.assertions[0]?.text, taskOutcome.mustNotHave[0]);
  assert.deepEqual(manifest.scripts[2]?.actions, []);
  assert.equal(
    manifest.entrySurface?.consequence.selector,
    '[data-omd-consequence-for="record-disposition-result"]',
  );
  assert.equal(JSON.stringify(entrySurfaceInput()).includes('data-omd'), false);

  const consequenceOnly = deriveTrustedEvaluationPlan({
    sourceContractSha256,
    taskOutcome,
    evidenceClaims: {
      schema: 'evidence-claim-publication-v1',
      claims: [{
        id: 'fixture-task', text: 'The user requested a cold-chain exception fixture.',
        status: 'confirmed', userEvidence: [{
          kind: 'explicit-user-evidence', source: 'user-message', reference: 'message-1',
          excerpt: 'cold-chain shipment exceptions',
        }],
      }],
      userFacts: ['fixture-task'], workingContext: [],
    },
    allowedPaths: ['src/cold-chain/**'],
    entrySurface: parseEntrySurfaceContract({ ...entrySurfaceInput(), nextActionName: null }),
    benchmarkProjection,
    benchmarkProjectionSha256: createHash('sha256').update(benchmarkBytes).digest('hex'),
  });
  assert.equal(consequenceOnly.entrySurface?.nextAction, undefined);
});

for (const taskIds of [defaultTaskIds, ['T2', 'T3'] as const]) {
test(`routed lifecycle preserves ${taskIds[0]} and rejects a substituted plan on its real surface`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-trusted-plan-browser-'));
  try {
    const invocation = publishTestAdaptiveRoute(root, routeInput(), 'trusted-plan-browser');
    const route = readPersistedRoute(root, invocation);
    const writer = createTestProjectWriteAdapter(root, invocation);
    writeFrame(root, {
      why: 'The user requires evidence inspection before disposition.',
      uxSurface: 'product',
      entrySurface: parseEntrySurfaceContract(entrySurfaceInput(taskIds)),
    }, '# Cold-chain fixture frame', writer);
    writer.write(
      '.omd/task-flow-benchmark-projection.json',
      `${JSON.stringify(projection(route.sourceContractSha256, taskIds))}\n`,
    );
    writer.mkdir('src/cold-chain');
    writer.write('src/cold-chain/index.html', [
      '<!doctype html><html><body><main data-screen="exception">',
      '<h1 data-omd-purpose>Resolve cold-chain shipment exceptions</h1>',
      '<section data-omd-work-object>',
      '<h2 data-omd-work-anchor>Shipment under review</h2>',
      `<p data-omd-consequence-for="${taskIds[1]}">Temperature evidence required</p>`,
      `<button data-omd-task-id="${taskIds[0]}">Inspect temperature evidence</button>`,
      '<button data-omd-next-action disabled>Choose disposition</button>',
      '</section></main><script>',
      `document.querySelector("[data-omd-task-id=${taskIds[0]}]").onclick=()=>{`,
      `document.querySelector("[data-omd-consequence-for=${taskIds[1]}]").textContent="Qualified determination required";`,
      'document.querySelector("[data-omd-next-action]").disabled=false;',
      '};</script></body></html>',
    ].join(''));
    writeBrowserDecisionFixture(root);
    const plan = deriveTrustedEvaluationPlanFromProject({ root, invocation });
    const manifestPath = join(root, '.omd/.cache/trusted-lifecycle-manifest.json');
    writer.mkdir('.omd/.cache');
    writer.write(
      '.omd/.cache/trusted-lifecycle-manifest.json',
      trustedEvaluationPlanBytes(plan),
    );
    const forgedPlan = parseTrustedLifecycleManifest({
      ...plan,
      entrySurface: {
        ...plan.entrySurface,
        purpose: { ...plan.entrySurface?.purpose, selector: 'h1' },
      },
    });
    authorizeTestProjectRunPayloads(root, invocation, [plan, forgedPlan].map((payload) => ({
      purpose: 'product-probe-result' as const,
      payload: trustedEvaluationPlanBytes(payload),
    })));

    const result = await runTrustedLifecycle({
      project: root,
      manifestPath,
      cliPath: new URL('../bin/omd.ts', import.meta.url).pathname,
      argv: ['lifecycle', 'run'],
      invocation,
    });
    assert.equal(result.status, 'PASS');
    assert.equal(result.readyForFinalization, true);

    writer.write(
      '.omd/.cache/forged-manifest.json',
      trustedEvaluationPlanBytes(forgedPlan),
    );
    await assert.rejects(
      () => runTrustedLifecycle({
        project: root,
        manifestPath: join(root, '.omd/.cache/forged-manifest.json'),
        cliPath: new URL('../bin/omd.ts', import.meta.url).pathname,
        argv: ['lifecycle', 'run'],
        invocation,
      }),
      /TRUSTED_EVALUATION_PLAN_DERIVATION_MISMATCH/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
}

for (const surface of ['product', 'editorial'] as const) {
test(`project derivation binds the current route, ${surface} frame, and benchmark bytes`, () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-trusted-plan-project-'));
  try {
    const invocation = publishTestAdaptiveRoute(root, routeInput(), 'trusted-plan-project');
    const route = readPersistedRoute(root, invocation);
    const writer = createTestProjectWriteAdapter(root, invocation);
    writeFrame(root, {
      why: 'The user requires evidence inspection before disposition.',
      uxSurface: surface,
      entrySurface: parseEntrySurfaceContract(entrySurfaceInput()),
    }, '# Cold-chain fixture frame', writer);
    const benchmarkProjection = projection(route.sourceContractSha256, defaultTaskIds, surface);
    writer.write(
      '.omd/task-flow-benchmark-projection.json',
      `${JSON.stringify(benchmarkProjection)}\n`,
    );

    const manifest = deriveTrustedEvaluationPlanFromProject({ root, invocation });
    assert.equal(manifest.entryPath, 'src/cold-chain/index.html');
    assert.equal(manifest.entrySurface?.dependentTaskId, 'record-disposition-result');
    assert.equal(manifest.scripts.length, 3);

    const stale = projection('b'.repeat(64), defaultTaskIds, surface);
    writeFileSync(
      join(root, '.omd/task-flow-benchmark-projection.json'),
      `${JSON.stringify(stale)}\n`,
    );
    assert.throws(
      () => deriveTrustedEvaluationPlanFromProject({ root, invocation }),
      (error: unknown) => error instanceof TrustedEvaluationPlanError
        && error.code === 'TRUSTED_EVALUATION_PLAN_BENCHMARK_INVALID',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
}

test('trusted plan rejects a benchmark that does not own the direct task edge', () => {
  const sourceContractSha256 = 'a'.repeat(64);
  const current = projection(sourceContractSha256);
  const benchmarkProjection = {
    ...current,
    taskSteps: current.taskSteps.map((step) => step.id === 'record-disposition-result'
      ? { ...step, dependsOn: [] }
      : step),
  };
  assert.throws(
    () => deriveTrustedEvaluationPlan({
      sourceContractSha256,
      taskOutcome,
      evidenceClaims: {
        schema: 'evidence-claim-publication-v1', claims: [], userFacts: [], workingContext: [],
      },
      allowedPaths: ['src/cold-chain/**'],
      entrySurface: parseEntrySurfaceContract(entrySurfaceInput()),
      benchmarkProjection,
      benchmarkProjectionSha256: 'b'.repeat(64),
    }),
    (error: unknown) => error instanceof TrustedEvaluationPlanError
      && error.code === 'TRUSTED_EVALUATION_PLAN_EDGE_INVALID',
  );
});
