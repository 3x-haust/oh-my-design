import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const TIERS = ['unit', 'integration', 'browser', 'native', 'packaging'] as const;
type Tier = (typeof TIERS)[number];
type Manifest = { readonly version: number; readonly tiers: Readonly<Record<Tier, readonly string[]>> };

const manifest = JSON.parse(readFileSync(new URL('./test-manifest.json', import.meta.url), 'utf8')) as Manifest;

test('every top-level test file is classified in exactly one test tier', () => {
  assert.equal(manifest.version, 1);
  assert.deepEqual(Object.keys(manifest.tiers).sort(), [...TIERS].sort());

  const actual = readdirSync(new URL('.', import.meta.url))
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => `test/${name}`)
    .sort();
  const classified = TIERS.flatMap((tier) => manifest.tiers[tier]);
  const duplicates = classified.filter((file, index) => classified.indexOf(file) !== index);

  assert.deepEqual([...new Set(duplicates)].sort(), [], 'a test file may appear in only one tier');
  assert.deepEqual([...classified].sort(), actual, 'run node scripts/test/classify.ts --write, then hand-check the proposed tier');
  for (const tier of TIERS) {
    assert.deepEqual([...manifest.tiers[tier]].sort(), manifest.tiers[tier], `${tier} entries must stay sorted`);
  }
});
