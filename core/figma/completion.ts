import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import { figmaArtifactMatchesReceipt } from './artifact-lifecycle.ts';
import { parseFileKey } from './client.ts';
import { compareImages, type DiffResult } from './diff.ts';
import type { FigmaSnapshot, SnapshotFrame } from './types.ts';

/**
 * A Figma link in the request makes its frames the implementation target. Completion verifies
 * signed diff records, reopens the exact export/render bytes, and recomputes the comparison.
 * The project-local observation signature follows consulted-reference capture: it binds durable
 * evidence to one project without claiming external Figma or human approval.
 */

const DIFF_SCHEMA = 'omd-figma-diff-record-v1';
const MIN_COMPLETION_THRESHOLD = 0.97;
const FIGMA_HOSTS = new Set(['figma.com', 'www.figma.com']);
const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/giu;
const BODY_KEYS = [
  'schema', 'frameId', 'safeId', 'fileKey', 'snapshotSha256', 'exportSha256',
  'renderSha256', 'score', 'threshold', 'pass',
] as const;

export type FigmaTarget = Readonly<{ url: string; fileKey: string; nodeId?: string }>;

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
export type FigmaCompletionIssue = Readonly<{ code: string; message: string }>;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const issue = (code: string, message: string): FigmaCompletionIssue => ({ code, message });
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');

export const figmaSafeFrameId = (frameId: string): string => frameId.replaceAll(/[:/]/g, '_');

function figmaNodeId(url: URL): string | undefined {
  const raw = url.searchParams.get('node-id');
  if (raw === null) return undefined;
  const normalized = raw.replaceAll('-', ':');
  return /^\d+:\d+$/u.test(normalized) ? normalized : undefined;
}

