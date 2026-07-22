import { canonicalJson } from './board-artifacts.ts';
import {
  prepareReferenceUsage,
  readValidatedReferenceUsage,
  type ReferenceUsageReaders,
  type ReferenceUsageV2,
  type ValidatedReferenceUsage,
} from './reference-usage-snapshot.ts';
import type { ReferenceUsageInput } from './reference-usage-parser.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../runtime/project-write.ts';
export { REFERENCE_USAGE_SCHEMA_VERSION, REFERENCE_USAGE_STATUSES, parseReferenceUsage, parseReferenceUsageInput, ReferenceUsageValidationError, type ReferenceUsageEvidence, type ReferenceUsageInput, type ReferenceUsageRow, type ReferenceUsageStatus, type ReferenceUsageTarget } from './reference-usage-parser.ts';
export {
  REFERENCE_USAGE_V2_SCHEMA_VERSION,
  parseReferenceUsageV2,
  referenceUsagePath,
  referenceUsageV2Sha256,
  trustedProductionEvidence,
  type ReferenceUsageReaders,
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

export function validateReferenceUsage(root: string, overrides?: ReferenceUsageReaders): ValidatedReferenceUsage {
  return readValidatedReferenceUsage(root, overrides);
}
