import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { TaskOutcomeContract } from '../brief/task-outcome.ts';
import {
  requireEntrySurfaceOutcomeCoverage,
  type EntrySurfaceContract,
  type EntrySurfaceWitnessTarget,
} from '../frame/entry-surface-contract.ts';
import { readFrame } from '../frame/index.ts';
import {
  parseTaskFlowBenchmarkProjection,
  type TaskFlowBenchmarkProjection,
} from '../ref/task-flow-benchmark.ts';
import { readPersistedRoute } from '../route/adaptive-route-persistence.ts';
import type { ProjectRunInvocation } from './invocation.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';
import {
  deriveTrustedEvaluationIdentity,
  parseTrustedLifecycleManifest,
  type TrustedEvaluationAssertion,
  type TrustedLifecycleManifest,
} from './trusted-evaluation-contract.ts';

export class TrustedEvaluationPlanError extends Error {
  override readonly name = 'TrustedEvaluationPlanError';
  readonly code:
    | 'TRUSTED_EVALUATION_PLAN_FRAME_REQUIRED'
    | 'TRUSTED_EVALUATION_PLAN_ENTRY_SURFACE_REQUIRED'
    | 'TRUSTED_EVALUATION_PLAN_BENCHMARK_REQUIRED'
    | 'TRUSTED_EVALUATION_PLAN_BENCHMARK_INVALID'
    | 'TRUSTED_EVALUATION_PLAN_EDGE_INVALID';

  constructor(code: TrustedEvaluationPlanError['code']) {
    super(code);
    this.code = code;
  }
}

const SHA256 = /^[a-f0-9]{64}$/;
const fixedSelector = Object.freeze({
  purpose: '[data-omd-purpose]',
  workObjectAnchor: '[data-omd-work-anchor]',
  nextAction: '[data-omd-next-action]',
  body: 'body',
});

function fail(code: TrustedEvaluationPlanError['code']): never {
  throw new TrustedEvaluationPlanError(code);
}

function attributeSelector(attribute: string, value: string): string {
  return `[${attribute}="${value}"]`;
}

function selectorFor(
  target: EntrySurfaceWitnessTarget,
  contract: EntrySurfaceContract,
): string {
  if (target === 'consequence') {
    return attributeSelector('data-omd-consequence-for', contract.dependentTaskId);
  }
  return fixedSelector[target];
}

function textFor(
  witness: EntrySurfaceContract['outcomeWitnesses'][number],
  contract: EntrySurfaceContract,
  taskOutcome: TaskOutcomeContract,
): string {
  if (witness.target === 'purpose') return contract.purposeText;
  if (witness.target === 'workObjectAnchor') return contract.workObjectAnchorText;
  if (witness.target === 'nextAction') {
    if (contract.nextActionName === null) {
      return fail('TRUSTED_EVALUATION_PLAN_ENTRY_SURFACE_REQUIRED');
    }
    return contract.nextActionName;
  }
  if (witness.target === 'consequence') {
    return witness.phase === 'after-prerequisite' ? contract.afterText : contract.beforeText;
  }
  return taskOutcome[witness.kind][witness.index]!;
}

