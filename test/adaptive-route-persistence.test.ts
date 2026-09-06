import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ACTIVATION_CONTEXT_SCHEMA_VERSION,
  type ActivationContext,
} from '../core/runtime/activation.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import { fileURLToPath } from 'node:url';
import {
  adaptiveRouteAuthority,
  adaptiveRouteAuthorityBytes,
  adaptiveRouteAuthorityPath,
  adaptiveRouteRecordSha256,
  AdaptiveRouteError,
  changedPathsForAdaptiveRoute,
  parseRouteRecord,
  publishAdaptiveRoute,
  readPersistedRoute,
  routeAdaptiveFlow,
  type AdaptiveRouteErrorCode,
} from '../core/route/index.ts';
import { createAdaptiveSourceSealRoute } from '../core/source-seal/adaptive-inputs.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectRunInvocation,
  createTestProjectWriteAdapter,
} from './helpers/project-write.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const fixturePath = (name: string): string => fileURLToPath(new URL(`fixtures/adaptive-flow/${name}.json`, import.meta.url));
const fixture = (name: string): unknown => JSON.parse(readFileSync(fixturePath(name), 'utf8'));
const clone = (name: string): ReturnType<typeof routeAdaptiveFlow> => structuredClone(routeAdaptiveFlow(fixture(name)));

function routeError(run: () => unknown, code: AdaptiveRouteErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof AdaptiveRouteError);
    assert.equal(error.code, code);
    return true;
  });
}

function removeGate(record: ReturnType<typeof routeAdaptiveFlow>, prefix: string): void {
  Reflect.set(record, 'gates', record.gates.filter((gate) => !gate.startsWith(prefix)));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  assert.equal(typeof value, 'object');
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}

const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

function executeHostRouteCli(
  root: string,
  argv: readonly string[],
  activation: ActivationContext,
  authority: Uint8Array,
  nonce: string,
): Promise<Readonly<{ status: number | null; stdout: string; stderr: string }>> {
  const args = [CLI, ...argv, '--activation', 'activation.json'];
  const receipt = {
    schema: 'omd-host-project-write-receipt-v3', host: 'claude',
    hostAuthentication: {
      host: 'claude', mechanism: 'inherited-ipc', parentPid: process.pid,
      parentExecutableSha256: sha256(readFileSync(process.execPath)),
    },
    projectRoot: realpathSync(root),
    argvSha256: sha256(canonicalJson([process.execPath, ...args])),
    buildSha256: activation.buildSha256,
    loadedSkillSha256: activation.loadedSkillSha256,
    briefSha256: activation.briefSha256,
    expiresAt: Date.now() + 60_000,
    payloadAuthorizations: [{ purpose: 'adaptive-route-authority', payloadSha256: sha256(authority) }],
    nonce,
  };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, OMD_HOST_PROJECT_WRITE_FD: '3' },
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const stdoutChannel = child.stdout;
    const stderrChannel = child.stderr;
    if (stdoutChannel === null || stderrChannel === null) {
      child.kill();
      reject(new Error('host CLI output pipes are unavailable'));
      return;
    }
    stdoutChannel.on('data', (chunk: Buffer) => { stdout += chunk; });
    stderrChannel.on('data', (chunk: Buffer) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
    const channel = child.stdio[3];
    if (channel === undefined || channel === null || !('end' in channel)) {
      child.kill();
      reject(new Error('host receipt pipe is unavailable'));
      return;
    }
    channel.end(JSON.stringify(receipt));
  });
}

function publishAuthorized(root: string, name: string, brief: string): ProjectRunInvocation {
  const invocation = createTestProjectRunInvocation(root, brief);
  const record = routeAdaptiveFlow(fixture(name));
  const authority = adaptiveRouteAuthorityBytes(record, adaptiveRouteRecordSha256(record), invocation);
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'adaptive-route-authority', payload: authority }]);
  publishAdaptiveRoute(root, fixture(name), createTestProjectWriteAdapter(root, invocation), invocation);
  return invocation;
}

