// Mood judge — the blind payload that asks whether a render reads as the adopted direction.
//
// The reviewer sees the mood set and the render, and nothing about who made either. No rationale,
// no authorship, no reference URLs, no capture paths: the question is whether the rendered thing
// reads as the direction, and a reader who knows the intent will answer that question from the
// intent rather than from the pixels.
//
// This is an ADVISORY judgement. A mood direction is a felt quality, and a disagreement between two
// readers is information about the direction, not a defect to repair automatically. What it can do
// is fail a direction convincingly enough to re-query, which is why `verdict` is a reading and not a
// gate.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MoodItem, Moodboard } from './mood.ts';

export const MOOD_JUDGE_SCHEMA = 'mood-judge-packet-v1' as const;

export type MoodJudgeItem = Readonly<{
  id: string;
  qualities: readonly string[];
}>;

export type MoodJudgePacket = Readonly<{
  schema: typeof MOOD_JUDGE_SCHEMA;
  direction: string;
  /** Anonymous mood set: ids and qualities, no provenance. */
  items: readonly MoodJudgeItem[];
  renders: readonly { path: string; sha256: string }[];
  question: string;
}>;

export type MoodJudgeVerdict = Readonly<{
  verdict: 'fits' | 're-query';
  observed: readonly string[];
  missing: readonly string[];
  /** The reader's words. Not parsed; recorded for the human who reads the receipt. */
  note: string;
}>;

export type MoodJudgeErrorCode = 'MALFORMED_MOOD_JUDGE' | 'MOOD_RENDER_MISSING' | 'MOOD_JUDGE_LEAK';

export class MoodJudgeError extends Error {
  override readonly name = 'MoodJudgeError';
  readonly code: MoodJudgeErrorCode;
  constructor(code: MoodJudgeErrorCode, reason: string) {
    super(`mood judge is invalid: ${reason}`);
    this.code = code;
  }
}

const fail = (code: MoodJudgeErrorCode, reason: string): never => { throw new MoodJudgeError(code, reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const MOOD_JUDGE_QUESTION =
  'Does this render read as the direction and its listed qualities? Name the qualities you can see, name the ones you cannot, and answer fits or re-query. Judge the render, not the intent.';

/**
 * Builds the anonymous payload. Anything that could identify the source — a URL, a host, a capture
 * path, a filesystem path — is refused rather than stripped, because a silently stripped payload
 * whose caller believed it was included is worse than a loud failure.
 */
export function buildMoodJudgePacket(input: Readonly<{
  channel: string;
  board: Moodboard;
  renders: readonly { path: string; sha256: string }[];
}>): MoodJudgePacket {
  if (input.renders.length === 0) fail('MALFORMED_MOOD_JUDGE', 'at least one render is required to judge a direction');
  for (const render of input.renders) {
    if (render.path.trim() === '' || !/^[0-9a-f]{64}$/.test(render.sha256)) {
      fail('MALFORMED_MOOD_JUDGE', `render ${render.path || '<empty>'} needs a path and a 64-character sha256`);
    }
  }
  return Object.freeze({
    schema: MOOD_JUDGE_SCHEMA,
    direction: input.board.direction,
    items: Object.freeze(input.board.items.map((item): MoodJudgeItem => Object.freeze({
      id: item.id,
      qualities: Object.freeze([...item.qualities]),
    }))),
    renders: Object.freeze(input.renders.map((render) => Object.freeze({ path: render.path, sha256: render.sha256 }))),
    question: MOOD_JUDGE_QUESTION,
  });
}

/** Fields that must never appear in the payload, checked over its serialized form. */
const LEAK_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'an absolute URL', pattern: /https?:\/\//i },
  { label: 'a capture path', pattern: /\.omd\/refs\// },
  { label: 'an absolute filesystem path', pattern: /(?:^|["'\s])\/(?:Users|home|private|tmp)\// },
];

/**
 * The leak gate. Run before a packet is handed to a reviewer: a payload carrying a source URL turns
 * a blind judgement into a provenance lookup.
 */
export function requireBlindMoodPacket(packet: MoodJudgePacket): void {
  const serialized = JSON.stringify(packet);
  for (const { label, pattern } of LEAK_PATTERNS) {
    if (pattern.test(serialized)) {
      fail('MOOD_JUDGE_LEAK', `the packet carries ${label}, which would make the judgement a provenance lookup rather than a reading`);
    }
  }
}

export function moodJudgePacketSha256(packet: MoodJudgePacket): string {
  return createHash('sha256').update(JSON.stringify(packet)).digest('hex');
}

function text(value: unknown, label: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fail('MALFORMED_MOOD_JUDGE', `${label} must be a non-empty string`);
}

/**
 * Parses a reader's answer. `observed` and `missing` are closed to the direction's own qualities, so
 * a reader cannot introduce a quality the run never adopted and have it counted as agreement.
 */
export function parseMoodJudgeVerdict(value: unknown, packet: MoodJudgePacket): MoodJudgeVerdict {
  const parsed = isRecord(value) ? value : fail('MALFORMED_MOOD_JUDGE', 'verdict must be an object');
  const keys = Object.keys(parsed).sort();
  if (keys.join(',') !== 'missing,note,observed,verdict') {
    fail('MALFORMED_MOOD_JUDGE', 'verdict has exactly verdict, observed, missing, note');
  }
  if (parsed.verdict !== 'fits' && parsed.verdict !== 're-query') {
    fail('MALFORMED_MOOD_JUDGE', 'verdict must be fits or re-query');
  }
  const known = new Set(packet.items.flatMap((item) => item.qualities));
  const list = (raw: unknown, label: string): readonly string[] => {
    if (!Array.isArray(raw)) fail('MALFORMED_MOOD_JUDGE', `${label} must be an array`);
    return Object.freeze((raw as unknown[]).map((entry, index) => {
      const quality = text(entry, `${label}[${index}]`);
      if (!known.has(quality)) {
        fail('MALFORMED_MOOD_JUDGE', `${label}[${index}] names "${quality}", which the direction does not list`);
      }
      return quality;
    }));
  };
  const observed = list(parsed.observed, 'observed');
  const missing = list(parsed.missing, 'missing');
  if (observed.some((quality) => missing.includes(quality))) {
    fail('MALFORMED_MOOD_JUDGE', 'a quality cannot be both observed and missing');
  }
  return Object.freeze({
    verdict: parsed.verdict as 'fits' | 're-query',
    observed,
    missing,
    note: text(parsed.note, 'note'),
  });
}

export function moodBoardFrom(value: Moodboard): readonly MoodItem[] {
  return value.items;
}

export function readMoodboardFile(root: string, parse: (value: unknown) => Moodboard): Moodboard {
  const path = join(root, '.omd', 'moodboard.json');
  if (!existsSync(path)) fail('MOOD_RENDER_MISSING', `no moodboard at ${path}`);
  return parse(JSON.parse(readFileSync(path, 'utf8')));
}
