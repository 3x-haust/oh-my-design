import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { piDigest, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';
import type { AdaptiveRouteRecord } from '../route/adaptive-flow-domain.ts';
import { parseFileKey } from '../figma/client.ts';

const SCHEMA = 'consulted-references-v2';
const LEGACY_SCHEMA = 'consulted-references-v1';
const INPUT_SCHEMA = 'consulted-references-input-v2';
const LEGACY_INPUT_SCHEMA = 'consulted-references-input-v1';
const POINTER = '.omd/consulted-references.json';
const DIRECTORY = '.omd/consulted-references';
const fail = (reason: string): never => { throw new Error(`CONSULTED_REFERENCES: ${reason}`); };
const bytesAt = (root: string, path: string) => readContainedRegularFile(root, path, 'consulted references');

type ReferenceRole = 'primary' | 'supplemental';
export type ConsultedReferenceState = 'default' | 'hover' | 'focus' | 'pressed' | 'open';

type ParsedImage = Readonly<{
  path: string;
  sha256: string;
  sourceUrl: string;
  role: ReferenceRole;
  component: string;
  state: ConsultedReferenceState;
}>;

function exact(row: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(row).sort().join() !== [...keys].sort().join()) fail('fields');
}

function sourceUrl(value: unknown): string {
  const text = piText(value, 'consulted-reference-source-url');
  let parsed: URL;
  try { parsed = new URL(text); } catch { return fail('source URL'); }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.hostname === '') {
    fail('source URL');
  }
  return text;
}

function role(value: unknown): ReferenceRole {
  if (value !== 'primary' && value !== 'supplemental') return fail('role');
  return value;
}

function component(value: unknown): string {
  const name = piText(value, 'consulted-reference-component');
  if (name.length > 160 || name.trim() !== name
    || !/^[\p{L}\p{N}][\p{L}\p{N} _.()-]*$/u.test(name)) fail('component');
  return name;
}

function state(value: unknown): ConsultedReferenceState {
  if (value !== 'default' && value !== 'hover' && value !== 'focus'
    && value !== 'pressed' && value !== 'open') return fail('state');
  return value;
}

function imageInput(value: unknown, legacy: boolean): ParsedImage {
  const row = piRecord(value, 'consulted-reference-image');
  const expected = legacy
    ? ['path', 'sha256', 'sourceUrl', 'role']
    : ['path', 'sha256', 'sourceUrl', 'role', 'component',
      ...(Object.hasOwn(row, 'state') ? ['state'] : [])];
  exact(row, expected);
  return {
    path: piText(row.path, 'consulted-reference-path'),
    sha256: piDigest(row.sha256, 'consulted-reference-sha'),
    sourceUrl: sourceUrl(row.sourceUrl),
    role: role(row.role),
    component: legacy ? 'page' : component(row.component),
    state: legacy || row.state === undefined ? 'default' : state(row.state),
  };
}

function validateImageSet(images: readonly ParsedImage[]): void {
  if (images.length === 0 || images.length > 8) fail('images');
  if (images.filter(image => image.role === 'primary').length !== 1) fail('exactly one primary');
  if (new Set(images.map(image => image.sha256)).size !== images.length) fail('duplicate image');
}

function parseInput(value: unknown) {
  const row = piRecord(value, 'consulted-references');
  exact(row, ['schema', 'requestSha256', 'images']);
  const legacy = row.schema === LEGACY_INPUT_SCHEMA;
  if (!legacy && row.schema !== INPUT_SCHEMA) fail('schema');
  if (!Array.isArray(row.images)) return fail('images');
  const images = row.images.map(image => imageInput(image, legacy));
  validateImageSet(images);
  return {
    schema: INPUT_SCHEMA,
    requestSha256: piDigest(row.requestSha256, 'consulted-references-request'),
    images,
  };
}

