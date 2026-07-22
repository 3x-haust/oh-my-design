import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, readReferenceBoardArtifacts, sha256, type RawBoardPiece, type ReferenceBoardArtifacts } from './board-artifacts.ts';
import { parseReferenceBoard } from './board-parser.ts';
import type { ReferenceAssemblyPiece } from './board-projection.ts';
import { readTrustedProductionEvidence, readTrustedReferenceUsageSnapshot, sameReferenceUsageSnapshot, trustedProductionEvidencePath, trustedReferenceUsageFile, writeReferenceUsageRecord, type ReferenceUsageFileSnapshot } from './reference-usage-files.ts';
import { parseReferenceSelectionV2, readPreReferenceSelectionV2, referenceSelectionV2Sha256, type ReferenceSelectionV2 } from './reference-selection.ts';
import { artDirectionSha256, validateArtDirectionPointer, validateArtDirectionRecord } from '../art-direction/schema.ts';
import { parseReferenceHandoffReceipt } from './reference-handoff.ts';
import { motionResolutionProjectionSha256, validateMotionResolutionProjection } from './reference-selection.ts';
import { parseReferenceUsageInput, ReferenceUsageValidationError, type ReferenceUsageRow } from './reference-usage-parser.ts';

export const REFERENCE_USAGE_V2_SCHEMA_VERSION = 'reference-usage-v2' as const;
const ATTEMPTS = 3;
const usageRelativePath = '.omd/reference-usage-v2.json';
const attributionRelativePath = '.omd/attribution.md';
const boardRelativePath = '.omd/reference-board.json';
const selectionRelativePath = '.omd/reference-selection-v2.json';
const SHA256 = /^[a-f0-9]{64}$/;

export type ReferenceUsageV2 = Readonly<{
  schemaVersion: typeof REFERENCE_USAGE_V2_SCHEMA_VERSION;
  captureSha256: string;
  assemblySha256: string;
  projectionSha256: string;
  selectionSha256: string;
  artDirectionSha256: string;
  motionResolutionProjectionSha256: string;
  settledSelectionSha256: string;
  composerHandoffSha256: string;
  attributionSha256: string;
  rows: readonly ReferenceUsageRow[];
}>;
export type ValidatedReferenceUsagePiece = { readonly usage: ReferenceUsageRow; readonly raw: RawBoardPiece; readonly assembly: ReferenceAssemblyPiece };
export type ValidatedReferenceUsage = { readonly usage: ReferenceUsageV2; readonly artifacts: ReferenceBoardArtifacts; readonly attribution: string; readonly pieces: readonly ValidatedReferenceUsagePiece[] };
type SnapshotInput = ReferenceUsageFileSnapshot | Buffer;
type BindingSnapshots = { readonly attribution: ReferenceUsageFileSnapshot; readonly board: ReferenceUsageFileSnapshot; readonly selection: ReferenceUsageFileSnapshot };
type SnapshotReaders = {
  readonly readUsage: (root: string) => SnapshotInput;
  readonly readAttribution: (root: string) => SnapshotInput;
  readonly readBoard: (root: string) => SnapshotInput;
  readonly readSelection: (root: string) => SnapshotInput;
  readonly readArtifacts: (root: string, board: ReferenceUsageFileSnapshot) => ReferenceBoardArtifacts;
  readonly readEvidence: (root: string, path: string) => SnapshotInput;
  readonly afterEvidenceChecks: (root: string) => void;
};
export type ReferenceUsageReaders = Partial<SnapshotReaders>;
type ReferenceUsageBindings = { readonly bytes: BindingSnapshots; readonly artifacts: ReferenceBoardArtifacts; readonly selection: ReferenceSelectionV2 };
type EvidenceSnapshot = { readonly path: string; readonly snapshot: ReferenceUsageFileSnapshot };
type CheckedRows = { readonly pieces: readonly ValidatedReferenceUsagePiece[]; readonly evidence: readonly EvidenceSnapshot[] };

