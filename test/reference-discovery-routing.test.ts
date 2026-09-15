import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ReferenceDiscoveryRoutingError,
  routeReferenceDiscovery,
  type ReferenceDiscoveryRoutingErrorCode,
} from '../core/route/index.ts';

const fixturePath = (name: string): string => fileURLToPath(new URL(`fixtures/reference-discovery/${name}.json`, import.meta.url));
const fixture = (name: string): unknown => JSON.parse(readFileSync(fixturePath(name), 'utf8'));

function fixtureWith(name: string, key: PropertyKey, value: unknown): object {
  const input = fixture(name);
  assert.ok(typeof input === 'object' && input !== null);
  Object.defineProperty(input, key, { value, enumerable: true, configurable: true, writable: true });
  return input;
}

function assertRoutingError(run: () => unknown, code: ReferenceDiscoveryRoutingErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ReferenceDiscoveryRoutingError);
    assert.equal(error.name, 'ReferenceDiscoveryRoutingError');
    assert.equal(error.code, code);
    assert.equal(error.message.split(':')[0], code);
    return true;
  });
}

test('a new-product fixture routes reference discovery through the recommended-method policy', () => {
  const routed = routeReferenceDiscovery(fixture('new-product'));

  assert.deepEqual(routed, {
    schema: 'reference-discovery-routing-v1',
    decision: 'discover',
    taskNeed: 'new-product',
    uncertainty: 'unresolved',
    evidence: { availability: 'none' },
    references: {
      intended: 'Discover category patterns and anti-patterns before establishing a new product direction.',
      actual: { status: 'pending-discovery', description: 'No discovered references have been used yet.' },
    },
    recommendation: {
      id: 'reference-discovery',
      kind: 'recommended_method',
      status: 'selected',
      reason: 'A new product needs reference discovery before its direction is established.',
    },
  });
  assert.equal(Object.hasOwn(routed.references, 'min'), false);
  assert.equal(Object.hasOwn(routed.references, 'max'), false);
  assert.equal(Object.isFrozen(routed), true);
  assert.equal(Object.isFrozen(routed.references), true);
  assert.equal(Object.isFrozen(routed.references.actual), true);
  assert.equal(Object.isFrozen(routed.recommendation), true);
});

test('a copy-only fixture with sufficient evidence skips discovery with a reason', () => {
  const routed = routeReferenceDiscovery(fixture('copy-only'));

  assert.equal(routed.decision, 'skip');
  assert.deepEqual(routed.references, {
    intended: 'Preserve the approved product voice and verified terminology.',
    actual: {
      status: 'existing-evidence',
      description: 'The approved copy deck and verified product facts directly constrain this edit.',
    },
  });
  assert.deepEqual(routed.recommendation, {
    id: 'reference-discovery',
    kind: 'recommended_method',
    status: 'skipped',
    reason: 'Existing approved evidence fully covers this copy-only edit.',
  });
});

test('a new marketing surface discovers references without impersonating a product work flow', () => {
  const input = fixtureWith('new-product', 'taskNeed', 'new-marketing');
  const routed = routeReferenceDiscovery(input);
  assert.equal(routed.decision, 'discover');
  assert.equal(routed.taskNeed, 'new-marketing');
  assert.equal(
    routed.recommendation.reason,
    'A new marketing surface needs reference discovery before its direction is established.',
  );
});

test('selected discovery diagnostics explain explicit nulls without relaxing the contract', () => {
  const selected = fixtureWith('new-product', 'taskNeed', 'new-marketing');
  for (const key of ['existingEvidenceUse', 'skipReason']) {
    const narrated = { ...selected, [key]: 'Discovery is selected; no skip is requested.' };
    assert.throws(() => routeReferenceDiscovery(narrated), (error: unknown) => {
      assert.ok(error instanceof ReferenceDiscoveryRoutingError);
      assert.equal(error.code, 'CONTRADICTORY_REFERENCE_DISCOVERY_STATE');
      assert.match(error.message, /both be explicit null/);
      return true;
    });
    const missing = { ...selected };
    Reflect.deleteProperty(missing, key);
    assert.throws(() => routeReferenceDiscovery(missing), /required key|Required keys/);
  }
  assert.equal(routeReferenceDiscovery(selected).decision, 'discover');
});

test('routing returns a detached immutable snapshot of mutable input', () => {
  const input = {
    schema: 'reference-discovery-input-v1',
    taskNeed: 'copy-only-edit',
    uncertainty: 'resolved',
    existingEvidence: 'sufficient',
    intendedUse: 'Preserve the approved voice.',
    existingEvidenceUse: 'The approved copy deck constrains the edit.',
    skipReason: 'The evidence is sufficient.',
  };
  const routed = routeReferenceDiscovery(input);

  input.intendedUse = 'Changed after routing.';
  input.existingEvidenceUse = 'Changed after routing.';
  input.skipReason = 'Changed after routing.';

  assert.equal(routed.references.intended, 'Preserve the approved voice.');
  assert.deepEqual(routed.references.actual, {
    status: 'existing-evidence',
    description: 'The approved copy deck constrains the edit.',
  });
  assert.equal(routed.recommendation.reason, 'The evidence is sufficient.');
});

