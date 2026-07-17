import { closeSync, constants, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, repoPath, sha256, validateRepoPath, type ArtifactClass, type JsonValue } from './contracts.ts';

const INPUT_SCHEMA = 'evals/product-ux/harness/bundle-v1/source-finalization-input-v1.schema.json';
const RECEIPT_SCHEMA = 'evals/product-ux/harness/bundle-v1/source-finalization-v1.schema.json';
const ALLOCATOR = 'scripts/benchmark/allocate-source-finalization.ts';
const PRODUCER = 'scripts/benchmark/write-source-finalization.ts';
const CLASSES = new Set<ArtifactClass>(['static-instance', 'schema', 'vector', 'docs', 'source', 'raw-evidence']);

export interface SourceArtifact { path: string; class: ArtifactClass; sha256: string; }
export interface ReviewerEvidence { path: string; sha256: string; claimId: number; }
export interface SourceFinalizationInput {
  schemaVersion: 'source-finalization-input-v1'; id: number; allocationClaimPath: string; allocationClaimSha256: string;
  allocatorSha256: string; producerSha256: string; inputSchemaSha256: string; receiptSchemaSha256: string; toolPath: string; toolSha256: string;
  receiptRoot: string; previousReceiptPath: string | null; previousReceiptSha256: string | null; artifacts: SourceArtifact[];
  denySetRootSha256: string; projections: JsonValue; platformAssertion: JsonValue; toolchainAssertion: JsonValue; gateAssertion: JsonValue;
  architectReview: ReviewerEvidence; criticReview: ReviewerEvidence;
}
export interface SourceFinalizationReceipt {
  schemaVersion: 'source-finalization-v1'; status: 'ACCEPTED'; id: number; previousReceiptPath: string | null; previousReceiptSha256: string | null;
  domainSha256: string; input: SourceFinalizationInput;
}

