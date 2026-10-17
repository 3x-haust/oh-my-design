import assert from 'node:assert/strict';
import test from 'node:test';
import { parseContentGrain } from '../core/content-grain/contract.ts';

const activeGrain = (sourceSha256: string) => ({
  schema: 'content-grain-v1',
  status: 'active',
  sources: [{
    id: 'catalog',
    authority: 'project-first-party',
    path: 'content/catalog.json',
    sha256: sourceSha256,
  }],
  fixtures: [
    { id: 'typical-description', sourceId: 'catalog', locator: '$.services[1].description', role: 'typical' },
    { id: 'long-description', sourceId: 'catalog', locator: '$.services[2].description', role: 'maximum' },
  ],
  traits: [{
    id: 'description-length',
    sourceIds: ['catalog'],
    fixtureIds: ['typical-description', 'long-description'],
    metric: { kind: 'range', unit: 'graphemes', minimum: 12, typical: 48, maximum: 164 },
    semanticRole: 'primary-proof',
    antiTemplateConsequence: 'Do not force every service into equal-height cards.',
    responsiveConsequence: 'Keep the long proof adjacent to its service action.',
    falsifier: 'The long description clips or becomes less prominent than supporting copy.',
  }],
});

test('content grain parsing ignores ordinary extra fields but rejects hostile objects', () => {
  const valid = activeGrain('a'.repeat(64));
  assert.deepEqual(parseContentGrain({ ...valid, surprise: true }), parseContentGrain(valid));

  const hostile = Object.create(null) as Record<string, unknown>;
  Object.assign(hostile, valid);
  Object.defineProperty(hostile, 'traits', {
    enumerable: true,
    get() {
      throw new Error('hostile getter executed');
    },
  });
  assert.throws(
    () => parseContentGrain(hostile),
    /CONTENT_GRAIN_INVALID.*plain object/i,
  );
});
