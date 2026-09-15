import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  bindCodexAuthorityResponseChannel,
  codexPayloadAuthorizationPhaseError,
  deliverCodexAuthorityResponse,
  isCodexFinalEvidenceContinuationPayload,
  isCodexOwnerAuthorityRequest,
  isBrokeredBrowserCliOperation,
  isExactCanonicalCliInvocation,
  parseCodexHostPayloadAuthorization,
  parseCodexHostRoleOptions,
  productionOwnerRepairPayloadAuthorizationError,
  resolveCodexHostExecutable,
  runCodexHostExec,
  workflowProductionSliceAuthorityError,
  type CodexHostLaunchResult,
} from '../adapters/codex-host-launcher.ts';
import { resolveCodexAuthorityCliPath } from '../core/runtime/activation.ts';
import { codexBrowserRoleFromEnvironment } from '../core/runtime/codex-browser-operation.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'bin', 'omd.mjs');
const INSTALLER = join(ROOT, 'bin', 'omd-install.ts');
const ROUTE_FIXTURE = join(ROOT, 'test', 'fixtures', 'adaptive-flow', 'copy-only.json');

function executable(path: string, source: string): string {
  writeFileSync(path, `#!/usr/bin/env node\n${source}`);
  chmodSync(path, 0o755);
  return path;
}

function privateFifo(path: string) {
  const created = spawnSync('/usr/bin/mkfifo', [path], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  chmodSync(path, 0o600);
  return bindCodexAuthorityResponseChannel(path);
}

function fifoReader(path: string): Promise<Readonly<{ status: number | null; stdout: string; stderr: string }>> {
  const child = spawn(process.execPath, ['--input-type=module', '-e', [
    "import { readFileSync } from 'node:fs';",
    "process.stdout.write(readFileSync(process.argv[1]));",
  ].join('\n'), path], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; });
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  return new Promise((resolveReader, rejectReader) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectReader(new Error('FIFO reader timed out'));
    }, 2_000);
    child.once('error', (error) => { clearTimeout(timer); rejectReader(error); });
    child.once('exit', (status) => {
      clearTimeout(timer);
      resolveReader(Object.freeze({ status, stdout, stderr }));
    });
  });
}

function project(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const git = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  mkdirSync(join(root, '.omd', '.cache'), { recursive: true });
  writeFileSync(join(root, '.omd', '.cache', 'route-input.json'), readFileSync(ROUTE_FIXTURE));
  return root;
}

function routeStub(path: string, reportPath: string, extra = ''): string {
  return executable(path, `
import { spawnSync } from 'node:child_process';
import { statSync, writeFileSync } from 'node:fs';
const root = process.env.OMD_TEST_PROJECT;
const cli = process.env.OMD_TEST_CLI;
const activation = process.env.OMD_ACTIVATION_PATH;
const loaded = process.env.OMD_CODEX_LOADED_SKILL_RECEIPT_PATH;
${extra}
const child = spawnSync(process.execPath, [cli, 'route', 'classify', '--input', '.omd/.cache/route-input.json', '--json'], {
  cwd: root, encoding: 'utf8', env: process.env,
});
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({
  argv: process.argv.slice(2), status: child.status, stdout: child.stdout, stderr: child.stderr,
  activation, loaded, activationMode: activation ? statSync(activation).mode & 0o777 : null,
  loadedMode: loaded ? statSync(loaded).mode & 0o777 : null,
}));
process.exit(child.status ?? 1);
`);
}

function typographyStub(path: string, reportPath: string): string {
  return executable(path, `
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const child = spawnSync(process.execPath, [
  process.env.OMD_TEST_CLI,
  'completion',
  'typography-applicability',
  '--ir',
  '.omd/.cache/rendered-ir.json',
  '--activation',
  process.env.OMD_ACTIVATION_PATH,
  '--json',
], {
  cwd: process.env.OMD_TEST_PROJECT,
  encoding: 'utf8',
  env: process.env,
});
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({
  status: child.status,
  stdout: child.stdout,
  stderr: child.stderr,
}));
process.exit(child.status ?? 1);
`);
}

