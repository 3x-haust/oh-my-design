import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson, sha256, type JsonValue } from '../scripts/benchmark/contracts.ts';
import { validateConditionBinding, validateRuntimeEnvironment, validateRuntimeManifest } from '../scripts/benchmark/validate-runtime-manifest.ts';

const hash = (label: string): string => sha256(label);
function runtime(): Record<string, unknown> {
  return { schemaVersion: 'runtime-environment-v1', provider: 'openai', model: 'gpt-5', reasoning: 'high', config: { effort: 'high' }, node: { path: '/opt/omd/node', sha256: hash('node') }, codex: { path: '/opt/omd/codex', sha256: hash('codex') }, packageManager: { path: '/opt/omd/npm', sha256: hash('npm') }, browser: { path: '/opt/omd/browser', sha256: hash('browser') }, controller: { contentTreeSha256: hash('controller'), excludedManifestPaths: ['evals/product-ux/harness/bundle-v1/runtime.json'] }, omdPathShim: { path: '/opt/omd/shim/omd', targetPath: '/worktree/bin/omd.ts', commitSha256: hash('commit'), worktreeSha256: hash('worktree'), packSha256: hash('pack') }, locale: 'C.UTF-8', timezone: 'UTC', environmentAllowlist: ['CI', 'LANG'], secretEnvironment: [{ name: 'API_TOKEN', fingerprintSha256: hash('secret') }], roots: { evaluatorRootSha256: hash('evaluator'), scoringRootSha256: hash('scoring'), toolRootSha256: hash('tool'), browserRootSha256: hash('browser-root'), snapshotRootSha256: hash('snapshot'), denySetRootSha256: hash('deny') } };
}
function binding(runtimeBytes: string, lockBytes: string, finalBytes: string): Record<string, unknown> {
  return { schemaVersion: 'condition-binding-v1', conditionSha256: hash('condition'), conditionTreeSha256: hash('condition-tree'), bundleLockPath: 'lock.json', bundleLockSha256: sha256(lockBytes), runtimeEnvironmentPath: 'runtime.json', runtimeEnvironmentSha256: sha256(runtimeBytes), sourceFinalizationPath: 'final.json', sourceFinalizationSha256: sha256(finalBytes) };
}
function mutate(path: string[], value: unknown): Record<string, unknown> { const copy = structuredClone(runtime()); let cursor: Record<string, unknown> = copy; for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>; cursor[path.at(-1)!] = value; return copy; }

test('runtime identity is valid before binding and receives a later canonical one-way binding', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-runtime-'));
  try {
    const r = JSON.stringify(runtime()); const lock = '{"entries":[]}'; const final = '{"status":"ACCEPTED"}';
    writeFileSync(join(root, 'runtime.json'), r); writeFileSync(join(root, 'lock.json'), lock); writeFileSync(join(root, 'final.json'), final);
    assert.doesNotThrow(() => validateRuntimeManifest(root, { runtime: 'runtime.json' }));
    const b = binding(r, lock, final); writeFileSync(join(root, 'binding.json'), canonicalJson(b as JsonValue));
    assert.doesNotThrow(() => validateRuntimeManifest(root, { runtime: 'runtime.json', binding: 'binding.json', lock: 'lock.json', sourceFinalization: 'final.json' }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('runtime allows user-owned project paths while rejecting ambient host state', () => {
  assert.doesNotThrow(() => validateRuntimeEnvironment(mutate(['node', 'path'], '/Users/lyu/Project/OhMyDesign/tools/node')));
  assert.throws(() => validateRuntimeEnvironment(mutate(['node', 'path'], '/Users/alice/.codex/auth.json')));
});


test('runtime contract rejects cycles, placeholders, shared homes, secret values, synthetic bytes, and bad commit-local omd', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['self lock cycle', mutate(['bundleLockSha256'], hash('lock'))],
    ['mutual manifest cycle', mutate(['manifestSha256'], hash('manifest'))],
    ['placeholder', mutate(['model'], 'PLACEHOLDER')],
    ['shared home', mutate(['node', 'path'], '/Users/alice/.config/credentials')],
    ['secret leakage', mutate(['secretEnvironment', '0', 'value'], 'leaked')],
    ['synthetic bytes', mutate(['syntheticBytes'], 'AA==')],
    ['commit-local omd mismatch', mutate(['omdPathShim', 'targetPath'], '/usr/local/bin/omd')],
  ];
  for (const [name, value] of cases) assert.throws(() => validateRuntimeEnvironment(value), name);
});

test('binding is receipt-free and stale identity hashes fail closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-runtime-stale-'));
  try {
    const r = JSON.stringify(runtime()); const lock = '{}'; const final = '{}'; const b = binding(r, lock, final);
    assert.throws(() => validateConditionBinding({ ...b, reviewerReceipt: { approved: true } }));
    writeFileSync(join(root, 'runtime.json'), r); writeFileSync(join(root, 'lock.json'), lock); writeFileSync(join(root, 'final.json'), final);
    writeFileSync(join(root, 'binding.json'), canonicalJson({ ...b, runtimeEnvironmentSha256: hash('stale') } as JsonValue));
    assert.throws(() => validateRuntimeManifest(root, { runtime: 'runtime.json', binding: 'binding.json', lock: 'lock.json', sourceFinalization: 'final.json' }), /stale/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
