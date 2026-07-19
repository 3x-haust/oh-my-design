import type {
  ComponentCaptureTransfer,
  ImageFragmentTransfer,
  ResolvedReferenceBoard,
  ResolvedReferenceBoardPiece,
} from './board-contract.ts';
import { copyImageFragmentTransfer } from './board-fragment.ts';
import { copyComponentCaptureTransfer } from './board-transfer.ts';
import { REFERENCE_ASSEMBLY_SCHEMA_VERSION } from './board-contract.ts';

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
  readonly transfer: ComponentCaptureTransfer | ImageFragmentTransfer;
};

export type ReferenceAssembly = {
  readonly schemaVersion: typeof REFERENCE_ASSEMBLY_SCHEMA_VERSION;
  readonly frameSha256: string;
  readonly candidates: readonly {
    readonly id: string;
    readonly label: string;
    readonly route: string;
    readonly rationale: string;
    readonly pieces: readonly ReferenceAssemblyPiece[];
  }[];
};

const compareCodeUnits = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const comparePieces = (left: ResolvedReferenceBoardPiece, right: ResolvedReferenceBoardPiece): number => left.grid.order - right.grid.order || compareCodeUnits(left.slotId, right.slotId);
const projectPiece = (piece: ResolvedReferenceBoardPiece): ReferenceAssemblyPiece => {
  const common = {
    slotId: piece.slotId, targetComponent: piece.targetComponent, targetSelector: piece.targetSelector, taskIds: [...piece.taskIds],
    reason: piece.reason, take: [...piece.take], avoid: piece.avoid, adaptation: piece.adaptation,
    grid: { column: piece.grid.column, span: piece.grid.span, order: piece.grid.order },
  };
  switch (piece.sourceKind) {
    case 'component-capture': return { ...common, transfer: copyComponentCaptureTransfer(piece.transfer) };
    case 'image-fragment': return { ...common, transfer: copyImageFragmentTransfer(piece.transfer) };
  }
};

export function projectReferenceAssembly(board: ResolvedReferenceBoard): ReferenceAssembly {
  return {
    schemaVersion: REFERENCE_ASSEMBLY_SCHEMA_VERSION,
    frameSha256: board.frameSha256,
    candidates: [...board.candidates]
      .sort((left, right) => compareCodeUnits(left.id, right.id))
      .map((candidate) => ({ id: candidate.id, label: candidate.label, route: candidate.route, rationale: candidate.rationale, pieces: [...candidate.pieces].sort(comparePieces).map(projectPiece) })),
  };
}
