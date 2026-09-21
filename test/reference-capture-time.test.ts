import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCurrentMarketCapture } from '../core/ref/market-reference-coverage.ts';
import { referenceCaptureTimestamp } from '../core/ref/reference-capture-time.ts';

test('current market capture time supports native records and imported image fragments', () => {
  const capturedAt = new Date().toISOString();
  assert.equal(referenceCaptureTimestamp({ capturedAt }), capturedAt);
  const fragment = { schemaVersion: 'image-fragment-v1', provenance: { capturedAt } };
  assert.equal(referenceCaptureTimestamp(fragment), capturedAt);
  assert.doesNotThrow(() => assertCurrentMarketCapture(referenceCaptureTimestamp(fragment), 'DESIGN'));
});
