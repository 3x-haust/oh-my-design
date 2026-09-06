import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runCodexRole, runCodexRoleCli } from '../adapters/codex-role-runtime.ts';
import { routeAdaptiveFlow } from '../core/route/adaptive-flow.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROUTE_FIXTURE = join(ROOT, 'test', 'fixtures', 'adaptive-flow', 'copy-only.json');

function routedProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-codex-role-'));
  const route = Buffer.from(JSON.stringify(routeAdaptiveFlow(JSON.parse(readFileSync(ROUTE_FIXTURE, 'utf8')))));
  const routeSha256 = createHash('sha256').update(route).digest('hex');
  mkdirSync(join(root, '.omd', 'route-records'), { recursive: true });
  writeFileSync(join(root, '.omd', 'route-records', `sha256-${routeSha256}.json`), route);
  writeFileSync(join(root, '.omd', 'route.json'), JSON.stringify({
    schema: 'adaptive-route-pointer-v1',
    record: `route-records/sha256-${routeSha256}.json`,
    sha256: routeSha256,
  }));
  return root;
}

test('non-production role runner rejects execution outside the trusted Codex host', () => {
  const root = routedProject();
  try {
    assert.throws(
      () => runCodexRole(root, 'omd-writer', 'Create the selected copy artifact.', { env: {} }),
      /ROLE_CODEX_HOST_REQUIRED/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('non-production role CLI cannot inject host-owned model or effort overrides', () => {
  assert.throws(
    () => runCodexRoleCli(['run', '--omd-role-model', 'omd-writer=gpt-5.6-luna']),
    /usage: omd-codex role run/,
  );
  assert.throws(
    () => runCodexRoleCli(['run', '--omd-role-effort', 'omd-writer=low']),
    /usage: omd-codex role run/,
  );
});

test('non-production role runner rejects roles outside the current route', () => {
  const root = routedProject();
  try {
    assert.throws(
      () => runCodexRole(root, 'omd-framer', 'Create a frame.', { env: {} }),
      /ROLE_ROUTE_MISMATCH/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
