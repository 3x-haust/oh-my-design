import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createBuildIdentityFromSource } from '../../adapters/build-identity.ts';
import { readPiRequest } from '../../extensions/omd-request-source.ts';
import { canonicalRouteJson } from '../route/adaptive-source-contract.ts';
import { nodeStableProjectFileSystem, readStableProjectFile } from './stable-project-file.ts';
import { signNativeObservation, verifyNativeObservation } from './self-signed-activation.ts';
import { HOST_PAYLOAD_AUTHORIZATION_PURPOSES } from './activation.ts';

export type NativePiHost = Readonly<{
  nodePath: string; nodeSha256: string; cliPath: string; cliSha256: string;
  provider: string; model: string; thinkingLevel: string; parentSessionId: string;
}>;
export type NativePiRun = Readonly<{
  runId: string; projectRoot: string; buildSha256: string; loadedSkillSha256: string;
  briefSha256: string; runtimeSha256: string; host: NativePiHost;
}>;
export type NativePiRunInput = Readonly<{
  root: string; runtimeRoot: string; loadedSkillPath: string;
  provider: string; model: string; thinkingLevel: string; parentSessionId: string;
}>;
export class NativePiAuthorityError extends Error {
  override readonly name = 'NativePiAuthorityError';
  constructor(reason: string) { super(`NATIVE_PI_AUTHORITY: ${reason}`); }
}
export const nativePiDigest = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fs = nodeStableProjectFileSystem();
const SHA = /^[a-f0-9]{64}$/u;
export function nativePiObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new NativePiAuthorityError('expected object');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new NativePiAuthorityError(`invalid ${name}`);
  return value;
}
function hash(value: unknown, name: string): string {
  const result = text(value, name);
  if (!SHA.test(result)) throw new NativePiAuthorityError(`invalid ${name}`);
  return result;
}
function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new NativePiAuthorityError('unexpected record fields');
}
export function parseNativePiHost(input: unknown): NativePiHost {
  const host = nativePiObject(input);
  exact(host, ['nodePath', 'nodeSha256', 'cliPath', 'cliSha256', 'provider', 'model', 'thinkingLevel', 'parentSessionId']);
  return Object.freeze({ nodePath: text(host.nodePath, 'nodePath'), nodeSha256: hash(host.nodeSha256, 'nodeSha256'),
    cliPath: text(host.cliPath, 'cliPath'), cliSha256: hash(host.cliSha256, 'cliSha256'), provider: text(host.provider, 'provider'),
    model: text(host.model, 'model'), thinkingLevel: text(host.thinkingLevel, 'thinkingLevel'), parentSessionId: text(host.parentSessionId, 'parentSessionId') });
}
export function nativePiRunId(run: Omit<NativePiRun, 'runId'>): string {
  const { nodeSha256, cliSha256, provider, model, thinkingLevel } = run.host;
  return nativePiDigest(canonicalRouteJson({ projectRoot: run.projectRoot, buildSha256: run.buildSha256,
    loadedSkillSha256: run.loadedSkillSha256, briefSha256: run.briefSha256, runtimeSha256: run.runtimeSha256,
    nodeSha256, cliSha256, provider, model, thinkingLevel }));
}
export function parseNativePiRun(input: unknown): NativePiRun {
  const run = nativePiObject(input);
  exact(run, ['runId', 'projectRoot', 'buildSha256', 'loadedSkillSha256', 'briefSha256', 'runtimeSha256', 'host']);
  const result = Object.freeze({ runId: hash(run.runId, 'runId'), projectRoot: text(run.projectRoot, 'projectRoot'),
    buildSha256: hash(run.buildSha256, 'buildSha256'), loadedSkillSha256: hash(run.loadedSkillSha256, 'loadedSkillSha256'),
    briefSha256: hash(run.briefSha256, 'briefSha256'), runtimeSha256: hash(run.runtimeSha256, 'runtimeSha256'), host: parseNativePiHost(run.host) });
  if (nativePiRunId(result) !== result.runId) throw new NativePiAuthorityError('run identity digest mismatch');
  return result;
}
export function readNativePiFile(root: string, path: string): Buffer {
  return readStableProjectFile({ root, path, label: 'native Pi authority', fs });
}
export function nativePiDirectory(root: string, relativePath: string): string {
  const allowed = relativePath === '.omd/native-pi' || HOST_PAYLOAD_AUTHORIZATION_PURPOSES.some(purpose =>
    new RegExp(`^\\.omd/native-pi/payloads/[a-f0-9]{64}/${purpose}$`, 'u').test(relativePath));
  if (!allowed || root !== realpathSync(root)) throw new NativePiAuthorityError('invalid native store directory');
  let current = root;
  for (const part of relativePath.split('/')) {
    current = join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new NativePiAuthorityError('authority directory must be a real directory');
  }
  return current;
}
export function nativePiRuntimeSha256(root: string): string {
  const digest = createHash('sha256');
  function visit(path: string): void {
    const absolute = join(root, path);
    const stat = lstatSync(absolute);
    digest.update(path).update('\0');
    if (stat.isSymbolicLink()) throw new NativePiAuthorityError(`runtime symlink refused: ${path}`);
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) visit(join(path, name));
    } else if (stat.isFile()) digest.update(readFileSync(absolute)).update('\0');
    else throw new NativePiAuthorityError(`unsupported runtime file: ${path}`);
  }
  for (const path of ['package.json', 'bin', 'core', 'adapters', 'extensions', 'src']) visit(path);
  return digest.digest('hex');
}
export function currentNativePiIdentity(input: NativePiRunInput): Omit<NativePiRun, 'host' | 'runId'> {
  const projectRoot = realpathSync(input.root);
  const request = readPiRequest(projectRoot);
  if (request === undefined) throw new NativePiAuthorityError('a captured original user request is required');
  const skill = readFileSync(input.loadedSkillPath);
  if (!skill.equals(readFileSync(join(input.runtimeRoot, 'src/skills/omd-ultradesign/SKILL.md')))) throw new NativePiAuthorityError('loaded skill differs from runtime snapshot');
  const build = createBuildIdentityFromSource(input.runtimeRoot);
  return { projectRoot, buildSha256: build.buildSha256,
    loadedSkillSha256: build.sourceSkillSha256, briefSha256: request.requestSha256, runtimeSha256: nativePiRuntimeSha256(input.runtimeRoot) };
}
export function observedNativePiHost(input: NativePiRunInput): NativePiHost {
  const cli = process.argv[1];
  if (!cli) throw new NativePiAuthorityError('Pi entrypoint is missing');
  const cliPath = realpathSync(cli);
  let packageRoot = dirname(cliPath);
  while (!existsSync(join(packageRoot, 'package.json')) && dirname(packageRoot) !== packageRoot) packageRoot = dirname(packageRoot);
  const manifest = nativePiObject(JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')));
  if (manifest.name !== '@earendil-works/pi-coding-agent' && manifest.name !== '@mariozechner/pi-coding-agent') throw new NativePiAuthorityError('run may only be established by a native Pi host');
  return parseNativePiHost({ nodePath: realpathSync(process.execPath), nodeSha256: nativePiDigest(readFileSync(process.execPath)),
    cliPath, cliSha256: nativePiDigest(readFileSync(cliPath)), provider: input.provider, model: input.model,
    thinkingLevel: input.thinkingLevel, parentSessionId: input.parentSessionId });
}
export function publishNativePiRun(input: NativePiRunInput): NativePiRun {
  const host = observedNativePiHost(input);
  const identity = { ...currentNativePiIdentity(input), host };
  const run = Object.freeze({ ...identity, runId: nativePiRunId(identity) });
  const path = join(nativePiDirectory(run.projectRoot, '.omd/native-pi'), 'run.json');
  if (existsSync(path)) {
    const previous = readSignedNativePiRun(run.projectRoot, path);
    if (previous.runId !== run.runId) throw new NativePiAuthorityError('request, model, runtime or loaded skill changed; this project belongs to a different Pi run');
    return run;
  }
  const signature = signNativeObservation(run.projectRoot, 'pi-run', nativePiDigest(canonicalRouteJson(run)));
  writeFileSync(path, `${canonicalRouteJson({ schema: 'native-pi-run-v1', run, signature })}\n`, { flag: 'wx', mode: 0o600 });
  return run;
}
export function readSignedNativePiRun(root: string, path: string): NativePiRun {
  const record = nativePiObject(JSON.parse(readNativePiFile(root, path).toString('utf8')));
  exact(record, ['schema', 'run', 'signature']);
  if (record.schema !== 'native-pi-run-v1' || typeof record.signature !== 'string') throw new NativePiAuthorityError('invalid signed run');
  const run = parseNativePiRun(record.run);
  if (run.projectRoot !== realpathSync(root) || !verifyNativeObservation(root, 'pi-run', nativePiDigest(canonicalRouteJson(run)), record.signature)) throw new NativePiAuthorityError('run signature or root mismatch');
  return run;
}
