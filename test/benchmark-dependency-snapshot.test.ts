import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDependencySnapshot, nextSnapshotId } from '../scripts/benchmark/create-dependency-snapshot.ts';
import { verifyDependencySnapshot } from '../scripts/benchmark/verify-dependency-snapshot.ts';
import { runDependencySeal, type DependencySealInput } from '../scripts/benchmark/run-dependency-seal.ts';
import { archiveLayout, encodeFrame, evaluateEligibility, FrameDecoder, SealStateMachine } from '../scripts/benchmark/seal-protocol.ts';
import { prepareDarwinPublisherIdentity, writeNativePublisherIdentity, type NativePublisherIdentity } from '../scripts/benchmark/publish-exclusive.ts';
import { canonicalJson, sha256, type JsonValue } from '../scripts/benchmark/contracts.ts';
import { spawn, execFileSync } from 'node:child_process';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';

const darwin = process.platform === 'darwin';
const sealScript = fileURLToPath(new URL('../scripts/benchmark/run-dependency-seal.ts', import.meta.url));

function sourceFinalizationFixture(root: string): { path: string; sha256: string; domainSha256: string } {
  const domainSha256 = sha256('dependency-seal-test-domain-v1');
  const value = { schemaVersion: 'source-finalization-v1', status: 'ACCEPTED', domainSha256 } as unknown as JsonValue;
  const path = join(root, 'source-finalization.json');
  writeFileSync(path, canonicalJson(value));
  return { path, sha256: sha256(canonicalJson(value)), domainSha256 };
}

let preparedIdentity: NativePublisherIdentity | undefined;
function nativeIdentityPath(root: string): string {
  if (!preparedIdentity) {
    const compilerPath = execFileSync('/usr/bin/xcrun', ['--find', 'clang'], { encoding: 'utf8' }).trim();
    const sdkPath = execFileSync('/usr/bin/xcrun', ['--show-sdk-path'], { encoding: 'utf8' }).trim();
    preparedIdentity = prepareDarwinPublisherIdentity({
      binaryPath: join(mkdtempSync(join(tmpdir(), 'omd-native-publisher-')), 'omd-darwin-publish-v1'),
      compilerPath, compilerArgv: [], sdkPath, deploymentTarget: '14.0', signing: { mode: 'none' },
      metadata: { test: 'benchmark-dependency-snapshot-seal' },
    });
  }
  const identityPath = join(root, 'native-publisher-identity.json');
  writeNativePublisherIdentity(identityPath, preparedIdentity);
  return identityPath;
}

function sealInput(x: ReturnType<typeof fixture>, archiveRoot: string, finalization: { path: string; sha256: string; domainSha256: string }, identityPath: string, sealRunId: string, id = 'snapshot-001'): DependencySealInput {
  return {
    schemaVersion: 'dependency-seal-input-v1', archiveRoot, browserCache: x.browser, browserDescriptor: 'chromium-headless-shell', browserRevision: '1228',
    channelNonce: sha256(`${sealRunId}-channel`), nativePublisherIdentity: identityPath, nodeModules: x.modules,
    packageJson: join(x.root, 'package.json'), packageLock: join(x.root, 'package-lock.json'), sealRunId, snapshotId: id, snapshotRoot: x.snapshots,
    sourceFinalizationDomain: finalization.domainSha256, sourceFinalizationPath: finalization.path, sourceFinalizationSha256: finalization.sha256, sourceRoot: x.root,
  };
}

async function withLauncherArgv<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.argv[1];
  process.argv[1] = sealScript;
  try { return await run(); } finally { if (previous === undefined) process.argv.length = 1; else process.argv[1] = previous; }
}

