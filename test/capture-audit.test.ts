import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditCaptureParallelism, auditCaptureRecords, auditCaptureTimes } from '../core/ref/capture-audit.ts';

const NOW = Date.parse('2026-07-21T12:00:00.000Z');
const iso = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

test('auditCaptureTimes flags a sequential capture pass (large median gap)', () => {
  // four captures ~60s apart — a separate browser launch each
  const a = auditCaptureTimes([iso(300_000), iso(240_000), iso(180_000), iso(120_000)], NOW);
  assert.equal(a.ok, false);
  assert.equal(a.refs, 4);
  assert.ok(a.medianGapSeconds >= 15, `expected a large median gap, got ${a.medianGapSeconds}s`);
  assert.match(a.reason, /captured sequentially/i);
});

test('auditCaptureTimes passes a batched capture (tight cluster)', () => {
  const a = auditCaptureTimes([iso(10_000), iso(8_000), iso(6_000), iso(4_000)], NOW);
  assert.equal(a.ok, true);
  assert.equal(a.refs, 4);
});

test('auditCaptureTimes passes when fewer than four recent captures', () => {
  const a = auditCaptureTimes([iso(300_000), iso(240_000), iso(180_000)], NOW);
  assert.equal(a.ok, true);
  assert.equal(a.refs, 3);
});

test('auditCaptureTimes ignores captures older than the recent window', () => {
  const sevenHours = 7 * 60 * 60 * 1000;
  const a = auditCaptureTimes(
    [iso(sevenHours + 300_000), iso(sevenHours + 240_000), iso(sevenHours + 180_000), iso(sevenHours + 120_000)],
    NOW,
  );
  assert.equal(a.ok, true);
  assert.equal(a.refs, 0);
});

test('auditCaptureTimes tolerates a lone late straggler among a batched set', () => {
  // three tight captures + one much later — median gap stays small, so it passes
  const a = auditCaptureTimes([iso(600_000), iso(12_000), iso(10_000), iso(8_000)], NOW);
  assert.equal(a.ok, true);
});

test('explicit batch provenance passes despite slow remote completion gaps and one direct capture', () => {
  const records = [
    { capturedAt: iso(420_000) },
    { capturedAt: iso(360_000), captureBatchId: 'batch-a' },
    { capturedAt: iso(300_000), captureBatchId: 'batch-a' },
    { capturedAt: iso(240_000), captureBatchId: 'batch-a' },
    { capturedAt: iso(180_000), captureBatchId: 'batch-b' },
    { capturedAt: iso(120_000), captureBatchId: 'batch-b' },
    { capturedAt: iso(60_000), captureBatchId: 'batch-b' },
  ];
  const result = auditCaptureRecords(records, NOW);
  assert.equal(result.ok, true);
  assert.match(result.reason, /explicit shared-batch provenance/);
});

test('a small batch does not launder a mostly sequential pass', () => {
  const records = [
    { capturedAt: iso(360_000), captureBatchId: 'batch-a' },
    { capturedAt: iso(300_000), captureBatchId: 'batch-a' },
    { capturedAt: iso(240_000) },
    { capturedAt: iso(180_000) },
    { capturedAt: iso(120_000) },
    { capturedAt: iso(60_000) },
  ];
  assert.equal(auditCaptureRecords(records, NOW).ok, false);
});

test('image metadata cannot create a serial-capture finding or conceal real serial captures', context => {
  const root = mkdtempSync(join(tmpdir(), 'omd-capture-audit-image-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const refs = join(root, '.omd', 'refs');
  mkdirSync(refs, { recursive: true });
  const save = (id: string, kind: 'component' | 'image', msAgo: number, batch?: string) => writeFileSync(join(refs, `${id}.json`), JSON.stringify({
    source: `https://fixture.example/${id}`, component: id, kind, capturedAt: iso(msAgo),
    invariants: null, principles: [], ...(batch === undefined ? {} : { captureBatchId: batch }),
  }));
  for (let i = 0; i < 4; i++) save(`batch-${i}`, 'component', 360_000 - i * 60_000, 'batch-real');
  save('direct', 'component', 120_000);
  save('image', 'image', 60_000);
  const batched = auditCaptureParallelism(root, NOW);
  assert.equal(batched.ok, true);
  assert.equal(batched.refs, 5, 'metadata is not a browser capture');
  assert.match(batched.reason, /explicit shared-batch provenance/);

  rmSync(refs, { recursive: true });
  mkdirSync(refs);
  for (let i = 0; i < 4; i++) save(`serial-${i}`, 'component', 360_000 - i * 60_000);
  for (let i = 0; i < 8; i++) save(`image-${i}`, 'image', 10_000 - i * 100);
  const serial = auditCaptureParallelism(root, NOW);
  assert.equal(serial.ok, false);
  assert.equal(serial.refs, 4, 'tight metadata timestamps cannot masquerade as a capture batch');
});
