import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PiRequestBindings } from '../extensions/omd-request-binding.ts';
import { requestedReviewPurpose, readPiReviewPurpose } from '../extensions/omd-review-purpose.ts';
import { verifyReviewPurposeAuthority } from '../core/route/review-purpose-authority.ts';
import { INTERACTIVE_PROCESS_POLICY } from '../core/route/process-policy.ts';

for (const purpose of ['ordinary', 'benchmark', 'release'] as const) test(`genuine activated Pi input binds ${purpose} origin to current-process route input`, t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-review-purpose-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const bindings = new PiRequestBindings(), request = `${purpose === 'ordinary' ? '' : `Review purpose: ${purpose}\n`}Build an app and research task-flow benchmarks.`;
  const prompt = `/skill:omd-ultradesign ${request}`;
  bindings.receive(root, { source: 'assistant', text: prompt });
  assert.equal(bindings.activate(root, prompt), false);
  assert.throws(() => readPiReviewPurpose(root, request));
  bindings.receive(root, { source: 'interactive', text: prompt }); bindings.activate(root, prompt);
  const origin = readPiReviewPurpose(root, request);
  assert.equal(verifyReviewPurposeAuthority(root, origin.reviewPurposeAuthority, purpose, request).purpose, purpose);
  const input = join(root, '.omd/input.json'); writeFileSync(input, JSON.stringify({ request: 'model summary', processPolicy: INTERACTIVE_PROCESS_POLICY, reviewPurpose: 'ordinary', reviewPurposeAuthority: null }));
  const args = ['route', 'validate', '--input', input, '--json'], source = bindings.pin(root, args), bound = bindings.materialize(root, args, source);
  try {
    const parsed = JSON.parse(readFileSync(bound.args[3]!, 'utf8'));
    assert.equal(parsed.request, request); assert.equal(parsed.reviewPurpose, purpose);
    assert.deepEqual(parsed.reviewPurposeAuthority, origin.reviewPurposeAuthority);
  } finally { bound.dispose(); }
  writeFileSync(input, JSON.stringify({ request: 'old request' }));
  const legacy = bindings.materialize(root, args, source);
  try { assert.equal('reviewPurpose' in JSON.parse(readFileSync(legacy.args[3]!, 'utf8')), false); } finally { legacy.dispose(); }
});

test('a product benchmark mention or quoted directive never selects benchmark/release evaluation', () => {
  assert.equal(requestedReviewPurpose('Build a benchmark service comparison app'), 'ordinary');
  assert.equal(requestedReviewPurpose('Example: Review purpose: release'), 'ordinary');
  assert.equal(requestedReviewPurpose('"Review purpose: release"'), 'ordinary');
});
