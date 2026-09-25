import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ProjectWriteAdapter } from '../runtime/project-write.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { sha256 } from './board-artifacts.ts';
import { publicDiscoveryUrl, readStrictDiscoveryNavigation, type DiscoveryLane } from './discovery-record.ts';

type Receipt = Readonly<{ path: string; sha256: string }>;
export type ReferenceDiscoveryExclusion = Readonly<{
  schema: 'reference-discovery-exclusion-v1'; sourceContractSha256: string;
  researchLane: DiscoveryLane; source: string; reason: string; visit: Receipt;
}>;
export type ReferenceDiscoveryExclusionRecord = Readonly<{ decision: ReferenceDiscoveryExclusion; receipt: Receipt }>;

function entries(root: string, path: string): readonly string[] {
  const directory = join(root, path);
  if (!existsSync(directory)) return [];
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`REFERENCE_DISCOVERY_EXCLUSION: unsafe directory ${path}`);
  return readdirSync(directory).filter(name => /^[a-f0-9]{64}\.json$/u.test(name)).sort();
}
function read(root: string, path: string): Buffer {
  return readStableProjectFile({ root: resolve(root), path: resolve(root, path), label: path,
    fs: nodeStableProjectFileSystem() });
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function visitObservation(root: string, lane: DiscoveryLane, receipt: Receipt): string | null {
  if (!new RegExp(`^\\.omd/discovery/${lane}/navigation/[a-f0-9]{64}\\.json$`, 'u').test(receipt.path)
    || !receipt.path.endsWith(`${receipt.sha256}.json`)) return null;
  try {
    const bytes = read(root, receipt.path);
    if (sha256(bytes) !== receipt.sha256) return null;
    const raw: unknown = JSON.parse(bytes.toString('utf8'));
    if (!object(raw) || typeof raw.source !== 'string' || typeof raw.imagePath !== 'string'
      || !object(raw.acquisition) || typeof raw.acquisition.imageSha256 !== 'string') return null;
    const observation = readStrictDiscoveryNavigation(root, { url: raw.source,
      evidence: { path: raw.imagePath, sha256: raw.acquisition.imageSha256 }, capture: receipt });
    return observation.url;
  } catch (error) { if (error instanceof Error) return null; throw error; }
}
function observedVisit(root: string, lane: DiscoveryLane, source: string): Receipt | null {
  const directory = `.omd/discovery/${lane}/navigation`;
  for (const name of entries(root, directory)) {
    const receipt = { path: `${directory}/${name}`, sha256: name.slice(0, -5) };
    if (visitObservation(root, lane, receipt) === source) return receipt;
  }
  return null;
}

export function publishReferenceDiscoveryExclusion(root: string, sourceContractSha256: string,
  lane: DiscoveryLane, source: string, reason: string, writer: ProjectWriteAdapter): Receipt {
  if (!/^[a-f0-9]{64}$/u.test(sourceContractSha256)) throw new Error('REFERENCE_DISCOVERY_EXCLUSION: current route digest required');
  const canonicalSource = publicDiscoveryUrl(source);
  const judgment = reason.trim();
  if (judgment.length < 20 || judgment.length > 500) throw new Error('REFERENCE_DISCOVERY_EXCLUSION: give a specific 20-500 character reason');
  const visit = observedVisit(root, lane, canonicalSource);
  if (visit === null) throw new Error('REFERENCE_DISCOVERY_EXCLUSION: visit and capture this exact source before excluding it');
  const decision: ReferenceDiscoveryExclusion = {
    schema: 'reference-discovery-exclusion-v1', sourceContractSha256,
    researchLane: lane, source: canonicalSource, reason: judgment, visit,
  };
  const bytes = `${JSON.stringify(decision, null, 2)}\n`;
  const sha256Bytes = sha256(bytes);
  const path = `.omd/discovery/${lane}/excluded/${sha256Bytes}.json`;
  writer.writeContentAddressed(path, bytes);
  return { path, sha256: sha256Bytes };
}

export function readReferenceDiscoveryExclusions(root: string,
  sourceContractSha256: string): readonly ReferenceDiscoveryExclusionRecord[] {
  const rows: ReferenceDiscoveryExclusionRecord[] = [];
  for (const lane of ['domain', 'design'] as const) {
    const directory = `.omd/discovery/${lane}/excluded`;
    for (const name of entries(root, directory)) {
      const receipt = { path: `${directory}/${name}`, sha256: name.slice(0, -5) };
      try {
        const bytes = read(root, receipt.path);
        if (sha256(bytes) !== receipt.sha256) continue;
        const raw: unknown = JSON.parse(bytes.toString('utf8'));
        if (!object(raw) || raw.schema !== 'reference-discovery-exclusion-v1'
          || raw.sourceContractSha256 !== sourceContractSha256 || raw.researchLane !== lane
          || typeof raw.source !== 'string' || publicDiscoveryUrl(raw.source) !== raw.source
          || typeof raw.reason !== 'string' || raw.reason.trim() !== raw.reason
          || raw.reason.length < 20 || raw.reason.length > 500 || !object(raw.visit)
          || typeof raw.visit.path !== 'string' || typeof raw.visit.sha256 !== 'string'
          || Object.keys(raw).length !== 6 || Object.keys(raw.visit).length !== 2) continue;
        const visit = { path: raw.visit.path, sha256: raw.visit.sha256 };
        if (visitObservation(root, lane, visit) !== raw.source) continue;
        rows.push({ decision: { schema: raw.schema, sourceContractSha256,
          researchLane: lane, source: raw.source, reason: raw.reason, visit }, receipt });
      } catch (error) { if (!(error instanceof Error)) throw error; }
    }
  }
  return rows;
}
