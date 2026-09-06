import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { finalizeFinalEvidence } from '../core/evidence/final.ts';

function fixture(): { root: string; manifest: string } {
  const root = mkdtempSync(join(tmpdir(), 'omd-final-evidence-'));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const manifest = join(root, '.omd', 'stale-final-evidence.json');
  writeFileSync(manifest, '{');
  return { root, manifest };
}

function cleanup(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

function assertNoV1Publication(root: string): void {
  assert.equal(existsSync(join(root, '.omd', '.final-evidence.lock')), false);
  assert.equal(existsSync(join(root, '.omd', 'final-evidence.json')), false);
  assert.equal(existsSync(join(root, '.omd', 'final-evidence-runs')), false);
  assert.deepEqual(readdirSync(join(root, '.omd')), ['stale-final-evidence.json']);
}

function assertLegacyPublicationDisabled(root: string, manifest: string): void {
  assert.throws(() => finalizeFinalEvidence(root, manifest), (error: unknown) => {
    assert.equal((error as Error).message, 'LEGACY_PUBLICATION_DISABLED');
    assert.equal((error as Error & { code?: string }).code, 'LEGACY_PUBLICATION_DISABLED');
    return true;
  });
  assertNoV1Publication(root);
}

test('v1 finalization is disabled before opening a stale manifest or writing publication state', () => {
  const item = fixture();
  try {
    assertLegacyPublicationDisabled(item.root, item.manifest);
    assertLegacyPublicationDisabled(item.root, join(item.root, '.omd', 'missing-manifest.json'));
  } finally {
    cleanup(item.root);
  }
});

test('the CLI disables v1 finalization before opening a stale manifest or writing publication state', () => {
  const item = fixture();
  try {
    const cli = join(process.cwd(), 'bin', 'omd.ts');
    const result = spawnSync(process.execPath, [cli, 'evidence', 'finalize', '--input', item.manifest, '--json'], { cwd: item.root, encoding: 'utf8', shell: false });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LEGACY_PUBLICATION_DISABLED/);
    assertNoV1Publication(item.root);
  } finally {
    cleanup(item.root);
  }
});
