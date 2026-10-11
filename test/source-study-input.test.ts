import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSourceStudyInput, SOURCE_STUDY_INPUT_SCHEMA,
} from '../core/art-direction/source-study-input.ts';

const input = {
  schema: SOURCE_STUDY_INPUT_SCHEMA,
  reason: 'Compare an attached record with a focused record.',
  primaryAction: 'Write a note for the selected book.',
  destinationContent: [{ path: 'books.json', content: '{"title":"산책의 문장들"}' }],
  variants: [
    { id: 'attached', relationship: 'Keep the note with its book.', observableConsequence: 'The note retains its book context.' },
    { id: 'focused', relationship: 'Move from collection to one book.', observableConsequence: 'The selected record has a dedicated writing surface.' },
  ],
};

test('study input preserves real content and the declared alternative set', () => {
  assert.deepEqual(parseSourceStudyInput(input), input);
  assert.equal(parseSourceStudyInput({ ...input, variants: input.variants.slice(0, 1) }).variants.length, 1);
});

test('study input refuses authority fields and caller-supplied source images', () => {
  for (const extra of [{ model: 'another-model' }, { approved: true }, { referenceRenders: [] }]) {
    assert.throws(() => parseSourceStudyInput({ ...input, ...extra }), /input-fields/);
  }
});

test('study input refuses ambiguous variants and unsafe content labels', () => {
  assert.throws(() => parseSourceStudyInput({ ...input, variants: [input.variants[0], input.variants[0]] }), /variant-duplicate/);
  for (const path of ['/private.txt', '../private.txt', 'a/../private.txt', 'a\\private.txt', 'a//b']) {
    assert.throws(() => parseSourceStudyInput({ ...input, destinationContent: [{ path, content: 'data' }] }), /content-path/);
  }
  assert.throws(() => parseSourceStudyInput({ ...input, destinationContent: [
    { path: 'same.json', content: 'one' }, { path: 'same.json', content: 'two' },
  ] }), /content-duplicate/);
});

test('study input refuses missing, sparse and oversized content instead of clipping', () => {
  assert.throws(() => parseSourceStudyInput({ ...input, variants: [] }), /input-array/);
  assert.throws(() => parseSourceStudyInput({ ...input, variants: new Array(1) }), /input-array/);
  assert.throws(() => parseSourceStudyInput({ ...input, destinationContent: [
    { path: 'large.txt', content: 'x'.repeat(64 * 1024 + 1) },
  ] }), /input-text/);
  assert.throws(() => parseSourceStudyInput({ ...input, reason: '' }), /input-text/);
});