async function launch(root: string, codex: string, report: string, extraArgs: readonly string[] = []): Promise<CodexHostLaunchResult> {
  return await runCodexHostExec(['exec', '-C', root, '--skip-git-repo-check', ...extraArgs, '$omd-ultradesign build the requested interface'], {
    codexBin: codex,
    packageRoot: ROOT,
    codexHome: join(root, '..', `codex-home-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    installedSkillRoot: join(ROOT, 'dist', 'codex', 'skills'),
    env: { ...process.env, OMD_TEST_PROJECT: root, OMD_TEST_CLI: CLI, OMD_TEST_REPORT: report },
    receiptRetentionMs: 60_000,
  });
}

test('RED hypothesis 1: the public CLI exposes a real Codex exec host surface without selecting a model', () => {
  const result = spawnSync(process.execPath, [INSTALLER, 'codex', '--help'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /oh-my-design codex exec/);
  assert.doesNotMatch(result.stdout, /--model <| -m,/);
});

test('an abandoned authority FIFO yields while a valid next response completes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-authority-fifo-abandoned-'));
  try {
    const abandonedPath = join(root, 'response-abandoned');
    const abandonedChannel = privateFifo(abandonedPath);
    let abandonedSettled = false;
    const abandoned = deliverCodexAuthorityResponse(
      abandonedChannel,
      Buffer.from('{"abandoned":true}'),
      1_000,
    ).then(
      () => { abandonedSettled = true; return undefined; },
      (error: unknown) => { abandonedSettled = true; return error; },
    );
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 30));

    const validPath = join(root, 'response-valid');
    const validChannel = privateFifo(validPath);
    const reader = fifoReader(validPath);
    await deliverCodexAuthorityResponse(validChannel, Buffer.from('{"ok":true}'), 1_000);
    const read = await reader;
    assert.equal(read.status, 0, read.stderr);
    assert.equal(read.stdout, '{"ok":true}');
    assert.equal(abandonedSettled, false, 'the missing first reader blocked the valid next delivery');

    const abandonedError = await abandoned;
    assert.ok(abandonedError instanceof Error);
    assert.match(abandonedError.message, /reader did not open before the delivery deadline/);
    assert.equal(existsSync(abandonedPath), false, 'the unchanged abandoned FIFO is removed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('authority response delivery tolerates a delayed FIFO reader', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-authority-fifo-delayed-'));
  try {
    const path = join(root, 'response-delayed');
    const channel = privateFifo(path);
    const delivery = deliverCodexAuthorityResponse(channel, Buffer.from('{"delayed":true}'), 1_000);
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 50));
    const reader = fifoReader(path);
    await delivery;
    const read = await reader;
    assert.equal(read.status, 0, read.stderr);
    assert.equal(read.stdout, '{"delayed":true}');
    assert.equal(existsSync(path), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('authority response delivery rejects FIFO substitution without unlinking the replacement', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-authority-fifo-substitution-'));
  try {
    const path = join(root, 'response-issued');
    const retained = join(root, 'issued-original');
    const channel = privateFifo(path);
    const delivery = deliverCodexAuthorityResponse(channel, Buffer.from('{"mustNotWrite":true}'), 1_000);
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 30));
    renameSync(path, retained);
    privateFifo(path);

    await assert.rejects(delivery, /authority response channel was replaced or changed/);
    assert.equal(lstatSync(path).isFIFO(), true, 'replacement FIFO was incorrectly removed');
    assert.equal(lstatSync(retained).isFIFO(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an abandoned authority client cannot block the watcher from serving the next valid request', async () => {
  const root = project('omd-authority-watcher-abandoned-');
  const runtime = mkdtempSync(join(tmpdir(), 'omd-authority-watcher-runtime-'));
  const report = join(runtime, 'report.json');
  const codex = executable(join(runtime, 'codex'), `
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const responseDirectory = process.env.OMD_CODEX_AUTHORITY_RESPONSE_DIR;
const requestId = 'A'.repeat(24);
const responsePath = join(responseDirectory, 'response-' + requestId);
const requestPath = join(responseDirectory, 'request-' + requestId + '.json');
const temporaryRequestPath = requestPath + '.tmp';
const release = ${JSON.stringify(join(runtime, 'release-delayed-reader'))};
const forced = ${JSON.stringify(join(runtime, 'forced-delayed-reader'))};
const audit = join(dirname(process.env.OMD_ACTIVATION_PATH), 'authority-audit.jsonl');
const created = spawnSync('/usr/bin/mkfifo', [responsePath], { encoding: 'utf8' });
if (created.status !== 0) process.exit(91);
chmodSync(responsePath, 0o600);
const readerSource = [
  "import { readFileSync, writeFileSync } from 'node:fs';",
  "import { existsSync, readdirSync } from 'node:fs';",
  "const [fifo, release, forced, audit, requests] = process.argv.slice(1);",
  "let requestedAt;",
  "const poll = setInterval(() => {",
  "  const accepted = existsSync(audit) && readFileSync(audit, 'utf8').split(String.fromCharCode(10)).filter(Boolean).some(line => JSON.parse(line).accepted === true);",
  "  if (accepted) writeFileSync(release, 'host-served-next-request');",
  "  if (requestedAt === undefined && readdirSync(requests).some(name => /^request-/.test(name) && name !== 'request-' + 'A'.repeat(24) + '.json')) requestedAt = Date.now();",
  "  if (!existsSync(release) && (requestedAt === undefined || Date.now() - requestedAt < 10000)) return;",
  "  clearInterval(poll);",
  "  if (!existsSync(release)) writeFileSync(forced, 'forced');",
  "  try { readFileSync(fifo); } catch {}",
  "}, 10);",
].join('\\n');
const delayedReader = spawn(process.execPath, ['--input-type=module', '-e', readerSource, responsePath, release, forced, audit, responseDirectory], {
  stdio: 'ignore',
});
writeFileSync(temporaryRequestPath, '{}');
renameSync(temporaryRequestPath, requestPath);
const deadline = Date.now() + 2000;
while ((!existsSync(audit) || readFileSync(audit, 'utf8').trim() === '') && Date.now() < deadline) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
}
if (!existsSync(audit) || readFileSync(audit, 'utf8').trim() === '') process.exit(92);
const valid = spawnSync(process.execPath, [process.env.OMD_TEST_CLI, 'route', 'classify',
  '--input', '.omd/.cache/route-input.json', '--json'], {
  cwd: process.cwd(), encoding: 'utf8', env: process.env,
});
const forcedDelayedReader = existsSync(forced);
const observedDeadline = Date.now() + 2000;
while (!existsSync(release) && Date.now() < observedDeadline) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
}
const readerObservedNextRequest = existsSync(release);
writeFileSync(release, 'release');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
delayedReader.kill('SIGTERM');
writeFileSync(${JSON.stringify(report)}, JSON.stringify({
  status: valid.status, stdout: valid.stdout, stderr: valid.stderr, forcedDelayedReader, readerObservedNextRequest,
}));
process.exit(valid.status ?? 1);
`);
  try {
    const result = await runCodexHostExec(['exec', '-C', root, 'exercise authority delivery'], {
      codexBin: codex,
      packageRoot: ROOT,
      codexHome: join(runtime, 'host'),
      installedSkillRoot: join(ROOT, 'dist', 'codex', 'skills'),
      env: { ...process.env, OMD_TEST_CLI: CLI },
      receiptRetentionMs: 60_000,
    });
    const observed = JSON.parse(readFileSync(report, 'utf8')) as {
      status: number; stdout: string; stderr: string; forcedDelayedReader: boolean; readerObservedNextRequest: boolean;
    };
    assert.equal(result.status, 0, observed.stderr);
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(observed.forcedDelayedReader, false, 'the abandoned FIFO froze the watcher until its reader was force-opened');
    assert.equal(observed.readerObservedNextRequest, true, 'the independent reader must observe the host servicing the next request');
    assert.equal(existsSync(join(root, '.omd', 'route.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
  }
});

test('host-owned role model and effort options are stripped, frozen, and reject ambiguous input', () => {
  const parsed = parseCodexHostRoleOptions([
    'exec', '-C', '/tmp/project',
    '--omd-role-model', 'omd-hand=gpt-5.6-sol',
    '--omd-role-effort', 'omd-hand=medium',
    '--omd-role-model', 'omd-eye=gpt-5.6-sol',
    '--omd-role-effort', 'omd-eye=high',
    '--model', 'gpt-6-astra', 'coordinate',
  ]);
  assert.deepEqual(parsed.coordinatorArgs, [
    'exec', '-C', '/tmp/project', '--model', 'gpt-6-astra', 'coordinate',
  ]);
  assert.deepEqual(parsed.roleOverrides, {
    'omd-eye': { model: 'gpt-5.6-sol', reasoningEffort: 'high' },
    'omd-hand': { model: 'gpt-5.6-sol', reasoningEffort: 'medium' },
  });
  assert.equal(Object.isFrozen(parsed.roleOverrides), true);
  assert.equal(Object.isFrozen(parsed.roleOverrides['omd-hand']), true);
  assert.throws(() => parseCodexHostRoleOptions(['exec', '--omd-role-model']), /requires <role>=<value>/);
  assert.throws(() => parseCodexHostRoleOptions(['exec', '--omd-role-model', 'omd-ghost=gpt-5.6-sol']), /unknown official OMD role/);
  assert.throws(() => parseCodexHostRoleOptions(['exec', '--omd-role-model', 'omd-hand=--evil']), /invalid model/);
  assert.throws(() => parseCodexHostRoleOptions(['exec', '--omd-role-effort', 'omd-hand=xhigh']), /low, medium, or high/);
  assert.throws(() => parseCodexHostRoleOptions([
    'exec', '--omd-role-model', 'omd-hand=gpt-5.6-sol', '--omd-role-model', 'omd-hand=gpt-5.6-luna',
  ]), /duplicate --omd-role-model/);
  assert.throws(() => parseCodexHostRoleOptions([
    'exec', '--omd-role-effort', 'omd-hand=low', '--omd-role-effort', 'omd-hand=high',
  ]), /duplicate --omd-role-effort/);
  assert.deepEqual(parseCodexHostRoleOptions([
    'exec', '--', '--omd-role-model', 'omd-hand=gpt-5.6-sol',
  ]), {
    coordinatorArgs: ['exec', '--', '--omd-role-model', 'omd-hand=gpt-5.6-sol'],
    roleOverrides: {},
  });
});

test('delegated Writer uses the issuing CLI and its explicitly owned direct-file publication path', async () => {
  const root = project('omd-role-cli-binding-');
  const runtime = realpathSync(mkdtempSync(join(tmpdir(), 'omd-role-cli-runtime-')));
  const codexHome = join(root, 'codex-home');
  const report = join(root, 'report.json');
  mkdirSync(join(codexHome, 'agents'), { recursive: true });
  writeFileSync(join(codexHome, 'agents', 'omd-writer.toml'), readFileSync(join(ROOT, 'dist/codex/agents/omd-writer.toml')));
  writeFileSync(join(root, '.omd/task.md'), 'Read the current route and write the test copy deck using your declared ownership contract.');
  executable(join(root, 'omd'), 'process.exit(93);');
  const codex = executable(join(runtime, 'codex-stub'), `
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (process.env.OMD_NON_PRODUCTION_ROLE) {
  const task = readFileSync(0, 'utf8');
  const prefix = task.split('exact command prefix:\\n')[1]?.split('\\n')[0];
  const result = spawnSync('/bin/sh', ['-c', prefix + ' route show --json'], { cwd: ${JSON.stringify(root)}, env: process.env, encoding: 'utf8' });
  // This is a transport/ownership test stub, not a model or a design-quality evaluation.
  if (!task.includes('publication method declared in your role instructions')
    || !task.includes('Direct file writes are permitted only to paths your role explicitly owns')) process.exit(94);
  writeFileSync(${JSON.stringify(join(root, '.omd/copy-deck.md'))}, '# Copy\\n\\nTest-owned Writer deck.\\n');
  writeFileSync(${JSON.stringify(report)}, JSON.stringify({ task, status: result.status, stderr: result.stderr, roleArgs: process.argv.slice(2), roleCwd: process.cwd(), activationPath: process.env.OMD_ACTIVATION_PATH, authoritySocket: process.env.OMD_CODEX_AUTHORITY_SOCKET }));
  console.log(JSON.stringify({type:'thread.started',thread_id:'isolated-role-cli-binding'}));
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Current route read through issuing CLI.'}}));
  console.log(JSON.stringify({type:'turn.completed'}));
  process.exit(result.status ?? 1);
}
const run = (cli, args) => spawnSync(process.execPath, [cli, ...args], {cwd:${JSON.stringify(root)}, env:process.env, encoding:'utf8'});
const classified = run(${JSON.stringify(CLI)}, ['route','classify','--input','.omd/.cache/route-input.json','--json']);
if (classified.status !== 0) { console.error(classified.stderr); process.exit(1); }
const delegated = run(${JSON.stringify(join(ROOT, 'bin/omd-codex.mjs'))}, ['role','run','--agent','omd-writer','--input','.omd/task.md','--json']);
const roleReport = JSON.parse(readFileSync(${JSON.stringify(report)}, 'utf8'));
writeFileSync(${JSON.stringify(report)}, JSON.stringify({
  ...roleReport,
  coordinatorArgs: process.argv.slice(2),
  delegatedStdout: delegated.stdout,
  delegatedStderr: delegated.stderr,
}));
console.error(delegated.stderr);
process.exit(delegated.status ?? 1);
`);
  let result: CodexHostLaunchResult | undefined;
  try {
    result = await runCodexHostExec([
      'exec', '-C', root,
      '--omd-role-model', 'omd-writer=gpt-5.6-luna',
      '--omd-role-effort', 'omd-writer=low',
      '--model', 'gpt-6-astra', '-c', 'model_reasoning_effort="medium"',
      'Read route using writer role',
    ], {
      codexBin: codex, packageRoot: ROOT, codexHome,
      installedSkillRoot: join(ROOT, 'dist/codex/skills'),
      env: { ...process.env, PATH: `${root}:${process.env.PATH ?? ''}` },
    });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(readFileSync(report, 'utf8'));
    assert.equal(observed.status, 0, observed.stderr);
    assert.notEqual(observed.roleCwd, realpathSync(root));
    assert.match(observed.roleCwd, /role-omd-writer-/);
    assert.match(observed.activationPath, /role-activation-[A-Za-z0-9_-]+\.json$/);
    assert.equal(isAbsolute(observed.authoritySocket), true);
    assert.deepEqual(observed.coordinatorArgs.slice(-5), [
      '--model', 'gpt-6-astra', '-c', 'model_reasoning_effort="medium"', 'Read route using writer role',
    ]);
    assert.equal(observed.coordinatorArgs.includes('--omd-role-model'), false);
    assert.equal(observed.coordinatorArgs.includes('--omd-role-effort'), false);
    assert.equal(observed.roleArgs[observed.roleArgs.indexOf('--model') + 1], 'gpt-5.6-luna');
    assert.equal(observed.roleArgs.filter((arg: string) => arg.startsWith('model_reasoning_effort=')).length, 1);
    assert.ok(observed.roleArgs.includes('model_reasoning_effort="low"'));
    const delegatedResult = JSON.parse(observed.delegatedStdout);
    assert.equal(delegatedResult.modelArgumentOmitted, false);
    assert.equal(delegatedResult.model, 'gpt-5.6-luna');
    assert.equal(delegatedResult.modelReasoningEffort, 'low');
    assert.equal(delegatedResult.authority.receipt.model, 'gpt-5.6-luna');
    assert.equal(delegatedResult.authority.receipt.modelReasoningEffort, 'low');
    assert.match(delegatedResult.authority.receipt.configurationSha256, /^[a-f0-9]{64}$/);
    assert.ok(observed.task.includes(realpathSync(join(ROOT, 'bin/omd.ts'))));
    assert.match(observed.task, /Do not use bare `omd`/);
    assert.match(observed.task, /role-owned PROJECT ARTIFACT direct edits and CLI artifact input\/output paths, use absolute paths under/);
    assert.match(observed.task, /remote URLs, protocol pack names, or host-issued activation, evidence, and receipt paths/);
    assert.match(observed.task, /schema-defined path identities inside JSON records/);
    assert.match(observed.task, /inputPath must remain a project-relative \.omd\/refs PNG identity/);
    assert.match(observed.task, /required native publisher/);
    assert.match(observed.task, /must not write arbitrary files/);
    assert.equal(readFileSync(join(root, '.omd/copy-deck.md'), 'utf8'), '# Copy\n\nTest-owned Writer deck.\n');
    assert.match(observed.task, /Use named OMD CLI commands where your role requires them/);
    assert.match(observed.task, /not a fallback for a CLI-required record/);
    assert.match(observed.task, /Do not invent publication commands or write another role's artifacts/);
    assert.match(observed.task, /Do not write production source and do not delegate your owned work/);
    assert.doesNotMatch(observed.task, /Persist only artifacts owned by your role through their named OMD CLI commands/);
  } finally {
    if (result) rmSync(result.authoritySocketPath, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
  }
});

test('brokered Scout capture rebinds only its own explicit activation and preserves implicit transport', async () => {
  const root = project('omd-browser-activation-');
  const runtime = realpathSync(mkdtempSync(join(tmpdir(), 'omd-browser-activation-runtime-')));
  const codexHome = join(runtime, 'codex-home');
  const report = join(runtime, 'report.json');
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Reference fixture</title><main><section style="padding:40px;background:#eee"><h1>Measured reference specimen</h1><p>This local component tests capture transport, not design quality.</p></section></main>');
  });
  await new Promise<void>((resolveListening) => server.listen(0, '127.0.0.1', resolveListening));
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  mkdirSync(join(codexHome, 'agents'), { recursive: true });
  writeFileSync(join(codexHome, 'agents/omd-scout.toml'), readFileSync(join(ROOT, 'dist/codex/agents/omd-scout.toml')));
  writeFileSync(join(root, '.omd/.cache/route-input.json'), readFileSync(join(ROOT, 'test/fixtures/adaptive-flow/synth-marketing.json')));
  writeFileSync(join(root, '.omd/task.md'), 'Capture the local transport fixture with process-local activation.');
  writeFileSync(join(root, '.omd/.cache/reference-batch.json'), JSON.stringify([{
    source: `http://127.0.0.1:${address.port}/`, as: 'transport-specimen', selector: 'main > section',
    blueprint: true, shot: true, energy: false, viewport: '1280x900',
  }]));
  const codex = executable(join(runtime, 'codex-stub'), `
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = ${JSON.stringify(root)};
const run = (args) => spawnSync(process.execPath, [process.env.OMD_CLI_PATH, ...args], { cwd: root, env: process.env, encoding: 'utf8' });
if (process.env.OMD_NON_PRODUCTION_ROLE === 'omd-scout') {
  const task = readFileSync(0, 'utf8');
  const args = ['ref', 'add-batch', '.omd/.cache/reference-batch.json', '--json'];
  const wrong = run([...args, '--activation', readFileSync(${JSON.stringify(join(runtime, 'parent-activation-path'))}, 'utf8')]);
  const duplicate = run([...args, '--activation', process.env.OMD_ACTIVATION_PATH, '--activation', process.env.OMD_ACTIVATION_PATH]);
  const explicit = run([...args, '--activation', process.env.OMD_ACTIVATION_PATH]);
  const implicit = run(args);
  const discovery = run(['ref', 'discover-plan', '--json']);
  const motionAudit = run(['ref', 'granularity', '--json']);
  writeFileSync(${JSON.stringify(report)}, JSON.stringify({ wrong, duplicate, explicit, implicit, discovery, motionAudit, task, argv: process.argv.slice(2) }));
  console.log(JSON.stringify({type:'thread.started',thread_id:'isolated-browser-activation'}));
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Transport fixture commands completed.'}}));
  console.log(JSON.stringify({type:'turn.completed'}));
  process.exit(0);
}
const classified = run(['route', 'classify', '--input', '.omd/.cache/route-input.json', '--json']);
if (classified.status !== 0) throw new Error(classified.stderr);
writeFileSync(${JSON.stringify(join(runtime, 'parent-activation-path'))}, process.env.OMD_ACTIVATION_PATH);
const delegated = spawnSync(process.execPath, [process.env.OMD_CODEX_CLI_PATH, 'role', 'run', '--agent', 'omd-scout', '--input', '.omd/task.md', '--json'], {
  cwd: root, encoding: 'utf8', env: process.env,
});
console.error(delegated.stderr);
process.exit(delegated.status ?? 1);
`);
  let result: CodexHostLaunchResult | undefined;
  try {
    result = await runCodexHostExec(['exec', '-C', root, 'Run the capture transport fixture.'], {
      codexBin: codex, packageRoot: ROOT, codexHome,
      installedSkillRoot: join(ROOT, 'dist/codex/skills'), env: process.env,
    });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(readFileSync(report, 'utf8'));
    assert.ok(observed.argv.includes('web_search="live"'), 'a delegated Scout receives its native discovery search capability');
    assert.match(observed.task, /Native reference search policy: live \(omd-discovery-default\)/);
    assert.match(observed.task, /omd-install\.ts.*browser doctor --json/);
    assert.equal(observed.discovery.status, 0, observed.discovery.stderr);
    assert.equal(JSON.parse(observed.discovery.stdout).userUrlsRequired, false);
    assert.equal(JSON.parse(observed.discovery.stdout).motionEvidenceRequired, true);
    assert.notEqual(observed.motionAudit.status, 0);
    assert.ok(JSON.parse(observed.motionAudit.stdout).findings.some((finding: { id: string }) => finding.id === 'REF-CRAFT-UNGATHERED'));
    assert.notEqual(observed.wrong.status, 0, 'a coordinator activation is not the Scout activation');
    assert.notEqual(observed.duplicate.status, 0, 'duplicate activation options are ambiguous');
    for (const name of ['explicit', 'implicit']) {
      const capture = observed[name];
      assert.equal(capture.status, 0, `${name}: ${capture.stderr || capture.stdout}`);
      const body = JSON.parse(capture.stdout);
      assert.ok(body.outcomes.length > 0);
      assert.ok(body.outcomes.every((outcome: { ok: boolean }) => outcome.ok), capture.stdout);
    }
  } finally {
    await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
    if (result) rmSync(result.authoritySocketPath, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
  }
});

