import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseFileKey } from './client.ts';
import { figmaArtifactMatchesReceipt } from './artifact-lifecycle.ts';
import type { DiffResult } from './diff.ts';

/**
 * A Figma link in the request makes its frames the implementation target. Completion then needs
 * a current snapshot of that exact file and a passing pixel diff for every frame that was diffed.
 * Detection is structural URL parsing, not a judgment about what the request means.
 */

const DIFF_SCHEMA = 'omd-figma-diff-record-v1';
const FIGMA_HOSTS = new Set(['figma.com', 'www.figma.com']);
const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/giu;

export type FigmaTarget = Readonly<{ url: string; fileKey: string }>;

export type FigmaDiffRecord = Readonly<{
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

export type FigmaCompletionIssue = Readonly<{ code: string; message: string }>;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export const figmaSafeFrameId = (frameId: string): string => frameId.replaceAll(/[:/]/g, '_');

export function figmaTargetsInRequest(request: string): readonly FigmaTarget[] {
  const targets = new Map<string, FigmaTarget>();
  for (const [candidate] of request.matchAll(URL_PATTERN)) {
    let url: URL;
    try { url = new URL(candidate); } catch { continue; }
    if (!FIGMA_HOSTS.has(url.hostname.toLowerCase()) || !/^\/(?:file|design)\//u.test(url.pathname)) continue;
    const fileKey = parseFileKey(url.href);
    if (!targets.has(fileKey)) targets.set(fileKey, { url: url.href, fileKey });
  }
  return [...targets.values()];
}

export function figmaDiffRecordPath(frameId: string): string {
  return `.omd/figma/diffs/${figmaSafeFrameId(frameId)}.json`;
}

export function figmaDiffRecord(input: Readonly<{
  frameId: string; snapshotBytes: Uint8Array; exportBytes: Uint8Array; renderBytes: Uint8Array; result: DiffResult;
}>): string {
  const snapshot: unknown = JSON.parse(Buffer.from(input.snapshotBytes).toString('utf8'));
  const fileKey = typeof snapshot === 'object' && snapshot !== null ? Reflect.get(snapshot, 'fileKey') : undefined;
  if (typeof fileKey !== 'string') throw new Error('Figma snapshot metadata is invalid');
  const record: FigmaDiffRecord = {
    schema: DIFF_SCHEMA, frameId: input.frameId, safeId: figmaSafeFrameId(input.frameId), fileKey,
    snapshotSha256: sha256(input.snapshotBytes), exportSha256: sha256(input.exportBytes),
    renderSha256: sha256(input.renderBytes), score: input.result.score,
    threshold: input.result.threshold, pass: input.result.pass,
  };
  return `${JSON.stringify(record)}\n`;
}

function parseDiffRecord(bytes: string): FigmaDiffRecord | undefined {
  let value: unknown;
  try { value = JSON.parse(bytes); } catch { return undefined; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const keys = Object.keys(value).sort().join(',');
  if (keys !== 'exportSha256,fileKey,frameId,pass,renderSha256,safeId,schema,score,snapshotSha256,threshold') return undefined;
  const record = value as Record<string, unknown>;
  const strings = ['frameId', 'safeId', 'fileKey', 'snapshotSha256', 'exportSha256', 'renderSha256'] as const;
  if (record.schema !== DIFF_SCHEMA || strings.some(key => typeof record[key] !== 'string')
    || typeof record.score !== 'number' || typeof record.threshold !== 'number' || typeof record.pass !== 'boolean') return undefined;
  return value as FigmaDiffRecord;
}

const fileSha = (path: string): string | undefined => existsSync(path) ? sha256(readFileSync(path)) : undefined;

export function figmaCompletionIssues(root: string, request: string): readonly FigmaCompletionIssue[] {
  const targets = figmaTargetsInRequest(request);
  if (targets.length === 0) return [];
  const snapshotPath = join(root, '.omd/figma/snapshot.json');
  if (!existsSync(snapshotPath)) {
    return [{ code: 'FIGMA_SNAPSHOT_MISSING', message: 'The request links a Figma file; run `omd figma pull <figma-url>` first.' }];
  }
  const snapshotBytes = readFileSync(snapshotPath);
  const snapshotSha = sha256(snapshotBytes);
  const snapshot: unknown = JSON.parse(snapshotBytes.toString('utf8'));
  const fileKey = typeof snapshot === 'object' && snapshot !== null ? Reflect.get(snapshot, 'fileKey') : undefined;
  const issues: FigmaCompletionIssue[] = [];
  if (!targets.some(target => target.fileKey === fileKey)) {
    issues.push({ code: 'FIGMA_SNAPSHOT_MISMATCH', message: 'The saved Figma snapshot is not the file linked in the request.' });
  }
  const directory = join(root, '.omd/figma/diffs');
  const records = existsSync(directory)
    ? readdirSync(directory).filter(name => name.endsWith('.json')).map(name => ({ name, record: parseDiffRecord(readFileSync(join(directory, name), 'utf8')) }))
    : [];
  const current = records.flatMap(({ name, record }) => {
    if (record === undefined || `${record.safeId}.json` !== name) {
      issues.push({ code: 'FIGMA_DIFF_RECORD_INVALID', message: `Figma diff record ${name} is malformed.` });
      return [];
    }
    return record.snapshotSha256 === snapshotSha ? [record] : [];
  });
  if (current.length === 0) {
    issues.push({ code: 'FIGMA_DIFF_MISSING', message: 'No frame of the current Figma snapshot was compared; run `omd figma diff <frame-id> <rendered-page> --json`.' });
  }
  for (const record of current) {
    const exportPath = join(root, '.omd/figma/exports', `${record.safeId}.png`);
    const renderPath = join(root, '.omd/figma/renders', `${record.safeId}.png`);
    if (fileSha(exportPath) !== record.exportSha256 || fileSha(renderPath) !== record.renderSha256
      || !figmaArtifactMatchesReceipt(exportPath, 'export', snapshotBytes) || !figmaArtifactMatchesReceipt(renderPath, 'render', snapshotBytes)) {
      issues.push({ code: 'FIGMA_DIFF_STALE', message: `Figma diff for frame ${record.frameId} no longer matches its export or render.` });
    } else if (!record.pass) {
      issues.push({ code: 'FIGMA_DIFF_FAILED', message: `Frame ${record.frameId} is ${(record.score * 100).toFixed(1)}% similar, below ${(record.threshold * 100).toFixed(1)}%.` });
    }
  }
  return issues;
}
