import assert from 'node:assert/strict';
import { closeSync, constants, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ExclusivePublicationError, prepareDarwinPublisherIdentity, publishDirectoryExclusive, publishFileExclusive, type NativePublisherIdentity } from '../scripts/benchmark/publish-exclusive.ts';

const darwin = process.platform === 'darwin';
let preparedIdentity: NativePublisherIdentity | undefined;

function nativeIdentity(): NativePublisherIdentity {
  if (preparedIdentity) return preparedIdentity;
  const compilerPath = execFileSync('/usr/bin/xcrun', ['--find', 'clang'], { encoding: 'utf8' }).trim();
  const sdkPath = execFileSync('/usr/bin/xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
  preparedIdentity = prepareDarwinPublisherIdentity({
    binaryPath: join(mkdtempSync(join(tmpdir(), 'omd-native-publisher-')), 'omd-darwin-publish-v1'),
    compilerPath,
    compilerArgv: [],
    sdkPath,
    deploymentTarget: '14.0',
    signing: { mode: 'none' },
    metadata: { test: 'benchmark-native-publish' },
  });
  return preparedIdentity;
}
function inTemporaryDirectory(run: (directory: string) => void): void {
  const directory = join(tmpdir(), `omd-native-publish-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(directory, { mode: 0o700 });
  const previous = process.cwd();
  process.chdir(directory);
  try { run(directory); } finally { process.chdir(previous); rmSync(directory, { recursive: true, force: true }); }
}
function expectCode(run: () => void, code: string): void {
  assert.throws(run, (error: unknown) => error instanceof ExclusivePublicationError && error.code === code);
}

test('native Darwin publisher fails closed off Darwin', { skip: darwin }, () => {
  expectCode(() => publishFileExclusive('source', 'destination', undefined as unknown as NativePublisherIdentity), 'DARWIN_PUBLISH_UNSUPPORTED');
});

test('native Darwin publisher publishes exclusive files and directories', { skip: !darwin, concurrency: false }, () => {
  const identity = nativeIdentity();
  inTemporaryDirectory(() => {
    writeFileSync('file-source', 'verified bytes');
    const fileInode = lstatSync('file-source').ino;
    publishFileExclusive('file-source', 'file-destination', identity);
    assert.equal(lstatSync('file-destination').ino, fileInode);
    assert.equal(lstatSync('file-destination').nlink, 1);

    mkdirSync('directory-source');
    writeFileSync('directory-source/nested', 'tree payload');
    const directoryInode = lstatSync('directory-source').ino;
    publishDirectoryExclusive('directory-source', 'directory-destination', identity);
    assert.equal(lstatSync('directory-destination').ino, directoryInode);
  });
});

test('native Darwin publisher rejects existing destinations and invalid sources', { skip: !darwin, concurrency: false }, () => {
  const identity = nativeIdentity();
  inTemporaryDirectory(() => {
    writeFileSync('source', 'x');
    writeFileSync('destination', 'already here');
    expectCode(() => publishFileExclusive('source', 'destination', identity), 'DESTINATION_EXISTS');
    writeFileSync('hardlink-source', 'x');
    linkSync('hardlink-source', 'hardlink-alias');
    expectCode(() => publishFileExclusive('hardlink-source', 'hardlink-destination', identity), 'SOURCE_INVALID');
    symlinkSync('source', 'symlink-source');
    expectCode(() => publishFileExclusive('symlink-source', 'symlink-destination', identity), 'SOURCE_INVALID');
    mkdirSync('a-directory');
    expectCode(() => publishFileExclusive('a-directory', 'wrong-file-kind', identity), 'SOURCE_INVALID');
    writeFileSync('a-file', 'x');
    expectCode(() => publishDirectoryExclusive('a-file', 'wrong-directory-kind', identity), 'SOURCE_INVALID');
  });
});

test('native Darwin helper rejects source replacement and traversal names', { skip: !darwin, concurrency: false }, () => {
  const identity = nativeIdentity();
  inTemporaryDirectory(() => {
    writeFileSync('source', 'old');
    const parentFd = openSync('.', constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const sourceFd = openSync('source', constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      writeFileSync('replacement', 'new');
      renameSync('replacement', 'source');
      const replaced = spawnSync(identity.binaryPath, ['publish-file-exclusive', 'source', 'destination'], { encoding: 'utf8', shell: false, stdio: ['ignore', 'pipe', 'pipe', parentFd, sourceFd] });
      assert.equal(replaced.status, 65);
      assert.match(replaced.stderr, /SOURCE_INVALID/);
    } finally { closeSync(sourceFd); closeSync(parentFd); }
    expectCode(() => publishFileExclusive('../source', 'destination', identity), 'USAGE');
    expectCode(() => publishFileExclusive('source', '../destination', identity), 'USAGE');
  });
});

test('native source contains no nonexclusive publication fallback', () => {
  const source = readFileSync('scripts/benchmark/native/omd-darwin-publish-v1.c', 'utf8');
  assert.match(source, /renameatx_np\s*\([^;]*RENAME_EXCL/s);
  assert.doesNotMatch(source, /\b(?:rename|renameat|link|symlink|copyfile)\s*\(/);
  assert.match(source, /publish-file-exclusive/);
  assert.match(source, /publish-directory-exclusive/);
});
