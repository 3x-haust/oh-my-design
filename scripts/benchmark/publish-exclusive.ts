import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync, type Stats } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { byteCompare, canonicalJson, sha256, type JsonValue } from './contracts.ts';

const sourcePath = fileURLToPath(new URL('./native/omd-darwin-publish-v1.c', import.meta.url));
const abiPath = fileURLToPath(new URL('../../evals/product-ux/harness/bundle-v1/omd-darwin-publish-v1.abi.json', import.meta.url));

type Command = 'publish-file-exclusive' | 'publish-directory-exclusive';
export type PublicationKind = 'file' | 'directory';
export type SigningChoice = { mode: 'none' } | { mode: 'adhoc' };
export interface NativePublisherIdentity {
  schemaVersion: 'omd-darwin-publish-v1';
  binaryPath: string;
  sourceSha256: string;
  abiSha256: string;
  binarySha256: string;
  compilerPath: string;
  compilerArgv: string[];
  compilerSha256: string;
  sdkPath: string;
  sdkSha256: string;
  deploymentTarget: string;
  deploymentSha256: string;
  signing: SigningChoice;
  signingSha256: string;
  metadata: Record<string, string>;
  metadataSha256: string;
  architecture: string;
}
export interface NativePublisherPreparation {
  binaryPath: string;
  compilerPath: string;
  compilerArgv: string[];
  sdkPath: string;
  deploymentTarget: string;
  signing: SigningChoice;
  metadata: Record<string, string>;
  identityPath?: string;
}

export class ExclusivePublicationError extends Error {
  readonly code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}
