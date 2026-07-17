import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { computeMembership, validateRepoPath, type MembershipSpec } from '../scripts/benchmark/contracts.ts';

function fixture(): { root: string; spec: MembershipSpec } {
  const root = mkdtempSync(join(tmpdir(), 'omd-membership-'));
  mkdirSync(join(root, 'tree', 'excluded'), { recursive: true });
  writeFileSync(join(root, 'tree', 'keep.txt'), 'keep');
  writeFileSync(join(root, 'tree', 'excluded', 'drop.txt'), 'drop');
  writeFileSync(join(root, 'external.txt'), 'external');
  return { root, spec: { schemaVersion: 'bundle-membership-v1', roots: ['tree'], externalFiles: ['external.txt'], exclusions: [{ path: 'tree/excluded', kind: 'directory' }], requiredPaths: ['tree/keep.txt'], lockOutputPath: 'tree/bundle.lock.json' } };
}
function done(root: string): void { rmSync(root, { recursive: true, force: true }); }

test('membership is deterministic and exact descendant exclusions remove only descendants', () => {
  const { root, spec } = fixture();
  try {
    const paths = computeMembership(root, spec, { lockMode: 'create' }).map(entry => entry.path);
    assert.deepEqual(paths, ['external.txt', 'tree/keep.txt']);
    assert.deepEqual(computeMembership(root, spec, { lockMode: 'create' }), computeMembership(root, spec, { lockMode: 'create' }));
  } finally { done(root); }
});
test('recursive membership visits every nested file exactly once', () => {
  const { root, spec } = fixture();
  try {
    mkdirSync(join(root, 'tree', 'a', 'b', 'c'), { recursive: true });
    writeFileSync(join(root, 'tree', 'a', 'first.txt'), 'first');
    writeFileSync(join(root, 'tree', 'a', 'b', 'second.txt'), 'second');
    writeFileSync(join(root, 'tree', 'a', 'b', 'c', 'third.txt'), 'third');
    const paths = computeMembership(root, { ...spec, exclusions: [] }, { lockMode: 'create' }).map(entry => entry.path);
    assert.deepEqual(paths, [...new Set(paths)]);
    assert.deepEqual(paths, ['external.txt', 'tree/a/b/c/third.txt', 'tree/a/b/second.txt', 'tree/a/first.txt', 'tree/excluded/drop.txt', 'tree/keep.txt']);
  } finally { done(root); }
});

test('membership rejects collisions, symlinks, special roots, and bad typed exclusions', () => {
  const { root, spec } = fixture();
  try {
    assert.throws(() => computeMembership(root, { ...spec, externalFiles: ['tree/keep.txt'] }, { lockMode: 'create' }), /collision/);
    symlinkSync('keep.txt', join(root, 'tree', 'link.txt'));
    assert.throws(() => computeMembership(root, spec, { lockMode: 'create' }), /symlink/);
    rmSync(join(root, 'tree', 'link.txt'));
    assert.throws(() => computeMembership(root, { ...spec, exclusions: [{ path: 'tree/keep.txt', kind: 'directory' }] }, { lockMode: 'create' }), /kind mismatch/);
    assert.throws(() => computeMembership(root, { ...spec, exclusions: [{ path: 'tree/missing', kind: 'file' }] }, { lockMode: 'create' }));
    execFileSync('mkfifo', [join(root, 'tree', 'pipe')]);
    assert.throws(() => computeMembership(root, spec, { lockMode: 'create' }), /special file/);
  } finally { done(root); }
});

test('membership requires declared regular members and rejects traversal paths', () => {
  const { root, spec } = fixture();
  try {
    assert.throws(() => computeMembership(root, { ...spec, requiredPaths: ['tree/excluded/drop.txt'] }, { lockMode: 'create' }), /required path/);
    assert.throws(() => computeMembership(root, { ...spec, externalFiles: ['missing.txt'] }, { lockMode: 'create' }));
    for (const path of ['', '.', '..', '../x', '/absolute', 'a//b', 'a\\b', 'a\0b']) assert.throws(() => validateRepoPath(path));
  } finally { done(root); }
});

test('digest-key guard is scoped to static instances', () => {
  const { root, spec } = fixture();
  try {
    writeFileSync(join(root, 'tree', 'static.json'), '{"bundleLockFileSha256":"x"}');
    const staticSpec = { ...spec, artifacts: [{ path: 'tree/static.json', class: 'static-instance' as const }] };
    assert.throws(() => computeMembership(root, staticSpec, { lockMode: 'create' }), /forbidden lock digest key/);
    for (const artifactClass of ['schema', 'vector', 'docs', 'source', 'raw-evidence'] as const) {
      assert.doesNotThrow(() => computeMembership(root, { ...spec, artifacts: [{ path: 'tree/static.json', class: artifactClass }] }, { lockMode: 'create' }));
    }
  } finally { done(root); }
});

test('lock is absent during creation and required during validation', () => {
  const { root, spec } = fixture();
  try {
    assert.throws(() => computeMembership(root, spec, { lockMode: 'validate' }), /required/);
    writeFileSync(join(root, 'tree', 'bundle.lock.json'), '{}');
    assert.throws(() => computeMembership(root, spec, { lockMode: 'create' }), /exists before creation/);
    assert.doesNotThrow(() => computeMembership(root, spec, { lockMode: 'validate' }));
  } finally { done(root); }
});
