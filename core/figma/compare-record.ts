import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import {
  FIGMA_COMPARE_SCHEMA,
  MAX_FIGMA_COMPARE_REGIONS,
  MAX_FIGMA_REGION_FACTS,
  figmaCompareDirectory,
  figmaCompareRecordPath,
  figmaCompareSafeId,
  type FigmaCompareBox,
  type FigmaCompareImage,
  type FigmaCompareRecord,
  type FigmaCompareRecordBody,
  type FigmaCompareRegion,
  type FigmaNodeFact,
  type RenderedElementFact,
} from './compare-types.ts';

const DIGEST = /^[a-f0-9]{64}$/u;
const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const exact = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const text = (value: unknown): string | null => typeof value === 'string' ? value : null;
const digest = (value: unknown): string | null => typeof value === 'string' && DIGEST.test(value) ? value : null;
const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
const strings = (value: unknown): readonly string[] | null =>
  Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null;

function box(value: unknown): FigmaCompareBox | null {
  const row = object(value);
  if (row === null || !exact(row, ['x', 'y', 'width', 'height'])) return null;
  const x = number(row.x), y = number(row.y), width = number(row.width), height = number(row.height);
  return x === null || y === null || width === null || height === null || width <= 0 || height <= 0
    ? null : { x, y, width, height };
}

function image(value: unknown, expectedPath: string): FigmaCompareImage | null {
  const row = object(value);
  if (row === null || !exact(row, ['path', 'sha256', 'width', 'height']) || row.path !== expectedPath) return null;
  const imageSha = digest(row.sha256), width = integer(row.width), height = integer(row.height);
  return imageSha === null || width === null || height === null || width <= 0 || height <= 0
    ? null : { path: expectedPath, sha256: imageSha, width, height };
}

function nodeFact(value: unknown): FigmaNodeFact | null {
  const row = object(value), stroke = object(row?.stroke), typography = row?.typography === null ? null : object(row?.typography);
  if (row === null || stroke === null
    || !exact(row, ['id', 'name', 'type', 'box', 'fillColors', 'stroke', 'cornerRadius', 'typography', 'text'])
    || !exact(stroke, ['colors', 'weight'])) return null;
  const id = text(row.id), name = text(row.name), type = text(row.type), nodeBox = box(row.box);
  const fillColors = strings(row.fillColors), colors = strings(stroke.colors);
  const weight = stroke.weight === null ? null : number(stroke.weight);
  const radius = row.cornerRadius === null ? null : number(row.cornerRadius);
  if (id === null || name === null || type === null || nodeBox === null || fillColors === null || colors === null
    || (stroke.weight !== null && weight === null) || (row.cornerRadius !== null && radius === null)) return null;
  let parsedTypography: FigmaNodeFact['typography'] = null;
  if (typography !== null) {
    if (!exact(typography, ['family', 'weight', 'size', 'lineHeight', 'letterSpacing'])) return null;
    const family = text(typography.family), fontWeight = number(typography.weight), size = number(typography.size);
    const lineHeight = number(typography.lineHeight), letterSpacing = number(typography.letterSpacing);
    if (family === null || fontWeight === null || size === null || lineHeight === null || letterSpacing === null) return null;
    parsedTypography = { family, weight: fontWeight, size, lineHeight, letterSpacing };
  } else if (row.typography !== null) return null;
  const nodeText = text(row.text);
  return nodeText === null ? null : {
    id, name, type, box: nodeBox, fillColors,
    stroke: { colors, weight }, cornerRadius: radius, typography: parsedTypography, text: nodeText,
  };
}

function renderedFact(value: unknown): RenderedElementFact | null {
  const row = object(value), styles = object(row?.styles);
  const styleKeys = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color',
    'backgroundColor', 'border', 'borderRadius', 'padding', 'gap'] as const;
  if (row === null || styles === null || !exact(row, ['tag', 'selector', 'text', 'box', 'styles'])
    || !exact(styles, styleKeys)) return null;
  const tag = text(row.tag), selector = text(row.selector), content = text(row.text), elementBox = box(row.box);
  if (tag === null || selector === null || content === null || elementBox === null
    || styleKeys.some(key => text(styles[key]) === null)) return null;
  return { tag, selector, text: content, box: elementBox, styles: {
    fontFamily: String(styles.fontFamily), fontSize: String(styles.fontSize),
    fontWeight: String(styles.fontWeight), lineHeight: String(styles.lineHeight),
    letterSpacing: String(styles.letterSpacing), color: String(styles.color),
    backgroundColor: String(styles.backgroundColor), border: String(styles.border),
    borderRadius: String(styles.borderRadius), padding: String(styles.padding), gap: String(styles.gap),
  } };
}

