import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runCodexHostExec } from '../adapters/codex-host-launcher.ts';
import { runProductionOwnerCli, validateProductionOwnerTimeout } from '../adapters/production-owner-runtime.ts';
import { routeAdaptiveFlow } from '../core/route/adaptive-flow.ts';
import { adaptiveRouteRecordSha256 } from '../core/route/adaptive-route-persistence.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNER_CLI = join(ROOT, 'bin', 'omd-codex.mjs');

test('production owner accepts a bounded ninety-minute completion window', () => {
  assert.equal(validateProductionOwnerTimeout(90 * 60 * 1000), 90 * 60 * 1000);
  assert.throws(() => validateProductionOwnerTimeout(2 * 60 * 60 * 1000 + 1), /120 minutes/);
});

test('production owner CLI cannot inject host-owned model or effort overrides', async () => {
  await assert.rejects(
    runProductionOwnerCli(['run', '--omd-role-model', 'omd-hand=gpt-5.6-sol']),
    /usage: omd-codex owner/,
  );
  await assert.rejects(
    runProductionOwnerCli(['run', '--omd-role-effort', 'omd-hand=medium']),
    /usage: omd-codex owner/,
  );
});

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
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
const args = process.argv.slice(2);
const root = process.cwd();
const repairRoot = process.env.OMD_PRODUCTION_REPAIR_MIRROR;
const writeRoot = repairRoot || root;
const mode = process.env.OMD_TEST_OWNER_MODE;
const sequence = process.env.OMD_TEST_OWNER_SEQUENCE;
const sequencedReentry = mode === 'no-op-reentry' || mode === 'no-op-reentry-failed';
const noOpThisLaunch = mode === 'no-op' || (sequencedReentry && !existsSync(sequence));
if (sequencedReentry && noOpThisLaunch) writeFileSync(sequence, 'initial no-op completed');
appendFileSync(sequence + '.launches', process.pid + '\\n');
const attempt = Number(process.env.OMD_PRODUCTION_OWNER_ATTEMPT);
const report = process.env.OMD_TEST_OWNER_ARGS;
const delegatedActivation = process.env.OMD_ACTIVATION_PATH;
const task = readFileSync(0, 'utf8');
if (mode === 'receipt-race') {
  const observerSource = [
    "import { watch, writeFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    "const [root, ownerDirectory] = process.argv.slice(1);",
    "process.on('SIGTERM', () => {});",
    "const observer = watch(ownerDirectory, (_event, filename) => {",
    "  if (filename !== 'result.json') return;",
    "  observer.close();",
    "  writeFileSync(join(root, '.omd', 'late-owner-mutation.json'), 'late mutation');",
    "});",
    "process.stdout.write('ready\\\\n');",
  ].join('\\n');
  const observer = spawn(process.execPath, ['--input-type=module', '-e', observerSource, root, process.env.OMD_CODEX_OWNER_DIRECTORY], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('late mutation observer did not become ready')), 10_000);
    observer.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    observer.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
  observer.stdout.destroy();
  observer.unref();
}
const routeEnv = { ...process.env };
if (mode === 'parent-substitution') routeEnv.OMD_ACTIVATION_PATH = join(dirname(delegatedActivation), 'invocation.json');
if (mode === 'copied-child-activation') {
  routeEnv.OMD_ACTIVATION_PATH = join(root, 'copied-child-activation.json');
  copyFileSync(delegatedActivation, routeEnv.OMD_ACTIVATION_PATH);
}
const route = (mode) => spawnSync(process.execPath, [process.env.OMD_TEST_CLI, 'route', mode, '--json'], { cwd: root, encoding: 'utf8', env: routeEnv });
const shown = repairRoot ? { status: 0, stderr: '' } : route('show');
const checked = repairRoot ? { status: 0, stderr: '' } : route('check');
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
writeFileSync(report, JSON.stringify({ args, task, role: process.env.OMD_PRODUCTION_OWNER_ROLE,
  activation: delegatedActivation, attemptedActivation: routeEnv.OMD_ACTIVATION_PATH, showStatus: shown.status, showStderr: shown.stderr,
  checkStatus: checked.status, checkStderr: checked.stderr }));
