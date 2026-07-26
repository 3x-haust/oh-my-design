import { realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { canonicalJson, readReferenceBoardArtifacts, sha256, type RawBoardPiece, type ReferenceBoardArtifacts } from './board-artifacts.ts';
import { parseReferenceBoard } from './board-parser.ts';
import type { ReferenceAssemblyPiece } from './board-projection.ts';
import { readTrustedProductionEvidence, readTrustedReferenceUsageSnapshot, sameReferenceUsageSnapshot, trustedProductionEvidencePath, trustedReferenceUsageFile, writeReferenceUsageRecord, type ReferenceUsageFileSnapshot } from './reference-usage-files.ts';
import { parseReferenceSelectionV2, referenceSelectionV2Sha256, type ReferenceSelectionV2 } from './reference-selection.ts';
import { validateArtDirectionPointer, validateArtDirectionRecord } from '../art-direction/schema.ts';
import { parseReferenceHandoffReceipt, referencePositiveMotion, validateReferenceSettlementSnapshot } from './reference-handoff.ts';
import { parseReferenceUsageInput, ReferenceUsageValidationError, type ReferenceUsageRow } from './reference-usage-parser.ts';

export const REFERENCE_USAGE_V2_SCHEMA_VERSION = 'reference-usage-v2' as const;
const ATTEMPTS = 3;
const usageRelativePath = '.omd/reference-usage-v2.json';
const attributionRelativePath = '.omd/attribution.md';
const boardRelativePath = '.omd/reference-board.json';
const selectionRelativePath = '.omd/reference-selection-v2.json';
const preSelectionPointerRelativePath = '.omd/reference-pre-selection-v2.json';
const artDirectionPointerRelativePath = '.omd/art-direction.json';
const composerHandoffRelativePath = '.omd/reference-handoffs/composer.json';
const artDirectionHandoffRelativePath = '.omd/reference-handoffs/art-direction.json';
const SHA256 = /^[a-f0-9]{64}$/;

export type ReferenceUsageV2 = Readonly<{ schemaVersion: typeof REFERENCE_USAGE_V2_SCHEMA_VERSION; captureSha256: string; assemblySha256: string; projectionSha256: string; selectionSha256: string; artDirectionSha256: string; motionResolutionProjectionSha256: string; settledSelectionSha256: string; composerHandoffSha256: string; attributionSha256: string; rows: readonly ReferenceUsageRow[] }>;
export type ValidatedReferenceUsagePiece = { readonly usage: ReferenceUsageRow; readonly raw: RawBoardPiece; readonly assembly: ReferenceAssemblyPiece };
export type ValidatedReferenceUsage = { readonly usage: ReferenceUsageV2; readonly artifacts: ReferenceBoardArtifacts; readonly attribution: string; readonly pieces: readonly ValidatedReferenceUsagePiece[] };
type SnapshotInput = ReferenceUsageFileSnapshot;
type SnapshotReaders = { readonly readUsage: (root: string) => SnapshotInput; readonly readAttribution: (root: string) => SnapshotInput; readonly readBoard: (root: string) => SnapshotInput; readonly readSelection: (root: string) => SnapshotInput; readonly readArtifacts: (root: string, board: ReferenceUsageFileSnapshot) => ReferenceBoardArtifacts; readonly readEvidence: (root: string, path: string) => SnapshotInput };
type BindingSnapshots = { readonly attribution: ReferenceUsageFileSnapshot; readonly board: ReferenceUsageFileSnapshot; readonly selection: ReferenceUsageFileSnapshot; readonly artDirectionPointer: ReferenceUsageFileSnapshot; readonly artDirectionRecord: ReferenceUsageFileSnapshot; readonly artDirectionHandoff: ReferenceUsageFileSnapshot; readonly preSelectionPointer: ReferenceUsageFileSnapshot; readonly preSelectionRecord: ReferenceUsageFileSnapshot; readonly motionResolution: ReferenceUsageFileSnapshot; readonly immutableSettledSelection: ReferenceUsageFileSnapshot; readonly composerHandoff: ReferenceUsageFileSnapshot };
type ReferenceUsageBindings = { readonly bytes: BindingSnapshots; readonly artifacts: ReferenceBoardArtifacts; readonly selection: ReferenceSelectionV2; readonly settlement: DecisionSettlement };
type DecisionSettlement = { readonly artDirectionSha256: string; readonly motionResolutionProjectionSha256: string; readonly settledSelectionSha256: string; readonly composerHandoffSha256: string };
type EvidenceSnapshot = { readonly path: string; readonly snapshot: ReferenceUsageFileSnapshot };
type CheckedRows = { readonly pieces: readonly ValidatedReferenceUsagePiece[]; readonly evidence: readonly EvidenceSnapshot[] };

const fail = (reason: string): never => { throw new ReferenceUsageValidationError(reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const hash = (value: unknown, label: string): string => typeof value === 'string' && SHA256.test(value) ? value : fail(`${label} must be a lowercase SHA-256 digest`);
const defaultReaders: SnapshotReaders = { readUsage: (root) => readTrustedReferenceUsageSnapshot(root, usageRelativePath, 'reference usage v2'), readAttribution: (root) => readTrustedReferenceUsageSnapshot(root, attributionRelativePath, 'attribution'), readBoard: (root) => readTrustedReferenceUsageSnapshot(root, boardRelativePath, 'reference board'), readSelection: (root) => readTrustedReferenceUsageSnapshot(root, selectionRelativePath, 'reference selection v2'), readArtifacts: (root) => readReferenceBoardArtifacts(root, trustedReferenceUsageFile(root, boardRelativePath, 'reference board')), readEvidence: readTrustedProductionEvidence };
const observed = (value: SnapshotInput, label: string): ReferenceUsageFileSnapshot => { if (!Buffer.isBuffer(value.bytes) || value.identity.size !== value.bytes.length || !Number.isFinite(value.identity.dev) || !Number.isFinite(value.identity.ino) || !Number.isFinite(value.identity.mtimeMs) || !Number.isFinite(value.identity.ctimeMs) || value.identity.path === '') return fail(`${label} reader returned an invalid snapshot`); return value; };
const read = (root: string, path: string, label: string): ReferenceUsageFileSnapshot => readTrustedReferenceUsageSnapshot(root, path, label);
const parse = <T>(snapshot: ReferenceUsageFileSnapshot, label: string, parser: (value: unknown) => T): T => { try { return parser(JSON.parse(snapshot.bytes.toString('utf8'))); } catch (error) { if (error instanceof ReferenceUsageValidationError) throw error; return fail(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`); } };
const sameBindings = (left: BindingSnapshots, right: BindingSnapshots): boolean => Object.keys(left).every((key) => sameReferenceUsageSnapshot(left[key as keyof BindingSnapshots], right[key as keyof BindingSnapshots]));
const unstableRead = (error: unknown): boolean => error instanceof ReferenceUsageValidationError && error.reason.endsWith('changed while it was read');
const parsePreSelectionPointer = (snapshot: ReferenceUsageFileSnapshot): { readonly schemaVersion: 'reference-pre-selection-pointer-v1'; readonly sha256: string; readonly record: string } => {
  const value = parse(snapshot, 'pre-selection pointer', (input): Record<string, unknown> => isRecord(input) ? input : fail('pre-selection pointer must be an object'));
  if (Object.keys(value).sort().join(',') !== 'record,schemaVersion,sha256' || value.schemaVersion !== 'reference-pre-selection-pointer-v1') fail('pre-selection pointer has unknown or missing keys');
  const digest = hash(value.sha256, 'pre-selection pointer sha256'); const record = typeof value.record === 'string' ? value.record : fail('pre-selection pointer record must be a string');
  if (record !== `pre-reference-selections/sha256-${digest}.json`) fail('pre-selection pointer record does not match its hash');
  return { schemaVersion: 'reference-pre-selection-pointer-v1', sha256: digest, record };
};

export function parseReferenceUsageV2(value: unknown): ReferenceUsageV2 {
  if (!isRecord(value)) return fail('reference usage v2 must be an object');
  const expected = ['artDirectionSha256', 'assemblySha256', 'attributionSha256', 'captureSha256', 'composerHandoffSha256', 'motionResolutionProjectionSha256', 'projectionSha256', 'rows', 'schemaVersion', 'selectionSha256', 'settledSelectionSha256']; const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return fail('reference usage v2 has unknown or missing keys'); if (value.schemaVersion !== REFERENCE_USAGE_V2_SCHEMA_VERSION) return fail(`schemaVersion must be ${REFERENCE_USAGE_V2_SCHEMA_VERSION}`);
  const input = parseReferenceUsageInput({ rows: value.rows });
  return { schemaVersion: REFERENCE_USAGE_V2_SCHEMA_VERSION, captureSha256: hash(value.captureSha256, 'captureSha256'), assemblySha256: hash(value.assemblySha256, 'assemblySha256'), projectionSha256: hash(value.projectionSha256, 'projectionSha256'), selectionSha256: hash(value.selectionSha256, 'selectionSha256'), artDirectionSha256: hash(value.artDirectionSha256, 'artDirectionSha256'), motionResolutionProjectionSha256: hash(value.motionResolutionProjectionSha256, 'motionResolutionProjectionSha256'), settledSelectionSha256: hash(value.settledSelectionSha256, 'settledSelectionSha256'), composerHandoffSha256: hash(value.composerHandoffSha256, 'composerHandoffSha256'), attributionSha256: hash(value.attributionSha256, 'attributionSha256'), rows: input.rows };
}
export const referenceUsageV2Sha256 = (usage: ReferenceUsageV2): string => sha256(canonicalJson(usage));
const artifactsFrom = (root: string, reader: SnapshotReaders, board: ReferenceUsageFileSnapshot): ReferenceBoardArtifacts => { const artifacts = reader.readArtifacts(root, board); const manifest = parse(board, 'reference board', parseReferenceBoard); if (canonicalJson(manifest) !== canonicalJson(artifacts.manifest) || canonicalJson(artifacts.raw) !== artifacts.boardBytes || canonicalJson(artifacts.assembly) !== artifacts.assemblyBytes || canonicalJson(artifacts.projection) !== artifacts.projectionBytes) fail('board artifacts do not derive from the exact sampled board bytes'); return artifacts; };
const validateSelectionAgainstArtifacts = (selection: ReferenceSelectionV2, artifacts: ReferenceBoardArtifacts): void => { const candidate = artifacts.projection.candidates.find((entry) => entry.id === selection.candidateId); if (candidate === undefined) return fail('v2 selection candidate is unavailable from the current projection'); if (candidate.pieces.length !== selection.slots.length) fail('v2 selection does not cover the current projection candidate'); const pieces = new Map(candidate.pieces.map((piece) => [piece.slotId, piece])); for (const slot of selection.slots) { const piece = pieces.get(slot.slotId); if (piece === undefined || slot.rights !== piece.rights || slot.signal !== piece.signal || slot.staticAxis !== piece.staticAxis || slot.motionAxis !== piece.motionAxis) fail(`v2 selection slot ${slot.slotId} does not match the current projection`); if ((slot.rights !== 'lawful' || slot.signal === 'anti-reference' || (slot.signal === 'high-motion' && slot.motionAxis === 'absent')) && slot.obligationDisposition === 'used') fail(`v2 selection slot ${slot.slotId} has an unlawful used disposition`); } if (!selection.slots.some((slot) => slot.signal === 'high-visual-system' && slot.rights === 'lawful' && slot.obligationDisposition === 'used')) fail('v2 selection has no lawful high-visual-system use'); };
const captureOnce = (root: string, reader: SnapshotReaders): ReferenceUsageBindings | undefined => {
  const attribution = observed(reader.readAttribution(root), 'attribution'); const board = observed(reader.readBoard(root), 'reference board'); const selectionSnapshot = observed(reader.readSelection(root), 'reference selection v2');
  const artDirectionPointer = read(root, artDirectionPointerRelativePath, 'art direction pointer'); const pointer = parse(artDirectionPointer, 'art direction pointer', validateArtDirectionPointer);
  const artDirectionRecord = read(root, `.omd/${pointer.record}`, 'art direction record'); const record = parse(artDirectionRecord, 'art direction record', validateArtDirectionRecord);
  const artDirectionHandoff = read(root, artDirectionHandoffRelativePath, 'art direction handoff');
  const preSelectionPointer = read(root, preSelectionPointerRelativePath, 'pre-selection pointer'); const prePointer = parsePreSelectionPointer(preSelectionPointer);
  const preSelectionRecord = read(root, `.omd/${prePointer.record}`, 'immutable pre-selection record'); const preSelection = parse(preSelectionRecord, 'immutable pre-selection record', parseReferenceSelectionV2);
  const motionResolution = read(root, `.omd/motion-resolutions/sha256-${record.decision.motionResolutionProjectionSha256}.json`, 'motion resolution projection');
  const immutableSettledSelection = read(root, `.omd/settled-reference-selections/sha256-${record.decision.settledSelectionSha256}.json`, 'immutable settled selection');
  const composerHandoff = read(root, composerHandoffRelativePath, 'composer handoff'); const composer = parse(composerHandoff, 'composer handoff', parseReferenceHandoffReceipt);
  const artifacts = artifactsFrom(root, reader, board); const selection = parse(selectionSnapshot, 'reference selection v2', parseReferenceSelectionV2);
  if (preSelectionPointer.bytes.toString('utf8') !== canonicalJson(prePointer)) fail('immutable pre-selection pointer is not canonical');
  if (prePointer.record !== `pre-reference-selections/sha256-${prePointer.sha256}.json`) fail('immutable pre-selection pointer record path is stale');
  if (prePointer.sha256 !== referenceSelectionV2Sha256(preSelection)) fail('immutable pre-selection pointer digest is stale');
  const settlement = validateReferenceSettlementSnapshot({
    pointerBytes: artDirectionPointer.bytes,
    recordBytes: artDirectionRecord.bytes,
    artDirectionHandoffBytes: artDirectionHandoff.bytes,
    motionResolutionBytes: motionResolution.bytes,
    settledSelectionBytes: selectionSnapshot.bytes,
    immutableSettledSelectionBytes: immutableSettledSelection.bytes,
    preSelection,
    captureSha256: sha256(artifacts.boardBytes),
    assemblySha256: sha256(artifacts.assemblyBytes),
    projectionSha256: sha256(artifacts.projectionBytes),
  });
  if (composerHandoff.bytes.toString('utf8') !== canonicalJson(composer)
    || composer.role !== 'composer'
    || composer.artDirectionSha256 !== settlement.artDirectionSha256
    || composer.preSelectionSha256 !== prePointer.sha256
    || composer.motionResolutionProjectionSha256 !== settlement.motionResolutionProjectionSha256
    || composer.settledSelectionSha256 !== settlement.settledSelectionSha256
    || canonicalJson(composer.positiveMotion) !== canonicalJson(referencePositiveMotion(settlement.settledSelection))) {
    fail('composer handoff disagrees with the current art direction settlement');
  }
  const before = { attribution, board, selection: selectionSnapshot, artDirectionPointer, artDirectionRecord, artDirectionHandoff, preSelectionPointer, preSelectionRecord, motionResolution, immutableSettledSelection, composerHandoff };
  const after = captureSettlementBytes(root, reader, before);
  if (!sameBindings(before, after)) return undefined;
  if (canonicalJson(selection) !== canonicalJson(settlement.settledSelection)
    || selection.captureSha256 !== sha256(artifacts.boardBytes)
    || selection.assemblySha256 !== sha256(artifacts.assemblyBytes)
    || selection.projectionSha256 !== sha256(artifacts.projectionBytes)) return undefined;
  validateSelectionAgainstArtifacts(selection, artifacts);
  return { bytes: before, artifacts, selection, settlement: { artDirectionSha256: settlement.artDirectionSha256, motionResolutionProjectionSha256: settlement.motionResolutionProjectionSha256, settledSelectionSha256: settlement.settledSelectionSha256, composerHandoffSha256: composer.payloadSha256 } };
};
const captureSettlementBytes = (root: string, reader: SnapshotReaders, before: BindingSnapshots): BindingSnapshots => ({ attribution: observed(reader.readAttribution(root), 'attribution'), board: observed(reader.readBoard(root), 'reference board'), selection: observed(reader.readSelection(root), 'reference selection v2'), artDirectionPointer: read(root, artDirectionPointerRelativePath, 'art direction pointer'), artDirectionRecord: read(root, relativePath(before.artDirectionRecord.identity.path, root), 'art direction record'), artDirectionHandoff: read(root, artDirectionHandoffRelativePath, 'art direction handoff'), preSelectionPointer: read(root, preSelectionPointerRelativePath, 'pre-selection pointer'), preSelectionRecord: read(root, relativePath(before.preSelectionRecord.identity.path, root), 'immutable pre-selection record'), motionResolution: read(root, relativePath(before.motionResolution.identity.path, root), 'motion resolution projection'), immutableSettledSelection: read(root, relativePath(before.immutableSettledSelection.identity.path, root), 'immutable settled selection'), composerHandoff: read(root, composerHandoffRelativePath, 'composer handoff') });
const relativePath = (path: string, root: string): string => {
  const value = relative(realpathSync(root), path);
  return value !== '' && value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value)
    ? value
    : fail('trusted decision snapshot escaped project root');
};
const checkBindings = (usage: ReferenceUsageV2, binding: ReferenceUsageBindings): void => { if (usage.captureSha256 !== sha256(binding.artifacts.boardBytes) || usage.assemblySha256 !== sha256(binding.artifacts.assemblyBytes) || usage.projectionSha256 !== sha256(binding.artifacts.projectionBytes)) fail('usage does not bind the exact board-derived capture, assembly, and projection'); if (usage.selectionSha256 !== referenceSelectionV2Sha256(binding.selection)) fail('usage does not bind the exact settled v2 selection'); const settlement = binding.settlement; if (usage.artDirectionSha256 !== settlement.artDirectionSha256 || usage.motionResolutionProjectionSha256 !== settlement.motionResolutionProjectionSha256 || usage.settledSelectionSha256 !== settlement.settledSelectionSha256 || usage.composerHandoffSha256 !== settlement.composerHandoffSha256) fail('usage does not bind the current decision-bound settlement'); if (usage.attributionSha256 !== sha256(binding.bytes.attribution.bytes)) fail('attribution hash does not match exact attribution bytes'); };
const checkRows = (root: string, reader: SnapshotReaders, usage: ReferenceUsageV2, binding: ReferenceUsageBindings): CheckedRows | undefined => { const candidate = binding.artifacts.projection.candidates.find((entry) => entry.id === binding.selection.candidateId); const rawCandidate = binding.artifacts.raw.candidates.find((entry) => entry.id === binding.selection.candidateId); const assemblyCandidate = binding.artifacts.assembly.candidates.find((entry) => entry.id === binding.selection.candidateId); if (candidate === undefined || rawCandidate === undefined || assemblyCandidate === undefined) return fail('selected candidate is unavailable from bound v2 artifacts'); if (usage.rows.length !== binding.selection.slots.length || candidate.pieces.length !== binding.selection.slots.length) return fail('usage rows must cover every selected v2 slot exactly once'); const rows = new Map(usage.rows.map((row) => [row.slotId, row])); const selectionSlots = new Map(binding.selection.slots.map((slot) => [slot.slotId, slot])); const raw = new Map(rawCandidate.pieces.map((piece) => [piece.slotId, piece])); if (rows.size !== usage.rows.length) return fail('usage rows must not duplicate v2 slots'); const pieces: ValidatedReferenceUsagePiece[] = []; const evidence: EvidenceSnapshot[] = []; for (const assembly of assemblyCandidate.pieces) { const row = rows.get(assembly.slotId); const slot = selectionSlots.get(assembly.slotId); const rawPiece = raw.get(assembly.slotId); if (row === undefined || slot === undefined || rawPiece === undefined) return fail(`usage is missing selected v2 slotId ${assembly.slotId}`); if (row.target.route !== rawCandidate.route || row.target.component !== rawPiece.targetComponent || row.target.selector !== rawPiece.targetSelector) return fail(`usage target must exactly match selected slotId ${assembly.slotId}`); const expectedStatus = slot.obligationDisposition === 'used' ? 'used' : slot.signal === 'anti-reference' ? 'anti-reference' : 'rejected'; if (row.status !== expectedStatus) return fail(`usage status must preserve v2 disposition for ${assembly.slotId}`); let before: ReferenceUsageFileSnapshot; let after: ReferenceUsageFileSnapshot; try { before = observed(reader.readEvidence(root, row.evidence.path), 'production evidence'); after = observed(reader.readEvidence(root, row.evidence.path), 'production evidence'); } catch (error) { if (unstableRead(error)) return undefined; throw error; } if (!sameReferenceUsageSnapshot(before, after)) return undefined; pieces.push({ usage: row, raw: rawPiece, assembly }); evidence.push({ path: row.evidence.path, snapshot: before }); } return { pieces, evidence }; };
const stableUsage = (root: string, reader: SnapshotReaders): { usage: ReferenceUsageV2; snapshot: ReferenceUsageFileSnapshot } | undefined => { try { const before = observed(reader.readUsage(root), 'reference usage v2'); const usage = parse(before, 'reference usage v2', parseReferenceUsageV2); const after = observed(reader.readUsage(root), 'reference usage v2'); return sameReferenceUsageSnapshot(before, after) ? { usage, snapshot: before } : undefined; } catch (error) { if (unstableRead(error)) return undefined; throw error; } };
const sameEvidence = (root: string, reader: SnapshotReaders, evidence: readonly EvidenceSnapshot[]): boolean => evidence.every((entry) => sameReferenceUsageSnapshot(entry.snapshot, observed(reader.readEvidence(root, entry.path), 'production evidence')));
const validated = (root: string, reader: SnapshotReaders): ValidatedReferenceUsage => { for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) { const current = stableUsage(root, reader); if (current === undefined) continue; let binding: ReferenceUsageBindings | undefined; try { binding = captureOnce(root, reader); } catch (error) { if (unstableRead(error)) continue; throw error; } if (binding === undefined) continue; checkBindings(current.usage, binding); const checked = checkRows(root, reader, current.usage, binding); if (checked === undefined) continue; const final = captureOnce(root, reader); const finalUsage = stableUsage(root, reader); if (final !== undefined && finalUsage !== undefined && sameBindings(binding.bytes, final.bytes) && sameReferenceUsageSnapshot(current.snapshot, finalUsage.snapshot) && sameEvidence(root, reader, checked.evidence)) return { usage: current.usage, artifacts: binding.artifacts, attribution: binding.bytes.attribution.bytes.toString('utf8'), pieces: checked.pieces }; } return fail('could not obtain a coherent v2 reference usage snapshot'); };
export const referenceUsagePath = (root: string): string => join(root, usageRelativePath);
export const trustedProductionEvidence = trustedProductionEvidencePath;
export function readValidatedReferenceUsage(root: string): ValidatedReferenceUsage { return validated(root, defaultReaders); }
export function prepareReferenceUsage(root: string, value: unknown): ReferenceUsageV2 { const input = parseReferenceUsageInput(value); for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) { let binding: ReferenceUsageBindings | undefined; try { binding = captureOnce(root, defaultReaders); } catch (error) { if (unstableRead(error)) continue; throw error; } if (binding === undefined) continue; const settlement = binding.settlement; const usage: ReferenceUsageV2 = { schemaVersion: REFERENCE_USAGE_V2_SCHEMA_VERSION, captureSha256: sha256(binding.artifacts.boardBytes), assemblySha256: sha256(binding.artifacts.assemblyBytes), projectionSha256: sha256(binding.artifacts.projectionBytes), selectionSha256: referenceSelectionV2Sha256(binding.selection), artDirectionSha256: settlement.artDirectionSha256, motionResolutionProjectionSha256: settlement.motionResolutionProjectionSha256, settledSelectionSha256: settlement.settledSelectionSha256, composerHandoffSha256: settlement.composerHandoffSha256, attributionSha256: sha256(binding.bytes.attribution.bytes), rows: input.rows }; const checked = checkRows(root, defaultReaders, usage, binding); if (checked === undefined) continue; const final = captureOnce(root, defaultReaders); if (final !== undefined && sameBindings(binding.bytes, final.bytes) && sameEvidence(root, defaultReaders, checked.evidence)) return usage; } return fail('could not obtain a coherent v2 reference usage snapshot'); }
export const writeReferenceUsage = (root: string, body: string): void => writeReferenceUsageRecord(root, 'reference-usage-v2.json', body, 'reference usage v2');
export const writeReferenceUsageV2 = (root: string, usage: ReferenceUsageV2): void => writeReferenceUsage(root, canonicalJson(usage));
export const writeReferenceReport = (root: string, body: string): void => writeReferenceUsageRecord(root, 'reference-report.md', body, 'reference report');
export const referenceReportPath = (root: string): string => join(root, '.omd', 'reference-report.md');
