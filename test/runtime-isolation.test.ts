import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createReviewerMcpAdapter } from '../adapters/reviewer-mcp.ts';
import { ACTIVATION_CONTEXT_SCHEMA_VERSION, validateActivationContext, type ActivationContext } from '../core/runtime/activation.ts';
import { createReviewerEvidenceProxy, MAX_INLINE_EVIDENCE_BYTES, ReviewerIsolationError } from '../core/runtime/evidence-proxy.ts';
import { requireReviewerIsolationInvocation, type ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { assertProjectRunMutationInventory, inventoryProjectRunMutations } from '../core/runtime/project-write-inventory.ts';
import { ProjectWriteError, writeProjectFile } from '../core/runtime/project-write.ts';

const hash = (value: string): string => value.repeat(64);

function invocation(overrides: Partial<ActivationContext> = {}): ProjectRunInvocation {
  const activation: ActivationContext = {
    schemaVersion: ACTIVATION_CONTEXT_SCHEMA_VERSION,
    buildSha256: hash('a'),
    loadedSkillSha256: hash('b'),
    briefSha256: hash('c'),
    hostCapability: {
      host: 'benchmark',
    },
    ...overrides,
  };
  return { activation, current: { buildSha256: hash('a'), loadedSkillSha256: hash('b'), briefSha256: hash('c') } };
}
type LocalCliReport = {
  readonly activation: ActivationContext;
  readonly cliPath: string;
  readonly guardedWrite?: string;
  readonly observation?: string;
  readonly arbitraryExternalRejected?: boolean;
  readonly nestedExternalRejected?: boolean;
  readonly overwriteRejected?: boolean;
  readonly rootEscapeRejected?: boolean;
  readonly serializedRejected?: boolean;
};

function executeLocalCli(projectRoot: string, argv: readonly string[]): LocalCliReport {
  const canonicalProjectRoot = realpathSync(projectRoot);
  const entrypoint = join(canonicalProjectRoot, 'local-cli-entry.ts');
  const activationModule = new URL('../core/runtime/activation.ts', import.meta.url).href;
  const projectWriteModule = new URL('../core/runtime/project-write.ts', import.meta.url).href;
  writeFileSync(entrypoint, `
import { createLocalCliInvocation } from ${JSON.stringify(activationModule)};
import {
  ProjectWriteError,
  createProjectWriteAdapter,
  writeExternalObservationFile,
  writeProjectFile,
} from ${JSON.stringify(projectWriteModule)};
import { join } from 'node:path';

const projectRoot = process.argv[2];
const invocation = createLocalCliInvocation({
  cliPath: process.argv[1],
  argv: process.argv.slice(2),
  brief: { command: process.argv.slice(3) },
});
const report = {
  activation: invocation.activation,
  cliPath: process.argv[1],
};
if (process.argv[3] === 'guarded') {
  writeProjectFile({ projectRoot, relativePath: 'allowed.txt', content: 'yes', invocation });
  const adapter = createProjectWriteAdapter(projectRoot, invocation);
  adapter.mkdir('.omd/proofs');
  adapter.write('.omd/proofs/adapter.txt', 'guarded');
  const observation = join(projectRoot, '..', '.omd-observations', 'render', 'proof.txt');
  writeExternalObservationFile({ projectRoot, absolutePath: observation, content: 'render proof', invocation, kind: 'render' });
  let arbitraryExternalRejected = false;
  try {
    writeExternalObservationFile({ projectRoot, absolutePath: join(projectRoot, '..', 'arbitrary.txt'), content: 'blocked', invocation, kind: 'render' });
  } catch (error) {
    arbitraryExternalRejected = error instanceof ProjectWriteError;
  }
  const nestedObservation = join(projectRoot, '..', '.omd-observations', 'render', 'nested', 'proof.txt');
  let nestedExternalRejected = false;
  try {
    writeExternalObservationFile({ projectRoot, absolutePath: nestedObservation, content: 'blocked', invocation, kind: 'render' });
  } catch (error) {
    nestedExternalRejected = error instanceof ProjectWriteError;
  }
  let overwriteRejected = false;
  try {
    writeExternalObservationFile({ projectRoot, absolutePath: observation, content: 'blocked', invocation, kind: 'render' });
  } catch (error) {
    overwriteRejected = error instanceof ProjectWriteError;
  }
  let rootEscapeRejected = false;
  try {
    writeProjectFile({ projectRoot, relativePath: '../escape.txt', content: 'blocked', invocation });
  } catch (error) {
    rootEscapeRejected = error instanceof ProjectWriteError;
  }
  Object.assign(report, { guardedWrite: join(projectRoot, 'allowed.txt'), observation, arbitraryExternalRejected, nestedExternalRejected, overwriteRejected, rootEscapeRejected });
}
if (process.argv[3] === 'serialized') {
  const reconstructed = JSON.parse(JSON.stringify(invocation));
  let serializedRejected = false;
  try {
    createProjectWriteAdapter(projectRoot, reconstructed);
  } catch (error) {
    serializedRejected = error instanceof ProjectWriteError;
  }
  Object.assign(report, { serializedRejected });
}
process.stdout.write(JSON.stringify(report));
`);
  const result = spawnSync(process.execPath, [entrypoint, canonicalProjectRoot, ...argv], {
    cwd: canonicalProjectRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as LocalCliReport;
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value !== 'object') throw new Error('receipt value must be JSON-compatible');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

type HostCliResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

function executePipeHostReceipt(projectRoot: string, args: readonly string[], receipt: object): Promise<HostCliResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      env: { ...process.env, OMD_HOST_PROJECT_WRITE_FD: '3' },
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    assert.equal(child.stdio.length, 4, 'host child must expose four stdio channels');
    const stdoutChannel = child.stdout;
    const stderrChannel = child.stderr;
    const receiptChannel = child.stdio[3];
    assert.ok(stdoutChannel, 'host stdout pipe is unavailable');
    assert.ok(stderrChannel, 'host stderr pipe is unavailable');

    let stdout = '';
    let stderr = '';
    stdoutChannel.on('data', (chunk: Buffer) => { stdout += chunk; });
    stderrChannel.on('data', (chunk: Buffer) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status) => resolveResult({ status, stdout, stderr }));
    if (receiptChannel === undefined || receiptChannel === null || !('end' in receiptChannel)) {
      child.kill();
      reject(new Error('host receipt pipe is unavailable'));
      return;
    }
    receiptChannel.end(JSON.stringify(receipt));
  });
}

