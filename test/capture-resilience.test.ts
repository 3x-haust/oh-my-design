import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectBlockReason } from '../core/render/index.ts';

test('HTTP failure remains a hard transport refusal with or without measured components', () => {
  for (const status of [400, 401, 403, 404, 429, 500, 502, 503]) {
    for (const component of [false, true])
      assert.equal(detectBlockReason('Just a moment', 0, status, component), `HTTP ${status}`);
  }
});

test('title wording and visible-text size are measurements, not access decisions', () => {
  for (const title of ['Just a moment...', 'Attention Required!', 'Access Denied', 'Checking your browser',
    'Are you human?', 'One more step', 'Õnnestus!', 'Public service']) {
    for (const length of [0, 50, 199, 200, 5000])
      assert.equal(detectBlockReason(title, length, 200), null);
  }
  assert.equal(detectBlockReason('', 0, null), null);
});