/** Drives the launcher side of the finite FD3 protocol against a real child process, mirroring run-dependency-seal.ts's own phase(). */
function launcherPhase(args: string[], sealRunId: string, channelNonce: string): Promise<{ code: number; stdout: string; stderr: string; events: string[] }> {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [sealScript, ...args], { shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
    const channel = child.stdio[3]! as Duplex;
    const decoder = new FrameDecoder(); const machine = new SealStateMachine(sealRunId, channelNonce);
    const events: string[] = []; let stdout = '', stderr = '', answered = false, closed = false, code: number | undefined;
    const finish = (error?: Error) => { if (closed) return; closed = true; clearTimeout(timer); error ? reject(error) : done({ code: code ?? -1, stdout, stderr, events }); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('launcher phase timeout')); }, 30_000);
    child.stdout!.on('data', b => stdout += b); child.stderr!.on('data', b => stderr += b);
    channel.on('data', (bytes: Buffer) => {
      try {
        for (const message of decoder.push(bytes)) {
          events.push(message.type);
          if (!answered) {
            machine.receive(message, 'candidate');
            const exit = { schemaVersion: 'seal-protocol-v1' as const, sealRunId, channelNonce, sequence: 0, type: 'exit-build' as const };
            machine.receive(exit, 'launcher'); channel.write(encodeFrame(exit)); answered = true;
          } else if (message.type === 'exit-ack') {
            machine.receive(message, 'candidate');
            const shutdown = { schemaVersion: 'seal-protocol-v1' as const, sealRunId, channelNonce, sequence: 1, type: 'shutdown' as const };
            machine.receive(shutdown, 'launcher'); channel.end(encodeFrame(shutdown));
          } else { child.kill('SIGKILL'); finish(new Error('unexpected child FD3 message')); }
        }
      } catch (error) { child.kill('SIGKILL'); finish(error as Error); }
    });
    channel.on('end', () => { try { decoder.eof(); machine.eof(); } catch (error) { finish(error as Error); } });
    child.on('error', (error: Error) => finish(error));
    child.on('close', status => { code = status ?? -1; finish(); });
  });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'omd-dependency-snapshot-')); const modules = join(root, 'node_modules');
  mkdirSync(join(modules, 'alpha'), { recursive: true }); writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.15.0' }));
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { version: '0.3.0' }, 'node_modules/alpha': { version: '1.2.3', integrity: 'sha512-x', resolved: 'https://example.invalid/alpha.tgz' } } }));
  writeFileSync(join(modules, 'alpha/package.json'), JSON.stringify({ name: 'alpha', version: '1.2.3' })); writeFileSync(join(modules, 'alpha/index.js'), 'module.exports=1');
  const browser = join(root, 'browser'); mkdirSync(join(browser, 'chrome-headless-shell-mac-arm64/resources'), { recursive: true }); writeFileSync(join(browser, 'INSTALLATION_COMPLETE'), 'done'); writeFileSync(join(browser, 'DEPENDENCIES_VALIDATED'), 'done'); writeFileSync(join(browser, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'), '#!/bin/sh\nexit 0\n'); chmodSync(join(browser, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'), 0o755); writeFileSync(join(browser, 'chrome-headless-shell-mac-arm64/resources/data.pak'), 'asset');
  return { root, modules, browser, snapshots: join(root, 'snapshots') };
}
function input(x: ReturnType<typeof fixture>, id = 'snapshot-001') { return { sourceRoot: x.root, nodeModules: x.modules, browserCache: x.browser, snapshotRoot: x.snapshots, snapshotId: id }; }
function cleanup(path: string): void {
  const entry = lstatSync(path);
  if (entry.isDirectory()) {
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) cleanup(join(path, name));
  } else {
    chmodSync(path, 0o600);
  }
}
function removeFixture(path: string): void {
  cleanup(path);
  rmSync(path, { recursive: true, force: true });
}
test('constructs a deterministic candidate but cannot make it eligible directly', () => { const x = fixture(); try { const first = createDependencySnapshot(input(x)); assert.ok(first.snapshot.includes('.snapshot-001.candidate-')); assert.throws(() => verifyDependencySnapshot({ snapshot: first.snapshot, archiveRoot: join(x.root, 'archive') }), /durable eligibility/); assert.equal(first.manifest.packageProjection.rootVersionClassification, 'ROOT_PROJECT_VERSION_DRIFT'); } finally { removeFixture(x.root); } });
test('fails closed for installed dependency mismatch and omitted browser asset', () => { const x = fixture(); try { writeFileSync(join(x.modules, 'alpha/package.json'), JSON.stringify({ name: 'alpha', version: '9.9.9' })); assert.throws(() => createDependencySnapshot(input(x)), /installed package metadata mismatch/); writeFileSync(join(x.modules, 'alpha/package.json'), JSON.stringify({ name: 'alpha', version: '1.2.3' })); rmSync(join(x.browser, 'INSTALLATION_COMPLETE')); assert.throws(() => createDependencySnapshot(input(x)), /ENOENT/); } finally { removeFixture(x.root); } });
test('allocates successors from published snapshots only and has no rename publication path', () => { const x = fixture(); try { createDependencySnapshot(input(x)); assert.equal(nextSnapshotId(x.snapshots), 'snapshot-001'); assert.equal(existsSync(join(x.snapshots, 'snapshot-001')), false); assert.equal(readFileSync(new URL('../scripts/benchmark/create-dependency-snapshot.ts', import.meta.url), 'utf8').includes('renameSync'), false); } finally { removeFixture(x.root); } });
test('build worker completes a real FD3 handshake over the inherited fd 3 duplex and returns the launcher exit-build frame', { concurrency: false, timeout: 30_000 }, async () => {
  const x = fixture();
  try {
    const sealRunId = 'direct-fd3-handshake'; const channelNonce = sha256('direct-fd3-handshake-channel');
    const workerInput = { sourceRoot: x.root, nodeModules: x.modules, packageJson: join(x.root, 'package.json'), packageLock: join(x.root, 'package-lock.json'), browserCache: x.browser, snapshotRoot: x.snapshots, snapshotId: 'snapshot-901', browserDescriptor: 'chromium-headless-shell', browserRevision: '1228', sealRunId, channelNonce } as unknown as JsonValue;
    const inputPath = join(x.root, 'worker-input.json'); writeFileSync(inputPath, canonicalJson(workerInput));
    const claimValue = { claimantNonce: sha256('direct-claim-nonce') } as unknown as JsonValue;
    const claimPath = join(x.root, 'worker-claim.json'); writeFileSync(claimPath, canonicalJson(claimValue));
    const evidence = await launcherPhase(['--build-worker', '--input', inputPath, '--claim', claimPath], sealRunId, channelNonce);
    assert.equal(evidence.code, 0);
    assert.deepEqual(evidence.events, ['candidate-complete', 'exit-ack']);
    const stdout = JSON.parse(evidence.stdout) as { candidate: string; receivedLauncherFrame: string };
    assert.equal(stdout.receivedLauncherFrame, 'exit-build');
    assert.ok(existsSync(stdout.candidate));
  } finally { removeFixture(x.root); }
});
test('runs the FD3 seal launcher end-to-end: durable claim, PENDING receipt, native-published snapshot, and an ACCEPTED external verdict', { skip: !darwin, concurrency: false, timeout: 60_000 }, async () => {
  const x = fixture();
  const archiveRoot = join(x.root, 'archive');
  try {
    const finalization = sourceFinalizationFixture(x.root);
    const identityPath = nativeIdentityPath(x.root);
    const input = sealInput(x, archiveRoot, finalization, identityPath, sha256('seal-run-happy-path'));
    const result = await withLauncherArgv(() => runDependencySeal({ dryRun: false, input }));
    assert.equal(result.eligible, true);
    assert.equal(existsSync(join(x.snapshots, 'snapshot-001')), true);
    const layout = archiveLayout(archiveRoot, 'snapshot-001');
    assert.equal(existsSync(layout.claim), true);
    const snapshotReceipt = JSON.parse(readFileSync(layout.snapshot, 'utf8')) as { state: string };
    assert.equal(snapshotReceipt.state, 'PENDING_LAUNCHER');
    const verdict = JSON.parse(readFileSync(layout.verdict, 'utf8')) as { status: string };
    assert.equal(verdict.status, 'ACCEPTED');
    assert.deepEqual(evaluateEligibility(archiveRoot, 'snapshot-001'), { eligible: true, permanent: false, reason: 'accepted claim is fully bound' });
  } finally { removeFixture(x.root); }
});
test('a second contender for the same snapshot id yields a durable conflict and permanent ineligibility', { skip: !darwin, concurrency: false, timeout: 60_000 }, async () => {
  const x = fixture();
  const archiveRoot = join(x.root, 'archive');
  try {
    const finalization = sourceFinalizationFixture(x.root);
    const identityPath = nativeIdentityPath(x.root);
    const first = await withLauncherArgv(() => runDependencySeal({ dryRun: false, input: sealInput(x, archiveRoot, finalization, identityPath, sha256('seal-run-conflict-first')) }));
    assert.equal(first.eligible, true);
    const second = await withLauncherArgv(() => runDependencySeal({ dryRun: false, input: sealInput(x, archiveRoot, finalization, identityPath, sha256('seal-run-conflict-second')) }));
    assert.equal(second.eligible, false);
    const outcome = evaluateEligibility(archiveRoot, 'snapshot-001');
    assert.equal(outcome.eligible, false);
    assert.equal(outcome.permanent, true);
    assert.match(outcome.reason, /durable conflict exists/);
    const layout = archiveLayout(archiveRoot, 'snapshot-001');
    assert.ok(readdirSync(layout.conflicts).length >= 1);
  } finally { removeFixture(x.root); }
});