function decodePng(bytes: Buffer): { width: number; height: number } {
  let png: PNG;
  try { png = PNG.sync.read(bytes, { checkCRC: true }); } catch { return fail('image PNG'); }
  if (!Number.isSafeInteger(png.width) || png.width < 1
    || !Number.isSafeInteger(png.height) || png.height < 1) {
    fail('image dimensions');
  }
  return { width: png.width, height: png.height };
}

export function publishConsultedReferences(
  root: string,
  value: unknown,
  writer: ProjectWriteAdapter,
) {
  const input = parseInput(value);
  const originals = input.images.map(image => {
    const bytes = bytesAt(root, image.path);
    if (sha256(bytes) !== image.sha256) fail('image digest');
    const dimensions = decodePng(bytes);
    return { image, bytes, ...dimensions };
  });
  const images = originals.map(({ image, width, height }) => ({
    path: `${DIRECTORY}/images/${image.sha256}.png`,
    sha256: image.sha256,
    sourceUrl: image.sourceUrl,
    role: image.role,
    component: image.component,
    state: image.state,
    width,
    height,
  }));
  const record = {
    schema: SCHEMA,
    requestSha256: input.requestSha256,
    origin: 'reported',
    authority: 'none',
    use: 'comparison-only',
    approval: 'not-approved',
    selection: 'not-selected',
    satisfaction: 'unknown',
    images,
  };
  const signature = signNativeObservation(root, SCHEMA, sha256(canonicalJson(record)));
  const recordBytes = Buffer.from(canonicalJson({ ...record, signature }));
  const digest = sha256(recordBytes);
  const path = `${DIRECTORY}/records/${digest}.json`;

  for (const { image, bytes } of originals) {
    writer.writeContentAddressed(`${DIRECTORY}/images/${image.sha256}.png`, bytes);
  }
  writer.writeContentAddressed(path, recordBytes);
  writer.write(POINTER, canonicalJson({ schema: SCHEMA, path, sha256: digest }));
  return { path, sha256: digest, authority: 'none' as const };
}