test('route reclassification waits for an active owner, preserving its publication and allowing a later change', async () => {
  const root = project('omd-active-route-');
  const runtime = realpathSync(mkdtempSync(join(tmpdir(), 'omd-active-route-runtime-')));
  const codexHome = join(runtime, 'codex-home');
  const report = join(runtime, 'report.json');
  const ready = join(runtime, 'owner-ready');
  const release = join(runtime, 'owner-release');
  mkdirSync(join(codexHome, 'agents'), { recursive: true });
  writeFileSync(join(codexHome, 'agents/omd-framer.toml'), readFileSync(join(ROOT, 'dist/codex/agents/omd-framer.toml')));
  writeFileSync(join(root, '.omd/.cache/route-input.json'), readFileSync(join(ROOT, 'test/fixtures/adaptive-flow/synth-marketing.json')));
  writeFileSync(join(root, '.omd/task.md'), 'Publish the transport fixture frame after the coordinator releases the test barrier.');
  const codex = executable(join(runtime, 'codex-stub'), `
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
const root = ${JSON.stringify(root)};
const run = (args) => spawnSync(process.execPath, [process.env.OMD_CLI_PATH, ...args], { cwd: root, env: process.env, encoding: 'utf8' });
const waitFor = async (path) => {
  const deadline = Date.now() + 10000;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error('test barrier timed out');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};
if (process.env.OMD_NON_PRODUCTION_ROLE === 'omd-framer') {
  readFileSync(0, 'utf8');
  writeFileSync(${JSON.stringify(ready)}, 'ready');
  await waitFor(${JSON.stringify(release)});
  const published = run(['frame', 'set', '--problem', 'A supplied landing page needs an adoption journey.',
    '--reframe', 'Connect the product explanation to installation.', '--why', 'Explicit fixture scope.',
    '--task', 'Understand the product and install it.', '--frequent-action', 'Copy the install command.',
    '--costliest-error', 'Copying the wrong command; recover with selectable exact text.', '--surface', 'marketing']);
  console.log(JSON.stringify({type:'thread.started',thread_id:'isolated-route-quiescence'}));
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:published.stderr || published.stdout}}));
  console.log(JSON.stringify({type:published.status === 0 ? 'turn.completed' : 'turn.failed'}));
  process.exit(published.status ?? 1);
}
const classify = () => run(['route', 'classify', '--input', '.omd/.cache/route-input.json', '--json']);
const first = classify();
if (first.status !== 0) throw new Error(first.stderr);
const before = readFileSync(root + '/.omd/route.json', 'utf8');
const owner = spawn(process.execPath, [process.env.OMD_CODEX_CLI_PATH, 'role', 'run', '--agent', 'omd-framer', '--input', '.omd/task.md', '--json'], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let ownerOutput = ''; let ownerError = '';
owner.stdout.on('data', chunk => { ownerOutput += chunk; });
owner.stderr.on('data', chunk => { ownerError += chunk; });
const ownerDone = new Promise(resolve => owner.on('exit', code => resolve(code)));
await waitFor(${JSON.stringify(ready)});
const changed = JSON.parse(readFileSync(root + '/.omd/.cache/route-input.json', 'utf8'));
changed.taskOutcome.goal += ' Preserve the additional confirmed setup instruction.';
writeFileSync(root + '/.omd/.cache/route-input.json', JSON.stringify(changed));
const denied = classify();
const unchanged = readFileSync(root + '/.omd/route.json', 'utf8') === before;
const inspected = run(['route', 'show', '--json']);
writeFileSync(${JSON.stringify(release)}, 'release');
const ownerStatus = await ownerDone;
const after = classify();
writeFileSync(${JSON.stringify(report)}, JSON.stringify({
  denied: {status: denied.status, stderr: denied.stderr}, unchanged,
  inspected: {status: inspected.status, stderr: inspected.stderr}, ownerStatus, ownerOutput, ownerError,
  after: {status: after.status, stderr: after.stderr},
  changedAfterReturn: readFileSync(root + '/.omd/route.json', 'utf8') !== before,
  framePresent: existsSync(root + '/.omd/frame.md'),
}));
`);
  try {
    const result = await runCodexHostExec(['exec', '-C', root, 'Exercise active route transport'], {
      codexBin: codex, packageRoot: ROOT, codexHome,
      installedSkillRoot: join(ROOT, 'dist/codex/skills'), env: process.env,
    });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(readFileSync(report, 'utf8'));
    assert.notEqual(observed.denied.status, 0);
    assert.match(observed.denied.stderr, /ROUTE_CHANGE_WHILE_OWNER_ACTIVE.*omd-framer/);
    assert.equal(observed.unchanged, true);
    assert.equal(observed.inspected.status, 0, observed.inspected.stderr);
    assert.equal(observed.ownerStatus, 0, observed.ownerError || observed.ownerOutput);
    assert.equal(observed.framePresent, true);
    assert.equal(observed.after.status, 0, observed.after.stderr);
    assert.equal(observed.changedAfterReturn, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
  }
});

test('source-only study receives its exact host leaf and cannot obtain delegated publication authority', async () => {
  const root = project('omd-study-broker-');
  const runtime = realpathSync(mkdtempSync(join(tmpdir(), 'omd-study-broker-runtime-')));
  const codexHome = join(runtime, 'codex-home');
  const report = join(runtime, 'report.json');
  const input = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/adaptive-flow/synth-marketing.json'), 'utf8'));
  input.strategyDecision.roles.push('omd-study');
  input.strategyDecision.executionWaves.unshift({ id: 'study', mode: 'concurrent', roles: ['omd-study'] });
  writeFileSync(join(root, '.omd/.cache/route-input.json'), JSON.stringify(input));
  mkdirSync(join(codexHome, 'agents'), { recursive: true });
  writeFileSync(join(codexHome, 'agents/omd-study.toml'), readFileSync(join(ROOT, 'dist/codex/agents/omd-study.toml')));
  writeFileSync(join(root, '.omd/task.md'), 'Provisional transport test content; render one content relationship. Not a design-quality sample.');
  const codex = executable(join(runtime, 'codex-stub'), `
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = ${JSON.stringify(root)};
const run = (cli, args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, env: process.env, encoding: 'utf8' });
if (process.env.OMD_NON_PRODUCTION_ROLE === 'omd-study') {
  const task = readFileSync(0, 'utf8');
  const noOutput = task.includes('missing-output-scenario');
  const rejected = run(${JSON.stringify(CLI)}, ['route', 'classify', '--input', '.omd/.cache/route-input.json', '--json']);
  const directory = process.env.OMD_STUDY_OUTPUT_DIR;
  if (!noOutput) writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Transport fixture</title><main>Provided content</main>');
  // This stub observes host configuration and IPC, not OS sandbox enforcement or aesthetic quality.
  writeFileSync(${JSON.stringify(report)}, JSON.stringify({ task, directory, args: process.argv.slice(2), rejected: { status: rejected.status, stderr: rejected.stderr } }));
  console.log(JSON.stringify({type:'thread.started',thread_id:'isolated-provisional-study'}));
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:noOutput?'Blocked; no files written.':join(directory,'index.html')}}));
  console.log(JSON.stringify({type:'turn.completed'}));
  process.exit(0);
}
const classified = run(${JSON.stringify(CLI)}, ['route', 'classify', '--input', '.omd/.cache/route-input.json', '--json']);
if (classified.status !== 0) { console.error(classified.stderr); process.exit(1); }
const delegated = run(${JSON.stringify(join(ROOT, 'bin/omd-codex.mjs'))}, ['role', 'run', '--agent', 'omd-study', '--input', '.omd/task.md', '--json']);
const observed = JSON.parse(readFileSync(${JSON.stringify(report)}, 'utf8'));
writeFileSync(join(root, '.omd/task.md'), 'missing-output-scenario: report an unavailable input without producing source.');
const missing = run(${JSON.stringify(join(ROOT, 'bin/omd-codex.mjs'))}, ['role', 'run', '--agent', 'omd-study', '--input', '.omd/task.md', '--json']);
writeFileSync(${JSON.stringify(report)}, JSON.stringify({ ...observed, result: delegated.stdout, error: delegated.stderr,
  missing: {status:missing.status,stdout:missing.stdout,stderr:missing.stderr} }));
process.exit(delegated.status ?? 1);
`);
  let result: CodexHostLaunchResult | undefined;
  try {
    result = await runCodexHostExec(['exec', '-C', root, 'Exercise provisional study transport'], {
      codexBin: codex, packageRoot: ROOT, codexHome,
      installedSkillRoot: join(ROOT, 'dist/codex/skills'), env: process.env,
    });
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(readFileSync(report, 'utf8'));
    const returned = JSON.parse(observed.result);
    assert.equal(returned.result, 'completed', observed.error);
    const missing = JSON.parse(observed.missing.stdout);
    assert.notEqual(observed.missing.status, 0);
    assert.equal(missing.result, 'failed');
    assert.equal(missing.authority.receipt.exitCode, 0);
    assert.equal(missing.authority.receipt.status, 'failed');
    assert.match(missing.failure, /STUDY_ENTRY_MISSING/);
    assert.equal(existsSync(join(root, missing.studyDirectory, 'index.html')), false);
    assert.equal(returned.modelArgumentOmitted, true);
    assert.equal(returned.modelReasoningEffort, 'medium');
    assert.match(returned.studyDirectory, /^\.omd\/\.cache\/studies\/study-[A-Za-z0-9]{6}$/);
    assert.equal(returned.authority.receipt.studyDirectory, returned.studyDirectory);
    assert.equal(observed.directory, join(realpathSync(root), returned.studyDirectory));
    assert.equal(observed.args.filter((value: string) => value === '--add-dir').length, 1);
    assert.equal(observed.args[observed.args.indexOf('--add-dir') + 1], observed.directory);
    assert.ok(observed.args.includes('sandbox_workspace_write.writable_roots=[]'));
    assert.ok(observed.args.includes('sandbox_workspace_write.exclude_slash_tmp=true'));
    assert.notEqual(observed.rejected.status, 0);
    assert.match(observed.rejected.stderr, /guarded project write rejected/);
    assert.match(readFileSync(join(dirname(result.activationPath), 'authority-audit.jsonl'), 'utf8'),
      /source-only study activation cannot authorize delegated project operations/);
    assert.equal(existsSync(join(root, '.omd/frame.md')), false);
    assert.equal(existsSync(join(root, '.omd/copy-deck.md')), false);
    assert.equal(existsSync(join(root, '.omd/composition.md')), false);
    assert.equal(existsSync(join(observed.directory, 'index.html')), true);
    assert.match(observed.task, /provisional source is not approved copy/);
  } finally {
    if (result) rmSync(result.authoritySocketPath, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
  }
});

test('coordinator receives canonical command paths that publish without PATH or symlink guesses', async () => {
  const root = project('omd-codex-command-context-');
  const runtime = mkdtempSync(join(tmpdir(), 'omd-command-context-runtime-'));
  const report = join(runtime, 'report.json');
  const codex = executable(join(runtime, 'codex'), `
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const node = process.env.OMD_NODE_EXECUTABLE;
const cli = process.env.OMD_CLI_PATH;
const ownerCli = process.env.OMD_CODEX_CLI_PATH;
const result = spawnSync(node, [cli, 'route', 'classify', '--input', '.omd/.cache/route-input.json', '--json'], {
  cwd: process.cwd(), encoding: 'utf8', env: process.env,
});
writeFileSync(${JSON.stringify(report)}, JSON.stringify({ node, cli, ownerCli, status: result.status, stderr: result.stderr }));
process.exit(result.status ?? 1);
`);
  try {
    const result = await runCodexHostExec(['exec', '-C', root, 'publish the routed task'], {
      codexBin: codex,
      packageRoot: ROOT,
      codexHome: join(runtime, 'host'),
      installedSkillRoot: join(ROOT, 'dist', 'codex', 'skills'),
      env: { ...process.env, OMD_NODE_EXECUTABLE: '/foreign/node', OMD_CLI_PATH: '/foreign/omd.ts', OMD_CODEX_CLI_PATH: '/foreign/owner.ts' },
    });
    const observed = JSON.parse(readFileSync(report, 'utf8')) as {
      node: string; cli: string; ownerCli: string; status: number; stderr: string;
    };
    assert.equal(result.status, 0, observed.stderr);
    assert.equal(observed.node, process.execPath);
    assert.equal(observed.cli, realpathSync(join(ROOT, 'bin', 'omd.ts')));
    assert.equal(observed.ownerCli, realpathSync(join(ROOT, 'bin', 'omd-codex.ts')));
    assert.equal(existsSync(join(root, '.omd', 'route.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
  }
});

test('authority requests cannot turn a caller-selected digest into a signed payload authorization', () => {
  const payload = Buffer.from('{"trusted":true}\n');
  const payloadSha256 = createHash('sha256').update(payload).digest('hex');
  assert.equal(parseCodexHostPayloadAuthorization({ purpose: 'product-probe-result', payloadSha256 }), undefined);
  assert.equal(parseCodexHostPayloadAuthorization({
    purpose: 'product-probe-result', payloadSha256,
    payloadBase64: Buffer.from('different bytes').toString('base64'),
  }), undefined);
  assert.equal(parseCodexHostPayloadAuthorization({
    purpose: 'not-a-host-purpose', payloadSha256, payloadBase64: payload.toString('base64'),
  }), undefined);
  assert.deepEqual(parseCodexHostPayloadAuthorization({
    purpose: 'product-probe-result', payloadSha256, payloadBase64: payload.toString('base64'),
  }), { purpose: 'product-probe-result', payloadSha256, payloadBase64: payload.toString('base64'), payload });
});

test('a descendant cannot impersonate the CLI by placing its path later in the process command', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const validArgv = [process.execPath, cli, 'route', 'classify', '--json'];
  assert.equal(isExactCanonicalCliInvocation(`${process.execPath} ${cli} route classify --json`, validArgv, cli), true);
  const loader = realpathSync(join(ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs'));
  assert.equal(isExactCanonicalCliInvocation(`${process.execPath} --import ${loader} ${cli} route classify --json`, validArgv, cli), true);
  assert.equal(isExactCanonicalCliInvocation(`${process.execPath} --import /untrusted/hook.mjs ${cli} route classify --json`, validArgv, cli), false);
  assert.equal(isExactCanonicalCliInvocation(`${process.execPath} -e exploit ${cli} route classify --json`, validArgv, cli), false);
  assert.equal(isExactCanonicalCliInvocation(`${process.execPath} /tmp/descendant.js --note ${cli} route classify --json`, validArgv, cli), false);
});

test('canonical long CLI argv survives a truncated process-command observation', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const loader = realpathSync(
    join(ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
  );
  const longFrame = '가'.repeat(12_000);
  const argv = [
    process.execPath,
    cli,
    'frame',
    'set',
    '--reframe',
    longFrame,
  ];
  const full = [
    process.execPath,
    '--import',
    loader,
    cli,
    ...argv.slice(2),
  ].join(' ');
  const observed = full.slice(0, 4_096);

  assert.equal(
    isExactCanonicalCliInvocation(observed, argv, cli),
    true,
  );
  assert.equal(
    isExactCanonicalCliInvocation(
      observed,
      [process.execPath, cli, 'route', 'classify', '--json'],
      cli,
    ),
    false,
  );
});

test('canonical CLI identity tolerates process-display whitespace normalization', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const loader = realpathSync(
    join(ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
  );
  const argv = [
    process.execPath,
    cli,
    'frame',
    'set',
    '--reframe',
    'line one\nline two',
  ];
  const observed = [
    process.execPath,
    '--import',
    loader,
    cli,
    'frame set --reframe line one line two',
  ].join(' ');

  assert.equal(
    isExactCanonicalCliInvocation(observed, argv, cli),
    true,
  );
  assert.equal(
    isExactCanonicalCliInvocation(
      observed,
      [process.execPath, cli, 'route', 'classify', '--json'],
      cli,
    ),
    false,
  );
});

test('the owner CLI may broker only its exact run and repair phases', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const ownerCli = realpathSync(join(ROOT, 'bin', 'omd-codex.ts'));
  assert.equal(
    resolveCodexAuthorityCliPath(ownerCli, [process.execPath, ownerCli, 'owner', 'run'], cli, ownerCli),
    ownerCli,
  );
  assert.equal(
    resolveCodexAuthorityCliPath(ownerCli, [process.execPath, ownerCli, 'owner', 'repair'], cli, ownerCli),
    ownerCli,
  );
  assert.equal(
    resolveCodexAuthorityCliPath(ownerCli, [process.execPath, ownerCli, 'route', 'show'], cli, ownerCli),
    undefined,
  );
  assert.equal(
    resolveCodexAuthorityCliPath('/tmp/foreign.ts', [process.execPath, '/tmp/foreign.ts', 'owner', 'run'], cli, ownerCli),
    undefined,
  );
  assert.equal(
    isCodexOwnerAuthorityRequest({
      schema: 'omd-codex-authority-request-v1',
      cliPath: ownerCli,
      argv: [process.execPath, ownerCli, 'owner', 'run'],
    }, ownerCli),
    true,
  );
  assert.equal(
    isCodexOwnerAuthorityRequest({
      schema: 'omd-codex-authority-request-v1',
      cliPath: ownerCli,
      argv: [process.execPath, ownerCli, 'route', 'show'],
    }, ownerCli),
    false,
  );
});

test('workflow slice authority transfers only after a persisted completed owner result', () => {
  assert.equal(
    workflowProductionSliceAuthorityError(true, false, ['owner', 'run']),
    undefined,
  );
  assert.equal(
    workflowProductionSliceAuthorityError(false, true, ['workflow', 'slice']),
    undefined,
  );
  assert.match(
    workflowProductionSliceAuthorityError(false, false, ['workflow', 'slice']) ?? '',
    /persisted completed result/,
  );
  assert.match(
    workflowProductionSliceAuthorityError(false, true, ['workflow', 'check-slice']) ?? '',
    /persisted completed result/,
  );
  assert.match(
    workflowProductionSliceAuthorityError(false, true, ['route', 'classify']) ?? '',
    /persisted completed result/,
  );
});

test('repair-owner payload authority is exact, producer-bound, and one-use', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const trustedSha256 = 'a'.repeat(64);
  const trusted = new Set([trustedSha256]);
  assert.match(
    productionOwnerRepairPayloadAuthorizationError(
      [process.execPath, cli, 'route', 'classify'], trustedSha256, trusted,
    ) ?? '',
    /lifecycle repair phase/,
  );
  assert.equal(trusted.has(trustedSha256), true, 'a wrong phase cannot consume the producer result');
  assert.match(
    productionOwnerRepairPayloadAuthorizationError(
      [process.execPath, cli, 'lifecycle', 'repair'], 'b'.repeat(64), trusted,
    ) ?? '',
    /exact persisted repair-owner result/,
  );
  assert.equal(
    productionOwnerRepairPayloadAuthorizationError(
      [process.execPath, cli, 'lifecycle', 'repair', '--owner-receipt', '/host/result.json'],
      trustedSha256,
      trusted,
    ),
    undefined,
  );
  assert.equal(trusted.has(trustedSha256), false);
  assert.match(
    productionOwnerRepairPayloadAuthorizationError(
      [process.execPath, cli, 'lifecycle', 'repair'], trustedSha256, trusted,
    ) ?? '',
    /exact persisted repair-owner result/,
  );
});

test('browser-owning roles broker only canonical browser CLI operations', () => {
  assert.equal(codexBrowserRoleFromEnvironment({ OMD_NON_PRODUCTION_ROLE: 'omd-typesetter' }), 'omd-typesetter');
  assert.equal(codexBrowserRoleFromEnvironment({ OMD_NON_PRODUCTION_ROLE: 'omd-writer' }), undefined);
  assert.equal(isBrokeredBrowserCliOperation('omd-scout', ['ir', 'https://example.com']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-scout', ['render', 'https://example.com', '-o', '.omd/.cache/reference-page.png']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-scout', ['ref', 'add-batch', '.omd/.cache/refs.json']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-scout', ['craft-capture', 'https://example.com']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-typesetter', ['ir', 'file:///tmp/type-proof.html', '--out', '.omd/.cache/type-proof/desktop.json']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-typesetter', ['render', 'file:///tmp/type-proof.html', '-o', '.omd/.cache/type-proof/desktop.png']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-typesetter', ['probe', 'http://127.0.0.1:4173']), false);
  assert.equal(isBrokeredBrowserCliOperation('omd-typesetter', ['ref', 'add', 'https://example.com']), false);
  assert.equal(isBrokeredBrowserCliOperation('omd-typesetter', ['craft-capture', 'https://example.com']), false);
  assert.equal(isBrokeredBrowserCliOperation('omd-eye', ['render', 'http://127.0.0.1:4173']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-hand', ['probe', 'http://127.0.0.1:4173']), true);
  assert.equal(isBrokeredBrowserCliOperation('omd-writer', ['render', 'http://127.0.0.1:4173']), false);
  assert.equal(isBrokeredBrowserCliOperation('omd-scout', ['route', 'show']), false);
  assert.equal(isBrokeredBrowserCliOperation('omd-scout', ['lifecycle', 'repair']), false);
  assert.equal(isBrokeredBrowserCliOperation('omd-hand', ['ref', 'board']), false);
});

test('completeness publication may revalidate exact adaptive route authority', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'complete', 'publish', '--input', '.omd/completeness-input.json'],
      'adaptive-route-authority',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'finalize'],
      'adaptive-route-authority',
    ),
    undefined,
  );
});

test('automatic discovery authorizes only its exact route-consuming reference commands', () => {
  const cli = realpathSync(join(ROOT, 'bin/omd.ts'));
  for (const operation of [['ref', 'discover-plan'], ['ref', 'granularity']]) {
    assert.equal(codexPayloadAuthorizationPhaseError([process.execPath, cli, ...operation], 'adaptive-route-authority'), undefined);
  }
  for (const operation of [['ref', 'list'], ['ref', 'show'], ['ref', 'board']]) {
    assert.match(codexPayloadAuthorizationPhaseError([process.execPath, cli, ...operation], 'adaptive-route-authority') ?? '', /requires an exact trusted host-observed CLI phase/);
  }
});

test('only locale commands that consume the current adaptive route may revalidate its authority', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  for (const operation of [
    ['locale', 'profile', '--publish'],
    ['locale', 'profile-check'],
    ['locale', 'source-capture'],
    ['locale', 'source-stability'],
  ] as const) {
    assert.equal(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, ...operation],
        'adaptive-route-authority',
      ),
      undefined,
      `${operation.join(' ')} consumes the current adaptive route`,
    );
  }
  for (const operation of [
    ['locale', 'plan'],
    ['locale', 'check'],
    ['locale', 'profile'],
  ] as const) {
    assert.match(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, ...operation],
        'adaptive-route-authority',
      ) ?? '',
      /requires an exact trusted host-observed CLI phase/,
      `${operation.join(' ')} must not become an adaptive-route signing oracle`,
    );
  }
});

