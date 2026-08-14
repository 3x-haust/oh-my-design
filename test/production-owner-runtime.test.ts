import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runCodexHostExec } from '../adapters/codex-host-launcher.ts';
import { routeAdaptiveFlow } from '../core/route/adaptive-flow.ts';
import { adaptiveRouteRecordSha256 } from '../core/route/adaptive-route-persistence.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNER_CLI = join(ROOT, 'bin', 'omd-codex.mjs');

function executable(path: string, source: string): string {
  writeFileSync(path, `#!/usr/bin/env node\n${source}`);
  chmodSync(path, 0o755);
  return path;
}

function project(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  mkdirSync(join(root, '.omd', '.cache'), { recursive: true });
  copyFileSync(join(ROOT, 'test', 'fixtures', 'adaptive-flow', 'copy-only.json'), join(root, '.omd', '.cache', 'route-input.json'));
  writeFileSync(join(root, '.omd', 'owner-task.md'), 'Write the bounded production source and return exact evidence.\n');
  return root;
}

function ownerCodexStub(path: string): string {
  return executable(path, `
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
const args = process.argv.slice(2);
const root = process.cwd();
const mode = process.env.OMD_TEST_OWNER_MODE;
const attempt = Number(process.env.OMD_PRODUCTION_OWNER_ATTEMPT);
const report = process.env.OMD_TEST_OWNER_ARGS;
const delegatedActivation = process.env.OMD_ACTIVATION_PATH;
const routeEnv = { ...process.env };
if (mode === 'parent-substitution') routeEnv.OMD_ACTIVATION_PATH = join(dirname(delegatedActivation), 'invocation.json');
if (mode === 'copied-child-activation') {
  routeEnv.OMD_ACTIVATION_PATH = join(root, 'copied-child-activation.json');
  copyFileSync(delegatedActivation, routeEnv.OMD_ACTIVATION_PATH);
}
const route = (mode) => spawnSync(process.execPath, [process.env.OMD_TEST_CLI, 'route', mode, '--json'], { cwd: root, encoding: 'utf8', env: routeEnv });
const shown = route('show');
const checked = route('check');
let releasePromise;
if (mode === 'live-sibling-substitution') {
  const release = process.env.OMD_TEST_OWNER_RELEASE;
  releasePromise = new Promise((resolve, reject) => {
    let observer;
    const timer = setTimeout(() => { observer.close(); reject(new Error('owner release event timed out')); }, 10_000);
    observer = watch(dirname(release), (_event, filename) => {
      if (filename !== basename(release)) return;
      clearTimeout(timer); observer.close(); resolve();
    });
  });
}
writeFileSync(report, JSON.stringify({ args, role: process.env.OMD_PRODUCTION_OWNER_ROLE,
  activation: delegatedActivation, attemptedActivation: routeEnv.OMD_ACTIVATION_PATH, showStatus: shown.status, showStderr: shown.stderr,
  checkStatus: checked.status, checkStderr: checked.stderr }));
if (shown.status !== 0 || checked.status !== 0) process.exit(92);
if (releasePromise) await releasePromise;
if (args.includes('--model') || args.includes('-m') || args.includes('--listen') || args.includes('app-server')) process.exit(90);
if (process.env.OMD_TEST_SENPI_MARKER && existsSync(process.env.OMD_TEST_SENPI_MARKER)) process.exit(91);
const session = mode === 'reuse-session' ? 'session-reused' : 'session-' + attempt + '-' + process.pid;
process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: session }) + '\\n');
const stall = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
if (mode === 'stall') stall();
if (mode === 'unsafe-stall') {
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  writeFileSync(join(root, 'src', 'copy', 'partial.html'), 'partial owner write');
  writeFileSync(join(root, 'src', 'copy', 'created-before-timeout.html'), 'rejected owner write');
  stall();
}
if (mode === 'retry' && attempt === 1) stall();
if (mode === 'out-of-scope') writeFileSync(join(root, 'coordinator-or-owner-foreign.html'), 'foreign write');
else {
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  if (mode === 'symlink-output') symlinkSync('../../.omd/owner-task.md', join(root, 'src', 'copy', 'index.html'));
  else if (mode === 'special-output') {
    const fifo = spawnSync('/usr/bin/mkfifo', [join(root, 'src', 'copy', 'index.html')]);
    if (fifo.status !== 0) process.exit(94);
  } else writeFileSync(join(root, 'src', 'copy', 'index.html'), '<!doctype html><title>Owned by omd-hand</title>');
  if (mode === 'omd-mutation') writeFileSync(join(root, '.omd', 'owner-forged-finalization.json'), 'forged');
}
process.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Production source and evidence written.' } }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'turn.completed', usage: {} }) + '\\n');
`);
}