export function consultedReferenceProjection(root: string, requestSha256?: string) {
  if (!existsSync(join(root, POINTER))) return null;
  const pointerBytes = bytesAt(root, POINTER);
  let pointerValue: unknown;
  try { pointerValue = JSON.parse(pointerBytes.toString('utf8')); } catch { return fail('pointer JSON'); }
  const pointer = piRecord(pointerValue, 'consulted-references-pointer');
  exact(pointer, ['schema', 'path', 'sha256']);
  const digest = piDigest(pointer.sha256, 'consulted-references-record-sha');
  if ((pointer.schema !== SCHEMA && pointer.schema !== LEGACY_SCHEMA)
    || pointer.path !== `${DIRECTORY}/records/${digest}.json`) fail('pointer');

  const recordBytes = bytesAt(root, piText(pointer.path, 'consulted-references-record-path'));
  if (sha256(recordBytes) !== digest) fail('record digest');
  let recordValue: unknown;
  try { recordValue = JSON.parse(recordBytes.toString('utf8')); } catch { return fail('record JSON'); }
  const signed = piRecord(recordValue, 'consulted-references-record');
  exact(signed, [
    'schema',
    'requestSha256',
    'origin',
    'authority',
    'use',
    'approval',
    'selection',
    'satisfaction',
    'images',
    'signature',
  ]);
  if (recordBytes.toString('utf8') !== canonicalJson(signed)) fail('record encoding');
  const { signature, ...record } = signed;
  const legacy = record.schema === LEGACY_SCHEMA;
  if ((!legacy && record.schema !== SCHEMA)
    || record.origin !== 'reported'
    || record.authority !== 'none'
    || record.use !== 'comparison-only'
    || record.approval !== 'not-approved'
    || record.selection !== 'not-selected'
    || record.satisfaction !== 'unknown') {
    fail('record authority');
  }
  const recordRequest = piDigest(record.requestSha256, 'consulted-references-request');
  if (!verifyNativeObservation(
    root,
    legacy ? LEGACY_SCHEMA : SCHEMA,
    sha256(canonicalJson(record)),
    piText(signature, 'consulted-references-signature'),
  )) {
    fail('record signature');
  }
  if (requestSha256 !== undefined && recordRequest !== requestSha256) fail('request scope');
  if (!Array.isArray(record.images)) return fail('images');

  const parsedImages = record.images.map(value => {
    const image = piRecord(value, 'consulted-reference-snapshot');
    exact(image, legacy
      ? ['path', 'sha256', 'sourceUrl', 'role', 'width', 'height']
      : ['path', 'sha256', 'sourceUrl', 'role', 'component', 'state', 'width', 'height']);
    const parsed = {
      path: piText(image.path, 'consulted-reference-path'),
      sha256: piDigest(image.sha256, 'consulted-reference-image-sha'),
      sourceUrl: sourceUrl(image.sourceUrl),
      role: role(image.role),
      component: legacy ? 'page' : component(image.component),
      state: legacy ? 'default' as const : state(image.state),
    };
    if (typeof image.width !== 'number' || !Number.isSafeInteger(image.width) || image.width < 1
      || typeof image.height !== 'number' || !Number.isSafeInteger(image.height) || image.height < 1) {
      return fail('image dimensions');
    }
    return {
      ...parsed,
      width: image.width,
      height: image.height,
    };
  });
  validateImageSet(parsedImages);

  const renders = parsedImages.map(image => {
    if (image.path !== `${DIRECTORY}/images/${image.sha256}.png`) fail('image path');
    const bytes = bytesAt(root, image.path);
    if (sha256(bytes) !== image.sha256) fail('image digest');
    const png = decodePng(bytes);
    if (png.width !== image.width || png.height !== image.height) fail('image dimensions');
    return {
      role: 'consulted-external-original' as const,
      referenceRole: image.role,
      component: image.component,
      state: image.state,
      width: png.width,
      height: png.height,
      captureSha256: image.sha256,
      pngBase64: bytes.toString('base64'),
    };
  });
  return {
    context: {
      schema: SCHEMA,
      sha256: digest,
      origin: 'reported' as const,
      authority: 'none' as const,
      use: 'comparison-only' as const,
    },
    renders,
  };
}

/** Structural Figma URL detection only; this never classifies natural-language task prose. */
export function requestSuppliesFigmaTarget(request: string): boolean {
  const urls = request.match(/https?:\/\/[^\s<>"'`]+/gu) ?? [];
  return urls.some(candidate => {
    const value = candidate.replace(/[),.;!?]+$/u, '');
    let url: URL;
    try { url = new URL(value); } catch { return false; }
    if ((url.hostname !== 'figma.com' && url.hostname !== 'www.figma.com')
      || !/^\/(?:file|design)\//u.test(url.pathname)) return false;
    try { parseFileKey(url.href); return true; } catch { return false; }
  });
}

export function requiresConsultedPrimaryOriginal(
  route: Pick<AdaptiveRouteRecord, 'request' | 'sourceContract'>,
): boolean {
  return !requestSuppliesFigmaTarget(route.request)
    && route.sourceContract.referenceDiscovery.taskNeed !== 'copy-only-edit';
}

export function requireConsultedPrimaryOriginal(
  root: string,
  route: Pick<AdaptiveRouteRecord, 'projectMode' | 'request' | 'sourceContract'>,
): void {
  const projection = consultedReferenceProjection(root, sha256(route.request));
  if (!requiresConsultedPrimaryOriginal(route)) return;
  if (projection === null || projection.renders.filter(render => render.referenceRole === 'primary').length !== 1) {
    const error = new Error('CONSULTED_PRIMARY_ORIGINAL_REQUIRED: publish one request-scoped primary whole original with omd ref context before model-led completion.');
    Object.defineProperty(error, 'code', { value: 'CONSULTED_PRIMARY_ORIGINAL_REQUIRED', enumerable: true });
    throw error;
  }
}