test('persisted records bind every source-derived safety and outcome projection', () => {
  const cases: readonly (readonly [string, (record: ReturnType<typeof routeAdaptiveFlow>) => void])[] = [
    ['hard rail', (record) => removeGate(record, 'hard-safety:')],
    ['required policy outcome', (record) => removeGate(record, 'required-outcome:')],
    ['task outcome', (record) => Reflect.set(record, 'requiredOutcomes', ['Forged outcome.'])],
    ['allowed paths', (record) => Reflect.set(record, 'allowedPaths', ['**'])],
    ['named dependencies', (record) => Reflect.set(record, 'namedDependencies', ['unrequested-package'])],
    ['medical safety stage', (record) => Reflect.set(record.strategy, 'stages', record.strategy.stages.filter((stage) => stage !== 'safety-validation'))],
    ['medical safety method', (record) => Reflect.set(record.strategy, 'methods', record.strategy.methods.filter((method) => method !== 'design-strategy-safety-recovery'))],
    ['strategy owner', (record) => Reflect.set(record.strategy, 'owner', 'coordinator-selected-model')],
  ];
  for (const [label, mutate] of cases) {
    const record = clone('medical-new-product');
    mutate(record);
    assert.throws(() => parseRouteRecord(record), AdaptiveRouteError, label);
  }
});

test('route records persist the exact selected model and immutable source binding', () => {
  const record = routeAdaptiveFlow(fixture('medical-new-product'));
  assert.deepEqual(record.selectedModel, {
    selection: 'host-user-selection', provider: 'host-provider', modelId: 'host-model', revision: '2026-08-11',
  });
  assert.match(record.sourceContractSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(record.sourceContract), true);
  assert.equal(Object.isFrozen(record.sourceContract.taskOutcome), true);
  const invocation = createTestProjectRunInvocation(tmpdir(), 'authority-shape');
  const routeSha256 = adaptiveRouteRecordSha256(record);
  const authority = adaptiveRouteAuthority(record, routeSha256, invocation);
  assert.equal(authority.sourceSha256, record.sourceContractSha256);
  assert.equal(authority.routeSha256, routeSha256);
  assert.deepEqual(authority.selectedModel, record.selectedModel);
  assert.deepEqual(authority.allowedPaths, record.allowedPaths);
  assert.deepEqual(authority.namedDependencies, record.namedDependencies);

  const forged = structuredClone(record);
  Reflect.set(forged.selectedModel, 'modelId', 'replacement-model');
  routeError(() => parseRouteRecord(forged), 'MODEL_IDENTITY_MISMATCH');
});

test('persisted pre-projectMode route and source pointers remain readable', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-route-legacy-persisted-'));
  const invocation = createTestProjectRunInvocation(root, 'legacy-persisted-route');
  const current = structuredClone(routeAdaptiveFlow(fixture('copy-only')));
  const source = { ...current.sourceContract } as Record<string, unknown>;
  delete source.projectMode;
  const sourceBytes = `${canonicalJson(source)}\n`;
  const sourceSha256 = sha256(sourceBytes);
  const legacy = {
    ...current,
    sourceContract: source,
    sourceContractSha256: sourceSha256,
  } as Record<string, unknown>;
  delete legacy.projectMode;
  const recordBytes = `${canonicalJson(legacy)}\n`;
  const routeSha256 = sha256(recordBytes);
  const authorityBytes = adaptiveRouteAuthorityBytes(
    legacy as ReturnType<typeof routeAdaptiveFlow>,
    routeSha256,
    invocation,
  );
  authorizeTestProjectRunPayloads(root, invocation, [{
    purpose: 'adaptive-route-authority',
    payload: authorityBytes,
  }]);
  mkdirSync(join(root, '.omd', 'route-sources'), { recursive: true });
  mkdirSync(join(root, '.omd', 'route-records'), { recursive: true });
  mkdirSync(join(root, '.omd', 'route-authorities'), { recursive: true });
  writeFileSync(join(root, '.omd', 'route-sources', `sha256-${sourceSha256}.json`), sourceBytes);
  writeFileSync(join(root, '.omd', 'route-records', `sha256-${routeSha256}.json`), recordBytes);
  writeFileSync(join(root, '.omd', adaptiveRouteAuthorityPath(authorityBytes)), authorityBytes);
  writeFileSync(join(root, '.omd', 'route-source.json'), `${canonicalJson({
    schema: 'adaptive-route-source-pointer-v1',
    record: `route-sources/sha256-${sourceSha256}.json`,
    sha256: sourceSha256,
  })}\n`);
  writeFileSync(join(root, '.omd', 'route.json'), `${canonicalJson({
    schema: 'adaptive-route-pointer-v1',
    record: `route-records/sha256-${routeSha256}.json`,
    sha256: routeSha256,
  })}\n`);
  writeFileSync(join(root, '.omd', 'copy-deck.md'), '# Legacy copy\n');

  assert.equal(readPersistedRoute(root, invocation).projectMode, 'existing');
  const sealRoute = createAdaptiveSourceSealRoute(root, invocation);
  assert.equal(sealRoute.record.path, `.omd/route-records/sha256-${routeSha256}.json`);
  assert.equal(sealRoute.sourceContract.path, `.omd/route-sources/sha256-${sourceSha256}.json`);
});

