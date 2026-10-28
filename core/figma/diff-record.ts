import { createHash } from 'node:crypto';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import type { DiffResult } from './diff.ts';

const DIFF_SCHEMA = 'omd-figma-diff-record-v1';
const BODY_KEYS = [
  'schema', 'frameId', 'safeId', 'fileKey', 'snapshotSha256', 'exportSha256',
  'renderSha256', 'score', 'threshold', 'pass',
] as const;

type FigmaDiffRecordBody = Readonly<{
  schema: typeof DIFF_SCHEMA;
  frameId: string;
  safeId: string;
  fileKey: string;
  snapshotSha256: string;
  exportSha256: string;
  renderSha256: string;
  score: number;
  threshold: number;
  pass: boolean;
}>;

export type FigmaDiffRecord = FigmaDiffRecordBody & Readonly<{ signature: string }>;
export type FigmaDiffRecordIssue = Readonly<{ code: string; message: string }>;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const issue = (code: string, message: string): FigmaDiffRecordIssue => ({ code, message });

export const figmaSafeFrameId = (frameId: string): string => frameId.replaceAll(/[:/]/g, '_');

export function figmaDiffRecordPath(frameId: string): string {
  return `.omd/figma/diffs/${figmaSafeFrameId(frameId)}.json`;
}

export function figmaDiffRecord(root: string, input: Readonly<{
  frameId: string;
  snapshotBytes: Uint8Array;
  exportBytes: Uint8Array;
  renderBytes: Uint8Array;
  result: DiffResult;
}>): string {
  const snapshot: unknown = JSON.parse(Buffer.from(input.snapshotBytes).toString('utf8'));
  const fileKey = typeof snapshot === 'object' && snapshot !== null ? Reflect.get(snapshot, 'fileKey') : undefined;
  if (typeof fileKey !== 'string') throw new Error('Figma snapshot metadata is invalid');
  const body: FigmaDiffRecordBody = {
    schema: DIFF_SCHEMA,
    frameId: input.frameId,
    safeId: figmaSafeFrameId(input.frameId),
    fileKey,
    snapshotSha256: sha256(input.snapshotBytes),
    exportSha256: sha256(input.exportBytes),
    renderSha256: sha256(input.renderBytes),
    score: input.result.score,
    threshold: input.result.threshold,
    pass: input.result.pass,
  };
  const signature = signNativeObservation(root, DIFF_SCHEMA, sha256(Buffer.from(canonicalJson(body))));
  return `${canonicalJson({ ...body, signature })}\n`;
}

export function parseFigmaDiffRecord(root: string, bytes: string):
  | Readonly<{ record: FigmaDiffRecord }>
  | Readonly<{ issue: FigmaDiffRecordIssue }> {
  let value: unknown;
  try { value = JSON.parse(bytes); } catch {
    return { issue: issue('FIGMA_DIFF_RECORD_INVALID', 'Figma diff record is not valid JSON.') };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { issue: issue('FIGMA_DIFF_RECORD_INVALID', 'Figma diff record must be an object.') };
  }
  const raw = value as Record<string, unknown>;
  if (exactKeys(raw, BODY_KEYS)) {
    return { issue: issue('FIGMA_DIFF_RECORD_UNSIGNED', 'Figma diff record is unsigned; rerun `omd figma diff`.') };
  }
  if (!exactKeys(raw, [...BODY_KEYS, 'signature'])) {
    return { issue: issue('FIGMA_DIFF_RECORD_INVALID', 'Figma diff record has unknown or missing fields.') };
  }
  const strings = ['frameId', 'safeId', 'fileKey', 'snapshotSha256', 'exportSha256', 'renderSha256'] as const;
  if (raw.schema !== DIFF_SCHEMA
    || strings.some(key => typeof raw[key] !== 'string')
    || typeof raw.score !== 'number' || !Number.isFinite(raw.score)
    || typeof raw.threshold !== 'number' || !Number.isFinite(raw.threshold)
    || typeof raw.pass !== 'boolean'
    || typeof raw.signature !== 'string') {
    return { issue: issue('FIGMA_DIFF_RECORD_INVALID', 'Figma diff record fields are malformed.') };
  }
  const { signature, ...body } = raw;
  if (!verifyNativeObservation(root, DIFF_SCHEMA, sha256(Buffer.from(canonicalJson(body))), signature)) {
    return { issue: issue('FIGMA_DIFF_RECORD_FORGED', 'Figma diff record signature does not match this project.') };
  }
  return { record: raw as FigmaDiffRecord };
}
