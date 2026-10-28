import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import { figmaArtifactMatchesReceipt } from './artifact-lifecycle.ts';
import {
  figmaCompareRecordPath,
  readFigmaCompareImage,
  readFigmaCompareRecord,
} from './compare.ts';
import { figmaDiffRecordPath, parseFigmaDiffRecord } from './diff-record.ts';
import {
  FIGMA_FIDELITY_REVIEW_HANDBACK,
  FIGMA_FIDELITY_REVIEW_TRANSPORT,
  type FigmaFidelityReview,
  type FigmaFidelityReviewBindings,
} from './review-contract.ts';
import { readFigmaFidelityReview } from './review-record.ts';
import {
  figmaReviewFail,
  type FigmaFidelityReviewRecord,
  type FigmaFixHistoryRound,
  type PreparedFigmaReview,
} from './review-types.ts';
import type { FigmaSnapshot } from './types.ts';

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function snapshot(bytes: Buffer): FigmaSnapshot {
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || typeof Reflect.get(value, 'fileKey') !== 'string'
    || !Array.isArray(Reflect.get(value, 'pages'))) return figmaReviewFail('snapshot');
  return value as FigmaSnapshot;
}

function currentEvidence(root: string, frameId: string): Omit<PreparedFigmaReview, 'previous' | 'bindings' | 'packet'> {
  const snapshotBytes = readContainedRegularFile(root, '.omd/figma/snapshot.json', 'Figma snapshot');
  const currentSnapshot = snapshot(snapshotBytes);
  const frame = currentSnapshot.pages.flatMap(page => page.frames).find(candidate => candidate.id === frameId);
  if (frame === undefined) return figmaReviewFail('frame missing');
  const diffBytes = readContainedRegularFile(root, figmaDiffRecordPath(frameId), 'Figma diff record');
  const parsed = parseFigmaDiffRecord(root, diffBytes.toString('utf8'));
  if ('issue' in parsed) return figmaReviewFail(parsed.issue.code);
  const diff = parsed.record;
  const exportRelative = `.omd/figma/exports/${diff.safeId}.png`;
  const renderRelative = `.omd/figma/renders/${diff.safeId}.png`;
  const exportBytes = readContainedRegularFile(root, exportRelative, 'Figma export');
  const renderBytes = readContainedRegularFile(root, renderRelative, 'Figma render');
  const exportPath = join(root, exportRelative), renderPath = join(root, renderRelative);
  if (diff.frameId !== frameId || diff.fileKey !== currentSnapshot.fileKey
    || diff.snapshotSha256 !== sha256(snapshotBytes)
    || diff.exportSha256 !== sha256(exportBytes) || diff.renderSha256 !== sha256(renderBytes)
    || !figmaArtifactMatchesReceipt(exportPath, 'export', snapshotBytes)
    || !figmaArtifactMatchesReceipt(renderPath, 'render', snapshotBytes)) return figmaReviewFail('diff stale');
  const compareBytes = readContainedRegularFile(root, figmaCompareRecordPath(frameId), 'Figma compare record');
  const compare = readFigmaCompareRecord(root, frameId);
  if (compare === null || compare.fileKey !== currentSnapshot.fileKey
    || compare.snapshotSha256 !== diff.snapshotSha256 || compare.exportSha256 !== diff.exportSha256
    || compare.renderSha256 !== diff.renderSha256 || compare.diffSha256 !== sha256(diffBytes)) {
    return figmaReviewFail('compare stale');
  }
  return {
    snapshotBytes, frame, diff, diffBytes, diffSha256: sha256(diffBytes),
    compare, compareBytes, compareSha256: sha256(compareBytes),
  };
}

export function prepareFigmaReview(
  root: string,
  invocation: ProjectRunInvocation,
  frameId: string,
): PreparedFigmaReview {
  const current = currentEvidence(root, frameId);
  const previous = readFigmaFidelityReview(root, frameId);
  const images = [
    { image: current.compare.wholeComposite, regionIndex: null },
    ...current.compare.regions.slice(1).map(region => ({ image: region.composite, regionIndex: region.index })),
  ];
  const renders = images.map(({ image, regionIndex }, index) => ({
    role: index === 0 ? 'whole-composite' : 'region-composite',
    regionIndex,
    captureSha256: image.sha256,
    width: image.width,
    height: image.height,
    pngBase64: readFigmaCompareImage(root, image).toString('base64'),
  }));
  const imageBindings = renders.map(({ pngBase64: _bytes, ...record }) => record);
  const evidence = {
    frame: { id: current.frame.id, name: current.frame.name,
      score: current.diff.score, threshold: current.diff.threshold },
    regions: current.compare.regions,
    previousReview: previous === null ? null : {
      reviewSha256: previous.sha256, verdict: previous.review.verdict, fixes: previous.review.fixes,
    },
    renders,
  };
  const bindings: FigmaFidelityReviewBindings = {
    buildSha256: invocation.current.buildSha256, briefSha256: invocation.current.briefSha256,
    evidenceSha256: sha256(canonicalJson(evidence)), browserSha256: sha256(canonicalJson(imageBindings)),
    diffSha256: current.diffSha256, compareSha256: current.compareSha256,
  };
  const packet = Buffer.from(canonicalJson({
    schema: FIGMA_FIDELITY_REVIEW_TRANSPORT,
    evidenceSha256: bindings.evidenceSha256,
    evidence,
    outputContract: {
      lane: 'figmaFidelity', schema: FIGMA_FIDELITY_REVIEW_HANDBACK, fixedBindings: bindings,
      responseTemplate: {
        schema: FIGMA_FIDELITY_REVIEW_HANDBACK, fixedBindings: bindings,
        verdict: null, fixes: [],
        priorFixes: previous?.review.fixes.map(fix => ({ id: fix.id, status: null })) ?? [],
      },
      requiredKeys: ['schema', 'fixedBindings', 'verdict', 'fixes', 'priorFixes'],
      verdicts: ['match', 'mismatch'],
      fixKeys: ['id', 'regionIndex', 'element', 'property', 'figmaValue', 'renderValue', 'instruction'],
      elementKeys: ['figmaNodeId', 'figmaNodeName', 'renderedSelector'],
      priorFixKeys: ['id', 'status'], priorFixStatuses: ['resolved', 'unresolved'],
      rules: 'Mismatch needs at least one fix. Match needs zero fixes. Reconcile every prior fix id exactly once. Reference only supplied facts.',
    },
  }));
  return { ...current, previous, bindings, packet };
}

export function nextFigmaFixHistory(
  previous: FigmaFidelityReviewRecord | null,
  review: FigmaFidelityReview,
  compareSha256: string,
): readonly FigmaFixHistoryRound[] {
  const counts = new Map(previous?.history.at(-1)?.unresolved.map(item => [item.id, item.count]) ?? []);
  const statuses = new Map(review.priorFixes.map(item => [item.id, item.status]));
  const unresolved = review.fixes.map(fix => ({
    id: fix.id,
    count: statuses.get(fix.id) === 'unresolved' ? (counts.get(fix.id) ?? 0) + 1 : 1,
  })).sort((left, right) => left.id.localeCompare(right.id));
  return [...(previous?.history ?? []), { compareSha256, unresolved }];
}
