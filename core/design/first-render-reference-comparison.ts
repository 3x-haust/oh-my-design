import { piDigest, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import type { FirstRenderCaptureBinding, FirstRenderFinding } from './first-render-review-contract.ts';

export type FirstRenderReferenceCapture = Readonly<{
  captureSha256: string;
  referenceRole: 'primary' | 'supplemental';
}>;
export type FirstRenderReferenceComparison = FirstRenderCaptureBinding & Readonly<{
  referenceSha256: string;
  verdict: 'pass' | 'fail' | 'insufficient';
  sourceIdentity: string;
  preservedTraits: readonly string[];
  departures: readonly string[];
  findingIds: readonly string[];
}>;

export function parseReferenceCaptures(value: unknown): readonly FirstRenderReferenceCapture[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error('FIRST_RENDER_REVIEW_INVALID: reference comparison sources');
  return value.map(item => {
    const row = piRecord(item, 'reference-comparison-source');
    if (Object.keys(row).sort().join() !== ['captureSha256', 'referenceRole'].sort().join()
      || (row.referenceRole !== 'primary' && row.referenceRole !== 'supplemental')) {
      throw new Error('FIRST_RENDER_REVIEW_INVALID: reference comparison source fields');
    }
    return { captureSha256: piDigest(row.captureSha256, 'reference-comparison-source'), referenceRole: row.referenceRole };
  });
}

export function referenceComparisonBindings(
  references: readonly FirstRenderReferenceCapture[], captures: readonly FirstRenderCaptureBinding[],
) {
  return references.filter(reference => reference.referenceRole === 'primary')
    .flatMap(reference => captures.map(capture => ({
      viewport: capture.viewport, captureSha256: capture.captureSha256, referenceSha256: reference.captureSha256,
    })));
}

export function parseReferenceComparisons(
  value: unknown, references: readonly FirstRenderReferenceCapture[],
  captures: readonly FirstRenderCaptureBinding[], findings: readonly FirstRenderFinding[],
): readonly FirstRenderReferenceComparison[] {
  const fail = (reason: string): never => { throw new Error(`FIRST_RENDER_REVIEW_INVALID: reference comparison ${reason}`); };
  const expected = referenceComparisonBindings(references, captures);
  if (!Array.isArray(value) || value.length !== expected.length) return fail('coverage');
  const key = (row: FirstRenderCaptureBinding & { referenceSha256: string }) =>
    `${row.viewport}/${row.captureSha256}/${row.referenceSha256}`;
  const seen = new Set<string>();
  return value.map(item => {
    const row = piRecord(item, 'reference-comparison');
    if (Object.keys(row).sort().join() !== [
      'viewport', 'captureSha256', 'referenceSha256', 'verdict', 'sourceIdentity',
      'preservedTraits', 'departures', 'findingIds',
    ].sort().join()) return fail('fields');
    const binding = expected.find(binding => binding.viewport === row.viewport
      && binding.captureSha256 === row.captureSha256 && binding.referenceSha256 === row.referenceSha256);
    if (!binding || seen.has(key(binding))) return fail('capture binding');
    seen.add(key(binding));
    piDigest(binding.referenceSha256, 'reference-comparison-source');
    if (row.verdict !== 'pass' && row.verdict !== 'fail' && row.verdict !== 'insufficient') return fail('verdict');
    const texts = (value: unknown, field: string): string[] => {
      if (!Array.isArray(value)) return fail(field);
      return value.map(item => piText(item, `reference-comparison-${field}`));
    };
    const findingIds = texts(row.findingIds, 'findings');
    if (new Set(findingIds).size !== findingIds.length || findingIds.some(id => !findings.some(
      finding => finding.id === id && (finding.viewport === 'both' || finding.viewport === binding.viewport),
    ))) return fail('finding binding');
    if ((row.verdict === 'pass') !== (findingIds.length === 0)) return fail('unresolved finding');
    return {
      ...binding, verdict: row.verdict, sourceIdentity: piText(row.sourceIdentity, 'reference-comparison-identity'),
      preservedTraits: texts(row.preservedTraits, 'preserved'), departures: texts(row.departures, 'departures'),
      findingIds,
    };
  });
}