function coordinatorStub(path: string, reportPath: string, operation = 'run'): string {
  return executable(path, `
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
const env = { ...process.env };
const route = (mode, extra = []) => spawnSync(process.execPath, [process.env.OMD_TEST_CLI, 'route', mode, ...extra, '--json'], {
  cwd: process.cwd(), encoding: 'utf8', env,
});
const classified = route('classify', ['--input', '.omd/.cache/route-input.json']);
const shown = classified.status === 0 ? route('show') : classified;
const checked = shown.status === 0 ? route('check') : shown;
if (classified.status !== 0 || shown.status !== 0 || checked.status !== 0) {
  writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({ status: 93, stdout: '', stderr: [classified.stderr, shown.stderr, checked.stderr, classified.stdout, shown.stdout, checked.stdout].join('\\n') }));
  process.exit(0);
}
const hostRunDirectory = new URL('.', 'file://' + env.OMD_ACTIVATION_PATH).pathname;
if (${JSON.stringify(operation)} === 'copied') {
  const copied = process.cwd() + '/copied-activation.json';
  copyFileSync(env.OMD_ACTIVATION_PATH, copied);
  env.OMD_ACTIVATION_PATH = copied;
}
if (${JSON.stringify(operation)} === 'workspace-denied') {
  writeFileSync(hostRunDirectory + 'authority-audit.jsonl', '');
  chmodSync(hostRunDirectory, 0o500);
}
if (${JSON.stringify(operation)} === 'owner-absent') env.OMD_CODEX_OWNER_DIRECTORY = hostRunDirectory + 'absent-owner';
if (${JSON.stringify(operation)} === 'owner-copied' || ${JSON.stringify(operation)} === 'owner-forged' || ${JSON.stringify(operation)} === 'owner-caller-selected') {
  const selected = hostRunDirectory + ${JSON.stringify(operation)};
  if (${JSON.stringify(operation)} === 'owner-copied') cpSync(env.OMD_CODEX_OWNER_DIRECTORY, selected, { recursive: true });
  else mkdirSync(selected, { mode: 0o700 });
  env.OMD_CODEX_OWNER_DIRECTORY = selected;
}
if (${JSON.stringify(operation)} === 'owner-cross-run') {
  const selected = hostRunDirectory + '../run-foreign/production-owner';
  mkdirSync(selected, { recursive: true, mode: 0o700 });
  env.OMD_CODEX_OWNER_DIRECTORY = selected;
}
if (${JSON.stringify(operation)} === 'owner-symlinked') {
  const selected = process.cwd() + '/.omd/owner-symlink';
  symlinkSync(env.OMD_CODEX_OWNER_DIRECTORY, selected);
  env.OMD_CODEX_OWNER_DIRECTORY = selected;
}
if (${JSON.stringify(operation)} === 'owner-wrong-mode') chmodSync(env.OMD_CODEX_OWNER_DIRECTORY, 0o755);
const timeout = ['stall', 'unsafe-stall', 'retry'].includes(process.env.OMD_TEST_OWNER_MODE) ? '10000' : '20000';
const args = ${JSON.stringify(operation)} === 'mismatch'
  ? ['owner', 'run', '--agent', 'omd-eye', '--input', '.omd/owner-task.md', '--timeout-ms', timeout, '--json']
  : ['owner', 'run', '--agent', 'omd-hand', '--input', '.omd/owner-task.md', '--timeout-ms', timeout, '--json'];
const launch = () => spawnSync(process.execPath, [process.env.OMD_TEST_OWNER_CLI, ...args], {
  cwd: process.env.OMD_TEST_OWNER_CWD || process.cwd(), encoding: 'utf8', env,
});
let coordinatorChildStatus;
let coordinatorChildStderr;
let first;
if (${JSON.stringify(operation)} === 'live-sibling-substitution') {
  const argsPath = process.env.OMD_TEST_OWNER_ARGS;
  const ready = new Promise((resolve, reject) => {
    let observer;
    const timer = setTimeout(() => { observer.close(); reject(new Error('owner activation event timed out')); }, 20_000);
    observer = watch(dirname(argsPath), (_event, filename) => {
      if (filename !== basename(argsPath)) return;
      clearTimeout(timer); observer.close(); resolve();
    });
  });
  const running = spawn(process.execPath, [process.env.OMD_TEST_OWNER_CLI, ...args], {
    cwd: process.env.OMD_TEST_OWNER_CWD || process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = ''; let stderr = '';
  running.stdout.setEncoding('utf8'); running.stderr.setEncoding('utf8');
  running.stdout.on('data', chunk => { stdout += chunk; }); running.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { running.kill('SIGTERM'); reject(new Error('live owner did not complete')); }, 20_000);
    running.once('error', error => { clearTimeout(timer); reject(error); });
    running.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
  await ready;
  const ownerObserved = JSON.parse(readFileSync(argsPath, 'utf8'));
  const substituted = spawnSync(process.execPath, [process.env.OMD_TEST_CLI, 'route', 'show', '--json'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...env, OMD_ACTIVATION_PATH: ownerObserved.activation },
  });
  coordinatorChildStatus = substituted.status;
  coordinatorChildStderr = substituted.stderr;
  writeFileSync(process.env.OMD_TEST_OWNER_RELEASE, 'release');
  first = { status: await exited, stdout, stderr };
} else {
  first = launch();
}
const child = ${JSON.stringify(operation)} === 'duplicate' ? launch() : first;
if (${JSON.stringify(operation)} === 'coordinator-child-substitution') {
  const ownerObserved = JSON.parse(readFileSync(process.env.OMD_TEST_OWNER_ARGS, 'utf8'));
  const substituted = spawnSync(process.execPath, [process.env.OMD_TEST_CLI, 'route', 'show', '--json'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...env, OMD_ACTIVATION_PATH: ownerObserved.activation },
  });
  coordinatorChildStatus = substituted.status;
  coordinatorChildStderr = substituted.stderr;
}
if (${JSON.stringify(operation)} === 'workspace-denied') chmodSync(hostRunDirectory, 0o700);
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({ status: child.status, stdout: child.stdout, stderr: child.stderr,
  coordinatorChildStatus, coordinatorChildStderr, ownerLaunchCount: ${JSON.stringify(operation)} === 'duplicate' ? 2 : 1,
  firstStatus: first.status, firstStdout: first.stdout, firstStderr: first.stderr,
  outerArgs: process.argv.slice(2), ownerDirectory: process.env.OMD_CODEX_OWNER_DIRECTORY,
  activation: process.env.OMD_ACTIVATION_PATH, loaded: process.env.OMD_CODEX_LOADED_SKILL_RECEIPT_PATH,
  socket: process.env.OMD_CODEX_AUTHORITY_SOCKET, response: process.env.OMD_CODEX_AUTHORITY_RESPONSE_DIR,
  publicKey: process.env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH }));
process.exit(0);
`);
}

