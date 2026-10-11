import { piDigest, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { sha256 } from '../ref/board-artifacts.ts';
import {
  FirstRenderReviewError, parseFirstRenderFindings,
  type FirstRenderCaptureBinding, type FirstRenderFinding,
} from './first-render-review-contract.ts';

export type FirstRenderBaseline = Readonly<{
  id: string;
  reviewSha256: string;
  captures: readonly FirstRenderCaptureBinding[];
}>;

export const FIRST_RENDER_VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;

const fail = (reason: string): never => { throw new FirstRenderReviewError(`baseline ${reason}`); };
const exact = (row: Record<string, unknown>, keys: readonly string[]) => {
  if (Object.keys(row).sort().join() !== [...keys].sort().join()) fail('fields');
};

export function parseFirstRenderBaselines(value: unknown, findings: readonly FirstRenderFinding[]): readonly FirstRenderBaseline[] {
  if (!Array.isArray(value) || value.length !== findings.length) return fail('coverage');
  const baselines = value.map((item): FirstRenderBaseline => {
    const row = piRecord(item, 'first-render-baseline');
    exact(row, ['id', 'reviewSha256', 'captures']);
    const finding = findings.find(finding => finding.id === row.id) ?? fail('criterion');
    const viewports = finding.viewport === 'both' ? ['desktop', 'mobile'] as const : [finding.viewport];
    if (!Array.isArray(row.captures) || row.captures.length !== viewports.length) return fail('viewports');
    const captures = row.captures.map((item): FirstRenderCaptureBinding => {
      const capture = piRecord(item, 'baseline-capture');
      exact(capture, ['viewport', 'captureSha256']);
      const viewport = viewports.find(viewport => viewport === capture.viewport) ?? fail('viewport');
      return { viewport, captureSha256: piDigest(capture.captureSha256, 'baseline-capture-sha') };
    });
    if (new Set(captures.map(capture => capture.viewport)).size !== captures.length) return fail('viewports');
    return { id: finding.id, reviewSha256: piDigest(row.reviewSha256, 'baseline-review-sha'), captures };
  });
  if (new Set(baselines.map(baseline => baseline.id)).size !== baselines.length) return fail('criteria');
  return baselines;
}

export function firstRenderActiveBaselines(
  findings: readonly FirstRenderFinding[],
  prior: readonly FirstRenderBaseline[],
  current: Readonly<{ sha256: string; captures: readonly FirstRenderCaptureBinding[] }>,
): readonly FirstRenderBaseline[] {
  return findings.map(finding => prior.find(baseline => baseline.id === finding.id) ?? {
    id: finding.id, reviewSha256: current.sha256,
    captures: current.captures.filter(capture => finding.viewport === 'both' || finding.viewport === capture.viewport),
  });
}

export function validateFirstRenderBaselineImages(evidence: Record<string, unknown>): number {
  const findings = parseFirstRenderFindings(evidence.priorCriteria);
  const baselines = parseFirstRenderBaselines(evidence.priorBaselines, findings);
  const expected = new Map(baselines.flatMap(baseline => baseline.captures)
    .map(capture => [`${capture.viewport}/${capture.captureSha256}`, capture]));
  if (!Array.isArray(evidence.priorRenders) || evidence.priorRenders.length !== expected.size) return fail('images');
  const seen = new Set<string>();
  for (const item of evidence.priorRenders) {
    const row = piRecord(item, 'baseline-image');
    exact(row, ['role', 'viewport', 'width', 'height', 'captureSha256', 'pngBase64']);
    const key = `${String(row.viewport)}/${String(row.captureSha256)}`;
    const capture = expected.get(key) ?? fail('image binding');
    const viewport = FIRST_RENDER_VIEWPORTS[capture.viewport];
    if (seen.has(key) || row.role !== 'repair-baseline'
      || row.width !== viewport.width || row.height !== viewport.height) return fail('image viewport');
    const bytes = Buffer.from(piText(row.pngBase64, 'baseline-image-bytes'), 'base64');
    if (sha256(bytes) !== capture.captureSha256) return fail('image digest');
    seen.add(key);
  }
  return expected.size;
}
