import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTENT_STATE_MODEL_SCHEMA,
  ContentStateModelError,
  canonicalContentStateModelJson,
  parseContentStateModel,
  type ContentStateModelErrorCode,
} from '../core/design-development/content-state-model.ts';

const sha = (character: string): string => character.repeat(64);

const validModel = () => ({
  schema: CONTENT_STATE_MODEL_SCHEMA,
  planSha256: sha('a'),
  inputReceipts: [
    { id: 'input:sample', kind: 'sanitized-production-sample', sha256: sha('c') },
    { id: 'input:plan', kind: 'plan', sha256: sha('a') },
    { id: 'input:brief', kind: 'user-input', sha256: sha('b') },
  ],
  content: [
    {
      id: 'content:order-summary',
      label: 'Order summary',
      value: 'Three warehouse items are ready for approval.',
      provenance: { fidelity: 'representative', receiptIds: ['input:brief'] },
    },
    {
      id: 'content:approval-result',
      label: 'Approval result',
      value: 'Approved for the next scheduled dispatch.',
      provenance: { fidelity: 'production-like', receiptIds: ['input:sample', 'input:brief'] },
    },
  ],
  tasks: [{
    id: 'task:review-order',
    label: 'Review and approve an order',
    contentIds: ['content:order-summary', 'content:approval-result'],
    applicableStateIds: ['state:ready', 'state:failed', 'state:approved'],
  }],
  states: [
    {
      id: 'state:ready',
      label: 'Ready for review',
      contentIds: ['content:order-summary'],
      requirement: { kind: 'input-required', receiptId: 'input:plan' },
    },
    {
      id: 'state:failed',
      label: 'Approval failed',
      contentIds: ['content:order-summary'],
      requirement: { kind: 'representative' },
    },
    {
      id: 'state:approved',
      label: 'Approved',
      contentIds: ['content:approval-result'],
      requirement: { kind: 'representative' },
    },
  ],
  transitions: [
    {
      id: 'transition:retry',
      taskId: 'task:review-order',
      fromStateId: 'state:failed',
      toStateId: 'state:approved',
      trigger: 'Retry approval after the blocking condition is resolved.',
      recovery: {
        stateId: 'state:failed',
        action: 'Keep the order available and explain how to retry.',
      },
    },
    {
      id: 'transition:approve',
      taskId: 'task:review-order',
      fromStateId: 'state:ready',
      toStateId: 'state:approved',
      trigger: 'Confirm approval.',
      recovery: {
        stateId: 'state:failed',
        action: 'Preserve the review context and expose a retry path.',
      },
    },
  ],
  densityProfiles: [{
    id: 'density:order-queue',
    label: 'Order queue',
    itemCount: { minimum: 0, typical: 18, maximum: 240 },
    contentIds: ['content:order-summary', 'content:approval-result'],
    stateIds: ['state:ready', 'state:failed', 'state:approved'],
    taskIds: ['task:review-order'],
  }],
});