test('route classify, show, and check remain usable with an exact host authority receipt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-route-cli-authority-'));
  const activation: ActivationContext = {
    schemaVersion: ACTIVATION_CONTEXT_SCHEMA_VERSION,
    buildSha256: sha256('route-cli-build'),
    loadedSkillSha256: sha256('route-cli-skill'),
    briefSha256: sha256('route-cli-invocation'),
    hostCapability: { host: 'claude' },
  };
  const invocation: ProjectRunInvocation = { activation, current: activation };
  const record = routeAdaptiveFlow(fixture('copy-only'));
  const authority = adaptiveRouteAuthorityBytes(record, adaptiveRouteRecordSha256(record), invocation);
  writeFileSync(join(root, 'route-input.json'), JSON.stringify(fixture('copy-only')));
  writeFileSync(join(root, 'activation.json'), JSON.stringify(invocation));
  writeFileSync(join(root, 'README.md'), 'committed project documentation\n');
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  assert.equal(spawnSync('git', ['add', 'route-input.json', 'activation.json', 'README.md'], { cwd: root }).status, 0);
  assert.equal(spawnSync('git', [
    '-c', 'user.name=OMD Test', '-c', 'user.email=omd@example.invalid',
    'commit', '-qm', 'fixture',
  ], { cwd: root }).status, 0);

  writeFileSync(join(root, 'README.md'), 'pre-existing tracked work\n');
  writeFileSync(join(root, 'notes.local.md'), 'pre-existing untracked work\n');

  const classify = await executeHostRouteCli(
    root, ['route', 'classify', '--input', 'route-input.json', '--json'], activation, authority,
    'route-classify-authority-nonce-0001',
  );
  assert.equal(classify.status, 0, classify.stderr);
  const show = await executeHostRouteCli(
    root, ['route', 'show', '--json'], activation, authority, 'route-show-authority-nonce-0000001',
  );
  assert.equal(show.status, 0, show.stderr);
  assert.deepEqual(JSON.parse(show.stdout).selectedModel, record.selectedModel);
  const check = await executeHostRouteCli(
    root, ['route', 'check', '--json'], activation, authority, 'route-check-authority-nonce-000001',
  );
  assert.equal(check.status, 0, `${check.stderr}\n${check.stdout}`);
  assert.deepEqual(JSON.parse(check.stdout).outside, []);

  writeFileSync(join(root, 'README.md'), 'route-time mutation of pre-existing tracked work\n');
  const changedPreExisting = await executeHostRouteCli(
    root, ['route', 'check'], activation, authority, 'route-check-dirty-baseline-nonce1',
  );
  assert.equal(changedPreExisting.status, 1, changedPreExisting.stderr);
  assert.match(changedPreExisting.stderr, /ROUTE_SCOPE_EXCEEDED:[\s\S]*README\.md/);

  writeFileSync(join(root, 'LICENSE'), 'unrequested repository metadata\n');
  const exceeded = await executeHostRouteCli(
    root, ['route', 'check'], activation, authority, 'route-check-exceeded-nonce-00001',
  );
  assert.equal(exceeded.status, 1, exceeded.stderr);
  assert.match(exceeded.stderr, /ROUTE_SCOPE_EXCEEDED:[\s\S]*LICENSE/);
});

