import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { constants, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadUserBrowserDriver } from '../core/browser/driver.ts';
import test from 'node:test';
import {
  createOmdRuntimeSnapshot,
  OmdRuntimeSnapshotError,
  runtimeDependencyRoot,
  type OmdRuntimeSnapshot,
} from '../extensions/omd-runtime-snapshot.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

test('Unix default runtime state location preserves exact proxy argv compatibility', { skip: process.platform === 'win32' }, t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'omd-runtime-home-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourceRoot = join(directory, 'source');
  const home = join(directory, 'home');
  mkdirSync(home);
  for (const path of ['package.json', 'bin/omd.mjs', 'bin/run-ts.mjs', 'bin/omd.ts']) {
    mkdirSync(dirname(join(sourceRoot, path)), { recursive: true });
    writeFileSync(join(sourceRoot, path), 'fixture');
  }
  const environment: NodeJS.ProcessEnv = { ...process.env, HOME: home, XDG_CACHE_HOME: join(directory, 'cache') };
  delete environment.XDG_STATE_HOME;
  const probe = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', [
    'const { createOmdRuntimeSnapshot } = await import(process.argv[1]);',
    'const snapshot = createOmdRuntimeSnapshot({sourceRoot: process.argv[2], dependencyRoot: null});',
    'try { snapshot.assertIntact(); console.log(JSON.stringify({root: snapshot.root})); } finally { snapshot.dispose(); }',
  ].join('\n'), new URL('../extensions/omd-runtime-snapshot.ts', import.meta.url).href, sourceRoot], {
    cwd: repositoryRoot, env: environment, encoding: 'utf8', timeout: 20_000,
  });
  assert.equal(probe.status, 0, probe.stderr);
  const observed: { root: string } = JSON.parse(probe.stdout);
  assert.equal(dirname(observed.root), join(home, '.local', 'state', 'oh-my-design', 'runtime'));
  assert.doesNotMatch(observed.root, /\s/);
});

test('immutable Pi runtime survives cache cleanup in the separate state home', t => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-runtime-state-'));
  const sourceRoot = join(directory, 'source');
  const cacheHome = join(directory, 'cache');
  const stateHome = join(directory, 'state');
  const priorCache = process.env.XDG_CACHE_HOME;
  const priorState = process.env.XDG_STATE_HOME;
  process.env.XDG_CACHE_HOME = cacheHome;
  process.env.XDG_STATE_HOME = stateHome;
  t.after(() => {
    if (priorCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = priorCache;
    if (priorState === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = priorState;
    rmSync(directory, { recursive: true, force: true });
  });
  for (const path of ['package.json', 'bin/omd.mjs', 'bin/run-ts.mjs', 'bin/omd.ts']) {
    mkdirSync(dirname(join(sourceRoot, path)), { recursive: true });
    writeFileSync(join(sourceRoot, path), 'fixture');
  }
  const snapshot = createOmdRuntimeSnapshot({ sourceRoot, dependencyRoot: null });
  t.after(() => snapshot.dispose());
  rmSync(cacheHome, { recursive: true, force: true });
  snapshot.assertIntact();
  assert.equal(dirname(snapshot.root), realpathSync(join(stateHome, 'oh-my-design', 'runtime')));
  writeFileSync(join(snapshot.root, 'bin/omd.ts'), 'tampered');
  assert.throws(() => snapshot.assertIntact(), /OMD_RUNTIME_SNAPSHOT_LOST/);
});

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
  const temporaryHome = join(runtimeTemp, 'temp');
  const stateHome = join(runtimeTemp, 'state');
  mkdirSync(temporaryHome);
  const runtimeUrl = new URL('../extensions/omd-runtime.ts', import.meta.url).href;

  const imported = spawnSync(process.execPath, [
    '--import', 'tsx', '--input-type=module', '-e', [
      'const { readdirSync } = await import("node:fs");',
      'await import(process.argv[1]);',
      'const { join } = await import("node:path");',
      'process.stdout.write(JSON.stringify({ temporary: readdirSync(process.env.TMPDIR).filter(name => name.startsWith("omd-runtime-")).length, persisted: readdirSync(join(process.env.XDG_STATE_HOME, "oh-my-design", "runtime")).filter(name => name.startsWith("omd-runtime-")).length }));',
    ].join('\n'), runtimeUrl,
  ], { encoding: 'buffer', env: { ...process.env, TMPDIR: temporaryHome, XDG_STATE_HOME: stateHome }, timeout: 20_000 });

  assert.equal(imported.status, 0, imported.stderr.toString('utf8'));
  assert.deepEqual(JSON.parse(imported.stdout.toString('utf8')), { temporary: 0, persisted: 1 });
});

test('private cached snapshot survives temp cleanup and detects damage without recopying source', t => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-snapshot-lifetime-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourceRoot = join(directory, 'temp/source');
  const parentRoot = join(directory, 'cache');
  for (const path of ['package.json', 'bin/omd.mjs', 'bin/run-ts.mjs', 'bin/omd.ts',
    'src/skills/omd-ultradesign/SKILL.md']) {
    mkdirSync(dirname(join(sourceRoot, path)), { recursive: true });
    writeFileSync(join(sourceRoot, path), path === 'package.json' ? '{}' : 'fixture');
  }
  const snapshot = createOmdRuntimeSnapshot({ sourceRoot, dependencyRoot: null, parentRoot });
  t.after(() => snapshot.dispose());
  assert.equal(dirname(snapshot.root), realpathSync(parentRoot));
  assert.equal(lstatSync(snapshot.root).mode & 0o777, 0o700);
  rmSync(join(directory, 'temp'), { recursive: true, force: true });
  snapshot.assertIntact();
  const packagePath = join(snapshot.root, 'package.json');
  rmSync(packagePath);
  assert.throws(() => snapshot.assertIntact(), /OMD_RUNTIME_SNAPSHOT_LOST/);
  writeFileSync(packagePath, '{}');
  assert.throws(() => snapshot.assertIntact(), /OMD_RUNTIME_SNAPSHOT_LOST/);
});

