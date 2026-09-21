import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createOmdRuntimeSnapshot } from '../extensions/omd-runtime-snapshot.ts';

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
