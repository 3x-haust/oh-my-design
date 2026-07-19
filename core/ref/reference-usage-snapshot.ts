import { join } from 'node:path';
import { canonicalJson, readReferenceBoardArtifacts, sha256, type RawBoardPiece, type ReferenceBoardArtifacts } from './board-artifacts.ts';
import { parseReferenceBoard } from './board-parser.ts';
import type { ReferenceAssemblyPiece } from './board-projection.ts';
import { readTrustedProductionEvidence, readTrustedReferenceUsageSnapshot, sameReferenceUsageSnapshot, trustedProductionEvidencePath, trustedReferenceUsageFile, writeReferenceUsageRecord, type ReferenceUsageFileSnapshot } from './reference-usage-files.ts';
import { parseReferenceSelection } from './reference-selection.ts';
import { parseReferenceUsage, parseReferenceUsageInput, ReferenceUsageValidationError, type ReferenceUsage, type ReferenceUsageRow } from './reference-usage-parser.ts';

const ATTEMPTS = 3;
const usageRelativePath = '.omd/reference-usage.json';
const attributionRelativePath = '.omd/attribution.md';
const boardRelativePath = '.omd/reference-board.json';
const selectionRelativePath = '.omd/reference-selection.json';

export type ValidatedReferenceUsagePiece = { readonly usage: ReferenceUsageRow; readonly raw: RawBoardPiece; readonly assembly: ReferenceAssemblyPiece };
export type ValidatedReferenceUsage = { readonly usage: ReferenceUsage; readonly artifacts: ReferenceBoardArtifacts; readonly attribution: string; readonly pieces: readonly ValidatedReferenceUsagePiece[] };
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
type ReferenceUsageBindings = { readonly bytes: BindingSnapshots; readonly artifacts: ReferenceBoardArtifacts };
type EvidenceSnapshot = { readonly path: string; readonly snapshot: ReferenceUsageFileSnapshot };
type CheckedRows = { readonly pieces: readonly ValidatedReferenceUsagePiece[]; readonly evidence: readonly EvidenceSnapshot[] };

const fail = (reason: string): never => { throw new ReferenceUsageValidationError(reason); };
const defaultReaders: SnapshotReaders = {
  readUsage: (root) => readTrustedReferenceUsageSnapshot(root, usageRelativePath, 'reference usage'),
  readAttribution: (root) => readTrustedReferenceUsageSnapshot(root, attributionRelativePath, 'attribution'),
  readBoard: (root) => readTrustedReferenceUsageSnapshot(root, boardRelativePath, 'reference board'),
  readSelection: (root) => readTrustedReferenceUsageSnapshot(root, selectionRelativePath, 'reference selection'),
  readArtifacts: (root) => readReferenceBoardArtifacts(root, trustedReferenceUsageFile(root, boardRelativePath, 'reference board')),
  readEvidence: readTrustedProductionEvidence,
  afterEvidenceChecks: () => undefined,
};
const readers = (overrides?: ReferenceUsageReaders): SnapshotReaders => ({ ...defaultReaders, ...overrides });
const injectedSnapshot = (bytes: Buffer, label: string): ReferenceUsageFileSnapshot => ({ bytes, identity: { path: `<injected:${label}>`, dev: 0, ino: 0, size: bytes.length, mtimeMs: 0, ctimeMs: 0 } });
const observed = (value: SnapshotInput, label: string): ReferenceUsageFileSnapshot => {
  if (Buffer.isBuffer(value)) return injectedSnapshot(value, label);
  const { bytes, identity } = value;
  if (!Buffer.isBuffer(bytes) || identity.size !== bytes.length || !Number.isFinite(identity.dev) || !Number.isFinite(identity.ino) || !Number.isFinite(identity.mtimeMs) || !Number.isFinite(identity.ctimeMs) || identity.path === '') return fail(`${label} reader returned an invalid snapshot`);
  return value;
};
const bindings = (root: string, reader: SnapshotReaders): BindingSnapshots => ({ attribution: observed(reader.readAttribution(root), 'attribution'), board: observed(reader.readBoard(root), 'reference board'), selection: observed(reader.readSelection(root), 'reference selection') });
const sameBindings = (left: BindingSnapshots, right: BindingSnapshots): boolean => sameReferenceUsageSnapshot(left.attribution, right.attribution) && sameReferenceUsageSnapshot(left.board, right.board) && sameReferenceUsageSnapshot(left.selection, right.selection);
const parse = <T>(snapshot: ReferenceUsageFileSnapshot, label: string, parser: (value: unknown) => T): T => {
  try { return parser(JSON.parse(snapshot.bytes.toString('utf8'))); } catch (error) {
    if (error instanceof ReferenceUsageValidationError) throw error;
    if (error instanceof Error) return fail(`${label} is invalid: ${error.message}`);
    return fail(`${label} is invalid`);
  }
};
const selected = (artifacts: ReferenceBoardArtifacts, candidateId: string) => {
  const raw = artifacts.raw.candidates.find((candidate) => candidate.id === candidateId); const assembly = artifacts.assembly.candidates.find((candidate) => candidate.id === candidateId);
  if (raw === undefined || assembly === undefined) return fail('selected candidate is unavailable from the bound board');
  return { raw, assembly };
};
const artifactsFrom = (root: string, reader: SnapshotReaders, board: ReferenceUsageFileSnapshot): ReferenceBoardArtifacts => {
  const artifacts = reader.readArtifacts(root, board); const manifest = parse(board, 'reference board', parseReferenceBoard);
  if (canonicalJson(manifest) !== canonicalJson(artifacts.manifest) || canonicalJson(artifacts.raw) !== artifacts.boardBytes || canonicalJson(artifacts.assembly) !== artifacts.assemblyBytes) fail('board artifacts do not derive from the exact sampled board bytes');
  return artifacts;
};
const sameArtifacts = (left: ReferenceBoardArtifacts, right: ReferenceBoardArtifacts): boolean => left.boardBytes === right.boardBytes && left.assemblyBytes === right.assemblyBytes && canonicalJson(left.manifest) === canonicalJson(right.manifest);
const sameCapture = (left: ReferenceUsageBindings, right: ReferenceUsageBindings): boolean => sameBindings(left.bytes, right.bytes) && sameArtifacts(left.artifacts, right.artifacts);
const unstableRead = (error: unknown): boolean => error instanceof ReferenceUsageValidationError && error.reason.endsWith('changed while it was read');