test('first OMD command survives checkout removal after Pi activation', t => {
  const pluginRoot = mkdtempSync(join(tmpdir(), 'omd-runtime-plugin-'));
  const targetRoot = mkdtempSync(join(tmpdir(), 'omd-runtime-target-'));
  t.after(() => rmSync(pluginRoot, { recursive: true, force: true }));
  t.after(() => rmSync(targetRoot, { recursive: true, force: true }));
  for (const path of ['package.json', 'bin', 'core', 'adapters', 'vendor', 'extensions', 'src', 'scripts', 'dist', 'skills', 'agents', '.mcp.json', '.claude-plugin', '.codex-plugin', '.agents', 'README.md', 'README.ko.md', 'LICENSE']) {
    const source = join(repositoryRoot, path);
    if (existsSync(source)) cpSync(source, join(pluginRoot, path), { recursive: true, mode: constants.COPYFILE_FICLONE });
  }
  cpSync(join(repositoryRoot, 'node_modules'), join(pluginRoot, 'node_modules'), {
    recursive: true,
    dereference: false,
    mode: constants.COPYFILE_FICLONE,
    filter: source => !['.bin', 'node_modules'].includes(source.slice(join(repositoryRoot, 'node_modules').length + 1)),
  });

  const runtimeUrl = pathToFileURL(join(pluginRoot, 'extensions/omd-runtime.ts')).href;
  const temporaryHome = join(targetRoot, 'temp');
  const stateHome = join(targetRoot, 'state');
  mkdirSync(temporaryHome);
  const probe = spawnSync(process.execPath, [
    '--import', 'tsx', '--input-type=module', '-e', [
      'const { existsSync, mkdirSync, rmSync } = await import("node:fs");',
      'const { spawnSync } = await import("node:child_process");',
      'const { dirname, join } = await import("node:path");',
      'const [runtimeUrl, pluginRoot, targetRoot] = process.argv.slice(1);',
      'const runtime = await import(runtimeUrl);',
      'rmSync(process.env.TMPDIR, { recursive: true, force: true });',
      'mkdirSync(process.env.TMPDIR, { recursive: true });',
      'rmSync(pluginRoot, { recursive: true, force: true });',
      'const pi = { exec: async (command, args, options) => {',
      '  const child = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8" });',
      '  return { stdout: child.stdout ?? "", stderr: child.stderr ?? "", code: child.status ?? 1, killed: child.signal !== null };',
      '} };',
      'pi.execOwned = pi.exec;',
      'const result = await runtime.runOmd(pi, ["schema", "reference-research"], targetRoot);',
      'const second = await runtime.runOmd(pi, ["schema", "route-input"], targetRoot);',
      'let callbacks = 0;',
      'const damaging = { exec: async () => { throw new Error("unused"); }, execOwned: async (_command, args) => {',
      '  callbacks++; rmSync(join(dirname(dirname(args[0])), "package.json"));',
      '  return { stdout: "success", stderr: "", code: 0, killed: false };',
      '} };',
      'let firstLoss = ""; let secondLoss = "";',
      'try { await runtime.runOmd(damaging, ["schema", "list"], targetRoot); } catch(error) { firstLoss = error.message; }',
      'try { await runtime.runOmd(damaging, ["schema", "list"], targetRoot); } catch(error) { secondLoss = error.message; }',
      'console.log(JSON.stringify({ sourceGone: !existsSync(pluginRoot), text: result.text, second: second.text, callbacks, firstLoss, secondLoss }));',
    ].join('\n'), runtimeUrl, pluginRoot, targetRoot,
  ], { cwd: repositoryRoot, encoding: 'utf8',
    env: { ...process.env, TMPDIR: temporaryHome, XDG_STATE_HOME: stateHome }, timeout: 90_000 });

  assert.equal(probe.status, 0, probe.stderr);
  const result = JSON.parse(probe.stdout) as {
    sourceGone?: unknown; text?: unknown; second?: unknown;
    callbacks?: unknown; firstLoss?: unknown; secondLoss?: unknown;
  };
  assert.equal(result.sourceGone, true);
  assert.match(String(result.text), /reference-research-v8/);
  assert.match(String(result.second), /adaptive-design-route-input-v1/);
  assert.equal(result.callbacks, 1);
  assert.match(String(result.firstLoss), /OMD_RUNTIME_SNAPSHOT_LOST/);
  assert.equal(result.secondLoss, result.firstLoss);
});

test('Pi runtime snapshot loads the integrity-checked vendored browser driver', async t => {
  const snapshot = createOmdRuntimeSnapshot({ sourceRoot: repositoryRoot, dependencyRoot: null });
  t.after(() => snapshot.dispose());
  const driver = await loadUserBrowserDriver(join(snapshot.root, 'vendor/omd-browser'));
  assert.equal(typeof driver.userBrowserBridgeDoctor, 'function');
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
    'const { writeFileSync, renameSync } = require("node:fs");',
    'const [target] = process.argv.slice(1);',
    'process.stdout.write("ready\\n");',
    'for (let index = 0; index < 12; index += 1) {',
    '  const staging = `${target}.${process.pid}.tmp`;',
    '  writeFileSync(staging, Buffer.alloc(8 * 1024 * 1024, index % 2 ? 0x41 : 0x42));',
    '  renameSync(staging, target);',
    '}',
  ].join('\n'), dependencyFile], { timeout: 5_000 });
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
