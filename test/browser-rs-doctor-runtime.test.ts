import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { doctorBrowserRs, type BrowserRsHealth, type BrowserRsRelease } from '../core/install/browser-rs.ts';
import { browserRsTestDependencies } from './browser-rs-test-support.ts';

const RELEASES: readonly BrowserRsRelease[] = [{
  platform: 'darwin',
  arch: 'arm64',
  asset: 'browser-rs-test',
  url: 'https://github.com/maestrojeong/browser-rs-mcp/releases/download/v0.1.10/browser-rs-test',
  sha256: '0'.repeat(64),
}];

function unhealthy(result: BrowserRsHealth): Extract<BrowserRsHealth, { readonly kind: 'unhealthy' }> {
  if (result.kind !== 'unhealthy') throw new Error(`expected unhealthy browser-rs provider, received ${result.kind}`);
  return result;
}

function writeTimeoutFixture(path: string, pidPath: string): void {
  writeFileSync(path, [
    '#!/bin/sh',
    "trap '' TERM",
    `printf "%s\\n" "$$" > ${shellQuote(pidPath)}`,
    'IFS= read -r _line',
    '',
  ].join('\n'));
  chmodSync(path, 0o755);
}

function writeBoundedOutputFixture(path: string): void {
  writeFileSync(path, [
    '#!/bin/sh',
    'exec /bin/dd if=/dev/zero bs=65537 count=1 2>/dev/null',
    '',
  ].join('\n'));
  chmodSync(path, 0o755);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\\\''")}'`;
}

function writeInheritedPipeFixture(path: string, parentPidPath: string, childPidPath: string): void {
  writeFileSync(path, [
    '#!/bin/sh',
    `parent_pid_file=${shellQuote(parentPidPath)}`,
    `child_pid_file=${shellQuote(childPidPath)}`,
    'if [ "$1" = child ]; then',
    "  trap '' TERM",
    '  printf "%s\\n" "$$" > "$child_pid_file"',
    '  while :; do /bin/sleep 1; done',
    'fi',
    'printf "%s\\n" "$$" > "$parent_pid_file"',
    '"$0" child &',
    'IFS= read -r _line',
    '',
  ].join('\n'));
  chmodSync(path, 0o755);
}

function writeSupportedHelpFixture(path: string): void {
  writeFileSync(path, [
    '#!/bin/sh',
    "cat <<'EOF'",
    'browser-rs — stealth MCP browser (stdio or HTTP)',
    '--headless',
    '--user-data-dir <USER_DATA_DIR>',
    'EOF',
    '',
  ].join('\n'));
  chmodSync(path, 0o755);
}

function pidFromFile(path: string): number {
  const pid = Number(readFileSync(path, 'utf8').trim());
  if (!Number.isSafeInteger(pid)) throw new Error(`fixture wrote an invalid PID: ${path}`);
  return pid;
}

function pidFiles(parent: string, paths: readonly string[], signal: AbortSignal): Promise<readonly number[]> {
  return new Promise((resolve, reject) => {
    const names = new Set(paths.map((path) => path.slice(parent.length + 1)));
    const watcher = watch(parent);
    const onAbort = (): void => finish(signal.reason instanceof Error ? signal.reason : new Error('PID sentinel observation aborted'));
    const finish = (error?: Error): void => {
      if (error === undefined && !paths.every(existsSync)) return;
      watcher.close();
      signal.removeEventListener('abort', onAbort);
      if (error !== undefined) reject(error);
      else resolve(paths.map(pidFromFile));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    watcher.on('change', (_event, changed) => {
      if (changed !== null && names.has(changed.toString())) finish();
    });
    watcher.once('error', finish);
    finish();
  });
}

function running(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    throw error;
  }
}

