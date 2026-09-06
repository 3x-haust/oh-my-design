import type {
  ClassifiedReferenceTransfer,
  ComponentCaptureTransfer,
  ImageFragmentTransfer,
  ResolvedReferenceBoard,
  ResolvedReferenceBoardPiece,
  ReferenceAxis,
  ReferenceRights,
  ReferenceSignal,
} from './board-contract.ts';
import { copyImageFragmentTransfer } from './board-fragment.ts';
import { copyComponentCaptureTransfer } from './board-transfer.ts';
import { REFERENCE_ASSEMBLY_SCHEMA_VERSION, REFERENCE_ASSEMBLY_V2_SCHEMA_VERSION } from './board-contract.ts';
import type { ReferenceInfluenceBinding } from './board-contract.ts';

export type ReferenceAssemblyPiece = {
  readonly slotId: string;
  readonly targetComponent: string;
  readonly targetSelector: string;
  readonly taskIds: readonly string[];
  readonly reason: string;
  readonly take: readonly string[];
  readonly avoid: string;
  readonly adaptation: string;
  readonly grid: { readonly column: number; readonly span: number; readonly order: number };
  readonly transfer: ComponentCaptureTransfer | ImageFragmentTransfer | ClassifiedReferenceTransfer;
  readonly binding?: ReferenceInfluenceBinding;
};

export type ReferenceAssembly = {
  readonly schemaVersion: typeof REFERENCE_ASSEMBLY_SCHEMA_VERSION | typeof REFERENCE_ASSEMBLY_V2_SCHEMA_VERSION;
  readonly frameSha256: string;
  readonly acquisitionSha256?: string;
  readonly localeContextSha256?: string | null;
  readonly candidates: readonly {
    readonly id: string;
    readonly label: string;
    readonly route: string;
    readonly rationale: string;
    readonly pieces: readonly ReferenceAssemblyPiece[];
  }[];
};

export const REFERENCE_EVIDENCE_PROJECTION_SCHEMA_VERSION = 'reference-evidence-projection-v2' as const;
export const REFERENCE_EVIDENCE_PROJECTION_V3_SCHEMA_VERSION = 'reference-evidence-projection-v3' as const;
export {
  REFERENCE_AXIS_VALUES,
  REFERENCE_RIGHTS_VALUES,
  REFERENCE_SIGNAL_VALUES,
} from './board-contract.ts';
export type {
  ReferenceAxis,
  ReferenceEvidenceAxes,
  ReferenceRights,
  ReferenceSignal,
} from './board-contract.ts';

export type ReferenceEvidenceProjectionPiece = {
  readonly slotId: string;
  readonly rights: ReferenceRights;
  readonly signal: ReferenceSignal;
  readonly staticAxis: ReferenceAxis;
  readonly motionAxis: ReferenceAxis;
  readonly binding?: ReferenceInfluenceBinding;
};

export type ReferenceEvidenceProjection = {
  readonly schemaVersion: typeof REFERENCE_EVIDENCE_PROJECTION_SCHEMA_VERSION | typeof REFERENCE_EVIDENCE_PROJECTION_V3_SCHEMA_VERSION;
  readonly frameSha256: string;
  readonly acquisitionSha256?: string;
  readonly localeContextSha256?: string | null;
  readonly candidates: readonly { readonly id: string; readonly pieces: readonly ReferenceEvidenceProjectionPiece[] }[];
};

const compareCodeUnits = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const comparePieces = (left: ResolvedReferenceBoardPiece, right: ResolvedReferenceBoardPiece): number => left.grid.order - right.grid.order || compareCodeUnits(left.slotId, right.slotId);
const projectPiece = (piece: ResolvedReferenceBoardPiece): ReferenceAssemblyPiece => {
  const common = {
    slotId: piece.slotId, targetComponent: piece.targetComponent, targetSelector: piece.targetSelector, taskIds: [...piece.taskIds],
    reason: piece.reason, take: [...piece.take], avoid: piece.avoid, adaptation: piece.adaptation,
    grid: { column: piece.grid.column, span: piece.grid.span, order: piece.grid.order },
    ...(piece.binding === undefined ? {} : { binding: { ...piece.binding, sourceViewport: { ...piece.binding.sourceViewport }, targetViewports: piece.binding.targetViewports.map((viewport) => ({ ...viewport })) } }),
  };
  switch (piece.sourceKind) {
    case 'component-capture': return { ...common, transfer: copyComponentCaptureTransfer(piece.transfer) };
    case 'image-fragment': return { ...common, transfer: copyImageFragmentTransfer(piece.transfer) };
    case 'classified-reference': return {
      ...common,
      transfer: piece.transfer.classification === 'content-only'
        ? { classification: piece.transfer.classification, principles: [...piece.transfer.principles] }
        : { classification: piece.transfer.classification, constraints: [...piece.transfer.constraints] },
    };
  }
};

const projectEvidencePiece = (piece: ResolvedReferenceBoardPiece): ReferenceEvidenceProjectionPiece => ({
  slotId: piece.slotId,
  ...(piece.binding === undefined ? {} : { binding: { ...piece.binding, sourceViewport: { ...piece.binding.sourceViewport }, targetViewports: piece.binding.targetViewports.map((viewport) => ({ ...viewport })) } }),
  ...piece.evidenceAxes,
});

export function projectReferenceAssembly(board: ResolvedReferenceBoard): ReferenceAssembly {
  return {
    schemaVersion: board.schemaVersion === 'reference-board-v3' ? REFERENCE_ASSEMBLY_V2_SCHEMA_VERSION : REFERENCE_ASSEMBLY_SCHEMA_VERSION,
    frameSha256: board.frameSha256,
    ...(board.schemaVersion === 'reference-board-v3' ? { acquisitionSha256: board.acquisitionSha256, localeContextSha256: board.localeContextSha256 } : {}),
    candidates: [...board.candidates]
      .sort((left, right) => compareCodeUnits(left.id, right.id))
      .map((candidate) => ({ id: candidate.id, label: candidate.label, route: candidate.route, rationale: candidate.rationale, pieces: [...candidate.pieces].sort(comparePieces).map(projectPiece) })),
  };
}

export function projectReferenceEvidence(board: ResolvedReferenceBoard): ReferenceEvidenceProjection {
  return {
    schemaVersion: board.schemaVersion === 'reference-board-v3' ? REFERENCE_EVIDENCE_PROJECTION_V3_SCHEMA_VERSION : REFERENCE_EVIDENCE_PROJECTION_SCHEMA_VERSION,
    frameSha256: board.frameSha256,
    ...(board.schemaVersion === 'reference-board-v3' ? { acquisitionSha256: board.acquisitionSha256, localeContextSha256: board.localeContextSha256 } : {}),
    candidates: [...board.candidates]
      .sort((left, right) => compareCodeUnits(left.id, right.id))
      .map((candidate) => ({ id: candidate.id, pieces: [...candidate.pieces].sort(comparePieces).map(projectEvidencePiece) })),
  };
}
