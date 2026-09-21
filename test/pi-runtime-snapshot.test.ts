import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  createOmdRuntimeSnapshot,
  OmdRuntimeSnapshotError,
  runtimeDependencyRoot,
  type OmdRuntimeSnapshot,
} from '../extensions/omd-runtime-snapshot.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

test('Pi runtime derives the nearest dependency root for nested installs', () => {
  const nestedRoot = join(tmpdir(), 'outer', 'node_modules', '@scope', 'plugin', 'node_modules');
  const resolvedTsx = join(nestedRoot, 'tsx', 'dist', 'loader.mjs');

  assert.equal(runtimeDependencyRoot(resolvedTsx), nestedRoot);
  assert.throws(
    () => runtimeDependencyRoot(join(tmpdir(), 'tsx', 'dist', 'loader.mjs')),
    /OMD_RUNTIME_DEPENDENCIES_INVALID/,
  );
});

test('Pi activation captures the runtime before the first command', t => {
  const runtimeTemp = mkdtempSync(join(tmpdir(), 'omd-runtime-activation-'));
  t.after(() => rmSync(runtimeTemp, { recursive: true, force: true }));
  const runtimeUrl = new URL('../extensions/omd-runtime.ts', import.meta.url).href;

  const imported = spawnSync(process.execPath, [
    '--import', 'tsx', '--input-type=module', '-e', [
      'const { readdirSync } = await import("node:fs");',
      'await import(process.argv[1]);',
      'console.log(readdirSync(process.env.TMPDIR).filter(name => name.startsWith("omd-runtime-")).length);',
    ].join('\n'), runtimeUrl,
  ], { encoding: 'utf8', env: { ...process.env, TMPDIR: runtimeTemp } });

  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout.trim(), '1');
});

test('first OMD command survives checkout removal after Pi activation', t => {
  const pluginRoot = mkdtempSync(join(tmpdir(), 'omd-runtime-plugin-'));
  const targetRoot = mkdtempSync(join(tmpdir(), 'omd-runtime-target-'));
  t.after(() => rmSync(pluginRoot, { recursive: true, force: true }));
  t.after(() => rmSync(targetRoot, { recursive: true, force: true }));
  mkdirSync(join(pluginRoot, 'bin'), { recursive: true });
  mkdirSync(join(pluginRoot, 'extensions'), { recursive: true });
  mkdirSync(join(pluginRoot, 'node_modules'), { recursive: true });
  writeFileSync(join(pluginRoot, 'package.json'), '{"type":"module"}');
  writeFileSync(join(pluginRoot, 'bin/omd.mjs'), [
    'console.log(JSON.stringify({ schema: "production-readiness-v1", ok: false, blockers: ["contract not delivered"] }));',
    'process.exitCode = 1;',
  ].join('\n'));
  writeFileSync(join(pluginRoot, 'bin/run-ts.mjs'), 'export {};\n');
  writeFileSync(join(pluginRoot, 'bin/omd.ts'), 'export {};\n');
  cpSync(join(repositoryRoot, 'extensions/omd-runtime.ts'), join(pluginRoot, 'extensions/omd-runtime.ts'));
  cpSync(join(repositoryRoot, 'extensions/omd-runtime-snapshot.ts'), join(pluginRoot, 'extensions/omd-runtime-snapshot.ts'));
  cpSync(join(repositoryRoot, 'node_modules/tsx'), join(pluginRoot, 'node_modules/tsx'), { recursive: true });

  const runtimeUrl = pathToFileURL(join(pluginRoot, 'extensions/omd-runtime.ts')).href;
  const probe = spawnSync(process.execPath, [
    '--import', 'tsx', '--input-type=module', '-e', [
      'const { existsSync, rmSync } = await import("node:fs");',
      'const { spawnSync } = await import("node:child_process");',
      'const [runtimeUrl, pluginRoot, targetRoot] = process.argv.slice(1);',
      'const runtime = await import(runtimeUrl);',
      'rmSync(pluginRoot, { recursive: true, force: true });',
      'const pi = { exec: async (command, args, options) => {',
      '  const child = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8" });',
      '  return { stdout: child.stdout ?? "", stderr: child.stderr ?? "", code: child.status ?? 1, killed: child.signal !== null };',
      '} };',
      'try { await runtime.runOmd(pi, ["guard", "production", "--json"], targetRoot); }',
      'catch (error) {',
      '  console.log(JSON.stringify({ sourceGone: !existsSync(pluginRoot), failure: runtime.guardFailure(error), raw: String(error) }));',
      '}',
    ].join('\n'), runtimeUrl, pluginRoot, targetRoot,
  ], { cwd: repositoryRoot, encoding: 'utf8' });

  assert.equal(probe.status, 0, probe.stderr);
  const result = JSON.parse(probe.stdout) as { sourceGone?: unknown; failure?: { repairable?: unknown }; raw?: unknown };
  assert.equal(result.sourceGone, true);
  assert.equal(result.failure?.repairable, true);
  assert.doesNotMatch(String(result.raw), /ERR_MODULE_NOT_FOUND|OMD_RUNTIME_SOURCE_INCOMPLETE/);
});

