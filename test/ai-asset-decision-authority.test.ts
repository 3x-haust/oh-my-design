import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import * as aiDecisionModule from '../core/asset-sourcing/ai-decision.ts';
import { selfSignedReceiptEnv } from './helpers/self-signed-receipt.ts';
import {
  AiAssetDecisionError,
  aiAssetDecisionAuthorityBytes,
  commitAiAssetDecision,
  requireCommittedAiAssetDecision,
  type AiAssetDecisionBinding,
  type AiAssetDecisionInput,
  type AiAssetDecisionReference,
} from '../core/asset-sourcing/index.ts';
import {
  adaptiveRouteAuthorityBytes,
  adaptiveRouteRecordSha256,
  AdaptiveRouteError,
  publishAdaptiveRoute,
  readPersistedRoute,
  routeAdaptiveFlow,
} from '../core/route/index.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectRunInvocation,
  createTestProjectWriteAdapter,
} from './helpers/project-write.ts';

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(',')}}`;
};
const cli = join(process.cwd(), 'bin/omd.ts');
const temporaryRoots: string[] = [];
function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}
after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});
const proposal: AiAssetDecisionInput = {
  decisionId: 'hero-atmosphere', prompt: 'soft cobalt atmospheric field',
  provider: 'host-imagegen', reason: 'The selected abstract carrier supports the launch concept.',
};
const binding = (reference: AiAssetDecisionReference): AiAssetDecisionBinding => ({
  prompt: proposal.prompt, provider: proposal.provider, decision: reference, currentDecision: reference,
});
function adaptiveInput(
  reference: AiAssetDecisionReference,
  fixture: 'copy-only' | 'medical-new-product' = 'copy-only',
) {
  const routeInput = JSON.parse(readFileSync(
    join(process.cwd(), `test/fixtures/adaptive-flow/${fixture}.json`), 'utf8',
  ));
  const strategy = routeInput.strategyDecision;
  strategy.methods.push('ai-shipped-asset');
  strategy.skips = strategy.skips.filter((entry: { id: string }) => entry.id !== 'ai-shipped-asset');
  strategy.aiAssets = [{
    assetId: proposal.decisionId, zone: 'atmospheric', prompt: proposal.prompt,
    provider: proposal.provider, decision: reference, currentDecision: reference,
  }];
  strategy.attributionCategories = [...strategy.attributionCategories, 'graphics'];
  return routeInput;
}

function committed(root: string, brief = 'ai-asset-decision') {
  const invocation = createTestProjectRunInvocation(root, brief);
  const authority = aiAssetDecisionAuthorityBytes(root, proposal, invocation);
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'ai-asset-decision', payload: authority }]);
  const reference = commitAiAssetDecision(
    root, proposal, createTestProjectWriteAdapter(root, invocation), invocation,
  );
  return { invocation, reference, authority };
}

function rejection(run: () => unknown): void {
  assert.throws(run, (error: unknown) => error instanceof AiAssetDecisionError);
}

async function executeHostCli(
  root: string,
  invocation: ReturnType<typeof createTestProjectRunInvocation>,
  argv: readonly string[],
  authorizations: readonly { purpose: 'ai-asset-decision' | 'adaptive-route-authority'; payload: Uint8Array }[],
  nonce: string,
) {
  const args = [cli, ...argv, '--activation', 'activation.json'];
  return await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: {
        ...process.env,
        ...selfSignedReceiptEnv(root, [process.execPath, ...args], {
          buildSha256: invocation.current.buildSha256,
          loadedSkillSha256: invocation.current.loadedSkillSha256,
          briefSha256: invocation.current.briefSha256,
        }, authorizations.map(({ purpose, payload }) => ({ purpose, payloadSha256: sha(payload) }))),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout!.on('data', (chunk) => { stdout += chunk; });
    child.stderr!.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('raw AI decision hashes are not exported and a caller-forged receipt has no commitment authority', () => {
  assert.equal(Object.hasOwn(aiDecisionModule, 'aiAssetDecisionSha256'), false);
  const root = temporaryRoot('omd-ai-forged-');
  const invocation = createTestProjectRunInvocation(root, 'forged-receipt');
  const digest = 'a'.repeat(64);
  const reference = {
    schema: 'omd-ai-asset-decision-reference-v1', decisionId: proposal.decisionId,
    record: `ai-asset-decisions/sha256-${digest}.json`, decisionSha256: digest,
    projectRoot: realpathSync(root), invocation: invocation.current,
  } as const;
  rejection(() => requireCommittedAiAssetDecision(root, binding(reference), invocation));
});

test('omd decision commits a host-authorized AI record that validates in the same project and invocation', async () => {
  const root = temporaryRoot('omd-ai-decision-cli-');
  const invocation = createTestProjectRunInvocation(root, 'omd decision');
  writeFileSync(join(root, 'activation.json'), JSON.stringify(invocation));
  const authority = aiAssetDecisionAuthorityBytes(root, proposal, invocation);
  const result = await executeHostCli(root, invocation, [
    'decision', 'AI hero atmosphere', '--why', proposal.reason,
    '--ai-asset-id', proposal.decisionId, '--prompt', proposal.prompt,
    '--provider', proposal.provider, '--json',
  ], [{ purpose: 'ai-asset-decision', payload: authority }],
  'ai-decision-authority-cli-nonce-0001');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const reference = output.aiAssetDecision as AiAssetDecisionReference;
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'ai-asset-decision', payload: authority }]);
  assert.equal(
    requireCommittedAiAssetDecision(root, binding(reference), invocation).decisionSha256,
    reference.decisionSha256,
  );
  assert.match(readFileSync(join(root, '.omd/decisions.md'), 'utf8'), /AI hero atmosphere/);

  const routeInput = adaptiveInput(reference, 'medical-new-product');
  const record = routeAdaptiveFlow(routeInput, { root, invocation });
  const routeAuthority = adaptiveRouteAuthorityBytes(record, adaptiveRouteRecordSha256(record), invocation);
  writeFileSync(join(root, 'route-input.json'), JSON.stringify(routeInput));
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  assert.equal(spawnSync('git', ['add', 'activation.json', 'route-input.json'], { cwd: root }).status, 0);
  assert.equal(spawnSync('git', [
    '-c', 'user.name=OMD Test', '-c', 'user.email=omd@example.invalid',
    'commit', '-qm', 'AI route fixture',
  ], { cwd: root }).status, 0);
  const routeAuthorizations = [
    { purpose: 'ai-asset-decision' as const, payload: authority },
    { purpose: 'adaptive-route-authority' as const, payload: routeAuthority },
  ];
  const classify = await executeHostCli(root, invocation, [
    'route', 'classify', '--input', 'route-input.json', '--json',
  ], routeAuthorizations, 'ai-route-classify-authority-nonce-0001');
  assert.equal(classify.status, 0, classify.stderr);
  const show = await executeHostCli(root, invocation, [
    'route', 'show', '--json',
  ], routeAuthorizations, 'ai-route-show-authority-nonce-000000001');
  assert.equal(show.status, 0, show.stderr);
  const shown = JSON.parse(show.stdout);
  assert.deepEqual(shown.behavior.active.aiAssetDecisionIds, [proposal.decisionId]);
  assert.ok(shown.sourceContract.uxPolicy.decisions.some(
    (decision: { kind: string }) => decision.kind === 'hard_safety_rail',
  ));
  assert.ok(shown.strategy.executionWaves.some((wave: { mode: string; roles: string[] }) =>
    wave.mode === 'concurrent' && wave.roles.includes('omd-scout') && wave.roles.includes('omd-writer')));
  const check = await executeHostCli(root, invocation, [
    'route', 'check', '--json',
  ], routeAuthorizations, 'ai-route-check-authority-nonce-00000001');
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(JSON.parse(check.stdout).outside, []);
});

test('a genuine host-authorized immutable decision passes only in its exact project and invocation', () => {
  const root = temporaryRoot('omd-ai-genuine-');
  const value = committed(root);
  const checked = requireCommittedAiAssetDecision(root, binding(value.reference), value.invocation);
  assert.equal(checked.decision.decisionId, proposal.decisionId);
  assert.equal(checked.decisionSha256, value.reference.decisionSha256);
  assert.match(value.reference.record, /^ai-asset-decisions\/sha256-[a-f0-9]{64}\.json$/);
  assert.equal(readFileSync(join(root, '.omd', value.reference.record), 'utf8').length > 0, true);
});

test('same-project replay from another invocation fails', () => {
  const root = temporaryRoot('omd-ai-invocation-replay-');
  const value = committed(root, 'first-invocation');
  const replay = createTestProjectRunInvocation(root, 'second-invocation');
  rejection(() => requireCommittedAiAssetDecision(root, binding(value.reference), replay));
});

test('cross-project replay fails even when decision files are copied', () => {
  const first = temporaryRoot('omd-ai-first-project-');
  const second = temporaryRoot('omd-ai-second-project-');
  const value = committed(first);
  const secondInvocation = createTestProjectRunInvocation(second, 'ai-asset-decision');
  const sourceRecord = join(first, '.omd', value.reference.record);
  const sourcePointer = join(first, '.omd/ai-asset-decisions/current', `${proposal.decisionId}.json`);
  const targetRecord = join(second, '.omd', value.reference.record);
  const targetPointer = join(second, '.omd/ai-asset-decisions/current', `${proposal.decisionId}.json`);
  mkdirSync(join(second, '.omd/ai-asset-decisions/current'), { recursive: true });
  mkdirSync(join(second, '.omd/ai-asset-decisions'), { recursive: true });
  copyFileSync(sourceRecord, targetRecord);
  copyFileSync(sourcePointer, targetPointer);
  const secondAuthority = aiAssetDecisionAuthorityBytes(second, proposal, secondInvocation);
  authorizeTestProjectRunPayloads(second, secondInvocation, [{ purpose: 'ai-asset-decision', payload: secondAuthority }]);
  rejection(() => requireCommittedAiAssetDecision(second, binding(value.reference), secondInvocation));
});

test('a copied decision record without its exact current pointer is not committed', () => {
  const source = temporaryRoot('omd-ai-copy-source-');
  const target = temporaryRoot('omd-ai-copy-target-');
  const value = committed(source);
  const invocation = createTestProjectRunInvocation(target, 'copied-record');
  mkdirSync(join(target, '.omd/ai-asset-decisions'), { recursive: true });
  copyFileSync(join(source, '.omd', value.reference.record), join(target, '.omd', value.reference.record));
  rejection(() => requireCommittedAiAssetDecision(target, binding(value.reference), invocation));
});

test('a superseded current decision reference is stale even when its immutable record remains intact', () => {
  const root = temporaryRoot('omd-ai-stale-pointer-');
  const value = committed(root);
  const revised = { ...proposal, prompt: 'revised cobalt atmospheric field' };
  const revisedAuthority = aiAssetDecisionAuthorityBytes(root, revised, value.invocation);
  authorizeTestProjectRunPayloads(root, value.invocation, [{
    purpose: 'ai-asset-decision', payload: revisedAuthority,
  }]);
  const current = commitAiAssetDecision(
    root, revised, createTestProjectWriteAdapter(root, value.invocation), value.invocation,
  );
  rejection(() => requireCommittedAiAssetDecision(root, binding(value.reference), value.invocation));
  const checked = requireCommittedAiAssetDecision(root, {
    prompt: revised.prompt, provider: revised.provider, decision: current, currentDecision: current,
  }, value.invocation);
  assert.equal(checked.decisionSha256, current.decisionSha256);
});

test('stale or rewritten immutable decision bytes fail closed', () => {
  const root = temporaryRoot('omd-ai-stale-bytes-');
  const value = committed(root);
  const path = join(root, '.omd', value.reference.record);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  record.prompt = 'rewritten prompt';
  writeFileSync(path, `${canonical(record)}\n`);
  rejection(() => requireCommittedAiAssetDecision(root, binding(value.reference), value.invocation));
});

test('adaptive route persistence revalidates the committed decision project and invocation bindings', () => {
  const root = temporaryRoot('omd-ai-route-authority-');
  const value = committed(root, 'ai-route-invocation');
  const routeInput = adaptiveInput(value.reference);
  assert.throws(() => routeAdaptiveFlow(routeInput), AdaptiveRouteError);
  const record = routeAdaptiveFlow(routeInput, { root, invocation: value.invocation });
  const routeAuthority = adaptiveRouteAuthorityBytes(
    record, adaptiveRouteRecordSha256(record), value.invocation,
  );
  authorizeTestProjectRunPayloads(root, value.invocation, [{
    purpose: 'adaptive-route-authority', payload: routeAuthority,
  }]);
  publishAdaptiveRoute(
    root, routeInput, createTestProjectWriteAdapter(root, value.invocation), value.invocation,
  );
  const persisted = readPersistedRoute(root, value.invocation);
  assert.equal(persisted.strategy.aiAssets[0]?.decision.projectRoot, realpathSync(root));
  assert.deepEqual(persisted.strategy.aiAssets[0]?.decision.invocation, value.invocation.current);
  const replay = createTestProjectRunInvocation(root, 'other-ai-route-invocation');
  assert.throws(() => readPersistedRoute(root, replay), AdaptiveRouteError);
});

test('self-consistent recomputed record and current reference fail without host authorization', () => {
  const root = temporaryRoot('omd-ai-self-consistent-');
  const invocation = createTestProjectRunInvocation(root, 'self-consistent-forgery');
  const record = {
    schema: 'omd-ai-asset-decision-record-v1', command: 'omd decision', status: 'committed',
    ...proposal, projectRoot: realpathSync(root), invocation: invocation.current,
  };
  const bytes = `${canonical(record)}\n`;
  const digest = sha(bytes);
  const reference = {
    schema: 'omd-ai-asset-decision-reference-v1', decisionId: proposal.decisionId,
    record: `ai-asset-decisions/sha256-${digest}.json`, decisionSha256: digest,
    projectRoot: realpathSync(root), invocation: invocation.current,
  } as const;
  mkdirSync(join(root, '.omd/ai-asset-decisions/current'), { recursive: true });
  writeFileSync(join(root, '.omd', reference.record), bytes);
  writeFileSync(
    join(root, '.omd/ai-asset-decisions/current', `${proposal.decisionId}.json`),
    `${canonical(reference)}\n`,
  );
  authorizeTestProjectRunPayloads(root, invocation, [{
    purpose: 'adaptive-route-authority',
    payload: aiAssetDecisionAuthorityBytes(root, proposal, invocation),
  }]);
  rejection(() => requireCommittedAiAssetDecision(root, binding(reference), invocation));
});
