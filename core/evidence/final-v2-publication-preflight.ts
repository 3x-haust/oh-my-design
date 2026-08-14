import {
  validateFinalEvidenceV2GraphFiles,
  type EvidenceGraphFs,
  type FinalEvidenceV2GraphVariant,
} from './final-v2-graph.ts';
import type { ProjectRunInvocation } from '../runtime/invocation.ts';

export type ValidatedFinalEvidenceGraph = ReturnType<typeof validateFinalEvidenceV2GraphFiles>;
export type FinalEvidenceGraphPreflight = Readonly<{
  root: string;
  graph: FinalEvidenceV2GraphVariant;
  fs: EvidenceGraphFs;
  invocation: ProjectRunInvocation;
}>;

/** Read-only validation that must complete before the sole publisher acquires mutation state. */
export function preflightFinalEvidenceGraph(request: FinalEvidenceGraphPreflight): ValidatedFinalEvidenceGraph {
  return validateFinalEvidenceV2GraphFiles(request.root, request.graph, request.fs, request.invocation);
}

/** Revalidates under the publisher lock and rejects any preflight-to-lock graph drift. */
export function revalidateFinalEvidenceGraph(expected: ValidatedFinalEvidenceGraph, request: FinalEvidenceGraphPreflight): ValidatedFinalEvidenceGraph {
  const current = validateFinalEvidenceV2GraphFiles(request.root, request.graph, request.fs, request.invocation);
  if (current.rootHash !== expected.rootHash) throw new Error('final-evidence-v2: graph changed between preflight and publication lock');
  return current;
}
