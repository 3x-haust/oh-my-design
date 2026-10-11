import assert from 'node:assert/strict';
import test from 'node:test';
import { compactPiDiscoveryOutput } from '../extensions/omd-discovery-output.ts';

const receipt = { path: '.omd/discovery/design/attempts/example.json', sha256: 'a'.repeat(64) };
const work = {
  schema: 'reference-discovery-work-v1',
  status: 'action',
  action: { kind: 'retain-reference', lane: 'design', args: [], url: 'https://example.com/app', reason: 'Inspect the actual original.' },
  next: 'inspect original',
  instruction: 'Inspect the actual original.',
  workSha256: 'b'.repeat(64),
  materialProgressIdentities: ['design-visit:https://example.com/app'],
  circuits: [],
  code: null,
  progress: { visits: 1 },
  attempts: [{ lane: 'design', url: 'https://example.com/old', reason: 'unavailable', receipt }],
  exclusions: [{ decision: { source: 'https://example.com/old', reason: 'Not a populated product screen.' }, receipt }],
};

test('discovery summary preserves the next action and source-bound history without replaying decisions', () => {
  const original = JSON.stringify(work);
  const output = compactPiDiscoveryOutput(original, ['ref', 'work-next', '--json']);
  assert.ok(output);
  const summary = JSON.parse(output);
  assert.equal(summary.schema, 'omd-discovery-summary-v1');
  assert.deepEqual(summary.work.action, work.action);
  assert.deepEqual(summary.work.materialProgressIdentities, work.materialProgressIdentities);
  assert.equal(summary.work.workSha256, work.workSha256);
  assert.deepEqual(summary.history.attempts, [receipt]);
  assert.deepEqual(summary.history.exclusions, [receipt]);
  assert.equal(summary.work.attempts, undefined);
  assert.equal(JSON.stringify(work), original);
});

test('advance summary preserves current failure and receipt rather than calling it success', () => {
  const advance = { schema: 'reference-discovery-advance-v1', outcome: 'unavailable', receipt,
    previousWorkSha256: 'c'.repeat(64), work };
  const output = compactPiDiscoveryOutput(JSON.stringify(advance), ['ref', 'advance', '--json']);
  assert.ok(output);
  const summary = JSON.parse(output);
  assert.equal(summary.result.outcome, 'unavailable');
  assert.deepEqual(summary.result.receipt, receipt);
  assert.equal(summary.result.previousWorkSha256, advance.previousWorkSha256);
  assert.deepEqual(summary.work.action, work.action);
});

test('unknown or unbound discovery shapes pass through rather than lose evidence', () => {
  for (const input of [
    '{bad json', JSON.stringify({ ...work, schema: 'future-work' }),
    JSON.stringify({ ...work, attempts: [{ reason: 'missing receipt' }] }),
    JSON.stringify({ ...work, exclusions: [{ receipt: { path: '../outside', sha256: 'bad' } }] }),
  ]) {
    assert.equal(compactPiDiscoveryOutput(input, ['ref', 'work-next', '--json']), undefined);
  }
  assert.equal(compactPiDiscoveryOutput(JSON.stringify(work), ['stage', 'next', '--json']), undefined);
});

test('batch transport keeps each failure and success instead of replacing them with the aggregate outcome', () => {
  const outcomes = [
    { kind: 'navigate', source: 'https://example.com/blocked', lane: 'domain',
      ok: false, attempt: receipt, error: 'HTTP 403' },
    { kind: 'navigate', source: 'https://example.org/service', lane: 'domain',
      ok: true, receipt: { url: 'https://example.org/service', capture: receipt } },
  ];
  const input = { schema: 'reference-discovery-advance-v1', outcome: 'observed', receipt,
    previousWorkSha256: 'c'.repeat(64), outcomes, work };
  const output = compactPiDiscoveryOutput(JSON.stringify(input), ['ref', 'advance', '--json']);
  assert.ok(output);
  const summary = JSON.parse(output);
  assert.deepEqual(summary.result.outcomes, outcomes);
  assert.equal(summary.result.outcomes[0].ok, false);
  assert.equal(summary.result.outcomes[0].error, 'HTTP 403');
});
