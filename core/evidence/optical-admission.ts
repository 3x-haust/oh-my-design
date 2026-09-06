import { createHash } from 'node:crypto';

export const OPTICAL_RAW_SCHEMA = 'optical-admission-raw-v1' as const;
export const OPTICAL_RESULT_SCHEMA = 'optical-admission-result-v1' as const;

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;
type Lane = 'Q' | 'I';
type State = 'initial' | 'settled';

export type OpticalAdmissionRaw = Readonly<{
  schema: typeof OPTICAL_RAW_SCHEMA;
  viewport: Readonly<{ width: number; height: number }>;
  state: State;
  deviceScaleFactor: 1;
  zoom: 1;
  scroll: Readonly<{ x: 0; y: 0 }>;
  fontSettled: true;
  sourceSha256: string;
  captureSha256: string;
  members: readonly Readonly<{
    id: string;
    lane: Lane;
    kind: 'text' | 'control';
    recoveredString: string;
    rawGraphemeRects: readonly Rect[];
    lineFragments: readonly Rect[];
    clippingChain: readonly Rect[];
    nativeBounds: Rect | null;
    computed: Readonly<{
      fontSize: number;
      fontWeight: number;
      lineCount: number;
      measure: number;
      display: string;
      visibility: string;
      opacity: number;
      occluded: boolean;
    }>;
  }>[];
}>;

export type OpticalAdmissionResult = Readonly<{
  schema: typeof OPTICAL_RESULT_SCHEMA;
  viewport: Readonly<{ width: number; height: number }>;
  state: State;
  rawSha256: string;
  captureSha256: string;
  qArea: number;
  iArea: number;
  ratio: number;
  threshold: number | null;
  pass: boolean | null;
  memberInventory: readonly Readonly<{ id: string; lane: Lane; kind: 'text' | 'control'; fragmentCount: number }>[];
}>;

const HEX = /^[a-f0-9]{64}$/;

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
  const data = value as Record<string, unknown>;
  const actual = Object.keys(data).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} keys must be exactly ${expected.join(', ')}`);
  }
  return data;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function positive(value: unknown, label: string): number {
  const parsed = finite(value, label);
  if (parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be non-empty text`);
  return value;
}

function rect(value: unknown, label: string): Rect {
  const data = record(value, ['x', 'y', 'width', 'height'], label);
  return {
    x: finite(data.x, `${label}.x`), y: finite(data.y, `${label}.y`),
    width: positive(data.width, `${label}.width`), height: positive(data.height, `${label}.height`),
  };
}

function rects(value: unknown, label: string): readonly Rect[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => rect(entry, `${label}[${index}]`));
}

function sha(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!HEX.test(parsed)) throw new Error(`${label} must be lowercase SHA-256`);
  return parsed;
}

function parseRaw(value: unknown): OpticalAdmissionRaw {
  const data = record(value, [
    'schema', 'viewport', 'state', 'deviceScaleFactor', 'zoom', 'scroll', 'fontSettled',
    'sourceSha256', 'captureSha256', 'members',
  ], 'raw');
  if (data.schema !== OPTICAL_RAW_SCHEMA) throw new Error(`schema must be ${OPTICAL_RAW_SCHEMA}`);
  const viewport = record(data.viewport, ['width', 'height'], 'viewport');
  const scroll = record(data.scroll, ['x', 'y'], 'scroll');
  if (data.state !== 'initial' && data.state !== 'settled') throw new Error('state must be initial or settled');
  if (data.deviceScaleFactor !== 1 || data.zoom !== 1 || scroll.x !== 0 || scroll.y !== 0 || data.fontSettled !== true) {
    throw new Error('raw evidence must use DPR 1, zoom 1, scroll zero, and settled fonts');
  }
  if (!Array.isArray(data.members) || data.members.length === 0) throw new Error('members must be a non-empty array');
  const ids = new Set<string>();
  const members = data.members.map((entry, index) => {
    const item = record(entry, [
      'id', 'lane', 'kind', 'recoveredString', 'rawGraphemeRects', 'lineFragments',
      'clippingChain', 'nativeBounds', 'computed',
    ], `members[${index}]`);
    const id = text(item.id, `members[${index}].id`);
    if (ids.has(id)) throw new Error(`duplicate member id ${id}`);
    ids.add(id);
    if (item.lane !== 'Q' && item.lane !== 'I') throw new Error(`members[${index}].lane must be Q or I`);
    if (item.kind !== 'text' && item.kind !== 'control') throw new Error(`members[${index}].kind must be text or control`);
    const computed = record(item.computed, [
      'fontSize', 'fontWeight', 'lineCount', 'measure', 'display', 'visibility', 'opacity', 'occluded',
    ], `members[${index}].computed`);
    const nativeBounds = item.nativeBounds === null ? null : rect(item.nativeBounds, `members[${index}].nativeBounds`);
    const lineFragments = rects(item.lineFragments, `members[${index}].lineFragments`);
    if (item.kind === 'text' && lineFragments.length === 0) throw new Error(`members[${index}] text needs line fragments`);
    if (item.kind === 'control' && nativeBounds === null) throw new Error(`members[${index}] control needs native bounds`);
    const lineCount = finite(computed.lineCount, `members[${index}].computed.lineCount`);
    if (!Number.isSafeInteger(lineCount) || lineCount < 0) throw new Error(`members[${index}].computed.lineCount must be a non-negative integer`);
    if (typeof computed.occluded !== 'boolean') throw new Error(`members[${index}].computed.occluded must be boolean`);
    return {
      id, lane: item.lane as Lane, kind: item.kind as 'text' | 'control',
      recoveredString: text(item.recoveredString, `members[${index}].recoveredString`),
      rawGraphemeRects: rects(item.rawGraphemeRects, `members[${index}].rawGraphemeRects`),
      lineFragments, clippingChain: rects(item.clippingChain, `members[${index}].clippingChain`), nativeBounds,
      computed: {
        fontSize: finite(computed.fontSize, `members[${index}].computed.fontSize`),
        fontWeight: finite(computed.fontWeight, `members[${index}].computed.fontWeight`),
        lineCount, measure: finite(computed.measure, `members[${index}].computed.measure`),
        display: text(computed.display, `members[${index}].computed.display`),
        visibility: text(computed.visibility, `members[${index}].computed.visibility`),
        opacity: finite(computed.opacity, `members[${index}].computed.opacity`),
        occluded: computed.occluded,
      },
    };
  });
  return {
    schema: OPTICAL_RAW_SCHEMA,
    viewport: { width: positive(viewport.width, 'viewport.width'), height: positive(viewport.height, 'viewport.height') },
    state: data.state, deviceScaleFactor: 1, zoom: 1, scroll: { x: 0, y: 0 }, fontSettled: true,
    sourceSha256: sha(data.sourceSha256, 'sourceSha256'), captureSha256: sha(data.captureSha256, 'captureSha256'), members,
  };
}

