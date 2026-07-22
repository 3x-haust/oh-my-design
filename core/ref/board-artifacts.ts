import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseReferenceBoard } from './board-parser.ts';
import { projectReferenceAssembly, projectReferenceEvidence } from './board-projection.ts';
import { trustedProjectRoot } from './board-security.ts';
import { resolveReferenceBoard } from './board.ts';
import type { ReferenceAssembly, ReferenceEvidenceProjection } from './board-projection.ts';
import type { ReferenceBoardManifest, ResolvedReferenceBoard, ResolvedReferenceBoardPiece } from './board-contract.ts';

export const REFERENCE_BOARD_EVIDENCE_SCHEMA_VERSION = 'reference-board-evidence-v1';

export type RawBoardEvidence =
  | { readonly kind: 'component-capture'; readonly source: string; readonly component: string; readonly selector: string; readonly capturedAt: string; readonly imagePath: string; readonly imageSha256: string }
  | { readonly kind: 'image-fragment'; readonly sourcePage: string; readonly sourceImage?: string; readonly captureRegion: string; readonly cropBox?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }; readonly licenseStatus: string; readonly rightsNotes: string; readonly capturedAt: string; readonly imagePath: string; readonly imageSha256: string };

export type RawBoardPiece = {
  readonly slotId: string;
  readonly sourceKind: ResolvedReferenceBoardPiece['sourceKind'];
  readonly referenceId: string;
  readonly targetComponent: string;
  readonly targetSelector: string;
  readonly taskIds: readonly string[];
  readonly reason: string;
  readonly take: readonly string[];
  readonly avoid: string;
  readonly adaptation: string;
  readonly grid: { readonly column: number; readonly span: number; readonly order: number };
  readonly evidence: RawBoardEvidence;
};

export type RawReferenceBoard = {
  readonly schemaVersion: typeof REFERENCE_BOARD_EVIDENCE_SCHEMA_VERSION;
  readonly frameSha256: string;
  readonly candidates: readonly { readonly id: string; readonly label: string; readonly route: string; readonly rationale: string; readonly pieces: readonly RawBoardPiece[] }[];
};

export type ReferenceBoardArtifacts = {
  readonly manifest: ReferenceBoardManifest;
  readonly resolved: ResolvedReferenceBoard;
  readonly raw: RawReferenceBoard;
  readonly assembly: ReferenceAssembly;
  readonly projection: ReferenceEvidenceProjection;
  readonly boardBytes: string;
  readonly assemblyBytes: string;
  readonly projectionBytes: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const encode = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${encode(value[key])}`).join(',')}}`;
};

export const canonicalJson = (value: unknown): string => `${encode(value)}\n`;
export const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const common = (piece: ResolvedReferenceBoardPiece): Omit<RawBoardPiece, 'evidence'> => ({
  slotId: piece.slotId, sourceKind: piece.sourceKind, referenceId: piece.referenceId,
  targetComponent: piece.targetComponent, targetSelector: piece.targetSelector, taskIds: [...piece.taskIds],
  reason: piece.reason, take: [...piece.take], avoid: piece.avoid, adaptation: piece.adaptation,
  grid: { column: piece.grid.column, span: piece.grid.span, order: piece.grid.order },
});
const rawPiece = (root: string, piece: ResolvedReferenceBoardPiece): RawBoardPiece => {
  const imageSha256 = sha256(readFileSync(piece.imagePath));
  switch (piece.sourceKind) {
    case 'component-capture': return {
      ...common(piece),
      evidence: { kind: piece.sourceKind, source: piece.reference.source, component: piece.reference.component, selector: piece.reference.selector ?? '', capturedAt: piece.reference.capturedAt, imagePath: piece.reference.imagePath ?? '', imageSha256 },
    };
    case 'image-fragment': return {
      ...common(piece),
      evidence: {
        kind: piece.sourceKind, sourcePage: piece.provenance.sourcePage, ...(piece.provenance.sourceImage === undefined ? {} : { sourceImage: piece.provenance.sourceImage }),
        captureRegion: piece.provenance.captureRegion, ...(piece.provenance.cropBox === undefined ? {} : { cropBox: { ...piece.provenance.cropBox } }),
        licenseStatus: piece.provenance.licenseStatus, rightsNotes: piece.provenance.rightsNotes, capturedAt: piece.provenance.capturedAt,
        imagePath: relative(root, piece.imagePath), imageSha256,
      },
    };
  }
};
export const projectRawReferenceBoard = (root: string, board: ResolvedReferenceBoard): RawReferenceBoard => ({
  schemaVersion: REFERENCE_BOARD_EVIDENCE_SCHEMA_VERSION,
  frameSha256: board.frameSha256,
  candidates: board.candidates.map((candidate) => ({
    id: candidate.id, label: candidate.label, route: candidate.route, rationale: candidate.rationale,
    pieces: candidate.pieces.map((piece) => rawPiece(root, piece)),
  })),
});

export function readReferenceBoardArtifacts(root: string, manifestPath = join(root, '.omd', 'reference-board.json')): ReferenceBoardArtifacts {
  const canonicalRoot = trustedProjectRoot(root);
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const manifest = parseReferenceBoard(parsed);
  const resolved = resolveReferenceBoard(canonicalRoot, manifest);
  const raw = projectRawReferenceBoard(canonicalRoot, resolved);
  const assembly = projectReferenceAssembly(resolved);
  const projection = projectReferenceEvidence(resolved);
  return {
    manifest, resolved, raw, assembly, projection,
    boardBytes: canonicalJson(raw), assemblyBytes: canonicalJson(assembly), projectionBytes: canonicalJson(projection),
  };
}
