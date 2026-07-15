#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectHosts } from '../core/install/detect.ts';
import { install, uninstall, doctor } from '../core/install/install.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function usage(): never {
  console.error(
    'usage: oh-my-design <command>\n\n'
    + '  install     copy the plugin into every detected host and patch its config\n'
    + '  uninstall   reverse exactly what install did (never touches .omd/)\n'
    + '  doctor      verify the install is healthy; exits 1 if anything is broken\n'
    + '  --version   print the oh-my-design package version',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const [cmd] = process.argv.slice(2);

  if (cmd === '--version') {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
    console.log(pkg.version);
    return;
  }

  if (cmd !== 'install' && cmd !== 'uninstall' && cmd !== 'doctor') usage();

  const args = process.argv.slice(3);
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
    for (const line of install(hosts)) console.log(line);
    console.log(`\nInstalled for: ${hosts.map((h) => h.host).join(', ')}.`);
    console.log('Open a session there and type /ultradesign.');
    return;
  }

  if (cmd === 'uninstall') {
    for (const line of uninstall(hosts)) console.log(line);
    return;
  }

  // doctor
  const results = doctor(hosts);
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
