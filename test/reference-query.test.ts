import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_QUERY_WORDS,
  ReferenceQueryError,
  queriesFromSurfaces,
  referenceQuerySha256,
  validateReferenceQuery,
} from '../core/ref/reference-query.ts';

test('the part keywords a designer actually searches are accepted', () => {
  for (const query of ['task management', 'side panel', 'contextual sidebar', 'command palette', 'empty state', 'data table row actions']) {
    assert.equal(validateReferenceQuery('component', query), query);
  }
});

test('a whole-concept phrase is refused because no screen is named that', () => {
  for (const query of [
    'AI desktop assistant',
    'AI desktop assistant app',
    'task management tool',
    'design system for developers',
    'smart dashboard platform',
  ]) {
    assert.throws(
      () => validateReferenceQuery('component', query),
      (error: unknown) => error instanceof ReferenceQueryError && error.code === 'QUERY_WHOLE_CONCEPT',
      query,
    );
  }
});

test('a non-English query is refused rather than silently translated', () => {
  for (const query of ['작업 관리', '사이드 패널', 'côté barre', 'таблица данных']) {
    assert.throws(
      () => validateReferenceQuery('component', query),
      (error: unknown) => error instanceof ReferenceQueryError && error.code === 'QUERY_NOT_ENGLISH',
      query,
    );
  }
  assert.doesNotThrow(() => validateReferenceQuery('craft', "editor's letter" ));
});

test('a query longer than a part name is refused', () => {
  const long = 'data table with inline row actions and status pills';
  assert.ok(long.split(' ').length > MAX_QUERY_WORDS);
  assert.throws(() => validateReferenceQuery('component', long), /past the 4/);
  assert.doesNotThrow(() => validateReferenceQuery('component', 'data table row actions'));
});

test('an empty query is refused', () => {
  assert.throws(() => validateReferenceQuery('component', '   '), (error: unknown) => error instanceof ReferenceQueryError && error.code === 'MALFORMED_REFERENCE_QUERY');
});

test('surface names become part queries with the domain qualifier dropped', () => {
  const queries = queriesFromSurfaces(['cinema booking seat map', 'cinema booking checkout'], 'cinema booking');
  assert.deepEqual(queries, ['seat map', 'checkout'], 'the domain prefix is dropped so the part stands alone');
});

test('a surface whose name is already the part is left intact', () => {
  assert.deepEqual(queriesFromSurfaces(['seat map'], 'cinema booking'), ['seat map']);
  assert.deepEqual(queriesFromSurfaces(['task management', 'side panel'], 'ai desktop assistant'), ['task management', 'side panel']);
});

test('a surface that cannot become a part query is dropped rather than emitted unusably', () => {
  assert.deepEqual(queriesFromSurfaces(['AI desktop assistant', '설정 화면'], 'AI desktop assistant'), []);
  assert.deepEqual(queriesFromSurfaces(['cinema booking seat map with availability and pricing'], 'cinema booking'), ['seat map']);
});

test('a query list has a stable identity', () => {
  const queries = [
    { lane: 'component' as const, query: 'side panel', seed: 'side panel' },
    { lane: 'craft' as const, query: 'scroll reveal', seed: 'motion' },
  ];
  assert.equal(referenceQuerySha256(queries), referenceQuerySha256([...queries]));
  assert.notEqual(referenceQuerySha256(queries), referenceQuerySha256([queries[1]!, queries[0]!]));
});
