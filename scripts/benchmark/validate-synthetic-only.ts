import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { byteCompare, canonicalJson, mediaType, readRegularNoFollow, repoPath, sha256, validateRepoPath, type JsonValue } from './contracts.ts';
import type { SyntheticOnlyDenySet, SyntheticRecord } from './build-synthetic-only-deny-set.ts';
import { evaluateEligibility, readSealArchiveRecords } from './seal-protocol.ts';

const PREFIX = 'OMD-GATE-R-SYNTHETIC-ONLY-DENY-SET-V1\0';
const hash = /^[a-f0-9]{64}$/;
const capabilityKinds = new Set(['policy', 'schema', 'profile', 'ca', 'spki', 'fixture-map', 'server', 'runtime', 'private-key']);
const inlineCapabilityKey = /(?:private.?key|pem|certificate|profile|policy|fixture.?map|(?:^|[-_])ca(?:$|[-_])|spki|base64.*(?:key|bytes)|key.*(?:base64|bytes))/i;
export interface LiveArtifactGraph {
  schemaVersion: 'gate-r-synthetic-only-live-manifest-v1';
  sourceFinalization: { path: string; sha256: string; domainSha256: string };
  snapshot: { archiveRoot: string; snapshotId: string };
  provenanceCopy: { path: string; sha256: string; rootSha256: string };
  artifactRecords: SyntheticRecord[];
}
export interface SyntheticOnlyValidationEvidence { denySetSha256: string; denySetRootSha256: string; liveManifestSha256: string; checkedArtifactCount: number; evidenceRootSha256: string; }

function cliValue(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || process.argv.filter(arg => arg === name).length !== 1) throw new Error(`expected one ${name}`);
  return value;
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function onlyKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`unexpected ${label} field`);
}
function assertHash(value: unknown, label: string): asserts value is string { if (typeof value !== 'string' || !hash.test(value)) throw new Error(`invalid ${label}`); }
function assertRecord(value: unknown, label: string): asserts value is SyntheticRecord {
  const entry = object(value, label);
  onlyKeys(entry, ['path', 'sha256', 'mediaType', 'capabilityKind', 'schemaId'], label);
  if (typeof entry.path !== 'string' || typeof entry.mediaType !== 'string' || !entry.mediaType || typeof entry.capabilityKind !== 'string' || !capabilityKinds.has(entry.capabilityKind) || (entry.schemaId !== undefined && (typeof entry.schemaId !== 'string' || !entry.schemaId || entry.mediaType !== 'application/json'))) throw new Error(`invalid ${label}`);
  assertHash(entry.sha256, `${label} sha256`); validateRepoPath(entry.path);
  if (entry.path.endsWith('.invalid') || entry.schemaId?.endsWith('.invalid')) throw new Error(`invalid fixture identity: ${entry.path}`);
}
function parseDenySet(bytes: Buffer): SyntheticOnlyDenySet {
  const value = object(JSON.parse(bytes.toString('utf8')), 'deny set');
  onlyKeys(value, ['schemaVersion', 'recordsSha256', 'records'], 'deny set');
  if (value.schemaVersion !== 'gate-r-synthetic-only-deny-set-v1' || !Array.isArray(value.records)) throw new Error('invalid deny set schema');
  assertHash(value.recordsSha256, 'deny-set digest');
  const denySet = value as unknown as SyntheticOnlyDenySet;
  denySet.records.forEach((entry, index) => assertRecord(entry, `deny-set record ${index}`));
  const paths = new Set<string>();
  for (const entry of denySet.records) {
    if (paths.has(entry.path)) throw new Error(`duplicate deny-set path: ${entry.path}`);
    if (/(?:^|\/)(?:shared|live)(?:\/|$)|(?:^|\/)(?:generated|deny-set|validation|vector)(?:[-_/.]|$)/i.test(entry.path)) throw new Error(`ineligible deny-set record: ${entry.path}`);
    paths.add(entry.path);
  }
  for (let index = 1; index < denySet.records.length; index += 1) if (byteCompare(denySet.records[index - 1]!.path, denySet.records[index]!.path) >= 0) throw new Error('deny-set records are not uniquely sorted');
  const digest = sha256(Buffer.concat([Buffer.from(PREFIX, 'utf8'), Buffer.from(canonicalJson(denySet.records as unknown as JsonValue), 'utf8')]));
  if (digest !== denySet.recordsSha256) throw new Error('deny-set digest mismatch');
  if (canonicalJson(denySet as unknown as JsonValue) !== bytes.toString('utf8')) throw new Error('deny set is not canonical JSON');
  return denySet;
}
function rejectInlineCapability(value: unknown, trail = 'live manifest'): void {
  if (typeof value === 'string') {
    if (value.endsWith('.invalid') || /-----BEGIN [A-Z ]+-----/.test(value)) throw new Error(`inline capability material: ${trail}`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((item, index) => rejectInlineCapability(item, `${trail}[${index}]`)); return; }
  for (const [key, item] of Object.entries(value)) {
    if (inlineCapabilityKey.test(key)) throw new Error(`inline capability material: ${trail}.${key}`);
    rejectInlineCapability(item, `${trail}.${key}`);
  }
}
function parseGraph(root: string, bytes: Buffer): LiveArtifactGraph {
  const value = object(JSON.parse(bytes.toString('utf8')), 'live manifest');
  onlyKeys(value, ['schemaVersion', 'sourceFinalization', 'snapshot', 'provenanceCopy', 'artifactRecords'], 'live manifest');
  if (value.schemaVersion !== 'gate-r-synthetic-only-live-manifest-v1' || !Array.isArray(value.artifactRecords)) throw new Error('invalid live manifest');
  rejectInlineCapability(value);
  const source = object(value.sourceFinalization, 'source finalization'); onlyKeys(source, ['path', 'sha256', 'domainSha256'], 'source finalization');
  if (typeof source.path !== 'string') throw new Error('invalid source finalization'); validateRepoPath(source.path); assertHash(source.sha256, 'source finalization sha256'); assertHash(source.domainSha256, 'source finalization domain');
  const snapshot = object(value.snapshot, 'snapshot'); onlyKeys(snapshot, ['archiveRoot', 'snapshotId'], 'snapshot');
  if (typeof snapshot.archiveRoot !== 'string' || typeof snapshot.snapshotId !== 'string') throw new Error('invalid snapshot reference');
  validateRepoPath(snapshot.archiveRoot);
  const archiveRoot = repoPath(root, snapshot.archiveRoot);
  const records = readSealArchiveRecords(archiveRoot);
  const record = records.find(entry => entry.snapshotId === snapshot.snapshotId);
  if (!record || !evaluateEligibility(archiveRoot, snapshot.snapshotId).eligible) throw new Error('launcher verdict is not accepted');
  const copy = object(value.provenanceCopy, 'provenance copy'); onlyKeys(copy, ['path', 'sha256', 'rootSha256'], 'provenance copy'); if (typeof copy.path !== 'string') throw new Error('invalid provenance copy'); validateRepoPath(copy.path); assertHash(copy.sha256, 'provenance copy sha256'); assertHash(copy.rootSha256, 'provenance copy root'); if (copy.rootSha256 !== record.snapshot.snapshotSha256) throw new Error('provenance copy root mismatch');
  const paths = new Set<string>(); value.artifactRecords.forEach((entry, index) => { assertRecord(entry, `live artifact ${index}`); if (paths.has(entry.path)) throw new Error(`duplicate live artifact path: ${entry.path}`); paths.add(entry.path); });
  return value as unknown as LiveArtifactGraph;
}
function observed(root: string, expected: SyntheticRecord): void {
  const absolute = repoPath(root, expected.path); const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`live artifact ${expected.path} is not a regular file`);
  const actual: SyntheticRecord = { path: expected.path, sha256: sha256(readRegularNoFollow(absolute)), mediaType: mediaType(expected.path), capabilityKind: expected.capabilityKind };
  if (expected.schemaId !== undefined) actual.schemaId = expected.schemaId;
  if (canonicalJson(actual as unknown as JsonValue) !== canonicalJson(expected as unknown as JsonValue)) throw new Error(`live artifact identity does not authenticate: ${expected.path}`);
}
function record(graph: LiveArtifactGraph, path: string, sha: string, label: string): SyntheticRecord {
  const found = graph.artifactRecords.find(entry => entry.path === path && entry.sha256 === sha);
  if (!found) throw new Error(`${label} is not enumerated in live artifact records`);
  return found;
}
function denied(identity: SyntheticRecord, records: SyntheticRecord[]): boolean { return records.some(record => record.path === identity.path || record.sha256 === identity.sha256 || (record.schemaId !== undefined && record.schemaId === identity.schemaId)); }

