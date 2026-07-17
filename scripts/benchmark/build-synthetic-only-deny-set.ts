import { closeSync, constants, fsyncSync, lstatSync, openSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { byteCompare, canonicalJson, mediaType, readRegularNoFollow, repoPath, sha256, validateRepoPath, type JsonValue } from './contracts.ts';

const PREFIX = 'OMD-GATE-R-SYNTHETIC-ONLY-DENY-SET-V1\0';
const schemaGovernedKinds = new Set(['policy', 'schema', 'fixture-map', 'server', 'runtime']);
const allowedKinds = new Set(['policy', 'schema', 'profile', 'ca', 'spki', 'fixture-map', 'server', 'runtime', 'private-key']);
const blockedPath = /(?:^|\/)(?:shared|live)(?:\/|$)|(?:^|\/)(?:generated|deny-set|validation|vector)(?:[-_/.]|$)/i;

export interface SyntheticRecord { path: string; sha256: string; mediaType: string; capabilityKind: string; schemaId?: string; }
export interface SyntheticOnlyDenySet { schemaVersion: 'gate-r-synthetic-only-deny-set-v1'; recordsSha256: string; records: SyntheticRecord[]; }
interface CapabilityInput { path: string; kind: string; mediaType?: string; schemaId?: string; }
interface SyntheticManifest { schemaVersion: 'gate-r-synthetic-test-manifest-v1'; denySetOutputPath: string; capabilityInputs: CapabilityInput[]; }
interface KeyCustody { schemaVersion: 'gate-r-key-custody-v1'; privateKey: CapabilityInput; }

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
function parseManifest(bytes: Buffer): SyntheticManifest {
  const value = object(JSON.parse(bytes.toString('utf8')), 'synthetic manifest');
  onlyKeys(value, ['schemaVersion', 'denySetOutputPath', 'capabilityInputs'], 'synthetic manifest');
  if (value.schemaVersion !== 'gate-r-synthetic-test-manifest-v1' || typeof value.denySetOutputPath !== 'string' || !Array.isArray(value.capabilityInputs)) throw new Error('invalid synthetic manifest');
  return value as unknown as SyntheticManifest;
}
function parseCustody(bytes: Buffer): KeyCustody {
  const value = object(JSON.parse(bytes.toString('utf8')), 'key custody descriptor');
  onlyKeys(value, ['schemaVersion', 'privateKey'], 'key custody descriptor');
  if (value.schemaVersion !== 'gate-r-key-custody-v1' || !value.privateKey || typeof value.privateKey !== 'object' || Array.isArray(value.privateKey)) throw new Error('invalid key custody descriptor');
  onlyKeys(value.privateKey as Record<string, unknown>, ['path', 'kind', 'mediaType', 'schemaId'], 'private-key descriptor');
  return value as unknown as KeyCustody;
}
function rejectBlocked(path: string): void {
  if (blockedPath.test(path) || path.endsWith('.invalid')) throw new Error(`ineligible synthetic-only input: ${path}`);
}
function record(root: string, input: CapabilityInput, fallbackKind?: string): SyntheticRecord {
  if (!input || typeof input !== 'object' || typeof input.path !== 'string') throw new Error('invalid capability input');
  onlyKeys(input as unknown as Record<string, unknown>, ['path', 'kind', 'mediaType', 'schemaId'], 'capability input');
  const path = validateRepoPath(input.path);
  rejectBlocked(path);
  const kind = fallbackKind ?? input.kind;
  if (fallbackKind !== undefined && input.kind !== fallbackKind) throw new Error(`invalid capability kind: ${String(input.kind)}`);
  if (!allowedKinds.has(kind)) throw new Error(`unsupported capability kind: ${String(kind)}`);
  const bytes = readRegularNoFollow(repoPath(root, path));
  const detected = mediaType(path);
  const type = input.mediaType ?? detected;
  if (type !== detected) throw new Error(`media type does not match path: ${path}`);
  const governed = type === 'application/json' && schemaGovernedKinds.has(kind);
  const hasSchemaId = input.schemaId !== undefined;
  if (governed && (typeof input.schemaId !== 'string' || input.schemaId.length === 0)) throw new Error(`schemaId is required: ${path}`);
  if (!governed && hasSchemaId) throw new Error(`schemaId is forbidden: ${path}`);
  return governed ? { path, sha256: sha256(bytes), mediaType: type, capabilityKind: kind, schemaId: input.schemaId! } : { path, sha256: sha256(bytes), mediaType: type, capabilityKind: kind };
}
function exclusiveWrite(path: string, bytes: Buffer): void {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o444);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function buildSyntheticOnlyDenySet(root: string, manifestPath: string, custodyPath: string, outputPath: string): SyntheticOnlyDenySet {
  const manifestSafe = validateRepoPath(manifestPath);
  const custodySafe = validateRepoPath(custodyPath);
  const manifest = parseManifest(readRegularNoFollow(repoPath(root, manifestSafe)));
  const outputSafe = validateRepoPath(outputPath);
  if (validateRepoPath(manifest.denySetOutputPath) !== outputSafe) throw new Error('--out must equal the manifest denySetOutputPath');
  rejectBlocked(outputSafe);
  const output = repoPath(root, outputSafe);
  try { lstatSync(output); throw new Error(`deny-set output already exists: ${outputPath}`); } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const custody = parseCustody(readRegularNoFollow(repoPath(root, custodySafe)));
  const records = [...manifest.capabilityInputs.map(input => record(root, input)), record(root, custody.privateKey, 'private-key')];
  const seen = new Set<string>();
  for (const entry of records) {
    if (entry.path === manifestSafe || entry.path === custodySafe || entry.path === outputSafe) throw new Error(`deny-set must contain capability raw bytes only: ${entry.path}`);
    if (seen.has(entry.path)) throw new Error(`duplicate capability path: ${entry.path}`);
    seen.add(entry.path);
  }
  records.sort((a, b) => byteCompare(a.path, b.path));
  const recordsSha256 = sha256(Buffer.concat([Buffer.from(PREFIX, 'utf8'), Buffer.from(canonicalJson(records as unknown as JsonValue), 'utf8')]));
  const denySet: SyntheticOnlyDenySet = { schemaVersion: 'gate-r-synthetic-only-deny-set-v1', recordsSha256, records };
  exclusiveWrite(output, Buffer.from(canonicalJson(denySet as unknown as JsonValue), 'utf8'));
  return denySet;
}

function main(): void { buildSyntheticOnlyDenySet(process.cwd(), cliValue('--manifest'), cliValue('--custody'), cliValue('--out')); }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
