import { parseTaskOutcomeContract } from '../brief/task-outcome.ts';

export type TaskOutcomeRouting = Readonly<{
  readonly schema: 'task-outcome-routing-v1';
  readonly kind: 'outcome-directed';
  readonly goal: string;
  readonly requiredOutcomes: readonly string[];
  readonly prohibitedOutcomes: readonly string[];
  readonly evidenceRequired: readonly string[];
  readonly strategy: Readonly<{
    readonly owner: 'user-selected-model';
    readonly freedom: readonly string[];
  }>;
}>;

export function routeTaskOutcome(input: unknown): TaskOutcomeRouting {
  const contract = parseTaskOutcomeContract(input);
  return Object.freeze({
    schema: 'task-outcome-routing-v1',
    kind: 'outcome-directed',
    goal: contract.goal,
    requiredOutcomes: contract.mustHave,
    prohibitedOutcomes: contract.mustNotHave,
    evidenceRequired: contract.completionEvidence,
    strategy: Object.freeze({
      owner: 'user-selected-model',
      freedom: contract.strategyFreedom,
    }),
  });
}
