import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateTrustedOutcomeEvidence } from '../core/evidence/final-v2-outcome-gate.ts';
import { validateFinalBrowserObservations } from '../core/evidence/final-v2-browser-observations.ts';
import { nodeStableProjectFileSystem } from '../core/runtime/stable-project-file.ts';
import { runTrustedLifecycle } from '../adapters/trusted-lifecycle-runtime.ts';
import {
  parseTrustedLifecycleManifest,
  trustedEvaluationPlanBytes,
} from '../core/runtime/trusted-evaluation-contract.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { observationV2Sha256, writeObservationV2, type ObservationV2 } from '../core/runtime/observation.ts';
import {
  checkAdaptiveWorkflowProductionReadiness,
  publishAdaptiveWorkflowPlan,
  publishAdaptiveWorkflowProductionReadiness,
  publishAdaptiveWorkflowProductionSlice,
} from '../core/design-development/workflow-persistence.ts';
import {
  ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_INPUT_SCHEMA,
  createWorkflowProductionSlice,
  workflowProductionSliceBytes,
} from '../core/design-development/production-slice.ts';
import {
  applyProductionRepair,
  productionRepairReviewBytes,
  stageProductionRepair,
  type ProductionRepairReview,
} from '../core/runtime/production-repair.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectWriteAdapter,
  publishTestAdaptiveRoute,
} from './helpers/project-write.ts';

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const routeFixture = (): unknown => JSON.parse(
  readFileSync(new URL('./fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'),
);

function publishRepairSlice(root: string, invocation: ReturnType<typeof publishTestAdaptiveRoute>): void {
  const writer = createTestProjectWriteAdapter(root, invocation);
  const evidencePath = '.omd/workflow-evidence.json';
  writeFileSync(join(root, evidencePath), '{"risk":"component context"}\n');
  publishAdaptiveWorkflowPlan(root, {
    development: {
      schema: 'design-development-contract-v1', owner: 'user-selected-model', mode: 'investigate',
      risks: [{ id: 'risk:component', question: 'Does repair preserve context?', consequence: 'high', uncertainty: 'high', lateReversalCost: 'high' }],
      investigations: [{ id: 'probe:component', kind: 'component-in-context', riskIds: ['risk:component'], question: 'Does the repaired source work in context?', fidelity: { content: 'representative', visual: 'representative', interaction: 'interactive', behavior: 'representative', environment: 'responsive-browser' }, stopWhen: 'The repaired source passes.' }],
      referencePrinciples: [], rationale: 'Repair is restricted to an authenticated production slice.',
    },
    evidence: [{ id: 'evidence:component', kind: 'component-impact', value: 'context-risk', source: { path: evidencePath, schema: 'workflow-evidence-v1', sha256: sha(readFileSync(join(root, evidencePath))), locator: '/risk' } }],
    investigations: [{ id: 'probe:component', evidenceIds: ['evidence:component'] }], rationale: 'Bind the repair to production and context sources.',
  }, writer, invocation);
  publishAdaptiveWorkflowProductionReadiness(root, { schema: 'adaptive-workflow-production-readiness-input-v1', artifacts: [], reviews: [] }, writer, invocation);
  const input = { schema: ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_INPUT_SCHEMA, slices: [{ investigationId: 'probe:component', component: { sourcePath: 'src/copy/index.html', selector: 'h1', contractSha256: sha('contract') }, representativeContext: { sourcePath: 'src/copy/context.html', route: '/', selector: 'body' } }] };
  const current = checkAdaptiveWorkflowProductionReadiness(root, invocation);
  const expected = createWorkflowProductionSlice({
    route: current.plan.route,
    plan: current.planReceipt as { path: string; schema: 'adaptive-workflow-plan-v1'; sha256: string },
    readiness: current.readinessReceipt as { path: string; schema: 'adaptive-workflow-production-readiness-v1'; sha256: string },
    owner: { role: 'omd-hand', ...invocation.current }, slices: input.slices,
    readSource: (path) => readFileSync(join(root, path)),
  });
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'workflow-production-slice', payload: workflowProductionSliceBytes(expected) }]);
  publishAdaptiveWorkflowProductionSlice(root, input, writer, invocation);
}

