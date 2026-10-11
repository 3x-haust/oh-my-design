import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDynamicTypeCoverage } from '../core/brief/dynamic-type.ts';
import { candidateCopyProjection } from '../core/brief/candidate-plan.ts';
import { assertRoleDelivery } from './helpers/prompt-delivery.ts';

const coverage = { locales: ['ko-KR'], scripts: ['Hangul', 'Latin'], sources: [{ roleId: 'body', kind: 'user-input', bounded: false }],
  unicodeRanges: ['U+0020-007E', 'U+1100-11FF', 'U+3130-318F', 'U+AC00-D7A3'], requiredPunctuationAndSymbols: ['₩', '−'], normalization: 'preserve',
  fallbackStack: ['sans-serif'], unknownScriptPolicy: 'fallback', subsets: [] };

test('dynamic Hangul coverage rejects current-copy-only subsets and preserves full supported ranges', () => {
  assert.throws(() => parseDynamicTypeCoverage({ ...coverage, unicodeRanges: ['U+AC00'] }));
  assert.deepEqual(parseDynamicTypeCoverage(coverage).unicodeRanges, coverage.unicodeRanges);
  assert.equal(parseDynamicTypeCoverage({ ...coverage, sources: [{ roleId: 'display', kind: 'fixed-copy', bounded: true }], unicodeRanges: ['U+AC00'] }).sources[0]!.kind, 'fixed-copy');
});

test('font subset CSS ranges must match their declared asset coverage', () => {
  assert.throws(() => parseDynamicTypeCoverage({ ...coverage, subsets: [{ familyId: 'body', ranges: ['U+AC00-D7A3'], asset: { path: 'font.woff2', sha256: 'a'.repeat(64) }, unicodeRange: 'U+AC00' }] }));
});

test('Writer metadata closure preserves candidate visible-content digest but actual copy changes invalidate it', () => {
  const deck = '## Surface copy\n### Main\nExact text\n## Truth contract\nLocal only\n';
  assert.equal(candidateCopyProjection(deck), candidateCopyProjection(deck + '## Selected direction\nMetadata only\n'));
  assert.notEqual(candidateCopyProjection(deck), candidateCopyProjection(deck.replace('Exact text', 'Changed text')));
});

test('type and copy source instructions survive host emission under their exclusive role identities', () => {
  assertRoleDelivery('typesetter'); assertRoleDelivery('writer');
});
