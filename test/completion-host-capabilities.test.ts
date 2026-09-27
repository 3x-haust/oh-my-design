import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completionHostCapabilities, formatCompletionHostCapabilities } from '../core/completion/host-capabilities.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';

const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
test('only native Pi identity attests hooks; a serialized or relabelled invocation does not', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-completion-host-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cliPath = join(import.meta.dirname, '../bin/omd.mjs');
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  const selection = input.modelCapability.routingInput.selectedModel;
  const native = createTestNativePiInvocation({ root, host: { nodePath: process.execPath, nodeSha256: digest(process.execPath),
    cliPath, cliSha256: digest(cliPath), provider: selection.provider, model: selection.modelId,
    thinkingLevel: 'medium', parentSessionId: 'host-capability-test' } });
  assert.ok(Object.values(completionHostCapabilities(native).guarantees).every(guarantee => guarantee.enforced));
  const serialized = JSON.parse(JSON.stringify(native)) as ProjectRunInvocation;
  const before = structuredClone(serialized);
  assert.ok(Object.values(completionHostCapabilities(serialized).guarantees).every(guarantee => !guarantee.enforced));
  assert.deepEqual(serialized, before);
  const local = createTestProjectRunInvocation(root);
  assert.equal(completionHostCapabilities(local).host, local.activation.hostCapability.host);
  for (const host of ['local', 'codex', 'claude'] as const) {
    const invocation = { ...local, activation: { ...local.activation, hostCapability: { host } } };
    assert.ok(Object.values(completionHostCapabilities(invocation).guarantees).every(guarantee => !guarantee.enforced));
  }
});

test('host report rejects malformed enforcement data rather than printing an invented guarantee', () => {
  assert.throws(() => formatCompletionHostCapabilities({ schema: 'host-capability-matrix-v1', host: 'pi', guarantees: {} }));
  assert.equal(formatCompletionHostCapabilities(undefined), '');
  const local = completionHostCapabilities();
  for (const [key, value] of Object.entries(local.guarantees)) {
    assert.ok(formatCompletionHostCapabilities(local).includes(`${key}: not-enforced`));
    assert.ok(formatCompletionHostCapabilities(local).includes(value.mechanism));
  }
});
