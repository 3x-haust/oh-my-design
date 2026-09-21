import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOOD_JUDGE_QUESTION,
  MOOD_JUDGE_SCHEMA,
  MoodJudgeError,
  buildMoodJudgePacket,
  moodJudgePacketSha256,
  parseMoodJudgeVerdict,
  requireBlindMoodPacket,
} from '../core/ref/mood-judge.ts';
import { MOODBOARD_SCHEMA, moodImagePath, type Moodboard } from '../core/ref/mood.ts';

const board: Moodboard = {
  schema: MOODBOARD_SCHEMA,
  direction: 'warm, printed, archival',
  items: [
    {
      id: 'press-a', source: 'https://example.com/press', qualities: ['warm paper', 'low contrast'],
      imagePath: moodImagePath('/r', 'a'.repeat(64)), sha256: 'a'.repeat(64),
      capturedAt: '2026-09-15T00:00:00.000Z', scope: 'whole', evidence: 'visual-only',
    },
  ],
};

const render = (path = 'dist/index.png') => ({ path, sha256: 'b'.repeat(64) });

test('the packet is anonymous: ids and qualities, no provenance', () => {
  const packet = buildMoodJudgePacket({ channel: 'mood', board, renders: [render()] });
  assert.equal(packet.schema, MOOD_JUDGE_SCHEMA);
  assert.equal(packet.direction, 'warm, printed, archival');
  assert.equal(packet.question, MOOD_JUDGE_QUESTION);
  assert.deepEqual(packet.items, [{ id: 'press-a', qualities: ['warm paper', 'low contrast'] }]);

  const serialized = JSON.stringify(packet);
  assert.equal(serialized.includes('example.com'), false, 'the source page never reaches the reader');
  assert.equal(serialized.includes('.omd/refs/mood'), false, 'the capture path never reaches the reader');
});

test('a packet carrying a source URL, capture path, or absolute path is refused rather than stripped', () => {
  const leaky = { ...buildMoodJudgePacket({ channel: 'mood', board, renders: [render()] }), direction: 'warm, see https://example.com/press' };
  assert.throws(
    () => requireBlindMoodPacket(leaky),
    (error: unknown) => error instanceof MoodJudgeError && error.code === 'MOOD_JUDGE_LEAK',
  );

  const pathLeak = { ...buildMoodJudgePacket({ channel: 'mood', board, renders: [render()] }), renders: [render('.omd/refs/mood/abc.png')] };
  assert.throws(() => requireBlindMoodPacket(pathLeak), /capture path/);

  const absolute = { ...buildMoodJudgePacket({ channel: 'mood', board, renders: [render()] }), direction: '/Users/someone/secret' };
  assert.throws(() => requireBlindMoodPacket(absolute), /absolute filesystem path/);

  assert.doesNotThrow(() => requireBlindMoodPacket(buildMoodJudgePacket({ channel: 'mood', board, renders: [render()] })));
});

test('a packet needs at least one render with a real digest', () => {
  assert.throws(() => buildMoodJudgePacket({ channel: 'mood', board, renders: [] }), /at least one render/);
  assert.throws(() => buildMoodJudgePacket({ channel: 'mood', board, renders: [{ path: 'a.png', sha256: 'short' }] }), /64-character sha256/);
});

test('a verdict names only qualities the direction lists', () => {
  const packet = buildMoodJudgePacket({ channel: 'mood', board, renders: [render()] });
  const verdict = parseMoodJudgeVerdict({
    verdict: 'fits', observed: ['warm paper'], missing: ['low contrast'], note: 'reads warm, contrast is still high',
  }, packet);
  assert.equal(verdict.verdict, 'fits');
  assert.deepEqual(verdict.observed, ['warm paper']);
  assert.deepEqual(verdict.missing, ['low contrast']);

  assert.throws(
    () => parseMoodJudgeVerdict({ verdict: 'fits', observed: ['glossy'], missing: [], note: 'x' }, packet),
    /which the direction does not list/,
  );
});

test('a verdict rejects a quality that is both observed and missing, and any extra key', () => {
  const packet = buildMoodJudgePacket({ channel: 'mood', board, renders: [render()] });
  assert.throws(
    () => parseMoodJudgeVerdict({ verdict: 'fits', observed: ['warm paper'], missing: ['warm paper'], note: 'x' }, packet),
    /both observed and missing/,
  );
  assert.throws(
    () => parseMoodJudgeVerdict({ verdict: 'fits', observed: [], missing: [], note: 'x', rationale: 'y' }, packet),
    /exactly verdict, observed, missing, note/,
  );
  assert.throws(() => parseMoodJudgeVerdict({ verdict: 'maybe', observed: [], missing: [], note: 'x' }, packet), /fits or re-query/);
  assert.throws(() => parseMoodJudgeVerdict({ verdict: 'fits', observed: [], missing: [], note: '' }, packet), /non-empty string/);
});

test('the packet has a stable identity', () => {
  const packet = buildMoodJudgePacket({ channel: 'mood', board, renders: [render()] });
  assert.equal(moodJudgePacketSha256(packet), moodJudgePacketSha256(buildMoodJudgePacket({ channel: 'mood', board, renders: [render()] })));
  assert.notEqual(moodJudgePacketSha256(packet), moodJudgePacketSha256(buildMoodJudgePacket({ channel: 'mood', board, renders: [{ path: 'other.png', sha256: 'c'.repeat(64) }] })));
});
