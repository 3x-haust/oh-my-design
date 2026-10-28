import assert from 'node:assert/strict';
import test from 'node:test';
import { fixedBindingDrift, fixedBindingRepairMessage } from '../adapters/pi-reviewer-runtime.ts';

const fixed = { buildSha256: 'a'.repeat(64), briefSha256: 'b'.repeat(64), previousReviewSha256: null };
const handback = (bindings: unknown, schema = 'first-render-reviewer-handback-v5') =>
  JSON.stringify({ schema, fixedBindings: bindings, decision: 'retain' });

test('an exact binding echo needs no correction turn', () => {
  assert.deepEqual(fixedBindingDrift(handback(fixed), 'first-render-reviewer-handback-v5', fixed), []);
  // Key order is not a difference.
  const reordered = { previousReviewSha256: null, briefSha256: fixed.briefSha256, buildSha256: fixed.buildSha256 };
  assert.deepEqual(fixedBindingDrift(handback(reordered), 'first-render-reviewer-handback-v5', fixed), []);
});

test('a mistyped, missing, extra or wrong-schema echo names exactly the differing fields', () => {
  const typo = `${fixed.buildSha256.slice(0, 20)}aaa${fixed.buildSha256.slice(20)}`;
  assert.deepEqual(fixedBindingDrift(handback({ ...fixed, buildSha256: typo }), 'first-render-reviewer-handback-v5', fixed),
    ['fixedBindings.buildSha256']);
  const { briefSha256: _brief, ...missing } = fixed;
  assert.deepEqual(fixedBindingDrift(handback({ ...missing, invented: 'x' }), 'first-render-reviewer-handback-v5', fixed),
    ['fixedBindings.briefSha256', 'fixedBindings.invented']);
  assert.deepEqual(fixedBindingDrift(handback(fixed, 'first-render-reviewer-handback-v4'), 'first-render-reviewer-handback-v5', fixed),
    ['schema']);
  assert.deepEqual(fixedBindingDrift(handback('not an object'), 'first-render-reviewer-handback-v5', fixed), ['fixedBindings']);
});

test('lanes that spread bindings at the top level are left to their own parser', () => {
  const flat = JSON.stringify({ schema: 'reference-direction-reviewer-handback-v4', lane: 'referenceAdmission',
    sourceContractSha256: 'c'.repeat(64), admissions: [] });
  assert.deepEqual(fixedBindingDrift(flat, 'reference-direction-reviewer-handback-v4', { sourceContractSha256: 'c'.repeat(64) }), []);
});

test('the correction turn restates only the source-owned values and forbids tool use', () => {
  const message = fixedBindingRepairMessage(['fixedBindings.buildSha256'], 'first-render-reviewer-handback-v5', fixed);
  assert.match(message, /fixedBindings\.buildSha256/);
  assert.match(message, /Do not call any tool/);
  assert.ok(message.includes(fixed.buildSha256));
  assert.match(message, /Keep every judgment/);
});
