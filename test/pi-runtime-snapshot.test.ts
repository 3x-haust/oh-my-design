import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createOmdRuntimeSnapshot,
  OmdRuntimeSnapshotError,
  type OmdRuntimeSnapshot,
} from '../extensions/omd-runtime-snapshot.ts';

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
  const readyFile = join(dependencyParent, 'ready');
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
    'const [target, ready] = process.argv.slice(1);',
    'writeFileSync(ready, "ready");',
    'for (let index = 0; index < 12; index += 1) {',
    '  writeFileSync(target, Buffer.alloc(8 * 1024 * 1024, index % 2 ? 0x41 : 0x42));',
    '  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);',
    '}',
  ].join('\n'), dependencyFile, readyFile]);
  const mutationComplete = once(mutator, 'exit');
  while (!existsSync(readyFile)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
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