function executeHostIssuedCli(
  projectRoot: string,
  nonce: string,
  receiptOverrides: object = {},
  argv = ['config', 'set', 'checkpoint', 'both'],
  receiptArgv = argv,
) {
  const binPath = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
  const activation: ActivationContext = {
    schemaVersion: ACTIVATION_CONTEXT_SCHEMA_VERSION,
    buildSha256: hash('a'),
    loadedSkillSha256: hash('b'),
    briefSha256: hash('c'),
    hostCapability: { host: 'claude' },
  };
  const args = [binPath, ...argv, '--activation', 'activation.json'];
  const receiptArgs = [binPath, ...receiptArgv, '--activation', 'activation.json'];
  writeFileSync(join(projectRoot, 'activation.json'), JSON.stringify({ activation, current: activation }));
  const receipt = {
    schema: 'omd-host-project-write-receipt-v2',
    host: 'claude',
    hostAuthentication: { host: 'claude', mechanism: 'inherited-ipc' },
    projectRoot: realpathSync(projectRoot),
    argvSha256: createHash('sha256').update(canonicalJson([process.execPath, ...receiptArgs])).digest('hex'),
    buildSha256: activation.buildSha256,
    loadedSkillSha256: activation.loadedSkillSha256,
    briefSha256: activation.briefSha256,
    expiresAt: Date.now() + 60_000,
    payloadAuthorizations: [],
    nonce,
    ...receiptOverrides,
  };
  return executePipeHostReceipt(projectRoot, args, receipt);
}
function executeCallerJsonCli(projectRoot: string) {
  const binPath = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
  const activation: ActivationContext = {
    schemaVersion: ACTIVATION_CONTEXT_SCHEMA_VERSION,
    buildSha256: hash('a'),
    loadedSkillSha256: hash('b'),
    briefSha256: hash('c'),
    hostCapability: { host: 'claude' },
  };
  writeFileSync(join(projectRoot, 'activation.json'), JSON.stringify({ activation, current: activation }));
  return spawnSync(process.execPath, [binPath, 'config', 'set', 'checkpoint', 'both', '--activation', 'activation.json'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}
function executeHostIssuedCliTwice(projectRoot: string, nonce: string) {
  const binPath = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
  const activation: ActivationContext = {
    schemaVersion: ACTIVATION_CONTEXT_SCHEMA_VERSION,
    buildSha256: hash('a'),
    loadedSkillSha256: hash('b'),
    briefSha256: hash('c'),
    hostCapability: { host: 'claude' },
  };
  const argv = ['config', 'set', 'checkpoint', 'both'];
  const args = [binPath, ...argv, '--activation', 'activation.json'];
  const receipt = {
    schema: 'omd-host-project-write-receipt-v2',
    host: 'claude',
    hostAuthentication: { host: 'claude', mechanism: 'inherited-ipc' },
    projectRoot: realpathSync(projectRoot),
    argvSha256: createHash('sha256').update(canonicalJson([process.execPath, ...args])).digest('hex'),
    buildSha256: activation.buildSha256,
    loadedSkillSha256: activation.loadedSkillSha256,
    briefSha256: activation.briefSha256,
    expiresAt: Date.now() + 60_000,
    payloadAuthorizations: [],
    nonce,
  };
  const helperPath = join(projectRoot, 'consume-host-receipt-twice.ts');
  writeFileSync(join(projectRoot, 'activation.json'), JSON.stringify({ activation, current: activation }));
  writeFileSync(helperPath, `
import { spawnSync } from 'node:child_process';

const [binPath, projectRoot] = process.argv.slice(2);
const launch = () => spawnSync(process.execPath, [binPath, 'config', 'set', 'checkpoint', 'both', '--activation', 'activation.json'], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: { ...process.env, OMD_HOST_PROJECT_WRITE_FD: '3' },
  stdio: ['ignore', 'pipe', 'pipe', 3],
});
const first = launch();
const second = launch();
process.stdout.write(JSON.stringify({
  first: { status: first.status, stderr: first.stderr },
  second: { status: second.status, stderr: second.stderr },
}));
`);
  return executePipeHostReceipt(projectRoot, [helperPath, binPath, projectRoot], receipt);
}

test('guarded writes reject missing and stale activation before mutating', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-project-write-'));
  try {
    assert.throws(() => Reflect.apply(writeProjectFile, undefined, [{ projectRoot: root, relativePath: 'blocked.txt', content: 'no', invocation: undefined }]));
    const stale = invocation();
    const mismatched = { ...stale, current: { ...stale.current, buildSha256: hash('d') } };
    assert.throws(() => writeProjectFile({ projectRoot: root, relativePath: 'stale.txt', content: 'no', invocation: mismatched }), ProjectWriteError);
    assert.equal(existsSync(join(root, 'blocked.txt')), false);
    assert.equal(existsSync(join(root, 'stale.txt')), false);

    const canonicalRoot = realpathSync(root);
    const report = executeLocalCli(root, ['guarded', 'config', 'set', 'checkpoint', 'both']);
    assert.equal(report.guardedWrite, join(canonicalRoot, 'allowed.txt'));
    assert.equal(readFileSync(join(root, 'allowed.txt'), 'utf8'), 'yes');
    assert.equal(readFileSync(join(root, '.omd', 'proofs', 'adapter.txt'), 'utf8'), 'guarded');
    assert.equal(report.rootEscapeRejected, true);
    assert.equal(existsSync(resolve(canonicalRoot, '..', 'escape.txt')), false);
    assert.throws(() => writeProjectFile({
      projectRoot: root,
      relativePath: 'caller-minted.txt',
      content: 'blocked',
      invocation: { activation: report.activation, current: report.activation },
    }), ProjectWriteError);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(resolve(root, '..', '.omd-observations'), { recursive: true, force: true });
  }
});

test('external observation writes use the invocation-bound output root and reject arbitrary targets and overwrites', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'omd-observation-project-'));
  try {
    const canonicalProjectRoot = realpathSync(projectRoot);
    const report = executeLocalCli(projectRoot, ['guarded', 'render']);
    const allowed = resolve(canonicalProjectRoot, '..', '.omd-observations', 'render', 'proof.txt');
    assert.equal(report.observation, allowed);
    assert.equal(readFileSync(allowed, 'utf8'), 'render proof');
    assert.equal(report.arbitraryExternalRejected, true);
    assert.equal(report.nestedExternalRejected, true);
    assert.equal(report.overwriteRejected, true);
    assert.equal(existsSync(resolve(projectRoot, '..', 'arbitrary.txt')), false);
    assert.equal(existsSync(resolve(projectRoot, '..', '.omd-observations', 'render', 'nested')), false);
    assert.equal(existsSync(resolve(projectRoot, '..', '.omd-observations', 'render', 'nested', 'proof.txt')), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(resolve(projectRoot, '..', '.omd-observations'), { recursive: true, force: true });
  }
});

