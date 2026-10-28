import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { canonicalJson } from '../ref/canonical-json.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { getNativePiRun } from '../runtime/native-pi-run.ts';
import { acquireProjectMutationLock, createProjectWriteAdapter } from '../runtime/project-write.ts';

export const TASTE_GRAPHIC_RECORD_SCHEMA = 'omd-taste-graphic-review-v1';
export const TASTE_GRAPHIC_DIRECTORY = '.omd/taste/graphics';
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const fail = (reason: string): never => { throw new Error(`TASTE_GRAPHIC_REFUSED: ${reason}`); };

export const TASTE_GRAPHIC_SKIP_SCHEMA = 'omd-taste-graphic-skip-v1';

/** A landing either compared a rendered graphic with a kept human one or wrote down why it carries none. */
/** Rounds of rework a graphic gets before a still-distinguishable result is reported instead of repaired. */
export const TASTE_REPAIR_ROUNDS = 3;
/** Mean luminance change (0-255, on a 16x16 thumbnail) a rework must reach to count as a new round. */
export const MATERIAL_CHANGE = 6;

/** A 16x16 luminance thumbnail of a rendered graphic: enough to tell a rework from a nudge. */
export function graphicThumb(bytes: Buffer): number[] {
  const image = PNG.sync.read(bytes);
  const cells: number[] = [];
  for (let gy = 0; gy < 16; gy++) for (let gx = 0; gx < 16; gx++) {
    let sum = 0, count = 0;
    const [x0, x1] = [Math.floor(gx * image.width / 16), Math.floor((gx + 1) * image.width / 16)];
    const [y0, y1] = [Math.floor(gy * image.height / 16), Math.floor((gy + 1) * image.height / 16)];
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * image.width + x) * 4;
      sum += 0.2126 * image.data[i]! + 0.7152 * image.data[i + 1]! + 0.0722 * image.data[i + 2]!; count++;
    }
    cells.push(count ? Math.round(sum / count) : 0);
  }
  return cells;
}

export const thumbChange = (left: readonly number[], right: readonly number[]): number =>
  left.length !== right.length || left.length === 0 ? 255 : left.reduce((total, value, index) => total + Math.abs(value - right[index]!), 0) / left.length;

type RoundRecord = Readonly<{ createdAt: string; thumb?: readonly number[] }>;
/** Comparisons of one graphic that count as rounds: each must visibly differ from the last counted one. */
export function countedRounds(records: readonly RoundRecord[]): number {
  let last: readonly number[] | undefined, rounds = 0;
  for (const record of [...records].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    if (record.thumb === undefined || last === undefined || thumbChange(record.thumb, last) >= MATERIAL_CHANGE) {
      rounds++;
      if (record.thumb !== undefined) last = record.thumb;
    }
  }
  return rounds;
}

/**
 * A graphic counts as compared once one rendered graphic is no longer told apart from the kept human graphics,
 * or has been reworked for the full repair rounds; a single losing comparison is a repair signal, not a pass.
 */
export function graphicDecision(root: string, briefSha256?: string): 'compared' | 'skipped' | null {
  const directory = join(root, TASTE_GRAPHIC_DIRECTORY);
  if (!existsSync(directory)) return null;
  let skipped = false;
  const rounds = new Map<string, RoundRecord[]>();
  for (const name of readdirSync(directory).filter(name => name.endsWith('.json'))) {
    let record: unknown;
    try { record = JSON.parse(readFileSync(join(directory, name), 'utf8')); } catch { continue; }
    if (typeof record !== 'object' || record === null) continue;
    const { schema, briefSha256: brief, graphic, summary } = record as Record<string, unknown>;
    if (briefSha256 !== undefined && brief !== briefSha256) continue;
    if (schema === TASTE_GRAPHIC_SKIP_SCHEMA) skipped = true;
    if (schema !== TASTE_GRAPHIC_RECORD_SCHEMA) continue;
    if ((summary as { verdict?: unknown } | undefined)?.verdict === 'not-distinguishable') return 'compared';
    const path = String((graphic as { path?: unknown } | undefined)?.path ?? '');
    const { createdAt, thumb } = record as { createdAt?: unknown; thumb?: unknown };
    rounds.set(path, [...(rounds.get(path) ?? []), { createdAt: String(createdAt ?? ''),
      ...(Array.isArray(thumb) ? { thumb: thumb.map(Number) } : {}) }]);
  }
  if ([...rounds.values()].some(records => countedRounds(records) >= TASTE_REPAIR_ROUNDS)) return 'compared';
  return skipped ? 'skipped' : null;
}

/**
 * Skipping graphics is not self-approved: the latest blind page comparison for this brief must already
 * find the page indistinguishable from human-made work. Otherwise graphics are the lever left to pull.
 */
export type PageVerdict = Readonly<{ summary: Readonly<{ verdict: string; judgedAi: number; trials: number }> }>;

export async function latestPageComparison(projectRoot: string, briefSha256: string): Promise<PageVerdict | undefined> {
  const { readTasteComparisonReview } = await import('./taste-comparison-record.ts');
  const reviews = join(projectRoot, '.omd/taste/reviews');
  for (const name of existsSync(reviews) ? readdirSync(reviews).filter(name => name.endsWith('.json')).sort().reverse() : []) {
    const record = readTasteComparisonReview(projectRoot, name.slice(0, -'.json'.length));
    if (record !== null && record.briefSha256 === briefSha256) return record;
  }
  return undefined;
}

export async function recordGraphicSkip(root: string, invocation: ProjectRunInvocation, reason: string,
  readLatest: (projectRoot: string, briefSha256: string) => Promise<PageVerdict | undefined> = latestPageComparison) {
  const run = getNativePiRun(invocation, root);
  const text = reason.trim();
  if (text.length < 20) return fail('--skip needs the reason this page carries no graphic, in a sentence');
  const latest = await readLatest(run.projectRoot, invocation.current.briefSha256);
  if (latest === undefined) return fail('a skip needs a current blind page comparison first: run omd taste compare');
  if (latest.summary.verdict !== 'not-distinguishable') {
    return fail(`the latest omd taste compare still told this page from human-made work (${latest.summary.judgedAi}/${latest.summary.trials}); `
      + 'build a section graphic that acts out what the copy claims and compare it with omd taste graphic instead of skipping');
  }
  const createdAt = new Date().toISOString();
  const body = { schema: TASTE_GRAPHIC_SKIP_SCHEMA, createdAt, buildSha256: invocation.current.buildSha256,
    briefSha256: invocation.current.briefSha256, reason: text };
  const id = `skip-${createdAt.replace(/\D/g, '').slice(0, 14)}-${sha256(canonicalJson(body)).slice(0, 8)}`;
  const path = `${TASTE_GRAPHIC_DIRECTORY}/${id}.json`;
  const release = acquireProjectMutationLock(run.projectRoot, invocation);
  try { createProjectWriteAdapter(run.projectRoot, invocation).write(path, Buffer.from(`${canonicalJson(body)}\n`)); }
  finally { release(); }
  return { path, reason: text };
}
