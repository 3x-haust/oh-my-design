import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createBundleLock } from '../scripts/benchmark/lock-bundle.ts';
import { prepareDarwinPublisherIdentity, type NativePublisherIdentity } from '../scripts/benchmark/publish-exclusive.ts';
import { validateBundle } from '../scripts/benchmark/validate-bundle.ts';

function fixture(): { root: string; membership: string; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'omd-lock-'));
  mkdirSync(join(root, 'bundle'));
  writeFileSync(join(root, 'bundle', 'input.txt'), 'original');
  const membership = 'bundle/membership.json';
  const output = 'bundle/bundle.lock.json';
  writeFileSync(join(root, membership), JSON.stringify({ schemaVersion: 'bundle-membership-v1', roots: ['bundle'], requiredPaths: ['bundle/input.txt'], lockOutputPath: output }));
  return { root, membership, output };
}
function done(root: string): void { rmSync(root, { recursive: true, force: true }); }
let prepared: NativePublisherIdentity | undefined;
function nativeIdentity(): NativePublisherIdentity {
  if (prepared) return prepared;
  const compilerPath = execFileSync('/usr/bin/xcrun', ['--find', 'clang'], { encoding: 'utf8' }).trim();
  const sdkPath = execFileSync('/usr/bin/xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
  prepared = prepareDarwinPublisherIdentity({
    binaryPath: join(mkdtempSync(join(tmpdir(), 'omd-native-publisher-')), 'omd-darwin-publish-v1'),
    compilerPath, compilerArgv: [], sdkPath, deploymentTarget: '14.0', signing: { mode: 'none' }, metadata: { test: 'benchmark-lock' },
  });
  return prepared;
}

test('lock creation is deterministic, self-excluding, and validates by native readback', () => {
  const one = fixture(); const two = fixture();
  try {
    const first = createBundleLock(one.root, one.membership, one.output, nativeIdentity());
    const second = createBundleLock(two.root, two.membership, two.output, nativeIdentity());
    assert.deepEqual(first, second);
    assert.equal(readFileSync(join(one.root, one.output), 'utf8'), readFileSync(join(two.root, two.output), 'utf8'));
    assert.doesNotThrow(() => validateBundle(one.root, one.membership, one.output));
    assert.equal(first.entries.some(entry => entry.path === one.output), false);
  } finally { done(one.root); done(two.root); }
});
test('lock creation requires a prepared identity and does not compile a publisher itself', () => {
  const { root, membership, output } = fixture();
  try {
    assert.throws(() => createBundleLock(root, membership, output, undefined as unknown as NativePublisherIdentity));
    assert.throws(() => readFileSync(join(root, output)));
  } finally { done(root); }
});
test('stale native identity fails before the lock output is created', () => {
  const { root, membership, output } = fixture();
  try {
    const stale = { ...nativeIdentity(), binarySha256: '0'.repeat(64) };
    assert.throws(() => createBundleLock(root, membership, output, stale), /identity/i);
    assert.throws(() => readFileSync(join(root, output)));
  } finally { done(root); }
});
test('validation detects stale bytes and rejects noncanonical or mismatched lock paths', () => {
  const { root, membership, output } = fixture();
  try {
    createBundleLock(root, membership, output, nativeIdentity());
    writeFileSync(join(root, 'bundle', 'input.txt'), 'changed');
    assert.throws(() => validateBundle(root, membership, output), /stale|drift/);
    assert.throws(() => validateBundle(root, membership, 'bundle/other.lock.json'), /must equal/);
  } finally { done(root); }
});
test('validation detects mode drift', () => {
  const { root, membership, output } = fixture();
  try {
    createBundleLock(root, membership, output, nativeIdentity());
    chmodSync(join(root, 'bundle', 'input.txt'), 0o600);
    assert.throws(() => validateBundle(root, membership, output), /stale|drift/);
  } finally { done(root); }
});
test('creation fails closed for an existing output, temp residue, and path traversal', () => {
  const existing = fixture();
  try {
    writeFileSync(join(existing.root, existing.output), 'existing');
    assert.throws(() => createBundleLock(existing.root, existing.membership, existing.output, nativeIdentity()), /exists before creation/);
    assert.throws(() => createBundleLock(existing.root, existing.membership, '../escape.lock.json', nativeIdentity()), /must equal/);
  } finally { done(existing.root); }
  const residue = fixture();
  try {
    writeFileSync(join(residue.root, `${residue.output}.tmp-leftover`), 'residue');
    assert.throws(() => createBundleLock(residue.root, residue.membership, residue.output, nativeIdentity()), /residue|contender/);
  } finally { done(residue.root); }
});
test('validation requires the existing declared lock', () => {
  const { root, membership, output } = fixture();
  try { assert.throws(() => validateBundle(root, membership, output)); } finally { done(root); }
});
