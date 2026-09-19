import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REFERENCE_GRADE_RULES,
  REFERENCE_ROLES,
  REFERENCE_SCOPES,
  REFERENCE_EVIDENCE_KINDS,
  ReferenceScopeError,
  gradeKey,
  isStudyOnly,
  parseReferenceGrade,
  parseReferenceRole,
  referenceGradeRule,
  requireRole,
  requireStructuralClaim,
} from '../core/ref/reference-scope.ts';

test('the axes are exactly two, with exactly two values each', () => {
  assert.deepEqual([...REFERENCE_SCOPES], ['whole', 'part']);
  assert.deepEqual([...REFERENCE_EVIDENCE_KINDS], ['measured', 'visual-only']);
  assert.equal(Object.keys(REFERENCE_GRADE_RULES).length, 4, 'four combinations, no role proliferation');
  for (const scope of REFERENCE_SCOPES) {
    for (const evidence of REFERENCE_EVIDENCE_KINDS) {
      assert.ok(REFERENCE_GRADE_RULES[`${scope}:${evidence}`] !== undefined);
    }
  }
});

test('a grade parses from exactly its two axes and rejects anything else', () => {
  assert.deepEqual(parseReferenceGrade({ scope: 'part', evidence: 'measured' }), { scope: 'part', evidence: 'measured' });
  for (const bad of [
    { scope: 'part' },
    { scope: 'part', evidence: 'measured', extra: true },
    { scope: 'whole', evidence: 'guessed' },
    { scope: 'component', evidence: 'measured' },
    'part:measured',
    null,
  ]) {
    assert.throws(() => parseReferenceGrade(bad), ReferenceScopeError);
  }
});

test('only measured grades carry structural claims', () => {
  assert.doesNotThrow(() => requireStructuralClaim({ scope: 'part', evidence: 'measured' }, 'transfer.geometry'));
  assert.doesNotThrow(() => requireStructuralClaim({ scope: 'whole', evidence: 'measured' }, 'invariants.spacingLadder'));

  for (const evidence of ['visual-only'] as const) {
    for (const scope of REFERENCE_SCOPES) {
      assert.throws(
        () => requireStructuralClaim({ scope, evidence }, 'transfer.geometry'),
        (error: unknown) => error instanceof ReferenceScopeError && error.code === 'VISUAL_ONLY_STRUCTURAL_CLAIM',
      );
    }
  }
  assert.equal(referenceGradeRule({ scope: 'part', evidence: 'visual-only' }).structuralClaims, false);
  assert.ok(
    REFERENCE_GRADE_RULES['part:visual-only']!.transfers.includes('geometry'),
    'a visual-only part may still transfer declared geometry, just not a measured structural claim',
  );
});

test('roles are closed and each grade lists which it may serve', () => {
  assert.deepEqual([...REFERENCE_ROLES], ['component', 'craft', 'mood']);
  assert.throws(() => parseReferenceRole('decoration'), ReferenceScopeError);
  assert.equal(parseReferenceRole('mood'), 'mood');

  assert.doesNotThrow(() => requireRole({ scope: 'part', evidence: 'measured' }, 'component'));
  assert.doesNotThrow(() => requireRole({ scope: 'whole', evidence: 'visual-only' }, 'mood'));
  assert.throws(
    () => requireRole({ scope: 'whole', evidence: 'visual-only' }, 'component'),
    (error: unknown) => error instanceof ReferenceScopeError && error.code === 'REFERENCE_ROLE_NOT_PERMITTED',
  );
  assert.throws(
    () => requireRole({ scope: 'part', evidence: 'visual-only' }, 'component'),
    (error: unknown) => error instanceof ReferenceScopeError && error.code === 'REFERENCE_ROLE_NOT_PERMITTED',
  );
});

test('no grade ships its pixels into production', () => {
  for (const rule of Object.values(REFERENCE_GRADE_RULES)) {
    assert.equal(rule.pixelsInProduction, false, 'a capture is evidence, never a shipped asset');
  }
});

test('study-only covers every whole-page and every visual-only grade', () => {
  assert.equal(isStudyOnly({ scope: 'whole', evidence: 'visual-only' }), true);
  assert.equal(isStudyOnly({ scope: 'whole', evidence: 'measured' }), true);
  assert.equal(isStudyOnly({ scope: 'part', evidence: 'visual-only' }), true);
  assert.equal(isStudyOnly({ scope: 'part', evidence: 'measured' }), false);
});

test('the grade key round-trips', () => {
  assert.equal(gradeKey({ scope: 'whole', evidence: 'visual-only' }), 'whole:visual-only');
  const rule = referenceGradeRule(parseReferenceGrade({ scope: 'part', evidence: 'measured' }));
  assert.equal(rule.purpose, REFERENCE_GRADE_RULES['part:measured']!.purpose);
});
