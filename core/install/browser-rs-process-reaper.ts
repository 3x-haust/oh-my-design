import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';

const PROCESS_REAPER = String.raw`
const { spawn } = require('node:child_process');
const SHUTDOWN_TIMEOUT_MS = 3000;
let child;
let exitPromise;
let closePromise;
let shutdown;

function signalGroup(signal) {
  if (child?.pid === undefined) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if (error?.code !== 'ESRCH' && error?.code !== 'EPERM') throw error; }
}

function awaitExit(signal) {
  if (shutdown !== undefined) return shutdown;
  shutdown = (async () => {
    if (signal !== undefined) signalGroup(signal);
    let timeout;
    const deadline = new Promise((resolve) => {
      timeout = setTimeout(() => { signalGroup('SIGKILL'); resolve(undefined); }, SHUTDOWN_TIMEOUT_MS);
    });
    await Promise.race([exitPromise, deadline]);
    clearTimeout(timeout);
    return exitPromise;
  })();
  return shutdown;
}

process.once('message', (message) => {
  if (message?.type !== 'init' || typeof message.binary !== 'string' || !Array.isArray(message.args)) process.exit(1);
  child = spawn(message.binary, message.args, {
    env: message.environment, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
  });
  exitPromise = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  closePromise = new Promise((resolve) => child.once('close', resolve));
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM']) process.once(signal, () => { void awaitExit(signal); });
  process.once('disconnect', () => { signalGroup('SIGTERM'); void awaitExit('SIGTERM'); });
  process.stdin.once('end', () => { void awaitExit(undefined); });
  exitPromise.then(async (result) => {
    signalGroup('SIGKILL');
    await closePromise;
    process.exitCode = typeof result.code === 'number' ? result.code : 1;
    process.disconnect();
  });
});
`;

function hasStdio(child: ChildProcess): child is ChildProcessWithoutNullStreams {
  return child.stdin !== null && child.stdout !== null && child.stderr !== null;
}

export function spawnBrowserRsProcessReaper(
  binary: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): ChildProcessWithoutNullStreams {
  const reaper = spawn(process.execPath, ['-e', PROCESS_REAPER], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  if (!hasStdio(reaper)) throw new Error('browser-rs process reaper did not expose stdio pipes');
  reaper.send({ type: 'init', binary, args, environment });
  return reaper;
}