const captureOnce = (root: string, reader: SnapshotReaders): ReferenceUsageBindings | undefined => {
  const before = bindings(root, reader); const artifacts = artifactsFrom(root, reader, before.board); const selection = parse(before.selection, 'reference selection', parseReferenceSelection);
  const after = bindings(root, reader); const verificationArtifacts = artifactsFrom(root, reader, after.board); const verificationSelection = parse(after.selection, 'reference selection', parseReferenceSelection); const settled = bindings(root, reader);
  if (!sameBindings(before, after) || !sameBindings(after, settled) || !sameArtifacts(artifacts, verificationArtifacts) || canonicalJson(selection) !== canonicalJson(verificationSelection)) return undefined;
  if (selection.boardSha256 !== sha256(artifacts.boardBytes) || selection.assemblySha256 !== sha256(artifacts.assemblyBytes)) return undefined;
  return { bytes: before, artifacts };
};
const attemptedCapture = (root: string, reader: SnapshotReaders): ReferenceUsageBindings | undefined => {
  try { return captureOnce(root, reader); } catch (error) { if (unstableRead(error)) return undefined; throw error; }
};
const checkBindings = (usage: ReferenceUsage, binding: ReferenceUsageBindings): void => {
  const { bytes, artifacts } = binding;
  if (usage.rawBoardSha256 !== sha256(artifacts.boardBytes)) fail('raw board hash does not match the current canonical raw board');
  if (usage.assemblySha256 !== sha256(artifacts.assemblyBytes)) fail('assembly hash does not match the current sanitized assembly');
  if (usage.selectionSha256 !== sha256(bytes.selection.bytes)) fail('selection hash does not match exact selection bytes');
  if (usage.attributionSha256 !== sha256(bytes.attribution.bytes)) fail('attribution hash does not match exact attribution bytes');
};
const checkRows = (root: string, reader: SnapshotReaders, usage: ReferenceUsage, artifacts: ReferenceBoardArtifacts, selectionBytes: Buffer): CheckedRows | undefined => {
  const selection = parse({ bytes: selectionBytes, identity: { path: '<bound-selection>', dev: 0, ino: 0, size: selectionBytes.length, mtimeMs: 0, ctimeMs: 0 } }, 'reference selection', parseReferenceSelection);
  if (selection.boardSha256 !== sha256(artifacts.boardBytes) || selection.assemblySha256 !== sha256(artifacts.assemblyBytes)) fail('selection is stale against the current board or assembly');
  const candidate = selected(artifacts, selection.candidateId); const rawBySlot = new Map(candidate.raw.pieces.map((piece) => [piece.slotId, piece])); const usageBySlot = new Map(usage.rows.map((row) => [row.slotId, row]));
  if (usageBySlot.size !== candidate.assembly.pieces.length || rawBySlot.size !== candidate.assembly.pieces.length) fail('usage rows must map exactly one row to every selected candidate piece');
  const pieces: ValidatedReferenceUsagePiece[] = []; const evidence: EvidenceSnapshot[] = [];
  for (const assembly of candidate.assembly.pieces) {
    const raw = rawBySlot.get(assembly.slotId); const row = usageBySlot.get(assembly.slotId);
    if (raw === undefined || row === undefined) return fail(`usage is missing selected slotId ${assembly.slotId}`);
    if (row.target.route !== candidate.raw.route || row.target.component !== raw.targetComponent || row.target.selector !== raw.targetSelector) return fail(`usage target must exactly match selected slotId ${assembly.slotId}`);
    let before: ReferenceUsageFileSnapshot; let after: ReferenceUsageFileSnapshot;
    try { before = observed(reader.readEvidence(root, row.evidence.path), 'production evidence'); after = observed(reader.readEvidence(root, row.evidence.path), 'production evidence'); } catch (error) { if (unstableRead(error)) return undefined; throw error; }
    if (!sameReferenceUsageSnapshot(before, after)) return undefined;
    pieces.push({ usage: row, raw, assembly }); evidence.push({ path: row.evidence.path, snapshot: before });
  }
  return { pieces, evidence };
};
const sameEvidence = (root: string, reader: SnapshotReaders, evidence: readonly EvidenceSnapshot[]): boolean => {
  try {
    return evidence.every((entry) => sameReferenceUsageSnapshot(entry.snapshot, observed(reader.readEvidence(root, entry.path), 'production evidence')));
  } catch (error) { if (unstableRead(error)) return false; throw error; }
};
const stableUsage = (root: string, reader: SnapshotReaders): { readonly usage: ReferenceUsage; readonly snapshot: ReferenceUsageFileSnapshot } | undefined => {
  try {
    const before = observed(reader.readUsage(root), 'reference usage'); const usage = parse(before, 'reference usage', parseReferenceUsage); const after = observed(reader.readUsage(root), 'reference usage');
    return sameReferenceUsageSnapshot(before, after) ? { usage, snapshot: before } : undefined;
  } catch (error) { if (unstableRead(error)) return undefined; throw error; }
};

