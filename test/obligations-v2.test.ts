import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  OBLIGATION_REGISTRY,
  REQUIRED_OBLIGATION_IDS,
  validateObligationRegistry,
  validateObligationTargets,
  type ProtocolObligation,
} from '../core/protocol/obligations/index.ts';
import {
  EXECUTABLE_OBLIGATION_TEST_CASES,
  OBLIGATION_PROJECTION_DEFINITIONS,
} from '../core/protocol/obligations/targets.ts';

const registry = (): ProtocolObligation[] => OBLIGATION_REGISTRY.map(obligation => ({ ...obligation, testIds: [...obligation.testIds], projectionIds: [...obligation.projectionIds] }));

function source(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

test('harness-v2 obligation registry covers every required policy with one owner and projections', () => {
  assert.deepEqual(OBLIGATION_REGISTRY.map(obligation => obligation.id), REQUIRED_OBLIGATION_IDS);
  for (const obligation of OBLIGATION_REGISTRY) {
    assert.notEqual(obligation.owner, '');
    assert.ok(obligation.testIds.length > 0);
    assert.ok(obligation.projectionIds.length > 0);
  }
});
test('harness-v2 obligation registry targets resolve to declared executable cases and projections', () => {
  for (const testCase of EXECUTABLE_OBLIGATION_TEST_CASES) {
    assert.ok(source(testCase.file).includes(`test('${testCase.title}'`), `missing executable test case ${testCase.id}`);
  }
  for (const projection of OBLIGATION_PROJECTION_DEFINITIONS) {
    assert.ok(source(projection.file).includes(projection.definition), `missing projection definition ${projection.id}`);
  }
});

test('harness-v2 obligation registry rejects duplicate and conflicting ownership', () => {
  const duplicate = registry();
  duplicate.push({ ...duplicate[0]! });
  assert.throws(() => validateObligationRegistry(duplicate), /conflicting ownership/);

  const conflictingTest = registry();
  conflictingTest[1] = { ...conflictingTest[1]!, testIds: [...conflictingTest[0]!.testIds] };
  assert.throws(() => validateObligationRegistry(conflictingTest), /test id .* owned by both/);

  const conflictingProjection = registry();
  conflictingProjection[1] = { ...conflictingProjection[1]!, projectionIds: [...conflictingProjection[0]!.projectionIds] };
  assert.throws(() => validateObligationRegistry(conflictingProjection), /projection id .* owned by both/);
});

test('harness-v2 obligation registry rejects missing required obligations, tests, and projections', () => {
  assert.throws(() => validateObligationRegistry(registry().slice(1)), /missing required obligation/);

  const noTests = registry();
  noTests[0] = { ...noTests[0]!, testIds: [] };
  assert.throws(() => validateObligationRegistry(noTests), /missing test/);

  const noProjections = registry();
  noProjections[0] = { ...noProjections[0]!, projectionIds: [] };
  assert.throws(() => validateObligationRegistry(noProjections), /missing projection/);
});
test('harness-v2 obligation registry rejects unresolved targets and inapplicable target ownership', () => {
  const missingTestCase = registry();
  missingTestCase[0] = { ...missingTestCase[0]!, testIds: ['renamed-test-case'] };
  assert.throws(() => validateObligationRegistry(missingTestCase), /missing executable test case/);

  const missingProjection = registry();
  missingProjection[0] = { ...missingProjection[0]!, projectionIds: ['renamed-projection'] };
  assert.throws(() => validateObligationRegistry(missingProjection), /missing projection definition/);

  const inapplicableTestCase = registry();
  inapplicableTestCase[0] = { ...inapplicableTestCase[0]!, testIds: ['art-direction-three-directions'] };
  assert.throws(() => validateObligationRegistry(inapplicableTestCase), /missing applicability/);

  const inapplicableProjection = registry();
  inapplicableProjection[0] = { ...inapplicableProjection[0]!, projectionIds: ['art-direction-three-directions'] };
  assert.throws(() => validateObligationRegistry(inapplicableProjection), /missing applicability/);
});

test('harness-v2 obligation registry rejects malformed fixed target declarations', () => {
  const duplicateCases = [...EXECUTABLE_OBLIGATION_TEST_CASES, EXECUTABLE_OBLIGATION_TEST_CASES[0]!];
  assert.throws(() => validateObligationTargets(duplicateCases, OBLIGATION_PROJECTION_DEFINITIONS), /duplicate test case target/);

  const missingProjectionApplicability = OBLIGATION_PROJECTION_DEFINITIONS.map(projection => (
    projection.id === 'art-direction-motion-lock'
      ? { ...projection, applicableTo: [] }
      : projection
  ));
  assert.throws(() => validateObligationTargets(EXECUTABLE_OBLIGATION_TEST_CASES, missingProjectionApplicability), /missing applicability/);
});
