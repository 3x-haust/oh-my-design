import { PNG } from 'pngjs';

/**
 * Cutting a generated asset out of its plain background and splitting a set into its items. A generated set arrives as
 * one sheet of items on a flat colour; the product needs each item alone on transparency, trimmed to its own edges.
 * Only background connected to the image's border is removed, so a white detail inside an item stays.
 */
export type CutOptions = Readonly<{ tolerance?: number | undefined }>;
export type Split = 'none' | 'auto' | Readonly<{ columns: number; rows: number }>;

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
/** RGB distance within which a pixel is the background; twice this is the soft edge. */
const DEFAULT_TOLERANCE = 36;
/** A piece smaller than this share of the sheet is a speck, not an item. */
const MIN_ITEM_SHARE = 0.002;

export function readPng(bytes: Buffer): PNG {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('ASSET_NOT_PNG: the candidate is not a PNG file');
  return PNG.sync.read(bytes);
}

/** The colour that fills the border: the median of every edge pixel. Null when the border is already transparent. */
export function borderColour(image: PNG): readonly [number, number, number] | null {
  const r: number[] = [], g: number[] = [], b: number[] = [];
  let clear = 0, total = 0;
  const take = (x: number, y: number) => {
    const at = (y * image.width + x) * 4;
    total += 1;
    if (image.data[at + 3]! < 16) { clear += 1; return; }
    r.push(image.data[at]!); g.push(image.data[at + 1]!); b.push(image.data[at + 2]!);
  };
  for (let x = 0; x < image.width; x++) { take(x, 0); take(x, image.height - 1); }
  for (let y = 1; y < image.height - 1; y++) { take(0, y); take(image.width - 1, y); }
  if (clear * 2 > total) return null;
  const median = (values: number[]) => values.sort((a, c) => a - c)[Math.floor(values.length / 2)] ?? 0;
  return [median(r), median(g), median(b)];
}

/** Make the border-connected background transparent, with a soft edge where an item's anti-aliasing meets it. */
export function cutBackground(image: PNG, options: CutOptions = {}): PNG {
  const background = borderColour(image);
  if (background === null) return image;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const { width, height, data } = image;
  const distance = (index: number) => Math.hypot(data[index * 4]! - background[0], data[index * 4 + 1]! - background[1], data[index * 4 + 2]! - background[2]);
  const removed = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const seed = (index: number) => { if (removed[index] === 0 && distance(index) <= tolerance) { removed[index] = 1; queue[tail++] = index; } };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++]!, x = index % width, y = (index - x) / width;
    if (x > 0) seed(index - 1);
    if (x < width - 1) seed(index + 1);
    if (y > 0) seed(index - width);
    if (y < height - 1) seed(index + width);
  }
  const out = new PNG({ width, height });
  data.copy(out.data);
  for (let index = 0; index < width * height; index++) {
    if (removed[index] === 1) { out.data[index * 4 + 3] = 0; continue; }
    const x = index % width, y = (index - x) / width;
    const touches = (x > 0 && removed[index - 1] === 1) || (x < width - 1 && removed[index + 1] === 1)
      || (y > 0 && removed[index - width] === 1) || (y < height - 1 && removed[index + width] === 1);
    if (!touches) continue;
    const share = Math.min(1, Math.max(0, (distance(index) - tolerance) / tolerance));
    out.data[index * 4 + 3] = Math.round(data[index * 4 + 3]! * share);
  }
  return out;
}

export type Box = Readonly<{ x: number; y: number; width: number; height: number }>;