function fail(code: string, message: string): never { throw new ExclusivePublicationError(message, code); }
function digest(bytes: string | Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function expectedArchitecture(): string { return process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x86_64' : process.arch; }
function command(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) fail('TOOL_FAILED', `${command} failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}
function requireDarwin(): void { if (process.platform !== 'darwin') fail('DARWIN_PUBLISH_UNSUPPORTED', 'exclusive Darwin publication is unavailable on this platform'); }
function validBasename(name: string): boolean { return name.length > 0 && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\') && !name.includes('\0'); }
function sameInode(a: Stats, b: Stats): boolean { return a.dev === b.dev && a.ino === b.ino; }
function absent(path: string): boolean { try { lstatSync(path); return false; } catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; } }
function regularNoFollow(path: string): Stats { const stat = lstatSync(path); if (stat.isSymbolicLink() || !stat.isFile()) fail('SOURCE_INVALID', `not a regular file: ${path}`); return stat; }
function directoryNoFollow(path: string): Stats { const stat = lstatSync(path); if (stat.isSymbolicLink() || !stat.isDirectory()) fail('SOURCE_INVALID', `not a directory: ${path}`); return stat; }
function readNoFollow(path: string): Buffer { const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { return readFileSync(fd); } finally { closeSync(fd); } }
function identityMetadataHash(metadata: Record<string, string>): string { return digest(canonicalJson(metadata as unknown as JsonValue)); }
function assertAbsoluteRegular(path: string, label: string): void { if (!isAbsolute(path)) fail('IDENTITY_INVALID', `${label} must be absolute`); regularNoFollow(path); }

/** Explicit build step. Publication never compiles or otherwise resolves an ambient compiler. */
export function prepareDarwinPublisherIdentity(preparation: NativePublisherPreparation): NativePublisherIdentity {
  requireDarwin();
  const { binaryPath, compilerPath, compilerArgv, sdkPath, deploymentTarget, signing, metadata, identityPath } = preparation;
  if (!isAbsolute(binaryPath) || !isAbsolute(compilerPath) || !isAbsolute(sdkPath)) fail('IDENTITY_INVALID', 'binary, compiler, and SDK paths must be absolute');
  if (!Array.isArray(compilerArgv) || compilerArgv.some(arg => typeof arg !== 'string') || !deploymentTarget) fail('IDENTITY_INVALID', 'compiler argv and deployment target are required');
  assertAbsoluteRegular(compilerPath, 'compiler path');
  const sdk = realpathSync(sdkPath);
  if (!directoryNoFollow(sdk).isDirectory()) fail('IDENTITY_INVALID', 'SDK path must be a directory');
  const architecture = expectedArchitecture();
  if (command('uname', ['-m']).trim() !== architecture) fail('ARCHITECTURE_MISMATCH', 'Node architecture differs from uname');
  if (!absent(binaryPath)) fail('IDENTITY_INVALID', `prepared binary already exists: ${binaryPath}`);
  mkdirSync(dirname(binaryPath), { recursive: true, mode: 0o700 });
  const result = spawnSync(compilerPath, [...compilerArgv, '-std=c11', '-D_DARWIN_C_SOURCE', '-Wall', '-Wextra', '-Werror', '-arch', architecture, '-isysroot', sdk, `-mmacosx-version-min=${deploymentTarget}`, '-o', binaryPath, sourcePath], { encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) fail('COMPILATION_FAILED', `${compilerPath} failed: ${result.error?.message ?? result.stderr}`);
  if (signing.mode === 'adhoc') command('/usr/bin/codesign', ['--force', '--sign', '-', binaryPath]);
  const description = command('/usr/bin/file', ['-b', binaryPath]);
  if (!description.includes('Mach-O') || !description.includes(architecture)) fail('BINARY_ARCHITECTURE_MISMATCH', `prepared publisher is not a ${architecture} Mach-O binary`);
  const identity: NativePublisherIdentity = {
    schemaVersion: 'omd-darwin-publish-v1', binaryPath, sourceSha256: digest(readFileSync(sourcePath)), abiSha256: digest(readFileSync(abiPath)), binarySha256: digest(readFileSync(binaryPath)), compilerPath, compilerArgv: [...compilerArgv], compilerSha256: digest(readFileSync(compilerPath)), sdkPath: sdk, sdkSha256: digest(sdk), deploymentTarget, deploymentSha256: digest(deploymentTarget), signing, signingSha256: digest(canonicalJson(signing as unknown as JsonValue)), metadata: { ...metadata }, metadataSha256: identityMetadataHash(metadata), architecture,
  };
  if (identityPath) writeNativePublisherIdentity(identityPath, identity);
  return identity;
}
export function writeNativePublisherIdentity(path: string, identity: NativePublisherIdentity): void { writeFileSync(path, `${canonicalJson(identity as unknown as JsonValue)}\n`, { mode: 0o600, flag: 'wx' }); }
export function readNativePublisherIdentity(path: string, options: { rejectTemporaryPaths?: boolean } = {}): NativePublisherIdentity {
  const identity = JSON.parse(readNoFollow(path).toString('utf8')) as NativePublisherIdentity;
  verifyNativePublisherIdentity(identity, options);
  return identity;
}
export function verifyNativePublisherIdentity(identity: NativePublisherIdentity, options: { rejectTemporaryPaths?: boolean } = {}): void {
  requireDarwin();
  if (!identity || identity.schemaVersion !== 'omd-darwin-publish-v1' || !Array.isArray(identity.compilerArgv) || !identity.metadata || typeof identity.metadata !== 'object') fail('IDENTITY_INVALID', 'invalid native publisher identity');
  for (const [label, path] of [['binary', identity.binaryPath], ['compiler', identity.compilerPath], ['SDK', identity.sdkPath]] as const) if (!isAbsolute(path)) fail('IDENTITY_INVALID', `${label} path must be absolute`);
  if (options.rejectTemporaryPaths && [identity.binaryPath, identity.compilerPath, identity.sdkPath].some(path => resolve(path).startsWith(`${resolve(tmpdir())}/`))) fail('IDENTITY_INVALID', 'production native identity cannot use a temporary path');
  assertAbsoluteRegular(identity.binaryPath, 'binary path');
  assertAbsoluteRegular(identity.compilerPath, 'compiler path');
  const sdk = realpathSync(identity.sdkPath);
  directoryNoFollow(sdk);
  if (identity.sourceSha256 !== digest(readFileSync(sourcePath)) || identity.abiSha256 !== digest(readFileSync(abiPath)) || identity.binarySha256 !== digest(readFileSync(identity.binaryPath)) || identity.compilerSha256 !== digest(readFileSync(identity.compilerPath)) || identity.sdkSha256 !== digest(sdk) || identity.deploymentSha256 !== digest(identity.deploymentTarget) || identity.signingSha256 !== digest(canonicalJson(identity.signing as unknown as JsonValue)) || identity.metadataSha256 !== identityMetadataHash(identity.metadata) || identity.architecture !== expectedArchitecture()) fail('IDENTITY_STALE', 'native publisher identity no longer matches its frozen inputs');
  const description = command('/usr/bin/file', ['-b', identity.binaryPath]);
  if (!description.includes('Mach-O') || !description.includes(identity.architecture)) fail('IDENTITY_STALE', 'native publisher binary architecture changed');
}

/** Deterministic, symlink-free directory commitment used before and after directory publication. */
export function deterministicTreeRoot(root: string): string {
  const visit = (absolute: string, relative: string): string => {
    const entry = lstatSync(absolute);
    if (entry.isSymbolicLink()) fail('SOURCE_INVALID', `symlink in publication tree: ${relative || '.'}`);
    if (entry.isFile()) return `f ${relative} ${entry.mode & 0o777} ${sha256(readNoFollow(absolute))}`;
    if (!entry.isDirectory()) fail('SOURCE_INVALID', `special file in publication tree: ${relative || '.'}`);
    return `d ${relative} ${entry.mode & 0o777}\n${readdirSync(absolute).sort(byteCompare).map(name => visit(join(absolute, name), relative ? `${relative}/${name}` : name)).join('\n')}`;
  };
  return digest(visit(root, ''));
}
function publish(source: string, destination: string, kind: PublicationKind, identity: NativePublisherIdentity, parentDirectory = process.cwd()): void {
  requireDarwin(); verifyNativePublisherIdentity(identity);
  if (!validBasename(source) || !validBasename(destination)) fail('USAGE', 'source and destination must be basenames');
  const parent = realpathSync(parentDirectory);
  const sourceAbsolute = resolve(parent, source); const destinationAbsolute = resolve(parent, destination);
  if (dirname(sourceAbsolute) !== parent || dirname(destinationAbsolute) !== parent) fail('USAGE', 'source and destination must share one parent directory');
  if (!absent(destinationAbsolute)) fail('DESTINATION_EXISTS', `destination exists: ${destination}`);
  const sourceStat = kind === 'file' ? regularNoFollow(sourceAbsolute) : directoryNoFollow(sourceAbsolute);
  const sourceHash = kind === 'file' ? sha256(readNoFollow(sourceAbsolute)) : undefined;
  const sourceTree = kind === 'directory' ? deterministicTreeRoot(sourceAbsolute) : undefined;
  const parentFd = openSync(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const sourceFd = openSync(sourceAbsolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!sameInode(sourceStat, fstatSync(sourceFd))) fail('SOURCE_INVALID', 'source changed while opening');
    const commandName: Command = kind === 'file' ? 'publish-file-exclusive' : 'publish-directory-exclusive';
    const result = spawnSync(identity.binaryPath, [commandName, source, destination], { encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe', parentFd, sourceFd] });
    if (result.error) fail('HELPER_FAILED', result.error.message);
    if (result.status !== 0) { const code = (result.stderr || '').trim() || 'HELPER_FAILED'; fail(code, `native publication failed: ${code}`); }
    fsyncSync(parentFd);
    const published = kind === 'file' ? regularNoFollow(destinationAbsolute) : directoryNoFollow(destinationAbsolute);
    if (!sameInode(sourceStat, published)) fail('POSTCHECK_FAILED', 'destination inode differs from source');
    if (kind === 'file' && (published.nlink !== 1 || sourceHash === undefined || sha256(readNoFollow(destinationAbsolute)) !== sourceHash)) fail('POSTCHECK_FAILED', 'published file identity mismatch');
    if (kind === 'directory' && (sourceTree === undefined || deterministicTreeRoot(destinationAbsolute) !== sourceTree)) fail('POSTCHECK_FAILED', 'published directory tree mismatch');
  } finally { closeSync(sourceFd); closeSync(parentFd); }
}
export function publishFileExclusive(source: string, destination: string, identity: NativePublisherIdentity, parentDirectory?: string): void { publish(source, destination, 'file', identity, parentDirectory); }
export function publishDirectoryExclusive(source: string, destination: string, identity: NativePublisherIdentity, parentDirectory?: string): void { publish(source, destination, 'directory', identity, parentDirectory); }
