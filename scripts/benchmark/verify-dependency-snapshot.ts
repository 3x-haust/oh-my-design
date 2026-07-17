import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { canonicalJson, sha256, byteCompare, type JsonValue } from './contracts.ts';
import { evaluateEligibility } from './seal-protocol.ts';
import { MANIFEST, RECEIPT, type DependencySnapshot, type SnapshotEntry } from './create-dependency-snapshot.ts';

function fail(message: string): never { throw new Error(`dependency snapshot verification: ${message}`); }
function stat(path: string) { const value = lstatSync(path); if (value.isSymbolicLink()) fail(`symlink is forbidden: ${path}`); return value; }
function walk(root: string, prefix = ''): string[] { const value = stat(root); if (value.isFile()) return [prefix]; if (!value.isDirectory()) fail(`special file: ${root}`); return readdirSync(root).sort(byteCompare).flatMap(name => walk(join(root, name), prefix ? `${prefix}/${name}` : name)); }
function parseCanonical(path: string): unknown { const raw = readFileSync(path, 'utf8'); let value: unknown; try { value = JSON.parse(raw); } catch { fail(`invalid JSON: ${path}`); } if (canonicalJson(value as JsonValue) !== raw) fail(`non-canonical JSON: ${path}`); return value; }
function treeRoot(root: string): string { const rows = walk(root).map(path => { const value = stat(join(root, path)); const bytes = readFileSync(join(root, path)); return { path, sha256: sha256(bytes), byteLength: bytes.length, mode: value.mode & 0o111 ? 0o555 : 0o444, executable: Boolean(value.mode & 0o111) }; }); return sha256(canonicalJson(rows as unknown as JsonValue)); }
export interface VerifyOptions { snapshot: string; archiveRoot: string; manifest?: string; receipt?: string; requireReadOnly?: boolean; positiveBrowserProof?: () => void; }
/** Full no-follow read-back. Browser proof is an injected offline file-URL hook; callers own Playwright invocation. */
export function verifyDependencySnapshot(options: VerifyOptions): DependencySnapshot {
  const snapshot = resolve(options.snapshot), manifestPath = options.manifest ?? join(snapshot, MANIFEST), receiptPath = options.receipt ?? join(snapshot, RECEIPT);
  const archive = evaluateEligibility(options.archiveRoot, basename(snapshot));
  if (!archive.eligible) fail(`durable eligibility is required: ${archive.reason}`);
  const manifest = parseCanonical(manifestPath) as DependencySnapshot;
  if (!manifest || manifest.schemaVersion !== 'dependency-snapshot-v1' || !Array.isArray(manifest.entries) || !manifest.browser) fail('malformed manifest');
  const receipt = parseCanonical(receiptPath) as { schemaVersion?: unknown; state?: unknown; snapshotSha256?: unknown };
  if (receipt.schemaVersion !== 'dependency-snapshot-v1.receipt-v1' || receipt.state !== 'PENDING_LAUNCHER' || receipt.snapshotSha256 !== sha256(canonicalJson(manifest as unknown as JsonValue))) fail('receipt does not bind manifest');
  const actual = walk(snapshot).filter(path => path !== MANIFEST && path !== RECEIPT).sort(byteCompare); const expected = manifest.entries.map(entry => entry.path).sort(byteCompare);
  if (actual.length !== expected.length || actual.some((path, index) => path !== expected[index])) fail('snapshot has missing or extra bytes');
  for (const entry of manifest.entries as SnapshotEntry[]) { const path = join(snapshot, entry.path), value = stat(path), bytes = readFileSync(path); if (!value.isFile() || sha256(bytes) !== entry.sha256 || bytes.length !== entry.byteLength || (value.mode & 0o777) !== entry.mode) fail(`entry mismatch: ${entry.path}`); }
  if (treeRoot(join(snapshot, 'payload/ms-playwright', `chromium_headless_shell-${manifest.browser.revision}`, 'omd-original', 'chrome-headless-shell-mac-arm64')) !== manifest.browser.originalTree) fail('original browser tree mismatch');
  const expectedExecutable = join(snapshot, manifest.browser.expectedExecutable), delegate = join(snapshot, manifest.browser.delegateExecutable); if (!stat(expectedExecutable).isFile() || !stat(delegate).isFile()) fail('browser executable is missing');
  if (options.requireReadOnly !== false) for (const path of walk(snapshot)) { const value = stat(join(snapshot, path)); if (value.mode & 0o222) fail(`writable snapshot entry: ${path}`); }
  if (options.positiveBrowserProof) options.positiveBrowserProof();
  return manifest;
}
function value(flag: string): string { const i = process.argv.indexOf(flag); if (i < 0 || !process.argv[i + 1]) throw new Error(`missing ${flag}`); return process.argv[i + 1]!; }
if (process.argv[1]?.endsWith('verify-dependency-snapshot.ts')) { try { const manifest = process.argv.includes('--manifest') ? value('--manifest') : null; const receipt = process.argv.includes('--receipt') ? value('--receipt') : null; verifyDependencySnapshot({ snapshot: value('--snapshot'), archiveRoot: value('--archive-root'), ...(manifest ? { manifest } : {}), ...(receipt ? { receipt } : {}), requireReadOnly: process.argv.includes('--require-read-only') }); } catch (error) { console.error((error as Error).message); process.exitCode = 1; } }
