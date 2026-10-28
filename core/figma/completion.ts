import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { figmaArtifactMatchesReceipt } from './artifact-lifecycle.ts';
import { figmaCompareRecordPath, readFigmaCompareRecord } from './compare.ts';
import { parseFileKey } from './client.ts';
import { compareImages, type DiffResult } from './diff.ts';
import {
  figmaDiffRecordPath,
  figmaSafeFrameId,
  parseFigmaDiffRecord,
  type FigmaDiffRecord,
} from './diff-record.ts';
import { FIGMA_FIX_STUCK_ROUNDS, readFigmaFidelityReview } from './review.ts';
import type { FigmaSnapshot, SnapshotFrame } from './types.ts';
export {
  figmaDiffRecord,
  figmaDiffRecordPath,
  figmaSafeFrameId,
  parseFigmaDiffRecord,
  type FigmaDiffRecord,
} from './diff-record.ts';

/**
 * A Figma link in the request makes its frames the implementation target. Completion verifies
 * signed diff records, reopens the exact export/render bytes, and recomputes the comparison.
 * The project-local observation signature follows consulted-reference capture: it binds durable
 * evidence to one project without claiming external Figma or human approval.
 */

export const MIN_FIGMA_COMPLETION_SCORE = 0.90;
const FIGMA_HOSTS = new Set(['figma.com', 'www.figma.com']);
const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/giu;

export type FigmaTarget = Readonly<{ url: string; fileKey: string; nodeId?: string }>;

export type FigmaCompletionIssue = Readonly<{ code: string; message: string }>;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const issue = (code: string, message: string): FigmaCompletionIssue => ({ code, message });

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
  const records = new Map<string, Readonly<{ record: FigmaDiffRecord; sha256: string }>>();
  if (existsSync(directory)) {
    for (const name of readdirSync(directory).filter(candidate => candidate.endsWith('.json'))) {
      const bytes = readFileSync(join(directory, name));
      const parsed = parseFigmaDiffRecord(root, bytes.toString('utf8'));
      if ('issue' in parsed) {
        issues.push({ ...parsed.issue, message: `${name}: ${parsed.issue.message}` });
        continue;
      }
      if (`${parsed.record.safeId}.json` !== name || figmaSafeFrameId(parsed.record.frameId) !== parsed.record.safeId) {
        issues.push(issue('FIGMA_DIFF_RECORD_INVALID', `Figma diff record ${name} does not match its frame identity.`));
        continue;
      }
      if (parsed.record.snapshotSha256 === snapshotSha) {
        records.set(parsed.record.frameId, { record: parsed.record, sha256: sha256(bytes) });
      }
    }
  }
  if (required.length === 0 && issues.length === 0) {
    issues.push(issue('FIGMA_DIFF_MISSING', 'The linked Figma target contains no frames to compare.'));
  }
  for (const frame of required) {
    const current = records.get(frame.id);
    if (current === undefined) {
      issues.push(issue(
        'FIGMA_DIFF_MISSING',
        `Frame ${frame.id} (${frame.name}) has no current comparison; run \`omd figma diff ${frame.id} <rendered-page> --json\`.`,
      ));
      continue;
    }
    const { record } = current;
    if (record.fileKey !== snapshot.fileKey) {
      issues.push(issue('FIGMA_DIFF_STALE', `Figma diff for frame ${record.frameId} belongs to another file.`));
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
      continue;
    }
    if (recomputed.score < MIN_FIGMA_COMPLETION_SCORE) {
      issues.push(issue(
        'FIGMA_DIFF_BELOW_FLOOR',
        `Frame ${record.frameId} is ${(recomputed.score * 100).toFixed(1)}% similar; completion requires at least ${(MIN_FIGMA_COMPLETION_SCORE * 100).toFixed(1)}%.`,
      ));
    }
    const comparePath = join(root, figmaCompareRecordPath(frame.id));
    const compare = readFigmaCompareRecord(root, frame.id);
    if (!existsSync(comparePath) || compare === null
      || compare.snapshotSha256 !== record.snapshotSha256
      || compare.exportSha256 !== record.exportSha256
      || compare.renderSha256 !== record.renderSha256
      || compare.diffSha256 !== current.sha256) {
      issues.push(issue(
        'FIGMA_REVIEW_STALE',
        `Frame ${record.frameId} has no current signed compare evidence; rerun \`omd figma diff\` and \`omd figma review\`.`,
      ));
      continue;
    }
    let review: ReturnType<typeof readFigmaFidelityReview>;
    try { review = readFigmaFidelityReview(root, frame.id); }
    catch {
      issues.push(issue(
        'FIGMA_REVIEW_STALE',
        `Frame ${record.frameId} fidelity review is invalid; rerun \`omd figma review ${record.frameId} --json\`.`,
      ));
      continue;
    }
    if (review === null) {
      issues.push(issue(
        'FIGMA_REVIEW_MISSING',
        `Frame ${record.frameId} has no isolated fidelity review; run \`omd figma review ${record.frameId} --json\`.`,
      ));
      continue;
    }
    const compareSha = sha256(readFileSync(comparePath));
    if (review.diffSha256 !== current.sha256 || review.compareSha256 !== compareSha) {
      issues.push(issue(
        'FIGMA_REVIEW_STALE',
        `Frame ${record.frameId} fidelity review is not bound to the current diff and compare evidence.`,
      ));
      continue;
    }
    const stuck = review.history.at(-1)?.unresolved.filter(item => item.count >= FIGMA_FIX_STUCK_ROUNDS) ?? [];
    if (stuck.length > 0) {
      issues.push(issue(
        'FIGMA_FIX_STUCK',
        `Frame ${record.frameId} has fixes unresolved for ${FIGMA_FIX_STUCK_ROUNDS} or more consecutive reviews: ${stuck.map(item => item.id).join(', ')}.`,
      ));
    }
    if (review.review.verdict !== 'match') {
      issues.push(issue(
        'FIGMA_REVIEW_MISMATCH',
        `Frame ${record.frameId} still has ${review.review.fixes.length} reviewer-directed visual fix${review.review.fixes.length === 1 ? '' : 'es'}.`,
      ));
    }
  }
  return issues;
}
