import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  EvidenceClaimError,
  parseEvidenceClaimPublication,
  type EvidenceClaimErrorCode,
} from '../core/brief/evidence-claims.ts';
import { finalizeFinalEvidence } from '../core/evidence/final.ts';

const validPublication = () => ({
  schema: 'evidence-claim-publication-v1',
  claims: [
    {
      id: 'customer-goal',
      text: 'The customer wants to see the total before purchase.',
      status: 'confirmed',
      userEvidence: [{
        kind: 'explicit-user-evidence',
        source: 'user-message',
        reference: 'message-1',
        excerpt: 'Show the total before purchase.',
      }],
    },
    {
      id: 'sticky-summary',
      text: 'A sticky summary may reduce backtracking.',
      status: 'hypothesis',
      basis: 'The total is needed at confirmation time.',
    },
    {
      id: 'mobile-first-pass',
      text: 'Implement the narrow layout first for this pass.',
      status: 'temporary-decision',
      basis: 'The implementation order remains reversible.',
    },
  ],
  userFacts: ['customer-goal'],
  workingContext: ['sticky-summary', 'mobile-first-pass'],
});

function assertClaimError(run: () => unknown, code: EvidenceClaimErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof EvidenceClaimError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

test('existing publication safety rejects legacy final evidence without creating state', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-evidence-claims-baseline-'));
  const manifest = join(root, '.omd', 'manifest.json');
  try {
    mkdirSync(join(root, '.omd'), { recursive: true });
    writeFileSync(manifest, '{');

    assert.throws(() => finalizeFinalEvidence(root, manifest), /LEGACY_PUBLICATION_DISABLED/);
    assert.equal(existsSync(join(root, '.omd', 'final-evidence.json')), false);
    assert.equal(existsSync(join(root, '.omd', 'final-evidence-runs')), false);
    assert.equal(existsSync(join(root, '.omd', '.final-evidence.lock')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('confirmed facts, hypotheses, and temporary decisions retain one strict labeled route', () => {
  const parsed = parseEvidenceClaimPublication(validPublication());

  assert.deepEqual(parsed, validPublication());
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.claims), true);
  assert.equal(parsed.claims.every(Object.isFrozen), true);
  assert.equal(Object.isFrozen(parsed.userFacts), true);
  assert.equal(Object.isFrozen(parsed.workingContext), true);
});

test('a clearly labeled hypothesis remains usable through working context', () => {
  const parsed = parseEvidenceClaimPublication({
    schema: 'evidence-claim-publication-v1',
    claims: [{
      id: 'navigation-hypothesis',
      text: 'Persistent navigation may reduce recovery cost.',
      status: 'hypothesis',
      basis: 'The task crosses multiple views.',
    }],
    userFacts: [],
    workingContext: ['navigation-hypothesis'],
  });

  assert.deepEqual(parsed.workingContext, ['navigation-hypothesis']);
  assert.equal(parsed.claims[0]?.status, 'hypothesis');
});

test('unconfirmed or unevidenced claims cannot be published as user facts', () => {
  const hypothesisAsFact = validPublication();
  hypothesisAsFact.userFacts = ['customer-goal', 'sticky-summary'];
  hypothesisAsFact.workingContext = ['mobile-first-pass'];
  assertClaimError(() => parseEvidenceClaimPublication(hypothesisAsFact), 'UNCONFIRMED_USER_FACT');

  const temporaryDecisionAsFact = validPublication();
  temporaryDecisionAsFact.userFacts = ['customer-goal', 'mobile-first-pass'];
  temporaryDecisionAsFact.workingContext = ['sticky-summary'];
  assertClaimError(() => parseEvidenceClaimPublication(temporaryDecisionAsFact), 'UNCONFIRMED_USER_FACT');

  const noEvidence = validPublication();
  const confirmed = noEvidence.claims.find((claim) => claim.status === 'confirmed');
  confirmed?.userEvidence?.splice(0);
  assertClaimError(() => parseEvidenceClaimPublication(noEvidence), 'MISSING_USER_EVIDENCE');

  assertClaimError(() => parseEvidenceClaimPublication({
    schema: 'evidence-claim-publication-v1',
    claims: [{ id: 'unsupported-fact', text: 'Unsupported.', status: 'confirmed' }],
    userFacts: ['unsupported-fact'],
    workingContext: [],
  }), 'MISSING_USER_EVIDENCE');
});

test('claim parsing rejects unknown input, unknown status, missing routes, and duplicate identities', () => {
  assertClaimError(() => parseEvidenceClaimPublication(null), 'MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
  assertClaimError(() => parseEvidenceClaimPublication({
    schema: 'evidence-claim-publication-v1', claims: [], userFacts: [], workingContext: [],
  }), 'EMPTY_EVIDENCE_CLAIM_FIELD');

  const unknownStatus = validPublication();
  const hypothesis = unknownStatus.claims.find((claim) => claim.status === 'hypothesis');
  if (hypothesis !== undefined) hypothesis.status = 'likely';
  assertClaimError(() => parseEvidenceClaimPublication(unknownStatus), 'INVALID_EVIDENCE_CLAIM_STATUS');

  const missingRoute = validPublication();
  missingRoute.workingContext = ['sticky-summary'];
  assertClaimError(() => parseEvidenceClaimPublication(missingRoute), 'UNROUTED_EVIDENCE_CLAIM');

  const duplicateClaim = validPublication();
  if (duplicateClaim.claims[1] !== undefined) duplicateClaim.claims[1].id = 'customer-goal';
  assertClaimError(() => parseEvidenceClaimPublication(duplicateClaim), 'DUPLICATE_EVIDENCE_CLAIM');

  const duplicateRoute = validPublication();
  duplicateRoute.workingContext = ['sticky-summary', 'sticky-summary', 'mobile-first-pass'];
  assertClaimError(() => parseEvidenceClaimPublication(duplicateRoute), 'DUPLICATE_EVIDENCE_CLAIM_PUBLICATION');

  const unknownRoute = validPublication();
  unknownRoute.workingContext = ['sticky-summary', 'mobile-first-pass', 'missing'];
  assertClaimError(() => parseEvidenceClaimPublication(unknownRoute), 'UNKNOWN_EVIDENCE_CLAIM_REFERENCE');
});

test('confirmed claims require non-empty duplicate-free explicit user evidence', () => {
  const emptyEvidence = validPublication();
  const firstEvidence = emptyEvidence.claims.find((claim) => claim.status === 'confirmed')?.userEvidence?.[0];
  if (firstEvidence !== undefined) firstEvidence.excerpt = '   ';
  assertClaimError(() => parseEvidenceClaimPublication(emptyEvidence), 'EMPTY_EVIDENCE_CLAIM_FIELD');

  const duplicateEvidence = validPublication();
  const confirmed = duplicateEvidence.claims.find((claim) => claim.status === 'confirmed');
  const evidence = confirmed?.userEvidence?.[0];
  if (confirmed?.userEvidence !== undefined && evidence !== undefined) confirmed.userEvidence.push({ ...evidence });
  assertClaimError(() => parseEvidenceClaimPublication(duplicateEvidence), 'DUPLICATE_USER_EVIDENCE');
});

test('claim parsing accounts for hidden and Symbol own keys at every boundary', () => {
  const hiddenRoot = validPublication();
  Object.defineProperty(hiddenRoot, 'hidden', { value: true });
  assertClaimError(() => parseEvidenceClaimPublication(hiddenRoot), 'UNEXPECTED_EVIDENCE_CLAIM_FIELD');

  const symbolicClaim = validPublication();
  const symbol = Symbol('extra');
  const claim = symbolicClaim.claims[1];
  if (claim !== undefined) Object.defineProperty(claim, symbol, { value: true });
  assertClaimError(() => parseEvidenceClaimPublication(symbolicClaim), 'UNEXPECTED_EVIDENCE_CLAIM_FIELD');

  const decoratedClaims = validPublication();
  Object.defineProperty(decoratedClaims.claims, 'concealed', { value: true });
  assertClaimError(() => parseEvidenceClaimPublication(decoratedClaims), 'UNEXPECTED_EVIDENCE_CLAIM_FIELD');

  const hiddenEvidence = validPublication();
  const evidence = hiddenEvidence.claims.find((item) => item.status === 'confirmed')?.userEvidence?.[0];
  if (evidence !== undefined) Object.defineProperty(evidence, 'concealed', { value: true });
  assertClaimError(() => parseEvidenceClaimPublication(hiddenEvidence), 'UNEXPECTED_EVIDENCE_CLAIM_FIELD');

  const decoratedRoute = validPublication();
  Object.defineProperty(decoratedRoute.workingContext, 'concealed', { value: true });
  assertClaimError(() => parseEvidenceClaimPublication(decoratedRoute), 'UNEXPECTED_EVIDENCE_CLAIM_FIELD');
});

test('accessors and hostile proxies fail closed with a stable typed error', () => {
  const accessor = validPublication();
  const claim = accessor.claims[1];
  if (claim !== undefined) Object.defineProperty(claim, 'text', { get: () => 'forged' });
  assertClaimError(() => parseEvidenceClaimPublication(accessor), 'MALFORMED_EVIDENCE_CLAIM_PUBLICATION');

  const proxy = new Proxy(validPublication(), {
    ownKeys(): never {
      throw new Error('hostile ownKeys');
    },
  });
  assertClaimError(() => parseEvidenceClaimPublication(proxy), 'MALFORMED_EVIDENCE_CLAIM_PUBLICATION');
});

test('parsed claims are frozen snapshots detached from stale mutable input', () => {
  const source = validPublication();
  const parsed = parseEvidenceClaimPublication(source);

  if (source.claims[0] !== undefined) source.claims[0].text = 'Changed after parsing.';
  source.userFacts.splice(0);
  source.workingContext.push('customer-goal');

  assert.deepEqual(parsed, validPublication());
});
