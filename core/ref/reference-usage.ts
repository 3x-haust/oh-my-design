import { canonicalJson } from './board-artifacts.ts';
import {
  prepareReferenceUsage,
  readValidatedReferenceUsage,
  type ReferenceUsageV2,
  type ValidatedReferenceUsage,
} from './reference-usage-snapshot.ts';
import type { ReferenceUsageInput } from './reference-usage-parser.ts';
import { readContainedRegularFile, readReferenceSelectionV2 } from './reference-selection.ts';
import { validateReferenceInfluenceProofCurrentness } from './reference-influence-proof.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../runtime/project-write.ts';
export { REFERENCE_USAGE_SCHEMA_VERSION, REFERENCE_USAGE_STATUSES, parseReferenceUsage, parseReferenceUsageInput, ReferenceUsageValidationError, type ReferenceUsageEvidence, type ReferenceUsageInput, type ReferenceUsageRow, type ReferenceUsageStatus, type ReferenceUsageTarget } from './reference-usage-parser.ts';
export {
  REFERENCE_USAGE_V2_SCHEMA_VERSION,
  parseReferenceUsageV2,
  referenceUsagePath,
  referenceUsageV2Sha256,
  trustedProductionEvidence,
  type ReferenceUsageV2,
  type ValidatedReferenceUsage,
  type ValidatedReferenceUsagePiece,
} from './reference-usage-snapshot.ts';

/** Records the v2 ledger through the host-authorized project writer after binding it to current artifacts. */
export function recordReferenceUsage(root: string, input: ReferenceUsageInput, writer: ProjectWriteAdapter): ReferenceUsageV2 {
  requireProjectWriteAdapter(root, writer);
  const usage = prepareReferenceUsage(root, input);
  writer.write('.omd/reference-usage-v2.json', canonicalJson(usage));
  return usage;
}

export function validateReferenceUsage(root: string): ValidatedReferenceUsage {
  const validated = readValidatedReferenceUsage(root);
  if (validated.artifacts.assembly.schemaVersion === 'reference-assembly-v2') {
    let proofValue: unknown;
    try { proofValue = JSON.parse(readContainedRegularFile(root, '.omd/reference-influence-proof.json', 'reference influence proof').toString('utf8')); }
    catch (error) { throw error instanceof Error ? error : new Error('reference influence proof is missing or invalid'); }
    const proof = validateReferenceInfluenceProofCurrentness(root, proofValue, validated.artifacts.assembly, readReferenceSelectionV2(root));
    const buildHashes = new Set(validated.pieces.map((piece) => piece.usage.productionObservation.buildSha256));
    if (buildHashes.size !== 1 || !buildHashes.has(proof.buildSha256)) throw new Error('reference influence proof does not bind the current production build');
    if (proof.verdict !== 'pass') throw new Error('reference influence proof did not pass every used influence and target viewport');
  }
  return validated;
}
