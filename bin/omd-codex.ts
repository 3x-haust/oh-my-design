#!/usr/bin/env node
import { runCodexHostCli } from '../adapters/codex-host-launcher.ts';
import { runProductionOwnerCli } from '../adapters/production-owner-runtime.ts';
import { runCodexRoleCli } from '../adapters/codex-role-runtime.ts';

const args = process.argv.slice(2);
const run = args[0] === 'owner'
  ? runProductionOwnerCli(args.slice(1))
  : args[0] === 'role'
    ? Promise.resolve(runCodexRoleCli(args.slice(1)))
  : runCodexHostCli(args);
run.then((status) => {
  process.exitCode = status;
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
