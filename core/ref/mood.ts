// Moodboard — the whole-page, visual-only lane.
//
// The board system gathers *parts* to assemble from. That leaves no home for the earlier question:
// what should this feel like before anything is assembled? A moodboard answers that, and it is
// deliberately the weakest evidence in the system:
//
//   scope: whole      — a whole rendered artifact, not an anatomy
//   evidence: visual-only — looked at, not measured
//
// So it may transfer declared qualities (warm, printed, low-contrast, dense-but-quiet) and may
// never transfer structure. `reference-scope.ts` owns that restriction; this module enforces it by
// refusing a mood item that carries measurement, and by keeping every mood byte out of production.
//
// The rights rule is hard from day one, not advisory: a mood capture is a study artifact, so its
// bytes, its path, and its digest are all forbidden in production source. Seeing a page is not a
// licence to ship its pixels.

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseReferenceGrade,
  referenceGradeRule,
  type ReferenceScope,
  type ReferenceEvidenceKind,
} from './reference-scope.ts';

export const MOODBOARD_SCHEMA = 'moodboard-v1' as const;
export const MOODBOARD_PATH = '.omd/moodboard.json';
export const MOODBOARD_MARKDOWN_PATH = '.omd/moodboard.md';

/** Every mood capture lives here; nothing under this directory may be referenced by production. */
export const MOOD_STORE_DIRECTORY = '.omd/refs/mood';

/** Bounds keep a moodboard a direction, not a crawl. */export const MIN_MOOD_ITEMS = 1;
export const MAX_MOOD_ITEMS = 16;
export const MAX_MOOD_QUALITIES = 8;

export type MoodItem = Readonly<{
  id: string;
  source: string;
  qualities: readonly string[];
  imagePath: string;
  /** sha256 of the capture bytes, so a production reference to it can be detected. */
  sha256: string;
  capturedAt: string;
  /** Always `whole` + `visual-only` for a mood item; see `reference-scope.ts`. */
  scope: ReferenceScope;
  evidence: ReferenceEvidenceKind;
}>;

export type Moodboard = Readonly<{
  schema: typeof MOODBOARD_SCHEMA;
  direction: string;
  items: readonly MoodItem[];
}>;

export type MoodboardErrorCode =
  | 'MALFORMED_MOODBOARD'
  | 'MOOD_ITEM_MEASURED'
  | 'MOOD_STRUCTURAL_QUALITY'
  | 'MOOD_OFF_STORE_PATH'
  | 'MOOD_BYTES_IN_PRODUCTION';

export class MoodboardError extends Error {
  override readonly name = 'MoodboardError';
  readonly code: MoodboardErrorCode;
  constructor(code: MoodboardErrorCode, reason: string) {
    super(`moodboard is invalid: ${reason}`);
    this.code = code;
  }
}

const fail = (code: MoodboardErrorCode, reason: string): never => { throw new MoodboardError(code, reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, label: string): string =>
  typeof value === 'string' && value.trim() !== '' ? value : fail('MALFORMED_MOODBOARD', `${label} must be a non-empty string`);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const actual = Object.keys(value).sort();
  const want = [...keys].sort();
  if (actual.length !== want.length || actual.some((key, index) => key !== want[index])) {
    fail('MALFORMED_MOODBOARD', `${label} has unknown or missing keys`);
  }
};

const isStructural = (quality: string): boolean =>
  /\b(?:\d+\s*(?:px|em|rem|pt|%|vh|vw)|grid|column|spacing|padding|margin|radius|breakpoint)\b/i.test(quality);

const absoluteHttpUrl = (value: unknown, label: string): string => {
  const parsed = text(value, label);
  let url: URL;
  try { url = new URL(parsed); } catch { return fail('MALFORMED_MOODBOARD', `${label} must be an absolute HTTP(S) URL`); }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.hostname === '') {
    fail('MALFORMED_MOODBOARD', `${label} must be an absolute HTTP(S) URL`);
  }
  return parsed;
};

/**
 * A mood capture must live under the mood store. Allowing an arbitrary `imagePath` would let a mood
 * record point at a shipped asset, which is exactly the confusion the hard rights gate prevents.
 */
