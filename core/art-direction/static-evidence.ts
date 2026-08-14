import { createHash } from 'node:crypto';
import { constants as fsConstants, closeSync, fstatSync, lstatSync, openSync, readFileSync, type Stats } from 'node:fs';
import { relative, resolve } from 'node:path';
import { decodePng } from '../motion/energy.ts';
import { hasHostBoundLocalProjectWriteAuthority } from '../runtime/activation.ts';
import { requireStaticReviewReceiptAuthorization, type ProjectRunInvocation } from '../runtime/invocation.ts';
import { validateRenderedBeatResultAuthority } from '../render/index.ts';
import { validatePostRenderBeatProof } from '../copy/index.ts';
import type { ArtDirectionDecision } from './schema.ts';

export const STATIC_DIRECTION_EVIDENCE_V1_SCHEMA = 'static-direction-evidence-v1' as const;
export const STATIC_REVIEW_RECEIPT_V1_SCHEMA = 'static-review-receipt-v1' as const;
type ObservedReceipt = { readonly path: string; readonly sha256: string };
type ReviewRole = 'signature' | 'narrative' | 'motionFit' | 'fidelity' | 'fallback' | 'blind';
type ReviewReceipt = { readonly path: string; readonly sha256: string; readonly role: ReviewRole; readonly sessionId: string; readonly processIdentity: string };