function contract(): unknown {
  return {
    schema: 'trusted-project-contract-v1',
    taskOutcome: {
      schema: 'task-outcome-contract-v1',
      goal: 'Show approved copy',
      mustHave: ['Approved copy is visible'],
      mustNotHave: ['Draft copy must not remain'],
      completionEvidence: ['Visible approved heading'],
      strategyFreedom: ['Visual treatment'],
    },
    evidenceClaims: {
      schema: 'evidence-claim-publication-v1',
      claims: [{
        id: 'approved-copy',
        text: 'Approved is the required copy.',
        status: 'confirmed',
        userEvidence: [{
          kind: 'explicit-user-evidence',
          source: 'user-message',
          reference: 'vertical:1',
          excerpt: 'Show approved copy.',
        }],
      }],
      userFacts: ['approved-copy'],
      workingContext: [],
    },
    allowedPaths: ['src/copy/**'],
    decisionRefs: ['decision:approved-copy-visible'],
  };
}

const lifecycle = async (
  root: string,
  manifestPath: string,
  invocation?: ProjectRunInvocation,
): Promise<Readonly<{ status: 'PASS' | 'FAIL'; observationPath: string }>> => {
  const cliPath = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));
  if (invocation !== undefined) {
    const result = await runTrustedLifecycle({ project: root, manifestPath, cliPath, argv: [], invocation });
    assert.equal(result.readyForFinalization, true);
    return { status: result.status, observationPath: result.observationPath };
  }
  const result = spawnSync(process.execPath, [cliPath, 'lifecycle', 'run', '--project', root, '--manifest', manifestPath], { cwd: root, encoding: 'utf8' });
  assert.match(result.stdout, /EVALUATION: (?:PASS|FAIL)/, `${result.stderr}\n${result.stdout}`);
  const observation = /observation: (.+)/.exec(result.stdout)?.[1];
  assert.ok(observation);
  return {
    status: result.stdout.includes('EVALUATION: PASS') ? 'PASS' : 'FAIL',
    observationPath: observation,
  };
};