function isHash(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value); }
function regularNoFollow(path: string): Buffer {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`not a regular file: ${path}`);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const after = statSync(path); if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino) throw new Error(`file changed while opening: ${path}`); return readFileSync(fd); }
  finally { closeSync(fd); }
}
function own(root: string, relativePath: string): Buffer { return regularNoFollow(repoPath(root, validateRepoPath(relativePath))); }
function exact(object: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(object).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has unknown or missing fields`);
  return object as Record<string, unknown>;
}
function assertJson(value: unknown, label: string): asserts value is JsonValue { try { canonicalJson(value as JsonValue); } catch { throw new Error(`${label} is not JSON`); } }
function assertEvidence(value: unknown, label: string): ReviewerEvidence {
  const item = exact(value, ['path', 'sha256', 'claimId'], label);
  if (typeof item.path !== 'string' || !isHash(item.sha256) || typeof item.claimId !== 'number' || !Number.isSafeInteger(item.claimId) || item.claimId < 0) throw new Error(`invalid ${label}`);
  validateRepoPath(item.path);
  return { path: item.path, sha256: item.sha256, claimId: item.claimId };
}

export function assertSourceFinalizationInput(value: unknown): asserts value is SourceFinalizationInput {
  const item = exact(value, ['schemaVersion', 'id', 'allocationClaimPath', 'allocationClaimSha256', 'allocatorSha256', 'producerSha256', 'inputSchemaSha256', 'receiptSchemaSha256', 'toolPath', 'toolSha256', 'receiptRoot', 'previousReceiptPath', 'previousReceiptSha256', 'artifacts', 'denySetRootSha256', 'projections', 'platformAssertion', 'toolchainAssertion', 'gateAssertion', 'architectReview', 'criticReview'], 'source-finalization input');
  if (item.schemaVersion !== 'source-finalization-input-v1' || !Number.isSafeInteger(item.id) || (item.id as number) < 0) throw new Error('invalid input version or id');
  for (const key of ['allocationClaimPath', 'toolPath', 'receiptRoot'] as const) if (typeof item[key] !== 'string') throw new Error(`invalid ${key}`); else validateRepoPath(item[key] as string);
  for (const key of ['allocationClaimSha256', 'allocatorSha256', 'producerSha256', 'inputSchemaSha256', 'receiptSchemaSha256', 'toolSha256', 'denySetRootSha256'] as const) if (!isHash(item[key])) throw new Error(`invalid ${key}`);
  if ((item.previousReceiptPath !== null && typeof item.previousReceiptPath !== 'string') || (item.previousReceiptPath !== null && !isHash(item.previousReceiptSha256)) || (item.previousReceiptPath === null && item.previousReceiptSha256 !== null)) throw new Error('invalid predecessor');
  if (typeof item.previousReceiptPath === 'string') validateRepoPath(item.previousReceiptPath);
  if (!Array.isArray(item.artifacts) || item.artifacts.length === 0) throw new Error('artifacts are required');
  let previous = '';
  for (const artifact of item.artifacts) {
    const record = exact(artifact, ['path', 'class', 'sha256'], 'artifact');
    if (typeof record.path !== 'string' || !isHash(record.sha256) || !CLASSES.has(record.class as ArtifactClass)) throw new Error('invalid artifact');
    validateRepoPath(record.path);
    if (previous && Buffer.compare(Buffer.from(previous), Buffer.from(record.path)) >= 0) throw new Error('artifacts must be unique byte-sorted');
    previous = record.path;
  }
  for (const key of ['projections', 'platformAssertion', 'toolchainAssertion', 'gateAssertion'] as const) assertJson(item[key], key);
  assertEvidence(item.architectReview, 'architectReview'); assertEvidence(item.criticReview, 'criticReview');
}

/** The reviewer evidence hashes are intentionally outside this payload: reviewers sign this payload, avoiding a self-hash cycle. */
export function sourceFinalizationDomain(input: SourceFinalizationInput): string {
  const semantic = {
    schemaVersion: input.schemaVersion,
    id: input.id,
    allocationClaim: { path: input.allocationClaimPath, sha256: input.allocationClaimSha256 },
    allocator: { path: ALLOCATOR, sha256: input.allocatorSha256 },
    producer: { path: PRODUCER, sha256: input.producerSha256 },
    inputSchema: { path: INPUT_SCHEMA, sha256: input.inputSchemaSha256 },
    receiptSchema: { path: RECEIPT_SCHEMA, sha256: input.receiptSchemaSha256 },
    tool: { path: input.toolPath, sha256: input.toolSha256 },
    receiptRoot: input.receiptRoot,
    previousReceipt: { path: input.previousReceiptPath, sha256: input.previousReceiptSha256 },
    artifacts: input.artifacts.map(artifact => ({ path: artifact.path, sha256: artifact.sha256, class: artifact.class })),
    denySetRootSha256: input.denySetRootSha256,
    projections: input.projections,
    platformAssertion: input.platformAssertion,
    toolchainAssertion: input.toolchainAssertion,
    gateAssertion: input.gateAssertion,
  };
  return sha256(Buffer.concat([Buffer.from('OMD-SOURCE-FINALIZATION-V1\0'), Buffer.from(canonicalJson(semantic as unknown as JsonValue))]));
}

function assertReview(root: string, evidence: ReviewerEvidence, role: 'architect' | 'critic', domain: string, id: number): void {
  const bytes = own(root, evidence.path);
  if (sha256(bytes) !== evidence.sha256) throw new Error(`${role} review hash mismatch`);
  let review: unknown; try { review = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`${role} review is not JSON`); }
  const item = exact(review, ['claimId', 'domainSha256', 'verdict'], `${role} review`);
  if (typeof item.claimId !== 'number' || !Number.isSafeInteger(item.claimId) || item.claimId < 0 || !isHash(item.domainSha256) || typeof item.verdict !== 'string') throw new Error(`invalid ${role} review`);
  const verdicts = role === 'architect' ? new Set(['APPROVE']) : new Set(['OKAY', 'PASS']);
  if (item.claimId !== id || evidence.claimId !== id || item.domainSha256 !== domain || !verdicts.has(item.verdict)) throw new Error(`${role} review is not bound to source-finalization domain`);
}
function verifyHashes(root: string, input: SourceFinalizationInput): void {
  const expected: [string, string][] = [[ALLOCATOR, input.allocatorSha256], [PRODUCER, input.producerSha256], [INPUT_SCHEMA, input.inputSchemaSha256], [RECEIPT_SCHEMA, input.receiptSchemaSha256], [input.toolPath, input.toolSha256], [input.allocationClaimPath, input.allocationClaimSha256]];
  for (const [path, digest] of expected) if (sha256(own(root, path)) !== digest) throw new Error(`hash mismatch: ${path}`);
  for (const artifact of input.artifacts) if (sha256(own(root, artifact.path)) !== artifact.sha256) throw new Error(`artifact hash mismatch: ${artifact.path}`);
}
function verifyAllocationClaim(root: string, input: SourceFinalizationInput): void {
  const bytes = own(root, input.allocationClaimPath); let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('allocation claim is not JSON'); }
  if (canonicalJson(value as JsonValue) !== bytes.toString('utf8')) throw new Error('allocation claim is not canonical JSON');
  const claim = exact(value, ['schemaVersion', 'id', 'previousMaximumId', 'claimPath', 'roots'], 'allocation claim');
  if (claim.schemaVersion !== 'source-finalization-allocation-v1' || claim.id !== input.id || claim.claimPath !== input.allocationClaimPath || !Number.isSafeInteger(claim.previousMaximumId) || (claim.previousMaximumId as number) !== input.id - 1) throw new Error('allocation claim does not bind input id');
}
function readReceipt(root: string, path: string): SourceFinalizationReceipt {
  const bytes = own(root, path); let value: unknown; try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`invalid receipt JSON: ${path}`); }
  if (canonicalJson(value as JsonValue) !== bytes.toString('utf8')) throw new Error(`receipt is not canonical JSON: ${path}`);
  const item = exact(value, ['schemaVersion', 'status', 'id', 'previousReceiptPath', 'previousReceiptSha256', 'domainSha256', 'input'], 'receipt');
  if (item.schemaVersion !== 'source-finalization-v1' || item.status !== 'ACCEPTED' || !Number.isSafeInteger(item.id) || (item.id as number) < 0 || !isHash(item.domainSha256)) throw new Error('invalid receipt');
  assertSourceFinalizationInput(item.input);
  const receipt = item as unknown as SourceFinalizationReceipt;
  if (receipt.id !== receipt.input.id || receipt.previousReceiptPath !== receipt.input.previousReceiptPath || receipt.previousReceiptSha256 !== receipt.input.previousReceiptSha256 || sourceFinalizationDomain(receipt.input) !== receipt.domainSha256) throw new Error('receipt domain or predecessor mismatch');
  return receipt;
}
function scanReceipts(root: string, receiptRoot: string, relativePath = receiptRoot, paths: string[] = []): string[] {
  const absolute = repoPath(root, relativePath); const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`symlink is forbidden: ${relativePath}`);
  if (stat.isFile()) { paths.push(relativePath); return paths; }
  if (!stat.isDirectory()) throw new Error(`special file is forbidden: ${relativePath}`);
  for (const name of readdirSync(absolute).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) scanReceipts(root, receiptRoot, `${relativePath}/${name}`, paths);
  return paths;
}
function validateChain(root: string, input: SourceFinalizationInput): Map<string, SourceFinalizationReceipt> {
  const receiptRoot = input.receiptRoot; const paths = scanReceipts(root, receiptRoot); const records = new Map<string, SourceFinalizationReceipt>(); const ids = new Set<number>();
  for (const path of paths) { const receipt = readReceipt(root, path); if (ids.has(receipt.id)) throw new Error(`duplicate receipt id: ${receipt.id}`); ids.add(receipt.id); records.set(path, receipt); }
  if (records.size === 0) { if (input.previousReceiptPath !== null) throw new Error('first receipt cannot have predecessor'); return records; }
  const children = new Map<string, number>(); let genesis = 0;
  for (const [path, receipt] of records) {
    if (receipt.previousReceiptPath === null) { genesis++; continue; }
    const predecessor = records.get(receipt.previousReceiptPath);
    if (!predecessor || sha256(own(root, receipt.previousReceiptPath)) !== receipt.previousReceiptSha256 || predecessor.id >= receipt.id) throw new Error(`missing, cyclic, or invalid predecessor: ${path}`);
    children.set(receipt.previousReceiptPath, (children.get(receipt.previousReceiptPath) ?? 0) + 1);
    if (children.get(receipt.previousReceiptPath)! > 1) throw new Error('source-finalization chain forks');
  }
  if (genesis !== 1) throw new Error('source-finalization chain has invalid genesis');
  const heads = [...records.keys()].filter(path => !children.has(path));
  if (heads.length !== 1) throw new Error('source-finalization chain must have exactly one head');
  if (input.previousReceiptPath !== heads[0] || !input.previousReceiptSha256 || sha256(own(root, heads[0])) !== input.previousReceiptSha256) throw new Error('new receipt must supersede the sole head');
  if (input.id <= Math.max(...ids)) throw new Error('source-finalization id must exceed every existing id');
  return records;
}
function fsyncParent(path: string): void { let fd: number | undefined; try { fd = openSync(dirname(path), constants.O_RDONLY); fsyncSync(fd); } catch (error: unknown) { const code = (error as NodeJS.ErrnoException).code; if (code !== 'EINVAL' && code !== 'ENOTSUP') throw error; } finally { if (fd !== undefined) closeSync(fd); } }

/** Validates a fully bound input and publishes one immutable, raw canonical receipt. */
export function writeSourceFinalization(root: string, inputPath: string, outputPath: string): SourceFinalizationReceipt {
  const rawInput = own(root, inputPath); let unknownInput: unknown; try { unknownInput = JSON.parse(rawInput.toString('utf8')); } catch { throw new Error('input is not JSON'); }
  if (canonicalJson(unknownInput as JsonValue) !== rawInput.toString('utf8')) throw new Error('input is not canonical JSON');
  assertSourceFinalizationInput(unknownInput); const input = unknownInput;
  const declaredOutput = validateRepoPath(outputPath); const output = repoPath(root, declaredOutput);
  if (!declaredOutput.startsWith(`${input.receiptRoot}/`)) throw new Error('output must be under receipt root');
  const parent = dirname(output); const parentStat = lstatSync(parent); if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw new Error('output parent is not a directory');
  try { lstatSync(output); throw new Error(`EEXIST: receipt output already exists: ${declaredOutput}`); }
  catch (error: unknown) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  verifyHashes(root, input); verifyAllocationClaim(root, input); validateChain(root, input);
  const domainSha256 = sourceFinalizationDomain(input); assertReview(root, input.architectReview, 'architect', domainSha256, input.id); assertReview(root, input.criticReview, 'critic', domainSha256, input.id);
  const receipt: SourceFinalizationReceipt = { schemaVersion: 'source-finalization-v1', status: 'ACCEPTED', id: input.id, previousReceiptPath: input.previousReceiptPath, previousReceiptSha256: input.previousReceiptSha256, domainSha256, input };
  const bytes = Buffer.from(canonicalJson(receipt as unknown as JsonValue)); let fd: number | undefined;
  try { fd = openSync(output, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o444); writeFileSync(fd, bytes); fsyncSync(fd); } finally { if (fd !== undefined) closeSync(fd); }
  if (!regularNoFollow(output).equals(bytes)) throw new Error('receipt read-back mismatch'); fsyncParent(output); return receipt;
}

function cliValue(name: string): string { const index = process.argv.indexOf(name); const value = index < 0 ? undefined : process.argv[index + 1]; if (!value || value.startsWith('--') || process.argv.filter(arg => arg === name).length !== 1) throw new Error(`expected one ${name}`); return value; }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) { try { if (process.argv.length !== 6) throw new Error('expected only --input and --out'); writeSourceFinalization(process.cwd(), cliValue('--input'), cliValue('--out')); } catch (error) { console.error((error as Error).message); process.exitCode = 1; } }