test('only intent-consuming publication phases may authorize the current intent ledger', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  for (const operation of [
    ['intent', 'append'],
    ['art-direction', 'check'],
    ['evidence', 'v2', 'finalize'],
    ['evidence', 'v2', 'check'],
    ['completion', 'preflight'],
    ['lifecycle', 'finalize'],
  ] as const) {
    assert.equal(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, ...operation],
        'current-intent-ledger',
      ),
      undefined,
      `${operation.join(' ')} consumes the current intent ledger`,
    );
  }
  for (const operation of [
    ['route', 'classify'],
    ['art-direction', 'check-input'],
    ['review', 'publish'],
  ] as const) {
    assert.match(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, ...operation],
        'current-intent-ledger',
      ) ?? '',
      /requires an exact trusted host-observed CLI phase/,
      `${operation.join(' ')} must not act as a payload-signing oracle`,
    );
  }
});

test('only the canonical art-direction check may authorize its closed evaluator payloads', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  for (const purpose of [
    'evaluator-assessment',
    'evaluator-result',
    'approved-motion-recipe',
  ] as const) {
    assert.equal(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, 'art-direction', 'check', '--input', '/tmp/direction.json'],
        purpose,
      ),
      undefined,
      `art-direction check consumes ${purpose}`,
    );
    for (const operation of [
      ['art-direction', 'check-input'],
      ['deliberate', 'preserve'],
      ['route', 'classify'],
    ] as const) {
      assert.match(
        codexPayloadAuthorizationPhaseError(
          [process.execPath, cli, ...operation],
          purpose,
        ) ?? '',
        /requires an exact trusted host-observed CLI phase/,
        `${operation.join(' ')} must not authorize ${purpose}`,
      );
    }
  }
});

