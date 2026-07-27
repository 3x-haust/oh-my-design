import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { checkFinalEvidence } from '../evidence/final.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from '../runtime/project-write.ts';

export const LEGACY_V1_ATTEST_V2_SCHEMA = 'legacy-v1-attest-v2' as const;
export type LegacyV1AttestationV2 = Readonly<{
  schema: typeof LEGACY_V1_ATTEST_V2_SCHEMA;
  legacyManifestSha256: string;
  runId: string;
  sourceSealSha256: string;
}>;
const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

/**
 * Re-observes the published v1 record through its production checker before issuing an attestation.
 * It intentionally accepts no legacy JSON: a caller cannot translate a stale or fabricated record.
 */
export function attestLegacyV1AsV2(root: string, writer: ProjectWriteAdapter): LegacyV1AttestationV2 {
  requireProjectWriteAdapter(root, writer);
  if (!existsSync(resolve(root, '.omd/final-evidence.json'))) throw new Error('legacy final-evidence is missing');
  const legacy = checkFinalEvidence(root);
  const legacyBytes = readFileSync(resolve(root, '.omd/final-evidence.json'));
  const attestation: LegacyV1AttestationV2 = {
    schema: LEGACY_V1_ATTEST_V2_SCHEMA,
    legacyManifestSha256: sha256(legacyBytes),
    runId: legacy.runId,
    sourceSealSha256: legacy.sourceSeal.sha256,
  };
  const bytes = `${canonicalJson(attestation)}\n`;
  const digest = sha256(bytes);
  const record = `.omd/attest-v2/sha256-${digest}.json`;
  writer.write(record, bytes);
  writer.write('.omd/attest-v2.json', `${canonicalJson({ schema: LEGACY_V1_ATTEST_V2_SCHEMA, record, sha256: digest })}\n`);
  return attestation;
}