test('unknown, hidden, and Symbol own keys fail closed', () => {
  assertRoutingError(
    () => routeReferenceDiscovery(fixtureWith('copy-only', 'extra', true)),
    'UNEXPECTED_REFERENCE_DISCOVERY_FIELD',
  );

  const hidden = fixture('copy-only');
  assert.ok(typeof hidden === 'object' && hidden !== null);
  Object.defineProperty(hidden, 'concealed', { value: true });
  assertRoutingError(() => routeReferenceDiscovery(hidden), 'UNEXPECTED_REFERENCE_DISCOVERY_FIELD');

  const symbol = fixture('copy-only');
  assert.ok(typeof symbol === 'object' && symbol !== null);
  Object.defineProperty(symbol, Symbol('concealed'), { value: true });
  assertRoutingError(() => routeReferenceDiscovery(symbol), 'UNEXPECTED_REFERENCE_DISCOVERY_FIELD');
});

test('accessors and hostile proxies fail closed without executing field getters', () => {
  let getterRead = false;
  const accessor = fixture('copy-only');
  assert.ok(typeof accessor === 'object' && accessor !== null);
  Object.defineProperty(accessor, 'skipReason', {
    enumerable: true,
    get: () => {
      getterRead = true;
      return 'do not read';
    },
  });
  assertRoutingError(() => routeReferenceDiscovery(accessor), 'MALFORMED_REFERENCE_DISCOVERY_INPUT');
  assert.equal(getterRead, false);

  const hostile = new Proxy({}, {
    ownKeys: () => { throw new Error('proxy trap'); },
  });
  assertRoutingError(() => routeReferenceDiscovery(hostile), 'MALFORMED_REFERENCE_DISCOVERY_INPUT');
});

test('missing or empty skip reasons fail with one stable typed error', () => {
  const missing = fixture('copy-only');
  assert.ok(typeof missing === 'object' && missing !== null);
  assert.equal(Reflect.deleteProperty(missing, 'skipReason'), true);
  assertRoutingError(() => routeReferenceDiscovery(missing), 'REFERENCE_DISCOVERY_SKIP_REASON_REQUIRED');

  for (const skipReason of [null, '', '   ']) {
    const input = fixture('copy-only');
    assert.ok(typeof input === 'object' && input !== null);
    Object.defineProperty(input, 'skipReason', { value: skipReason, enumerable: true, configurable: true });
    assertRoutingError(() => routeReferenceDiscovery(input), 'REFERENCE_DISCOVERY_SKIP_REASON_REQUIRED');
  }
});

test('contradictory uncertainty and evidence states fail closed', () => {
  const contradictions = [
    { taskNeed: 'copy-only-edit', uncertainty: 'unresolved', existingEvidence: 'sufficient' },
    { taskNeed: 'copy-only-edit', uncertainty: 'resolved', existingEvidence: 'insufficient' },
    { taskNeed: 'existing-product-change', uncertainty: 'resolved', existingEvidence: 'none' },
    { taskNeed: 'new-product', uncertainty: 'resolved', existingEvidence: 'sufficient' },
    { taskNeed: 'new-marketing', uncertainty: 'resolved', existingEvidence: 'sufficient' },
  ];

  for (const contradiction of contradictions) {
    assertRoutingError(() => routeReferenceDiscovery({
      schema: 'reference-discovery-input-v1',
      ...contradiction,
      intendedUse: 'Use references to resolve the task need.',
      existingEvidenceUse: contradiction.existingEvidence === 'sufficient' ? 'Existing evidence is reportedly sufficient.' : null,
      skipReason: contradiction.existingEvidence === 'sufficient' ? 'Existing evidence reportedly covers the task.' : null,
    }), 'CONTRADICTORY_REFERENCE_DISCOVERY_STATE');
  }
});

test('malformed values, use accounting mismatches, and wrong schema fail closed', () => {
  assertRoutingError(() => routeReferenceDiscovery(null), 'MALFORMED_REFERENCE_DISCOVERY_INPUT');
  assertRoutingError(() => routeReferenceDiscovery(fixtureWith('new-product', 'schema', 'future-schema')), 'MALFORMED_REFERENCE_DISCOVERY_INPUT');
  assertRoutingError(() => routeReferenceDiscovery(fixtureWith('new-product', 'taskNeed', 'unknown-task')), 'MALFORMED_REFERENCE_DISCOVERY_INPUT');
  assertRoutingError(() => routeReferenceDiscovery(fixtureWith('new-product', 'intendedUse', '  ')), 'EMPTY_REFERENCE_DISCOVERY_FIELD');
  assertRoutingError(() => routeReferenceDiscovery(fixtureWith('new-product', 'existingEvidenceUse', 'Claims prior use.')), 'CONTRADICTORY_REFERENCE_DISCOVERY_STATE');
  assertRoutingError(() => routeReferenceDiscovery(fixtureWith('copy-only', 'existingEvidenceUse', '')), 'EMPTY_REFERENCE_DISCOVERY_FIELD');
});