function intersect(left: Rect, right: Rect): Rect | null {
  const x = Math.max(left.x, right.x); const y = Math.max(left.y, right.y);
  const farX = Math.min(left.x + left.width, right.x + right.width);
  const farY = Math.min(left.y + left.height, right.y + right.height);
  return farX > x && farY > y ? { x, y, width: farX - x, height: farY - y } : null;
}

function clip(value: Rect, bounds: readonly Rect[]): Rect | null {
  let current: Rect | null = value;
  for (const bound of bounds) {
    if (current === null) return null;
    current = intersect(current, bound);
  }
  return current;
}

function unionArea(rectangles: readonly Rect[]): number {
  const xs = [...new Set(rectangles.flatMap((item) => [item.x, item.x + item.width]))].sort((a, b) => a - b);
  let area = 0;
  for (let index = 0; index + 1 < xs.length; index += 1) {
    const left = xs[index]!; const right = xs[index + 1]!;
    if (right <= left) continue;
    const spans = rectangles.filter((item) => item.x < right && item.x + item.width > left)
      .map((item) => [item.y, item.y + item.height] as const).sort((a, b) => a[0] - b[0]);
    let height = 0; let start: number | null = null; let end = 0;
    for (const [nextStart, nextEnd] of spans) {
      if (start === null) { start = nextStart; end = nextEnd; continue; }
      if (nextStart > end) { height += end - start; start = nextStart; end = nextEnd; }
      else end = Math.max(end, nextEnd);
    }
    if (start !== null) height += end - start;
    area += (right - left) * height;
  }
  return area;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(',')}}`;
}

export function validateOpticalAdmission(value: unknown, rawBytes?: Uint8Array): OpticalAdmissionResult {
  const raw = parseRaw(value);
  const viewport: Rect = { x: 0, y: 0, width: raw.viewport.width, height: raw.viewport.height };
  const lanes: Record<Lane, Rect[]> = { Q: [], I: [] };
  for (const member of raw.members) {
    const visible = member.computed.display !== 'none'
      && !['hidden', 'collapse'].includes(member.computed.visibility)
      && member.computed.opacity > 0 && !member.computed.occluded;
    if (!visible) continue;
    const inputs = member.kind === 'text' ? member.lineFragments : [member.nativeBounds!];
    for (const input of inputs) {
      const clipped = clip(input, [viewport, ...member.clippingChain]);
      if (clipped !== null) lanes[member.lane].push(clipped);
    }
  }
  const qArea = unionArea(lanes.Q); const iArea = unionArea(lanes.I);
  if (iArea === 0) throw new Error('I area must be non-zero');
  const ratio = qArea / iArea;
  const representative = (raw.viewport.width === 1280 && raw.viewport.height === 900)
    || (raw.viewport.width === 390 && raw.viewport.height === 844);
  const threshold = representative ? (raw.state === 'initial' ? 1.25 : 2) : null;
  return {
    schema: OPTICAL_RESULT_SCHEMA, viewport: raw.viewport, state: raw.state,
    rawSha256: createHash('sha256').update(rawBytes ?? `${canonical(value)}\n`).digest('hex'),
    captureSha256: raw.captureSha256, qArea, iArea, ratio, threshold,
    pass: threshold === null ? null : ratio >= threshold,
    memberInventory: raw.members.map((member) => ({
      id: member.id, lane: member.lane, kind: member.kind,
      fragmentCount: member.kind === 'text' ? member.lineFragments.length : 1,
    })),
  };
}
