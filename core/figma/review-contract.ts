import { canonicalJson } from '../ref/board-artifacts.ts';
import { piDigest, piInteger, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import type { FigmaCompareRegion } from './compare.ts';

export const FIGMA_FIDELITY_REVIEW_TRANSPORT = 'figma-fidelity-reviewer-transport-v1';
export const FIGMA_FIDELITY_REVIEW_HANDBACK = 'figma-fidelity-reviewer-handback-v1';
export const FIGMA_FIDELITY_REVIEW_TASK = [
  'Judge the supplied Figma-versus-render visual evidence region by region.',
  'Look for visible differences in layout, spacing, size, typography, color, radius, borders, icons, alignment, and missing or extra elements.',
  'Ignore sub-pixel antialiasing and font rasterization noise.',
  'Use the supplied exact Figma values and rendered computed CSS values whenever they identify the repair.',
  'For every mismatch, say exactly what to change and reference only supplied Figma node identities or rendered selectors.',
  'Reconcile every prior fix id exactly once as resolved or unresolved.',
  'Return match only when there is no visible difference and no fixes.',
  'Return exactly the closed output contract.',
].join(' ');

export type FigmaFidelityReviewBindings = Readonly<{
  buildSha256: string;
  briefSha256: string;
  evidenceSha256: string;
  browserSha256: string;
  diffSha256: string;
  compareSha256: string;
}>;

export type FigmaFixElement = Readonly<{
  figmaNodeId: string | null;
  figmaNodeName: string | null;
  renderedSelector: string | null;
}>;

export type FigmaFidelityFix = Readonly<{
  id: string;
  regionIndex: number;
  element: FigmaFixElement;
  property: string;
  figmaValue: string;
  renderValue: string;
  instruction: string;
}>;

export type FigmaPriorFix = Readonly<{
  id: string;
  status: 'resolved' | 'unresolved';
}>;

export type FigmaFidelityReview = Readonly<{
  verdict: 'match' | 'mismatch';
  fixes: readonly FigmaFidelityFix[];
  priorFixes: readonly FigmaPriorFix[];
}>;

export class FigmaFidelityReviewError extends Error {
  override readonly name = 'FigmaFidelityReviewError';
  constructor(reason: string) { super(`FIGMA_FIDELITY_REVIEW_INVALID: ${reason}`); }
}

const fail = (reason: string): never => { throw new FigmaFidelityReviewError(reason); };
const exact = (value: Record<string, unknown>, keys: readonly string[]): void => {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail('unexpected or missing fields');
};
const nullableText = (value: unknown, label: string): string | null =>
  value === null ? null : piText(value, label);

function parseElement(
  value: unknown,
  region: FigmaCompareRegion,
): FigmaFixElement {
  const row = piRecord(value, 'figma-fix-element');
  exact(row, ['figmaNodeId', 'figmaNodeName', 'renderedSelector']);
  const element = {
    figmaNodeId: nullableText(row.figmaNodeId, 'figma-node-id'),
    figmaNodeName: nullableText(row.figmaNodeName, 'figma-node-name'),
    renderedSelector: nullableText(row.renderedSelector, 'rendered-selector'),
  };
  if (element.figmaNodeId === null && element.figmaNodeName === null && element.renderedSelector === null) {
    return fail('fix element is empty');
  }
  if (element.figmaNodeId !== null || element.figmaNodeName !== null) {
    const node = region.figmaNodes.find(candidate =>
      (element.figmaNodeId === null || candidate.id === element.figmaNodeId)
      && (element.figmaNodeName === null || candidate.name === element.figmaNodeName));
    if (node === undefined) return fail('unknown Figma element');
  }
  if (element.renderedSelector !== null
    && !region.renderedElements.some(candidate => candidate.selector === element.renderedSelector)) {
    return fail('unknown rendered element');
  }
  return element;
}

export function parseFigmaFidelityReview(
  value: unknown,
  bindings: FigmaFidelityReviewBindings,
  regions: readonly FigmaCompareRegion[],
  prior: readonly FigmaFidelityFix[],
): FigmaFidelityReview {
  const input = piRecord(value, 'figma-fidelity-review');
  exact(input, ['schema', 'fixedBindings', 'verdict', 'fixes', 'priorFixes']);
  if (input.schema !== FIGMA_FIDELITY_REVIEW_HANDBACK
    || canonicalJson(input.fixedBindings) !== canonicalJson(bindings)) return fail('evidence bindings changed');
  if (input.verdict !== 'match' && input.verdict !== 'mismatch') return fail('verdict');
  if (!Array.isArray(input.fixes) || input.fixes.length > 24) return fail('fixes');
  const fixes = input.fixes.map((value): FigmaFidelityFix => {
    const row = piRecord(value, 'figma-fix');
    exact(row, ['id', 'regionIndex', 'element', 'property', 'figmaValue', 'renderValue', 'instruction']);
    const regionIndex = piInteger(row.regionIndex, 'region-index');
    const region = regions.find(candidate => candidate.index === regionIndex);
    if (region === undefined) return fail('unknown region');
    return {
      id: piText(row.id, 'fix-id'),
      regionIndex,
      element: parseElement(row.element, region),
      property: piText(row.property, 'fix-property'),
      figmaValue: piText(row.figmaValue, 'figma-value'),
      renderValue: piText(row.renderValue, 'render-value'),
      instruction: piText(row.instruction, 'fix-instruction'),
    };
  });
  if (new Set(fixes.map(fix => fix.id)).size !== fixes.length) return fail('duplicate fix id');
  if ((input.verdict === 'match') !== (fixes.length === 0)) return fail('verdict contradicts fixes');
  if (!Array.isArray(input.priorFixes)) return fail('prior fixes');
  const priorFixes = input.priorFixes.map((value): FigmaPriorFix => {
    const row = piRecord(value, 'figma-prior-fix');
    exact(row, ['id', 'status']);
    if (row.status !== 'resolved' && row.status !== 'unresolved') return fail('prior fix status');
    return { id: piText(row.id, 'prior-fix-id'), status: row.status };
  });
  const priorIds = prior.map(fix => fix.id);
  if (priorFixes.length !== priorIds.length
    || new Set(priorFixes.map(fix => fix.id)).size !== priorFixes.length
    || priorFixes.some(fix => !priorIds.includes(fix.id))
    || priorIds.some(id => !priorFixes.some(fix => fix.id === id))) {
    return fail('prior fixes not reconciled');
  }
  for (const priorFix of priorFixes) {
    const remains = fixes.some(fix => fix.id === priorFix.id);
    if ((priorFix.status === 'unresolved') !== remains) return fail('prior fix status contradicts fixes');
  }
  for (const value of Object.values(bindings)) piDigest(value, 'figma-review-binding');
  return { verdict: input.verdict, fixes, priorFixes };
}