/** The rectangle holding every visible pixel inside the box, or null when it holds none. */
export function opaqueBounds(image: PNG, box: Box = { x: 0, y: 0, width: image.width, height: image.height }): Box | null {
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3]! >= 24) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** The separate items on a cut sheet: groups of visible pixels, pieces close together merged into one item, read row by row. */
export function itemBoxes(image: PNG): readonly Box[] {
  const { width, height, data } = image;
  const label = new Int32Array(width * height).fill(-1);
  const boxes: { left: number; top: number; right: number; bottom: number; area: number }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || data[start * 4 + 3]! < 24) continue;
    const id = boxes.length, box = { left: width, top: height, right: 0, bottom: 0, area: 0 };
    boxes.push(box);
    label[start] = id; stack.push(start);
    while (stack.length > 0) {
      const index = stack.pop()!, x = index % width, y = (index - x) / width;
      box.area += 1;
      box.left = Math.min(box.left, x); box.right = Math.max(box.right, x); box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (label[next] === -1 && data[next * 4 + 3]! >= 24) { label[next] = id; stack.push(next); }
      }
    }
  }
  // A sparkle beside a coin or a shadow under an object belongs to it: merge pieces whose boxes nearly touch.
  const gap = Math.max(4, Math.round(Math.min(width, height) * 0.02));
  const merged = boxes.map(box => ({ ...box }));
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < merged.length && !changed; i++) for (let j = i + 1; j < merged.length && !changed; j++) {
      const a = merged[i]!, b = merged[j]!;
      if (a.left - gap <= b.right && b.left - gap <= a.right && a.top - gap <= b.bottom && b.top - gap <= a.bottom) {
        merged[i] = { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom), area: a.area + b.area };
        merged.splice(j, 1);
        changed = true;
      }
    }
  }
  const items = merged.filter(box => box.area >= width * height * MIN_ITEM_SHARE)
    .map(box => ({ x: box.left, y: box.top, width: box.right - box.left + 1, height: box.bottom - box.top + 1 }));
  // Row by row: items whose vertical centres fall within half the median height share a row.
  const rowHeight = (items.map(item => item.height).sort((a, b) => a - b)[Math.floor(items.length / 2)] ?? 0) / 2;
  return items.sort((a, b) => {
    const dy = (a.y + a.height / 2) - (b.y + b.height / 2);
    return Math.abs(dy) > rowHeight ? dy : a.x - b.x;
  });
}

/** A copy of the box with clear space around it. */
export function cropBox(image: PNG, box: Box, padding = 0): PNG {
  const out = new PNG({ width: box.width + padding * 2, height: box.height + padding * 2 });
  out.data.fill(0);
  PNG.bitblt(image, out, box.x, box.y, box.width, box.height, padding, padding);
  return out;
}

export function parseSplit(value: unknown): Split {
  if (value === undefined || value === false) return 'none';
  if (value === 'auto' || value === true) return 'auto';
  const grid = typeof value === 'string' ? /^(\d{1,2})x(\d{1,2})$/.exec(value) : null;
  if (grid === null || Number(grid[1]) < 1 || Number(grid[2]) < 1) throw new Error('ASSET_SPLIT: --split takes auto or <columns>x<rows>, such as 3x2');
  return { columns: Number(grid[1]), rows: Number(grid[2]) };
}

/** Cut (optionally), split (optionally) and trim: the PNG files a candidate becomes, in reading order. */
export function cutAsset(bytes: Buffer, options: Readonly<{ cut: boolean; split: Split; tolerance?: number | undefined }>): readonly Buffer[] {
  const source = readPng(bytes);
  const image = options.cut ? cutBackground(source, { tolerance: options.tolerance }) : source;
  const pad = (box: Box) => Math.max(4, Math.round(Math.max(box.width, box.height) * 0.04));
  const trimmed = (box: Box): Buffer | null => {
    const bounds = options.cut ? opaqueBounds(image, box) : box;
    return bounds === null ? null : PNG.sync.write(cropBox(image, bounds, options.cut ? pad(bounds) : 0));
  };
  if (options.split === 'none') {
    const whole = trimmed({ x: 0, y: 0, width: image.width, height: image.height });
    if (whole === null) throw new Error('ASSET_EMPTY: nothing is left once the background is cut; lower --tolerance or ship it without --cut');
    return [whole];
  }
  const boxes = options.split === 'auto'
    ? (options.cut || borderColour(image) === null ? itemBoxes(image)
      : (() => { throw new Error('ASSET_SPLIT: --split auto finds items on transparency; add --cut, or give a grid such as 3x2'); })())
    : Array.from({ length: options.split.columns * options.split.rows }, (_, index) => {
      const { columns, rows } = options.split as { columns: number; rows: number };
      const column = index % columns, row = Math.floor(index / columns);
      const x = Math.round(column * image.width / columns), y = Math.round(row * image.height / rows);
      return { x, y, width: Math.round((column + 1) * image.width / columns) - x, height: Math.round((row + 1) * image.height / rows) - y };
    });
  const items = boxes.map(trimmed).filter((item): item is Buffer => item !== null);
  if (items.length === 0) throw new Error('ASSET_EMPTY: no item was found on the sheet');
  return items;
}
