import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

const SCHEMA = 'omd-figma-derived-artifact-v1';
const RECEIPT_SUFFIX = '.omd.json';

type ArtifactKind = 'export' | 'render';
type JsonRecord = object;

export type FigmaArtifactReceiptInput = {
  readonly kind: ArtifactKind;
  readonly frameId: string;
  readonly snapshotBytes: Uint8Array;
  readonly pngBytes: Uint8Array;
};

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function record(value: unknown): JsonRecord | undefined {
  return value === null || typeof value !== 'object' || Array.isArray(value) ? undefined : value;
}

function field(value: JsonRecord, key: string): unknown {
  return Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

function safeFrameId(frameId: string): string {
  return frameId.replaceAll(/[:/]/g, '_');
}

function snapshotMetadata(bytes: Uint8Array): { readonly fileKey: string; readonly capturedAt: string } {
  const value: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
  const snapshot = record(value);
  const fileKey = snapshot === undefined ? undefined : field(snapshot, 'fileKey');
  const capturedAt = snapshot === undefined ? undefined : field(snapshot, 'capturedAt');
  if (typeof fileKey !== 'string' || typeof capturedAt !== 'string') throw new Error('Figma snapshot metadata is invalid');
  return { fileKey, capturedAt };
}

export function figmaArtifactReceipt(input: FigmaArtifactReceiptInput): string {
  const snapshot = snapshotMetadata(input.snapshotBytes);
  return `${JSON.stringify({
    schema: SCHEMA,
    kind: input.kind,
    frameId: input.frameId,
    safeId: safeFrameId(input.frameId),
    fileKey: snapshot.fileKey,
    snapshotSha256: digest(input.snapshotBytes),
    pngSha256: digest(input.pngBytes),
    createdAt: snapshot.capturedAt,
  })}\n`;
}

function regular(path: string): boolean {
  try {
    const metadata = lstatSync(path);
    return metadata.isFile() && !metadata.isSymbolicLink();
  } catch {
    return false;
  }
}

function exactReceipt(
  bytes: Buffer,
  expected: { readonly kind: ArtifactKind; readonly safeId: string; readonly snapshotDigest?: string; readonly pngDigest: string },
): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return false;
  }
  const receipt = record(parsed);
  if (receipt === undefined) return false;
  const keys = Object.keys(receipt).sort().join(',');
  if (keys !== 'createdAt,fileKey,frameId,kind,pngSha256,safeId,schema,snapshotSha256') return false;
  const frameId = field(receipt, 'frameId');
  const snapshotSha256 = field(receipt, 'snapshotSha256');
  return field(receipt, 'schema') === SCHEMA
    && field(receipt, 'kind') === expected.kind
    && typeof frameId === 'string'
    && safeFrameId(frameId) === expected.safeId
    && field(receipt, 'safeId') === expected.safeId
    && typeof field(receipt, 'fileKey') === 'string'
    && typeof field(receipt, 'createdAt') === 'string'
    && typeof snapshotSha256 === 'string'
    && (expected.snapshotDigest === undefined || snapshotSha256 === expected.snapshotDigest)
    && field(receipt, 'pngSha256') === expected.pngDigest
    && bytes.equals(Buffer.from(`${JSON.stringify(parsed)}\n`));
}

export function figmaArtifactMatchesReceipt(
  pngPath: string,
  kind: ArtifactKind,
  snapshotBytes?: Uint8Array,
): boolean {
  const receiptPath = `${pngPath}${RECEIPT_SUFFIX}`;
  if (!regular(pngPath) || !regular(receiptPath)) return false;
  const pngBytes = readFileSync(pngPath);
  return exactReceipt(readFileSync(receiptPath), {
    kind,
    safeId: basename(pngPath, '.png'),
    pngDigest: digest(pngBytes),
    ...(snapshotBytes === undefined ? {} : { snapshotDigest: digest(snapshotBytes) }),
  });
}