test('route check verifies an authorized greenfield non-git workspace from its route-time filesystem baseline', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-route-cli-greenfield-'));
  const activation: ActivationContext = {
    schemaVersion: ACTIVATION_CONTEXT_SCHEMA_VERSION,
    buildSha256: sha256('route-cli-greenfield-build'),
    loadedSkillSha256: sha256('route-cli-greenfield-skill'),
    briefSha256: sha256('route-cli-greenfield-invocation'),
    hostCapability: { host: 'claude' },
  };
  const invocation: ProjectRunInvocation = { activation, current: activation };
  const record = routeAdaptiveFlow(fixture('copy-only'));
  const authority = adaptiveRouteAuthorityBytes(record, adaptiveRouteRecordSha256(record), invocation);
  writeFileSync(join(root, '.gitkeep'), '');
  writeFileSync(join(root, 'route-input.json'), JSON.stringify(fixture('copy-only')));
  writeFileSync(join(root, 'activation.json'), JSON.stringify(invocation));

  const classify = await executeHostRouteCli(
    root, ['route', 'classify', '--input', 'route-input.json', '--json'], activation, authority,
    'route-greenfield-classify-nonce-1',
  );
  assert.equal(classify.status, 0, classify.stderr);
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  writeFileSync(join(root, 'src', 'copy', 'Confirmation.tsx'), 'export const Confirmation = true;\n');

  const check = await executeHostRouteCli(
    root, ['route', 'check', '--json'], activation, authority, 'route-greenfield-check-nonce-00001',
  );
  assert.equal(check.status, 0, `${check.stderr}\n${check.stdout}`);
  assert.deepEqual(JSON.parse(check.stdout).outside, []);

  writeFileSync(join(root, 'LICENSE'), 'unrequested repository metadata\n');
  const exceeded = await executeHostRouteCli(
    root, ['route', 'check'], activation, authority, 'route-greenfield-exceed-nonce-01',
  );
  assert.equal(exceeded.status, 1, exceeded.stderr);
  assert.match(exceeded.stderr, /ROUTE_SCOPE_EXCEEDED:[\s\S]*LICENSE/);
});

test('non-git scope evidence fails closed on symlinks even inside an allowed path', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-route-symlink-'));
  const foreign = mkdtempSync(join(tmpdir(), 'omd-route-foreign-'));
  const invocation = publishAuthorized(root, 'copy-only', 'scope-symlink');
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  symlinkSync(foreign, join(root, 'src', 'copy', 'foreign'));
  const record = readPersistedRoute(root, invocation);

  assert.throws(
    () => changedPathsForAdaptiveRoute(root, record, adaptiveRouteRecordSha256(record), invocation),
    /cannot verify symlink path/,
  );
});

test('scope evidence is route-current and content-addressed history survives reclassification', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-route-scope-current-'));
  const invocation = publishAuthorized(root, 'copy-only', 'scope-current');
  const firstRoutePointer = JSON.parse(readFileSync(join(root, '.omd', 'route.json'), 'utf8'));
  const firstScopePointerBytes = readFileSync(join(root, '.omd', 'route-scope.json'));
  const firstScopePointer = JSON.parse(firstScopePointerBytes.toString('utf8'));

  const secondInput = fixture('medical-new-product');
  const secondRecord = routeAdaptiveFlow(secondInput);
  const secondSha256 = adaptiveRouteRecordSha256(secondRecord);
  authorizeTestProjectRunPayloads(root, invocation, [{
    purpose: 'adaptive-route-authority',
    payload: adaptiveRouteAuthorityBytes(secondRecord, secondSha256, invocation),
  }]);
  publishAdaptiveRoute(root, secondInput, createTestProjectWriteAdapter(root, invocation), invocation);
  const secondRoutePointer = JSON.parse(readFileSync(join(root, '.omd', 'route.json'), 'utf8'));
  const secondScopePointer = JSON.parse(readFileSync(join(root, '.omd', 'route-scope.json'), 'utf8'));

  assert.notEqual(firstRoutePointer.record, secondRoutePointer.record);
  assert.notEqual(firstScopePointer.record, secondScopePointer.record);
  assert.doesNotThrow(() => readFileSync(join(root, '.omd', firstRoutePointer.record)));
  assert.doesNotThrow(() => readFileSync(join(root, '.omd', firstScopePointer.record)));
  writeFileSync(join(root, '.omd', 'route-scope.json'), firstScopePointerBytes);
  assert.throws(
    () => changedPathsForAdaptiveRoute(root, secondRecord, secondSha256, invocation),
    /scope evidence is stale/,
  );
});

