import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { requireProjectWriteAdapter, type ProjectWriteAdapter } from './project-write.ts';
import { observationV2Sha256, validateObservationCurrentArtifact, validateObservationV2, type ObservationV2 } from './observation.ts';

export const OBSERVATION_V2_RETENTION_SCHEMA = 'observation-v2-retention' as const;
export type ObservationV2Retention = Readonly<{ schema: typeof OBSERVATION_V2_RETENTION_SCHEMA; currentArtifactSha256: string; retained: readonly string[] }>;

function records(root: string): readonly { sha256: string; observation: ObservationV2 }[] {
  const directory = resolve(root, '.omd/observation-v2');
  try {
    return readdirSync(directory).flatMap((name) => {
      if (!/^sha256-[a-f0-9]{64}\.json$/.test(name)) return [];
      const bytes = readFileSync(resolve(directory, name));
      const observation = validateObservationV2(JSON.parse(bytes.toString('utf8')) as unknown);
      const sha256 = observationV2Sha256(observation);
      return [sha256 === name.slice(7, -5) ? { sha256, observation } : (() => { throw new Error('observation retention found a stale record'); })()];
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Publishes the bounded authoritative observation view. Historical records are never selected by
 * readers after this point; records bound to the live graph artifact are retained even past the cap.
 */
export function retainObservationV2(root: string, input: Readonly<{ currentArtifact: unknown; maxRecords: number }>, writer: ProjectWriteAdapter): ObservationV2Retention {
  requireProjectWriteAdapter(root, writer);
  if (!Number.isSafeInteger(input.maxRecords) || input.maxRecords < 1) throw new Error('observation retention maxRecords must be a positive integer');
  const currentArtifact = validateObservationCurrentArtifact(root, input.currentArtifact);
  const all = [...records(root)].sort((left, right) => right.observation.observedAt.localeCompare(left.observation.observedAt) || left.sha256.localeCompare(right.sha256));
  const current = all.filter(({ observation }) => observation.currentArtifact.sha256 === currentArtifact.sha256);
  const retained = [...new Set([...current, ...all.slice(0, input.maxRecords)].map(({ sha256 }) => sha256))];
  const result: ObservationV2Retention = { schema: OBSERVATION_V2_RETENTION_SCHEMA, currentArtifactSha256: currentArtifact.sha256, retained };
  writer.write('.omd/observation-v2-retention.json', `${canonicalJson(result)}\n`);
  return result;
}
