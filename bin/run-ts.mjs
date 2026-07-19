import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'];
const require = createRequire(import.meta.url);

export function runTypeScriptEntry(entry) {
  const child = spawn(
    process.execPath,
    ['--import', require.resolve('tsx'), fileURLToPath(entry), ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  const handlers = SIGNALS.map((signal) => ({ signal, handler: () => child.kill(signal) }));
  for (const { signal, handler } of handlers) process.once(signal, handler);

  let settled = false;
  const finish = (code, signal) => {
    if (settled) return;
    settled = true;
    for (const { signal: handled, handler } of handlers) process.off(handled, handler);
    if (signal !== null) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  };
  child.once('error', (error) => {
    console.error(error.message);
    finish(1, null);
  });
  child.once('exit', finish);
}
