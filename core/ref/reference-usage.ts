import { prepareReferenceUsage, readValidatedReferenceUsage, writeReferenceUsage, type ReferenceUsageReaders, type ValidatedReferenceUsage } from './reference-usage-snapshot.ts';
import type { ReferenceUsage, ReferenceUsageInput } from './reference-usage-parser.ts';

export { REFERENCE_USAGE_SCHEMA_VERSION, REFERENCE_USAGE_STATUSES, parseReferenceUsage, parseReferenceUsageInput, ReferenceUsageValidationError, type ReferenceUsage, type ReferenceUsageEvidence, type ReferenceUsageInput, type ReferenceUsageRow, type ReferenceUsageStatus, type ReferenceUsageTarget } from './reference-usage-parser.ts';
export { referenceUsagePath, trustedProductionEvidence, type ReferenceUsageReaders, type ValidatedReferenceUsage, type ValidatedReferenceUsagePiece } from './reference-usage-snapshot.ts';

export function recordReferenceUsage(root: string, input: ReferenceUsageInput): ReferenceUsage {
  const usage = prepareReferenceUsage(root, input);
  writeReferenceUsage(root, `${JSON.stringify(usage)}\n`);
  return usage;
}

export function validateReferenceUsage(root: string, overrides?: ReferenceUsageReaders): ValidatedReferenceUsage {
  return readValidatedReferenceUsage(root, overrides);
}