function assertModelError(run: () => unknown, code: ContentStateModelErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ContentStateModelError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test('content/state parsing emits a canonical deeply immutable snapshot bound to its plan', () => {
  const source = validModel();
  const parsed = parseContentStateModel(source);
  const canonical = canonicalContentStateModelJson(source);

  source.content[0]!.value = 'Caller mutation.';
  source.tasks[0]!.applicableStateIds.push('state:caller-mutation');
  source.transitions[0]!.recovery.action = 'Caller mutation.';
  source.densityProfiles[0]!.itemCount.maximum = 999;

  assert.equal(parsed.planSha256, sha('a'));
  assert.deepEqual(parsed.inputReceipts.map(({ id }) => id), ['input:brief', 'input:plan', 'input:sample']);
  assert.deepEqual(parsed.states.map(({ id }) => id), ['state:approved', 'state:failed', 'state:ready']);
  assert.deepEqual(parsed.transitions.map(({ id }) => id), ['transition:approve', 'transition:retry']);
  assert.deepEqual(parsed.tasks[0]?.applicableStateIds, ['state:approved', 'state:failed', 'state:ready']);
  assert.deepEqual(
    parsed.content.find(({ id }) => id === 'content:approval-result')?.provenance.receiptIds,
    ['input:brief', 'input:sample'],
  );
  assert.match(canonical, /^\{"schema":"design-development-content-state-model-v1",/);
  assert.equal(canonical, JSON.stringify(parsed));

  assert.equal(
    parsed.content.find(({ id }) => id === 'content:order-summary')?.value,
    'Three warehouse items are ready for approval.',
  );
  for (const value of [
    parsed,
    parsed.inputReceipts,
    parsed.inputReceipts[0],
    parsed.content,
    parsed.content[0],
    parsed.content[0]?.provenance,
    parsed.content[0]?.provenance.receiptIds,
    parsed.tasks[0],
    parsed.states[0],
    parsed.states[0]?.requirement,
    parsed.transitions[0],
    parsed.transitions[0]?.recovery,
    parsed.densityProfiles[0],
    parsed.densityProfiles[0]?.itemCount,
  ]) assert.equal(Object.isFrozen(value), true);
});

test('plan hash requires one matching plan receipt and every receipt has an exact shape', () => {
  const missing = validModel();
  missing.inputReceipts = missing.inputReceipts.filter(({ kind }) => kind !== 'plan');
  assertModelError(() => parseContentStateModel(missing), 'CONTENT_STATE_PLAN_RECEIPT_MISMATCH');

  assertModelError(
    () => parseContentStateModel({ ...validModel(), planSha256: sha('d') }),
    'CONTENT_STATE_PLAN_RECEIPT_MISMATCH',
  );

  const extra = validModel();
  Object.defineProperty(extra.inputReceipts[0], 'path', { value: '/private/source.json', enumerable: false });
  assertModelError(() => parseContentStateModel(extra), 'MALFORMED_CONTENT_STATE_MODEL');
});

test('content requires representative or production-like receipt-bound provenance', () => {
  const placeholder = validModel();
  placeholder.content[0]!.provenance.fidelity = 'placeholder' as 'representative';
  assertModelError(() => parseContentStateModel(placeholder), 'INVALID_CONTENT_STATE_PROVENANCE');

  const unbound = validModel();
  unbound.content[0]!.provenance.receiptIds = [];
  assertModelError(() => parseContentStateModel(unbound), 'INVALID_CONTENT_STATE_PROVENANCE');

  const weakProductionClaim = validModel();
  weakProductionClaim.content[1]!.provenance.receiptIds = ['input:brief'];
  assertModelError(() => parseContentStateModel(weakProductionClaim), 'INVALID_CONTENT_STATE_PROVENANCE');
});

test('durable model values reject filler, PII-shaped data, and credential-shaped data', () => {
  const unsafeValues = [
    'Lorem ipsum dolor sit amet.',
    'Contact operator@example.com for approval.',
    'Call +1 (415) 555-0137 for approval.',
    'Card 4111 1111 1111 1111 is on file.',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    'api_key=sk-abcdefghijklmnopqrstuvwxyz123456',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue',
    '-----BEGIN PRIVATE KEY-----',
  ];

  for (const value of unsafeValues) {
    const model = validModel();
    model.content[0]!.value = value;
    assertModelError(() => parseContentStateModel(model), 'UNSAFE_DURABLE_CONTENT_STATE_VALUE');
  }
});

test('input-required states cannot be invented from research or sample receipts', () => {
  for (const receiptId of ['input:sample', 'input:research']) {
    const model = validModel();
    if (receiptId === 'input:research') {
      model.inputReceipts.push({ id: receiptId, kind: 'domain-research', sha256: sha('d') });
    }
    model.states[0]!.requirement = { kind: 'input-required', receiptId };
    assertModelError(() => parseContentStateModel(model), 'INVENTED_MANDATORY_CONTENT_STATE');
  }
});

test('all content, state, task, transition, recovery, density, and provenance references resolve', () => {
  const cases: Array<(model: ReturnType<typeof validModel>) => void> = [
    (model) => { model.content[0]!.provenance.receiptIds = ['input:missing']; },
    (model) => { model.tasks[0]!.contentIds = ['content:missing']; },
    (model) => { model.tasks[0]!.applicableStateIds = ['state:missing']; },
    (model) => { model.states[0]!.contentIds = ['content:missing']; },
    (model) => { model.transitions[0]!.taskId = 'task:missing'; },
    (model) => { model.transitions[0]!.fromStateId = 'state:missing'; },
    (model) => { model.transitions[0]!.recovery.stateId = 'state:missing'; },
    (model) => { model.densityProfiles[0]!.contentIds = ['content:missing']; },
    (model) => { model.densityProfiles[0]!.stateIds = ['state:missing']; },
    (model) => { model.densityProfiles[0]!.taskIds = ['task:missing']; },
  ];

  for (const mutate of cases) {
    const model = validModel();
    mutate(model);
    assertModelError(() => parseContentStateModel(model), 'DANGLING_CONTENT_STATE_REFERENCE');
  }

  const outsideTask = validModel();
  outsideTask.tasks[0]!.applicableStateIds = ['state:ready', 'state:approved'];
  assertModelError(() => parseContentStateModel(outsideTask), 'DANGLING_CONTENT_STATE_REFERENCE');
});

test('density profiles are bounded integer distributions over real model references', () => {
  for (const itemCount of [
    { minimum: -1, typical: 18, maximum: 240 },
    { minimum: 0, typical: 18.5, maximum: 240 },
    { minimum: 20, typical: 18, maximum: 240 },
    { minimum: 0, typical: 241, maximum: 240 },
  ]) {
    const model = validModel();
    model.densityProfiles[0]!.itemCount = itemCount;
    assertModelError(() => parseContentStateModel(model), 'INVALID_CONTENT_STATE_DENSITY');
  }
});

test('the contract rejects unknown keys, duplicate identities and duplicate references', () => {
  assertModelError(
    () => parseContentStateModel({ ...validModel(), mandatoryStates: ['state:ready'] }),
    'MALFORMED_CONTENT_STATE_MODEL',
  );

  const duplicateId = validModel();
  duplicateId.states.push({ ...duplicateId.states[0]! });
  assertModelError(() => parseContentStateModel(duplicateId), 'DUPLICATE_CONTENT_STATE_ID');

  const duplicateReference = validModel();
  duplicateReference.tasks[0]!.contentIds.push('content:order-summary');
  assertModelError(() => parseContentStateModel(duplicateReference), 'DUPLICATE_CONTENT_STATE_REFERENCE');
});