export function validateSyntheticOnly(root: string, denySetPath: string, graphPath: string): SyntheticOnlyValidationEvidence {
  const denyBytes = readRegularNoFollow(repoPath(root, validateRepoPath(denySetPath)));
  const denySet = parseDenySet(denyBytes);
  const graphBytes = readRegularNoFollow(repoPath(root, validateRepoPath(graphPath)));
  const graph = parseGraph(root, graphBytes);
  for (const entry of graph.artifactRecords) { observed(root, entry); if (denied(entry, denySet.records)) throw new Error(`live artifact matches synthetic deny set: ${entry.path}`); }
  const finalization = record(graph, graph.sourceFinalization.path, graph.sourceFinalization.sha256, 'source finalization');
  const finalizationValue = object(JSON.parse(readRegularNoFollow(repoPath(root, finalization.path)).toString('utf8')), 'source finalization receipt');
  if (finalizationValue.schemaVersion !== 'source-finalization-v1' || finalizationValue.status !== 'ACCEPTED' || finalizationValue.domainSha256 !== graph.sourceFinalization.domainSha256) throw new Error('source finalization authority mismatch');
  record(graph, graph.provenanceCopy.path, graph.provenanceCopy.sha256, 'provenance copy');
  const denySetSha256 = sha256(denyBytes); const liveManifestSha256 = sha256(graphBytes);
  const evidence = { denySetSha256, denySetRootSha256: denySet.recordsSha256, liveManifestSha256, checkedArtifactCount: graph.artifactRecords.length };
  return { ...evidence, evidenceRootSha256: sha256(canonicalJson(evidence as unknown as JsonValue)) };
}
function main(): void { console.log(canonicalJson(validateSyntheticOnly(process.cwd(), cliValue('--deny-set'), cliValue('--graph')) as unknown as JsonValue)); }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) { try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; } }