test('browser-rs doctor bounds and reaps a real SIGTERM-ignoring help provider', { timeout: 8_000 }, async (context) => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-timeout-'));
  const binary = join(root, 'slow-browser-rs');
  const childPidPath = join(root, 'provider.pid');
  let childPid: number | undefined;
  try {
    // Given: a zero-output direct shell provider that ignores SIGTERM and blocks on inherited stdin.
    writeTimeoutFixture(binary, childPidPath);
    const pidReady = pidFiles(root, [childPidPath], context.signal);

    // When: doctor probes the real provider while the test captures its unique direct process PID.
    const doctor = doctorBrowserRs({
      ...browserRsTestDependencies({
        home: join(root, 'home'),
        platform: 'darwin',
        arch: 'arm64',
        releases: RELEASES,
        env: { PATH: '', OMD_BROWSER_RS_BIN: binary },
      }),
      timeoutMs: 1_200,
    });
    const [observedPid] = await pidReady;
    if (observedPid === undefined) throw new Error('provider did not publish its PID sentinel');
    childPid = observedPid;
    const result = await doctor;

    // Then: the configured bound is named distinctly and the direct provider process has been reaped.
    assert.deepEqual(unhealthy(result), { kind: 'unhealthy', reason: 'process', detail: 'timed out after 1200ms' });
    assert.equal(running(childPid), false, 'doctor left the SIGTERM-ignoring provider alive');
  } finally {
    if (childPid !== undefined && running(childPid)) process.kill(childPid, 'SIGKILL');
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser-rs doctor captures a real supported help response', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-help-'));
  const binary = join(root, 'supported-browser-rs');
  try {
    writeSupportedHelpFixture(binary);
    const result = await doctorBrowserRs({
      ...browserRsTestDependencies({
        home: join(root, 'home'),
        platform: 'darwin',
        arch: 'arm64',
        releases: RELEASES,
        env: { PATH: '', OMD_BROWSER_RS_BIN: binary },
      }),
    });

    assert.deepEqual(result, {
      kind: 'healthy',
      source: 'env',
      path: binary,
      version: 'compatible (version unknown)',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser-rs doctor bounds and reaps a descendant that inherits its help pipes', { timeout: 8_000 }, async (context) => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-pipe-tree-'));
  const binary = join(root, 'pipe-tree-browser-rs');
  const parentPidPath = join(root, 'parent.pid');
  const childPidPath = join(root, 'child.pid');
  let providerPids: readonly number[] = [];
  try {
    // Given: a direct shell parent and SIGTERM-ignoring child that both block on inherited standard input.
    writeInheritedPipeFixture(binary, parentPidPath, childPidPath);
    const pidsReady = pidFiles(root, [parentPidPath, childPidPath], context.signal);

    // When: doctor starts the parent and the test observes both processes before its deadline.
    const doctor = doctorBrowserRs({
      ...browserRsTestDependencies({
        home: join(root, 'home'),
        platform: 'darwin',
        arch: 'arm64',
        releases: RELEASES,
        env: { PATH: '', OMD_BROWSER_RS_BIN: binary },
      }),
      timeoutMs: 1_200,
    });
    providerPids = await pidsReady;
    const result = await doctor;

    // Then: the bounded probe settles and reaps both the direct provider and pipe-holding descendant.
    assert.deepEqual(unhealthy(result), { kind: 'unhealthy', reason: 'process', detail: 'timed out after 1200ms' });
    for (const pid of providerPids) assert.equal(running(pid), false, `doctor left provider ${pid} alive`);
  } finally {
    for (const pid of providerPids) if (running(pid)) process.kill(pid, 'SIGKILL');
    rmSync(root, { recursive: true, force: true });
  }
});

test('browser-rs doctor reports a bounded output overflow as a process failure rather than a timeout', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-max-buffer-'));
  const binary = join(root, 'bounded-output-browser-rs');
  try {
    // Given: a bounded native provider that writes one byte more than the production output cap.
    writeBoundedOutputFixture(binary);

    // When: doctor probes it with enough time to finish its bounded output.
    const result = await doctorBrowserRs({
      ...browserRsTestDependencies({
        home: join(root, 'home'),
        platform: 'darwin',
        arch: 'arm64',
        releases: RELEASES,
        env: { PATH: '', OMD_BROWSER_RS_BIN: binary },
      }),
      timeoutMs: 5_000,
    });

    // Then: a max-buffer failure is observable as that process failure, never as a timer expiry.
    assert.deepEqual(unhealthy(result), {
      kind: 'unhealthy',
      reason: 'process',
      detail: 'stdout maxBuffer length exceeded',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
