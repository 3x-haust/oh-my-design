import type { FigmaCompareRecord } from './compare.ts';
import type { FigmaDiffRecord } from './diff-record.ts';
import type {
  FigmaFidelityFix,
  FigmaFidelityReview,
  FigmaFidelityReviewBindings,
} from './review-contract.ts';
import type { SnapshotFrame } from './types.ts';

export const FIGMA_FIDELITY_REVIEW_SCHEMA = 'omd-figma-fidelity-review-v1';
export const FIGMA_FIX_STUCK_ROUNDS = 3;

export type FigmaFixHistoryRound = Readonly<{
  compareSha256: string;
  unresolved: readonly Readonly<{ id: string; count: number }>[];
}>;

export type FigmaFidelityReviewRecordBody = Readonly<{
  schema: typeof FIGMA_FIDELITY_REVIEW_SCHEMA;
  frameId: string;
  safeId: string;
  diffSha256: string;
  compareSha256: string;
  previousReviewSha256: string | null;
  bindings: FigmaFidelityReviewBindings;
  packetSha256: string;
  review: FigmaFidelityReview;
  history: readonly FigmaFixHistoryRound[];
  roleResult: unknown;
}>;

export type FigmaFidelityReviewRecord = FigmaFidelityReviewRecordBody & Readonly<{
  signature: string;
  sha256: string;
}>;

export type PreparedFigmaReview = Readonly<{
  snapshotBytes: Buffer;
  frame: SnapshotFrame;
  diff: FigmaDiffRecord;
  diffBytes: Buffer;
  diffSha256: string;
  compare: FigmaCompareRecord;
  compareBytes: Buffer;
  compareSha256: string;
  previous: FigmaFidelityReviewRecord | null;
  bindings: FigmaFidelityReviewBindings;
  packet: Buffer;
}>;

export type FigmaFidelityReviewResult = Readonly<{
  path: string;
  sha256: string;
  verdict: FigmaFidelityReview['verdict'];
  fixes: readonly FigmaFidelityFix[];
  priorFixes: FigmaFidelityReview['priorFixes'];
  stuckFixes: readonly Readonly<{ id: string; count: number }>[];
}>;

export const figmaFidelityReviewPath = (frameId: string): string =>
  `.omd/figma/reviews/${frameId.replaceAll(/[:/]/g, '_')}.json`;

export const figmaReviewFail = (reason: string): never => {
  throw new Error(`FIGMA_FIDELITY_REVIEW_INVALID: ${reason}`);
};
