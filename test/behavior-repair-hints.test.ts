import assert from 'node:assert/strict';
import test from 'node:test';
import { browserFailureDiagnostic } from '../core/runtime/model-led-diagnostics.ts';

type Evaluation = Parameters<typeof browserFailureDiagnostic>[0];
const evaluation = (findings: string[][]) => ({
  receiptPath: '.omd/receipt.json', observationPath: '.omd/observation.json',
  receipt: { hardFloors: { behavior: 'fail', access: 'pass', safety: 'pass' }, transcript: [], captures: [],
    outcomeResults: findings.map((list, index) => ({ outcomeRef: `outcome:${index}`, status: list.length ? 'fail' : 'pass', findings: list })) },
}) as unknown as Evaluation;

test('a behavior failure explains each finding code once, so static text asserted after an action is recognisable', () => {
  const diagnostic = browserFailureDiagnostic(evaluation([['required-state-transition-missing'], ['required-state-transition-missing', 'required-action-unavailable'], []]));
  const hints = diagnostic.findings!.repairHints;
  assert.equal(hints.length, 2);
  assert.match(hints[0]!, /^required-state-transition-missing: .*preserved-text/);
  assert.match(hints[1]!, /^required-action-unavailable: /);
});

test('a passing outcome adds no hint', () => {
  assert.deepEqual(browserFailureDiagnostic(evaluation([[]])).findings!.repairHints, []);
});
