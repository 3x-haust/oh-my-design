import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { reviewerText, type ReviewerText } from '../core/runtime/reviewer-text.ts';
import { MAX_BROKERED_EVIDENCE_BYTES, ReviewerEvidenceProxy } from '../core/runtime/evidence-proxy.ts';

function expand(value: ReviewerText): string {
  if (typeof value === 'string') return value;
  assert.equal(value.encoding, 'utf16-rle-v1');
  const decoded = value.segments.map(part =>
    typeof part === 'string' ? part : String.fromCharCode(part.codeUnit).repeat(part.repeat),
  ).join('');
  assert.equal(decoded.length, value.utf16Length);
  assert.equal(createHash('sha256').update(JSON.stringify(decoded)).digest('hex'), value.jsonSha256);
  return decoded;
}

test('review-only encoding preserves exact quota inputs, controls, Unicode and lone surrogates', () => {
  for (const value of [
    `Q${' '.repeat(6 * 1024 * 1024)}Q`,
    'Q'.repeat(6 * 1024 * 1024),
    `prefix${'\0'.repeat(400)}suffix`,
    `${'한'.repeat(400)}\n${' '.repeat(200)}끝`,
    '\ud83d'.repeat(400),
    '\ude3a'.repeat(400),
    '😺'.repeat(400),
    `left${'\\'.repeat(400)}${'"'.repeat(300)}right`,
  ]) {
    const encoded = reviewerText(value);
    assert.equal(expand(encoded), value);
    assert.ok(Buffer.byteLength(JSON.stringify(encoded)) <= Buffer.byteLength(JSON.stringify(value)));
  }
});

test('ordinary and incompressible input remains literal and oversized evidence still refuses', () => {
  for (const value of ['', 'Q Q', '책 이름', 'x'.repeat(32), 'ab'.repeat(400)]) {
    assert.equal(reviewerText(value), value);
  }
  const oversized = 'ab'.repeat(MAX_BROKERED_EVIDENCE_BYTES / 2);
  const value = reviewerText(oversized);
  assert.equal(value, oversized);
  assert.throws(() => new ReviewerEvidenceProxy().create(JSON.stringify({ value })), /exceeds/);
});
