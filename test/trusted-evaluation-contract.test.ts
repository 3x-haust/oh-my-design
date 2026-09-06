import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TrustedEvaluationContractError,
  deriveTrustedEvaluationIdentity,
  parseTrustedLifecycleManifest,
} from '../core/runtime/trusted-evaluation-contract.ts';
import { parseEvidenceClaimPublication } from '../core/brief/evidence-claims.ts';
import { parseTaskOutcomeContract } from '../core/brief/task-outcome.ts';

const sha = (value: string): string => value.repeat(64);

const taskOutcome = () => parseTaskOutcomeContract({
  schema: 'task-outcome-contract-v1',
  goal: 'Submit an order',
  mustHave: ['Order submission succeeds', 'Success status is visible'],
  mustNotHave: ['Submit twice'],
  completionEvidence: ['Visible Order submitted status'],
  strategyFreedom: ['Visual treatment'],
});

const claims = () => parseEvidenceClaimPublication({
  schema: 'evidence-claim-publication-v1',
  claims: [
    {
      id: 'claim:user-role',
      text: 'The user is a buyer',
      status: 'confirmed',
      userEvidence: [{
        kind: 'explicit-user-evidence',
        source: 'user-message',
        reference: 'brief:1',
        excerpt: 'buyer',
      }],
    },
    {
      id: 'claim:working-copy',
      text: 'Short copy may help',
      status: 'hypothesis',
      basis: 'design exploration',
    },
  ],
  userFacts: ['claim:user-role'],
  workingContext: ['claim:working-copy'],
});

test('evaluation identity is complete source-bound and excludes non-confirmed claims', () => {
  const first = deriveTrustedEvaluationIdentity({
    sourceContractSha256: sha('a'),
    taskOutcome: taskOutcome(),
    evidenceClaims: claims(),
    allowedPaths: ['index.html'],
    entryPath: 'index.html',
  });
  const second = deriveTrustedEvaluationIdentity({
    sourceContractSha256: sha('b'),
    taskOutcome: taskOutcome(),
    evidenceClaims: claims(),
    allowedPaths: ['index.html'],
    entryPath: 'index.html',
  });

  assert.equal(first.requiredOutcomeRefs.length, 4);
  assert.equal(first.confirmedClaimRefs.length, 1);
  assert.match(first.requiredOutcomeRefs[0]!, /^outcome:a{64}:mustHave:0:[a-f0-9]{64}$/);
  assert.match(first.requiredOutcomeRefs[1]!, /^outcome:a{64}:mustHave:1:[a-f0-9]{64}$/);
  assert.match(first.requiredOutcomeRefs[2]!, /^outcome:a{64}:mustNotHave:0:[a-f0-9]{64}$/);
  assert.match(first.requiredOutcomeRefs[3]!, /^outcome:a{64}:completionEvidence:0:[a-f0-9]{64}$/);
  assert.match(first.confirmedClaimRefs[0]!, /^claim:a{64}:claim:user-role:[a-f0-9]{64}$/);
  assert.notDeepEqual(first.requiredOutcomeRefs, second.requiredOutcomeRefs);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.requiredOutcomeRefs));
});

test('evaluation identity rejects an entry path outside route scope', () => {
  assert.throws(
    () => deriveTrustedEvaluationIdentity({
      sourceContractSha256: sha('a'),
      taskOutcome: taskOutcome(),
      evidenceClaims: claims(),
      allowedPaths: ['src/**'],
      entryPath: 'index.html',
    }),
    (error: unknown) => error instanceof TrustedEvaluationContractError
      && error.code === 'TRUSTED_EVALUATION_ENTRY_OUTSIDE_ROUTE',
  );
});

test('lifecycle manifest forbids caller-authored authority and closes its shape', () => {
  assert.throws(
    () => parseTrustedLifecycleManifest({
      schema: 'trusted-lifecycle-manifest-v1',
      entryPath: 'index.html',
      authority: { sha256: sha('f') },
      scripts: [],
    }),
    (error: unknown) => error instanceof TrustedEvaluationContractError
      && error.code === 'LIFECYCLE_MANIFEST_AUTHORITY_FORBIDDEN',
  );
  assert.throws(
    () => parseTrustedLifecycleManifest({
      schema: 'trusted-lifecycle-manifest-v1',
      entryPath: 'index.html',
      scripts: [],
      extra: true,
    }),
    (error: unknown) => error instanceof TrustedEvaluationContractError
      && error.code === 'MALFORMED_TRUSTED_LIFECYCLE_MANIFEST',
  );
});

test('lifecycle manifest accepts one closed benchmark-bound entry surface', () => {
  const manifest = {
    schema: 'trusted-lifecycle-manifest-v1',
    entryPath: 'index.html',
    scripts: [],
    entrySurface: {
      benchmarkProjectionSha256: sha('a'),
      prerequisiteTaskId: 'inspect-temperature',
      dependentTaskId: 'choose-disposition',
      purpose: {
        selector: '[data-omd-purpose]',
        text: 'Resolve cold-chain shipment exceptions',
      },
      workObject: {
        selector: '[data-omd-work-object]',
        anchorSelector: '[data-omd-work-anchor]',
        anchorText: 'Shipment CX-204',
      },
      nextAction: {
        selector: '[data-omd-next-action]',
        accessibleName: 'Choose disposition',
      },
      trigger: {
        kind: 'click',
        selector: '#inspect-temperature',
      },
      consequence: {
        selector: '#dispatch-constraint',
        beforeText: 'Awaiting evidence',
        afterText: 'Cold-chain inspection required',
      },
    },
  } as const;

  assert.deepEqual(parseTrustedLifecycleManifest(manifest).entrySurface, manifest.entrySurface);
  const { nextAction: _nextAction, ...consequenceOnlyEntry } = manifest.entrySurface;
  assert.deepEqual(
    parseTrustedLifecycleManifest({ ...manifest, entrySurface: consequenceOnlyEntry }).entrySurface,
    consequenceOnlyEntry,
  );
  assert.throws(
    () => parseTrustedLifecycleManifest({
      ...manifest,
      entrySurface: {
        ...manifest.entrySurface,
        consequence: {
          ...manifest.entrySurface.consequence,
          afterText: manifest.entrySurface.consequence.beforeText,
        },
      },
    }),
    (error: unknown) => error instanceof TrustedEvaluationContractError
      && error.code === 'MALFORMED_TRUSTED_LIFECYCLE_MANIFEST',
  );
});
