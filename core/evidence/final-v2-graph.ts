import type { ProjectRunInvocation } from '../runtime/invocation.ts';
import type { StableProjectFileSystem } from '../runtime/stable-project-file.ts';
import {
  validateAdaptiveFinalEvidenceV2Graph,
  type AdaptiveArtifactReceipt,
  type AdaptiveFinalEvidenceV2Bindings,
  type AdaptiveFinalEvidenceV2Graph,
} from './final-v2-adaptive-contract.ts';
import {
  validateAdaptiveFinalEvidenceV2GraphFiles,
  validateAdaptiveFinalProductionFiles,
} from './final-v2-adaptive-files.ts';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';

export type ArtifactReceipt = AdaptiveArtifactReceipt;
export type FinalEvidenceV2Graph = AdaptiveFinalEvidenceV2Graph;
export type FinalEvidenceV2GraphVariant = AdaptiveFinalEvidenceV2Graph;
export type FinalEvidenceV2GraphBindings = AdaptiveFinalEvidenceV2Bindings;
export type FinalEvidenceV2GraphBindingsVariant = AdaptiveFinalEvidenceV2Bindings;
export interface EvidenceGraphFs extends StableProjectFileSystem {}

export function validateFinalEvidenceV2Graph(value: unknown): FinalEvidenceV2Graph {
  return validateAdaptiveFinalEvidenceV2Graph(value);
}

export function validateFinalEvidenceV2GraphFiles(
  root: string,
  graphInput: unknown,
  fs: EvidenceGraphFs,
  invocation: ProjectRunInvocation,
) {
  return validateAdaptiveFinalEvidenceV2GraphFiles(root, graphInput, fs, invocation);
}

export function validateFinalProductionEvidence(
  root: string,
  graphInput: unknown,
  fs: EvidenceGraphFs,
  invocation: ProjectRunInvocation,
) {
  return validateAdaptiveFinalProductionFiles(root, graphInput, fs, invocation);
}

export const canonicalFinalEvidenceV2Graph = canonicalRouteJson;
