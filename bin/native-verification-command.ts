import { resolve } from 'node:path';
import { checkProductionReadiness } from '../core/brief/production-readiness.ts';
import { readContainedRegularFile } from '../core/ref/reference-selection.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { getNativePiRun } from '../core/runtime/native-pi-run.ts';
import { runOwnedOmdProcess } from '../extensions/omd-process.ts';

class NativeVerificationError extends Error {
  override readonly name = 'NativeVerificationError';
  constructor(code: string, detail = '') { super(`${code}${detail ? `: ${detail}` : ''}`); }
}

export async function runNativeVerification(input: Readonly<{
  root: string; packRoot: string; invocation: ProjectRunInvocation; command: unknown;
  signal?: AbortSignal;
  /** The package folder under the root that owns the delivered page; the root itself by default. */
  packageDir?: string;
}>) {
  if (input.signal?.aborted) throw new NativeVerificationError('NATIVE_VERIFICATION_CANCELLED');
  let args: readonly string[];
  switch (input.command) {
    case 'install': args = ['install']; break;
    case 'ci': args = ['ci']; break;
    case 'build': case 'typecheck': case 'test': case 'lint':
      args = ['run', input.command]; break;
    default: throw new NativeVerificationError('NATIVE_VERIFICATION_COMMAND_INVALID');
  }
  const run = getNativePiRun(input.invocation, input.root);
  const readiness = checkProductionReadiness(input.root, input.invocation, input.packRoot);
  if (!readiness.ok) throw new NativeVerificationError('NATIVE_VERIFICATION_NOT_READY', readiness.blockers.join('; '));
  const packageDir = input.packageDir ?? '';
  readContainedRegularFile(input.root, packageDir === '' ? 'package.json' : `${packageDir}/package.json`, 'verification package manifest');
  const result = await runOwnedOmdProcess('npm', args, { cwd: resolve(input.root, packageDir), env: { PLAYWRIGHT_SKIP_BROWSER_GC: '1' },
    ...(input.signal === undefined ? {} : { signal: input.signal }) });
  return { schema: 'native-verification-result-v1' as const,
    meaning: 'execution-not-completion' as const, runId: run.runId,
    command: ['npm', ...args], ...result };
}
