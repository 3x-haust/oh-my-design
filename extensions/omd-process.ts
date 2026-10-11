import { spawn, type ChildProcess } from 'node:child_process';

export type OwnedExecResult = Readonly<{ stdout: string; stderr: string; code: number; killed: boolean }>;
export type OwnedExecOptions = Readonly<{ cwd: string; signal?: AbortSignal }>;
export type OwnedExecDependencies = Readonly<{
  spawn: typeof spawn;
  kill(pid: number, signal: NodeJS.Signals): void;
  setTimeout: typeof setTimeout;
}>;

const defaultDependencies: OwnedExecDependencies = {
  spawn,
  kill: (pid, signal) => { process.kill(pid, signal); },
  setTimeout,
};

/** An OMD invocation owns its entire POSIX process group, not just its Node launcher. */
export function runOwnedOmdProcess(
  command: string, args: readonly string[], options: OwnedExecOptions,
  dependencies: OwnedExecDependencies = defaultDependencies,
): Promise<OwnedExecResult> {
  if (process.platform === 'win32') throw new Error('OMD process-group supervision requires POSIX');
  if (options.signal?.aborted) return Promise.resolve({ stdout: '', stderr: '', code: 1, killed: true });
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = dependencies.spawn(command, [...args], {
        cwd: options.cwd, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) { reject(error); return; }
    let stdout = '';
    let stderr = '';
    let killed = false;
    let settled = false;
    const terminate = (): void => {
      if (killed || child.pid === undefined) return;
      killed = true;
      const group = -child.pid;
      try { dependencies.kill(group, 'SIGTERM'); }
      catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) { reject(error); return; } }
      // Keep this timer even if the launcher exits: descendants can retain the group.
      const escalation = dependencies.setTimeout(() => {
        try { dependencies.kill(group, 'SIGKILL'); }
        catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) reject(error); }
      }, 3_000);
      escalation.unref?.();
    };
    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', terminate);
      resolve({ stdout, stderr, code, killed });
    };
    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
    child.once('error', error => { options.signal?.removeEventListener('abort', terminate); reject(error); });
    child.once('close', code => finish(code ?? 1));
    options.signal?.addEventListener('abort', terminate, { once: true });
    if (options.signal?.aborted) terminate();
  });
}
