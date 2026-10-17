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

test('the retired host capabilities CLI is absent', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-host-capabilities-'));
  try {
    const result = spawnSync(process.execPath, [cli, 'host', 'capabilities', '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}\n${result.stderr}`, /unknown command host/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('legacy evidence and migration commands are absent from the bounded CLI', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-v1-migration-'));
  try {
    mkdirSync(join(root, '.omd'));
    const alias = spawnSync(process.execPath, [cli, 'evidence', 'check', '--json'], { cwd: root, encoding: 'utf8' });
    const migration = spawnSync(process.execPath, [cli, 'migration', 'verify-final-v1', '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(alias.status, 1); assert.equal(migration.status, 1);
    assert.match(`${alias.stdout}\n${alias.stderr}`, /unknown command evidence/i);
    assert.match(`${migration.stdout}\n${migration.stderr}`, /unknown command migration/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('benchmark harness remains an npm script, not a public bin', () => {
  const pkg = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')) as { bin: Record<string, string>; scripts: Record<string, string> };
  assert.equal(pkg.bin['omd-benchmark-harness'], undefined);
  assert.equal(pkg.bin['omd-harness-v2'], undefined);
  assert.equal(pkg.scripts['benchmark:harness-v2'], 'node bin/omd-harness-v2.mjs');
});
