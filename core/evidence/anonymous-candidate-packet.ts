import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { validateSettledCaptureReceipt } from './settled-capture-receipt.ts';
import { parseSettledCaptureReceipt } from './settled-capture-schema.ts';
import {
  OPTICAL_RESULT_SCHEMA,
  validateOpticalAdmission,
  type OpticalAdmissionResult,
} from './optical-admission.ts';

export const ANONYMOUS_CANDIDATE_PACKET_SCHEMA = 'anonymous-candidate-review-packet-v1' as const;

export type AnonymousPacketFinding = Readonly<{
  id:
    | 'PACKET_MALFORMED'
    | 'PACKET_ARTIFACT_INVALID'
    | 'PACKET_PRIMARY_COVERAGE_INVALID'
    | 'PACKET_SUPPLEMENT_COVERAGE_INVALID'
    | 'PACKET_RECEIPT_PROJECTION_INVALID'
    | 'PACKET_CHECK_RESULT_INVALID'
    | 'PACKET_OPTICAL_BINDING_INVALID'
    | 'PACKET_INTERACTION_BINDING_INVALID'
    | 'PACKET_IDENTITY_LEAK';
  path: string;
  message: string;
}>;

type Artifact = Readonly<{ path: string; sha256: string }>;
type Viewport = Readonly<{ width: number; height: number }>;
type State = 'initial' | 'settled';
type Packet = Readonly<{
  schema: typeof ANONYMOUS_CANDIDATE_PACKET_SCHEMA;
  options: readonly Readonly<{
    slotId: string;
    primaries: readonly Readonly<{
      evidenceId: string;
      state: State;
      viewport: Viewport;
      screenshot: Artifact;
      receipt: Artifact;
      receiptProjection: unknown;
      check: Artifact;
      checkResult: readonly unknown[];
    }>[];
    supplements: readonly Readonly<{
      evidenceId: string;
      state: State;
      viewport: Viewport;
      fullPage: true;
      screenshot: Artifact;
    }>[];
    optical: readonly Readonly<{
      evidenceId: string;
      state: State;
      viewport: Viewport;
      raw: Artifact;
      report: Artifact;
      reportProjection: OpticalAdmissionResult;
    }>[];
    interaction: Readonly<{ artifact: Artifact; projection: unknown }>;
  }>[];
}>;

const HEX = /^[a-f0-9]{64}$/;
const OPAQUE_ID = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const PNG_SIGNATURE = '89504e470d0a1a0a';
const REPRESENTATIVE = ['1280x900:initial', '1280x900:settled', '390x844:initial', '390x844:settled'];
const REQUIRED = [
  ...REPRESENTATIVE,
  '320x844:initial', '320x844:settled', '195x422:initial', '195x422:settled',
];
const FORBIDDEN_KEYS = new Set(['candidateId', 'axis', 'source', 'authorship', 'rationale', 'priorScore', 'scores']);
const FORBIDDEN_VALUES = /(?:embedded-orientation|queue-led-header|lateral-transfer|vertical-reclaim|h2v9|w8c3|lap[ -]?(?:10|11)|prior score|author rationale)/i;

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Reflect.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
  const data = value as Record<string, unknown>;
  const actual = Object.keys(data).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} keys must be exactly ${expected.join(', ')}`);
  }
  return data;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be non-empty text`);
  return value;
}

function id(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!OPAQUE_ID.test(parsed)) throw new Error(`${label} must be an opaque lowercase identifier`);
  return parsed;
}

function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

function viewport(value: unknown, label: string): Viewport {
  const data = exact(value, ['width', 'height'], label);
  return { width: number(data.width, `${label}.width`), height: number(data.height, `${label}.height`) };
}

function artifact(value: unknown, label: string): Artifact {
  const data = exact(value, ['path', 'sha256'], label);
  const sha256 = text(data.sha256, `${label}.sha256`);
  if (!HEX.test(sha256)) throw new Error(`${label}.sha256 must be lowercase SHA-256`);
  return { path: text(data.path, `${label}.path`), sha256 };
}