test('AI asset decision authority is limited to decision publication and route consumers', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  for (const operation of [['decision'], ['route', 'classify'], ['route', 'show'], ['brief', 'production']]) {
    assert.equal(codexPayloadAuthorizationPhaseError([process.execPath, cli, ...operation], 'ai-asset-decision'), undefined);
  }
  for (const operation of [['ref', 'list'], ['render'], ['review', 'publish'], ['role', 'run']]) {
    assert.match(codexPayloadAuthorizationPhaseError([process.execPath, cli, ...operation], 'ai-asset-decision') ?? '', /exact trusted host-observed CLI phase/);
  }
});

test('an imported script cannot seed the issuing host AI decision cache', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { recordCodexHostAiDecision } from ${JSON.stringify(new URL('../core/runtime/activation.ts', import.meta.url).href)};
    recordCodexHostAiDecision({}, process.cwd(), Buffer.from('forged'));
  `], { encoding: 'utf8', cwd: ROOT });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AI decision observation belongs to the issuing Codex host/);
});

test('native broker commits an AI decision and revalidates its current route without accepting changed provenance', async () => {
  const root = project('omd-codex-ai-decision-');
  const report = join(root, '..', `codex-ai-report-${Date.now()}.json`);
  const codexHome = mkdtempSync(join(tmpdir(), 'omd-ai-host-home-'));
  mkdirSync(join(codexHome, 'agents'), { recursive: true });
  writeFileSync(join(codexHome, 'agents/omd-writer.toml'), readFileSync(join(ROOT, 'dist/codex/agents/omd-writer.toml')));
  writeFileSync(join(codexHome, 'agents/omd-hand.toml'), readFileSync(join(ROOT, 'dist/codex/agents/omd-hand.toml')));
  writeFileSync(join(root, '.omd/task.md'), 'Read the route; do not author an AI asset decision.');
  const codex = executable(join(root, '..', `codex-ai-stub-${Date.now()}.mjs`), `
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const root = process.env.OMD_TEST_PROJECT;
const run = (args) => {
  const result = spawnSync(process.execPath, [process.env.OMD_TEST_CLI, ...args, '--json'], { cwd: root, encoding: 'utf8', env: process.env });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};
if (process.env.OMD_NON_PRODUCTION_ROLE || process.env.OMD_PRODUCTION_OWNER_ROLE) {
  readFileSync(0, 'utf8');
  const show = run(['route', 'show']);
  const commit = run(['decision', 'Unauthorized role decision', '--why', 'Forbidden author', '--ai-asset-id', 'role-art', '--prompt', 'Role-authored art', '--provider', 'host-imagegen']);
  const owner = process.env.OMD_PRODUCTION_OWNER_ROLE === 'omd-hand';
  if (owner && show.status === 0) {
    mkdirSync(root + '/src/copy', { recursive: true });
    writeFileSync(root + '/src/copy/index.js', 'export const label = "Approved sentence";\\n');
  }
  writeFileSync(${JSON.stringify(report)} + (owner ? '.owner' : '.role'), JSON.stringify({ show, commit }));
  console.log(JSON.stringify({type:'thread.started',thread_id:'ai-route-read'}));
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Read the authorized route; rejected decision publication; returned owned changes.'}}));
  console.log(JSON.stringify({type:'turn.completed'}));
  process.exit(show.status ?? 1);
}
const commit = run(['decision', 'Original abstract illustration', '--why', 'Test native image provenance publication', '--ai-asset-id', 'routine-art', '--prompt', 'Original abstract routine illustration', '--provider', 'host-imagegen']);
const results = { commit };
if (commit.status === 0) {
  results.assetSchema = run(['schema', 'route-ai-asset']);
  if (results.assetSchema.status !== 0) throw new Error(results.assetSchema.stderr);
  const asset = JSON.parse(results.assetSchema.stdout).skeleton;
  const reference = JSON.parse(commit.stdout).aiAssetDecision;
  const path = root + '/.omd/.cache/route-input.json';
  const input = JSON.parse(readFileSync(path, 'utf8'));
  const strategy = input.strategyDecision;
  strategy.methods.push('ai-shipped-asset');
  strategy.skips = strategy.skips.filter((entry) => entry.id !== 'ai-shipped-asset');
  Object.assign(asset, { assetId: 'routine-art', zone: 'abstract', prompt: 'Original abstract routine illustration', provider: 'host-imagegen', decision: reference, currentDecision: reference });
  strategy.aiAssets = [asset];
  strategy.attributionCategories.push('graphics');
  writeFileSync(path, JSON.stringify(input));
  results.classify = run(['route', 'classify', '--input', path]);
  results.show = run(['route', 'show']);
  const delegated = spawnSync(process.execPath, [process.env.OMD_CODEX_CLI_PATH, 'role', 'run', '--agent', 'omd-writer', '--input', '.omd/task.md', '--json'], { cwd: root, env: process.env, encoding: 'utf8' });
  results.delegated = { status: delegated.status, stdout: delegated.stdout, stderr: delegated.stderr };
  const owner = spawnSync(process.execPath, [process.env.OMD_CODEX_CLI_PATH, 'owner', 'run', '--agent', 'omd-hand', '--input', '.omd/task.md', '--json'], { cwd: root, env: process.env, encoding: 'utf8' });
  results.owner = { status: owner.status, stdout: owner.stdout, stderr: owner.stderr };
  strategy.aiAssets[0].prompt = 'Different uncommitted prompt';
  writeFileSync(path, JSON.stringify(input));
  results.changedPrompt = run(['route', 'classify', '--input', path]);
  strategy.aiAssets[0].prompt = 'Original abstract routine illustration';
  strategy.aiAssets[0].provider = 'different-provider';
  writeFileSync(path, JSON.stringify(input));
  results.changedProvider = run(['route', 'classify', '--input', path]);
}
writeFileSync(${JSON.stringify(report)}, JSON.stringify(results));
process.exit(commit.status ?? 1);
`);
  try {
    const launched = await runCodexHostExec(['exec', '-C', root, '--skip-git-repo-check', 'Test the AI decision and delegated route read'], {
      codexBin: codex, packageRoot: ROOT, codexHome,
      installedSkillRoot: join(ROOT, 'dist/codex/skills'),
      env: { ...process.env, OMD_TEST_PROJECT: root, OMD_TEST_CLI: CLI },
    });
    assert.equal(launched.status, 0, existsSync(report) ? readFileSync(report, 'utf8') : launched.stderr);
    const results = JSON.parse(readFileSync(report, 'utf8'));
    for (const key of ['commit', 'assetSchema', 'classify', 'show', 'delegated', 'owner']) assert.equal(results[key]?.status, 0, `${key}: ${results[key]?.stderr || results[key]?.stdout}`);
    const role = JSON.parse(readFileSync(report + '.role', 'utf8'));
    assert.equal(role.show.status, 0, role.show.stderr);
    assert.notEqual(role.commit.status, 0, 'a delegated role must not author AI asset decisions');
    const owner = JSON.parse(readFileSync(report + '.owner', 'utf8'));
    assert.equal(owner.show.status, 0, owner.show.stderr);
    assert.notEqual(owner.commit.status, 0, 'a production owner must not author AI asset decisions');
    for (const key of ['changedPrompt', 'changedProvider']) {
      assert.notEqual(results[key]?.status, 0, JSON.stringify(results));
      assert.match(results[key].stderr, /AI_ASSET_DECISION_INVALID/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(report, { force: true });
    rmSync(report + '.role', { force: true });
    rmSync(report + '.owner', { force: true });
    rmSync(codexHome, { recursive: true, force: true });
    rmSync(codex, { force: true });
  }
});

test('the exact typography applicability phase authorizes its canonical DOM probe payload', async () => {
  const root = project('omd-codex-typography-probe-');
  const report = join(root, '..', `codex-typography-report-${Date.now()}.json`);
  const codex = typographyStub(join(root, '..', `codex-typography-stub-${Date.now()}.mjs`), report);
  writeFileSync(join(root, '.omd', 'functional-requirements.json'), JSON.stringify({
    schema: 'functional-requirements-v1',
    requirements: [{ id: 'R-1', kind: 'content', statement: 'Show the measured heading', label: 'Measured heading' }],
  }));
  writeFileSync(join(root, '.omd', '.cache', 'rendered-ir.json'), JSON.stringify({
    meta: { source: 'dom', url: 'file://fixture/' },
    nodes: [{
      id: 'heading',
      name: 'h1',
      type: 'TEXT',
      path: 'body > h1',
      parent: null,
      box: { x: 0, y: 0, w: 320, h: 48 },
      children: [],
      text: '측정된 제목',
    }],
  }));
  try {
    const launched = await launch(root, codex, report);
    assert.equal(launched.status, 0, existsSync(report) ? readFileSync(report, 'utf8') : launched.stderr);
    const result = JSON.parse(readFileSync(report, 'utf8')) as { status: number; stdout: string; stderr: string };
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /typography-applicability-v2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(report, { force: true });
    rmSync(codex, { force: true });
  }
});

test('a forged all-pass payload cannot be relabeled into authority from another CLI phase', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const forged = Buffer.from('{"hardFloors":{"behavior":"pass","access":"pass","safety":"pass"}}\n');
  const payloadSha256 = createHash('sha256').update(forged).digest('hex');
  assert.ok(parseCodexHostPayloadAuthorization({
    purpose: 'final-reviewer-lane', payloadSha256, payloadBase64: forged.toString('base64'),
  }), 'exact bytes parse before operation authority is considered');
  assert.match(
    codexPayloadAuthorizationPhaseError([process.execPath, cli, 'route', 'classify'], 'final-reviewer-lane') ?? '',
    /requires an exact trusted host-observed CLI phase/,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'finalize'],
      'final-reviewer-lane',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'check'],
      'final-reviewer-lane',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'completion', 'preflight'],
      'final-reviewer-lane',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'finalize'],
      'final-evidence-manifest',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'check'],
      'final-evidence-manifest',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'completion', 'preflight'],
      'final-evidence-manifest',
    ),
    undefined,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'evidence', 'v2', 'finalize'],
      'final-evidence-manifest',
    ),
    undefined,
  );
  assert.match(
    codexPayloadAuthorizationPhaseError(
      [process.execPath, cli, 'review', 'check'],
      'final-evidence-manifest',
    ) ?? '',
    /requires an exact trusted host-observed CLI phase/,
  );
  assert.equal(
    codexPayloadAuthorizationPhaseError([process.execPath, cli, 'review', 'publish'], 'final-reviewer-lane'),
    undefined,
  );
  assert.match(
    codexPayloadAuthorizationPhaseError([process.execPath, cli, 'review', 'check'], 'final-reviewer-lane') ?? '',
    /requires an exact trusted host-observed CLI phase/,
  );
  for (const phase of [['status'], ['resume'], ['require', 'frame']] as const) {
    assert.equal(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, 'stage', ...phase],
        'adaptive-route-authority',
      ),
      undefined,
    );
  }
  for (const operation of [
    ['brief', 'frame'],
    ['composition', '--check'],
    ['deliberate', 'check'],
    ['completion', 'preflight'],
    ['workflow', 'show'],
    ['evidence', 'v2', 'finalize'],
    ['repair', 'publish'],
    ['source', '--seal'],
    ['lifecycle', 'run'],
    ['owner', 'run'],
  ] as const) {
    assert.equal(
      codexPayloadAuthorizationPhaseError(
        [process.execPath, cli, ...operation],
        'adaptive-route-authority',
      ),
      undefined,
    );
  }
});

test('final evidence verification may reauthorize only a typed trusted browser receipt', () => {
  const cli = realpathSync(join(ROOT, 'bin', 'omd.ts'));
  const finalize = [process.execPath, cli, 'evidence', 'v2', 'finalize'];
  const check = [process.execPath, cli, 'evidence', 'v2', 'check'];
  const preflight = [process.execPath, cli, 'completion', 'preflight'];
  assert.equal(
    isCodexFinalEvidenceContinuationPayload(
      finalize,
      'product-probe-result',
      { schema: 'trusted-browser-receipt-v1' },
    ),
    true,
  );
  assert.equal(
    isCodexFinalEvidenceContinuationPayload(
      check,
      'product-probe-result',
      { schema: 'trusted-browser-receipt-v1' },
    ),
    true,
  );
  assert.equal(
    isCodexFinalEvidenceContinuationPayload(
      preflight,
      'product-probe-result',
      { schema: 'trusted-browser-receipt-v1' },
    ),
    true,
  );
  assert.equal(
    isCodexFinalEvidenceContinuationPayload(
      finalize,
      'product-probe-result',
      { schema: 'trusted-lifecycle-manifest-v1' },
    ),
    false,
  );
});

test('Codex resolution ignores project-controlled PATH and returns a canonical regular executable', () => {
  const root = project('omd-codex-path-substitution-');
  const projectBin = join(root, 'bin');
  const trustedBin = mkdtempSync(join(tmpdir(), 'omd-trusted-codex-bin-'));
  mkdirSync(projectBin);
  executable(join(projectBin, 'codex'), 'process.exit(91);');
  const trustedTarget = executable(join(trustedBin, 'codex-target'), 'process.exit(0);');
  symlinkSync(trustedTarget, join(trustedBin, 'codex'));
  try {
    const resolved = resolveCodexHostExecutable('codex', { ...process.env, PATH: `${projectBin}:${trustedBin}` }, root);
    assert.equal(resolved.path, realpathSync(trustedTarget));
    assert.equal(statSync(resolved.path).isFile(), true);
    assert.equal(resolved.sha256, createHash('sha256').update(readFileSync(trustedTarget)).digest('hex'));
    assert.throws(() => resolveCodexHostExecutable('codex', { ...process.env, PATH: projectBin }, root), /trusted Codex executable/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(trustedBin, { recursive: true, force: true });
  }
});

test('RED hypothesis 2: a greenfield Codex exec receives host-owned receipts and reaches route publication', async () => {
  const root = project('omd-codex-greenfield-');
  const report = join(root, '..', `codex-report-${Date.now()}.json`);
  const codex = routeStub(join(root, '..', `codex-stub-${Date.now()}`), report);
  try {
    const result = await launch(root, codex, report, ['--ephemeral']);
    const audit = join(dirname(result.activationPath), 'authority-audit.jsonl');
    assert.equal(result.status, 0, [
      existsSync(report) ? readFileSync(report, 'utf8') : result.stderr,
      existsSync(audit) ? readFileSync(audit, 'utf8') : '',
    ].join('\n'));
    const observed = JSON.parse(readFileSync(report, 'utf8')) as {
      argv: string[]; status: number; stderr: string; activation: string; loaded: string;
      activationMode: number; loadedMode: number;
    };
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(observed.argv[0], 'exec');
    assert.equal(observed.argv[1], '--add-dir');
    assert.ok(observed.argv[2]?.startsWith(tmpdir()), 'launcher adds only its private exact-authority channel');
    assert.deepEqual(observed.argv.slice(3), ['-C', root, '--skip-git-repo-check', '--ephemeral', '$omd-ultradesign build the requested interface']);
    assert.equal(observed.argv.includes('--model'), false, 'launcher must preserve user/model config rather than select a model');
    assert.equal(observed.activationMode, 0o400);
    assert.equal(observed.loadedMode, 0o400);
    assert.equal(realpathSync(observed.activation).startsWith(`${realpathSync(root)}${process.platform === 'win32' ? '\\' : '/'}`), false);
    assert.equal(realpathSync(observed.loaded).startsWith(`${realpathSync(root)}${process.platform === 'win32' ? '\\' : '/'}`), false);
    assert.equal(existsSync(join(root, '.omd', 'route.json')), true);
    assert.equal(existsSync(join(root, '.omd', 'receipts', 'activation.json')), true, 'finalization activation evidence is retained');
    assert.equal(existsSync(result.authoritySocketPath), false, 'live authority socket is removed after Codex exits');
    assert.equal(existsSync(result.activationPath), true, 'non-secret finalization evidence is retained');
    assert.equal(existsSync(result.loadedSkillReceiptPath), true, 'loaded-skill evidence is retained');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(report, { force: true });
    rmSync(codex, { force: true });
  }
});

test('RED hypothesis 3: copied and forged project-owned activation files cannot obtain authority', async () => {
  const root = project('omd-codex-copy-reject-');
  const report = join(root, '..', `codex-copy-report-${Date.now()}.json`);
  const codex = routeStub(join(root, '..', `codex-copy-stub-${Date.now()}`), report, `
import { copyFileSync, readFileSync } from 'node:fs';
const copied = root + '/copied-activation.json';
copyFileSync(process.env.OMD_ACTIVATION_PATH, copied);
const value = JSON.parse(readFileSync(copied, 'utf8'));
value.current.briefSha256 = 'f'.repeat(64);
writeFileSync(root + '/forged-activation.json', JSON.stringify(value));
for (const candidate of [copied, root + '/forged-activation.json']) {
  const rejected = spawnSync(process.execPath, [cli, 'config', 'set', 'checkpoint', 'both', '--activation', candidate], { cwd: root, encoding: 'utf8', env: process.env });
  if (rejected.status === 0) process.exit(80);
}
`);
  try {
    const result = await launch(root, codex, report);
    assert.equal(result.status, 0, existsSync(report) ? readFileSync(report, 'utf8') : result.stderr);
    assert.equal(existsSync(join(root, '.omd', 'config.json')), false);
    assert.equal(existsSync(join(root, '.omd', 'route.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(report, { force: true });
    rmSync(codex, { force: true });
  }
});

test('Codex activation rejects cross-project use and becomes stale when its host launcher exits', async () => {
  const first = project('omd-codex-first-');
  const second = project('omd-codex-second-');
  const report = join(first, '..', `codex-cross-report-${Date.now()}.json`);
  const staleEnvPath = join(first, '..', `codex-stale-env-${Date.now()}.json`);
  const codex = executable(join(first, '..', `codex-cross-stub-${Date.now()}`), `
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const cli = process.env.OMD_TEST_CLI;
const first = process.env.OMD_TEST_PROJECT;
const second = process.env.OMD_TEST_SECOND;
const cross = spawnSync(process.execPath, [cli, 'config', 'set', 'checkpoint', 'both'], { cwd: second, encoding: 'utf8', env: process.env });
writeFileSync(${JSON.stringify(staleEnvPath)}, JSON.stringify({ activation: process.env.OMD_ACTIVATION_PATH, loaded: process.env.OMD_CODEX_LOADED_SKILL_RECEIPT_PATH, socket: process.env.OMD_CODEX_AUTHORITY_SOCKET, response: process.env.OMD_CODEX_AUTHORITY_RESPONSE_DIR, publicKey: process.env.OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH, grant: process.env.OMD_CODEX_AUTHORITY_GRANT_PATH }));
writeFileSync(${JSON.stringify(report)}, JSON.stringify({ crossStatus: cross.status, crossStderr: cross.stderr }));
process.exit(cross.status === 0 ? 81 : 0);
`);
  try {
    const result = await runCodexHostExec(['exec', '-C', first, 'cross-project check'], {
      codexBin: codex, packageRoot: ROOT, codexHome: join(first, '..', `codex-home-${Date.now()}`),
      installedSkillRoot: join(ROOT, 'dist', 'codex', 'skills'),
      env: { ...process.env, OMD_TEST_PROJECT: first, OMD_TEST_SECOND: second, OMD_TEST_CLI: CLI },
      receiptRetentionMs: 60_000,
    });
    assert.equal(result.status, 0, result.stderr);
    const cross = JSON.parse(readFileSync(report, 'utf8')) as { crossStatus: number; crossStderr: string };
    assert.notEqual(cross.crossStatus, 0, cross.crossStderr);
    assert.equal(existsSync(join(second, '.omd', 'config.json')), false);

    const stale = JSON.parse(readFileSync(staleEnvPath, 'utf8')) as Record<string, string>;
    const staleRun = spawnSync(process.execPath, [CLI, 'config', 'set', 'checkpoint', 'both'], {
      cwd: first, encoding: 'utf8', env: {
        ...process.env,
        OMD_ACTIVATION_PATH: stale.activation,
        OMD_CODEX_LOADED_SKILL_RECEIPT_PATH: stale.loaded,
        OMD_CODEX_AUTHORITY_SOCKET: stale.socket,
        OMD_CODEX_AUTHORITY_RESPONSE_DIR: stale.response,
        OMD_CODEX_AUTHORITY_PUBLIC_KEY_PATH: stale.publicKey,
        OMD_CODEX_AUTHORITY_GRANT_PATH: stale.grant,
      },
    });
    assert.notEqual(staleRun.status, 0, 'retained receipts must not remain live authority after launcher exit');
    assert.equal(existsSync(join(first, '.omd', 'config.json')), false);
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
    rmSync(report, { force: true });
    rmSync(staleEnvPath, { force: true });
    rmSync(codex, { force: true });
  }
});

test('the package and installer expose the host launcher while preserving the historical bins', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { bin: Record<string, string> };
  assert.equal(manifest.bin.omd, './bin/omd.mjs');
  assert.equal(manifest.bin['oh-my-design'], './bin/omd-install.mjs');
  assert.equal(manifest.bin['omd-codex'], './bin/omd-codex.mjs');
  assert.equal(existsSync(join(ROOT, 'bin', 'omd-codex.mjs')), true);
  assert.ok((statSync(join(ROOT, 'bin', 'omd-codex.mjs')).mode & 0o111) !== 0);
});