export function figmaTargetsInRequest(request: string): readonly FigmaTarget[] {
  const targets = new Map<string, FigmaTarget>();
  for (const [candidate] of request.matchAll(URL_PATTERN)) {
    let url: URL;
    try { url = new URL(candidate); } catch { continue; }
    if (!FIGMA_HOSTS.has(url.hostname.toLowerCase()) || !/^\/(?:file|design)\//u.test(url.pathname)) continue;
    const fileKey = parseFileKey(url.href);
    const nodeId = figmaNodeId(url);
    const identity = `${fileKey}\0${nodeId ?? ''}`;
    if (!targets.has(identity)) targets.set(identity, {
      url: url.href,
      fileKey,
      ...(nodeId === undefined ? {} : { nodeId }),
    });
  }
  return [...targets.values()];
}

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

function parseDiffRecord(root: string, bytes: string):
  | Readonly<{ record: FigmaDiffRecord }>
  | Readonly<{ issue: FigmaCompletionIssue }> {
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

function parseSnapshot(bytes: Buffer): FigmaSnapshot | undefined {
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return undefined; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || typeof Reflect.get(value, 'fileKey') !== 'string'
    || !Array.isArray(Reflect.get(value, 'pages'))) return undefined;
  return value as FigmaSnapshot;
}

function allFrames(snapshot: FigmaSnapshot): readonly SnapshotFrame[] {
  return snapshot.pages.flatMap(page => page.frames);
}

function requiredFrames(
  snapshot: FigmaSnapshot,
  targets: readonly FigmaTarget[],
  issues: FigmaCompletionIssue[],
): readonly SnapshotFrame[] {
  const frames = new Map<string, SnapshotFrame>();
  for (const target of targets) {
    if (target.nodeId === undefined) {
      for (const frame of allFrames(snapshot)) frames.set(frame.id, frame);
      continue;
    }
    const page = snapshot.pages.find(candidate => candidate.id === target.nodeId);
    if (page !== undefined) {
      for (const frame of page.frames) frames.set(frame.id, frame);
      continue;
    }
    const frame = allFrames(snapshot).find(candidate =>
      candidate.id === target.nodeId || candidate.nodes.some(node => node.id === target.nodeId));
    if (frame !== undefined) {
      frames.set(frame.id, frame);
      continue;
    }
    issues.push(issue(
      'FIGMA_TARGET_NODE_MISSING',
      `The linked Figma node ${target.nodeId} is absent from the saved snapshot.`,
    ));
  }
  return [...frames.values()];
}

export function figmaCompletionIssues(root: string, request: string): readonly FigmaCompletionIssue[] {
  const targets = figmaTargetsInRequest(request);
  if (targets.length === 0) return [];
  const fileKeys = new Set(targets.map(target => target.fileKey));
  if (fileKeys.size > 1) {
    return [issue(
      'FIGMA_MULTIPLE_FILES_UNSUPPORTED',
      'One completion run cannot prove targets from more than one distinct Figma file.',
    )];
  }
  const snapshotPath = join(root, '.omd/figma/snapshot.json');
  if (!existsSync(snapshotPath)) {
    return [issue('FIGMA_SNAPSHOT_MISSING', 'The request links a Figma file; run `omd figma pull <figma-url>` first.')];
  }
  const snapshotBytes = readFileSync(snapshotPath);
  const snapshot = parseSnapshot(snapshotBytes);
  if (snapshot === undefined) {
    return [issue('FIGMA_SNAPSHOT_INVALID', 'The saved Figma snapshot is malformed.')];
  }
  const issues: FigmaCompletionIssue[] = [];
  if (!fileKeys.has(snapshot.fileKey)) {
    issues.push(issue('FIGMA_SNAPSHOT_MISMATCH', 'The saved Figma snapshot is not the file linked in the request.'));
    return issues;
  }
  const required = requiredFrames(snapshot, targets, issues);
  const snapshotSha = sha256(snapshotBytes);
  const directory = join(root, '.omd/figma/diffs');
  const records = new Map<string, FigmaDiffRecord>();
  if (existsSync(directory)) {
    for (const name of readdirSync(directory).filter(candidate => candidate.endsWith('.json'))) {
      const parsed = parseDiffRecord(root, readFileSync(join(directory, name), 'utf8'));
      if ('issue' in parsed) {
        issues.push({ ...parsed.issue, message: `${name}: ${parsed.issue.message}` });
        continue;
      }
      if (`${parsed.record.safeId}.json` !== name || figmaSafeFrameId(parsed.record.frameId) !== parsed.record.safeId) {
        issues.push(issue('FIGMA_DIFF_RECORD_INVALID', `Figma diff record ${name} does not match its frame identity.`));
        continue;
      }
      if (parsed.record.snapshotSha256 === snapshotSha) records.set(parsed.record.frameId, parsed.record);
    }
  }
  if (required.length === 0 && issues.length === 0) {
    issues.push(issue('FIGMA_DIFF_MISSING', 'The linked Figma target contains no frames to compare.'));
  }
  for (const frame of required) {
    const record = records.get(frame.id);
    if (record === undefined) {
      issues.push(issue(
        'FIGMA_DIFF_MISSING',
        `Frame ${frame.id} (${frame.name}) has no current comparison; run \`omd figma diff ${frame.id} <rendered-page> --json\`.`,
      ));
      continue;
    }
    if (record.fileKey !== snapshot.fileKey) {
      issues.push(issue('FIGMA_DIFF_STALE', `Figma diff for frame ${record.frameId} belongs to another file.`));
      continue;
    }
    if (record.threshold < MIN_COMPLETION_THRESHOLD) {
      issues.push(issue(
        'FIGMA_DIFF_THRESHOLD_LOWERED',
        `Frame ${record.frameId} used threshold ${record.threshold}; completion requires at least ${MIN_COMPLETION_THRESHOLD}.`,
      ));
      continue;
    }
    const exportPath = join(root, '.omd/figma/exports', `${record.safeId}.png`);
    const renderPath = join(root, '.omd/figma/renders', `${record.safeId}.png`);
    if (!existsSync(exportPath) || !existsSync(renderPath)) {
      issues.push(issue('FIGMA_DIFF_STALE', `Figma diff for frame ${record.frameId} is missing its export or render.`));
      continue;
    }
    const exportBytes = readFileSync(exportPath);
    const renderBytes = readFileSync(renderPath);
    if (sha256(exportBytes) !== record.exportSha256 || sha256(renderBytes) !== record.renderSha256
      || !figmaArtifactMatchesReceipt(exportPath, 'export', snapshotBytes)
      || !figmaArtifactMatchesReceipt(renderPath, 'render', snapshotBytes)) {
      issues.push(issue('FIGMA_DIFF_STALE', `Figma diff for frame ${record.frameId} no longer matches its export or render.`));
      continue;
    }
    let recomputed: DiffResult;
    try { recomputed = compareImages(exportBytes, renderBytes, record.threshold); }
    catch {
      issues.push(issue('FIGMA_DIFF_STALE', `Figma diff for frame ${record.frameId} could not be recomputed from its PNGs.`));
      continue;
    }
    if (recomputed.dimMismatch !== undefined) {
      issues.push(issue(
        'FIGMA_DIFF_DIMENSIONS_MISMATCH',
        `Frame ${record.frameId} export is ${recomputed.dimMismatch.refWidth}x${recomputed.dimMismatch.refHeight}, but the render is ${recomputed.dimMismatch.buildWidth}x${recomputed.dimMismatch.buildHeight}.`,
      ));
    } else if (!recomputed.pass) {
      issues.push(issue(
        'FIGMA_DIFF_FAILED',
        `Frame ${record.frameId} is ${(recomputed.score * 100).toFixed(1)}% similar, below ${(recomputed.threshold * 100).toFixed(1)}%.`,
      ));
    }
  }
  return issues;
}
