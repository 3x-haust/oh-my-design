import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpJson } from '../scripts/bump.ts';

test('bumpJson rewrites a single version field', () => {
  const before = '{\n  "name": "omd",\n  "version": "0.5.0"\n}\n';
  const after = bumpJson(before, '0.6.0');
  assert.equal(after, '{\n  "name": "omd",\n  "version": "0.6.0"\n}\n');
});

test('bumpJson rewrites all version fields — covers marketplace.json shape', () => {
  const before = JSON.stringify({
    version: '0.5.0',
    plugins: [{ name: 'omd', version: '0.5.0' }],
  });
  const after = bumpJson(before, '0.6.0');
  const parsed = JSON.parse(after) as { version: string; plugins: Array<{ version: string }> };
  assert.equal(parsed.version, '0.6.0');
  assert.equal(parsed.plugins[0]?.version, '0.6.0');
});

test('bumpJson does not touch other string fields', () => {
  const before = '{"name":"omd","version":"0.5.0","description":"test v0.5.0 notes"}';
  const after = bumpJson(before, '0.6.0');
  // name and description unchanged
  assert.match(after, /"name":"omd"/);
  assert.match(after, /"description":"test v0.5.0 notes"/);
  // only the version field updated
  assert.match(after, /"version": "0.6.0"/);
  assert.doesNotMatch(after, /"version": "0.5.0"/);
});

test('bumpJson is idempotent — bumping to the same version changes nothing meaningful', () => {
  const before = '{"version":"0.6.0"}';
  const after = bumpJson(before, '0.6.0');
  assert.equal(JSON.parse(after).version, '0.6.0');
});

test('bumpJson handles compact JSON without spaces around colon', () => {
  const before = '{"version":"1.0.0","plugins":[{"version":"1.0.0"}]}';
  const after = bumpJson(before, '1.1.0');
  assert.doesNotMatch(after, /"version":"1.0.0"/);
  assert.doesNotMatch(after, /"version": "1.0.0"/);
});