if (shown.status !== 0 || checked.status !== 0) process.exit(92);
if (releasePromise) await releasePromise;
const expectedModel = process.env.OMD_TEST_EXPECTED_ROLE_MODEL;
const expectedEffort = process.env.OMD_TEST_EXPECTED_ROLE_EFFORT;
if (expectedModel) {
  const modelIndex = args.indexOf('--model');
  if (modelIndex < 0 || args[modelIndex + 1] !== expectedModel || args.includes('-m')) process.exit(90);
  if (!args.includes('model_reasoning_effort=' + JSON.stringify(expectedEffort))) process.exit(89);
} else if (args.includes('--model') || args.includes('-m')) process.exit(90);
if (args.includes('--listen') || args.includes('app-server')) process.exit(88);
if (process.env.OMD_TEST_ALTERNATE_HOST_MARKER && existsSync(process.env.OMD_TEST_ALTERNATE_HOST_MARKER)) process.exit(91);
const session = mode === 'reuse-session' ? 'session-reused' : 'session-' + attempt + '-' + process.pid;
process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: session }) + '\\n');
if (mode === 'failed-fast' || (mode === 'no-op-reentry-failed' && !noOpThisLaunch)) process.exit(7);
const writeDerivedTree = () => {
  mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'vite', 'bin'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'process.exit(0);\\n');
  symlinkSync('../vite/bin/vite.js', join(root, 'node_modules', '.bin', 'vite'));
  mkdirSync(join(root, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(root, 'dist', 'index.html'), '<script src="./assets/app.js"></script>\\n');
  writeFileSync(join(root, 'dist', 'assets', 'app.js'), 'console.log("built");\\n');
};
if (mode === 'derived-root-symlink') symlinkSync('.omd', join(root, 'node_modules'), 'dir');
if (mode === 'derived-dangling-replacement') {
  rmSync(join(root, 'node_modules'), { recursive: true, force: true });
  symlinkSync('missing-dependency-tree', join(root, 'node_modules'), 'dir');
}
if (mode === 'derived-success' || mode === 'derived-failed') writeDerivedTree();
if (mode === 'derived-failed') process.exit(7);
if (mode === 'prohibited-render') {
  process.stdout.write(JSON.stringify({
    type: 'item.completed',
    item: { type: 'command_execution', command: 'omd render src/index.html -o /tmp/owner.png' },
  }) + '\\n');
}
if (mode === 'allowed-check') {
  process.stdout.write(JSON.stringify({
    type: 'item.completed',
    item: { type: 'command_execution', command: 'omd check src/index.html --no-log' },
  }) + '\\n');
}
if (mode === 'forbidden-name-audit') {
  process.stdout.write(JSON.stringify({
    type: 'item.completed',
    item: { type: 'command_execution', command: "rg -n 'omd (render|ir|probe|lifecycle)|playwright|browser-rs' index.html src || true" },
  }) + '\\n');
}
if (mode === 'prohibited-playwright') {
  process.stdout.write(JSON.stringify({
    type: 'item.completed',
    item: { type: 'command_execution', command: 'npx playwright test' },
  }) + '\\n');
}
const stall = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
if (mode === 'stall') stall();
if (mode === 'unsafe-stall') {
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  writeFileSync(join(root, 'src', 'copy', 'partial.html'), 'partial owner write');
  writeFileSync(join(root, 'src', 'copy', 'created-before-timeout.html'), 'rejected owner write');
  stall();
}
if (mode === 'retry' && attempt === 1) stall();
if (mode === 'out-of-scope') writeFileSync(join(writeRoot, 'coordinator-or-owner-foreign.html'), 'foreign write');
else if (!noOpThisLaunch) {
  mkdirSync(join(writeRoot, 'src', 'copy'), { recursive: true });
  if (mode === 'symlink-output') symlinkSync('../../.omd/owner-task.md', join(writeRoot, 'src', 'copy', 'index.html'));
  else if (mode === 'special-output') {
    const fifo = spawnSync('/usr/bin/mkfifo', [join(writeRoot, 'src', 'copy', 'index.html')]);
    if (fifo.status !== 0) process.exit(94);
  } else writeFileSync(join(writeRoot, 'src', 'copy', 'index.html'), repairRoot
    ? '<!doctype html><title>Repaired by omd-hand</title>'
    : '<!doctype html><title>Owned by omd-hand</title>');
  if (mode === 'omd-mutation') writeFileSync(join(root, '.omd', 'owner-forged-finalization.json'), 'forged');
}
if (mode !== 'task-complete-no-message') {
  process.stdout.write(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Production source and evidence written.' } }) + '\\n');
}
process.stdout.write(JSON.stringify({ type: mode === 'task-complete' || mode === 'task-complete-no-message' ? 'task_complete' : 'turn.completed', usage: {} }) + '\\n');
if (mode === 'malformed-exec-response') {
  const resistant = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {
    stdio: 'ignore',
  });
  resistant.unref();
  writeFileSync(process.env.OMD_TEST_MALFORMED_READY, String(process.pid));
}
`);
}

function coordinatorStub(path: string, reportPath: string, operation = 'run'): string {
  return executable(path, `
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, watch, writeFileSync } from 'node:fs';
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
if (${JSON.stringify(operation)} === 'owner-preexisting-dangling') {
  symlinkSync('missing-dependency-tree', process.cwd() + '/node_modules', 'dir');
}
const timeout = ['stall', 'unsafe-stall', 'retry'].includes(process.env.OMD_TEST_OWNER_MODE) ? '10000' : '20000';
const args = ${JSON.stringify(operation)} === 'mismatch'
  ? ['owner', 'run', '--agent', 'omd-eye', '--input', '.omd/owner-task.md', '--timeout-ms', timeout, '--json']
  : ['owner', ${JSON.stringify(operation)} === 'repair-mode' ? 'repair' : 'run', '--agent', 'omd-hand', '--input', '.omd/owner-task.md', '--timeout-ms', timeout, '--json'];
