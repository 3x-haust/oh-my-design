import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { piDigest, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';
import { canonicalJson, sha256 } from '../ref/board-artifacts.ts';
import { readContainedRegularFile } from '../ref/reference-selection.ts';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { signNativeObservation, verifyNativeObservation } from '../runtime/self-signed-activation.ts';

const SCHEMA = 'qualitative-feedback-v1';
const POINTER = '.omd/qualitative-feedback.json';
const DIRECTORY = '.omd/qualitative-feedback';
const fail = (reason: string): never => { throw new Error(`QUALITATIVE_FEEDBACK: ${reason}`); };
const bytesAt = (root: string, path: string) => readContainedRegularFile(root, path, 'qualitative feedback');
function exact(row: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(row).sort().join() !== [...keys].sort().join()) fail('fields');
}
function imageInput(value: unknown) {
  const row = piRecord(value, 'feedback-image');
  exact(row, ['path', 'sha256', 'viewport', 'state']);
  if (row.viewport !== 'desktop' && row.viewport !== 'mobile') fail('viewport');
  return { path: piText(row.path, 'feedback-path'), sha256: piDigest(row.sha256, 'feedback-sha'),
    viewport: row.viewport as 'desktop' | 'mobile', state: piText(row.state, 'feedback-state') };
}
function parseInput(value: unknown) {
  const row = piRecord(value, 'qualitative-feedback');
  exact(row, ['schema', 'requestSha256', 'origin', 'text', 'interpretation', 'images']);
  if (row.schema !== 'qualitative-feedback-input-v1' || row.origin !== 'reported') fail('schema or origin');
  if (!Array.isArray(row.images) || row.images.length === 0 || row.images.length > 8) return fail('images');
  return { schema: row.schema, requestSha256: piDigest(row.requestSha256, 'feedback-request'),
    origin: 'reported' as const, text: piText(row.text, 'feedback-text'),
    interpretation: piText(row.interpretation, 'feedback-interpretation'), images: row.images.map(imageInput) };
}
export function publishQualitativeFeedback(root: string, value: unknown, writer: ProjectWriteAdapter) {
  const input = parseInput(value);
  const originals = input.images.map(image => {
    const bytes = bytesAt(root, image.path);
    if (sha256(bytes) !== image.sha256) fail('image digest');
    const png = PNG.sync.read(bytes);
    if (png.width < 1 || png.height < 1) fail('image dimensions');
    return { image, bytes, width: png.width, height: png.height };
  });
  const images = originals.map(({ image, width, height }) => ({
    ...image, path: `${DIRECTORY}/images/${image.sha256}.png`, width, height,
  }));
  const record = { schema: SCHEMA, requestSha256: input.requestSha256, origin: input.origin,
    text: input.text, interpretation: input.interpretation, images,
    authority: 'none', use: 'comparison-only', satisfaction: 'unknown' };
  const signature = signNativeObservation(root, SCHEMA, sha256(canonicalJson(record)));
  const bytes = Buffer.from(canonicalJson({ ...record, signature }));
  const digest = sha256(bytes);
  for (const { image, bytes: png } of originals) writer.writeContentAddressed(`${DIRECTORY}/images/${image.sha256}.png`, png);
  const path = `${DIRECTORY}/records/${digest}.json`;
  writer.writeContentAddressed(path, bytes);
  writer.write(POINTER, canonicalJson({ schema: SCHEMA, path, sha256: digest }));
  return { path, sha256: digest, authority: 'none' as const };
}
export function qualitativeFeedbackProjection(root: string, requestSha256?: string, blind = false) {
  if (!existsSync(join(root, POINTER))) return null;
  const pointer = piRecord(JSON.parse(bytesAt(root, POINTER).toString('utf8')), 'feedback-pointer');
  exact(pointer, ['schema', 'path', 'sha256']);
  const digest = piDigest(pointer.sha256, 'feedback-record-sha');
  if (pointer.schema !== SCHEMA || pointer.path !== `${DIRECTORY}/records/${digest}.json`) fail('pointer');
  const bytes = bytesAt(root, pointer.path as string);
  if (sha256(bytes) !== digest) fail('record digest');
  const { signature, ...record } = piRecord(JSON.parse(bytes.toString('utf8')), 'feedback-record');
  exact(record, ['schema', 'requestSha256', 'origin', 'text', 'interpretation', 'images', 'authority', 'use', 'satisfaction']);
  if (record.schema !== SCHEMA || record.origin !== 'reported' || record.authority !== 'none'
    || record.use !== 'comparison-only' || record.satisfaction !== 'unknown'
    || !verifyNativeObservation(root, SCHEMA, sha256(canonicalJson(record)), piText(signature, 'feedback-signature'))) fail('record authority');
  if (requestSha256 !== undefined && record.requestSha256 !== requestSha256) fail('request scope');
  if (!Array.isArray(record.images) || record.images.length === 0) return fail('images');
  const renders = record.images.map(value => {
    const image = piRecord(value, 'feedback-snapshot');
    const digest = piDigest(image.sha256, 'feedback-image-sha');
    if (image.path !== `${DIRECTORY}/images/${digest}.png`) fail('image path');
    const bytes = bytesAt(root, image.path as string);
    if (sha256(bytes) !== digest) fail('image digest');
    const png = PNG.sync.read(bytes);
    if (png.width !== image.width || png.height !== image.height) fail('dimensions');
    return { role: 'reported-feedback-baseline', viewport: image.viewport,
      ...(blind ? {} : { state: image.state }),
      width: png.width, height: png.height, captureSha256: digest, pngBase64: bytes.toString('base64') };
  });
  const context = { schema: SCHEMA, sha256: digest, authority: 'none', use: 'comparison-only',
    origin: 'reported', satisfaction: 'unknown',
    ...(blind ? {} : { text: piText(record.text, 'feedback-text'),
      interpretation: piText(record.interpretation, 'feedback-interpretation') }) };
  return { context, renders };
}
export function qualitativeFeedbackMessage(root: string, requestSha256?: string) {
  const feedback = qualitativeFeedbackProjection(root, requestSha256);
  if (!feedback) return undefined;
  return { customType: 'omd-qualitative-feedback', display: false, content: [
    { type: 'text' as const, text: JSON.stringify(feedback.context) },
    ...feedback.renders.flatMap(({ pngBase64, ...label }) => [
      { type: 'text' as const, text: JSON.stringify(label) },
      { type: 'image' as const, data: pngBase64, mimeType: 'image/png' },
    ]),
  ] };
}