test('Pi runtime keeps an immutable source snapshot after the plugin checkout changes', t => {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'omd-runtime-source-'));
  const dependencyParent = mkdtempSync(join(tmpdir(), 'omd-runtime-dependencies-'));
  const dependencyRoot = join(dependencyParent, 'node_modules');
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  t.after(() => rmSync(dependencyParent, { recursive: true, force: true }));
  mkdirSync(join(sourceRoot, 'bin'), { recursive: true });
  mkdirSync(join(sourceRoot, 'core/ref'), { recursive: true });
  mkdirSync(join(dependencyRoot, 'marker-package'), { recursive: true });
  writeFileSync(join(sourceRoot, 'package.json'), JSON.stringify({ files: ['bin', 'core'] }));
  writeFileSync(join(sourceRoot, 'bin/omd.mjs'), 'import { marker } from "marker-package";\nimport "../core/ref/module.ts";\nif (marker !== "stable") process.exitCode = 2;\n');
  writeFileSync(join(sourceRoot, 'bin/run-ts.mjs'), 'export {};\n');
  writeFileSync(join(sourceRoot, 'bin/omd.ts'), 'import "../core/ref/module.ts";\n');
  writeFileSync(join(sourceRoot, 'core/ref/module.ts'), 'export const value = "stable";\n');
  writeFileSync(join(dependencyRoot, 'marker-package/package.json'), JSON.stringify({ type: 'module', exports: './index.js' }));
  writeFileSync(join(dependencyRoot, 'marker-package/index.js'), 'export const marker = "stable";\n');

  const snapshot = createOmdRuntimeSnapshot({ sourceRoot, dependencyRoot });
  t.after(() => snapshot.dispose());
  rmSync(sourceRoot, { recursive: true, force: true });
  rmSync(dependencyParent, { recursive: true, force: true });

  assert.equal(readFileSync(join(snapshot.root, 'core/ref/module.ts'), 'utf8'), 'export const value = "stable";\n');
  assert.equal(existsSync(snapshot.entryPath), true);
  assert.equal(lstatSync(join(snapshot.root, 'node_modules')).isSymbolicLink(), false);
  const execution = spawnSync(process.execPath, [snapshot.entryPath], { encoding: 'utf8' });
  assert.equal(execution.status, 0, execution.stderr);
});

test('dependency mutation cannot publish a mixed runtime snapshot', async t => {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'omd-runtime-source-'));
  const dependencyParent = mkdtempSync(join(tmpdir(), 'omd-runtime-dependencies-'));
  const dependencyRoot = join(dependencyParent, 'node_modules');
  const dependencyFile = join(dependencyRoot, 'volatile-package/payload.bin');
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  t.after(() => rmSync(dependencyParent, { recursive: true, force: true }));
  mkdirSync(join(sourceRoot, 'bin'), { recursive: true });
  mkdirSync(join(dependencyRoot, 'volatile-package'), { recursive: true });
  writeFileSync(join(sourceRoot, 'package.json'), '{}');
  writeFileSync(join(sourceRoot, 'bin/omd.mjs'), 'export {};\n');
  writeFileSync(join(sourceRoot, 'bin/run-ts.mjs'), 'export {};\n');
  writeFileSync(join(sourceRoot, 'bin/omd.ts'), 'export {};\n');
  writeFileSync(dependencyFile, Buffer.alloc(8 * 1024 * 1024, 0x41));
  const mutator = spawn(process.execPath, ['-e', [
    'const { writeFileSync } = require("node:fs");',
    'const [target] = process.argv.slice(1);',
    'process.stdout.write("ready\\n");',
    'for (let index = 0; index < 12; index += 1) {',
    '  writeFileSync(target, Buffer.alloc(8 * 1024 * 1024, index % 2 ? 0x41 : 0x42));',
    '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);',
    '}',
  ].join('\n'), dependencyFile]);
  if (mutator.stdout === null) throw new Error('mutation child did not expose a readiness stream');
  const readiness = once(mutator.stdout, 'data').then(([chunk]) => String(chunk));
  const mutationComplete = once(mutator, 'exit');
  const endedBeforeReady = once(mutator, 'exit').then(([code, signal]) => {
    throw new Error(`mutation child exited before readiness: ${String(code ?? signal)}`);
  });
  assert.equal(await Promise.race([readiness, endedBeforeReady]), 'ready\n');
  let snapshot: OmdRuntimeSnapshot | undefined;
  try { snapshot = createOmdRuntimeSnapshot({ sourceRoot, dependencyRoot }); }
  catch (error) {
    if (!(error instanceof OmdRuntimeSnapshotError)) throw error;
    assert.match(error.message, /OMD_RUNTIME_SOURCE_UNSTABLE/);
  }
  await mutationComplete;
  snapshot ??= createOmdRuntimeSnapshot({ sourceRoot, dependencyRoot });
  t.after(() => snapshot?.dispose());
  const copied = readFileSync(join(snapshot.root, 'node_modules/volatile-package/payload.bin'));
  assert.equal(copied.length, 8 * 1024 * 1024);
  assert.equal(copied.every(byte => byte === copied[0]), true);
});
