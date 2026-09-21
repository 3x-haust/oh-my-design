import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createOmdRuntimeSnapshot } from '../extensions/omd-runtime-snapshot.ts';

test('Pi runtime keeps an immutable source snapshot after the plugin checkout changes', t => {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'omd-runtime-source-'));
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  mkdirSync(join(sourceRoot, 'bin'), { recursive: true });
  mkdirSync(join(sourceRoot, 'core/ref'), { recursive: true });
  writeFileSync(join(sourceRoot, 'package.json'), JSON.stringify({ files: ['bin', 'core'] }));
  writeFileSync(join(sourceRoot, 'bin/omd.mjs'), 'import "../core/ref/module.ts";\n');
  writeFileSync(join(sourceRoot, 'bin/run-ts.mjs'), 'export {};\n');
  writeFileSync(join(sourceRoot, 'bin/omd.ts'), 'import "../core/ref/module.ts";\n');
  writeFileSync(join(sourceRoot, 'core/ref/module.ts'), 'export const value = "stable";\n');

  const snapshot = createOmdRuntimeSnapshot({ sourceRoot, dependencyRoot: null });
  t.after(() => snapshot.dispose());
  rmSync(join(sourceRoot, 'core/ref/module.ts'));

  assert.equal(readFileSync(join(snapshot.root, 'core/ref/module.ts'), 'utf8'), 'export const value = "stable";\n');
  assert.equal(existsSync(snapshot.entryPath), true);
  assert.notEqual(realpathSync(snapshot.root), realpathSync(sourceRoot));
  const execution = spawnSync(process.execPath, [snapshot.entryPath], { encoding: 'utf8' });
  assert.equal(execution.status, 0, execution.stderr);
});
