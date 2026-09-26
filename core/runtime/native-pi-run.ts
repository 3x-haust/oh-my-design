import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBuildIdentityFromSource } from '../../adapters/build-identity.ts';
import { readPiRequest } from '../../extensions/omd-request-source.ts';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';
import { HOST_PAYLOAD_AUTHORIZATION_PURPOSES, type HostPayloadAuthorizationPurpose } from './activation.ts';
import type { CurrentRunIdentity, ProjectRunInvocation } from './invocation.ts';
import { claimNonce, mintSelfSignedReceipt, signNativeObservation, verifyNativeObservation, verifySelfSignedReceipt } from './self-signed-activation.ts';
import { observedProcessExecutableSha256 } from './process-executable.ts';
import { NativePiAuthorityError, nativePiDigest, nativePiDirectory, nativePiObject, nativePiRunId,
  nativePiRuntimeSha256, parseNativePiHost, parseNativePiRun, publishNativePiRun, readNativePiFile, readSignedNativePiRun,
  type NativePiHost, type NativePiRun, type NativePiRunInput } from './native-pi-run-record.ts';
export { NativePiAuthorityError, type NativePiHost, type NativePiRun } from './native-pi-run-record.ts';

const issuedRuns = new WeakSet<object>();
const testRuns = new WeakSet<object>();
type AcceptedPiCommand = Readonly<{ run: NativePiRun; expiresAt: number; runtimeRoot: string | null }>;
const invocations = new WeakMap<object, AcceptedPiCommand>();
const commands = new Map<string, ProjectRunInvocation>();
const testRoot = fileURLToPath(new URL('../../test', import.meta.url));
function genuineTestProcess(): boolean {
  if (!process.argv[1] || !existsSync(testRoot)) return false;
  const entry = relative(realpathSync(testRoot), realpathSync(process.argv[1]));
  return (process.env.NODE_TEST_CONTEXT === 'child-v8' || process.execArgv.some(arg => arg.startsWith('--test-isolation=')))
    && entry !== '' && entry !== '..' && !entry.startsWith(`..${sep}`) && !isAbsolute(entry);
}
export function ensureNativePiRun(input: NativePiRunInput): NativePiRun {
  const run = publishNativePiRun(input);
  issuedRuns.add(run);
  return run;
}
export function stageNativePiCommand(input: Readonly<{ run: NativePiRun; runtimeRoot: string; argv: readonly string[] }>): Readonly<{ path: string; argv: readonly string[]; dispose(): void }> {
  if (!issuedRuns.has(input.run)) throw new NativePiAuthorityError('only a native Pi host may issue a command');
  if (input.argv.includes('--pi-command') || input.argv.includes('--activation')) throw new NativePiAuthorityError('conflicting activation transport');
  const directory = mkdtempSync(join(tmpdir(), 'omd-pi-command-'));
  const path = join(directory, 'command.json');
  const argv = [...input.argv, '--pi-command', path];
  try {
    const receipt = mintSelfSignedReceipt({
      argv: [input.run.host.nodePath, realpathSync(join(input.runtimeRoot, 'bin/omd.ts')), ...argv], ...input.run, payloadAuthorizations: [] });
    const payload = { schema: 'native-pi-command-v1', run: input.run, parentPid: process.pid,
      fixture: testRuns.has(input.run), receipt: receipt.receipt, receiptSignature: receipt.signature.toString('base64') };
    const signature = signNativeObservation(input.run.projectRoot, 'pi-command', nativePiDigest(canonicalRouteJson(payload)));
    writeFileSync(path, canonicalRouteJson({ ...payload, signature }), { mode: 0o600, flag: 'wx' });
  }
  catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
  return Object.freeze({ path, argv, dispose: () => rmSync(directory, { recursive: true, force: true }) });
}
function liveParent(run: NativePiRun, parentPid: number): boolean {
  let cursor = process.ppid;
  for (let depth = 0; depth < 16 && cursor > 1; depth += 1) {
    const parent = spawnSync('/bin/ps', ['-p', String(cursor), '-o', 'ppid=', '-o', 'command='], { encoding: 'utf8', env: { PATH: '' } });
    if (parent.status !== 0) return false;
    const match = /^\s*(\d+)\s+(.+)$/u.exec(parent.stdout.trim());
    if (!match || !match[2]) return false;
    if (cursor === parentPid) return observedProcessExecutableSha256(cursor) === run.host.nodeSha256
      && nativePiDigest(readFileSync(run.host.nodePath)) === run.host.nodeSha256
      && nativePiDigest(readFileSync(run.host.cliPath)) === run.host.cliSha256;
    cursor = Number(match[1]);
  }
  return false;
}
function issueInvocation(accepted: AcceptedPiCommand): ProjectRunInvocation {
  const { run } = accepted;
  const current = Object.freeze({ buildSha256: run.buildSha256, loadedSkillSha256: run.loadedSkillSha256, briefSha256: run.briefSha256 });
  const invocation = Object.freeze({ activation: Object.freeze({ schemaVersion: 'activation-context-v2' as const,
    ...current, hostCapability: Object.freeze({ host: 'pi' as const }) }), current });
  invocations.set(invocation, accepted);
  return invocation;
}
export function createNativePiInvocation(input: Readonly<{ projectRoot: string; descriptorPath: string; cliPath: string; argv: readonly string[] }>): ProjectRunInvocation {
  const root = realpathSync(input.projectRoot);
  if (lstatSync(input.descriptorPath).isSymbolicLink()) throw new NativePiAuthorityError('command descriptor must not be a symlink');
  const path = realpathSync(input.descriptorPath);
  const raw = readNativePiFile(dirname(path), path);
  const cacheKey = nativePiDigest(canonicalRouteJson([root, input.argv, raw.toString('base64')]));
  const cached = commands.get(cacheKey);
  if (cached) { getNativePiRun(cached, root); return cached; }
  const record = nativePiObject(JSON.parse(raw.toString('utf8')));
  if (Object.keys(record).sort().join(',') !== 'fixture,parentPid,receipt,receiptSignature,run,schema,signature'
    || record.schema !== 'native-pi-command-v1' || typeof record.signature !== 'string' || typeof record.receiptSignature !== 'string'
    || typeof record.parentPid !== 'number' || !Number.isSafeInteger(record.parentPid) || typeof record.fixture !== 'boolean') throw new NativePiAuthorityError('invalid command descriptor');
  const { signature, ...payload } = record;
  const run = parseNativePiRun(record.run);
  if (run.projectRoot !== root || !verifyNativeObservation(root, 'pi-command', nativePiDigest(canonicalRouteJson(payload)), signature)) throw new NativePiAuthorityError('command signature or project mismatch');
  if (record.fixture ? !genuineTestProcess() : !liveParent(run, record.parentPid)) throw new NativePiAuthorityError('native Pi parent process is not authenticated');
  if (!record.fixture) {
    if (!process.argv[1] || realpathSync(input.cliPath) !== realpathSync(process.argv[1]) || canonicalRouteJson(input.argv) !== canonicalRouteJson(process.argv)) throw new NativePiAuthorityError('command is not the current CLI process');
    const runtimeRoot = dirname(dirname(realpathSync(input.cliPath)));
    const currentBuild = createBuildIdentityFromSource(runtimeRoot);
    if (nativePiRuntimeSha256(runtimeRoot) !== run.runtimeSha256 || currentBuild.buildSha256 !== run.buildSha256
      || currentBuild.sourceSkillSha256 !== run.loadedSkillSha256 || nativePiDigest(readFileSync(process.execPath)) !== run.host.nodeSha256) throw new NativePiAuthorityError('runtime or executable changed');
    if (readSignedNativePiRun(root, join(root, '.omd/native-pi/run.json')).runId !== run.runId) throw new NativePiAuthorityError('run was replaced');
    if (readPiRequest(root)?.requestSha256 !== run.briefSha256) throw new NativePiAuthorityError('original request changed');
  }
  const verified = verifySelfSignedReceipt({ projectRoot: root, receipt: record.receipt,
    signature: Buffer.from(record.receiptSignature, 'base64'), expected: { argv: input.argv, ...run } });
  if (!verified.ok) throw new NativePiAuthorityError(verified.reason);
  if (!claimNonce(root, verified.receipt.nonce)) throw new NativePiAuthorityError('command nonce was already consumed');
  const invocation = issueInvocation({ run, expiresAt: verified.receipt.expiresAt,
    runtimeRoot: record.fixture ? null : dirname(dirname(realpathSync(input.cliPath))) });
  commands.set(cacheKey, invocation);
  return invocation;
}
export function getNativePiRun(invocation: ProjectRunInvocation, root: string): NativePiRun {
  const accepted = invocations.get(invocation);
  if (!accepted || accepted.run.projectRoot !== realpathSync(root)) throw new NativePiAuthorityError('a native Pi command invocation is required');
  if (accepted.expiresAt <= Date.now()) throw new NativePiAuthorityError('native Pi command expired');
  if (accepted.runtimeRoot !== null) {
    const { run, runtimeRoot } = accepted;
    if (readPiRequest(root)?.requestSha256 !== run.briefSha256) throw new NativePiAuthorityError('original request changed');
    if (readSignedNativePiRun(root, join(root, '.omd/native-pi/run.json')).runId !== run.runId) throw new NativePiAuthorityError('run was replaced');
    const currentBuild = createBuildIdentityFromSource(runtimeRoot);
    if (currentBuild.buildSha256 !== run.buildSha256 || currentBuild.sourceSkillSha256 !== run.loadedSkillSha256
      || nativePiRuntimeSha256(runtimeRoot) !== run.runtimeSha256) throw new NativePiAuthorityError('runtime or loaded skill changed');
  }
  return accepted.run;
}
export function isNativePiInvocation(invocation: object): invocation is ProjectRunInvocation { return invocations.has(invocation); }
export function nativePiProjectRoot(invocation: object): string | undefined { return invocations.get(invocation)?.run.projectRoot; }
export function authorizeNativePiPayload(invocation: ProjectRunInvocation, root: string, purpose: HostPayloadAuthorizationPurpose, bytes: Uint8Array): void {
  if (!HOST_PAYLOAD_AUTHORIZATION_PURPOSES.includes(purpose) || !(bytes instanceof Uint8Array)) throw new NativePiAuthorityError('invalid payload authorization');
  const run = getNativePiRun(invocation, root);
  const payloadSha256 = nativePiDigest(bytes);
  const payload = { schema: 'native-pi-payload-v1', runId: run.runId, projectRoot: run.projectRoot, purpose, payloadSha256 };
  const directory = nativePiDirectory(run.projectRoot, `.omd/native-pi/payloads/${run.runId}/${purpose}`);
  const path = join(directory, `${payloadSha256}.json`);
  if (existsSync(path)) { requireNativePiPayload(invocation, root, purpose, bytes); return; }
  const signature = signNativeObservation(root, 'pi-derived-payload', nativePiDigest(canonicalRouteJson(payload)));
  writeFileSync(path, canonicalRouteJson({ ...payload, signature }), { flag: 'wx', mode: 0o600 });
}
export function requireNativePiPayload(invocation: ProjectRunInvocation, root: string, purpose: HostPayloadAuthorizationPurpose, bytes: Uint8Array): void {
  if (!HOST_PAYLOAD_AUTHORIZATION_PURPOSES.includes(purpose) || !(bytes instanceof Uint8Array)) throw new NativePiAuthorityError('invalid payload authorization');
  const run = getNativePiRun(invocation, root);
  const payloadSha256 = nativePiDigest(bytes);
  const path = join(run.projectRoot, `.omd/native-pi/payloads/${run.runId}/${purpose}/${payloadSha256}.json`);
  if (!existsSync(path)) throw new NativePiAuthorityError(`missing exact ${purpose} approval`);
  const record = nativePiObject(JSON.parse(readNativePiFile(root, path).toString('utf8')));
  const { signature, ...payload } = record;
  if (typeof signature !== 'string' || canonicalRouteJson(payload) !== canonicalRouteJson({ schema: 'native-pi-payload-v1',
    runId: run.runId, projectRoot: run.projectRoot, purpose, payloadSha256 })
    || !verifyNativeObservation(root, 'pi-derived-payload', nativePiDigest(canonicalRouteJson(payload)), signature)) throw new NativePiAuthorityError('derived payload approval mismatch');
}
export function createTestNativePiInvocation(input: Readonly<{ root: string; host: NativePiHost; current?: CurrentRunIdentity }>): ProjectRunInvocation {
  if (!genuineTestProcess()) throw new NativePiAuthorityError('test authority requires the repository Node test runner');
  const host = parseNativePiHost(input.host);
  const current = input.current ?? { buildSha256: nativePiDigest('test-build'), loadedSkillSha256: nativePiDigest('test-skill'), briefSha256: nativePiDigest('test-brief') };
  const identity = { ...current, projectRoot: realpathSync(input.root), runtimeSha256: nativePiDigest('test-runtime'), host };
  const run = Object.freeze({ ...identity, runId: nativePiRunId(identity) });
  issuedRuns.add(run); testRuns.add(run);
  return issueInvocation({ run, expiresAt: Date.now() + 15 * 60 * 1000, runtimeRoot: null });
}
