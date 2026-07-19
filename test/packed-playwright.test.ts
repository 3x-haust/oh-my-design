import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

type JsonRecord = Readonly<Record<string, unknown>>;

interface PackedPackage {
  readonly archive: string;
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PLAYWRIGHT_RANGE = '^1.61.1';
const PROBE_FIXTURE = fileURLToPath(new URL('./fixtures/probe.html', import.meta.url));
const RENDER_FIXTURE = fileURLToPath(new URL('./fixtures/slop.html', import.meta.url));
const WORKSPACE_DEPENDENCIES = ['playwright', 'playwright-core', 'smol-toml', 'yaml'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`);
  return value;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array`);
  return value;
}

function stringField(value: JsonRecord, key: string): string {
  const field = value[key];
  if (typeof field !== 'string') throw new Error(`${key} must be a string`);
  return field;
}

function optionalRecord(value: unknown, label: string): JsonRecord | undefined {
  return value === undefined ? undefined : record(value, label);
}

function run(command: string, args: readonly string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stderr}`);
  return result.stdout;
}

function pack(destination: string): PackedPackage {
  const output = run(NPM, ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], ROOT);
  const entries = array(JSON.parse(output), 'npm pack output');
  const entry = entries[0];
  if (entry === undefined || entries.length !== 1) throw new Error('npm pack must return exactly one package');
  return { archive: join(destination, stringField(record(entry, 'npm pack entry'), 'filename')) };
}

function manifestFromTarball(archive: string): JsonRecord {
  const manifest = run('tar', ['-xOf', archive, 'package/package.json'], ROOT);
  return record(JSON.parse(manifest), 'packed package manifest');
}

function dependencyRecord(manifest: JsonRecord, key: string): JsonRecord {
  const dependencies = optionalRecord(manifest[key], key);
  if (dependencies === undefined) throw new Error(`packed package has no ${key}`);
  return dependencies;
}

function installTarballWithoutScripts(archive: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  run('tar', ['-xzf', archive, '--strip-components=1', '-C', destination], ROOT);
}

function linkWorkspaceDependencies(consumer: string): void {
  // Offline seam: npm ci supplied these exact lockfile-matched bytes; the tarball remains the
  // package under test while the consumer resolves its declared runtime dependencies locally.
  const nodeModules = join(consumer, 'node_modules');
  mkdirSync(nodeModules, { recursive: true });
  for (const name of WORKSPACE_DEPENDENCIES) {
    symlinkSync(join(ROOT, 'node_modules', name), join(nodeModules, name), 'dir');
  }
}

test('Given a packed release When an isolated consumer installs it Then Playwright resolves without lifecycle scripts', async (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'omd-packed-playwright-'));
  const packs = join(temp, 'packs');
  const consumer = join(temp, 'consumer');
  const packageDir = join(consumer, 'node_modules', '@3xhaust', 'oh-my-design');
  const packedRuntime = join(consumer, 'packed-runtime');
  let chromiumPath = '';

  try {
    mkdirSync(packs);
    const rootPackage = pack(packs);
    const packedManifest = manifestFromTarball(rootPackage.archive);
    assert.equal(dependencyRecord(packedManifest, 'dependencies')['playwright'], PLAYWRIGHT_RANGE);
    assert.equal(optionalRecord(packedManifest['devDependencies'], 'devDependencies')?.['playwright'], undefined);

    installTarballWithoutScripts(rootPackage.archive, packedRuntime);
    mkdirSync(dirname(packageDir), { recursive: true });
    symlinkSync(packedRuntime, packageDir, 'dir');
    linkWorkspaceDependencies(consumer);
    const imported = record(JSON.parse(run(process.execPath, ['--input-type=module', '--eval', "import { chromium } from 'playwright'; console.log(JSON.stringify({ launch: typeof chromium.launch, executablePath: chromium.executablePath() }))"], consumer)), 'consumer Playwright import');
    assert.equal(imported['launch'], 'function');
    chromiumPath = stringField(imported, 'executablePath');

    await t.test('real browser render and probe resolve through the packed consumer', { skip: existsSync(chromiumPath) ? false : `Chromium is not preinstalled at ${chromiumPath}` }, () => {
      const cli = join(packageDir, 'bin', 'omd.ts');
      const rendered = join(consumer, 'render.png');
      run(process.execPath, [cli, 'render', RENDER_FIXTURE, '-o', rendered], consumer);
      assert.ok(statSync(rendered).size > 0, 'rendered screenshot must be non-empty');

      const plan = join(consumer, '.omd', 'probes', 'primary.json');
      mkdirSync(dirname(plan), { recursive: true });
      writeFileSync(plan, JSON.stringify({
        name: 'primary', destructive: false,
        steps: [{ action: 'click', selector: '#toggle', expect: [{ type: 'visible', selector: '#panel' }] }],
      }));
      run(process.execPath, [cli, 'probe', PROBE_FIXTURE, '--json'], consumer);
      assert.ok(existsSync(join(consumer, '.omd', '.cache', 'probes', 'primary.json')));
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
