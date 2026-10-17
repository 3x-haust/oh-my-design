import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consultedReferenceComparisonExpectations,
  parseConsultedReferenceComparisons,
} from '../core/runtime/native-consulted-reference-fidelity.ts';

const sha = (character: string): string => character.repeat(64);
const expectations = () => consultedReferenceComparisonExpectations([{
  referenceRole: 'primary',
  component: 'menu',
  state: 'open',
  captureSha256: sha('a'),
}], [{
  component: 'menu',
  state: 'open',
  viewport: 'desktop',
  captureSha256: sha('b'),
}, {
  component: 'menu',
  state: 'open',
  viewport: 'mobile',
  captureSha256: sha('c'),
}]);
const comparisons = () => expectations().map(binding => ({
  ...binding,
  verdict: 'pass' as const,
  sourceIdentity: 'Layered menu with compact grouped actions and clear separation.',
  preservedTraits: ['Grouped action rhythm and overlay proportions remain visible.'],
  departures: [],
  findings: [],
}));

test('consulted final comparisons require exact state and viewport coverage', () => {
  const expected = expectations();
  assert.equal(expected.length, 2);
  assert.deepEqual(parseConsultedReferenceComparisons(
    comparisons().reverse(), expected, [], 'GREEN',
  ).map(row => [row.viewport, row.targetCaptureSha256]).sort(), comparisons()
    .map(row => [row.viewport, row.targetCaptureSha256]).sort());
  assert.throws(() => consultedReferenceComparisonExpectations([{
    referenceRole: 'primary',
    component: 'menu',
    state: 'open',
    captureSha256: sha('a'),
  }], [{
    component: 'menu',
    state: 'open',
    viewport: 'desktop',
    captureSha256: sha('b'),
  }]), /missing product state coverage/);
  assert.throws(() => parseConsultedReferenceComparisons(
    comparisons().slice(1), expected, [], 'GREEN',
  ), /coverage/);
  assert.throws(() => parseConsultedReferenceComparisons(
    comparisons().map((row, index) => index === 0
      ? { ...row, targetCaptureSha256: sha('d') } : row),
    expected, [], 'GREEN',
  ), /binding/);
});

test('non-pass consulted comparisons require bound findings and cannot coexist with GREEN fidelity', () => {
  const expected = expectations();
  const failed = comparisons().map((row, index) => index === 0 ? {
    ...row,
    verdict: 'fail' as const,
    findings: ['The open menu loses the primary grouped action hierarchy.'],
  } : row);
  assert.deepEqual(parseConsultedReferenceComparisons(
    failed, expected, failed[0]!.findings, 'RED',
  ), failed);
  assert.throws(() => parseConsultedReferenceComparisons(
    failed, expected, [], 'RED',
  ), /unresolved findings/);
  assert.throws(() => parseConsultedReferenceComparisons(
    failed, expected, failed[0]!.findings, 'GREEN',
  ), /GREEN fidelity/);
  assert.throws(() => parseConsultedReferenceComparisons(
    comparisons().map((row, index) => index === 0
      ? { ...row, findings: ['Unexpected finding'] } : row),
    expected, ['Unexpected finding'], 'GREEN',
  ), /unresolved findings/);
});
