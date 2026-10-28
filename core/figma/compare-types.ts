import type { DiffCell } from './diff.ts';

export const FIGMA_COMPARE_SCHEMA = 'omd-figma-compare-record-v1';
export const FIGMA_REGION_MISMATCH_THRESHOLD = 0.05;
export const MAX_FIGMA_COMPARE_REGIONS = 8;
export const FIGMA_REGION_PADDING = 12;
export const MAX_FIGMA_REGION_FACTS = 24;
export const MAX_RENDERED_PAGE_ELEMENTS = 500;
export const FIGMA_FACT_TEXT_LIMIT = 160;

export type FigmaCompareBox = Readonly<{ x: number; y: number; width: number; height: number }>;
export type FigmaCompareImage = Readonly<{ path: string; sha256: string; width: number; height: number }>;

export type RenderedElementFact = Readonly<{
  tag: string;
  selector: string;
  text: string;
  box: FigmaCompareBox;
  styles: Readonly<{
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
    letterSpacing: string;
    color: string;
    backgroundColor: string;
    border: string;
    borderRadius: string;
    padding: string;
    gap: string;
  }>;
}>;

export type FigmaNodeFact = Readonly<{
  id: string;
  name: string;
  type: string;
  box: FigmaCompareBox;
  fillColors: readonly string[];
  stroke: Readonly<{ colors: readonly string[]; weight: number | null }>;
  cornerRadius: number | null;
  typography: Readonly<{
    family: string;
    weight: number;
    size: number;
    lineHeight: number;
    letterSpacing: number;
  }> | null;
  text: string;
}>;

export type FigmaCompareRegion = Readonly<{
  index: number;
  cell: DiffCell | null;
  crop: FigmaCompareBox;
  composite: FigmaCompareImage;
  figmaNodes: readonly FigmaNodeFact[];
  renderedElements: readonly RenderedElementFact[];
}>;

export type FigmaCompareRecordBody = Readonly<{
  schema: typeof FIGMA_COMPARE_SCHEMA;
  frameId: string;
  safeId: string;
  fileKey: string;
  snapshotSha256: string;
  exportSha256: string;
  renderSha256: string;
  diffSha256: string;
  wholeComposite: FigmaCompareImage;
  regions: readonly FigmaCompareRegion[];
}>;

export type FigmaCompareRecord = FigmaCompareRecordBody & Readonly<{ signature: string }>;

export const figmaCompareSafeId = (frameId: string): string => frameId.replaceAll(/[:/]/g, '_');
export const figmaCompareDirectory = (frameId: string): string =>
  `.omd/figma/compare/${figmaCompareSafeId(frameId)}`;
export const figmaCompareRecordPath = (frameId: string): string =>
  `${figmaCompareDirectory(frameId)}/compare.json`;