const fail = (reason: string): never => { throw new ReferenceUsageValidationError(reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const hash = (value: unknown, label: string): string => typeof value === 'string' && SHA256.test(value) ? value : fail(`${label} must be a lowercase SHA-256 digest`);
const defaultReaders: SnapshotReaders = {
  readUsage: (root) => readTrustedReferenceUsageSnapshot(root, usageRelativePath, 'reference usage v2'),
  readAttribution: (root) => readTrustedReferenceUsageSnapshot(root, attributionRelativePath, 'attribution'),
  readBoard: (root) => readTrustedReferenceUsageSnapshot(root, boardRelativePath, 'reference board'),
  readSelection: (root) => readTrustedReferenceUsageSnapshot(root, selectionRelativePath, 'reference selection v2'),
  readArtifacts: (root, board) => readReferenceBoardArtifacts(root, trustedReferenceUsageFile(root, boardRelativePath, 'reference board')),
  readEvidence: readTrustedProductionEvidence,
  afterEvidenceChecks: () => undefined,
};
const readers = (overrides?: ReferenceUsageReaders): SnapshotReaders => ({ ...defaultReaders, ...overrides });
const injectedSnapshot = (bytes: Buffer, label: string): ReferenceUsageFileSnapshot => ({ bytes, identity: { path: `<injected:${label}>`, dev: 0, ino: 0, size: bytes.length, mtimeMs: 0, ctimeMs: 0 } });
const observed = (value: SnapshotInput, label: string): ReferenceUsageFileSnapshot => {
  if (Buffer.isBuffer(value)) return injectedSnapshot(value, label);
  if (!Buffer.isBuffer(value.bytes) || value.identity.size !== value.bytes.length || !Number.isFinite(value.identity.dev) || !Number.isFinite(value.identity.ino) || !Number.isFinite(value.identity.mtimeMs) || !Number.isFinite(value.identity.ctimeMs) || value.identity.path === '') return fail(`${label} reader returned an invalid snapshot`);
  return value;
};
const parse = <T>(snapshot: ReferenceUsageFileSnapshot, label: string, parser: (value: unknown) => T): T => {
  try { return parser(JSON.parse(snapshot.bytes.toString('utf8'))); } catch (error) {
    if (error instanceof ReferenceUsageValidationError) throw error;
    return fail(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
};
const sameBindings = (left: BindingSnapshots, right: BindingSnapshots): boolean => sameReferenceUsageSnapshot(left.attribution, right.attribution) && sameReferenceUsageSnapshot(left.board, right.board) && sameReferenceUsageSnapshot(left.selection, right.selection);
const unstableRead = (error: unknown): boolean => error instanceof ReferenceUsageValidationError && error.reason.endsWith('changed while it was read');

export function parseReferenceUsageV2(value: unknown): ReferenceUsageV2 {
  if (!isRecord(value)) return fail('reference usage v2 must be an object');
  const expected = ['artDirectionSha256', 'assemblySha256', 'attributionSha256', 'captureSha256', 'composerHandoffSha256', 'motionResolutionProjectionSha256', 'projectionSha256', 'rows', 'schemaVersion', 'selectionSha256', 'settledSelectionSha256'];
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return fail('reference usage v2 has unknown or missing keys');
  if (value.schemaVersion !== REFERENCE_USAGE_V2_SCHEMA_VERSION) return fail(`schemaVersion must be ${REFERENCE_USAGE_V2_SCHEMA_VERSION}`);
  const input = parseReferenceUsageInput({ rows: value.rows });
  return {
    schemaVersion: REFERENCE_USAGE_V2_SCHEMA_VERSION,
    captureSha256: hash(value.captureSha256, 'captureSha256'),
    assemblySha256: hash(value.assemblySha256, 'assemblySha256'),
    projectionSha256: hash(value.projectionSha256, 'projectionSha256'),
    selectionSha256: hash(value.selectionSha256, 'selectionSha256'),
    artDirectionSha256: hash(value.artDirectionSha256, 'artDirectionSha256'),
    motionResolutionProjectionSha256: hash(value.motionResolutionProjectionSha256, 'motionResolutionProjectionSha256'),
    settledSelectionSha256: hash(value.settledSelectionSha256, 'settledSelectionSha256'),
    composerHandoffSha256: hash(value.composerHandoffSha256, 'composerHandoffSha256'),
    attributionSha256: hash(value.attributionSha256, 'attributionSha256'),
    rows: input.rows,
  };
}
export const referenceUsageV2Sha256 = (usage: ReferenceUsageV2): string => sha256(canonicalJson(usage));
const artifactsFrom = (root: string, reader: SnapshotReaders, board: ReferenceUsageFileSnapshot): ReferenceBoardArtifacts => {
  const artifacts = reader.readArtifacts(root, board); const manifest = parse(board, 'reference board', parseReferenceBoard);
  if (canonicalJson(manifest) !== canonicalJson(artifacts.manifest) || canonicalJson(artifacts.raw) !== artifacts.boardBytes || canonicalJson(artifacts.assembly) !== artifacts.assemblyBytes || canonicalJson(artifacts.projection) !== artifacts.projectionBytes) fail('board artifacts do not derive from the exact sampled board bytes');
  return artifacts;
};
const validateSelectionAgainstArtifacts = (selection: ReferenceSelectionV2, artifacts: ReferenceBoardArtifacts): void => {
  const candidate = artifacts.projection.candidates.find((entry) => entry.id === selection.candidateId);
  if (candidate === undefined) return fail('v2 selection candidate is unavailable from the current projection');
  if (candidate.pieces.length !== selection.slots.length) fail('v2 selection does not cover the current projection candidate');
  const pieces = new Map(candidate.pieces.map((piece) => [piece.slotId, piece]));
  for (const slot of selection.slots) {
    const piece = pieces.get(slot.slotId);
    if (piece === undefined || slot.rights !== piece.rights || slot.signal !== piece.signal || slot.staticAxis !== piece.staticAxis || slot.motionAxis !== piece.motionAxis) fail(`v2 selection slot ${slot.slotId} does not match the current projection`);
    if ((slot.rights !== 'lawful' || slot.signal === 'anti-reference' || (slot.signal === 'high-motion' && slot.motionAxis === 'absent')) && slot.obligationDisposition === 'used') fail(`v2 selection slot ${slot.slotId} has an unlawful used disposition`);
  }
  if (!selection.slots.some((slot) => slot.signal === 'high-visual-system' && slot.rights === 'lawful' && slot.obligationDisposition === 'used')) fail('v2 selection has no lawful high-visual-system use');
};
const captureOnce = (root: string, reader: SnapshotReaders): ReferenceUsageBindings | undefined => {
  const before = { attribution: observed(reader.readAttribution(root), 'attribution'), board: observed(reader.readBoard(root), 'reference board'), selection: observed(reader.readSelection(root), 'reference selection v2') };
  const artifacts = artifactsFrom(root, reader, before.board); const selection = parse(before.selection, 'reference selection v2', parseReferenceSelectionV2);
  const after = { attribution: observed(reader.readAttribution(root), 'attribution'), board: observed(reader.readBoard(root), 'reference board'), selection: observed(reader.readSelection(root), 'reference selection v2') };
  if (!sameBindings(before, after)) return undefined;
  if (selection.captureSha256 !== sha256(artifacts.boardBytes) || selection.assemblySha256 !== sha256(artifacts.assemblyBytes) || selection.projectionSha256 !== sha256(artifacts.projectionBytes)) return undefined;
  validateSelectionAgainstArtifacts(selection, artifacts);
  return { bytes: before, artifacts, selection };
};
const currentDecisionSettlement = (root: string, selection: ReferenceSelectionV2): { artDirectionSha256: string; motionResolutionProjectionSha256: string; settledSelectionSha256: string; composerHandoffSha256: string } => {
  try {
    const pointer = validateArtDirectionPointer(JSON.parse(readFileSync(join(root, '.omd', 'art-direction.json'), 'utf8')));
    const record = validateArtDirectionRecord(JSON.parse(readFileSync(join(root, '.omd', pointer.record), 'utf8')));
    const preSelection = readPreReferenceSelectionV2(root);
    if (pointer.sha256 !== artDirectionSha256(record)
      || referenceSelectionV2Sha256(preSelection) !== record.decision.preSelectionSha256
      || referenceSelectionV2Sha256(selection) !== record.decision.settledSelectionSha256) fail('selection aliases are stale from the current art direction');
    const selectedMotion = new Set(record.decision.selectedMotionReferenceSlotIds);
    for (const slot of selection.slots) {
      if (slot.signal !== 'high-motion' || slot.rights !== 'lawful' || slot.motionAxis !== 'available') continue;
      const expected = selectedMotion.has(slot.slotId) ? 'used' : 'rejected';
      if (slot.obligationDisposition !== expected) fail(`settled selection disagrees with the final motion decision for ${slot.slotId}`);
    }
    const motion = validateMotionResolutionProjection(JSON.parse(readFileSync(join(root, '.omd', 'motion-resolutions', `sha256-${record.decision.motionResolutionProjectionSha256}.json`), 'utf8')));
    if (motionResolutionProjectionSha256(motion) !== record.decision.motionResolutionProjectionSha256) fail('motion resolution projection is stale from the current art direction');
    const composer = parseReferenceHandoffReceipt(JSON.parse(readFileSync(join(root, '.omd', 'reference-handoffs', 'composer.json'), 'utf8')));
    if (composer.role !== 'composer' || composer.artDirectionSha256 !== pointer.sha256
      || composer.preSelectionSha256 !== record.decision.preSelectionSha256
      || composer.motionResolutionProjectionSha256 !== record.decision.motionResolutionProjectionSha256
      || composer.settledSelectionSha256 !== record.decision.settledSelectionSha256) fail('composer handoff disagrees with the current art direction settlement');
    return { artDirectionSha256: pointer.sha256, motionResolutionProjectionSha256: record.decision.motionResolutionProjectionSha256, settledSelectionSha256: record.decision.settledSelectionSha256, composerHandoffSha256: composer.payloadSha256 };
  } catch (error) {
    if (error instanceof ReferenceUsageValidationError) throw error;
    return fail(`current decision settlement is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
};
const checkBindings = (root: string, usage: ReferenceUsageV2, binding: ReferenceUsageBindings): void => {
  if (usage.captureSha256 !== sha256(binding.artifacts.boardBytes) || usage.assemblySha256 !== sha256(binding.artifacts.assemblyBytes) || usage.projectionSha256 !== sha256(binding.artifacts.projectionBytes)) fail('usage does not bind the exact board-derived capture, assembly, and projection');
  if (usage.selectionSha256 !== referenceSelectionV2Sha256(binding.selection)) fail('usage does not bind the exact settled v2 selection');
  const settlement = currentDecisionSettlement(root, binding.selection);
  if (usage.artDirectionSha256 !== settlement.artDirectionSha256 || usage.motionResolutionProjectionSha256 !== settlement.motionResolutionProjectionSha256 || usage.settledSelectionSha256 !== settlement.settledSelectionSha256 || usage.composerHandoffSha256 !== settlement.composerHandoffSha256) fail('usage does not bind the current decision-bound settlement');
  if (usage.attributionSha256 !== sha256(binding.bytes.attribution.bytes)) fail('attribution hash does not match exact attribution bytes');
};
const checkRows = (root: string, reader: SnapshotReaders, usage: ReferenceUsageV2, binding: ReferenceUsageBindings): CheckedRows | undefined => {
  const candidate = binding.artifacts.projection.candidates.find((entry) => entry.id === binding.selection.candidateId);
  const rawCandidate = binding.artifacts.raw.candidates.find((entry) => entry.id === binding.selection.candidateId);
  const assemblyCandidate = binding.artifacts.assembly.candidates.find((entry) => entry.id === binding.selection.candidateId);
  if (candidate === undefined) return fail('selected projection candidate is unavailable from bound v2 artifacts');
  if (rawCandidate === undefined) return fail('selected raw candidate is unavailable from bound v2 artifacts');
  if (assemblyCandidate === undefined) return fail('selected assembly candidate is unavailable from bound v2 artifacts');
  if (usage.rows.length !== binding.selection.slots.length || candidate.pieces.length !== binding.selection.slots.length) return fail('usage rows must cover every selected v2 slot exactly once');
  const rows = new Map(usage.rows.map((row) => [row.slotId, row])); const selectionSlots = new Map(binding.selection.slots.map((slot) => [slot.slotId, slot])); const raw = new Map(rawCandidate.pieces.map((piece) => [piece.slotId, piece]));
  if (rows.size !== usage.rows.length) return fail('usage rows must not duplicate v2 slots');
  const pieces: ValidatedReferenceUsagePiece[] = []; const evidence: EvidenceSnapshot[] = [];
  for (const assembly of assemblyCandidate.pieces) {
    const row = rows.get(assembly.slotId); const slot = selectionSlots.get(assembly.slotId); const rawPiece = raw.get(assembly.slotId);
    if (row === undefined || slot === undefined || rawPiece === undefined) return fail(`usage is missing selected v2 slotId ${assembly.slotId}`);
    if (row.target.route !== rawCandidate.route || row.target.component !== rawPiece.targetComponent || row.target.selector !== rawPiece.targetSelector) return fail(`usage target must exactly match selected slotId ${assembly.slotId}`);
    const expectedStatus = slot.obligationDisposition === 'used' ? 'used' : slot.signal === 'anti-reference' ? 'anti-reference' : 'rejected';
    if (row.status !== expectedStatus) return fail(`usage status must preserve v2 disposition for ${assembly.slotId}`);
    let before: ReferenceUsageFileSnapshot; let after: ReferenceUsageFileSnapshot;
    try { before = observed(reader.readEvidence(root, row.evidence.path), 'production evidence'); after = observed(reader.readEvidence(root, row.evidence.path), 'production evidence'); } catch (error) { if (unstableRead(error)) return undefined; throw error; }
    if (!sameReferenceUsageSnapshot(before, after)) return undefined;
    pieces.push({ usage: row, raw: rawPiece, assembly }); evidence.push({ path: row.evidence.path, snapshot: before });
  }
  return { pieces, evidence };
};
const stableUsage = (root: string, reader: SnapshotReaders): { usage: ReferenceUsageV2; snapshot: ReferenceUsageFileSnapshot } | undefined => {
  try { const before = observed(reader.readUsage(root), 'reference usage v2'); const usage = parse(before, 'reference usage v2', parseReferenceUsageV2); const after = observed(reader.readUsage(root), 'reference usage v2'); return sameReferenceUsageSnapshot(before, after) ? { usage, snapshot: before } : undefined; } catch (error) { if (unstableRead(error)) return undefined; throw error; }
};
const sameEvidence = (root: string, reader: SnapshotReaders, evidence: readonly EvidenceSnapshot[]): boolean => evidence.every((entry) => sameReferenceUsageSnapshot(entry.snapshot, observed(reader.readEvidence(root, entry.path), 'production evidence')));

export const referenceUsagePath = (root: string): string => join(root, usageRelativePath);
export const trustedProductionEvidence = trustedProductionEvidencePath;
export function readValidatedReferenceUsage(root: string, overrides?: ReferenceUsageReaders): ValidatedReferenceUsage {
  const reader = readers(overrides);
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const current = stableUsage(root, reader); if (current === undefined) continue;
    let binding: ReferenceUsageBindings | undefined;
    try { binding = captureOnce(root, reader); } catch (error) { if (unstableRead(error)) continue; throw error; }
    if (binding === undefined) continue;
    checkBindings(root, current.usage, binding); const checked = checkRows(root, reader, current.usage, binding); if (checked === undefined) continue;
    reader.afterEvidenceChecks(root);
    const final = captureOnce(root, reader); const finalUsage = stableUsage(root, reader);
    if (final !== undefined && finalUsage !== undefined && sameBindings(binding.bytes, final.bytes) && referenceSelectionV2Sha256(binding.selection) === referenceSelectionV2Sha256(final.selection) && sameReferenceUsageSnapshot(current.snapshot, finalUsage.snapshot) && sameEvidence(root, reader, checked.evidence)) return { usage: current.usage, artifacts: binding.artifacts, attribution: binding.bytes.attribution.bytes.toString('utf8'), pieces: checked.pieces };
  }
  return fail('could not obtain a coherent v2 reference usage snapshot');
}
export function prepareReferenceUsage(root: string, value: unknown, overrides?: ReferenceUsageReaders): ReferenceUsageV2 {
  const reader = readers(overrides); const input = parseReferenceUsageInput(value);
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    let binding: ReferenceUsageBindings | undefined;
    try { binding = captureOnce(root, reader); } catch (error) { if (unstableRead(error)) continue; throw error; }
    if (binding === undefined) continue;
    const settlement = currentDecisionSettlement(root, binding.selection);
    const usage: ReferenceUsageV2 = { schemaVersion: REFERENCE_USAGE_V2_SCHEMA_VERSION, captureSha256: sha256(binding.artifacts.boardBytes), assemblySha256: sha256(binding.artifacts.assemblyBytes), projectionSha256: sha256(binding.artifacts.projectionBytes), selectionSha256: referenceSelectionV2Sha256(binding.selection), artDirectionSha256: settlement.artDirectionSha256, motionResolutionProjectionSha256: settlement.motionResolutionProjectionSha256, settledSelectionSha256: settlement.settledSelectionSha256, composerHandoffSha256: settlement.composerHandoffSha256, attributionSha256: sha256(binding.bytes.attribution.bytes), rows: input.rows };
    const checked = checkRows(root, reader, usage, binding); if (checked === undefined) continue;
    reader.afterEvidenceChecks(root); const final = captureOnce(root, reader);
    if (final !== undefined && sameBindings(binding.bytes, final.bytes) && referenceSelectionV2Sha256(binding.selection) === referenceSelectionV2Sha256(final.selection) && sameEvidence(root, reader, checked.evidence)) return usage;
  }
  return fail('could not obtain a coherent v2 reference usage snapshot');
}
export const writeReferenceUsage = (root: string, body: string): void => writeReferenceUsageRecord(root, 'reference-usage-v2.json', body, 'reference usage v2');
export const writeReferenceUsageV2 = (root: string, usage: ReferenceUsageV2): void => writeReferenceUsage(root, canonicalJson(usage));
export const writeReferenceReport = (root: string, body: string): void => writeReferenceUsageRecord(root, 'reference-report.md', body, 'reference report');
export const referenceReportPath = (root: string): string => join(root, '.omd', 'reference-report.md');
