import assert from 'node:assert/strict';
import test from 'node:test';
import { OBLIGATION_REGISTRY, REQUIRED_OBLIGATION_IDS, validateObligationRegistry, type ProtocolObligation } from '../core/protocol/obligations/index.ts';

const registry = (): ProtocolObligation[] => OBLIGATION_REGISTRY.map(obligation => ({ ...obligation, testIds: [...obligation.testIds], projectionIds: [...obligation.projectionIds] }));

test('harness-v2 obligation registry covers every required policy with one owner and projections', () => {
  assert.deepEqual(OBLIGATION_REGISTRY.map(obligation => obligation.id), REQUIRED_OBLIGATION_IDS);
  for (const obligation of OBLIGATION_REGISTRY) {
    assert.notEqual(obligation.owner, '');
    assert.ok(obligation.testIds.length > 0);
    assert.ok(obligation.projectionIds.length > 0);
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