function cell(value: unknown): FigmaCompareRegion['cell'] | undefined {
  if (value === null) return null;
  const row = object(value);
  if (row === null || !exact(row, ['row', 'col', 'x', 'y', 'width', 'height', 'mismatch'])) return undefined;
  const parsedRow = integer(row.row), col = integer(row.col), x = integer(row.x), y = integer(row.y);
  const width = integer(row.width), height = integer(row.height), mismatch = number(row.mismatch);
  if (parsedRow === null || col === null || x === null || y === null || width === null || height === null
    || mismatch === null || parsedRow < 0 || col < 0 || x < 0 || y < 0
    || width <= 0 || height <= 0 || mismatch < 0 || mismatch > 1) return undefined;
  return { row: parsedRow, col, x, y, width, height, mismatch };
}

function region(value: unknown, expectedIndex: number, frameId: string, whole: FigmaCompareImage): FigmaCompareRegion | null {
  const row = object(value);
  if (row === null || !exact(row, ['index', 'cell', 'crop', 'composite', 'figmaNodes', 'renderedElements'])
    || row.index !== expectedIndex || !Array.isArray(row.figmaNodes) || !Array.isArray(row.renderedElements)
    || row.figmaNodes.length > MAX_FIGMA_REGION_FACTS || row.renderedElements.length > MAX_FIGMA_REGION_FACTS) return null;
  const parsedCell = cell(row.cell), cropBox = box(row.crop);
  const expectedPath = expectedIndex === 0 ? whole.path : `${figmaCompareDirectory(frameId)}/region-${expectedIndex - 1}.png`;
  const composite = image(row.composite, expectedPath);
  const figmaNodes = row.figmaNodes.map(nodeFact), renderedElements = row.renderedElements.map(renderedFact);
  if (parsedCell === undefined || (expectedIndex === 0) !== (parsedCell === null) || cropBox === null
    || composite === null || figmaNodes.some(item => item === null) || renderedElements.some(item => item === null)) return null;
  return {
    index: expectedIndex, cell: parsedCell, crop: cropBox, composite,
    figmaNodes: figmaNodes as FigmaNodeFact[], renderedElements: renderedElements as RenderedElementFact[],
  };
}

export function signFigmaCompareRecord(root: string, body: FigmaCompareRecordBody): FigmaCompareRecord {
  return { ...body, signature: signNativeObservation(root, FIGMA_COMPARE_SCHEMA, sha256(canonicalJson(body))) };
}

export function serializeFigmaCompareRecord(record: FigmaCompareRecord): string {
  return `${canonicalJson(record)}\n`;
}

export function readFigmaCompareImage(root: string, artifact: FigmaCompareImage): Buffer {
  const bytes = readContainedRegularFile(root, artifact.path, 'Figma compare image');
  const decoded = PNG.sync.read(bytes);
  if (sha256(bytes) !== artifact.sha256 || decoded.width !== artifact.width || decoded.height !== artifact.height) {
    throw new Error('Figma compare image changed');
  }
  return bytes;
}

export function readFigmaCompareRecord(root: string, frameId: string): FigmaCompareRecord | null {
  try {
    const value: unknown = JSON.parse(readContainedRegularFile(root, figmaCompareRecordPath(frameId),
      'Figma compare record').toString('utf8'));
    const row = object(value);
    if (row === null || !exact(row, ['schema', 'frameId', 'safeId', 'fileKey', 'snapshotSha256',
      'exportSha256', 'renderSha256', 'diffSha256', 'wholeComposite', 'regions', 'signature'])
      || row.schema !== FIGMA_COMPARE_SCHEMA || row.frameId !== frameId || row.safeId !== figmaCompareSafeId(frameId)
      || !Array.isArray(row.regions) || row.regions.length < 1
      || row.regions.length > MAX_FIGMA_COMPARE_REGIONS + 1) return null;
    const { signature, ...rawBody } = row;
    if (typeof signature !== 'string'
      || !verifyNativeObservation(root, FIGMA_COMPARE_SCHEMA, sha256(canonicalJson(rawBody)), signature)) return null;
    const whole = image(row.wholeComposite, `${figmaCompareDirectory(frameId)}/whole.png`);
    const regions = whole === null ? [] : row.regions.map((item, index) => region(item, index, frameId, whole));
    const bodyDigests = [row.snapshotSha256, row.exportSha256, row.renderSha256, row.diffSha256].map(digest);
    const fileKey = text(row.fileKey);
    if (whole === null || fileKey === null || fileKey.length === 0 || bodyDigests.some(value => value === null)
      || regions.some(value => value === null)) return null;
    const record: FigmaCompareRecord = {
      schema: FIGMA_COMPARE_SCHEMA, frameId, safeId: figmaCompareSafeId(frameId), fileKey,
      snapshotSha256: bodyDigests[0] as string, exportSha256: bodyDigests[1] as string,
      renderSha256: bodyDigests[2] as string, diffSha256: bodyDigests[3] as string,
      wholeComposite: whole, regions: regions as FigmaCompareRegion[], signature,
    };
    for (const artifact of [record.wholeComposite,
      ...record.regions.slice(1).map(item => item.composite)]) readFigmaCompareImage(root, artifact);
    return record;
  } catch { return null; }
}
