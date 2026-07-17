import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, computeMembership, membershipDigest, readMembership, readRegularNoFollow, repoPath, sha256, validateRepoPath, type JsonValue, type MemberFile } from './contracts.ts';
import type { BundleLock } from './lock-bundle.ts';

function cliValue(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || process.argv.filter(arg => arg === name).length !== 1) throw new Error(`expected one ${name}`);
  return value;
}
function sameRepoPath(root: string, input: string, declared: string): boolean {
  const target = resolve(root, input);
  const expected = repoPath(root, declared);
  return basename(target) === basename(expected) && realpathSync(dirname(target)) === realpathSync(dirname(expected));
}
function assertLock(value: unknown): asserts value is BundleLock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('lock is not an object');
  const lock = value as Partial<BundleLock>;
  if (lock.schemaVersion !== 'bundle-lock-v1' || typeof lock.membershipSha256 !== 'string' || !Array.isArray(lock.entries)) throw new Error('invalid lock schema');
  for (const entry of lock.entries) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string' || typeof entry.byteLength !== 'number' || typeof entry.mode !== 'number' || typeof entry.mediaType !== 'string') throw new Error('invalid lock entry');
  }
}
function sameEntries(left: MemberFile[], right: MemberFile[]): boolean { return canonicalJson(left as unknown as JsonValue) === canonicalJson(right as unknown as JsonValue); }
function requireMembershipFile(entries: MemberFile[], membershipPath: string): void {
  const path = validateRepoPath(membershipPath);
  if (entries.filter(entry => entry.path === path).length !== 1) throw new Error('membership file must appear exactly once');
}

export function validateBundle(root: string, membershipPath: string, lockPath: string): BundleLock {
  const spec = readMembership(root, membershipPath);
  const declared = validateRepoPath(spec.lockOutputPath);
  if (!sameRepoPath(root, lockPath, declared)) throw new Error('--lock must equal the declared lock output path');
  const absoluteLock = repoPath(root, declared);
  const stat = lstatSync(absoluteLock);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('lock must be an existing regular file');
  const raw = readRegularNoFollow(absoluteLock);
  const lock = JSON.parse(raw.toString('utf8')) as unknown;
  assertLock(lock);
  if (canonicalJson(lock as unknown as JsonValue) !== raw.toString('utf8')) throw new Error('lock is not canonical JSON');
  const entries = computeMembership(root, spec, { lockMode: 'validate' });
  requireMembershipFile(entries, membershipPath);
  if (lock.membershipSha256 !== membershipDigest(entries)) throw new Error('stale membership digest');
  if (!sameEntries(lock.entries, entries)) throw new Error('lock entries drift (missing, extra, mode/type/hash/length/media-type)');
  if (sha256(raw) !== sha256(Buffer.from(canonicalJson(lock as unknown as JsonValue)))) throw new Error('lock read-back mismatch');
  return lock;
}

function main(): void { validateBundle(process.cwd(), cliValue('--membership'), cliValue('--lock')); }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