test('broken production is repaired, re-observed, and accepted by the trusted final gate', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-trusted-vertical-loop-'));
  try {
    mkdirSync(join(root, 'src', 'copy'), { recursive: true });
    mkdirSync(join(root, '.omd'));
    writeFileSync(
      join(root, 'src', 'copy', 'index.html'),
      '<!doctype html><button>Check</button><h1>Draft</h1>',
    );
    writeFileSync(join(root, 'src', 'copy', 'context.html'), '<!doctype html><main>Context</main>');
    writeFileSync(join(root, '.omd', 'trusted-lifecycle-contract.json'), JSON.stringify(contract()));
    const manifestPath = join(root, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({
      schema: 'trusted-lifecycle-manifest-v1',
      entryPath: 'src/copy/index.html',
      scripts: [{
        outcomeRef: 'mustHave:0',
        actions: [],
        assertions: [{ kind: 'visible-text', selector: 'h1', text: 'Approved' }],
      }, {
        outcomeRef: 'mustNotHave:0',
        actions: [],
        assertions: [{ kind: 'absent-text', selector: 'h1', text: 'Draft' }],
      }, {
        outcomeRef: 'completionEvidence:0',
        actions: [],
        assertions: [{ kind: 'visible-text', selector: 'h1', text: 'Approved' }],
      }],
    }));

    const failed = await lifecycle(root, manifestPath);
    assert.equal(failed.status, 'FAIL');

    const invocation = publishTestAdaptiveRoute(root, routeFixture(), 'trusted-vertical-repair');
    writeFileSync(join(root, '.omd', 'decision-graph.json'), JSON.stringify({
      schema: 'decision-graph-v1',
      decisions: [{
        id: 'approved-copy', stage: 'copy', risk: 'low', owner: 'omd-writer',
        question: 'Which confirmation copy is approved?',
        alternatives: [{ id: 'draft', label: 'Draft copy' }, { id: 'approved', label: 'Approved copy' }],
        selected: 'approved', evidence: ['claim:approved-sentence'], constraints: ['Preserve the existing flow'],
        rejected: [{ id: 'draft', reason: 'The reviewer found the draft copy in production.' }],
        affects: ['src/copy/index.html'], dependsOn: [], reversible: true, tradeoffs: [],
      }],
    }));
    publishRepairSlice(root, invocation);

    const review: ProductionRepairReview = {
      schema: 'production-repair-review-v1',
      observationPointerSha256: sha(readFileSync(join(root, '.omd', 'observation-v2.json'))),
      retentionPointerSha256: existsSync(join(root, '.omd', 'observation-v2-retention.json'))
        ? sha(readFileSync(join(root, '.omd', 'observation-v2-retention.json')))
        : null,
      beforeSha256: sha(readFileSync(join(root, 'src', 'copy', 'index.html'))),
      afterSha256: sha('<!doctype html><button>Check</button><h1>Approved</h1>'),
      suggestedPaths: ['src/copy/index.html'],
      findingIds: ['review:approved-copy-missing'],
    };
    authorizeTestProjectRunPayloads(root, invocation, [{
      purpose: 'final-reviewer-lane',
      payload: productionRepairReviewBytes(review),
    }]);
    const mirrorRoot = mkdtempSync(join(tmpdir(), 'omd-vertical-repair-mirror-'));
    mkdirSync(join(mirrorRoot, 'src', 'copy'), { recursive: true });
    writeFileSync(join(mirrorRoot, 'src', 'copy', 'index.html'), '<!doctype html><button>Check</button><h1>Approved</h1>');
    writeFileSync(join(mirrorRoot, 'src', 'copy', 'context.html'), readFileSync(join(root, 'src', 'copy', 'context.html')));
    for (const path of ['index.html', 'context.html']) chmodSync(
      join(mirrorRoot, 'src', 'copy', path), lstatSync(join(root, 'src', 'copy', path)).mode & 0o777,
    );
    try {
      const staged = stageProductionRepair({ root, invocation, review, mirrorRoot });
      const repair = applyProductionRepair({ root, invocation, writer: createTestProjectWriteAdapter(root, invocation), staged });
      assert.equal(repair.status, 'committed');
    } finally { rmSync(mirrorRoot, { recursive: true, force: true }); }

    const authorizedPlan = parseTrustedLifecycleManifest(
      JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown,
    );
    authorizeTestProjectRunPayloads(root, invocation, [{
      purpose: 'product-probe-result',
      payload: trustedEvaluationPlanBytes(authorizedPlan),
    }]);
    const passed = await lifecycle(root, manifestPath, invocation);
    assert.equal(passed.status, 'PASS');
    const observation = JSON.parse(
      readFileSync(join(root, passed.observationPath), 'utf8'),
    ) as ObservationV2 & { evidence: { trustedOutcome: { receiptSha256: string } } };
    const failedSha256 = /sha256-([a-f0-9]{64})\.json$/.exec(failed.observationPath)?.[1];
    assert.equal(observation.predecessorSha256, failedSha256);
    assert.equal(
      JSON.parse(readFileSync(join(root, observation.currentArtifact.path), 'utf8')).schemaVersion,
      'omd-build-identity-v1',
    );
    assert.doesNotThrow(() => validateFinalBrowserObservations(
      root,
      nodeStableProjectFileSystem(),
      [observation.evidence],
    ));
    const receiptBytes = readFileSync(join(root, `.omd/trusted-browser-receipt-sha256-${observation.evidence.trustedOutcome.receiptSha256}.json`));
    authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'product-probe-result', payload: receiptBytes }]);
    assert.doesNotThrow(() => validateTrustedOutcomeEvidence({
      root,
      branch: 'adaptive-omission',
      required: true,
      invocation,
      expected: { buildSha256: observation.buildSha256 },
      observations: [observation],
    }));
    assert.equal(existsSync(join(root, '.omd', 'observation-v2-repair-predecessor.json')), false);
    const successor = writeObservationV2(root, {
      currentArtifact: observation.currentArtifact,
      buildSha256: observation.buildSha256,
      observedAt: '2026-01-01T00:02:00.000Z',
      evidence: {},
    }, createTestProjectWriteAdapter(root, invocation));
    assert.equal(successor.predecessorSha256, observationV2Sha256(observation));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