export function deriveTrustedEvaluationPlan(input: Readonly<{
  sourceContractSha256: string;
  taskOutcome: TaskOutcomeContract;
  evidenceClaims: Parameters<typeof deriveTrustedEvaluationIdentity>[0]['evidenceClaims'];
  allowedPaths: readonly string[];
  entrySurface: EntrySurfaceContract;
  benchmarkProjection: TaskFlowBenchmarkProjection;
  benchmarkProjectionSha256: string;
}>): TrustedLifecycleManifest {
  if (!SHA256.test(input.benchmarkProjectionSha256)) {
    return fail('TRUSTED_EVALUATION_PLAN_BENCHMARK_INVALID');
  }
  deriveTrustedEvaluationIdentity({
    sourceContractSha256: input.sourceContractSha256,
    taskOutcome: input.taskOutcome,
    evidenceClaims: input.evidenceClaims,
    allowedPaths: input.allowedPaths,
    entryPath: input.entrySurface.entryPath,
  });
  requireEntrySurfaceOutcomeCoverage(input.entrySurface, input.taskOutcome);
  if (input.benchmarkProjection.sourceContractSha256 !== input.sourceContractSha256) {
    return fail('TRUSTED_EVALUATION_PLAN_BENCHMARK_INVALID');
  }
  const dependent = input.benchmarkProjection.taskSteps.find(
    ({ id }) => id === input.entrySurface.dependentTaskId,
  );
  if (dependent === undefined
    || !dependent.dependsOn.includes(input.entrySurface.prerequisiteTaskId)) {
    return fail('TRUSTED_EVALUATION_PLAN_EDGE_INVALID');
  }
  const triggerSelector = attributeSelector(
    'data-omd-task-id',
    input.entrySurface.prerequisiteTaskId,
  );
  let prerequisiteTriggered = false;
  const witnesses = (['initial', 'after-prerequisite'] as const)
    .flatMap(phase => input.entrySurface.outcomeWitnesses.filter(witness => witness.phase === phase));
  const scripts = witnesses.map((witness) => {
    const assertion: TrustedEvaluationAssertion = Object.freeze({
      kind: witness.assertion,
      selector: selectorFor(witness.target, input.entrySurface),
      text: textFor(witness, input.entrySurface, input.taskOutcome),
    });
    const triggersPrerequisite = witness.phase === 'after-prerequisite' && !prerequisiteTriggered;
    if (triggersPrerequisite) prerequisiteTriggered = true;
    return Object.freeze({
      outcomeRef: `${witness.kind}:${witness.index}`,
      actions: triggersPrerequisite
        ? Object.freeze([{ kind: 'click' as const, selector: triggerSelector }])
        : Object.freeze([]),
      assertions: Object.freeze([assertion]),
    });
  });
  return parseTrustedLifecycleManifest({
    schema: 'trusted-lifecycle-manifest-v1',
    entryPath: input.entrySurface.entryPath,
    scripts,
    entrySurface: {
      benchmarkProjectionSha256: input.benchmarkProjectionSha256,
      prerequisiteTaskId: input.entrySurface.prerequisiteTaskId,
      dependentTaskId: input.entrySurface.dependentTaskId,
      purpose: {
        selector: fixedSelector.purpose,
        text: input.entrySurface.purposeText,
      },
      workObject: {
        selector: '[data-omd-work-object]',
        anchorSelector: fixedSelector.workObjectAnchor,
        anchorText: input.entrySurface.workObjectAnchorText,
      },
      ...(input.entrySurface.nextActionName === null
        ? {}
        : {
          nextAction: {
            selector: fixedSelector.nextAction,
            accessibleName: input.entrySurface.nextActionName,
          },
        }),
      trigger: { kind: 'click', selector: triggerSelector },
      consequence: {
        selector: attributeSelector(
          'data-omd-consequence-for',
          input.entrySurface.dependentTaskId,
        ),
        beforeText: input.entrySurface.beforeText,
        afterText: input.entrySurface.afterText,
      },
    },
  });
}

export function deriveTrustedEvaluationPlanFromProject(input: Readonly<{
  root: string;
  invocation: ProjectRunInvocation;
}>): TrustedLifecycleManifest {
  const route = readPersistedRoute(input.root, input.invocation);
  if (!route.gates.includes('greenfield-task-flow-benchmark')) {
    return fail('TRUSTED_EVALUATION_PLAN_BENCHMARK_REQUIRED');
  }
  const frame = readFrame(input.root);
  if (frame === null) return fail('TRUSTED_EVALUATION_PLAN_FRAME_REQUIRED');
  if (frame.entrySurface === undefined) {
    return fail('TRUSTED_EVALUATION_PLAN_ENTRY_SURFACE_REQUIRED');
  }
  const benchmarkBytes = readStableProjectFile({
    root: input.root,
    path: resolve(input.root, '.omd/task-flow-benchmark-projection.json'),
    label: 'trusted evaluation plan benchmark projection',
    fs: nodeStableProjectFileSystem(),
  });
  let projectionInput: unknown;
  try {
    projectionInput = JSON.parse(benchmarkBytes.toString('utf8')) as unknown;
  } catch {
    return fail('TRUSTED_EVALUATION_PLAN_BENCHMARK_INVALID');
  }
  let benchmarkProjection: TaskFlowBenchmarkProjection;
  try {
    benchmarkProjection = parseTaskFlowBenchmarkProjection(projectionInput, {
      expectedSourceContractSha256: route.sourceContractSha256,
    });
  } catch {
    return fail('TRUSTED_EVALUATION_PLAN_BENCHMARK_INVALID');
  }
  return deriveTrustedEvaluationPlan({
    sourceContractSha256: route.sourceContractSha256,
    taskOutcome: route.sourceContract.taskOutcome,
    evidenceClaims: route.sourceContract.evidenceClaims,
    allowedPaths: route.allowedPaths,
    entrySurface: frame.entrySurface,
    benchmarkProjection,
    benchmarkProjectionSha256: createHash('sha256').update(benchmarkBytes).digest('hex'),
  });
}
