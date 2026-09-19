import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const value = readFileSync(path, 'utf8').trim();
  const pid = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(pid) || pid <= 1) {
    throw new Error(`fixture wrote an invalid PID: ${path}`);
  }
  return pid;
}

function pidFiles(paths: readonly string[], signal: AbortSignal): Promise<readonly number[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const observe = (): void => finish();
    const onAbort = (): void => finish(signal.reason instanceof Error ? signal.reason : new Error('PID sentinel observation aborted'));
    const finish = (error?: Error): void => {
      if (settled) return;
      if (error === undefined && !paths.every(existsSync)) return;
      // A creation observation may precede the shell's write. Never interpret an empty file as PID 0
      // (the caller's process group), and wait for the actual numeric sentinel instead.
      if (error === undefined && paths.some(path => readFileSync(path, 'utf8').trim() === '')) return;
      let pids: readonly number[] = [];
      if (error === undefined) {
        try { pids = paths.map(pidFromFile); }
        catch (cause) { error = cause instanceof Error ? cause : new Error(String(cause)); }
      }
      settled = true;
      clearInterval(observationTimer);
      signal.removeEventListener('abort', onAbort);
      if (error !== undefined) reject(error);
      else resolve(pids);
    };
    // Directory notification setup can race an immediate shell write on macOS. Observe the
    // sentinel contents themselves by bounded-interval polling; the provider's timeout stays
    // unchanged and only the actual positive numeric sentinel can establish process identity.
    const observationTimer = setInterval(observe, 25);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    else finish();
  });
}

test('provider PID parsing rejects empty, process-group and non-decimal sentinels', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-pid-'));
  const path = join(root, 'provider.pid');
  try {
    for (const invalid of ['', ' ', '0', '1', '-42', '0x123', '1.5', 'Infinity']) {
      writeFileSync(path, invalid);
      assert.throws(() => pidFromFile(path), /invalid PID/);
    }
    writeFileSync(path, '12345\n');
    assert.equal(pidFromFile(path), 12345);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('provider PID observation waits for a nonempty sentinel and rejects an aborted observer', { timeout: 5_000 }, async (context) => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-pid-observation-'));
  const path = join(root, 'provider.pid');
  const controller = new AbortController();
  try {
    writeFileSync(path, '');
    const observed = pidFiles([path], context.signal);
    writeFileSync(path, '12345\n');
    assert.deepEqual(await observed, [12345]);
    controller.abort(new Error('test observer ended'));
    await assert.rejects(pidFiles([path], controller.signal), /test observer ended/);
  } finally {
    controller.abort();
    rmSync(root, { recursive: true, force: true });
  }
});

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
    const pidReady = pidFiles([childPidPath], context.signal);

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
    const pidsReady = pidFiles([parentPidPath, childPidPath], context.signal);

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

test('a successful help response also terminates descendants that close inherited output pipes', { timeout: 8_000 }, async (context) => {
  const root = mkdtempSync(join(tmpdir(), 'omd-browser-rs-closed-pipe-tree-'));
  const binary = join(root, 'closed-pipe-browser-rs');
  const childPidPath = join(root, 'child.pid');
  let childPid: number | undefined;
  try {
    writeFileSync(binary, [
      '#!/bin/sh',
      `child_pid_file=${shellQuote(childPidPath)}`,
      'if [ "$1" = child ]; then',
      "  trap '' TERM",
      '  printf "%s\\n" "$$" > "$child_pid_file"',
      '  while :; do /bin/sleep 1; done',
      'fi',
      '"$0" child >/dev/null 2>&1 &',
      'while [ ! -s "$child_pid_file" ]; do /bin/sleep 0.01; done',
      "printf '%s\\n' 'browser-rs — stealth MCP browser (stdio or HTTP)' '--headless' '--user-data-dir'",
      '',
    ].join('\n'));
    chmodSync(binary, 0o755);
    const ready = pidFiles([childPidPath], context.signal);
    const doctor = doctorBrowserRs({
      ...browserRsTestDependencies({ home: join(root, 'home'), platform: 'darwin', arch: 'arm64', releases: RELEASES,
        env: { PATH: '', OMD_BROWSER_RS_BIN: binary } }), timeoutMs: 1_200,
    });
    [childPid] = await ready;
    const result = await doctor;
    assert.equal(result.kind, 'healthy', JSON.stringify(result));
    assert.equal(running(childPid!), false, 'help probe left a background process after returning success');
  } finally {
    if (childPid !== undefined && running(childPid)) process.kill(childPid, 'SIGKILL');
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
