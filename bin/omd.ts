#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_COMMANDS } from './cli/public-surface.ts';
import { ROOT, bootstrapNativeArgs } from './cli/runtime.ts';

async function main(): Promise<never> {
  const args = await bootstrapNativeArgs(process.argv.slice(2));
  const command = args[0];

  if (command === '--version') {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
    console.log(pkg.version);
    process.exit(0);
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    return (await import('./commands/help.ts')).printUsage(0);
  }
  if (command === undefined) return (await import('./commands/help.ts')).printUsage();

  if (command === 'lifecycle') return (await import('./commands/lifecycle.ts')).runLifecycle(args);
  if (['route', 'schema', 'stage', 'guard'].includes(command)) {
    return (await import('./commands/route.ts')).runRouteGroup(args);
  }
  if (command === 'ref') return (await import('./commands/references.ts')).runReferences(args);
  if (['feedback', 'language', 'ai-judgment', 'locale'].includes(command)) {
    return (await import('./commands/context.ts')).runContext(args);
  }
  if (['first-render', 'render', 'check', 'probe', 'slop', 'lighthouse', 'measure'].includes(command)) {
    return (await import('./commands/inspection.ts')).runInspection(args);
  }
  if (command === 'figma' || command === 'target') {
    return (await import('./commands/figma.ts')).runFigma(args);
  }
  if (['pack', 'doctor', 'browser', 'coach', 'learn', 'usage', 'hash'].includes(command)) {
    return (await import('./commands/tooling.ts')).runTooling(args);
  }

  const { closestNames } = await import('../core/schema/suggestions.ts');
  const commands = PUBLIC_COMMANDS.filter(name => name !== '--version' && name !== 'help');
  const suggestion = closestNames(command, [...commands]).slice(0, 1)
    .map(name => `did you mean: omd ${name}?`).join(' ');
  throw new Error(`unknown command ${command}; ${suggestion || 'run omd help'}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
