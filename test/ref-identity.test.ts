import test from 'node:test';
import assert from 'node:assert/strict';
import { refIdentity } from '../core/ref/identity.ts';

test('refIdentity keeps the established SHA-256 identity byte-for-byte', () => {
  // Given: same-host references and components that must remain distinct.
  const cases = [
    ['https://linear.app/one', 'page', 'ref-601f60093279ecef'],
    ['https://linear.app/two', 'page', 'ref-95fe2bcfc1c487c3'],
    ['https://linear.app/one', 'dialog', 'ref-67e26fa9f408fac4'],
  ] as const;

  // When: each reference receives its stable authoring identity.
  const identities = cases.map(([source, component]) => refIdentity(source, component));

  // Then: the separator, SHA-256 truncation, and prefix match the established contract.
  assert.deepEqual(identities, cases.map(([, , expected]) => expected));
});
