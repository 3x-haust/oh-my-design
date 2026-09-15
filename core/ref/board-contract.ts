import type { BlueprintNode, Invariants, Reference } from '../types.ts';
import type { ReferenceInfluenceAxis } from '../deliberation/contracts.ts';
import type { ReferenceFeatureMeasurement } from './feature-measurement.ts';

export const REFERENCE_BOARD_SCHEMA_VERSION = 'reference-board-v1' as const;
export const REFERENCE_BOARD_V2_SCHEMA_VERSION = 'reference-board-v2' as const;
export const REFERENCE_BOARD_V3_SCHEMA_VERSION = 'reference-board-v3' as const;
export const REFERENCE_ASSEMBLY_SCHEMA_VERSION = 'reference-assembly-v1' as const;
export const REFERENCE_ASSEMBLY_V2_SCHEMA_VERSION = 'reference-assembly-v2' as const;
export const BOARD_TAKE_VALUES = ['structure', 'proportion', 'density', 'rhythm', 'motion', 'content', 'voice', 'rejection'] as const;
export type BoardTake = (typeof BOARD_TAKE_VALUES)[number];
export type BoardSourceKind = 'component-capture' | 'image-fragment' | 'classified-reference';

export const REFERENCE_RIGHTS_VALUES = ['lawful', 'restricted', 'unknown'] as const;
export const REFERENCE_SIGNAL_VALUES = ['high-visual-system', 'high-motion', 'supporting-component', 'supporting-content', 'anti-reference'] as const;
export const REFERENCE_AXIS_VALUES = ['available', 'absent'] as const;
export type ReferenceRights = (typeof REFERENCE_RIGHTS_VALUES)[number];
export type ReferenceSignal = (typeof REFERENCE_SIGNAL_VALUES)[number];
export type ReferenceAxis = (typeof REFERENCE_AXIS_VALUES)[number];

export type ReferenceEvidenceAxes = {
  readonly rights: ReferenceRights;
  readonly signal: ReferenceSignal;
  readonly staticAxis: ReferenceAxis;
  readonly motionAxis: ReferenceAxis;
};

export type ReferenceBoardGrid = {
  readonly column: number;
  readonly span: number;
  readonly order: number;
};

export type ReferenceInfluenceBinding = {
  readonly zoneId: string;
  readonly decisionId: string;
  readonly axis: ReferenceInfluenceAxis;
  readonly sourceState: string;
  readonly sourceViewport: { readonly width: number; readonly height: number };
  readonly targetViewports: readonly { readonly width: number; readonly height: number }[];
  readonly responsiveConsequence: string;
  readonly conflictGroup: string | null;
  readonly conflictResolution: string | null;
  readonly falsifier: string;
  /** Optional exact correspondence when the promised feature is narrower than the full DOM. */
  readonly measurements?: readonly ReferenceFeatureMeasurement[];
};

export const copyReferenceInfluenceBinding = (binding: ReferenceInfluenceBinding): ReferenceInfluenceBinding => ({
  ...binding, sourceViewport: { ...binding.sourceViewport }, targetViewports: binding.targetViewports.map(viewport => ({ ...viewport })),
  ...(binding.measurements === undefined ? {} : { measurements: binding.measurements.map(measurement => ({
    ...measurement, sourceNodes: [...measurement.sourceNodes], targetAnchors: [...measurement.targetAnchors],
  })) }),
});

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
  readonly evidenceAxes: ReferenceEvidenceAxes;
  readonly binding?: ReferenceInfluenceBinding;
};

export type ReferenceBoardComponentPiece = ReferenceBoardPieceBase & {
  readonly sourceKind: 'component-capture';
};

export type ReferenceBoardImageFragmentPiece = ReferenceBoardPieceBase & {
  readonly sourceKind: 'image-fragment';
};

export type ReferenceBoardClassifiedPiece = ReferenceBoardPieceBase & {
  readonly sourceKind: 'classified-reference';
  readonly classification: {
    readonly kind: 'content-only' | 'anti-reference';
    readonly sha256: string;
  };
};

export type ReferenceBoardPiece = ReferenceBoardComponentPiece | ReferenceBoardImageFragmentPiece | ReferenceBoardClassifiedPiece;

export type ReferenceBoardCandidate = {
  readonly id: string;
  readonly label: string;
  readonly route: string;
  readonly rationale: string;
  readonly pieces: readonly ReferenceBoardPiece[];
};

export type ReferenceBoardManifest =
  | {
    readonly schemaVersion: typeof REFERENCE_BOARD_SCHEMA_VERSION;
    readonly frameSha256: string;
    readonly candidates: readonly ReferenceBoardCandidate[];
  }
  | {
    readonly schemaVersion: typeof REFERENCE_BOARD_V2_SCHEMA_VERSION;
    readonly projectSha256: string;
    readonly frameSha256: string;
    readonly candidates: readonly ReferenceBoardCandidate[];
  }
  | {
    readonly schemaVersion: typeof REFERENCE_BOARD_V3_SCHEMA_VERSION;
    readonly projectSha256: string;
    readonly frameSha256: string;
    readonly acquisitionSha256: string;
    readonly localeContextSha256: string | null;
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
  readonly position?: { readonly x: number; readonly y: number };
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

export type ClassifiedReferenceTransfer =
  | { readonly classification: 'content-only'; readonly principles: readonly string[] }
  | { readonly classification: 'anti-reference'; readonly constraints: readonly string[] };

export type ResolvedClassifiedReferencePiece = ReferenceBoardClassifiedPiece & {
  readonly reference: Pick<Reference, 'source' | 'component' | 'capturedAt'>;
  readonly transfer: ClassifiedReferenceTransfer;
};

export type ResolvedReferenceBoardPiece = ResolvedComponentCapturePiece | ResolvedImageFragmentPiece | ResolvedClassifiedReferencePiece;

export type ResolvedReferenceBoardCandidate = Omit<ReferenceBoardCandidate, 'pieces'> & {
  readonly pieces: readonly ResolvedReferenceBoardPiece[];
};

export type ResolvedReferenceBoard = {
  readonly schemaVersion: ReferenceBoardManifest['schemaVersion'];
  readonly projectSha256?: string;
  readonly frameSha256: string;
  readonly acquisitionSha256?: string;
  readonly localeContextSha256?: string | null;
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
