import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, type TestContext } from 'node:test';
import { inventoryProjectRunMutations } from '../core/runtime/project-write-inventory.ts';

const repository = fileURLToPath(new URL('..', import.meta.url));
const writers = [
  { path: 'core/runtime/self-signed-activation.ts', guard: 'fsConstants.O_EXCL | fsConstants.O_NOFOLLOW', target: 'join(claims, sha256Hex(nonce))' },
  { path: 'extensions/omd-request-source.ts', guard: '!stat.isDirectory() || stat.isSymbolicLink()', target: 'join(projectRoot, record)' },
  { path: 'core/runtime/native-pi-run-record.ts', guard: 'previous.runId !== run.runId', target: "nativePiDirectory(run.projectRoot, '.omd/native-pi')" },
  { path: 'core/runtime/native-pi-run.ts', guard: '!issuedRuns.has(input.run)', target: "join(directory, 'command.json')" },
  { path: 'adapters/pi-reviewer-runtime.ts', guard: 'const run = getNativePiRun(input.invocation, input.root);', target: "join(directory, 'system.txt')" },
] as const;

function inventory(t: TestContext, path: string, source: string) {
  const root = mkdtempSync(join(tmpdir(), 'omd-native-writer-inventory-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  return inventoryProjectRunMutations(root, path);
}

for (const writer of writers) {
  test(`inventory admits the audited ${writer.path} writes`, t => {
    const source = readFileSync(join(repository, writer.path), 'utf8');
    const result = inventory(t, writer.path, source);
    assert.equal(result.owners.find(owner => owner.filePath === writer.path)?.classification, 'external-exception');
    assert.deepEqual(result.unguardedMutations, []);
  });

  test(`inventory rejects ${writer.path} when its authority boundary disappears`, t => {
    const source = readFileSync(join(repository, writer.path), 'utf8');
    assert.ok(source.includes(writer.guard));
    const changed = source.replace(writer.guard, writer.guard.startsWith('const ') ? 'const run = uncheckedRun;' : 'false');
    const result = inventory(t, writer.path, changed);
    assert.equal(result.owners.find(owner => owner.filePath === writer.path)?.classification, 'unclassified');
    assert.ok(result.unguardedMutations.length > 0);
  });

  test(`inventory rejects redirected ${writer.path} output paths`, t => {
    const source = readFileSync(join(repository, writer.path), 'utf8');
    assert.ok(source.includes(writer.target));
    const result = inventory(t, writer.path, source.replace(writer.target, "'/tmp/unapproved-target'"));
    assert.equal(result.owners.find(owner => owner.filePath === writer.path)?.classification, 'unclassified');
    assert.ok(result.unguardedMutations.length > 0);
  });

  test(`inventory rejects an extra direct writer in ${writer.path}`, t => {
    const source = readFileSync(join(repository, writer.path), 'utf8');
    const result = inventory(t, writer.path, `${source}\nwriteFileSync('/tmp/unapproved-target', 'injected');\n`);
    assert.equal(result.owners.find(owner => owner.filePath === writer.path)?.classification, 'unclassified');
    assert.ok(result.unguardedMutations.some(mutation => mutation.sourceLine.includes('unapproved-target')));
  });
}

for (const boundary of [
  { path: 'core/runtime/native-pi-run-record.ts', expression: 'const host = observedNativePiHost(input);', replacement: 'const host = input.host;' },
  { path: 'core/runtime/native-pi-run-record.ts', expression: 'if (!allowed || root !== realpathSync(root))', replacement: 'if (false)' },
  { path: 'extensions/omd-request-source.ts', expression: 'signNativeObservation(projectRoot, KIND, requestDigest(canonicalRouteJson(payload)))', replacement: "'unsigned'" },
]) {
  test(`inventory requires the native writer boundary ${boundary.expression}`, t => {
    const source = readFileSync(join(repository, boundary.path), 'utf8');
    assert.ok(source.includes(boundary.expression));
    const result = inventory(t, boundary.path, source.replace(boundary.expression, boundary.replacement));
    assert.equal(result.owners.find(owner => owner.filePath === boundary.path)?.classification, 'unclassified');
    assert.ok(result.unguardedMutations.length > 0);
  });
}

test('native command identity imports do not expose installer or build emitters to the CLI', () => {
  const result = inventoryProjectRunMutations(repository);
  assert.deepEqual(result.owners.filter(owner => owner.filePath === 'adapters/build.ts'
    || owner.filePath === 'core/install/browser-rs-download.ts'
    || owner.filePath === 'core/install/browser-rs-filesystem.ts'), []);
});