test('the persisted read seam rejects coordinated replacement of both pointers and records', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-route-authority-'));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const invocation = publishAuthorized(root, 'copy-only', 'coordinated-forgery');

  const pointerPath = join(root, '.omd', 'route.json');
  const pointer: unknown = JSON.parse(readFileSync(pointerPath, 'utf8'));
  assert.ok(typeof pointer === 'object' && pointer !== null);
  const recordPath = Reflect.get(pointer, 'record');
  assert.equal(typeof recordPath, 'string');
  const record: unknown = JSON.parse(readFileSync(join(root, '.omd', recordPath), 'utf8'));
  assert.ok(typeof record === 'object' && record !== null);
  const source = structuredClone(Reflect.get(record, 'sourceContract'));
  assert.ok(typeof source === 'object' && source !== null);
  Reflect.set(source, 'allowedPaths', ['**']);
  Reflect.set(record, 'allowedPaths', ['**']);
  Reflect.set(record, 'sourceContract', source);
  Reflect.set(record, 'sourceContractSha256', sha256(`${canonicalJson(source)}\n`));
  const forgedSourceBytes = `${canonicalJson(source)}\n`;
  const forgedSourceSha = sha256(forgedSourceBytes);
  const forgedSourcePath = `route-sources/sha256-${forgedSourceSha}.json`;
  const forgedBytes = `${canonicalJson(record)}\n`;
  const forgedSha = sha256(forgedBytes);
  const forgedPath = `route-records/sha256-${forgedSha}.json`;
  mkdirSync(join(root, '.omd', 'route-records'), { recursive: true });
  mkdirSync(join(root, '.omd', 'route-sources'), { recursive: true });
  writeFileSync(join(root, '.omd', forgedSourcePath), forgedSourceBytes);
  writeFileSync(join(root, '.omd', forgedPath), forgedBytes);
  writeFileSync(join(root, '.omd', 'route-source.json'), `${canonicalJson({ schema: 'adaptive-route-source-pointer-v1', record: forgedSourcePath, sha256: forgedSourceSha })}\n`);
  writeFileSync(pointerPath, `${canonicalJson({ schema: 'adaptive-route-pointer-v1', record: forgedPath, sha256: forgedSha })}\n`);

  routeError(() => readPersistedRoute(root, invocation), 'ROUTE_AUTHORITY_REQUIRED');
});

test('persisted read revalidation rejects a forged sequential execution wave', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-route-wave-forgery-'));
  const invocation = publishAuthorized(root, 'medical-new-product', 'wave-forgery');
  const pointerPath = join(root, '.omd', 'route.json');
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
  const record = JSON.parse(readFileSync(join(root, '.omd', pointer.record), 'utf8'));
  Reflect.set(record.strategy, 'executionWaves', [
    { id: 'frame', mode: 'concurrent', roles: ['omd-framer'] },
    { id: 'scout', mode: 'concurrent', roles: ['omd-scout'] },
    { id: 'copy', mode: 'concurrent', roles: ['omd-writer'] },
    { id: 'composition', mode: 'concurrent', roles: ['omd-composer'] },
    { id: 'production', mode: 'concurrent', roles: ['omd-hand'] },
    { id: 'review', mode: 'concurrent', roles: ['omd-eye'] },
  ]);
  const bytes = `${canonicalJson(record)}\n`;
  const digest = sha256(bytes);
  const path = `route-records/sha256-${digest}.json`;
  writeFileSync(join(root, '.omd', path), bytes);
  writeFileSync(pointerPath, `${canonicalJson({ schema: 'adaptive-route-pointer-v1', record: path, sha256: digest })}\n`);

  routeError(() => readPersistedRoute(root, invocation), 'ADAPTIVE_EXECUTION_WAVE_INVALID');
});

test('persisted reads reject missing authority and cross-project or cross-invocation replay', () => {
  const first = mkdtempSync(join(tmpdir(), 'omd-route-first-'));
  const second = mkdtempSync(join(tmpdir(), 'omd-route-second-'));
  const firstInvocation = publishAuthorized(first, 'copy-only', 'first-route-run');

  assert.throws(() => Reflect.apply(readPersistedRoute, undefined, [first]), AdaptiveRouteError);
  const replayInvocation = createTestProjectRunInvocation(first, 'replayed-route-run');
  assert.throws(() => Reflect.apply(readPersistedRoute, undefined, [first, replayInvocation]), AdaptiveRouteError);
  const otherProjectInvocation = createTestProjectRunInvocation(second, 'first-route-run');
  assert.throws(() => Reflect.apply(readPersistedRoute, undefined, [first, otherProjectInvocation]), AdaptiveRouteError);
  assert.notEqual(firstInvocation.current.briefSha256, replayInvocation.current.briefSha256);
  assert.deepEqual(readPersistedRoute(first, firstInvocation).selectedModel, routeAdaptiveFlow(fixture('copy-only')).selectedModel);
});
