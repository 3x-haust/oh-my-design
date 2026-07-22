import { createHash } from 'node:crypto';
import { constants as fsConstants, closeSync, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { decodePng } from '../motion/energy.ts';
import { hasHostBoundLocalProjectWriteAuthority } from '../runtime/activation.ts';
import { requireStaticReviewReceiptAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import type { ArtDirectionDecision } from './schema.ts';

export const STATIC_DIRECTION_EVIDENCE_V1_SCHEMA = 'static-direction-evidence-v1' as const;
export const STATIC_REVIEW_RECEIPT_V1_SCHEMA = 'static-review-receipt-v1' as const;
type ObservedReceipt = { readonly path: string; readonly sha256: string };
type ReviewRole = 'signature' | 'narrative' | 'motionFit' | 'fidelity' | 'fallback' | 'blind';
type ReviewReceipt = { readonly path: string; readonly sha256: string; readonly role: ReviewRole; readonly actor: 'host-reviewer' | 'host-evaluator' };

export type StaticDirectionEvidenceV1 = {
  readonly schema: typeof STATIC_DIRECTION_EVIDENCE_V1_SCHEMA;
  readonly artDirectionHash: string;
  readonly motionDecision: 'none';
  readonly expected: { readonly artDirectionHash: string; readonly selectionSha256: string; readonly handoffSha256: string; readonly buildHash: string; readonly runId: string };
  readonly observed: { readonly runId: string; readonly buildHash: string; readonly selectionSha256: string; readonly handoffSha256: string; readonly observedSha256: string };
  readonly beatReceipt: unknown;
  readonly observations: { readonly desktop: { readonly capture: ObservedReceipt; readonly width: 1280; readonly height: 900 }; readonly mobile: { readonly capture: ObservedReceipt; readonly width: 390; readonly height: 844 }; readonly temporalSamples: { readonly desktop: readonly [ObservedReceipt, ObservedReceipt, ObservedReceipt]; readonly mobile: readonly [ObservedReceipt, ObservedReceipt, ObservedReceipt] } };
  readonly reviewReceipts: { readonly signature: ReviewReceipt; readonly narrative: ReviewReceipt; readonly motionFit: ReviewReceipt; readonly fidelity: ReviewReceipt; readonly fallback: ReviewReceipt; readonly blind: ReviewReceipt };
};

export class StaticDirectionEvidenceValidationError extends Error {
  override readonly name = 'StaticDirectionEvidenceValidationError';
  readonly reason: string;
  constructor(reason: string) { super(`static direction evidence is invalid: ${reason}`); this.reason = reason; }
}

const SHA256 = /^[a-f0-9]{64}$/;
const fail = (reason: string): never => { throw new StaticDirectionEvidenceValidationError(reason); };
function object(value: unknown, field: string): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(`${field} must be an object`); }
function array(value: unknown, field: string): readonly unknown[] { return Array.isArray(value) ? value : fail(`${field} must be an array`); }
function exact(value: Record<string, unknown>, keys: readonly string[], field: string): void { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${field} has unexpected keys`); }
function hash(value: unknown, field: string): string { return typeof value === 'string' && SHA256.test(value) ? value : fail(`${field} must be a lowercase SHA-256 hash`); }
function text(value: unknown, field: string): string { return typeof value === 'string' && value.trim() !== '' ? value : fail(`${field} must be non-empty text`); }
function stableProjectFile(root: string, value: unknown, field: string): { path: string; bytes: Buffer } {
  const projectPath = text(value, `${field}.path`);
  if (projectPath.includes('\0') || projectPath.includes('\\') || projectPath.startsWith('/') || /^[A-Za-z]:\//.test(projectPath) || projectPath.split('/').some((part) => !part || part === '.' || part === '..')) fail(`${field}.path must be a safe observation-root-relative path`);
  const path = resolve(root, projectPath);
  const outside = relative(root, path);
  if (!outside || outside.startsWith('..') || resolve(root, outside) !== path) fail(`${field}.path escapes the observation root`);
  let current = root;
  for (const part of projectPath.split('/').slice(0, -1)) {
    current = resolve(current, part);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`${field}.path has an unsafe ancestor`);
  }
  const entry = lstatSync(path);
  if (!entry.isFile() || entry.isSymbolicLink()) fail(`${field}.path must be a regular non-symlink file`);
  const descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    const before = lstatSync(path);
    if (!opened.isFile() || before.isSymbolicLink() || !before.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) fail(`${field}.path changed before read`);
    const bytes = readFileSync(descriptor);
    const after = lstatSync(path);
    if (after.isSymbolicLink() || !after.isFile() || opened.dev !== after.dev || opened.ino !== after.ino) fail(`${field}.path changed while read`);
    return { path, bytes };
  } finally { closeSync(descriptor); }
}
function receipt(root: string, value: unknown, field: string): ObservedReceipt {
  const observed = object(value, field); exact(observed, ['path', 'sha256'], field);
  const sha256 = hash(observed.sha256, `${field}.sha256`);
  const loaded = stableProjectFile(root, observed.path, field);
  if (loaded.bytes.length === 0 || createHash('sha256').update(loaded.bytes).digest('hex') !== sha256) fail(`${field}.path bytes do not match sha256`);
  try { decodePng(loaded.bytes); } catch { fail(`${field}.path must be a browser PNG capture`); }
  return { path: text(observed.path, `${field}.path`), sha256 };
}
function staticSlots(decision: Pick<ArtDirectionDecision, 'selectedStaticReferenceSlotIds' | 'selectedRegister'> | undefined): void {
  if (decision?.selectedStaticReferenceSlotIds === undefined) return;
  const minimum: Record<'quiet' | 'confident' | 'showpiece', number> = { quiet: 1, confident: 2, showpiece: 3 };
  if (decision.selectedStaticReferenceSlotIds.length < minimum[decision.selectedRegister]) fail(`none ${decision.selectedRegister} requires register-appropriate selected static slots`);
}
function observedHash(receipts: readonly ObservedReceipt[]): string { return createHash('sha256').update(JSON.stringify(receipts.map((receipt) => receipt.sha256))).digest('hex'); }
function reviewReceipt(root: string, invocation: ProjectRunInvocation, value: unknown, field: string, role: ReviewRole, expected: { artDirectionHash: string; buildHash: string; selectionSha256: string; handoffSha256: string; observedSha256: string }): ReviewReceipt {
  const receiptObject = object(value, field); exact(receiptObject, ['path', 'sha256'], field);
  const sha256 = hash(receiptObject.sha256, `${field}.sha256`);
  const loaded = stableProjectFile(root, receiptObject.path, field);
  if (loaded.bytes.length === 0 || createHash('sha256').update(loaded.bytes).digest('hex') !== sha256) fail(`${field}.path bytes do not match sha256`);
  requireStaticReviewReceiptAuthorization(invocation, root, loaded.bytes);
  let parsed: unknown;
  try { parsed = JSON.parse(loaded.bytes.toString('utf8')) as unknown; } catch { fail(`${field}.path must contain a JSON host review receipt`); }
  const payload = object(parsed, `${field}.payload`);
  exact(payload, ['schema', 'role', 'actor', 'verdict', 'artDirectionHash', 'buildHash', 'selectionSha256', 'handoffSha256', 'observedSha256'], `${field}.payload`);
  if (payload.schema !== STATIC_REVIEW_RECEIPT_V1_SCHEMA || payload.role !== role || (payload.actor !== 'host-reviewer' && payload.actor !== 'host-evaluator') || payload.verdict !== 'pass') fail(`${field} must be a passing host ${role} receipt`);
  for (const key of ['artDirectionHash', 'buildHash', 'selectionSha256', 'handoffSha256', 'observedSha256'] as const) if (hash(payload[key], `${field}.payload.${key}`) !== expected[key]) fail(`${field} is not bound to current ${key}`);
  return { path: text(receiptObject.path, `${field}.path`), sha256, role, actor: payload.actor as ReviewReceipt['actor'] };
}

/** Validates browser observations and independent host review/evaluator receipts; caller booleans cannot certify static direction. */
export function validateStaticDirectionEvidenceV1(value: unknown, decision?: Pick<ArtDirectionDecision, 'motionDecision' | 'selectedStaticReferenceSlotIds' | 'selectedRegister'> & { readonly buildHash?: string; readonly artDirectionHash?: string; readonly selectionSha256?: string; readonly handoffSha256?: string; readonly runId?: string; readonly observationRoot?: string; readonly invocation?: ProjectRunInvocation }): StaticDirectionEvidenceV1 {
  if (decision?.invocation === undefined || decision.observationRoot === undefined || !hasHostBoundLocalProjectWriteAuthority(decision.invocation, decision.observationRoot)) fail('a fresh host invocation bound to the observation root is required');
  const current = decision as Required<NonNullable<typeof decision>>;
  const observationRoot = resolve(current.observationRoot);
  const rootStat = lstatSync(observationRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('observation root must be a real directory');
  const evidence = object(value, 'evidence');
  exact(evidence, ['schema', 'artDirectionHash', 'motionDecision', 'expected', 'observed', 'beatReceipt', 'observations', 'reviewReceipts'], 'evidence');
  if (evidence.schema !== STATIC_DIRECTION_EVIDENCE_V1_SCHEMA || evidence.motionDecision !== 'none') fail('unsupported static none evidence');
  if (current.motionDecision !== 'none') fail('cannot bind static evidence to a one decision');
  const artDirectionHash = hash(evidence.artDirectionHash, 'artDirectionHash');
  const expected = object(evidence.expected, 'expected'); exact(expected, ['artDirectionHash', 'selectionSha256', 'handoffSha256', 'buildHash', 'runId'], 'expected');
  const expectedValues = { artDirectionHash: hash(expected.artDirectionHash, 'expected.artDirectionHash'), selectionSha256: hash(expected.selectionSha256, 'expected.selectionSha256'), handoffSha256: hash(expected.handoffSha256, 'expected.handoffSha256'), buildHash: hash(expected.buildHash, 'expected.buildHash'), runId: text(expected.runId, 'expected.runId') };
  if (expectedValues.artDirectionHash !== artDirectionHash) fail('expected art direction does not match evidence art direction');
  for (const key of ['artDirectionHash', 'selectionSha256', 'handoffSha256', 'buildHash', 'runId'] as const) if (current[key] !== expectedValues[key]) fail(`expected ${key} is not current`);
  staticSlots(current);
  const observed = object(evidence.observed, 'observed'); exact(observed, ['runId', 'buildHash', 'selectionSha256', 'handoffSha256', 'observedSha256'], 'observed');
  const observedValues = { runId: text(observed.runId, 'observed.runId'), buildHash: hash(observed.buildHash, 'observed.buildHash'), selectionSha256: hash(observed.selectionSha256, 'observed.selectionSha256'), handoffSha256: hash(observed.handoffSha256, 'observed.handoffSha256'), observedSha256: hash(observed.observedSha256, 'observed.observedSha256') };
  for (const key of ['runId', 'buildHash', 'selectionSha256', 'handoffSha256'] as const) if (observedValues[key] !== expectedValues[key]) fail('observed lineage does not match expected current lineage');
  const beatReceipt = object(evidence.beatReceipt, 'beatReceipt'); exact(beatReceipt, ['schema', 'artDirectionHash', 'copyDeckSha256', 'beatIds', 'renderedBeats', 'captureViewports'], 'beatReceipt');
  if (beatReceipt.schema !== 'rendered-beat-receipt-v1' || hash(beatReceipt.artDirectionHash, 'beatReceipt.artDirectionHash') !== artDirectionHash || !Array.isArray(beatReceipt.beatIds) || !beatReceipt.beatIds.every((id) => typeof id === 'string' && /^B-\d+$/.test(id)) || new Set(beatReceipt.beatIds).size !== beatReceipt.beatIds.length || !Array.isArray(beatReceipt.renderedBeats) || !Array.isArray(beatReceipt.captureViewports)) fail('beatReceipt is not a canonical current Beat receipt');
  hash(beatReceipt.copyDeckSha256, 'beatReceipt.copyDeckSha256');
  const beatIds = new Set(beatReceipt.beatIds as string[]);
  const viewports = new Set(['1280x900', '390x844']);
  const captureViewports = beatReceipt.captureViewports as unknown[];
  const renderedBeats = beatReceipt.renderedBeats as unknown[];
  if (captureViewports.length !== 2 || new Set(captureViewports.map((viewport) => {
    const candidate = object(viewport, 'beatReceipt.captureViewports[]');
    return `${candidate.width}x${candidate.height}`;
  })).size !== 2 || !captureViewports.every((viewport) => {
    const candidate = object(viewport, 'beatReceipt.captureViewports[]');
    return viewports.has(`${candidate.width}x${candidate.height}`);
  })) fail('beatReceipt must bind exactly the fixed desktop and mobile viewports');
  const observedBeats = renderedBeats.map((entry, index) => {
    const beat = object(entry, `beatReceipt.renderedBeats[${index}]`);
    exact(beat, ['id', 'boundary', 'distinctRegions', 'ancestorBeatIds', 'rendered', 'observedViewport'], `beatReceipt.renderedBeats[${index}]`);
    const viewport = object(beat.observedViewport, `beatReceipt.renderedBeats[${index}].observedViewport`);
    exact(viewport, ['width', 'height'], `beatReceipt.renderedBeats[${index}].observedViewport`);
    if (typeof beat.id !== 'string' || !beatIds.has(beat.id) || beat.boundary !== true || beat.distinctRegions !== 0 || beat.rendered !== true || !Array.isArray(beat.ancestorBeatIds) || beat.ancestorBeatIds.length !== 0 || !viewports.has(`${viewport.width}x${viewport.height}`)) fail('beatReceipt contains a hidden, nested, merged, extra, or non-fixed Beat observation');
    return `${beat.id}@${viewport.width}x${viewport.height}`;
  });
  for (const id of beatIds) for (const viewport of viewports) if (observedBeats.filter((beat) => beat === `${id}@${viewport}`).length !== 1) fail('beatReceipt must observe every Beat exactly once at desktop and mobile');
  const observations = object(evidence.observations, 'observations'); exact(observations, ['desktop', 'mobile', 'temporalSamples'], 'observations');
  const parseRender = <W extends 1280 | 390, H extends 900 | 844>(name: 'desktop' | 'mobile', width: W, height: H): { readonly capture: ObservedReceipt; readonly width: W; readonly height: H } => { const render = object(observations[name], `observations.${name}`); exact(render, ['capture', 'width', 'height'], `observations.${name}`); if (render.width !== width || render.height !== height) fail(`observations.${name} must use its fixed harness viewport`); const capture = receipt(observationRoot, render.capture, `observations.${name}.capture`); const png = decodePng(stableProjectFile(observationRoot, capture.path, `observations.${name}.capture`).bytes); if (png.width !== width || png.height !== height) fail(`observations.${name} dimensions do not match bytes`); return { capture, width, height }; };
  const desktop = parseRender('desktop', 1280, 900); const mobile = parseRender('mobile', 390, 844);
  const temporal = object(observations.temporalSamples, 'observations.temporalSamples'); exact(temporal, ['desktop', 'mobile'], 'observations.temporalSamples');
  const parseSamples = (name: 'desktop' | 'mobile', width: number, height: number): readonly [ObservedReceipt, ObservedReceipt, ObservedReceipt] => { const values = array(temporal[name], `observations.temporalSamples.${name}`); if (values.length !== 3) fail(`observations.temporalSamples.${name} requires exactly three browser observations`); const parsed = values.map((sample, index) => receipt(observationRoot, sample, `observations.temporalSamples.${name}[${index}]`)); for (const sample of parsed) { const png = decodePng(stableProjectFile(observationRoot, sample.path, `observations.temporalSamples.${name}`).bytes); if (png.width !== width || png.height !== height) fail(`observations.temporalSamples.${name} dimensions do not match bytes`); } return parsed as [ObservedReceipt, ObservedReceipt, ObservedReceipt]; };
  const temporalSamples = { desktop: parseSamples('desktop', 1280, 900), mobile: parseSamples('mobile', 390, 844) };
  const allObservations = [desktop.capture, mobile.capture, ...temporalSamples.desktop, ...temporalSamples.mobile];
  if (new Set(allObservations.map((capture) => capture.path)).size !== allObservations.length) fail('each browser observation must have an isolated capture receipt');
  if (observedHash(allObservations) !== observedValues.observedSha256) fail('observedSha256 does not bind the browser observation bytes');
  const reviews = object(evidence.reviewReceipts, 'reviewReceipts'); exact(reviews, ['signature', 'narrative', 'motionFit', 'fidelity', 'fallback', 'blind'], 'reviewReceipts');
  const reviewExpected = { artDirectionHash, buildHash: expectedValues.buildHash, selectionSha256: expectedValues.selectionSha256, handoffSha256: expectedValues.handoffSha256, observedSha256: observedValues.observedSha256 };
  const reviewReceipts = { signature: reviewReceipt(observationRoot, current.invocation, reviews.signature, 'reviewReceipts.signature', 'signature', reviewExpected), narrative: reviewReceipt(observationRoot, current.invocation, reviews.narrative, 'reviewReceipts.narrative', 'narrative', reviewExpected), motionFit: reviewReceipt(observationRoot, current.invocation, reviews.motionFit, 'reviewReceipts.motionFit', 'motionFit', reviewExpected), fidelity: reviewReceipt(observationRoot, current.invocation, reviews.fidelity, 'reviewReceipts.fidelity', 'fidelity', reviewExpected), fallback: reviewReceipt(observationRoot, current.invocation, reviews.fallback, 'reviewReceipts.fallback', 'fallback', reviewExpected), blind: reviewReceipt(observationRoot, current.invocation, reviews.blind, 'reviewReceipts.blind', 'blind', reviewExpected) };
  if (!Object.values(reviewReceipts).some((receipt) => receipt.actor === 'host-reviewer') || !Object.values(reviewReceipts).some((receipt) => receipt.actor === 'host-evaluator') || new Set(Object.values(reviewReceipts).map((receipt) => receipt.path)).size !== 6) fail('static evidence requires six distinct host reviewer/evaluator receipts');
  return { schema: STATIC_DIRECTION_EVIDENCE_V1_SCHEMA, artDirectionHash, motionDecision: 'none', expected: expectedValues, observed: observedValues, beatReceipt, observations: { desktop, mobile, temporalSamples }, reviewReceipts };
}
