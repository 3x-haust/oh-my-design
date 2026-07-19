import { spawn, type ChildProcess } from 'node:child_process';

export const BROWSER_RS_COMPATIBLE_VERSION = 'compatible (version unknown)';
const BROWSER_RS_HELP_MAX_BUFFER = 64 * 1024;
const BROWSER_RS_STREAM_DRAIN_MS = 50;
const BROWSER_RS_HELP_SIGNATURE = [
  'browser-rs — stealth MCP browser (stdio or HTTP)',
  '--headless',
  '--user-data-dir',
] as const;

export type BrowserRsProviderSource = 'env' | 'path' | 'owned';
export type BrowserRsProcessResult =
  | { readonly kind?: 'completed'; readonly code?: number; readonly stdout: string; readonly stderr: string; readonly detail?: string }
  | { readonly kind: 'timed-out'; readonly stdout: string; readonly stderr: string };
export type BrowserRsProcessRunner = (path: string, args: readonly string[], timeoutMs: number) => Promise<BrowserRsProcessResult>;
export type BrowserRsHealth =
  | { readonly kind: 'healthy'; readonly source: BrowserRsProviderSource; readonly path: string; readonly version: string }
  | { readonly kind: 'unsupported'; readonly platform: string; readonly arch: string }
  | { readonly kind: 'unhealthy'; readonly reason: 'missing' | 'unowned-target' | 'process'; readonly detail?: string };

export type BrowserRsHelpDoctorOptions = {
  readonly path: string;
  readonly source: BrowserRsProviderSource;
  readonly version: string;
  readonly timeoutMs: number;
  readonly run?: BrowserRsProcessRunner;
};

type CapturedOutput = { chunks: Buffer[]; size: number };

function appendOutput(output: CapturedOutput, chunk: Buffer): boolean {
  if (output.size + chunk.length > BROWSER_RS_HELP_MAX_BUFFER) return false;
  output.chunks.push(chunk);
  output.size += chunk.length;
  return true;
}

function outputText(output: CapturedOutput): string {
  return Buffer.concat(output.chunks, output.size).toString('utf8');
}

function missingProcess(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ESRCH';
}

function killProcessTree(child: ChildProcess): void {
  if (child.pid !== undefined && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) { if (!missingProcess(error)) child.kill('SIGKILL'); }
  }
  child.kill('SIGKILL');
}

function processRun(path: string, args: readonly string[], timeoutMs: number): Promise<BrowserRsProcessResult> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let overflow: 'stdout' | 'stderr' | undefined;
    let streamError: string | undefined;
    let timer: NodeJS.Timeout | undefined;
    let drainTimer: NodeJS.Timeout | undefined;
    let cleanup = (): void => {};
    const stdout: CapturedOutput = { chunks: [], size: 0 };
    const stderr: CapturedOutput = { chunks: [], size: 0 };
    const finish = (result: BrowserRsProcessResult): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (drainTimer !== undefined) clearTimeout(drainTimer);
      cleanup();
      resolve(result);
    };
    let child: ChildProcess;
    try {
      child = spawn(path, args, {
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      if (error instanceof Error) finish({ kind: 'completed', stdout: '', stderr: '', detail: error.message });
      else throw error;
      return;
    }
    const stdoutStream = child.stdout;
    const stderrStream = child.stderr;
    let stdoutEnded = stdoutStream === null;
    let stderrEnded = stderrStream === null;
    const resultForExit = (code: number | null, signal: NodeJS.Signals | null): BrowserRsProcessResult => {
      const capturedStdout = outputText(stdout);
      const capturedStderr = outputText(stderr);
      if (timedOut) return { kind: 'timed-out', stdout: capturedStdout, stderr: capturedStderr };
      if (overflow !== undefined) return { kind: 'completed', stdout: capturedStdout, stderr: capturedStderr, detail: `${overflow} maxBuffer length exceeded` };
      if (streamError !== undefined) return { kind: 'completed', stdout: capturedStdout, stderr: capturedStderr, detail: streamError };
      if (code !== null) return { kind: 'completed', code, stdout: capturedStdout, stderr: capturedStderr };
      return { kind: 'completed', stdout: capturedStdout, stderr: capturedStderr, detail: `process exited with signal ${signal ?? 'unknown'}` };
    };
    const onStdout = (chunk: Buffer): void => {
      if (!appendOutput(stdout, chunk) && overflow === undefined) {
        overflow = 'stdout';
        killProcessTree(child);
      }
    };
    const onStderr = (chunk: Buffer): void => {
      if (!appendOutput(stderr, chunk) && overflow === undefined) {
        overflow = 'stderr';
        killProcessTree(child);
      }
    };
    const onStreamError = (error: Error): void => {
      if (streamError === undefined) {
        streamError = error.message;
        killProcessTree(child);
      }
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (timer !== undefined) clearTimeout(timer);
      if (stdoutEnded && stderrEnded) {
        finish(resultForExit(code, signal));
        return;
      }
      drainTimer = setTimeout(() => {
        killProcessTree(child);
        finish(resultForExit(code, signal));
      }, BROWSER_RS_STREAM_DRAIN_MS);
    };
    const onError = (error: Error): void => finish({ kind: 'completed', stdout: outputText(stdout), stderr: outputText(stderr), detail: error.message });
    const onStdoutEnd = (): void => { stdoutEnded = true; };
    const onStderrEnd = (): void => { stderrEnded = true; };
    cleanup = (): void => {
      child.off('exit', onExit);
      child.off('error', onError);
      stdoutStream?.off('data', onStdout);
      stdoutStream?.off('end', onStdoutEnd);
      stdoutStream?.off('error', onStreamError);
      stderrStream?.off('data', onStderr);
      stderrStream?.off('end', onStderrEnd);
      stderrStream?.off('error', onStreamError);
      child.stdin?.destroy();
      stdoutStream?.destroy();
      stderrStream?.destroy();
    };
    child.once('exit', onExit);
    child.once('error', onError);
    stdoutStream?.on('data', onStdout);
    stdoutStream?.once('end', onStdoutEnd);
    stdoutStream?.once('error', onStreamError);
    stderrStream?.on('data', onStderr);
    stderrStream?.once('end', onStderrEnd);
    stderrStream?.once('error', onStreamError);
    timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs);
  });
}

function hasBrowserRsHelpSignature(stdout: string): boolean {
  return BROWSER_RS_HELP_SIGNATURE.every((part) => stdout.includes(part));
}

export async function doctorBrowserRsHelp(options: BrowserRsHelpDoctorOptions): Promise<BrowserRsHealth> {
  try {
    const outcome = await (options.run ?? processRun)(options.path, ['--help'], options.timeoutMs);
    if (outcome.kind === 'timed-out') {
      return { kind: 'unhealthy', reason: 'process', detail: `timed out after ${options.timeoutMs}ms` };
    }
    if (outcome.code === 0 && hasBrowserRsHelpSignature(outcome.stdout)) {
      return { kind: 'healthy', source: options.source, path: options.path, version: options.version };
    }
    if (outcome.code === 0) {
      return { kind: 'unhealthy', reason: 'process', detail: 'browser-rs --help did not match the supported CLI signature' };
    }
    return {
      kind: 'unhealthy',
      reason: 'process',
      detail: outcome.stderr || outcome.detail || (outcome.code === undefined ? 'browser-rs --help failed without an exit code' : `exit ${outcome.code}`),
    };
  } catch (error) {
    if (error instanceof Error) return { kind: 'unhealthy', reason: 'process', detail: error.message };
    throw error;
  }
}
