import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadRefs } from '../core/ref/store.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PACKAGE = join('node_modules', '@3xhaust', 'oh-my-design');
const VERSION = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { readonly version: string }).version;

type Command = {
  readonly name: 'omd' | 'oh-my-design';
  readonly args: readonly string[];
  readonly status: number;
  readonly output: RegExp;
};

const COMMANDS: readonly Command[] = [
  { name: 'omd', args: ['--version'], status: 0, output: new RegExp(`^${VERSION.replaceAll('.', '\\.')}\\s*$`) },
  { name: 'oh-my-design', args: ['--version'], status: 0, output: new RegExp(`^${VERSION.replaceAll('.', '\\.')}\\s*$`) },
];

function run(command: string, args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', ...(env === undefined ? {} : { env }) });
  if (result.error !== undefined) throw result.error;
  return result;
}

function pack(destination: string): string {
  const result = run(NPM, ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], ROOT);
  assert.equal(result.status, 0, result.stderr);
  const entries = JSON.parse(result.stdout) as readonly { readonly filename: string }[];
  assert.equal(entries.length, 1, 'npm pack must create one archive');
  const entry = entries[0];
  if (entry === undefined) throw new Error('npm pack returned no archive entry');
  return join(destination, entry.filename);
}

function installedCommand(consumer: string, name: Command['name']): string {
  const packageRoot = join(consumer, PACKAGE);
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { readonly bin: Readonly<Record<string, string>> };
  const entry = manifest.bin[name];
  if (entry === undefined) throw new Error(`packed manifest has no ${name} bin`);
  assert.match(entry, /\.mjs$/, `${name} must map to a JavaScript launcher`);
  const packageEntry = join(packageRoot, entry);
  assert.equal(existsSync(packageEntry), true, `${name} entry must exist in the installed package`);
  return process.platform === 'win32' ? packageEntry : join(consumer, 'node_modules', '.bin', name);
}

test('Given a real offline installed tarball When each public command starts Then Node loads the shipped TypeScript runtime', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'omd-packed-bin-runtime-'));
  const packs = join(temporary, 'packs');
  const consumer = join(temporary, 'consumer with spaces');
  try {
    mkdirSync(packs);
    mkdirSync(consumer);
    const archive = pack(packs);
    const installed = run(NPM, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive], consumer);
    assert.equal(installed.status, 0, installed.stderr);

    for (const command of COMMANDS) {
      const executable = installedCommand(consumer, command.name);
      const result = process.platform === 'win32'
        ? run(process.execPath, [executable, ...command.args], temporary)
        : run(executable, command.args, temporary);
      assert.equal(result.status, command.status, `${command.name}: ${result.stderr}`);
      assert.doesNotMatch(result.stderr, /ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/);
      assert.match(`${result.stdout}${result.stderr}`, command.output, `${command.name} must run its public surface`);
    }

    const claudeHome = join(temporary, 'claude home');
    const codexHome = join(temporary, 'codex home');
    mkdirSync(claudeHome);
    mkdirSync(codexHome);
    const environment = {
      ...process.env,
      HOME: temporary,
      CLAUDE_CONFIG_DIR: claudeHome,
      CODEX_HOME: codexHome,
      OMD_BROWSER_RS_BIN: process.execPath,
    };
    const installer = installedCommand(consumer, 'oh-my-design');
    for (const host of ['claude', 'codex'] as const) {
      const install = process.platform === 'win32'
        ? run(process.execPath, [installer, 'install', `--host=${host}`], temporary, environment)
        : run(installer, ['install', `--host=${host}`], temporary, environment);
      assert.equal(install.status, 0, `${host} install: ${install.stderr}`);
      const doctor = process.platform === 'win32'
        ? run(process.execPath, [installer, 'doctor', `--host=${host}`], temporary, environment)
        : run(installer, ['doctor', `--host=${host}`], temporary, environment);
      assert.equal(doctor.status, 1, `${host} doctor:\n${doctor.stdout}${doctor.stderr}`);
      assert.match(doctor.stdout, /browser-rs --help did not match the supported CLI signature/);
      assert.doesNotMatch(doctor.stderr, /ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('Given a real offline installed tarball When omd ref add captures a local selector Then the installed browser callback runs without transpiler globals', async (context) => {
  const { chromium } = await import('playwright');
  const chromiumPath = chromium.executablePath();
  if (!existsSync(chromiumPath)) {
    context.skip(`Chromium is not preinstalled at ${chromiumPath}`);
    return;
  }

  const temporary = mkdtempSync(join(tmpdir(), 'omd-packed-ref-add-'));
  const packs = join(temporary, 'packs');
  const consumer = join(temporary, 'consumer');
  const fixture = join(temporary, 'reference.html');
  try {
    mkdirSync(packs);
    mkdirSync(consumer);
    writeFileSync(fixture, '<!doctype html><title>reference</title><style>.card{padding:24px;border-radius:12px;background:#fff;box-shadow:0 4px 12px #0003}</style><article class="card">Packed selector capture</article>');
    const archive = pack(packs);
    const installed = run(NPM, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', archive], consumer);
    assert.equal(installed.status, 0, installed.stderr);

    const executable = installedCommand(consumer, 'omd');
    const result = process.platform === 'win32'
      ? run(process.execPath, [executable, 'ref', 'add', fixture, '--as', 'card', '--selector', '.card', '--no-energy'], consumer)
      : run(executable, ['ref', 'add', fixture, '--as', 'card', '--selector', '.card', '--no-energy'], consumer);

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /ReferenceError: __name is not defined/);
    const references = loadRefs(consumer);
    const [reference] = references;
    assert.equal(references.length, 1);
    assert.ok(reference);
    assert.equal(reference.source, fixture);
    assert.equal(reference.component, 'card');
    assert.equal(reference.kind, 'component');
    assert.equal(reference.selector, '.card');
    assert.deepEqual(reference.invariants?.radiusLadder, [12]);
    assert.equal(reference.invariants?.paddingWeight, 96);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