function state(value: unknown, label: string): State {
  if (value !== 'initial' && value !== 'settled') throw new Error(`${label} must be initial or settled`);
  return value;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(',')}}`;
}

function same(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right); }

function readArtifact(root: string, value: Artifact): Buffer {
  if (isAbsolute(value.path)) throw new Error(`artifact path must be relative: ${value.path}`);
  const base = realpathSync(resolve(root));
  const path = resolve(base, value.path);
  const rel = relative(base, path);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`artifact path escapes root: ${value.path}`);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) throw new Error(`artifact is not a contained regular file: ${value.path}`);
  const data = readFileSync(path);
  if (createHash('sha256').update(data).digest('hex') !== value.sha256) throw new Error(`artifact hash mismatch: ${value.path}`);
  return data;
}

function pngDimensions(data: Buffer): Viewport {
  if (data.length < 24 || data.subarray(0, 8).toString('hex') !== PNG_SIGNATURE || data.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('artifact must be a PNG with an IHDR header');
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function parsePacket(value: unknown): Packet {
  const root = exact(value, ['schema', 'options'], 'packet');
  if (root.schema !== ANONYMOUS_CANDIDATE_PACKET_SCHEMA) throw new Error(`schema must be ${ANONYMOUS_CANDIDATE_PACKET_SCHEMA}`);
  const optionInputs = array(root.options, 'options');
  if (optionInputs.length < 1 || optionInputs.length > 2) throw new Error('options must contain one or two admitted choices');
  const slots = new Set<string>();
  const options = optionInputs.map((entry, optionIndex) => {
    const option = exact(entry, ['slotId', 'primaries', 'supplements', 'optical', 'interaction'], `options[${optionIndex}]`);
    const slotId = id(option.slotId, `options[${optionIndex}].slotId`);
    if (slots.has(slotId)) throw new Error(`duplicate slotId ${slotId}`); slots.add(slotId);
    const primaries = array(option.primaries, `options[${optionIndex}].primaries`).map((value, index) => {
      const item = exact(value, ['evidenceId', 'state', 'viewport', 'screenshot', 'receipt', 'receiptProjection', 'check', 'checkResult'], `options[${optionIndex}].primaries[${index}]`);
      return {
        evidenceId: id(item.evidenceId, `primary[${index}].evidenceId`), state: state(item.state, `primary[${index}].state`),
        viewport: viewport(item.viewport, `primary[${index}].viewport`), screenshot: artifact(item.screenshot, `primary[${index}].screenshot`),
        receipt: artifact(item.receipt, `primary[${index}].receipt`), receiptProjection: item.receiptProjection,
        check: artifact(item.check, `primary[${index}].check`), checkResult: array(item.checkResult, `primary[${index}].checkResult`),
      };
    });
    const supplements = array(option.supplements, `options[${optionIndex}].supplements`).map((value, index) => {
      const item = exact(value, ['evidenceId', 'state', 'viewport', 'fullPage', 'screenshot'], `options[${optionIndex}].supplements[${index}]`);
      if (item.fullPage !== true) throw new Error(`supplement[${index}].fullPage must be true`);
      return { evidenceId: id(item.evidenceId, `supplement[${index}].evidenceId`), state: state(item.state, `supplement[${index}].state`), viewport: viewport(item.viewport, `supplement[${index}].viewport`), fullPage: true as const, screenshot: artifact(item.screenshot, `supplement[${index}].screenshot`) };
    });
    const optical = array(option.optical, `options[${optionIndex}].optical`).map((value, index) => {
      const item = exact(value, ['evidenceId', 'state', 'viewport', 'raw', 'report', 'reportProjection'], `options[${optionIndex}].optical[${index}]`);
      return { evidenceId: id(item.evidenceId, `optical[${index}].evidenceId`), state: state(item.state, `optical[${index}].state`), viewport: viewport(item.viewport, `optical[${index}].viewport`), raw: artifact(item.raw, `optical[${index}].raw`), report: artifact(item.report, `optical[${index}].report`), reportProjection: item.reportProjection as OpticalAdmissionResult };
    });
    const interaction = exact(option.interaction, ['artifact', 'projection'], `options[${optionIndex}].interaction`);
    return { slotId, primaries, supplements, optical, interaction: { artifact: artifact(interaction.artifact, `options[${optionIndex}].interaction.artifact`), projection: interaction.projection } };
  });
  return { schema: ANONYMOUS_CANDIDATE_PACKET_SCHEMA, options };
}

function keyOf(value: { viewport: Viewport; state: State }): string { return `${value.viewport.width}x${value.viewport.height}:${value.state}`; }

function validateInteractionProjection(value: unknown): void {
  const data = exact(value, [
    'schema', 'widths', 'exactCopy', 'nodePreservation', 'containment', 'narrowFirstCrop',
    'focus', 'recovery', 'reducedMotion', 'noJs', 'clipboard', 'noVacancy', 'motion',
  ], 'interaction');
  if (data.schema !== 'candidate-interaction-summary-v1') throw new Error('interaction schema must be candidate-interaction-summary-v1');
  if (!same(data.widths, [1280, 390, 320, 195])) throw new Error('interaction widths must be exactly 1280, 390, 320, 195');
  for (const key of ['exactCopy', 'nodePreservation', 'containment', 'narrowFirstCrop', 'focus', 'recovery', 'reducedMotion', 'noJs', 'clipboard', 'noVacancy'] as const) {
    if (data[key] !== true) throw new Error(`interaction.${key} must be true`);
  }
  const motion = exact(data.motion, [
    'sceneCount', 'durationMs', 'easing', 'properties', 'reducedDurationMs',
    'layoutAnimated', 'typeAnimated', 'normalPass', 'reducedPass',
  ], 'interaction.motion');
  if (motion.sceneCount !== 1 || motion.durationMs !== 320
    || motion.easing !== 'cubic-bezier(0.22,1,0.36,1)'
    || !same(motion.properties, ['transform', 'opacity']) || motion.reducedDurationMs !== 0
    || motion.layoutAnimated !== false || motion.typeAnimated !== false
    || motion.normalPass !== true || motion.reducedPass !== true) {
    throw new Error('interaction motion must prove the exact single 320ms transform/opacity scene and zero-duration reduced equivalent');
  }
}

function leaks(value: unknown, path = 'packet', findings: AnonymousPacketFinding[] = []): AnonymousPacketFinding[] {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUES.test(value)) findings.push({ id: 'PACKET_IDENTITY_LEAK', path, message: 'anonymous packet contains prior, axis, or author identity text' });
    return findings;
  }
  if (Array.isArray(value)) { value.forEach((item, index) => leaks(item, `${path}[${index}]`, findings)); return findings; }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) findings.push({ id: 'PACKET_IDENTITY_LEAK', path: `${path}.${key}`, message: `forbidden identity field ${key}` });
      leaks(item, `${path}.${key}`, findings);
    }
  }
  return findings;
}

export function validateAnonymousCandidatePacket(root: string, value: unknown): AnonymousPacketFinding[] {
  const findings: AnonymousPacketFinding[] = [];
  const add = (id: AnonymousPacketFinding['id'], path: string, message: string): void => { findings.push({ id, path, message }); };
  let packet: Packet;
  try { packet = parsePacket(value); } catch (error) {
    return [{ id: 'PACKET_MALFORMED', path: 'packet', message: error instanceof Error ? error.message : String(error) }];
  }
  leaks(value, 'packet', findings);
  packet.options.forEach((option, optionIndex) => {
    const base = `options[${optionIndex}]`;
    const primaryKeys = option.primaries.map(keyOf).sort();
    if (!same(primaryKeys, [...REQUIRED].sort()) || new Set(option.primaries.map((item) => item.evidenceId)).size !== REQUIRED.length) {
      add('PACKET_PRIMARY_COVERAGE_INVALID', `${base}.primaries`, 'primary fixed evidence must contain unique initial/settled 1280x900, 390x844, 320x844, and 195x422 captures');
    }
    const supplementKeys = option.supplements.map(keyOf).sort();
    if (!same(supplementKeys, [...REQUIRED].sort()) || new Set(option.supplements.map((item) => item.evidenceId)).size !== REQUIRED.length) {
      add('PACKET_SUPPLEMENT_COVERAGE_INVALID', `${base}.supplements`, 'full-page supplements must contain unique initial/settled 1280, 390, 320, and 195 captures');
    }
    const primaryByKey = new Map(option.primaries.map((item) => [keyOf(item), item]));
    for (const [index, primary] of option.primaries.entries()) {
      const path = `${base}.primaries[${index}]`;
      try {
        const png = pngDimensions(readArtifact(root, primary.screenshot));
        if (!same(png, primary.viewport)) throw new Error(`PNG dimensions ${png.width}x${png.height} do not match viewport`);
      } catch (error) { add('PACKET_ARTIFACT_INVALID', `${path}.screenshot`, error instanceof Error ? error.message : String(error)); }
      try {
        const receiptBytes = readArtifact(root, primary.receipt);
        const receiptValue = JSON.parse(receiptBytes.toString('utf8')) as unknown;
        if (!same(receiptValue, primary.receiptProjection)) throw new Error('receipt projection is not the complete receipt bytes');
        const parsed = parseSettledCaptureReceipt(primary.receiptProjection);
        if (!same(parsed.screenshot.viewport, primary.viewport) || parsed.screenshot.path !== primary.screenshot.path || parsed.screenshot.sha256 !== primary.screenshot.sha256) {
          throw new Error('receipt projection does not bind the indexed screenshot and viewport');
        }
        const receiptFindings = validateSettledCaptureReceipt(root, primary.receiptProjection);
        if (receiptFindings.length !== 0) throw new Error(`receipt projection check is not empty: ${JSON.stringify(receiptFindings)}`);
      } catch (error) { add('PACKET_RECEIPT_PROJECTION_INVALID', `${path}.receiptProjection`, error instanceof Error ? error.message : String(error)); }
      try {
        const checkBytes = readArtifact(root, primary.check);
        if (checkBytes.toString('utf8') !== '[]' || primary.checkResult.length !== 0) throw new Error('check bytes and embedded result must both be exact []');
      } catch (error) { add('PACKET_CHECK_RESULT_INVALID', `${path}.check`, error instanceof Error ? error.message : String(error)); }
    }
    for (const [index, supplement] of option.supplements.entries()) {
      try {
        const png = pngDimensions(readArtifact(root, supplement.screenshot));
        if (png.width !== supplement.viewport.width || png.height < supplement.viewport.height) throw new Error('full-page PNG must preserve viewport width and extend at least its height');
      } catch (error) { add('PACKET_ARTIFACT_INVALID', `${base}.supplements[${index}].screenshot`, error instanceof Error ? error.message : String(error)); }
    }
    const opticalKeys = option.optical.map(keyOf).sort();
    if (!same(opticalKeys, [...REQUIRED].sort()) || new Set(option.optical.map((item) => item.evidenceId)).size !== REQUIRED.length) {
      add('PACKET_OPTICAL_BINDING_INVALID', `${base}.optical`, 'optical evidence must bind unique initial/settled 1280, 390, 320, and 195 results');
    }
    for (const [index, optical] of option.optical.entries()) {
      const path = `${base}.optical[${index}]`;
      try {
        const rawBytes = readArtifact(root, optical.raw);
        const reportBytes = readArtifact(root, optical.report);
        const reportValue = JSON.parse(reportBytes.toString('utf8')) as unknown;
        if (!same(reportValue, optical.reportProjection)) throw new Error('optical report projection is not the complete report bytes');
        const recomputed = validateOpticalAdmission(JSON.parse(rawBytes.toString('utf8')) as unknown, rawBytes);
        if (!same(recomputed, optical.reportProjection) || optical.reportProjection.schema !== OPTICAL_RESULT_SCHEMA
          || optical.reportProjection.rawSha256 !== optical.raw.sha256
          || !same(optical.reportProjection.viewport, optical.viewport) || optical.reportProjection.state !== optical.state) {
          throw new Error('optical report is stale, incomplete, or not bound to its raw input');
        }
        const representative = REPRESENTATIVE.includes(keyOf(optical));
        if ((representative && optical.reportProjection.pass !== true)
          || (!representative && (optical.reportProjection.threshold !== null || optical.reportProjection.pass !== null))) {
          throw new Error('representative optical admission must pass its floor and narrow diagnostic admission must remain unthresholded');
        }
        const primary = primaryByKey.get(keyOf(optical));
        if (primary === undefined || optical.reportProjection.captureSha256 !== primary.screenshot.sha256) throw new Error('optical report does not bind the primary screenshot bytes');
      } catch (error) { add('PACKET_OPTICAL_BINDING_INVALID', path, error instanceof Error ? error.message : String(error)); }
    }
    try {
      const interactionBytes = readArtifact(root, option.interaction.artifact);
      const interactionValue = JSON.parse(interactionBytes.toString('utf8')) as unknown;
      if (!same(interactionValue, option.interaction.projection)) throw new Error('interaction projection is not the complete artifact bytes');
      validateInteractionProjection(option.interaction.projection);
    } catch (error) { add('PACKET_INTERACTION_BINDING_INVALID', `${base}.interaction`, error instanceof Error ? error.message : String(error)); }
  });
  return findings;
}
