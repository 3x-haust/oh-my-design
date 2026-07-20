#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { detectHosts } from '../core/install/detect.ts';
import { install, uninstall, doctor } from '../core/install/install.ts';
import { installBrowserRs, resolveBrowserRs, uninstallBrowserRs } from '../core/install/browser-rs.ts';
import { doctorBrowserProvider } from '../core/install/browser-provider.ts';
import { runBrowserRsSmoke } from '../core/install/browser-rs-smoke.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliBinDir = join(homedir(), '.local', 'bin');

function usage(): never {
  console.error(
    'usage: oh-my-design <command>\n\n'
    + '  install     copy the plugin into every detected host and patch its config\n'
    + '  uninstall   reverse exactly what install did (never touches .omd/)\n'
    + '  doctor      verify host installation and browser provider; exits 1 if broken\n'
    + '  browser install [--json]                         install or report browser-rs\n'
    + '  browser uninstall [--json]                       remove only OMD-owned browser-rs\n'
    + '  browser doctor [--json]                          inspect browser-rs provider health\n'
    + '  browser smoke --fixture <probe.html> --out <png> [--json]\n'
    + '                                                  run the bounded local provider smoke\n'
    + '  project doctor: omd doctor\n'
    + '  --version   print the oh-my-design package version',
  );
  process.exit(1);
}

type BrowserCommand =
  | { readonly kind: 'install'; readonly json: boolean }
  | { readonly kind: 'uninstall'; readonly json: boolean }
  | { readonly kind: 'doctor'; readonly json: boolean }
  | { readonly kind: 'smoke'; readonly fixture: string; readonly output: string; readonly json: boolean };

class BrowserCliError extends Error {
  override readonly name = 'BrowserCliError';
}

function browserCommand(args: readonly string[]): BrowserCommand {
  const [operation, ...options] = args;
  if (operation === 'install' || operation === 'uninstall' || operation === 'doctor') {
    if (options.some((option) => option !== '--json')) usage();
    return { kind: operation, json: options.includes('--json') };
  }
  if (operation !== 'smoke') usage();
  let fixture: string | undefined;
  let output: string | undefined;
  let json = false;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === '--json') {
      json = true;
      continue;
    }
    if (option === '--fixture' || option === '--out') {
      const value = options[index + 1];
      if (value === undefined || value.startsWith('--')) usage();
      if (option === '--fixture') fixture = value;
      else output = value;
      index += 1;
      continue;
    }
    if (option?.startsWith('--fixture=')) {
      fixture = option.slice('--fixture='.length);
      continue;
    }
    if (option?.startsWith('--out=')) {
      output = option.slice('--out='.length);
      continue;
    }
    usage();
  }
  if (fixture === undefined || fixture.length === 0 || output === undefined || output.length === 0) usage();
  return { kind: 'smoke', fixture, output, json };
}

function print(value: unknown, json: boolean, text: string): void {
  console.log(json ? JSON.stringify(value) : text);
}

function smokeBinary(): string {
  const resolved = resolveBrowserRs();
  switch (resolved.kind) {
    case 'env':
    case 'path':
    case 'owned':
      return resolved.path;
    case 'missing':
      throw new BrowserCliError('browser-rs is not resolved; run: oh-my-design browser install');
  }
}

async function runBrowserCommand(args: readonly string[]): Promise<number> {
  const command = browserCommand(args);
  switch (command.kind) {
    case 'install': {
      const result = await installBrowserRs();
      print(result, command.json, `browser-rs: ${result.kind}`);
      return result.kind === 'failed' ? 1 : 0;
    }
    case 'uninstall': {
      const result = uninstallBrowserRs();
      print(result, command.json, `browser-rs: ${result.kind}`);
      return 0;
    }
    case 'doctor': {
      const result = await doctorBrowserProvider();
      const text = 'fallback' in result
        ? `browser provider fallback: ${result.fallback.kind}`
        : `browser-rs: ${result.browser.kind}`;
      print(result, command.json, text);
      return result.healthy ? 0 : 1;
    }
    case 'smoke': {
      try {
        const result = await runBrowserRsSmoke({ binary: smokeBinary(), fixturePath: command.fixture, outputPath: command.output });
        print(result, command.json, `browser-rs smoke: wrote ${result.outputPath}`);
        return 0;
      } catch (error) {
        if (error instanceof Error) {
          if (command.json) console.log(JSON.stringify({ kind: 'failed', error: error.message }));
          else console.error(error.message);
          return 1;
        }
        throw error;
      }
    }
  }
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === '--version') {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    console.log(pkg.version);
    return;
  }

  if (cmd === 'browser') {
    process.exitCode = await runBrowserCommand(args);
    return;
  }

  if (cmd !== 'install' && cmd !== 'uninstall' && cmd !== 'doctor') usage();

  const hostArg = args.find((a) => a.startsWith('--host'))?.split('=')[1] ?? args[args.indexOf('--host') + 1];

  let hosts = detectHosts();
  if (hostArg) {
    hosts = hosts.filter((h) => h.host === hostArg);
    if (hosts.length === 0) {
      console.error(`No such host detected: ${hostArg}`);
      process.exit(1);
    }
  }
  if (hosts.length === 0) {
    console.error('No supported host found: neither ~/.claude nor ~/.codex exists.');
    process.exit(1);
  }

  if (cmd === 'install') {
    for (const line of await install(hosts, { cliBinDir })) console.log(line);
    console.log(`\nInstalled for: ${hosts.map((h) => h.host).join(', ')}.`);
    console.log('Open a session there and type /ultradesign.');
    return;
  }

  if (cmd === 'uninstall') {
    for (const line of uninstall(hosts)) console.log(line);
    return;
  }

  // doctor
  const results = await doctor(hosts, { cliBinDir });
  let failed = false;
  for (const r of results) {
    console.log(`${r.host}:`);
    for (const c of r.checks) {
      console.log(`  [${c.ok ? 'ok' : 'FAIL'}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
      if (!c.ok) failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
