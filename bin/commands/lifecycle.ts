import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { printLifecycleHelp } from './help.ts';
import {
  ROOT,
  inputJson,
  invocationFromActivation,
  parseArgs,
} from '../cli/runtime.ts';

export async function runLifecycle(args: string[]): Promise<never> {
  const sub = args[1];
  if (sub === '--help' || sub === 'help') return printLifecycleHelp();

  if (sub === 'verify') {
    const opts = parseArgs(args.slice(2));
    if (opts._.length !== 1 || Object.keys(opts).some(key => !['_', 'project', 'json'].includes(key))) {
      throw new Error('usage: omd lifecycle verify install|ci|build|typecheck|test|lint [--project <dir>] [--json]');
    }
    const project = realpathSync(resolve(opts.project ?? process.cwd()));
    const invocation = invocationFromActivation(opts, 'omd lifecycle verify', project);
    const { runNativeVerification } = await import('../native-verification-command.ts');
    const { withNativeCommandSignal } = await import('../native-command-signal.ts');
    const result = await withNativeCommandSignal(signal => runNativeVerification({
      root: project,
      packRoot: join(ROOT, 'core'),
      invocation,
      command: opts._[0],
      signal,
    }));
    await new Promise<void>(done => process.stdout.write(`${JSON.stringify(result)}\n`, () => done()));
    process.exit(result.code === 0 && !result.killed ? 0 : result.code || 1);
  }

  if (sub === 'finish') {
    const opts = parseArgs(args.slice(2));
    const help = 'usage: omd lifecycle finish [--project <dir>] [--manifest <json>] [--json]';
    if (args.includes('--help')) {
      console.log(help);
      process.exit(0);
    }
    if (opts._.length > 0) throw new Error(help);
    const project = realpathSync(resolve(opts.project ?? process.cwd()));
    const invocation = invocationFromActivation(opts, 'omd lifecycle finish', project);
    const { runModelLedCompletion } = await import('../model-led-completion-command.ts');
    const { withNativeCommandSignal } = await import('../native-command-signal.ts');
    const result = await withNativeCommandSignal(signal => runModelLedCompletion({
      root: project,
      packRoot: join(ROOT, 'core'),
      invocation,
      signal,
      ...(opts.manifest === undefined
        ? {}
        : { manifest: inputJson(resolve(project, opts.manifest), 'native browser plan') }),
    }));
    await new Promise<void>(done => process.stdout.write(`${JSON.stringify(result)}\n`, () => done()));
    process.exit(result.ok ? 0 : 1);
  }

  throw new Error(`unknown command lifecycle${sub ? ` ${sub}` : ''}; run omd help`);
}
