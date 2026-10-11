import type { Box } from '../types.ts';
export type FrequentActionContract = { selector: string; contract: { path: string; sha256: string; field: string } };
export type IrExtractionOptions = { measurementDetails?: boolean; frequentAction?: FrequentActionContract };
declare module '../types.ts' {
  interface RawNode {
    /** Computed visible border widths, CSS px, in top/right/bottom/left order. */
    borderWidths?: [number, number, number, number];
    /** Direct-text line count; does not combine descendant-owned text. */
    lineCount?: number;
    /** Nearest interactive/navigation-label context, including descendant spans. */
    textContext?: 'control' | 'navigation' | 'label' | 'body' | 'display';
  }
  interface RawIrMeta {
    frequentAction?: FrequentActionContract & { status: 'matched' | 'missing' | 'ambiguous' | 'not-rendered'; matchCount: number; nodeId: string | null; box: Box | null; viewportHeight: number };
  }
}
