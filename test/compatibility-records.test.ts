import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { loadRefs } from '../core/ref/store.ts';
import { validateFinalEvidenceV2Graph } from '../core/evidence/final-v2-graph.ts';

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

test('legacy measured references remain readable without viewport evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-legacy-reference-'));
  try {
    mkdirSync(join(root, '.omd', 'refs'), { recursive: true });
    writeFileSync(join(root, '.omd', 'refs', 'legacy.json'), JSON.stringify({
      source: 'https://legacy.example/page',
      component: 'hero',
      kind: 'component',
      capturedAt: '2025-01-01T00:00:00.000Z',
      selector: '#hero',
      invariants: {
        spacingLadder: [8],
        radiusLadder: [4],
        elevationLevels: 0,
        centeredRatio: 0,
        tokenCoverage: 1,
        paddingWeight: 8,
      },
      principles: ['Historical measured hierarchy.'],
    }));
    const [reference] = loadRefs(root);
    assert.equal(reference?.selector, '#hero');
    assert.equal(reference?.viewport, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('historical final-v2 graph remains parseable without reference distance', () => {
  const descriptor = (path: string, schema: string) => ({
    path: `.omd/${path}.json`,
    schema,
    sha256: 'a'.repeat(64),
  });
  const graph = {
    schema: 'final-evidence-v2-graph',
    activation: descriptor('activation', 'activation-context-v2'),
    intent: descriptor('intent', 'intent-ledger-v1'),
    artDirection: descriptor('art-direction', 'art-direction-record-v2'),
    board: descriptor('board', 'reference-board-v1'),
    selection: descriptor('selection', 'reference-selection-v2'),
    settledSelection: descriptor('settled-selection', 'reference-selection-v2'),
    handoff: descriptor('handoff', 'reference-handoff-v2'),
    usage: descriptor('usage', 'reference-usage-v2'),
    copy: descriptor('copy', 'copy-deck-receipt-v1'),
    renderedBeats: descriptor('rendered-beats', 'rendered-beat-receipt-v1'),
    sourceSeal: descriptor('source-seal', 'source-seal-v1'),
    buildIdentity: descriptor('build', 'omd-build-identity-v1'),
    blindLane: descriptor('blind', 'blind-review-v1'),
    fidelityLane: descriptor('fidelity', 'fidelity-review-v1'),
    protocolLane: descriptor('protocol', 'protocol-review-v1'),
    observations: [descriptor('observation', 'observation-v2')],
  };
  const parsed = validateFinalEvidenceV2Graph(graph);
  assert.equal(parsed.schema, 'final-evidence-v2-graph');
  assert.equal('referenceDistance' in parsed, false);
});
