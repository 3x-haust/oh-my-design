import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceQueryError, queriesFromSurfaces, querySeeds, referenceQuerySha256, validateReferenceQuery } from '../core/ref/reference-query.ts';

test('queries in any language or phrasing remain agent-authored suggestions', () => {
  for (const query of ['AI desktop assistant app', '작업 관리', 'côté barre', 'data table with inline row actions']) {
    assert.equal(validateReferenceQuery('component', query), query);
  }
  assert.deepEqual(querySeeds('mood', ['작업 관리', '작업 관리', 'AI desktop assistant app']), ['작업 관리', 'AI desktop assistant app']);
  assert.deepEqual(queriesFromSurfaces(['cinema booking seat map', '설정 화면'], 'cinema booking'),
    ['cinema booking seat map', '설정 화면']);
});

test('query validation enforces only bounded executable text', () => {
  for (const query of ['   ', 'a'.repeat(4097), 'a\nbar']) {
    assert.throws(() => validateReferenceQuery('component', query),
      (error: unknown) => error instanceof ReferenceQueryError && error.code === 'MALFORMED_REFERENCE_QUERY');
  }
});

test('a query list has a stable identity', () => {
  const queries = [
    { lane: 'component' as const, query: 'side panel', seed: 'side panel' },
    { lane: 'craft' as const, query: 'scroll reveal', seed: 'motion' },
  ];
  assert.equal(referenceQuerySha256(queries), referenceQuerySha256([...queries]));
  assert.notEqual(referenceQuerySha256(queries), referenceQuerySha256([queries[1]!, queries[0]!]));
});
