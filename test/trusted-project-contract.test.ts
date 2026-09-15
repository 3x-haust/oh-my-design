import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  requireExactEvaluationCoverage,
  TrustedProjectContractError,
} from '../core/runtime/trusted-project-contract.ts';

const contract = {
  taskOutcome: {
    schema: 'task-outcome-contract-v1' as const,
    goal: 'Complete the request',
    mustHave: ['Request form', 'Confirmation'],
    mustNotHave: ['Unverified customer claim'],
    completionEvidence: ['Submitted values visible in confirmation'],
    strategyFreedom: ['Layout'],
  },
};
const valid = ['mustHave:0', 'mustHave:1', 'mustNotHave:0', 'completionEvidence:0']
  .map((outcomeRef) => ({
    outcomeRef,
    actions: [{ kind: 'click', selector: 'button' }],
    assertions: [{
      kind: outcomeRef.startsWith('mustNotHave:') ? 'absent-text' : 'visible-text',
      selector: 'main', text: 'Fixture value',
    }],
  }));

test('exact trusted coverage accepts every canonical short ref with the required assertion kind', () => {
  assert.doesNotThrow(() => requireExactEvaluationCoverage(contract, valid));
});

test('coverage rejection names exact expected refs without copying private requirement prose', () => {
  const privateContract = {
    taskOutcome: { ...contract.taskOutcome, mustHave: ['PRIVATE REQUIREMENT', 'Confirmation'] },
  };
  assert.throws(() => requireExactEvaluationCoverage(privateContract, valid.slice(0, 1)), (error: unknown) => {
    assert.ok(error instanceof TrustedProjectContractError);
    assert.equal(error.code, 'INCOMPLETE_TRUSTED_EVALUATION_COVERAGE');
    assert.match(error.message, /expected 4 scripts in canonical order \[mustHave:0, mustHave:1, mustNotHave:0, completionEvidence:0\]/);
    assert.match(error.message, /received 1/);
    assert.match(error.message, /short outcomeRef values/);
    assert.match(error.message, /non-browser requirement/);
    assert.doesNotMatch(error.message, /PRIVATE REQUIREMENT/);
    return true;
  });
});

test('coverage diagnostics retain rejection of prose, duplicates, wrong order and assertion kinds', () => {
  const variants = [
    valid.map((item, index) => index === 0 ? { ...item, outcomeRef: 'Request form' } : item),
    valid.map((item, index) => index === 1 ? { ...item, outcomeRef: 'mustHave:0' } : item),
    [valid[1]!, valid[0]!, ...valid.slice(2)],
    valid.map((item, index) => index === 2 ? { ...item, assertions: [{ kind: 'visible-text', selector: 'main', text: 'x' }] } : item),
    valid.map((item, index) => index === 0 ? { ...item, assertions: [] } : item),
  ];
  for (const scripts of variants) {
    assert.throws(() => requireExactEvaluationCoverage(contract, scripts), (error: unknown) =>
      error instanceof TrustedProjectContractError && error.code === 'INCOMPLETE_TRUSTED_EVALUATION_COVERAGE');
  }
});
