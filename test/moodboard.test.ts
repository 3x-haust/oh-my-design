import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MAX_MOOD_ITEMS,
  MAX_MOOD_QUALITIES,
  MOOD_STORE_DIRECTORY,
  MOODBOARD_SCHEMA,
  MoodboardError,
  formatMoodboardMarkdown,
  moodBytesInProduction,
  moodImagePath,
  moodItemBytes,
  parseMoodboard,
  readMoodboard,
  requireMoodBytesOutOfProduction,
  requireMoodQualities,
} from '../core/ref/mood.ts';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
  'hex',
);
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'press-a',
    source: 'https://example.com/press',
    qualities: ['warm paper', 'low contrast', 'archival'],
    imagePath: moodImagePath('/root', sha(PNG)),
    sha256: sha(PNG),
    capturedAt: '2026-09-15T00:00:00.000Z',
    scope: 'whole',
    evidence: 'visual-only',
    ...overrides,
  };
}

const board = (items: readonly unknown[], direction = 'printed, quiet, archival') =>
  ({ schema: MOODBOARD_SCHEMA, direction, items });

test('a well-formed moodboard parses and keeps its items frozen', () => {
  const parsed = parseMoodboard(board([item()]));
  assert.equal(parsed.schema, MOODBOARD_SCHEMA);
  assert.equal(parsed.direction, 'printed, quiet, archival');
  assert.deepEqual(parsed.items[0]!.qualities, ['warm paper', 'low contrast', 'archival']);
  assert.equal(Object.isFrozen(parsed.items[0]), true);
});

test('a measured or part-scoped item is refused: that evidence belongs on the reference board', () => {
  for (const grade of [
    { scope: 'part', evidence: 'measured' },
    { scope: 'part', evidence: 'visual-only' },
    { scope: 'whole', evidence: 'measured' },
  ]) {
    assert.throws(
      () => parseMoodboard(board([item(grade)])),
      (error: unknown) => error instanceof MoodboardError && error.code === 'MOOD_ITEM_MEASURED',
    );
  }
});

test('a quality stating a measurement is refused, while a felt quality stays lawful', () => {
  for (const structural of ['16px gutters', '8px spacing', '12-column grid', 'border-radius 4px']) {
    assert.throws(
      () => parseMoodboard(board([item({ qualities: [structural] })])),
      (error: unknown) => error instanceof MoodboardError && error.code === 'MOOD_STRUCTURAL_QUALITY',
    );
  }
  for (const felt of ['warm paper', 'low contrast', 'dense but quiet', 'printed', 'archival']) {
    assert.doesNotThrow(() => parseMoodboard(board([item({ qualities: [felt] })])));
  }
});

test('a capture outside the mood store is refused', () => {
  for (const imagePath of ['src/hero.png', '.omd/refs/fragments/abc.png', `${MOOD_STORE_DIRECTORY}/../escape.png`]) {
    assert.throws(
      () => parseMoodboard(board([item({ imagePath })])),
      (error: unknown) => error instanceof MoodboardError && error.code === 'MOOD_OFF_STORE_PATH',
    );
  }
});

