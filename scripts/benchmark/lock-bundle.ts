import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { canonicalJson, computeMembership, membershipDigest, readMembership, readRegularNoFollow, repoPath, sha256, validateRepoPath, type JsonValue, type MemberFile } from './contracts.ts';
import { publishFileExclusive, readNativePublisherIdentity, verifyNativePublisherIdentity, type NativePublisherIdentity } from './publish-exclusive.ts';

export interface BundleLock { schemaVersion: 'bundle-lock-v1'; membershipSha256: string; entries: MemberFile[]; }

function cliValue(name: string): string {
  const index = process.argv.indexOf(name); const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || process.argv.filter(arg => arg === name).length !== 1) throw new Error(`expected one ${name}`);
  return value;
}
function sameRepoPath(root: string, input: string, declared: string): boolean { const target = resolve(root, input); const expected = repoPath(root, declared); return basename(target) === basename(expected) && realpathSync(dirname(target)) === realpathSync(dirname(expected)); }
function tempResidue(output: string): void { const prefix = `${basename(output)}.tmp-`; for (const name of readdirSync(dirname(output))) if (name.startsWith(prefix)) throw new Error(`lock temp residue or contender exists: ${name}`); }
function sameEntries(a: MemberFile[], b: MemberFile[]): boolean { return canonicalJson(a as unknown as JsonValue) === canonicalJson(b as unknown as JsonValue); }
function requireMembershipFile(entries: MemberFile[], membershipPath: string): void { if (entries.filter(entry => entry.path === validateRepoPath(membershipPath)).length !== 1) throw new Error('membership file must appear exactly once'); }
function sameInode(a: { dev: number; ino: number }, b: { dev: number; ino: number }): boolean { return a.dev === b.dev && a.ino === b.ino; }

/** Creates a lock only by an already-verified native RENAME_EXCL publication path. */
export function createBundleLock(root: string, membershipPath: string, outputPath: string, nativeIdentity: NativePublisherIdentity): BundleLock {
  const spec = readMembership(root, membershipPath);
  const declared = validateRepoPath(spec.lockOutputPath);
  if (!sameRepoPath(root, outputPath, declared)) throw new Error('--out must equal the declared lock output path');
  const output = repoPath(root, declared);
  tempResidue(output);
  verifyNativePublisherIdentity(nativeIdentity);
  const before = computeMembership(root, spec, { lockMode: 'create' });
  requireMembershipFile(before, membershipPath);
  let tempFd: number | undefined; let temp: string | undefined;
  try {
    temp = `${output}.tmp-${process.pid}-${Date.now()}`;
    tempFd = openSync(temp, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o444);
    const preimage = fstatSync(tempFd);
    const after = computeMembership(root, spec, { lockMode: 'create', ignoreInode: { dev: preimage.dev, ino: preimage.ino } });
    if (!sameEntries(before, after)) throw new Error('membership changed during lock creation');
    const lock: BundleLock = { schemaVersion: 'bundle-lock-v1', membershipSha256: membershipDigest(before), entries: before };
    const bytes = Buffer.from(canonicalJson(lock as unknown as JsonValue));
    writeFileSync(tempFd, bytes); fsyncSync(tempFd);
    const finalCheck = computeMembership(root, spec, { lockMode: 'create', ignoreInode: { dev: preimage.dev, ino: preimage.ino } });
    if (!sameEntries(before, finalCheck)) throw new Error('membership changed before lock publication');
    closeSync(tempFd); tempFd = undefined;
    publishFileExclusive(basename(temp), basename(output), nativeIdentity, dirname(output));
    const published = lstatSync(output);
    if (!published.isFile() || published.isSymbolicLink() || published.nlink !== 1 || !sameInode(preimage, published)) throw new Error('published lock preimage or link count mismatch');
    const readback = readRegularNoFollow(output);
    if (!readback.equals(bytes) || sha256(readback) !== sha256(bytes)) throw new Error('published lock read-back mismatch');
    return lock;
  } finally {
    if (tempFd !== undefined) closeSync(tempFd);
    if (temp) { try { rmSync(temp); } catch { /* published files have moved; leave failed cleanup visible */ } }
  }
}
function main(): void {
  const identityPath = cliValue('--native-identity');
  if (resolve(identityPath).startsWith(`${resolve(tmpdir())}/`)) throw new Error('production native identity cannot use a temporary path');
  createBundleLock(process.cwd(), cliValue('--membership'), cliValue('--out'), readNativePublisherIdentity(identityPath, { rejectTemporaryPaths: true }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) { try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; } }