export const moodImagePath = (root: string, sha256: string): string => `${MOOD_STORE_DIRECTORY}/${sha256}.png`;

function parseMoodItem(value: unknown, index: number): MoodItem {
  const label = `items[${index}]`;
  const parsed = isRecord(value) ? value : fail('MALFORMED_MOODBOARD', `${label} must be an object`);
  exactKeys(parsed, ['id', 'source', 'qualities', 'imagePath', 'sha256', 'capturedAt', 'scope', 'evidence'], label);
  const grade = parseReferenceGrade({ scope: parsed['scope'], evidence: parsed['evidence'] });
  if (grade.evidence !== 'visual-only' || grade.scope !== 'whole') {
    fail('MOOD_ITEM_MEASURED', `${label} must be whole + visual-only: a moodboard carries direction, and a measured capture belongs on the reference board`);
  }
  const qualities = Array.isArray(parsed['qualities']) ? parsed['qualities'] : fail('MALFORMED_MOODBOARD', `${label}.qualities must be an array`);
  if (qualities.length < 1) fail('MALFORMED_MOODBOARD', `${label}.qualities must name at least one quality`);
  if (qualities.length > MAX_MOOD_QUALITIES) fail('MALFORMED_MOODBOARD', `${label}.qualities is bounded to ${MAX_MOOD_QUALITIES}`);
  const parsedQualities = qualities.map((quality, qualityIndex) => {
    const entry = text(quality, `${label}.qualities[${qualityIndex}]`);
    if (isStructural(entry)) {
      fail('MOOD_STRUCTURAL_QUALITY', `${label}.qualities[${qualityIndex}] states a measurement ("${entry}") that a visual-only capture cannot support; describe the felt quality instead`);
    }
    return entry;
  });
  const sha = text(parsed['sha256'], `${label}.sha256`);
  if (!/^[0-9a-f]{64}$/.test(sha)) fail('MALFORMED_MOODBOARD', `${label}.sha256 must be 64 lowercase hexadecimal characters`);
  const imagePath = text(parsed['imagePath'], `${label}.imagePath`);
  if (!imagePath.startsWith(`${MOOD_STORE_DIRECTORY}/`) || imagePath.includes('..')) {
    fail('MOOD_OFF_STORE_PATH', `${label}.imagePath must live under ${MOOD_STORE_DIRECTORY}/ so mood bytes stay separable from production`);
  }
  const capturedAt = text(parsed['capturedAt'], `${label}.capturedAt`);
  const date = new Date(capturedAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(capturedAt) || Number.isNaN(date.getTime()) || date.toISOString() !== capturedAt) {
    fail('MALFORMED_MOODBOARD', `${label}.capturedAt must be a canonical ISO timestamp`);
  }
  return Object.freeze({
    id: text(parsed['id'], `${label}.id`),
    source: absoluteHttpUrl(parsed['source'], `${label}.source`),
    qualities: Object.freeze(parsedQualities),
    imagePath,
    sha256: sha,
    capturedAt,
    scope: grade.scope,
    evidence: grade.evidence,
  });
}

export function parseMoodboard(value: unknown): Moodboard {
  const parsed = isRecord(value) ? value : fail('MALFORMED_MOODBOARD', 'board must be an object');
  exactKeys(parsed, ['schema', 'direction', 'items'], 'board');
  if (parsed['schema'] !== MOODBOARD_SCHEMA) fail('MALFORMED_MOODBOARD', `schema must be ${MOODBOARD_SCHEMA}`);
  const items = Array.isArray(parsed['items']) ? parsed['items'] : fail('MALFORMED_MOODBOARD', 'items must be an array');
  if (items.length < MIN_MOOD_ITEMS) fail('MALFORMED_MOODBOARD', `items must hold at least ${MIN_MOOD_ITEMS} capture`);
  if (items.length > MAX_MOOD_ITEMS) fail('MALFORMED_MOODBOARD', `items is bounded to ${MAX_MOOD_ITEMS} captures`);
  const parsedItems = items.map((item, index) => parseMoodItem(item, index));
  if (new Set(parsedItems.map((item) => item.id)).size !== parsedItems.length) {
    fail('MALFORMED_MOODBOARD', 'items must not repeat an id');
  }
  if (new Set(parsedItems.map((item) => item.sha256)).size !== parsedItems.length) {
    fail('MALFORMED_MOODBOARD', 'items must not repeat a capture; the same image twice is not two observations');
  }
  return Object.freeze({
    schema: MOODBOARD_SCHEMA,
    direction: text(parsed['direction'], 'direction'),
    items: Object.freeze(parsedItems),
  });
}

