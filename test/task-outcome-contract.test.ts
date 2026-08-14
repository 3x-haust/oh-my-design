import assert from 'node:assert/strict';
import test from 'node:test';
import { routeTaskOutcome } from '../core/route/index.ts';
import {
  TASK_OUTCOME_CONTRACT_SCHEMA,
  TaskOutcomeContractError,
  parseTaskOutcomeContract,
  type TaskOutcomeContractErrorCode,
} from '../core/brief/task-outcome.ts';

const validContract = () => ({
  schema: TASK_OUTCOME_CONTRACT_SCHEMA,
  goal: 'Let a customer confirm the order total before purchase.',
  mustHave: ['The total is visible before confirmation.', 'The confirmation works on mobile.'],
  mustNotHave: ['Do not add an account-registration flow.'],
  completionEvidence: ['A browser probe completes confirmation.', 'Desktop and mobile renders show the total.'],
  strategyFreedom: ['Choose the implementation order.', 'Choose the visual treatment.'],
});

function assertContractError(run: () => unknown, code: TaskOutcomeContractErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof TaskOutcomeContractError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test('a valid task outcome contract becomes a strict immutable snapshot', () => {
  const source = validContract();
  const parsed = parseTaskOutcomeContract(source);

  source.goal = 'Changed after parsing.';
  source.mustHave.push('Changed after parsing.');

  assert.deepEqual(parsed, validContract());
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.mustHave), true);
  assert.equal(Object.isFrozen(parsed.mustNotHave), true);
  assert.equal(Object.isFrozen(parsed.completionEvidence), true);
  assert.equal(Object.isFrozen(parsed.strategyFreedom), true);
});

test('task outcome parsing fails closed for malformed, extra, empty, and duplicate fields', () => {
  assertContractError(() => parseTaskOutcomeContract(null), 'MALFORMED_TASK_OUTCOME_CONTRACT');
  assertContractError(() => parseTaskOutcomeContract({ ...validContract(), goal: 42 }), 'MALFORMED_TASK_OUTCOME_CONTRACT');
  assertContractError(() => parseTaskOutcomeContract({ ...validContract(), completionEvidence: 'browser' }), 'MALFORMED_TASK_OUTCOME_CONTRACT');
  assertContractError(() => parseTaskOutcomeContract({ ...validContract(), extra: true }), 'UNEXPECTED_TASK_OUTCOME_FIELD');

  for (const input of [
    { ...validContract(), goal: '   ' },
    { ...validContract(), mustHave: [] },
    { ...validContract(), mustNotHave: [''] },
    { ...validContract(), completionEvidence: [] },
    { ...validContract(), strategyFreedom: ['  '] },
  ]) {
    assertContractError(() => parseTaskOutcomeContract(input), 'EMPTY_TASK_OUTCOME_FIELD');
  }

  assertContractError(() => parseTaskOutcomeContract({
    ...validContract(),
    mustHave: ['Mobile confirmation works.', ' Mobile confirmation works. '],
  }), 'DUPLICATE_TASK_OUTCOME_ITEM');
  assertContractError(() => parseTaskOutcomeContract({
    ...validContract(),
    mustHave: ['Do not add registration.'],
    mustNotHave: ['Do not add registration.'],
  }), 'CONFLICTING_TASK_OUTCOME_ITEM');
});

test('strict task outcome parsing rejects non-enumerable and Symbol own-key extras', () => {
  const hidden = validContract();
  Object.defineProperty(hidden, 'concealed', { value: true });
  assertContractError(() => parseTaskOutcomeContract(hidden), 'UNEXPECTED_TASK_OUTCOME_FIELD');

  const symbol = Symbol('extra');
  const symbolic = { ...validContract(), [symbol]: true };
  assertContractError(() => parseTaskOutcomeContract(symbolic), 'UNEXPECTED_TASK_OUTCOME_FIELD');

  const hiddenList = validContract();
  Object.defineProperty(hiddenList.mustHave, 'concealed', { value: true });
  assertContractError(() => parseTaskOutcomeContract(hiddenList), 'UNEXPECTED_TASK_OUTCOME_FIELD');

  const symbolicList = validContract();
  Object.defineProperty(symbolicList.strategyFreedom, symbol, { value: true });
  assertContractError(() => parseTaskOutcomeContract(symbolicList), 'UNEXPECTED_TASK_OUTCOME_FIELD');
});

test('a parsed outcome card drives canonical routing while the selected model owns strategy', () => {
  const routed = routeTaskOutcome(validContract());

  assert.deepEqual(routed, {
    schema: 'task-outcome-routing-v1',
    kind: 'outcome-directed',
    goal: 'Let a customer confirm the order total before purchase.',
    requiredOutcomes: ['The total is visible before confirmation.', 'The confirmation works on mobile.'],
    prohibitedOutcomes: ['Do not add an account-registration flow.'],
    evidenceRequired: ['A browser probe completes confirmation.', 'Desktop and mobile renders show the total.'],
    strategy: {
      owner: 'user-selected-model',
      freedom: ['Choose the implementation order.', 'Choose the visual treatment.'],
    },
  });
  assert.equal(Object.isFrozen(routed), true);
  assert.equal(Object.isFrozen(routed.strategy), true);
  assertContractError(() => routeTaskOutcome({ ...validContract(), mustHave: [] }), 'EMPTY_TASK_OUTCOME_FIELD');
});