test('local CLI invocation is byte- and argv-bound, guarded, and cannot mint reviewer access', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-local-cli-'));
  try {
    const local = executeLocalCli(root, ['guarded', 'config', 'set', 'checkpoint', 'both']);
    const changedArgv = executeLocalCli(root, ['serialized', 'config', 'set', 'checkpoint', 'none']);
    const cliBytes = readFileSync(local.cliPath);
    const executableBytes = readFileSync(process.execPath);
    const expectedBuildSha256 = createHash('sha256')
      .update(String(executableBytes.byteLength))
      .update(':')
      .update(executableBytes)
      .update(String(cliBytes.byteLength))
      .update(':')
      .update(cliBytes)
      .digest('hex');
    assert.equal(local.activation.loadedSkillSha256, createHash('sha256').update(cliBytes).digest('hex'));
    assert.equal(local.activation.buildSha256, expectedBuildSha256);
    assert.equal(local.activation.buildSha256, changedArgv.activation.buildSha256);
    assert.equal(local.activation.loadedSkillSha256, changedArgv.activation.loadedSkillSha256);
    assert.notEqual(local.activation.briefSha256, changedArgv.activation.briefSha256);
    assert.equal(local.activation.hostCapability.host, 'local');
    assert.doesNotThrow(() => validateActivationContext(local.activation));
    assert.throws(() => validateActivationContext({
      ...local.activation,
      hostCapability: {
        host: 'local',
        actualLoadedSkill: false,
      },
    }));
    assert.throws(
      () => requireReviewerIsolationInvocation(
        { activation: local.activation, current: local.activation },
        createReviewerMcpAdapter().launch({
          host: 'claude',
          buildSha256: local.activation.buildSha256,
          loadedSkillSha256: local.activation.loadedSkillSha256,
          briefSha256: local.activation.briefSha256,
          evidence: 'not a local reviewer',
        }),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(resolve(root, '..', '.omd-observations'), { recursive: true, force: true });
  }
});

test('serialized host-derived local CLI invocation cannot mint a guarded write adapter', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-local-cli-serialized-'));
  try {
    const report = executeLocalCli(root, ['serialized', 'config', 'set', 'checkpoint', 'both']);
    assert.equal(report.serializedRejected, true);
    assert.equal(existsSync(join(root, 'serialized-write.txt')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('host-issued pipe receipts accept one exact receipt once and reject caller JSON, replayed, or mismatched bindings', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-host-fd-'));
  const nonce = 'host-receipt-nonce-0123456789012345';
  try {
    const callerJson = executeCallerJsonCli(root);
    assert.notEqual(callerJson.status, 0);
    assert.equal(existsSync(join(root, '.omd', 'config.json')), false);
    const forgedRoot = await executeHostIssuedCli(root, `${nonce}-root`, { projectRoot: `${realpathSync(root)}-forged` });
    assert.notEqual(forgedRoot.status, 0);
    assert.equal(existsSync(join(root, '.omd', 'config.json')), false);

    const forgedArgv = await executeHostIssuedCli(
      root,
      `${nonce}-argv`,
      {},
      ['config', 'set', 'checkpoint', 'none'],
      ['config', 'set', 'checkpoint', 'both'],
    );
    assert.notEqual(forgedArgv.status, 0);
    assert.equal(existsSync(join(root, '.omd', 'config.json')), false);

    const expired = await executeHostIssuedCli(root, `${nonce}-expiry`, { expiresAt: Date.now() - 1 });
    assert.notEqual(expired.status, 0);
    assert.equal(existsSync(join(root, '.omd', 'config.json')), false);

    const consumedTwice = await executeHostIssuedCliTwice(root, nonce);
    assert.equal(consumedTwice.status, 0, consumedTwice.stderr);
    const report = JSON.parse(consumedTwice.stdout) as {
      readonly first: { readonly status: number | null; readonly stderr: string };
      readonly second: { readonly status: number | null; readonly stderr: string };
    };
    assert.equal(report.first.status, 0, report.first.stderr);
    assert.notEqual(report.second.status, 0, report.second.stderr);
    assert.equal(existsSync(join(root, '.omd', 'config.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('host-issued pipe receipts authorize only the exact purpose-bound payload', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-host-payload-'));
  const activation: ActivationContext = {
    schemaVersion: ACTIVATION_CONTEXT_SCHEMA_VERSION,
    buildSha256: hash('a'),
    loadedSkillSha256: hash('b'),
    briefSha256: hash('c'),
    hostCapability: { host: 'claude' },
  };
  const event = {
    eventId: 'current-user-intent-event',
    currentUser: true,
    kind: 'explicit-intent',
    lock: { register: 'quiet' },
    recordedAt: '2026-01-01T00:00:00.000Z',
  };
  const argv = ['intent', 'append', '--input', 'intent.json'];
  try {
    mkdirSync(join(root, '.omd'), { recursive: true });
    writeFileSync(join(root, 'intent.json'), JSON.stringify({
      invocation: { activation, current: activation },
      event,
      expectedCurrentSha256: null,
    }));
    const mismatched = await executeHostIssuedCli(root, 'host-payload-mismatch-nonce-0123456789', {
      payloadAuthorizations: [{ purpose: 'current-user-intent-event', payloadSha256: hash('d') }],
    }, argv);
    assert.notEqual(mismatched.status, 0);
    assert.equal(existsSync(join(root, '.omd', 'intent-current.json')), false);

    const authorized = await executeHostIssuedCli(root, 'host-payload-authorized-nonce-0123456789', {
      payloadAuthorizations: [{
        purpose: 'current-user-intent-event',
        payloadSha256: createHash('sha256').update(`${canonicalJson(event)}\n`).digest('hex'),
      }],
    }, argv);
    assert.equal(authorized.status, 0, authorized.stderr);
    assert.equal(existsSync(join(root, '.omd', 'intent-current.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project mutation inventory traverses source files and catches a newly introduced direct write', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-mutation-inventory-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'core'));
    writeFileSync(join(root, 'bin', 'omd.ts'), "import '../core/writer.ts';\n");
    writeFileSync(join(root, 'core', 'writer.ts'), "import { writeFileSync } from 'node:fs';\nwriteFileSync('x', 'y');\n");
    const inventory = inventoryProjectRunMutations(root);
    assert.deepEqual(inventory.owners.map((owner) => owner.filePath), ['bin/omd.ts', 'core/writer.ts']);
    assert.deepEqual(inventory.unguardedMutations.map((item) => [item.filePath, item.line, item.operation]), [['core/writer.ts', 2, 'writeFileSync']]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('project mutation inventory permits exact source-seal read-only opens but rejects writable and unresolved flags', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-open-inventory-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'core', 'source-seal'), { recursive: true });
    writeFileSync(join(root, 'bin', 'omd.ts'), "import '../core/source-seal/index.ts';\n");
    writeFileSync(join(root, 'core', 'source-seal', 'index.ts'), `import { constants as fsConstants, openSync } from 'node:fs';
import * as fs from 'node:fs';
openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
openSync(path, fsConstants.O_WRONLY | fsConstants.O_CREAT);
const flags = fsConstants.O_RDONLY;
openSync(path, flags);
const writableOpen = fs.openSync;
writableOpen(path, 'w');
`);
    assert.deepEqual(
      inventoryProjectRunMutations(root).unguardedMutations.map((item) => [item.line, item.operation]),
      [[4, 'openSync'], [6, 'openSync'], [8, 'openSync']],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stable final-evidence descriptor adapter rejects a newly aliased direct writer', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-final-descriptor-inventory-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'core', 'evidence'), { recursive: true });
    writeFileSync(join(root, 'bin', 'omd.ts'), "import '../core/evidence/final-v2.ts';\n");
    writeFileSync(join(root, 'core', 'evidence', 'final-v2.ts'), `import { writeSync } from 'node:fs';
function filesystem(seams: { fs: object }): unknown {
  const defaults: FinalEvidenceV2FileSystem = {
    mkdir: mkdirSync, open: openSync, write: (fd, bytes) => { writeSync(fd, bytes); }, writeFile: writeFileSync, readFile: readFileSync, rename: renameSync, link: linkSync,
  };
  return { ...defaults, ...seams.fs };
}
const aliasedWrite = writeSync;
aliasedWrite(1, 'injected');
`);
    const inventory = inventoryProjectRunMutations(root);
    assert.deepEqual(
      inventory.unguardedMutations.map((item) => [item.filePath, item.operation]),
      [
        ['core/evidence/final-v2.ts', 'writeSync'],
        ['core/evidence/final-v2.ts', 'writeSync'],
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('live-socket reviewer adapter inventory rejects an additional direct unlink', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-reviewer-socket-inventory-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'adapters'));
    writeFileSync(join(root, 'bin', 'omd.ts'), "import '../adapters/reviewer-mcp.ts';\n");
    const adapterSource = readFileSync(
      fileURLToPath(new URL('../adapters/reviewer-mcp.ts', import.meta.url)),
      'utf8',
    );
    writeFileSync(
      join(root, 'adapters', 'reviewer-mcp.ts'),
      `${adapterSource}\nunlinkSync(socketPath('injected'));\n`,
    );

    const inventory = inventoryProjectRunMutations(root);
    assert.equal(
      inventory.owners.find((owner) => owner.filePath === 'adapters/reviewer-mcp.ts')?.classification,
      'unclassified',
    );
    assert.deepEqual(
      inventory.unguardedMutations.map((item) => [item.filePath, item.operation]),
      [
        ['adapters/reviewer-mcp.ts', 'unlinkSync'],
        ['adapters/reviewer-mcp.ts', 'unlinkSync'],
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('live-socket reviewer adapter inventory requires broker evidence zeroization', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-reviewer-socket-inventory-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'adapters'));
    writeFileSync(join(root, 'bin', 'omd.ts'), "import '../adapters/reviewer-mcp.ts';\n");
    const adapterSource = readFileSync(
      fileURLToPath(new URL('../adapters/reviewer-mcp.ts', import.meta.url)),
      'utf8',
    ).replace('  launch.evidence.fill(0);\n', '');
    writeFileSync(join(root, 'adapters', 'reviewer-mcp.ts'), adapterSource);

    const inventory = inventoryProjectRunMutations(root);
    assert.equal(
      inventory.owners.find((owner) => owner.filePath === 'adapters/reviewer-mcp.ts')?.classification,
      'unclassified',
    );
    assert.deepEqual(
      inventory.unguardedMutations.map((item) => [item.filePath, item.operation]),
      [['adapters/reviewer-mcp.ts', 'unlinkSync']],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('live-socket reviewer adapter inventory rejects an altered socket hash shape', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-reviewer-socket-inventory-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'adapters'));
    writeFileSync(join(root, 'bin', 'omd.ts'), "import '../adapters/reviewer-mcp.ts';\n");
    const adapterSource = readFileSync(
      fileURLToPath(new URL('../adapters/reviewer-mcp.ts', import.meta.url)),
      'utf8',
    ).replace(
      "const socketPath = (launchId: string): string => join(temporaryRoot, `o-${createHash('sha256').update(launchId).digest('hex').slice(0, 16)}`);",
      "const socketPath = (launchId: string): string => join(temporaryRoot, `o-${createHash('sha256').update(launchId).digest('hex').slice(0, 15)}`);",
    );
    writeFileSync(join(root, 'adapters', 'reviewer-mcp.ts'), adapterSource);

    const inventory = inventoryProjectRunMutations(root);
    assert.equal(
      inventory.owners.find((owner) => owner.filePath === 'adapters/reviewer-mcp.ts')?.classification,
      'unclassified',
    );
    assert.deepEqual(
      inventory.unguardedMutations.map((item) => [item.filePath, item.operation]),
      [['adapters/reviewer-mcp.ts', 'unlinkSync']],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('live-socket reviewer adapter inventory requires the private host launch capability', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-reviewer-socket-inventory-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'adapters'));
    writeFileSync(join(root, 'bin', 'omd.ts'), "import '../adapters/reviewer-mcp.ts';\n");
    const adapterSource = readFileSync(
      fileURLToPath(new URL('../adapters/reviewer-mcp.ts', import.meta.url)),
      'utf8',
    ).replace("  if (!launchCapability) throw new ReviewerLaunchError('reviewer proxy lacks the private host launch capability');\n", '');
    writeFileSync(join(root, 'adapters', 'reviewer-mcp.ts'), adapterSource);

    const inventory = inventoryProjectRunMutations(root);
    assert.equal(
      inventory.owners.find((owner) => owner.filePath === 'adapters/reviewer-mcp.ts')?.classification,
      'unclassified',
    );
    assert.deepEqual(
      inventory.unguardedMutations.map((item) => [item.filePath, item.operation]),
      [['adapters/reviewer-mcp.ts', 'unlinkSync']],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('normal CLI mutation graph has no unclassified direct project writers', () => {
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
  const inventory = assertProjectRunMutationInventory(repositoryRoot);
  assert.equal(
    inventory.owners.find((owner) => owner.filePath === 'core/runtime/project-write.ts')?.exception,
    'writeExternalObservationFile/createExternalObservationDirectory',
  );
  assert.equal(
    inventory.owners.find((owner) => owner.filePath === 'core/evidence/final-v2.ts')?.exception,
    'final-evidence-v2 stable descriptor adapter (audited capability owner)',
  );
  assert.equal(
    inventory.owners.find((owner) => owner.filePath === 'adapters/reviewer-mcp.ts')?.exception,
    'reviewer proxy live-socket cleanup (audited in-memory broker)',
  );
});

test('reviewer isolation returns metadata-only brokered evidence and rejects tool declarations', () => {
  const proxy = createReviewerEvidenceProxy();
  const payload = 'reviewable evidence';
  const receipt = proxy.create(payload);
  assert.equal(receipt.kind, 'brokered');
  assert.equal(receipt.byteLength, Buffer.byteLength(payload));
  assert.equal(receipt.sha256, createHash('sha256').update(payload).digest('hex'));
  assert.equal('base64' in receipt, false);
  assert.equal('path' in receipt, false);
  assert.equal('tools' in receipt, false);
  assert.equal('payload' in receipt, false);
  assert.throws(() => proxy.create({ tool: 'Read' }), ReviewerIsolationError);
  assert.throws(() => proxy.create({ tools: ['Bash'] }), ReviewerIsolationError);
  assert.throws(() => proxy.create(new Uint8Array(MAX_INLINE_EVIDENCE_BYTES + 1)), ReviewerIsolationError);
});

test('loopback aliases expose metadata only and reject public probing and reuse', () => {
  const proxy = createReviewerEvidenceProxy();
  const payload = new Uint8Array(MAX_INLINE_EVIDENCE_BYTES + 1);
  const expiresAt = '2026-07-22T00:01:00.000Z';
  const receipt = proxy.create(payload, { scope: 'review-1', expiresAt, byteLimit: payload.byteLength });
  assert.equal(receipt.kind, 'loopback-alias');
  if (receipt.kind !== 'loopback-alias') throw new Error('expected alias');
  assert.equal(receipt.sha256, createHash('sha256').update(payload).digest('hex'));
  assert.equal(receipt.scope, 'review-1');
  assert.equal(receipt.expiresAt, expiresAt);
  assert.equal(receipt.byteLimit, payload.byteLength);
  assert.equal('base64' in receipt, false);
  assert.equal('path' in receipt, false);
  assert.equal('tools' in receipt, false);
  assert.equal('payload' in receipt, false);
  assert.throws(() => proxy.create(payload, { scope: 'review-1', expiresAt, byteLimit: payload.byteLength - 1 }), ReviewerIsolationError);
  assert.throws(() => proxy.create(payload, { scope: 'review-1', expiresAt: 'not-a-date', byteLimit: payload.byteLength }), ReviewerIsolationError);
  assert.throws(() => proxy.consume({ alias: `${receipt.alias}/etc/passwd`, scope: 'review-1', maxBytes: payload.byteLength }), ReviewerIsolationError);
  assert.throws(() => proxy.consume({ alias: receipt.alias, scope: 'wrong-scope', maxBytes: payload.byteLength }), ReviewerIsolationError);
  assert.throws(() => proxy.consume({ alias: receipt.alias, scope: 'review-1', maxBytes: payload.byteLength - 1 }), ReviewerIsolationError);
  assert.throws(() => proxy.consume({ alias: receipt.alias, scope: 'review-1', maxBytes: payload.byteLength }), ReviewerIsolationError);
  assert.throws(() => proxy.consume({ alias: receipt.alias, scope: 'review-1', maxBytes: payload.byteLength }), ReviewerIsolationError);
});

test('activation rejects caller-supplied authority fields', () => {
  assert.throws(() => validateActivationContext({
    ...invocation().activation,
    hostCapability: { host: 'local', reviewerIsolation: true },
  }));
});