export const referenceUsagePath = (root: string): string => join(root, usageRelativePath);
export const trustedProductionEvidence = trustedProductionEvidencePath;

export function readValidatedReferenceUsage(root: string, overrides?: ReferenceUsageReaders): ValidatedReferenceUsage {
  const reader = readers(overrides);
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const current = stableUsage(root, reader); if (current === undefined) continue;
    const binding = attemptedCapture(root, reader); const settledUsage = observed(reader.readUsage(root), 'reference usage');
    if (binding === undefined || !sameReferenceUsageSnapshot(current.snapshot, settledUsage)) continue;
    checkBindings(current.usage, binding); const checked = checkRows(root, reader, current.usage, binding.artifacts, binding.bytes.selection.bytes);
    if (checked === undefined) continue;
    reader.afterEvidenceChecks(root); const finalBinding = attemptedCapture(root, reader); const finalUsage = stableUsage(root, reader);
    if (finalBinding !== undefined && finalUsage !== undefined && sameCapture(binding, finalBinding) && sameReferenceUsageSnapshot(current.snapshot, finalUsage.snapshot) && sameEvidence(root, reader, checked.evidence)) return { usage: current.usage, artifacts: binding.artifacts, attribution: binding.bytes.attribution.bytes.toString('utf8'), pieces: checked.pieces };
  }
  return fail('could not obtain a coherent reference usage snapshot');
}

export function prepareReferenceUsage(root: string, value: unknown, overrides?: ReferenceUsageReaders): ReferenceUsage {
  const reader = readers(overrides); const parsed = parseReferenceUsageInput(value);
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const binding = attemptedCapture(root, reader); if (binding === undefined) continue;
    const usage: ReferenceUsage = { schemaVersion: 'reference-usage-v1', rawBoardSha256: sha256(binding.artifacts.boardBytes), assemblySha256: sha256(binding.artifacts.assemblyBytes), selectionSha256: sha256(binding.bytes.selection.bytes), attributionSha256: sha256(binding.bytes.attribution.bytes), rows: parsed.rows };
    const checked = checkRows(root, reader, usage, binding.artifacts, binding.bytes.selection.bytes); if (checked === undefined) continue;
    reader.afterEvidenceChecks(root); const finalBinding = attemptedCapture(root, reader);
    if (finalBinding !== undefined && sameCapture(binding, finalBinding) && sameEvidence(root, reader, checked.evidence)) return usage;
  }
  return fail('could not obtain a coherent reference usage snapshot');
}

export const writeReferenceUsage = (root: string, body: string): void => writeReferenceUsageRecord(root, 'reference-usage.json', body, 'reference usage');
export const writeReferenceReport = (root: string, body: string): void => writeReferenceUsageRecord(root, 'reference-report.md', body, 'reference report');
export const referenceReportPath = (root: string): string => join(root, '.omd', 'reference-report.md');
