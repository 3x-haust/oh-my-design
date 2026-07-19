import type { BlueprintNode, Invariants, Reference } from '../types.ts';

export const REFERENCE_BOARD_SCHEMA_VERSION = 'reference-board-v1' as const;
export const REFERENCE_ASSEMBLY_SCHEMA_VERSION = 'reference-assembly-v1' as const;
export const BOARD_TAKE_VALUES = ['structure', 'proportion', 'density', 'rhythm', 'motion'] as const;
export type BoardTake = (typeof BOARD_TAKE_VALUES)[number];
export type BoardSourceKind = 'component-capture' | 'image-fragment';

export type ReferenceBoardGrid = {
  readonly column: number;
  readonly span: number;
  readonly order: number;
};

type ReferenceBoardPieceBase = {
  readonly slotId: string;
  readonly referenceId: string;
  readonly targetComponent: string;
  readonly targetSelector: string;
  readonly taskIds: readonly string[];
  readonly reason: string;
  readonly take: readonly BoardTake[];
  readonly avoid: string;
  readonly adaptation: string;
  readonly grid: ReferenceBoardGrid;
};

export type ReferenceBoardComponentPiece = ReferenceBoardPieceBase & {
  readonly sourceKind: 'component-capture';
};

export type ReferenceBoardImageFragmentPiece = ReferenceBoardPieceBase & {
  readonly sourceKind: 'image-fragment';
};

export type ReferenceBoardPiece = ReferenceBoardComponentPiece | ReferenceBoardImageFragmentPiece;

export type ReferenceBoardCandidate = {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly rationale: string;
  readonly pieces: readonly ReferenceBoardPiece[];
};

export type ReferenceBoardManifest = {
  readonly schemaVersion: typeof REFERENCE_BOARD_SCHEMA_VERSION;
  readonly frameSha256: string;
  readonly candidates: readonly ReferenceBoardCandidate[];
};

export type ResolvedComponentCapturePiece = ReferenceBoardComponentPiece & {
  readonly reference: Reference;
  readonly imagePath: string;
  readonly transfer: ComponentCaptureTransfer;
};

export type SanitizedBlueprintNode = {
  readonly role: BlueprintNode['role'];
  readonly children: readonly number[];
  readonly box: { readonly w: number; readonly h: number };
  readonly padding?: readonly number[];
  readonly gap?: number;
  readonly direction?: BlueprintNode['direction'];
  readonly fontSize?: number;
  readonly fontWeight?: number;
  readonly lineHeight?: number;
  readonly radius?: number;
  readonly hasShadow?: boolean;
  readonly fillRole?: BlueprintNode['fillRole'];
  readonly textRole?: BlueprintNode['textRole'];
  readonly motionDurations?: readonly number[];
  readonly motionEasings?: readonly string[];
  readonly textLength?: BlueprintNode['textLength'];
};

export type ComponentCaptureTransfer = {
  readonly invariants: Invariants;
  readonly principles: readonly string[];
  readonly blueprint: { readonly nodes: readonly SanitizedBlueprintNode[] };
};

export type ImageFragmentCropBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type ImageFragmentProvenance = {
  readonly sourcePage: string;
  readonly sourceImage?: string;
  readonly captureRegion: string;
  readonly cropBox?: ImageFragmentCropBox;
  readonly licenseStatus: 'allowed' | 'restricted' | 'unknown';
  readonly rightsNotes: string;
  readonly capturedAt: string;
};

export type ImageFragmentGeometry = {
  readonly width: number;
  readonly height: number;
  readonly aspectRatio: number;
};

export type ImageFragmentTransfer = {
  readonly visualRole: string;
  readonly principles: readonly string[];
  readonly geometry?: ImageFragmentGeometry;
};

export type ResolvedImageFragmentPiece = ReferenceBoardImageFragmentPiece & {
  readonly imagePath: string;
  readonly provenance: ImageFragmentProvenance;
  readonly transfer: ImageFragmentTransfer;
};

export type ResolvedReferenceBoardPiece = ResolvedComponentCapturePiece | ResolvedImageFragmentPiece;

export type ResolvedReferenceBoardCandidate = Omit<ReferenceBoardCandidate, 'pieces'> & {
  readonly pieces: readonly ResolvedReferenceBoardPiece[];
};

export type ResolvedReferenceBoard = Omit<ReferenceBoardManifest, 'candidates'> & {
  readonly candidates: readonly ResolvedReferenceBoardCandidate[];
};

export interface ImageFragmentResolver {
  resolve(root: string, piece: ReferenceBoardImageFragmentPiece): ResolvedImageFragmentPiece;
}

export class ReferenceBoardValidationError extends Error {
  override readonly name = 'ReferenceBoardValidationError';
  readonly reason: string;

  constructor(reason: string) {
    super(`reference board is invalid: ${reason}`);
    this.reason = reason;
  }
}

export class ReferenceBoardResolutionError extends Error {
  override readonly name = 'ReferenceBoardResolutionError';
  readonly reason: string;

  constructor(reason: string) {
    super(`reference board cannot resolve: ${reason}`);
    this.reason = reason;
  }
}

export class ReferenceBoardImageFragmentUnsupportedError extends Error {
  override readonly name = 'ReferenceBoardImageFragmentUnsupportedError';
  readonly referenceId: string;

  constructor(referenceId: string) {
    super(`reference board image-fragment ${referenceId} is not integrated`);
    this.referenceId = referenceId;
  }
}
