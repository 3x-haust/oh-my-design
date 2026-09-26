import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { hostCapabilityMatrix } from '../core/host-capability.ts';

const repository = join(import.meta.dirname, '..');
const cli = join(repository, 'bin', 'omd.ts');

test('host capability matrix distinguishes Pi hooks, Claude declarations, and Codex prose-only restrictions', () => {
  const pi = hostCapabilityMatrix({ host: 'pi', piHooksPresent: true });
  assert.equal(pi.guarantees.writeBoundary.enforced, true);
  assert.equal(pi.guarantees.reviewerIsolation.enforced, true);
  assert.equal(pi.guarantees.completionHold.enforced, true);

  const piWithoutHooks = hostCapabilityMatrix({ host: 'pi', piHooksPresent: false });
  assert.equal(piWithoutHooks.guarantees.writeBoundary.enforced, false);
  assert.equal(piWithoutHooks.guarantees.reviewerIsolation.enforced, false);
  assert.equal(piWithoutHooks.guarantees.completionHold.enforced, false);

  const claude = hostCapabilityMatrix({ host: 'claude', claudeDisallowedTools: true });
  assert.equal(claude.guarantees.writeBoundary.enforced, false);
  assert.equal(claude.guarantees.reviewerIsolation.enforced, true);
  assert.equal(claude.guarantees.completionHold.enforced, false);

  const codex = hostCapabilityMatrix({ host: 'codex', codexRestrictions: 'prose-only' });
  assert.equal(codex.guarantees.writeBoundary.enforced, false);
  assert.equal(codex.guarantees.reviewerIsolation.enforced, false);
  assert.equal(codex.guarantees.completionHold.enforced, false);
});

test('host capabilities CLI reports the current local host without claiming structural enforcement', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-host-capabilities-'));
  try {
    const result = spawnSync(process.execPath, [cli, 'host', 'capabilities', '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const matrix = JSON.parse(result.stdout) as ReturnType<typeof hostCapabilityMatrix>;
    assert.equal(matrix.host, 'local');
    assert.equal(matrix.guarantees.writeBoundary.enforced, false);
    assert.equal(matrix.guarantees.reviewerIsolation.enforced, false);
    assert.equal(matrix.guarantees.completionHold.enforced, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('legacy evidence check remains a deprecated alias for migration verify-final-v1', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-v1-migration-'));
  try {
    mkdirSync(join(root, '.omd'));
    const alias = spawnSync(process.execPath, [cli, 'evidence', 'check', '--json'], { cwd: root, encoding: 'utf8' });
    const migration = spawnSync(process.execPath, [cli, 'migration', 'verify-final-v1', '--json'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(alias.status, 0); assert.notEqual(migration.status, 0);
    assert.match(alias.stderr, /^deprecated: `omd evidence check` is now `omd migration verify-final-v1`/);
    assert.doesNotMatch(migration.stderr, /deprecated/);
    assert.match(alias.stderr, /final-evidence\.json/); assert.match(migration.stderr, /final-evidence\.json/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('benchmark harness has a descriptive primary bin and preserves the legacy alias', () => {
  const pkg = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  assert.equal(pkg.bin['omd-benchmark-harness'], './bin/omd-harness-v2.mjs');
  assert.equal(pkg.bin['omd-harness-v2'], './bin/omd-harness-v2.mjs');
});
