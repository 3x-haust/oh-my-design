import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseLegacyTaskEvidenceRecord } from '../core/evidence/task.ts';
import {
  parseLegacyReferenceUsageRecord,
  parseReferenceUsage,
} from '../core/ref/reference-usage-parser.ts';
import {
  parseLegacyReferenceUsageV2Record,
  parseReferenceUsageV2,
} from '../core/ref/reference-usage-snapshot.ts';

const FIXTURES = fileURLToPath(new URL('./fixtures/compatibility', import.meta.url));
const fixture = (name: string): Buffer => readFileSync(join(FIXTURES, name));
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

test('prior task-evidence-v1 bytes remain readable without acquiring current publication authority', () => {
  const bytes = fixture('task-evidence-v1.json');
  assert.equal(sha256(bytes), '3dd45ecd7f8bb41f33dec5e7d0fc0a5e889fd07c6640020db3321c9df42b1f5c');

  const record = parseLegacyTaskEvidenceRecord(bytes);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.tasks[0]?.production.route, '/editor');
  assert.equal('buildSha256' in record, false);
  assert.equal('authorization' in (record.tasks[0]?.renders[0] ?? {}), false);

  const withCurrentField = JSON.stringify({ ...JSON.parse(bytes.toString('utf8')), buildSha256: 'a'.repeat(64) });
  assert.throws(() => parseLegacyTaskEvidenceRecord(withCurrentField), /unknown or missing keys/);
});

test('prior reference-usage-v1 bytes use the explicit legacy row reader', () => {
  const bytes = fixture('reference-usage-v1.json');
  assert.equal(sha256(bytes), 'f38ed568f7907697eca9945dc6385ab85937edd00af385fef4942969bc2bf3dc');

  const record = parseLegacyReferenceUsageRecord(bytes);
  assert.equal(record.schemaVersion, 'reference-usage-v1');
  assert.equal(record.rows[0]?.evidence.path, 'src/shop.ts');
  assert.equal('sha256' in (record.rows[0]?.evidence ?? {}), false);
  assert.equal('productionObservation' in (record.rows[0] ?? {}), false);
  assert.throws(() => parseReferenceUsage(JSON.parse(bytes.toString('utf8'))), /unknown or missing keys/);
});

test('prior reference-usage-v2 bytes retain their exact historical settlement shape', () => {
  const bytes = fixture('reference-usage-v2.json');
  assert.equal(sha256(bytes), 'bedba28a73c9befd0c78e0b0eff8197c0f0fd13195d5848a31d6839c7f077cb6');

  const record = parseLegacyReferenceUsageV2Record(bytes);
  assert.equal(record.schemaVersion, 'reference-usage-v2');
  assert.equal(record.rows[0]?.slotId, 'hero-card');
  assert.equal('handHandoffSha256' in record, false);
  assert.throws(() => parseReferenceUsageV2(JSON.parse(bytes.toString('utf8'))), /unknown or missing keys/);
});
