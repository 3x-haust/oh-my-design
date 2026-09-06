import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOpticalAdmission } from '../core/evidence/optical-admission.ts';

const sha = 'a'.repeat(64);
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const member = (id: string, lane: 'Q' | 'I', fragments: ReturnType<typeof rect>[]) => ({
  id, lane, kind: 'text' as const, recoveredString: id,
  rawGraphemeRects: fragments, lineFragments: fragments, clippingChain: [], nativeBounds: null,
  computed: { fontSize: 16, fontWeight: 600, lineCount: fragments.length, measure: 30, display: 'block', visibility: 'visible', opacity: 1, occluded: false },
});

function fixture(qWidth: number) {
  return {
    schema: 'optical-admission-raw-v1', viewport: { width: 1280, height: 900 }, state: 'initial',
    deviceScaleFactor: 1, zoom: 1, scroll: { x: 0, y: 0 }, fontSettled: true,
    sourceSha256: sha, captureSha256: sha,
    members: [
      member('queue-primary', 'Q', [rect(0, 0, qWidth, 10), rect(0, 0, qWidth, 10)]),
      member('intro-primary', 'I', [rect(0, 20, 20, 10)]),
    ],
  };
}

test('optical admission independently unions overlapping fragments and passes the fixed initial floor', () => {
  const result = validateOpticalAdmission(fixture(30));
  assert.equal(result.qArea, 300);
  assert.equal(result.iArea, 200);
  assert.equal(result.ratio, 1.5);
  assert.equal(result.threshold, 1.25);
  assert.equal(result.pass, true);
});

test('optical admission negative fixture fails instead of averaging below-floor allocation', () => {
  const result = validateOpticalAdmission(fixture(20));
  assert.equal(result.ratio, 1);
  assert.equal(result.pass, false);
});
