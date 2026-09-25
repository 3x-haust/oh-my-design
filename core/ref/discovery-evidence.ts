import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nodeStableProjectFileSystem, readStableProjectFile } from '../runtime/stable-project-file.ts';
import { canonicalJson, sha256 } from './board-artifacts.ts';
import { readCurrentDirectDiscoveryEntry, readStrictDiscoveryNavigation, type DiscoveryObservation } from './discovery-record.ts';
import { readReferenceDiscoveryAttempt, type ReferenceDiscoveryAttempt } from './navigation-capture.ts';
import { readSearchExecution, SEARCH_EXECUTION_SCHEMA, searchObserved, type SearchExecution } from './search-execution.ts';

type Lane = 'domain' | 'design';
type Receipt = Readonly<{ path: string; sha256: string }>;
export type DiscoveryCapture = Readonly<{ observation: DiscoveryObservation; sha256: string }>;
export type DiscoveryAttempt = Readonly<{ lane: Lane; url: string; reason: string; receipt: Receipt }>;
export type LaneEvidence = Readonly<{ searches: readonly SearchExecution[]; entries: readonly DiscoveryCapture[];
  visits: readonly DiscoveryCapture[]; unavailable: readonly ReferenceDiscoveryAttempt[];
  failures: readonly DiscoveryAttempt[]; digests: readonly string[]; ignored: number }>;
const MAX_DISCOVERY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function currentEvidenceAfter(root: string): number {
  const ageFloor = Date.now() - MAX_DISCOVERY_AGE_MS;
  const pointer = join(root, '.omd/route.json');
  if (!existsSync(pointer)) return ageFloor;
  const stat = lstatSync(pointer);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('REFERENCE_DISCOVERY_WORK: unsafe route pointer');
  return Math.max(ageFloor, stat.mtimeMs);
}
function records(root: string, directory: string, pattern: RegExp): readonly Receipt[] {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  const stat = lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`REFERENCE_DISCOVERY_WORK: unsafe directory ${directory}`);
  return readdirSync(absolute).sort().flatMap(name => {
    const match = pattern.exec(name);
    return match?.[1] ? [{ path: `${directory}/${name}`, sha256: match[1] }] : [];
  });
}
function capture(root: string, receipt: Receipt, lane: Lane,
  purpose: 'entries' | 'navigation', after: number): DiscoveryCapture | null {
  try {
    const bytes = readStableProjectFile({ root: resolve(root), path: resolve(root, receipt.path),
      label: receipt.path, fs: nodeStableProjectFileSystem() });
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = Reflect.get(value, 'source');
    const imagePath = Reflect.get(value, 'imagePath');
    const acquisition: unknown = Reflect.get(value, 'acquisition');
    if (typeof source !== 'string' || typeof imagePath !== 'string'
      || acquisition === null || typeof acquisition !== 'object' || Array.isArray(acquisition)) return null;
    const imageSha256 = Reflect.get(acquisition, 'imageSha256');
    const capturedAt = Reflect.get(value, 'capturedAt');
    if (typeof imageSha256 !== 'string' || typeof capturedAt !== 'string'
      || !Number.isFinite(Date.parse(capturedAt)) || Date.parse(capturedAt) < after) return null;
    const common = { url: source, evidence: { path: imagePath, sha256: imageSha256 }, capture: receipt };
    const observation = purpose === 'entries'
      ? readCurrentDirectDiscoveryEntry(root, { method: 'direct-public',
        entry: lane === 'domain' ? 'public-directory' : 'free-gallery', ...common })
      : readStrictDiscoveryNavigation(root, common);
    return { observation, sha256: receipt.sha256 };
  } catch (error) { if (error instanceof Error) return null; throw error; }
}
function laneEvidence(root: string, lane: Lane, after: number): LaneEvidence {
  const base = `.omd/discovery/${lane}`;
  let ignored = 0;
  const searchRows = records(root, base, /^search-([a-f0-9]{64})\.json$/).flatMap(receipt => {
    try {
      const search = readSearchExecution(root, receipt, lane);
      return search.schema === SEARCH_EXECUTION_SCHEMA && Date.parse(search.observedAt) >= after
        ? [{ search, receipt }] : [];
    } catch (error) { if (!(error instanceof Error)) throw error; ignored += 1; return []; }
  });
  const searches = searchRows.map(row => row.search);
  const entries = records(root, `${base}/entries`, /^([a-f0-9]{64})\.json$/).flatMap(receipt => {
    const found = capture(root, receipt, lane, 'entries', after);
    if (found === null) { ignored += 1; return []; }
    return [found];
  });
  const visits = records(root, `${base}/navigation`, /^([a-f0-9]{64})\.json$/).flatMap(receipt => {
    const found = capture(root, receipt, lane, 'navigation', after);
    if (found === null) { ignored += 1; return []; }
    return [found];
  });
  const attemptRows = records(root, `${base}/attempts`, /^([a-f0-9]{64})\.json$/).flatMap(receipt => {
    try {
      const attempt = readReferenceDiscoveryAttempt(root, receipt);
      return Date.parse(attempt.capturedAt) >= after ? [{ attempt, receipt }] : [];
    } catch (error) { if (!(error instanceof Error)) throw error; ignored += 1; return []; }
  });
  const attempts = attemptRows.map(row => row.attempt);
  return { searches, entries, visits, unavailable: attempts,
    failures: [...searchRows.filter(row => !searchObserved(row.search)).map(row => ({ lane,
      url: row.search.requestedUrl, reason: row.search.error ?? row.search.status, receipt: row.receipt })),
    ...attemptRows.map(row => ({ lane, url: row.attempt.source, reason: row.attempt.reason, receipt: row.receipt }))],
    digests: [...searches.map(item => sha256(canonicalJson(item))), ...entries.map(item => item.sha256),
      ...visits.map(item => item.sha256), ...attempts.map(item => sha256(canonicalJson(item)))], ignored };
}

export function readCurrentReferenceDiscoveryEvidence(root: string): Readonly<{ domain: LaneEvidence; design: LaneEvidence }> {
  const after = currentEvidenceAfter(root);
  return { domain: laneEvidence(root, 'domain', after), design: laneEvidence(root, 'design', after) };
}
