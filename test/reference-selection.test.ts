import assert from 'node:assert/strict';
import test from 'node:test';
import { ReferenceSelectionValidationError, parseReferenceSelection } from '../core/ref/reference-selection.ts';

const selection = {
  schemaVersion: 'reference-selection-v1',
  boardSha256: 'a'.repeat(64),
  assemblySha256: 'b'.repeat(64),
  candidateId: 'candidate-01',
};

test('reference selections accept only the closed hash-bound record', () => {
  // Given: a selection record with exactly the four versioned ABI fields.
  const valid = parseReferenceSelection(selection);

  // When: consumers add raw lineage or provide a noncanonical board hash.
  const invalid = [
    { ...selection, sourcePage: 'https://source.example/raw' },
    { ...selection, referenceId: 'ref-raw-capture' },
    { ...selection, boardSha256: 'A'.repeat(64) },
  ];

  // Then: the valid record is retained and every expanded or malformed record is rejected.
  assert.deepEqual(valid, selection);
  for (const value of invalid) assert.throws(() => parseReferenceSelection(value), ReferenceSelectionValidationError);
});