type CoordinatorReport = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
  activation: string;
  loaded: string;
  socket: string;
  response: string;
  publicKey: string;
  outerArgs: string[];
  ownerDirectory: string;
  firstStatus?: number;
  firstStdout?: string;
  firstStderr?: string;
  coordinatorChildStatus?: number;
  coordinatorChildStderr?: string;
  ownerLaunchCount?: number;
}>;

async function launchOwner(input: Readonly<{
  root: string;
  mode: string;
  operation?: string;
  ownerCwd?: string;
  throughCli?: boolean;
}>): Promise<{ report: CoordinatorReport; argsReport: string; senpiMarker: string; hostResult: Awaited<ReturnType<typeof runCodexHostExec>>; cleanup: () => void }> {
  const parent = join(input.root, '..');
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const reportPath = join(parent, `owner-coordinator-${id}.json`);
  const argsReport = join(parent, `owner-args-${id}.json`);
  const topCodex = coordinatorStub(join(parent, `owner-top-${id}`), reportPath, input.operation);
  const nestedCodex = ownerCodexStub(join(parent, `owner-child-${id}`));
  const codexHome = join(parent, `owner-codex-home-${id}`);
  mkdirSync(join(codexHome, 'agents'), { recursive: true });
  copyFileSync(join(ROOT, 'dist', 'codex', 'agents', 'omd-hand.toml'), join(codexHome, 'agents', 'omd-hand.toml'));
  const senpiMarker = join(parent, `senpi-must-not-run-${id}`);
  const ownerRelease = join(parent, `owner-release-${id}`);
  const senpiBinDirectory = join(parent, `senpi-eperm-${id}`);
  mkdirSync(senpiBinDirectory);
  executable(join(senpiBinDirectory, 'senpi'), `
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(senpiMarker)}, 'listen EPERM');
console.error('listen EPERM: loopback unavailable');
process.exit(1);
`);
  const launchEnv = {
    ...process.env,
    OMD_TEST_OWNER_CLI: OWNER_CLI,
    OMD_TEST_CLI: join(ROOT, 'bin', 'omd.mjs'),
    OMD_OWNER_CODEX_BIN: nestedCodex,
    OMD_TEST_OWNER_MODE: input.mode,
    OMD_TEST_OWNER_ARGS: argsReport,
    OMD_TEST_SENPI_MARKER: senpiMarker,
    OMD_TEST_OWNER_RELEASE: ownerRelease,
    PATH: `${senpiBinDirectory}:${process.env.PATH ?? ''}`,
    ...(input.ownerCwd === undefined ? {} : { OMD_TEST_OWNER_CWD: input.ownerCwd }),
  };
  let hostResult: Awaited<ReturnType<typeof runCodexHostExec>>;
  if (input.throughCli === true) {
    cpSync(join(ROOT, 'dist', 'codex', 'skills'), join(codexHome, 'skills'), { recursive: true });
    const launched = spawn(process.execPath, [OWNER_CLI, 'exec', '-C', input.root, 'launch owner'], {
      cwd: input.root,
      env: { ...launchEnv, CODEX_HOME: codexHome, OMD_CODEX_BIN: topCodex },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = await new Promise<{ status: number; stdout: string; stderr: string }>((resolvePromise, reject) => {
      let stdout = ''; let stderr = '';
      launched.stdout.setEncoding('utf8'); launched.stderr.setEncoding('utf8');
      launched.stdout.on('data', chunk => { stdout += chunk; });
      launched.stderr.on('data', chunk => { stderr += chunk; });
      const timer = setTimeout(() => { launched.kill('SIGTERM'); reject(new Error('real omd-codex exec integration timed out')); }, 60_000);
      launched.once('error', error => { clearTimeout(timer); reject(error); });
      launched.once('exit', code => { clearTimeout(timer); resolvePromise({ status: code ?? 1, stdout, stderr }); });
    });
    const cliReport = JSON.parse(readFileSync(reportPath, 'utf8')) as CoordinatorReport;
    const runDirectory = dirname(cliReport.activation);
    hostResult = {
      status: output.status, signal: null, stdout: output.stdout, stderr: output.stderr,
      runDirectory, activationPath: cliReport.activation,
      activationEvidencePath: join(runDirectory, 'activation-context.json'),
      loadedSkillReceiptPath: cliReport.loaded, authoritySocketPath: cliReport.socket,
      ownerDirectory: cliReport.ownerDirectory, ownerReceiptPath: join(cliReport.ownerDirectory, 'result.json'),
    };
  } else {
    hostResult = await runCodexHostExec(['exec', '-C', input.root, 'launch owner'], {
      codexBin: topCodex,
      packageRoot: ROOT,
      codexHome,
      installedSkillRoot: join(ROOT, 'dist', 'codex', 'skills'),
      env: launchEnv,
      receiptRetentionMs: 60_000,
    });
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as CoordinatorReport;
  return {
    report, argsReport, senpiMarker, hostResult,
    cleanup: () => {
      for (const path of [reportPath, argsReport, topCodex, nestedCodex, codexHome, senpiMarker, ownerRelease, senpiBinDirectory]) rmSync(path, { recursive: true, force: true });
    },
  };
}

function parsedResult(report: CoordinatorReport): Record<string, unknown> {
  assert.equal(report.status, 0, `${report.stderr}\n${report.stdout}`);
  return JSON.parse(report.stdout) as Record<string, unknown>;
}

test('RED hypothesis 1: workspace-write need not mkdir in the host run before authenticated owner production', async () => {
  const root = project('omd-owner-workspace-denied-');
  const run = await launchOwner({ root, mode: 'success', operation: 'workspace-denied' });
  try {
    const result = parsedResult(run.report);
    assert.equal(result.result, 'completed');
    assert.deepEqual(result.sourceChanges, ['src/copy/index.html']);
    assert.equal(existsSync(String(result.receiptPath)), true, 'the host persists owner evidence outside the project sandbox');
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('RED hypothesis 2: absent, copied, forged, cross-run, symlinked, wrong-mode, and caller-selected owner directories fail closed', async () => {
  const operations = [
    'owner-absent', 'owner-copied', 'owner-forged', 'owner-cross-run',
    'owner-symlinked', 'owner-wrong-mode', 'owner-caller-selected',
  ];
  for (const operation of operations) {
    const root = project(`omd-owner-${operation}-`);
    const run = await launchOwner({ root, mode: 'success', operation });
    try {
      assert.notEqual(run.report.status, 0, `${operation} unexpectedly received owner authority`);
      assert.match(run.report.stderr, /OWNER_(?:DIRECTORY|AUTHORITY)_/);
      assert.equal(existsSync(join(root, 'src', 'copy', 'index.html')), false);
      assert.equal(existsSync(run.hostResult.ownerReceiptPath), false);
    } finally {
      run.cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('RED hypothesis 3: host broker alone persists the authenticated separate-session owner receipt', async () => {
  const root = project('omd-owner-success-');
  const run = await launchOwner({ root, mode: 'success', throughCli: true });
  try {
    assert.equal(run.hostResult.status, 0, run.hostResult.stderr);
    assert.equal(run.report.ownerLaunchCount, 1);
    const result = parsedResult(run.report);
    assert.equal(result.result, 'completed');
    assert.equal(result.owner, 'omd-hand');
    assert.equal(result.transport, 'codex-exec-stdio-jsonl');
    assert.equal(result.modelArgumentOmitted, true);
    assert.equal((result.attempts as unknown[]).length, 1, JSON.stringify(result.attempts));
    assert.deepEqual(result.sourceChanges, ['src/copy/index.html']);
    assert.match(String(result.resumeCommand), /^cd '.+' && codex exec resume 'session-1-/);
    assert.equal(readFileSync(join(root, 'src', 'copy', 'index.html'), 'utf8'), '<!doctype html><title>Owned by omd-hand</title>');
    const observed = JSON.parse(readFileSync(run.argsReport, 'utf8')) as { args: string[]; role: string; activation: string; showStatus: number; showStderr: string; checkStatus: number; checkStderr: string };
    assert.equal(observed.showStatus, 0, observed.showStderr);
    assert.equal(observed.checkStatus, 0, observed.checkStderr);
    assert.notEqual(observed.activation, run.report.activation, 'the separate owner session must receive its own delegated activation');
    const delegated = JSON.parse(readFileSync(observed.activation, 'utf8')) as {
      activation: unknown;
      delegation: { payload: Record<string, any>; signature: string };
    };
    const payload = delegated.delegation.payload;
    const attempt = (result.attempts as Record<string, unknown>[])[0]!;
    assert.equal(payload.schema, 'omd-codex-delegated-owner-activation-v1');
    assert.equal(payload.parent.invocationSha256, createHash('sha256').update(readFileSync(run.report.activation)).digest('hex'));
    assert.equal(payload.projectRoot, realpathSync(root));
    assert.equal(payload.owner, 'omd-hand');
    assert.equal(payload.taskSha256, result.taskSha256);
    assert.equal(payload.child.pid, attempt.processPid);
    assert.equal(payload.child.processStartIdentity, attempt.processStartIdentity);
    assert.match(payload.child.sessionNonce, /^[A-Za-z0-9_-]{32,}$/);
    assert.deepEqual(payload.operations, ['project-write']);
    assert.deepEqual(payload.payloadAuthorizations, [
      'adaptive-route-authority', 'workflow-production-slice',
    ]);
    const delegatedStat = statSync(observed.activation);
    assert.equal(payload.activationFile.device, String(delegatedStat.dev));
    assert.equal(payload.activationFile.inode, String(delegatedStat.ino));
    assert.equal(delegatedStat.mode & 0o777, 0o400);
    assert.equal(payload.broker.authorityDirectoryDevice.length > 0, true);
    assert.equal(payload.broker.authorityDirectoryInode.length > 0, true);
    assert.equal(payload.expiresAt > payload.issuedAt, true);
    assert.equal(verify(null, Buffer.from(canonicalRouteJson(payload)), createPublicKey(readFileSync(run.report.publicKey)), Buffer.from(delegated.delegation.signature, 'base64')), true);
    assert.equal(observed.role, 'omd-hand');
    assert.equal(observed.args[0], 'exec');
    assert.equal(observed.args.includes('--json'), true);
    assert.deepEqual(observed.args.slice(0, 4), ['exec', '--json', '--sandbox', 'workspace-write']);
    assert.equal(observed.args.includes('--model'), false);
    assert.equal(observed.args.includes('-m'), false);
    assert.equal(observed.args.includes('--listen'), false);
    assert.equal(observed.args.includes('app-server'), false);
    assert.equal(existsSync(run.senpiMarker), false, 'Codex owner transport must not try the Senpi loopback fallback');
    assert.equal(run.report.outerArgs[0], 'exec');
    assert.equal(run.report.outerArgs[1], '--add-dir');
    assert.equal(run.report.outerArgs.includes(run.hostResult.ownerDirectory), false, 'owner evidence is not added to the model-writable sandbox');
    assert.deepEqual(readdirSync(run.hostResult.ownerDirectory), ['result.json'], 'inner owner creates no host-side files or directories');
    assert.equal(statSync(run.hostResult.ownerReceiptPath).mode & 0o777, 0o400);
    assert.equal(existsSync(run.hostResult.authoritySocketPath), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('production owner cannot bypass repair after trusted observation exists', async () => {
  const root = project('omd-owner-observed-bypass-');
  mkdirSync(join(root, '.omd', 'observation-v2'));
  writeFileSync(
    join(root, '.omd', 'observation-v2', `sha256-${'a'.repeat(64)}.json`),
    '{}',
  );
  const run = await launchOwner({ root, mode: 'success' });
  try {
    assert.notEqual(run.report.status, 0);
    assert.match(`${run.report.stderr}\n${run.report.stdout}`, /OWNER_REPAIR_BYPASS/);
    assert.equal(existsSync(join(root, 'src', 'copy', 'index.html')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a stalled owner gets one materially fresh no-write retry and the fresh session may complete', async () => {
  const root = project('omd-owner-stall-');
  const run = await launchOwner({ root, mode: 'retry' });
  try {
    assert.equal(run.report.status, 0, `${run.report.stderr}\n${run.report.stdout}`);
    const result = JSON.parse(run.report.stdout) as { result: string; attempts: { sessionId: string; status: string }[] };
    assert.equal(result.result, 'completed');
    assert.equal(result.attempts.length, 2);
    assert.deepEqual(result.attempts.map(({ status }) => status), ['timed-out', 'completed']);
    assert.notEqual(result.attempts[0]?.sessionId, result.attempts[1]?.sessionId);
    assert.equal(existsSync(join(root, 'src', 'copy', 'index.html')), true);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a timeout after a production write restores the exact baseline and cannot duplicate the write in a retry', async () => {
  const root = project('omd-owner-unsafe-retry-');
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  const baselinePath = join(root, 'src', 'copy', 'partial.html');
  writeFileSync(baselinePath, 'baseline source');
  chmodSync(baselinePath, 0o640);
  const run = await launchOwner({ root, mode: 'unsafe-stall' });
  try {
    assert.equal(run.report.status, 1);
    const result = JSON.parse(run.report.stdout) as { failure: string; attempts: unknown[]; sourceChanges: string[] };
    assert.equal(result.failure, 'OWNER_RETRY_UNSAFE_PROJECT_MUTATION');
    assert.equal(result.attempts.length, 1);
    assert.deepEqual(result.sourceChanges, [
      'src/copy/created-before-timeout.html',
      'src/copy/partial.html',
    ]);
    assert.equal(readFileSync(baselinePath, 'utf8'), 'baseline source');
    assert.equal(statSync(baselinePath).mode & 0o777, 0o640);
    assert.equal(existsSync(join(root, 'src', 'copy', 'created-before-timeout.html')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a completed turn cannot attribute an out-of-route source write to omd-hand', async () => {
  const root = project('omd-owner-scope-');
  const run = await launchOwner({ root, mode: 'out-of-scope' });
  try {
    assert.equal(run.report.status, 1);
    const result = JSON.parse(run.report.stdout) as { result: string; failure: string; sourceChanges: string[] };
    assert.equal(result.result, 'failed');
    assert.equal(result.failure, 'OWNER_ROUTE_SCOPE_EXCEEDED:coordinator-or-owner-foreign.html');
    assert.deepEqual(result.sourceChanges, ['coordinator-or-owner-foreign.html']);
    assert.equal(existsSync(join(root, 'coordinator-or-owner-foreign.html')), false, 'out-of-scope output is rolled back');
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('successful owner turns cannot retain .omd mutations', async () => {
  const root = project('omd-owner-omd-mutation-');
  const taskBefore = readFileSync(join(root, '.omd', 'owner-task.md'));
  const run = await launchOwner({ root, mode: 'omd-mutation' });
  try {
    assert.equal(run.report.status, 1);
    const result = JSON.parse(run.report.stdout) as { failure: string; sourceChanges: string[] };
    assert.equal(result.failure, 'OWNER_NON_SOURCE_MUTATION:.omd/owner-forged-finalization.json');
    assert.deepEqual(result.sourceChanges, ['src/copy/index.html']);
    assert.equal(existsSync(join(root, '.omd', 'owner-forged-finalization.json')), false);
    assert.equal(existsSync(join(root, 'src')), false);
    assert.deepEqual(readFileSync(join(root, '.omd', 'owner-task.md')), taskBefore);
    assert.equal(existsSync(join(root, '.omd', 'route.json')), true);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('symlink and special production outputs fail closed and are removed', async () => {
  for (const mode of ['symlink-output', 'special-output']) {
    const root = project(`omd-owner-${mode}-`);
    const run = await launchOwner({ root, mode });
    try {
      assert.equal(run.report.status, 1, `${run.report.stderr}\n${run.report.stdout}`);
      const result = JSON.parse(run.report.stdout) as { failure: string };
      assert.equal(result.failure, 'OWNER_UNSAFE_OUTPUT:src/copy/index.html');
      assert.equal(existsSync(join(root, 'src')), false);
    } finally {
      run.cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('one activation cannot complete production ownership twice', async () => {
  const root = project('omd-owner-duplicate-');
  const run = await launchOwner({ root, mode: 'success', operation: 'duplicate' });
  try {
    assert.equal(run.report.firstStatus, 0, `${run.report.firstStderr ?? ''}\n${run.report.firstStdout ?? ''}`);
    assert.notEqual(run.report.status, 0);
    assert.match(run.report.stderr, /OWNER_DUPLICATE_COMPLETION/);
    assert.equal(readFileSync(join(root, 'src', 'copy', 'index.html'), 'utf8'), '<!doctype html><title>Owned by omd-hand</title>');
    const first = JSON.parse(run.report.firstStdout!) as { attempts: unknown[] };
    assert.equal(first.attempts.length, 1);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('owner mismatch, copied activation, and cross-project authority fail before source writing', async () => {
  const first = project('omd-owner-authority-first-');
  const second = project('omd-owner-authority-second-');
  const runs = [
    await launchOwner({ root: first, mode: 'success', operation: 'mismatch' }),
    await launchOwner({ root: first, mode: 'success', operation: 'copied' }),
    await launchOwner({ root: first, mode: 'success', ownerCwd: second }),
  ];
  try {
    for (const run of runs) {
      assert.notEqual(run.report.status, 0, run.report.stdout);
      assert.equal(existsSync(join(first, 'src', 'copy', 'index.html')), false);
      assert.equal(existsSync(join(second, 'src', 'copy', 'index.html')), false);
    }
    assert.match(runs[0]!.report.stderr, /OWNER_MISMATCH/);
    assert.match(runs[1]!.report.stderr, /OWNER_(?:ACTIVATION|HOST_BINDING)_INVALID/);
    assert.equal(runs[2]!.report.status, 93, 'the cross-project coordinator must fail before owner launch');
  } finally {
    for (const run of runs) run.cleanup();
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test('parent and delegated child activations cannot substitute for each other or be copied', async () => {
  const cases = [
    { mode: 'parent-substitution', operation: undefined },
    { mode: 'copied-child-activation', operation: undefined },
    { mode: 'success', operation: 'coordinator-child-substitution' },
    { mode: 'live-sibling-substitution', operation: 'live-sibling-substitution' },
  ];
  for (const item of cases) {
    const root = project(`omd-owner-substitution-${item.mode}-`);
    const run = await launchOwner({ root, mode: item.mode, ...(item.operation === undefined ? {} : { operation: item.operation }) });
    try {
      if (item.operation === 'coordinator-child-substitution' || item.operation === 'live-sibling-substitution') {
        assert.equal(run.report.status, 0, run.report.stderr);
        assert.notEqual(run.report.coordinatorChildStatus, 0, 'the coordinator must not use its child activation');
        assert.match(run.report.coordinatorChildStderr ?? '', /ROUTE_AUTHORITY_REQUIRED/);
        assert.equal(existsSync(join(root, 'src', 'copy', 'index.html')), true);
      } else {
        assert.notEqual(run.report.status, 0, `${run.report.stdout}\n${run.report.stderr}`);
        assert.equal(existsSync(join(root, 'src', 'copy', 'index.html')), false);
      }
    } finally {
      run.cleanup();
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('authority retained after the host exits is stale and cannot launch another owner', async () => {
  const root = project('omd-owner-stale-');
  const run = await launchOwner({ root, mode: 'success' });
  try {
    assert.equal(run.report.status, 0, run.report.stderr);
    rmSync(join(root, 'src', 'copy', 'index.html'), { force: true });
    const stale = spawnSync(process.execPath, [OWNER_CLI, 'owner', 'run', '--agent', 'omd-hand', '--input', '.omd/owner-task.md', '--timeout-ms', '2500', '--json'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        OMD_ACTIVATION_PATH: run.report.activation,
        OMD_CODEX_LOADED_SKILL_RECEIPT_PATH: run.report.loaded,
        OMD_CODEX_AUTHORITY_SOCKET: run.report.socket,
        OMD_CODEX_AUTHORITY_RESPONSE_DIR: run.report.response,
        OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH: run.report.publicKey,
        OMD_CODEX_OWNER_DIRECTORY: run.report.ownerDirectory,
        CODEX_HOME: join(dirname(run.report.activation), '..'),
      },
    });
    assert.notEqual(stale.status, 0);
    assert.equal(existsSync(join(root, 'src', 'copy', 'index.html')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});
