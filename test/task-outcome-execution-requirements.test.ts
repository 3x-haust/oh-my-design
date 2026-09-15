import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseTaskOutcomeContract } from '../core/brief/task-outcome.ts';
import { parseRouteRecord, routeAdaptiveFlow } from '../core/route/index.ts';
import { deriveTrustedEvaluationRefSets } from '../core/runtime/trusted-evaluation-contract.ts';
import { requireExactEvaluationCoverage } from '../core/runtime/trusted-project-contract.ts';

const source = () => ({
  schema: 'task-outcome-contract-v1',
  goal: 'Reply to a support ticket and recover an accidental completion.',
  mustHave: ['The selected ticket conversation is visible.'],
  mustNotHave: ['Do not display an unverified message-delivery claim.'],
  completionEvidence: ['The reopened ticket is visible in the active queue.'],
  strategyFreedom: ['Choose the work-screen composition.'],
  executionRequirements: [
    { requirement: 'Use the authorized production writer; do not edit its output by hand.', enforcedBy: ['project-write-boundary'] },
    { requirement: 'Complete independent review and terminal preflight.', enforcedBy: ['independent-review', 'final-evidence-v2', 'completion-preflight'] },
  ],
});

test('execution requirements remain exact immutable source data without becoming DOM outcomes', () => {
  const input = source();
  const parsed = parseTaskOutcomeContract(input);
  assert.deepEqual(parsed, input);
  const requirements = Reflect.get(parsed, 'executionRequirements');
  assert.equal(Object.isFrozen(requirements), true);
  assert.equal(Object.isFrozen(requirements[0]), true);
  assert.equal(Object.isFrozen(requirements[0]!.enforcedBy), true);
  input.executionRequirements[0]!.requirement = 'Changed after parsing';
  input.executionRequirements[0]!.enforcedBy.push('scope-lock');
  assert.equal(requirements[0]!.requirement, source().executionRequirements[0]!.requirement);
  assert.deepEqual(requirements[0]!.enforcedBy, ['project-write-boundary']);

  const scripts = ['mustHave:0', 'mustNotHave:0', 'completionEvidence:0'].map((outcomeRef) => ({
    outcomeRef, actions: [], assertions: [{ kind: outcomeRef.startsWith('mustNotHave') ? 'absent-text' : 'visible-text' }],
  }));
  assert.doesNotThrow(() => requireExactEvaluationCoverage({ taskOutcome: parsed }, scripts));
  assert.throws(() => requireExactEvaluationCoverage({ taskOutcome: parsed }, scripts.slice(1)), /INCOMPLETE_TRUSTED_EVALUATION_COVERAGE/);
  assert.throws(() => requireExactEvaluationCoverage({ taskOutcome: parsed }, [
    ...scripts, { outcomeRef: 'executionRequirements:0', actions: [], assertions: [{ kind: 'visible-text' }] },
  ]), /INCOMPLETE_TRUSTED_EVALUATION_COVERAGE/);
});

test('workflow bindings reject unsupported verifiers, verdicts, duplicates, and accessor input', () => {
  const invalid = [
    [{ requirement: 'Native app installed', enforcedBy: ['native-app-install'] }],
    [{ requirement: 'Task finished', enforcedBy: ['required-outcomes'] }],
    [{ requirement: 'Task finished', enforcedBy: [] }],
    [{ requirement: 'Task finished', enforcedBy: ['independent-review', 'independent-review'] }],
    [{ requirement: 'Task finished', enforcedBy: ['independent-review'], passed: true }],
    [source().executionRequirements[0], source().executionRequirements[0]],
    Object.assign([source().executionRequirements[0]], { forged: true }),
    [Object.create(source().executionRequirements[0]!)],
  ];
  for (const executionRequirements of invalid) {
    assert.throws(() => parseTaskOutcomeContract({ ...source(), executionRequirements }));
  }
  let reads = 0;
  const accessor = { requirement: 'Task finished' };
  Object.defineProperty(accessor, 'enforcedBy', { enumerable: true, get() { reads++; return ['independent-review']; } });
  assert.throws(() => parseTaskOutcomeContract({ ...source(), executionRequirements: [accessor] }));
  assert.equal(reads, 0);
});

test('routed source preserves workflow obligations and keeps mandatory gates and browser refs distinct', () => {
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  input.taskOutcome = source();
  const route = routeAdaptiveFlow(input);
  assert.deepEqual(Reflect.get(route.sourceContract.taskOutcome, 'executionRequirements'), source().executionRequirements);
  assert.deepEqual(parseRouteRecord(structuredClone(route)), route);
  assert.ok(route.gates.includes('project-write-boundary'));
  assert.ok(route.gates.includes('independent-review'));
  assert.ok(route.gates.includes('final-evidence-v2'));
  const refs = deriveTrustedEvaluationRefSets({
    sourceContractSha256: route.sourceContractSha256,
    taskOutcome: route.sourceContract.taskOutcome,
    evidenceClaims: route.sourceContract.evidenceClaims,
  });
  assert.equal(refs.requiredOutcomeRefs.length, 3);
  assert.equal(refs.requiredOutcomeRefs.some((ref) => ref.includes('executionRequirements')), false);
  input.taskOutcome.executionRequirements[0].requirement += ' (changed)';
  assert.notEqual(routeAdaptiveFlow(input).sourceContractSha256, route.sourceContractSha256);
  const missingGate = structuredClone(route);
  Reflect.set(missingGate, 'gates', missingGate.gates.filter((gate) => gate !== 'independent-review'));
  assert.throws(() => parseRouteRecord(missingGate));
});
