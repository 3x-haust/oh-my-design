import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { CHANNEL_TOLERANCE, type DiffCell, type DiffResult } from './diff.ts';
import type { SnapshotFrame } from './types.ts';
import { figmaNodesInRegion, renderedElementsInRegion } from './compare-facts.ts';
import {
  FIGMA_REGION_MISMATCH_THRESHOLD,
  FIGMA_REGION_PADDING,
  MAX_FIGMA_COMPARE_REGIONS,
  figmaCompareDirectory,
  type FigmaCompareBox,
  type FigmaCompareImage,
  type FigmaCompareRegion,
  type RenderedElementFact,
} from './compare-types.ts';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const channel = (image: PNG, index: number): number => image.data[index] ?? 0;

function heatmap(ref: PNG, build: PNG): PNG {
  const output = new PNG({ width: ref.width, height: ref.height });
  for (let y = 0; y < ref.height; y += 1) {
    for (let x = 0; x < ref.width; x += 1) {
      const outputIndex = (y * output.width + x) * 4;
      const outside = x >= build.width || y >= build.height;
      let delta = outside ? 255 : 0;
      if (!outside) {
        const refIndex = (y * ref.width + x) * 4;
        const buildIndex = (y * build.width + x) * 4;
        for (let color = 0; color < 3; color += 1) {
          delta = Math.max(delta,
            Math.abs(channel(ref, refIndex + color) - channel(build, buildIndex + color)));
        }
      }
      const changed = delta > CHANNEL_TOLERANCE;
      output.data[outputIndex] = changed ? 255 : 244;
      output.data[outputIndex + 1] = changed ? Math.max(0, 190 - delta) : 244;
      output.data[outputIndex + 2] = changed ? 0 : 244;
      output.data[outputIndex + 3] = 255;
    }
  }
  return output;
}

function crop(source: PNG, box: FigmaCompareBox): PNG {
  const output = new PNG({ width: box.width, height: box.height });
  PNG.bitblt(source, output, box.x, box.y, box.width, box.height, 0, 0);
  return output;
}

function composite(images: readonly PNG[]): PNG {
  const width = images.reduce((sum, image) => sum + image.width, 0);
  const height = Math.max(...images.map(image => image.height));
  const output = new PNG({ width, height });
  output.data.fill(255);
  let x = 0;
  for (const image of images) {
    PNG.bitblt(image, output, 0, 0, image.width, image.height, x, 0);
    x += image.width;
  }
  return output;
}

function paddedCell(cell: DiffCell, width: number, height: number): FigmaCompareBox {
  const x = Math.max(0, cell.x - FIGMA_REGION_PADDING);
  const y = Math.max(0, cell.y - FIGMA_REGION_PADDING);
  const right = Math.min(width, cell.x + cell.width + FIGMA_REGION_PADDING);
  const bottom = Math.min(height, cell.y + cell.height + FIGMA_REGION_PADDING);
  return { x, y, width: right - x, height: bottom - y };
}

function writeImage(adapter: ProjectWriteAdapter, path: string, image: PNG): FigmaCompareImage {
  const bytes = PNG.sync.write(image);
  adapter.write(path, bytes);
  return { path, sha256: sha256(bytes), width: image.width, height: image.height };
}

export function createFigmaCompareImages(input: Readonly<{
  frame: SnapshotFrame;
  exportBytes: Buffer;
  renderBytes: Buffer;
  result: DiffResult;
  renderedElements: readonly RenderedElementFact[];
  adapter: ProjectWriteAdapter;
}>): Readonly<{ wholeComposite: FigmaCompareImage; regions: readonly FigmaCompareRegion[] }> {
  const ref = PNG.sync.read(input.exportBytes);
  const build = PNG.sync.read(input.renderBytes);
  const diff = heatmap(ref, build);
  const width = Math.min(ref.width, build.width);
  const height = Math.min(ref.height, build.height);
  const fullBox = { x: 0, y: 0, width, height };
  const base = figmaCompareDirectory(input.frame.id);
  input.adapter.mkdir(base);
  const wholeComposite = writeImage(input.adapter, `${base}/whole.png`, composite([ref, build, diff]));
  const wholeRegion: FigmaCompareRegion = {
    index: 0,
    cell: null,
    crop: fullBox,
    composite: wholeComposite,
    figmaNodes: figmaNodesInRegion(input.frame, fullBox),
    renderedElements: renderedElementsInRegion(input.renderedElements, fullBox),
  };
  const selected = input.result.cells.filter(cell => cell.mismatch > FIGMA_REGION_MISMATCH_THRESHOLD)
    .sort((left, right) => right.mismatch - left.mismatch
      || left.row - right.row || left.col - right.col)
    .slice(0, MAX_FIGMA_COMPARE_REGIONS);
  const cellRegions = selected.map((cell, offset): FigmaCompareRegion => {
    const cropBox = paddedCell(cell, width, height);
    const regionBox = { x: cell.x, y: cell.y, width: cell.width, height: cell.height };
    return {
      index: offset + 1,
      cell,
      crop: cropBox,
      composite: writeImage(input.adapter, `${base}/region-${offset}.png`,
        composite([crop(ref, cropBox), crop(build, cropBox), crop(diff, cropBox)])),
      figmaNodes: figmaNodesInRegion(input.frame, regionBox),
      renderedElements: renderedElementsInRegion(input.renderedElements, regionBox),
    };
  });
  return { wholeComposite, regions: [wholeRegion, ...cellRegions] };
}