export function readMoodboard(root: string): Moodboard | null {
  const path = join(root, MOODBOARD_PATH);
  if (!existsSync(path)) return null;
  return parseMoodboard(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * The hard rights gate. Given production source files, refuse any that carry a mood capture's bytes,
 * path, or digest. Publishing a mood page's pixels as your own is the one thing this lane must never
 * allow, so this runs on every production check rather than on request.
 */
export function moodBytesInProduction(board: Moodboard, sources: readonly { path: string; bytes: Buffer }[]): readonly string[] {
  const digests = new Set(board.items.map((item) => item.sha256));
  const paths = new Set(board.items.map((item) => item.imagePath));
  const offenders: string[] = [];
  for (const source of sources) {
    const text = source.bytes.toString('utf8');
    const byPath = [...paths].some((path) => text.includes(path));
    const byDigest = [...digests].some((digest) => text.includes(digest));
    const byBytes = createHash('sha256').update(source.bytes).digest('hex');
    if (byPath || byDigest || digests.has(byBytes)) offenders.push(source.path);
  }
  return Object.freeze(offenders);
}

export function requireMoodBytesOutOfProduction(board: Moodboard, sources: readonly { path: string; bytes: Buffer }[]): void {
  const offenders = moodBytesInProduction(board, sources);
  if (offenders.length > 0) {
    fail(
      'MOOD_BYTES_IN_PRODUCTION',
      `${offenders.join(', ')} reference a mood capture by path, digest, or identical bytes. A moodboard is study material for direction; its pixels are never shipped. Replace the reference with your own material or a project asset.`,
    );
  }
}

/** Verifies the stored capture still matches its recorded digest. */
export function moodItemBytes(root: string, item: MoodItem): Buffer {
  const path = join(root, item.imagePath);
  if (!existsSync(path)) fail('MALFORMED_MOODBOARD', `capture for ${item.id} is missing at ${item.imagePath}`);
  if (lstatSync(path).isSymbolicLink()) fail('MOOD_OFF_STORE_PATH', `capture for ${item.id} must be a regular file, not a symlink`);
  const bytes = readFileSync(path);
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) {
    fail('MALFORMED_MOODBOARD', `capture for ${item.id} does not match its recorded digest`);
  }
  return bytes;
}

/**
 * A mood item is whole+visual-only by construction, and `parseMoodItem` already refuses anything
 * else. This re-asserts it through the shared axis rule so a future edit to the parser cannot
 * quietly widen what the lane may claim without a test noticing.
 */
export function requireMoodQualities(item: MoodItem): void {
  const rule = referenceGradeRule({ scope: item.scope, evidence: item.evidence });
  if (rule.structuralClaims || rule.roles.includes('component')) {
    fail('MOOD_STRUCTURAL_QUALITY', `mood item ${item.id} carries a ${item.scope}+${item.evidence} grade, which this lane must never hold`);
  }
}

export function formatMoodboardMarkdown(board: Moodboard): string {
  const cell = (value: string): string => value.replace(/[\r\n]+/g, ' ').replaceAll('|', '\\|');
  const rows = board.items.map((item) => `| ${cell(item.id)} | ${cell(item.source)} | ${cell(item.qualities.join(', '))} | ${cell(item.imagePath)} |`);
  return [
    '# 무드보드 (Moodboard)',
    '',
    `방향 (Direction): ${cell(board.direction)}`,
    '',
    '무드 캡처는 방향을 정하기 위한 학습 자료입니다. 픽셀은 결과물에 포함되지 않습니다. (Mood captures are study material for direction; their pixels are never shipped.)',
    '',
    '| 항목 (Item) | 출처 (Source) | 느낌 (Qualities) | 로컬 캡처 (Local capture) |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n').concat('\n');
}