const launch = () => spawnSync(process.execPath, [process.env.OMD_TEST_OWNER_CLI, ...args], {
  cwd: process.env.OMD_TEST_OWNER_CWD || process.cwd(), encoding: 'utf8', env,
});
const launchRepair = (mirror) => spawnSync(process.execPath, [process.env.OMD_TEST_OWNER_CLI,
  'owner', 'repair', '--agent', 'omd-hand', '--input', '.omd/owner-task.md', '--mirror', mirror,
  '--timeout-ms', timeout, '--json'], {
  cwd: process.env.OMD_TEST_OWNER_CWD || process.cwd(), encoding: 'utf8', env,
});
const canonicalJson = (value) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
const observe = (sequence) => {
  const source = readFileSync(process.cwd() + '/src/copy/index.html');
  const observation = {
    schema: 'observation-v2',
    buildSha256: digest(source),
    currentArtifact: { path: 'src/copy/index.html', sha256: digest(source) },
    predecessorSha256: null,
    observedAt: new Date(Date.now() + sequence * 1000).toISOString(),
    evidence: { sequence },
  };
  const bytes = canonicalJson(observation) + '\\n\\n';
  const sha256 = digest(bytes);
  mkdirSync(process.cwd() + '/.omd/observation-v2', { recursive: true });
  writeFileSync(process.cwd() + '/.omd/observation-v2/sha256-' + sha256 + '.json', bytes);
  writeFileSync(process.cwd() + '/.omd/observation-v2.json', canonicalJson({
    schema: 'observation-v2-pointer', record: '.omd/observation-v2/sha256-' + sha256 + '.json', sha256,
  }) + '\\n\\n');
};
const createMirror = () => {
  const made = spawnSync(process.execPath, [process.env.OMD_TEST_CLI, 'owner', 'mirror',
    '--out', process.env.OMD_TEST_REPAIR_PARENT, '--activation', env.OMD_ACTIVATION_PATH, '--json'], {
    cwd: process.cwd(), encoding: 'utf8', env,
  });
  if (made.status !== 0) throw new Error('mirror creation failed: ' + made.stderr + made.stdout);
  return JSON.parse(made.stdout).mirrorRoot;
};
const startMalformedResponse = () => {
  const source = [
    "import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';",
    "const [directory, ready] = process.argv.slice(1);",
    "const wait = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);",
    "while (!existsSync(ready)) wait();",
    "let response; while (!response) { response = readdirSync(directory).find(name => name.startsWith('response-')); if (!response) wait(); }",
    "const pid = Number(readFileSync(ready, 'utf8'));",
    "for (;;) { try { process.kill(pid, 0); wait(); } catch { break; } }",
    "const path = directory + '/' + response;",
    "writeFileSync(path, JSON.stringify({ error: 'OMD_TEST_MALFORMED_EXEC_RESPONSE' }));",
    "try { unlinkSync(path); } catch {}",
  ].join('\\n');
  return spawn(process.execPath, ['--input-type=module', '-e', source,
    process.env.OMD_CODEX_AUTHORITY_RESPONSE_DIR, process.env.OMD_TEST_MALFORMED_READY], {
    stdio: 'ignore',
  });
};
let coordinatorChildStatus;
let coordinatorChildStderr;
let first;
let responseSabotage;
if (${JSON.stringify(operation)} === 'malformed-exec-response') responseSabotage = startMalformedResponse();
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
let repairFirst; let repairSecond; let replay; let secondInitial; let thirdInitial; let repairMirrors = [];
let sourceAfterMalformed; let malformedSecond;
if (${JSON.stringify(operation)} === 'repair-transaction' && first.status === 0) {
  observe(1);
  const firstMirror = createMirror();
  repairMirrors.push(firstMirror);
  repairFirst = launchRepair(firstMirror);
  const repairedBytes = readFileSync(firstMirror + '/src/copy/index.html');
  copyFileSync(process.cwd() + '/src/copy/index.html', firstMirror + '/src/copy/index.html');
  replay = launchRepair(firstMirror);
  writeFileSync(firstMirror + '/src/copy/index.html', repairedBytes);
  observe(2);
  const secondMirror = createMirror();
  repairMirrors.push(secondMirror);
  repairSecond = launchRepair(secondMirror);
  secondInitial = launch();
}
if (${JSON.stringify(operation)} === 'malformed-exec-response') {
  sourceAfterMalformed = existsSync(process.cwd() + '/src/copy/index.html');
  malformedSecond = launch();
}
if (${JSON.stringify(operation)} === 'failed-initial-reentry' && first.status !== 0) {
  writeFileSync(process.cwd() + '/.omd/composition.md', 'Fresh lawful upstream owner rebind.\\n');
  secondInitial = launch();
  thirdInitial = launch();
}
const child = ${JSON.stringify(operation)} === 'duplicate' ? launch()
  : ${JSON.stringify(operation)} === 'repair-transaction' ? (repairSecond || first) : first;
if (${JSON.stringify(operation)} === 'coordinator-child-substitution') {
  const ownerObserved = JSON.parse(readFileSync(process.env.OMD_TEST_OWNER_ARGS, 'utf8'));
  const substituted = spawnSync(process.execPath, [process.env.OMD_TEST_CLI, 'route', 'show', '--json'], {
    cwd: process.cwd(), encoding: 'utf8', env: { ...env, OMD_ACTIVATION_PATH: ownerObserved.activation },
  });
  coordinatorChildStatus = substituted.status;
  coordinatorChildStderr = substituted.stderr;
}
if (${JSON.stringify(operation)} === 'workspace-denied') chmodSync(hostRunDirectory, 0o700);
const ownerChildLaunchCount = existsSync(process.env.OMD_TEST_OWNER_SEQUENCE + '.launches')
  ? readFileSync(process.env.OMD_TEST_OWNER_SEQUENCE + '.launches', 'utf8').trim().split('\\n').filter(Boolean).length
  : 0;
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({ status: child.status, stdout: child.stdout, stderr: child.stderr,
  coordinatorChildStatus, coordinatorChildStderr, ownerLaunchCount: ${JSON.stringify(operation)} === 'duplicate' ? 2 : 1,
  firstStatus: first.status, firstStdout: first.stdout, firstStderr: first.stderr,
  outerArgs: process.argv.slice(2), ownerDirectory: process.env.OMD_CODEX_OWNER_DIRECTORY,
  activation: process.env.OMD_ACTIVATION_PATH, loaded: process.env.OMD_CODEX_LOADED_SKILL_RECEIPT_PATH,
  socket: process.env.OMD_CODEX_AUTHORITY_SOCKET, response: process.env.OMD_CODEX_AUTHORITY_RESPONSE_DIR,
  publicKey: process.env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH,
  repairFirst, repairSecond, replay, secondInitial, thirdInitial, repairMirrors,
  sourceAfterMalformed, malformedSecond, ownerChildLaunchCount }));
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
  repairFirst?: Readonly<{ status: number; stdout: string; stderr: string }>;
  repairSecond?: Readonly<{ status: number; stdout: string; stderr: string }>;
  replay?: Readonly<{ status: number; stdout: string; stderr: string }>;
  secondInitial?: Readonly<{ status: number; stdout: string; stderr: string }>;
  thirdInitial?: Readonly<{ status: number; stdout: string; stderr: string }>;
  ownerChildLaunchCount?: number;
  repairMirrors?: string[];
  sourceAfterMalformed?: boolean;
  malformedSecond?: Readonly<{ status: number; stdout: string; stderr: string }>;
}>;