test('shape violations fail closed', () => {
  assert.throws(() => parseMoodboard(board([])), /at least 1 capture/);
  assert.throws(() => parseMoodboard(board(new Array(MAX_MOOD_ITEMS + 1).fill(null).map((_v, i) => item({
    id: `i${i}`, sha256: sha(Buffer.from(String(i))), imagePath: moodImagePath('/root', sha(Buffer.from(String(i)))),
  })))), /bounded to/);
  assert.throws(() => parseMoodboard(board([item({ qualities: [] })])), /at least one quality/);
  assert.throws(
    () => parseMoodboard(board([item({ qualities: new Array(MAX_MOOD_QUALITIES + 1).fill('warm') })])),
    /bounded to/,
  );
  assert.throws(() => parseMoodboard(board([item({ source: '/relative/path' })])), /absolute HTTP\(S\) URL/);
  assert.throws(() => parseMoodboard(board([item({ sha256: 'ABC' })])), /64 lowercase hexadecimal/);
  assert.throws(() => parseMoodboard(board([item({ capturedAt: '2026-09-15' })])), /canonical ISO timestamp/);
  assert.throws(() => parseMoodboard(board([item(), item({ id: 'press-b' })])), /must not repeat a capture/);
  assert.throws(() => parseMoodboard(board([item(), item({ sha256: sha(Buffer.from('other')), imagePath: moodImagePath('/r', sha(Buffer.from('other'))) })])), /must not repeat an id/);
  assert.throws(() => parseMoodboard({ ...board([item()]), schema: 'moodboard-v2' }), /schema must be/);
  assert.throws(() => parseMoodboard({ ...board([item()]), extra: 1 }), /unknown or missing keys/);
});

test('qualities re-assert the lane grade through the shared axis rule', () => {
  const parsed = parseMoodboard(board([item()]));
  assert.doesNotThrow(() => requireMoodQualities(parsed.items[0]!));
  const widened = { ...parsed.items[0]!, scope: 'part' as const, evidence: 'measured' as const };
  assert.throws(
    () => requireMoodQualities(widened),
    (error: unknown) => error instanceof MoodboardError && error.code === 'MOOD_STRUCTURAL_QUALITY',
  );
});

test('the hard rights gate catches a mood path, digest, or identical bytes in production', () => {
  const parsed = parseMoodboard(board([item()]));
  const digest = parsed.items[0]!.sha256;
  const path = parsed.items[0]!.imagePath;

  assert.deepEqual(moodBytesInProduction(parsed, [{ path: 'src/app.css', bytes: Buffer.from('body { color: red }') }]), []);
  assert.deepEqual(moodBytesInProduction(parsed, [{ path: 'src/a.css', bytes: Buffer.from(`url("${path}")`) }]), ['src/a.css']);
  assert.deepEqual(moodBytesInProduction(parsed, [{ path: 'src/b.html', bytes: Buffer.from(`<!-- ${digest} -->`) }]), ['src/b.html']);
  assert.deepEqual(moodBytesInProduction(parsed, [{ path: 'src/hero.png', bytes: PNG }]), ['src/hero.png']);

  assert.throws(
    () => requireMoodBytesOutOfProduction(parsed, [{ path: 'src/a.css', bytes: Buffer.from(`url("${path}")`) }]),
    (error: unknown) => error instanceof MoodboardError && error.code === 'MOOD_BYTES_IN_PRODUCTION',
  );
  assert.doesNotThrow(() => requireMoodBytesOutOfProduction(parsed, [{ path: 'src/a.css', bytes: Buffer.from('own work') }]));
});

test('a stored capture is verified against its recorded digest', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-mood-'));
  const parsed = parseMoodboard(board([item()]));
  const stored = join(root, parsed.items[0]!.imagePath);
  mkdirSync(join(root, MOOD_STORE_DIRECTORY), { recursive: true });
  writeFileSync(stored, PNG);
  assert.equal(sha(moodItemBytes(root, parsed.items[0]!)), sha(PNG));

  writeFileSync(stored, Buffer.from('tampered'));
  assert.throws(() => moodItemBytes(root, parsed.items[0]!), /does not match its recorded digest/);
});

test('a missing board reads as absent rather than throwing', () => {
  assert.equal(readMoodboard(mkdtempSync(join(tmpdir(), 'omd-mood-none-'))), null);
});

test('the markdown presents the direction and states the study-material status', () => {
  const markdown = formatMoodboardMarkdown(parseMoodboard(board([item()])));
  assert.match(markdown, /# 무드보드 \(Moodboard\)/);
  assert.match(markdown, /printed, quiet, archival/);
  assert.match(markdown, /never shipped/);
  assert.match(markdown, /warm paper, low contrast, archival/);
});
