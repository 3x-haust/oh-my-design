import { createHash } from 'node:crypto';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import type { DiffResult } from './diff.ts';
import { createFigmaCompareImages } from './compare-images.ts';
import { signFigmaCompareRecord } from './compare-record.ts';
import type { FigmaSnapshot, SnapshotFrame } from './types.ts';
import {
  FIGMA_COMPARE_SCHEMA,
  figmaCompareSafeId,
  type FigmaCompareRecord,
  type FigmaCompareRecordBody,
  type RenderedElementFact,
} from './compare-types.ts';

export * from './compare-types.ts';
export {
  collectRenderedElementFacts,
  figmaNodesInRegion,
  renderedElementsInRegion,
  renderFigmaPage,
} from './compare-facts.ts';
export {
  readFigmaCompareImage,
  readFigmaCompareRecord,
  serializeFigmaCompareRecord,
} from './compare-record.ts';

const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export function createFigmaCompareRecord(
  root: string,
  input: Readonly<{
    frame: SnapshotFrame;
    snapshot: FigmaSnapshot;
    snapshotBytes: Uint8Array;
    exportBytes: Buffer;
    renderBytes: Buffer;
    diffBytes: Uint8Array;
    result: DiffResult;
    renderedElements: readonly RenderedElementFact[];
    adapter: ProjectWriteAdapter;
  }>,
): FigmaCompareRecord {
  const images = createFigmaCompareImages(input);
  const body: FigmaCompareRecordBody = {
    schema: FIGMA_COMPARE_SCHEMA,
    frameId: input.frame.id,
    safeId: figmaCompareSafeId(input.frame.id),
    fileKey: input.snapshot.fileKey,
    snapshotSha256: sha256(input.snapshotBytes),
    exportSha256: sha256(input.exportBytes),
    renderSha256: sha256(input.renderBytes),
    diffSha256: sha256(input.diffBytes),
    ...images,
  };
  return signFigmaCompareRecord(root, body);
}