async function launchOwner(input: Readonly<{
  root: string;
  mode: string;
  operation?: string;
  ownerCwd?: string;
  throughCli?: boolean;
  roleModel?: string;
  roleEffort?: 'low' | 'medium' | 'high';
}>): Promise<{ report: CoordinatorReport; argsReport: string; alternateHostMarker: string; hostResult: Awaited<ReturnType<typeof runCodexHostExec>>; cleanup: () => void }> {
  const parent = join(input.root, '..');
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const reportPath = join(parent, `owner-coordinator-${id}.json`);
  const argsReport = join(parent, `owner-args-${id}.json`);
  const topCodex = coordinatorStub(join(parent, `owner-top-${id}`), reportPath, input.operation);
  const nestedCodex = ownerCodexStub(join(parent, `owner-child-${id}`));
  const codexHome = join(parent, `owner-codex-home-${id}`);
  mkdirSync(join(codexHome, 'agents'), { recursive: true });
  copyFileSync(join(ROOT, 'dist', 'codex', 'agents', 'omd-hand.toml'), join(codexHome, 'agents', 'omd-hand.toml'));
  const alternateHostMarker = join(parent, `alternate-host-must-not-run-${id}`);
  const ownerRelease = join(parent, `owner-release-${id}`);
  const malformedReady = join(parent, `owner-malformed-ready-${id}`);
  const ownerSequence = join(parent, `owner-sequence-${id}`);
  const repairParent = join(parent, `owner-repair-parent-${id}`);
  mkdirSync(repairParent);
  const alternateHostBinDirectory = join(parent, `alternate-host-eperm-${id}`);
  mkdirSync(alternateHostBinDirectory);
  executable(join(alternateHostBinDirectory, 'pi'), `
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(alternateHostMarker)}, 'listen EPERM');
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
    OMD_TEST_ALTERNATE_HOST_MARKER: alternateHostMarker,
    OMD_TEST_OWNER_RELEASE: ownerRelease,
    OMD_TEST_MALFORMED_READY: malformedReady,
    OMD_TEST_OWNER_SEQUENCE: ownerSequence,
    OMD_TEST_REPAIR_PARENT: repairParent,
    ...(input.roleModel === undefined ? {} : { OMD_TEST_EXPECTED_ROLE_MODEL: input.roleModel }),
    ...(input.roleEffort === undefined ? {} : { OMD_TEST_EXPECTED_ROLE_EFFORT: input.roleEffort }),
    PATH: `${alternateHostBinDirectory}:${process.env.PATH ?? ''}`,
    ...(input.ownerCwd === undefined ? {} : { OMD_TEST_OWNER_CWD: input.ownerCwd }),
  };
  let hostResult: Awaited<ReturnType<typeof runCodexHostExec>>;
  if (input.throughCli === true) {
    cpSync(join(ROOT, 'dist', 'codex', 'skills'), join(codexHome, 'skills'), { recursive: true });
    const launched = spawn(process.execPath, [OWNER_CLI, 'exec', '-C', input.root,
      ...(input.roleModel === undefined ? [] : ['--omd-role-model', `omd-hand=${input.roleModel}`]),
      ...(input.roleEffort === undefined ? [] : ['--omd-role-effort', `omd-hand=${input.roleEffort}`]),
      'launch owner'], {
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
    hostResult = await runCodexHostExec(['exec', '-C', input.root,
      ...(input.roleModel === undefined ? [] : ['--omd-role-model', `omd-hand=${input.roleModel}`]),
      ...(input.roleEffort === undefined ? [] : ['--omd-role-effort', `omd-hand=${input.roleEffort}`]),
      'launch owner'], {
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
    report, argsReport, alternateHostMarker, hostResult,
    cleanup: () => {
      for (const path of [reportPath, argsReport, topCodex, nestedCodex, codexHome, alternateHostMarker, ownerRelease, malformedReady, ownerSequence, `${ownerSequence}.launches`, alternateHostBinDirectory, repairParent]) rmSync(path, { recursive: true, force: true });
    },
  };
}

function parsedResult(report: CoordinatorReport): Record<string, unknown> {
  assert.equal(report.status, 0, `${report.stderr}\n${report.stdout}`);
  return JSON.parse(report.stdout) as Record<string, unknown>;
}

async function pathAppears(path: string, timeoutMs = 1_000): Promise<boolean> {
  if (existsSync(path)) return true;
  return await new Promise<boolean>((resolve) => {
    const observer = watch(dirname(path), (_event, filename) => {
      if (filename !== path.slice(dirname(path).length + 1)) return;
      clearTimeout(timer);
      observer.close();
      resolve(true);
    });
    const timer = setTimeout(() => {
      observer.close();
      resolve(existsSync(path));
    }, timeoutMs);
  });
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
    const observed = JSON.parse(readFileSync(run.argsReport, 'utf8')) as { args: string[]; task: string; role: string; activation: string; showStatus: number; showStderr: string; checkStatus: number; checkStderr: string };
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
    assert.match(observed.task, /source-write transaction only/);
    assert.match(observed.task, /CLI binding: every `omd` command/);
    assert.ok(observed.task.includes(join(ROOT, 'bin', 'omd.ts')));
    assert.match(observed.task, /Do not use bare `omd`/);
    assert.match(observed.task, /Never invoke `omd render`, `omd ir`, `omd probe`, `omd lifecycle`, Playwright, browser-rs, or their aliases/);
    assert.match(observed.task, /Browser observations and all \.omd evidence publication happen after this owner returns/);
    assert.equal(observed.args[0], 'exec');
    assert.equal(observed.args.includes('--json'), true);
    assert.deepEqual(observed.args.slice(0, 4), ['exec', '--json', '--sandbox', 'workspace-write']);
    assert.equal(observed.args.includes('--model'), false);
    assert.equal(observed.args.includes('-m'), false);
    assert.equal(observed.args.includes('--listen'), false);
    assert.equal(observed.args.includes('app-server'), false);
    assert.equal(existsSync(run.alternateHostMarker), false, 'Codex owner transport must not try an alternate-host loopback fallback');
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

test('host-owned Hand model and effort overrides reach only the signed production child configuration', async () => {
  const root = project('omd-owner-role-override-');
  const run = await launchOwner({
    root,
    mode: 'success',
    roleModel: 'gpt-5.6-sol',
    roleEffort: 'medium',
  });
  try {
    assert.equal(run.hostResult.status, 0, run.hostResult.stderr);
    const result = parsedResult(run.report);
    const attempt = (result.attempts as Record<string, unknown>[])[0]!;
    const observed = JSON.parse(readFileSync(run.argsReport, 'utf8')) as { args: string[] };
    assert.equal(run.report.outerArgs.includes('--omd-role-model'), false);
    assert.equal(run.report.outerArgs.includes('--omd-role-effort'), false);
    assert.equal(observed.args[observed.args.indexOf('--model') + 1], 'gpt-5.6-sol');
    assert.equal(observed.args.filter((arg) => arg.startsWith('model_reasoning_effort=')).length, 1);
    assert.ok(observed.args.includes('model_reasoning_effort="medium"'));
    assert.equal(result.modelArgumentOmitted, false);
    assert.equal(result.model, 'gpt-5.6-sol');
    assert.equal(result.modelReasoningEffort, 'medium');
    assert.match(String(result.configurationSha256), /^[a-f0-9]{64}$/);
    assert.equal(attempt.modelArgumentOmitted, false);
    assert.equal(attempt.model, result.model);
    assert.equal(attempt.modelReasoningEffort, result.modelReasoningEffort);
    assert.equal(attempt.configurationSha256, result.configurationSha256);
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

test('one host keeps initial ownership closed while allowing fresh observation-bound mirror repairs', async () => {
  const root = project('omd-owner-repair-transaction-');
  const run = await launchOwner({ root, mode: 'success', operation: 'repair-transaction' });
  try {
    assert.equal(run.report.firstStatus, 0, run.report.firstStderr ?? 'initial owner failed');
    assert.equal(run.report.repairFirst?.status, 0, run.report.repairFirst?.stderr ?? 'first repair failed');
    assert.equal(run.report.repairSecond?.status, 0, run.report.repairSecond?.stderr ?? 'second repair failed');
    assert.notEqual(run.report.replay?.status, 0);
    assert.match(run.report.replay?.stderr ?? '', /OWNER_REPAIR_REPLAY/);
    assert.notEqual(run.report.secondInitial?.status, 0);
    assert.match(run.report.secondInitial?.stderr ?? '', /OWNER_(?:DUPLICATE_COMPLETION|REPAIR_BYPASS)/);
    assert.equal(
      readFileSync(join(root, 'src', 'copy', 'index.html'), 'utf8'),
      '<!doctype html><title>Owned by omd-hand</title>',
      'repair Hand must leave production source unchanged pending lifecycle commit',
    );
    assert.equal(run.report.repairMirrors?.length, 2);
    for (const mirror of run.report.repairMirrors ?? []) {
      assert.equal(
        readFileSync(join(mirror, 'src', 'copy', 'index.html'), 'utf8'),
        '<!doctype html><title>Repaired by omd-hand</title>',
      );
    }
    const first = JSON.parse(run.report.repairFirst!.stdout) as { mode: string; repair: { changedPaths: string[]; observationPointerSha256: string }; receiptPath: string };
    const second = JSON.parse(run.report.repairSecond!.stdout) as { mode: string; repair: { changedPaths: string[]; observationPointerSha256: string }; receiptPath: string };
    assert.equal(first.mode, 'repair');
    assert.deepEqual(first.repair.changedPaths, ['src/copy/index.html']);
    assert.deepEqual(second.repair.changedPaths, ['src/copy/index.html']);
    assert.notEqual(first.receiptPath, second.receiptPath);
    assert.notEqual(first.repair.observationPointerSha256, second.repair.observationPointerSha256);
    const repairChild = JSON.parse(readFileSync(run.argsReport, 'utf8')) as { args: string[]; activation: string };
    const delegated = JSON.parse(readFileSync(repairChild.activation, 'utf8')) as {
      delegation: { payload: { operations: unknown[]; payloadAuthorizations: unknown[] } };
    };
    assert.equal(repairChild.args[repairChild.args.indexOf('-C') + 1], run.report.repairMirrors?.[1]);
    assert.deepEqual(delegated.delegation.payload.operations, []);
    assert.deepEqual(delegated.delegation.payload.payloadAuthorizations, []);
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

test('completed production preserves validated npm dependencies and Vite output without attributing them as source', async () => {
  const root = project('omd-owner-derived-success-');
  const run = await launchOwner({ root, mode: 'derived-success' });
  try {
    const result = parsedResult(run.report) as {
      sourceChanges: string[];
      attempts: Array<{ projectChanges: string[]; derivedChanges: string[]; unsafeOutputs: string[] }>;
    };
    assert.deepEqual(result.sourceChanges, ['src/copy/index.html']);
    assert.deepEqual(result.attempts[0]?.derivedChanges, ['dist', 'node_modules']);
    assert.deepEqual(result.attempts[0]?.projectChanges, ['dist', 'node_modules', 'src/copy/index.html']);
    assert.deepEqual(result.attempts[0]?.unsafeOutputs, []);
    assert.equal(readFileSync(join(root, 'dist', 'index.html'), 'utf8'), '<script src="./assets/app.js"></script>\n');
    assert.equal(lstatSync(join(root, 'node_modules', '.bin', 'vite')).isSymbolicLink(), true);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failed install/build mutation is terminal and rolls back the derived trees before any retry', async () => {
  const root = project('omd-owner-derived-failed-');
  const run = await launchOwner({ root, mode: 'derived-failed' });
  try {
    assert.equal(run.report.status, 1);
    const result = JSON.parse(run.report.stdout) as {
      failure: string;
      attempts: Array<{ projectChanges: string[]; derivedChanges: string[] }>;
    };
    assert.equal(result.failure, 'OWNER_RETRY_UNSAFE_PROJECT_MUTATION');
    assert.equal(result.attempts.length, 1);
    assert.deepEqual(result.attempts[0]?.projectChanges, ['dist', 'node_modules']);
    assert.deepEqual(result.attempts[0]?.derivedChanges, ['dist', 'node_modules']);
    assert.equal(run.report.ownerChildLaunchCount, 1);
    assert.equal(existsSync(join(root, 'node_modules')), false);
    assert.equal(existsSync(join(root, 'dist')), false);
    assert.equal(existsSync(join(root, 'src')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a symlinked derived root fails closed and is rolled back', async () => {
  const root = project('omd-owner-derived-root-link-');
  const run = await launchOwner({ root, mode: 'derived-root-symlink' });
  try {
    assert.notEqual(run.report.status, 0);
    assert.match(run.report.stderr, /OWNER_EXECUTION_ABORTED:derived project root must be a real directory: node_modules/);
    assert.equal(existsSync(join(root, 'node_modules')), false);
    assert.equal(existsSync(join(root, 'src')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('dangling derived roots fail before ownership and after replacement without bypassing rollback', async () => {
  const preexisting = project('omd-owner-derived-preexisting-dangling-');
  const rejected = await launchOwner({ root: preexisting, mode: 'success', operation: 'owner-preexisting-dangling' });
  try {
    assert.notEqual(rejected.report.status, 0);
    assert.match(rejected.report.stderr, /derived project root must be a real directory: node_modules/);
    assert.equal(rejected.report.ownerChildLaunchCount, 0);
  } finally {
    rejected.cleanup();
    rmSync(preexisting, { recursive: true, force: true });
  }

  const replaced = project('omd-owner-derived-replaced-dangling-');
  mkdirSync(join(replaced, 'node_modules', 'vite'), { recursive: true });
  writeFileSync(join(replaced, 'node_modules', 'vite', 'index.js'), 'export {};\n');
  const run = await launchOwner({ root: replaced, mode: 'derived-dangling-replacement' });
  try {
    assert.notEqual(run.report.status, 0);
    assert.match(run.report.stderr, /OWNER_EXECUTION_ABORTED:derived project root must be a real directory: node_modules/);
    assert.equal(run.report.ownerChildLaunchCount, 1);
    assert.equal(lstatSync(join(replaced, 'node_modules')).isDirectory(), true, run.report.stderr);
    assert.equal(readFileSync(join(replaced, 'node_modules', 'vite', 'index.js'), 'utf8'), 'export {};\n');
    assert.equal(existsSync(join(replaced, 'src')), false);
  } finally {
    run.cleanup();
    rmSync(replaced, { recursive: true, force: true });
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

test('completed no-op ownership may bind existing in-scope source but not an empty project', async () => {
  const existing = project('omd-owner-existing-source-');
  mkdirSync(join(existing, 'src', 'copy'), { recursive: true });
  writeFileSync(join(existing, 'src', 'copy', 'index.html'), '<main>already green</main>\n');
  const accepted = await launchOwner({ root: existing, mode: 'no-op' });
  try {
    const result = parsedResult(accepted.report);
    assert.equal(result.result, 'completed');
    assert.deepEqual(result.sourceChanges, []);
  } finally {
    accepted.cleanup();
    rmSync(existing, { recursive: true, force: true });
  }

  const empty = project('omd-owner-empty-no-op-');
  const rejected = await launchOwner({ root: empty, mode: 'no-op' });
  try {
    assert.equal(rejected.report.status, 1);
    const result = JSON.parse(rejected.report.stdout) as { failure?: string };
    assert.equal(result.failure, 'OWNER_COMPLETED_WITHOUT_PRODUCTION_WRITE');
  } finally {
    rejected.cleanup();
    rmSync(empty, { recursive: true, force: true });
  }
});

test('a failed zero-mutation initial owner may re-enter once without weakening successful completion', async () => {
  const root = project('omd-owner-failed-initial-reentry-');
  const run = await launchOwner({ root, mode: 'no-op-reentry', operation: 'failed-initial-reentry' });
  try {
    assert.equal(run.report.firstStatus, 1);
    const first = JSON.parse(run.report.firstStdout!) as { result: string; failure: string; receiptPath: string };
    assert.equal(first.result, 'failed');
    assert.equal(first.failure, 'OWNER_COMPLETED_WITHOUT_PRODUCTION_WRITE');
    assert.notEqual(first.receiptPath, run.hostResult.ownerReceiptPath);

    assert.equal(run.report.secondInitial?.status, 0, run.report.secondInitial?.stderr ?? 'retry result missing');
    const second = JSON.parse(run.report.secondInitial!.stdout) as { result: string; sourceChanges: string[]; receiptPath: string };
    assert.equal(second.result, 'completed');
    assert.deepEqual(second.sourceChanges, ['src/copy/index.html']);
    assert.match(second.receiptPath, /\/result-retry-[a-f0-9]{64}\.json$/);
    assert.equal(second.receiptPath, run.hostResult.ownerReceiptPath, 'host result resolves the successful owner receipt');
    assert.notEqual(second.receiptPath, first.receiptPath);
    assert.equal(existsSync(first.receiptPath), true, 'the failed receipt remains immutable evidence');
    assert.equal(statSync(first.receiptPath).mode & 0o777, 0o400);
    assert.equal(statSync(second.receiptPath).mode & 0o777, 0o400);
    assert.equal(run.report.ownerChildLaunchCount, 2, 'the rejected third owner did not launch a child');

    assert.notEqual(run.report.thirdInitial?.status, 0);
    assert.match(run.report.thirdInitial?.stderr ?? '', /OWNER_DUPLICATE_COMPLETION/);
    assert.equal(readFileSync(join(root, 'src', 'copy', 'index.html'), 'utf8'), '<!doctype html><title>Owned by omd-hand</title>');
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('the one failed zero-mutation initial-owner re-entry cannot become an unbounded owner loop', async () => {
  const root = project('omd-owner-failed-initial-exhausted-');
  const run = await launchOwner({ root, mode: 'no-op', operation: 'failed-initial-reentry' });
  try {
    assert.equal(run.report.firstStatus, 1);
    const first = JSON.parse(run.report.firstStdout!) as { result: string; failure: string; receiptPath: string };
    assert.equal(first.result, 'failed');
    assert.equal(first.failure, 'OWNER_COMPLETED_WITHOUT_PRODUCTION_WRITE');

    assert.equal(run.report.secondInitial?.status, 1);
    const second = JSON.parse(run.report.secondInitial!.stdout) as { result: string; failure: string; receiptPath: string };
    assert.equal(second.result, 'failed');
    assert.equal(second.failure, 'OWNER_COMPLETED_WITHOUT_PRODUCTION_WRITE');
    assert.match(second.receiptPath, /\/result-retry-[a-f0-9]{64}\.json$/);
    assert.notEqual(second.receiptPath, first.receiptPath);
    assert.equal(existsSync(first.receiptPath), true);
    assert.equal(existsSync(second.receiptPath), true);
    assert.equal(run.report.ownerChildLaunchCount, 2);

    assert.notEqual(run.report.thirdInitial?.status, 0);
    assert.match(run.report.thirdInitial?.stderr ?? '', /OWNER_RETRY_EXHAUSTED/);
    assert.equal(existsSync(join(root, 'src')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failed initial transaction that consumed both delegated attempts cannot open another owner grant', async () => {
  const root = project('omd-owner-failed-initial-budget-');
  const run = await launchOwner({ root, mode: 'failed-fast', operation: 'failed-initial-reentry' });
  try {
    assert.equal(run.report.firstStatus, 1);
    const first = JSON.parse(run.report.firstStdout!) as { result: string; failure: string; attempts: unknown[] };
    assert.equal(first.result, 'failed');
    assert.equal(first.failure, 'OWNER_ATTEMPTS_EXHAUSTED');
    assert.equal(first.attempts.length, 2);
    assert.notEqual(run.report.secondInitial?.status, 0);
    assert.match(run.report.secondInitial?.stderr ?? '', /OWNER_RETRY_EXHAUSTED/);
    assert.equal(run.report.ownerChildLaunchCount, 2);
    assert.equal(readdirSync(run.hostResult.ownerDirectory).filter((path) => path.endsWith('.json')).length, 1);
    assert.equal(existsSync(join(root, 'src')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a re-entry failure uses its one signed remaining attempt and persists a structured readonly receipt', async () => {
  const root = project('omd-owner-reentry-failure-receipt-');
  const run = await launchOwner({ root, mode: 'no-op-reentry-failed', operation: 'failed-initial-reentry' });
  try {
    const first = JSON.parse(run.report.firstStdout!) as { result: string; attempts: unknown[]; receiptPath: string };
    assert.equal(first.result, 'failed');
    assert.equal(first.attempts.length, 1);

    assert.equal(run.report.secondInitial?.status, 1);
    const second = JSON.parse(run.report.secondInitial!.stdout) as {
      result: string;
      failure: string;
      attempts: Array<{ status: string; exitCode: number | null; projectChanges: string[] }>;
      receiptPath: string;
    };
    assert.equal(second.result, 'failed');
    assert.equal(second.failure, 'OWNER_ATTEMPTS_EXHAUSTED');
    assert.deepEqual(second.attempts.map((attempt) => attempt.status), ['failed']);
    assert.deepEqual(second.attempts.map((attempt) => attempt.exitCode), [7]);
    assert.deepEqual(second.attempts[0]?.projectChanges, []);
    assert.match(second.receiptPath, /\/result-retry-[a-f0-9]{64}\.json$/);
    assert.equal(statSync(second.receiptPath).mode & 0o777, 0o400);
    assert.equal(run.report.ownerChildLaunchCount, 2, 'the broker launched exactly two initial owner children total');

    assert.notEqual(run.report.thirdInitial?.status, 0);
    assert.match(run.report.thirdInitial?.stderr ?? '', /OWNER_RETRY_EXHAUSTED/);
    assert.equal(existsSync(join(root, 'src')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('production owner rejects and rolls back prohibited browser-render commands', async () => {
  const root = project('omd-owner-prohibited-render-');
  const run = await launchOwner({ root, mode: 'prohibited-render' });
  try {
    assert.equal(run.report.status, 1);
    const result = JSON.parse(run.report.stdout) as { failure?: string };
    assert.equal(result.failure, 'OWNER_PROHIBITED_PRODUCTION_TOOL:omd-render');
    assert.equal(existsSync(join(root, 'src', 'copy', 'index.html')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('production owner permits the required source-safe no-log check', async () => {
  const root = project('omd-owner-allowed-check-');
  const run = await launchOwner({ root, mode: 'allowed-check' });
  try {
    const result = parsedResult(run.report);
    assert.equal(result.result, 'completed');
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('production owner may audit forbidden tool names without being treated as executing them', async () => {
  const root = project('omd-owner-forbidden-name-audit-');
  const run = await launchOwner({ root, mode: 'forbidden-name-audit' });
  try {
    const result = parsedResult(run.report);
    assert.equal(result.result, 'completed');
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('production owner still rejects an actual Playwright command', async () => {
  const root = project('omd-owner-prohibited-playwright-');
  const run = await launchOwner({ root, mode: 'prohibited-playwright' });
  try {
    assert.equal(run.report.status, 1);
    const result = JSON.parse(run.report.stdout) as { failure?: string };
    assert.equal(result.failure, 'OWNER_PROHIBITED_PRODUCTION_TOOL:playwright');
    assert.equal(existsSync(join(root, 'src', 'copy', 'index.html')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('production owner accepts task_complete only with a final agent message and exit zero', async () => {
  const root = project('omd-owner-task-complete-');
  const run = await launchOwner({ root, mode: 'task-complete' });
  try {
    const result = parsedResult(run.report);
    assert.equal(result.result, 'completed');
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('a malformed post-launch broker response restores writes and terminally aborts its grant', async () => {
  const root = project('omd-owner-malformed-exec-response-');
  const run = await launchOwner({ root, mode: 'malformed-exec-response', operation: 'malformed-exec-response' });
  try {
    assert.notEqual(run.report.status, 0);
    assert.match(run.report.stderr, /OWNER_EXECUTION_ABORTED:OWNER_EXECUTION_REJECTED: OMD_TEST_MALFORMED_EXEC_RESPONSE/);
    assert.equal(run.report.sourceAfterMalformed, false, 'post-launch source mutation was not restored');
    assert.notEqual(run.report.malformedSecond?.status, 0);
    assert.match(run.report.malformedSecond?.stderr ?? '', /OWNER_DUPLICATE_COMPLETION/);
    assert.equal(existsSync(join(root, 'src', 'copy', 'index.html')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('production owner rejects task_complete without a final agent message', async () => {
  const root = project('omd-owner-task-complete-no-message-');
  const run = await launchOwner({ root, mode: 'task-complete-no-message' });
  try {
    assert.equal(run.report.status, 1);
    const result = JSON.parse(run.report.stdout) as { failure?: string };
    assert.equal(result.failure, 'OWNER_RETRY_UNSAFE_PROJECT_MUTATION');
    assert.equal(existsSync(join(root, 'src', 'copy', 'index.html')), false);
  } finally {
    run.cleanup();
    rmSync(root, { recursive: true, force: true });
  }
});

test('signed owner completion waits for signal-resistant descendant quiescence', async () => {
  const root = project('omd-owner-receipt-race-');
  const lateMutation = join(root, '.omd', 'late-owner-mutation.json');
  const run = await launchOwner({ root, mode: 'receipt-race' });
  try {
    const result = parsedResult(run.report);
    assert.equal(result.result, 'completed');
    assert.equal(
      await pathAppears(lateMutation),
      false,
      'a signal-resistant descendant survived the signed execution receipt and mutated the project afterward',
    );
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
    assert.equal(runs[2]!.report.status, 1);
    assert.match(
      runs[2]!.report.stderr,
      /OWNER_HOST_BINDING_INVALID/,
      'the owner CLI must reject the cross-project binding before delegated production starts',
    );
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