export type StaticDirectionEvidenceV1 = {
  readonly schema: typeof STATIC_DIRECTION_EVIDENCE_V1_SCHEMA;
  readonly artDirectionHash: string;
  readonly motionDecision: 'none';
  readonly expected: { readonly artDirectionHash: string; readonly selectionSha256: string; readonly handoffSha256: string; readonly buildHash: string; readonly runId: string; readonly route: string; readonly target: string; readonly taskId: string };
  readonly observed: { readonly runId: string; readonly buildHash: string; readonly selectionSha256: string; readonly handoffSha256: string; readonly route: string; readonly target: string; readonly taskId: string; readonly observationManifestSha256: string };
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
  const descriptors: number[] = [];
  const identity = (stat: Stats) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  try {
    const rootDescriptor = openSync(root, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    descriptors.push(rootDescriptor);
    const ancestors = [{ path: root, identity: identity(fstatSync(rootDescriptor)) }];
    let current = root;
    for (const part of projectPath.split('/').slice(0, -1)) {
      current = resolve(current, part);
      const descriptor = openSync(current, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
      descriptors.push(descriptor);
      const stat = fstatSync(descriptor);
      if (!stat.isDirectory()) fail(`${field}.path has an unsafe ancestor`);
      ancestors.push({ path: current, identity: identity(stat) });
    }
    const descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    descriptors.push(descriptor);
    const before = fstatSync(descriptor);
    if (!before.isFile()) fail(`${field}.path must be a regular non-symlink file`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (identity(before) !== identity(after) || bytes.length !== before.size) fail(`${field}.path changed while read`);
    for (const ancestor of ancestors) {
      const stat = lstatSync(ancestor.path);
      if (!stat.isDirectory() || stat.isSymbolicLink() || identity(stat) !== ancestor.identity) fail(`${field}.path ancestor changed while read`);
    }
    const entry = lstatSync(path);
    if (!entry.isFile() || entry.isSymbolicLink() || identity(entry) !== identity(before)) fail(`${field}.path changed while read`);
    return { path, bytes };
  } catch (error) {
    if (error instanceof StaticDirectionEvidenceValidationError) throw error;
    return fail(`${field}.path could not be opened without following links`);
  } finally {
    for (const descriptor of descriptors.reverse()) closeSync(descriptor);
  }
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
function observedHash(receipts: readonly ObservedReceipt[]): string { return createHash('sha256').update(JSON.stringify(receipts.map((receipt) => ({ path: receipt.path, sha256: receipt.sha256 })))).digest('hex'); }
function reviewReceipt(root: string, invocation: ProjectRunInvocation, value: unknown, field: string, role: ReviewRole, expected: { artDirectionHash: string; buildHash: string; selectionSha256: string; handoffSha256: string; runId: string; route: string; target: string; taskId: string; observationManifestSha256: string }): ReviewReceipt {
  const receiptObject = object(value, field); exact(receiptObject, ['path', 'sha256'], field);
  const sha256 = hash(receiptObject.sha256, `${field}.sha256`);
  const loaded = stableProjectFile(root, receiptObject.path, field);
  if (loaded.bytes.length === 0 || createHash('sha256').update(loaded.bytes).digest('hex') !== sha256) fail(`${field}.path bytes do not match sha256`);
  requireStaticReviewReceiptAuthorization(invocation, root, loaded.bytes);
  let parsed: unknown;
  try { parsed = JSON.parse(loaded.bytes.toString('utf8')) as unknown; } catch { fail(`${field}.path must contain a JSON host review receipt`); }
  const payload = object(parsed, `${field}.payload`);
  exact(payload, ['schema', 'role', 'verdict', 'artDirectionHash', 'buildHash', 'selectionSha256', 'handoffSha256', 'runId', 'route', 'target', 'taskId', 'observationManifestSha256', 'launchId', 'sessionId', 'processIdentity', 'configurationSha256'], `${field}.payload`);
  if (payload.schema !== STATIC_REVIEW_RECEIPT_V1_SCHEMA || payload.role !== role || payload.verdict !== 'pass') fail(`${field} must be a passing completed host ${role} receipt`);
  for (const key of ['launchId', 'sessionId', 'processIdentity', 'configurationSha256', 'runId', 'route', 'target', 'taskId'] as const) text(payload[key], `${field}.payload.${key}`);
  hash(payload.configurationSha256, `${field}.payload.configurationSha256`);
  for (const key of ['artDirectionHash', 'buildHash', 'selectionSha256', 'handoffSha256', 'observationManifestSha256'] as const) if (hash(payload[key], `${field}.payload.${key}`) !== expected[key]) fail(`${field} is not bound to current ${key}`);
  for (const key of ['runId', 'route', 'target', 'taskId'] as const) if (payload[key] !== expected[key]) fail(`${field} is not bound to current ${key}`);
  return { path: text(receiptObject.path, `${field}.path`), sha256, role, sessionId: payload.sessionId as string, processIdentity: payload.processIdentity as string };
}

/** Validates browser observations and independent host review/evaluator receipts; caller booleans cannot certify static direction. */
export function validateStaticDirectionEvidenceV1(value: unknown, decision?: Pick<ArtDirectionDecision, 'motionDecision' | 'selectedStaticReferenceSlotIds' | 'selectedRegister'> & { readonly buildHash?: string; readonly artDirectionHash?: string; readonly selectionSha256?: string; readonly handoffSha256?: string; readonly runId?: string; readonly observationRoot?: string; readonly invocation?: ProjectRunInvocation; readonly route?: string; readonly target?: string; readonly taskId?: string }): StaticDirectionEvidenceV1 {
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
  const expected = object(evidence.expected, 'expected'); exact(expected, ['artDirectionHash', 'selectionSha256', 'handoffSha256', 'buildHash', 'runId', 'route', 'target', 'taskId'], 'expected');
  const expectedValues = { artDirectionHash: hash(expected.artDirectionHash, 'expected.artDirectionHash'), selectionSha256: hash(expected.selectionSha256, 'expected.selectionSha256'), handoffSha256: hash(expected.handoffSha256, 'expected.handoffSha256'), buildHash: hash(expected.buildHash, 'expected.buildHash'), runId: text(expected.runId, 'expected.runId'), route: text(expected.route, 'expected.route'), target: text(expected.target, 'expected.target'), taskId: text(expected.taskId, 'expected.taskId') };
  if (expectedValues.artDirectionHash !== artDirectionHash) fail('expected art direction does not match evidence art direction');
  for (const key of ['artDirectionHash', 'selectionSha256', 'handoffSha256', 'buildHash', 'runId', 'route', 'target', 'taskId'] as const) if (current[key] !== expectedValues[key]) fail(`expected ${key} is not current`);
  staticSlots(current);
  const observed = object(evidence.observed, 'observed'); exact(observed, ['runId', 'buildHash', 'selectionSha256', 'handoffSha256', 'route', 'target', 'taskId', 'observationManifestSha256'], 'observed');
  const observedValues = { runId: text(observed.runId, 'observed.runId'), buildHash: hash(observed.buildHash, 'observed.buildHash'), selectionSha256: hash(observed.selectionSha256, 'observed.selectionSha256'), handoffSha256: hash(observed.handoffSha256, 'observed.handoffSha256'), route: text(observed.route, 'observed.route'), target: text(observed.target, 'observed.target'), taskId: text(observed.taskId, 'observed.taskId'), observationManifestSha256: hash(observed.observationManifestSha256, 'observed.observationManifestSha256') };
  for (const key of ['runId', 'buildHash', 'selectionSha256', 'handoffSha256', 'route', 'target', 'taskId'] as const) if (observedValues[key] !== expectedValues[key]) fail('observed lineage does not match expected current lineage');
  const beatReceipt = validateRenderedBeatResultAuthority(evidence.beatReceipt, {
    invocation: current.invocation,
    root: observationRoot,
    buildSha256: expectedValues.buildHash,
    artDirectionHash,
    route: current.route,
    target: current.target,
    taskId: current.taskId,
  });
  const beatReceiptObject = object(beatReceipt, 'beatReceipt');
  hash(beatReceiptObject.copyDeckSha256, 'beatReceipt.copyDeckSha256');
  if (!Array.isArray(beatReceiptObject.beatIds)
    || !beatReceiptObject.beatIds.every((id) => typeof id === 'string' && /^B-\d+$/.test(id))
    || new Set(beatReceiptObject.beatIds).size !== beatReceiptObject.beatIds.length
    || !Array.isArray(beatReceiptObject.renderedBeats)
    || !Array.isArray(beatReceiptObject.captureViewports)
    || !Array.isArray(beatReceiptObject.captures)) fail('beatReceipt is not a canonical current Beat receipt');
  const beatIds = new Set(beatReceiptObject.beatIds as string[]);
  const viewports = new Set(['1280x900', '390x844']);
  const captureViewports = beatReceiptObject.captureViewports as unknown[];
  if (captureViewports.length !== 2 || new Set(captureViewports.map((viewport) => {
    const candidate = object(viewport, 'beatReceipt.captureViewports[]');
    return `${candidate.width}x${candidate.height}`;
  })).size !== 2 || !captureViewports.every((viewport) => {
    const candidate = object(viewport, 'beatReceipt.captureViewports[]');
    return viewports.has(`${candidate.width}x${candidate.height}`);
  })) fail('beatReceipt must bind exactly the fixed desktop and mobile viewports');
  const captureKeys = new Set<string>();
  for (const [index, value] of (beatReceiptObject.captures as unknown[]).entries()) {
    const capture = object(value, `beatReceipt.captures[${index}]`);
    exact(capture, ['path', 'sha256', 'viewport'], `beatReceipt.captures[${index}]`);
    const viewport = object(capture.viewport, `beatReceipt.captures[${index}].viewport`);
    exact(viewport, ['width', 'height'], `beatReceipt.captures[${index}].viewport`);
    const key = `${viewport.width}x${viewport.height}`;
    if (!viewports.has(key) || captureKeys.has(key)) fail('beatReceipt captures must cover each fixed viewport exactly once');
    captureKeys.add(key);
    const file = stableProjectFile(observationRoot, text(capture.path, `beatReceipt.captures[${index}].path`), `beatReceipt.captures[${index}]`);
    if (hash(capture.sha256, `beatReceipt.captures[${index}].sha256`) !== createHash('sha256').update(file.bytes).digest('hex')) fail('beatReceipt capture bytes are stale');
    const png = decodePng(file.bytes);
    if (png.width !== viewport.width || png.height !== viewport.height) fail('beatReceipt capture dimensions do not match its fixed viewport');
  }
  if (captureKeys.size !== 2) fail('beatReceipt captures must cover each fixed viewport exactly once');
  const beatViolations = validatePostRenderBeatProof('', beatReceipt, { beatIds: [...beatIds] });
  if (beatViolations.length > 0) fail(`beatReceipt ${beatViolations[0]!.message}`);
  const observations = object(evidence.observations, 'observations'); exact(observations, ['desktop', 'mobile', 'temporalSamples'], 'observations');
  const parseRender = <W extends 1280 | 390, H extends 900 | 844>(name: 'desktop' | 'mobile', width: W, height: H): { readonly capture: ObservedReceipt; readonly width: W; readonly height: H } => { const render = object(observations[name], `observations.${name}`); exact(render, ['capture', 'width', 'height'], `observations.${name}`); if (render.width !== width || render.height !== height) fail(`observations.${name} must use its fixed harness viewport`); const capture = receipt(observationRoot, render.capture, `observations.${name}.capture`); const png = decodePng(stableProjectFile(observationRoot, capture.path, `observations.${name}.capture`).bytes); if (png.width !== width || png.height !== height) fail(`observations.${name} dimensions do not match bytes`); return { capture, width, height }; };
  const desktop = parseRender('desktop', 1280, 900); const mobile = parseRender('mobile', 390, 844);
  for (const [name, observedCapture] of [['desktop', desktop.capture], ['mobile', mobile.capture]] as const) {
    const viewport = name === 'desktop' ? '1280x900' : '390x844';
    const beatCapture = (beatReceiptObject.captures as unknown[]).find((value) => {
      const candidate = object(value, 'beatReceipt.captures[]');
      const dimensions = object(candidate.viewport, 'beatReceipt.captures[].viewport');
      return `${dimensions.width}x${dimensions.height}` === viewport;
    });
    if (beatCapture === undefined) fail(`beatReceipt is missing the ${name} capture`);
    const candidate = object(beatCapture, `beatReceipt ${name} capture`);
    if (candidate.path !== observedCapture.path || candidate.sha256 !== observedCapture.sha256) fail(`observations.${name} must be the exact current rendered Beat capture`);
  }
  const temporal = object(observations.temporalSamples, 'observations.temporalSamples'); exact(temporal, ['desktop', 'mobile'], 'observations.temporalSamples');
  const parseSamples = (name: 'desktop' | 'mobile', width: number, height: number): readonly [ObservedReceipt, ObservedReceipt, ObservedReceipt] => { const values = array(temporal[name], `observations.temporalSamples.${name}`); if (values.length !== 3) fail(`observations.temporalSamples.${name} requires exactly three browser observations`); const parsed = values.map((sample, index) => receipt(observationRoot, sample, `observations.temporalSamples.${name}[${index}]`)); for (const sample of parsed) { const png = decodePng(stableProjectFile(observationRoot, sample.path, `observations.temporalSamples.${name}`).bytes); if (png.width !== width || png.height !== height) fail(`observations.temporalSamples.${name} dimensions do not match bytes`); } return parsed as [ObservedReceipt, ObservedReceipt, ObservedReceipt]; };
  const temporalSamples = { desktop: parseSamples('desktop', 1280, 900), mobile: parseSamples('mobile', 390, 844) };
  const allObservations = [desktop.capture, mobile.capture, ...temporalSamples.desktop, ...temporalSamples.mobile];
  if (new Set(allObservations.map((capture) => capture.path)).size !== allObservations.length) fail('each browser observation must have an isolated capture receipt');
  if (observedHash(allObservations) !== observedValues.observationManifestSha256) fail('observationManifestSha256 does not bind the exact browser observation manifest');
  const reviews = object(evidence.reviewReceipts, 'reviewReceipts'); exact(reviews, ['signature', 'narrative', 'motionFit', 'fidelity', 'fallback', 'blind'], 'reviewReceipts');
  const reviewExpected = { artDirectionHash, buildHash: expectedValues.buildHash, selectionSha256: expectedValues.selectionSha256, handoffSha256: expectedValues.handoffSha256, runId: expectedValues.runId, route: expectedValues.route, target: expectedValues.target, taskId: expectedValues.taskId, observationManifestSha256: observedValues.observationManifestSha256 };
  const reviewReceipts = { signature: reviewReceipt(observationRoot, current.invocation, reviews.signature, 'reviewReceipts.signature', 'signature', reviewExpected), narrative: reviewReceipt(observationRoot, current.invocation, reviews.narrative, 'reviewReceipts.narrative', 'narrative', reviewExpected), motionFit: reviewReceipt(observationRoot, current.invocation, reviews.motionFit, 'reviewReceipts.motionFit', 'motionFit', reviewExpected), fidelity: reviewReceipt(observationRoot, current.invocation, reviews.fidelity, 'reviewReceipts.fidelity', 'fidelity', reviewExpected), fallback: reviewReceipt(observationRoot, current.invocation, reviews.fallback, 'reviewReceipts.fallback', 'fallback', reviewExpected), blind: reviewReceipt(observationRoot, current.invocation, reviews.blind, 'reviewReceipts.blind', 'blind', reviewExpected) };
  if (new Set(Object.values(reviewReceipts).map((receipt) => receipt.path)).size !== 6
    || new Set(Object.values(reviewReceipts).map((receipt) => receipt.sessionId)).size !== 6
    || new Set(Object.values(reviewReceipts).map((receipt) => receipt.processIdentity)).size !== 6) {
    fail('static evidence requires six distinct completed host reviewer/evaluator process and session receipts');
  }
  return { schema: STATIC_DIRECTION_EVIDENCE_V1_SCHEMA, artDirectionHash, motionDecision: 'none', expected: expectedValues, observed: observedValues, beatReceipt, observations: { desktop, mobile, temporalSamples }, reviewReceipts };
}
