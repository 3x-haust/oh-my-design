import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorizeDerivedPayload, hasHostBoundLocalProjectWriteAuthority, requireHostPayloadAuthorization, validateActivationContext } from '../core/runtime/activation.ts';
import { requireProjectWriteInvocation } from '../core/runtime/invocation.ts';
import { authorizeNativePiPayload, createNativePiInvocation, createTestNativePiInvocation, getNativePiRun, stageNativePiCommand, type NativePiHost } from '../core/runtime/native-pi-run.ts';
import { nativePiDirectory, parseNativePiRun, publishNativePiRun } from '../core/runtime/native-pi-run-record.ts';
import { mintSelfSignedReceipt } from '../core/runtime/self-signed-activation.ts';

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
const cliPath = join(runtimeRoot, 'bin/omd.ts');
const host: NativePiHost = { nodePath: realpathSync(process.execPath), nodeSha256: digest(readFileSync(process.execPath)),
  cliPath, cliSha256: digest(readFileSync(cliPath)), provider: 'openai-codex', model: 'gpt-6-luna', thinkingLevel: 'medium', parentSessionId: 'session-one' };
function fixture(t: { after(fn: () => void): void }): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-native-pi-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('Pi is a native host shape but parsed Pi JSON carries no project authority', () => {
  const current = { buildSha256: 'a'.repeat(64), loadedSkillSha256: 'b'.repeat(64), briefSha256: 'c'.repeat(64) };
  const activation = { schemaVersion: 'activation-context-v2', ...current, hostCapability: { host: 'pi' } };
  const parsed = validateActivationContext(activation);
  assert.equal(parsed.hostCapability.host, 'pi');
  assert.throws(() => requireProjectWriteInvocation({ activation: parsed, current }), /native Pi/i);
});

test('an opaque native Pi invocation authorizes only its canonical project root', t => {
  const root = fixture(t);
  const invocation = createTestNativePiInvocation({ root, host });
  assert.equal(requireProjectWriteInvocation(invocation).hostCapability.host, 'pi');
  assert.equal(hasHostBoundLocalProjectWriteAuthority(invocation, root), true);
  assert.equal(hasHostBoundLocalProjectWriteAuthority(invocation, fixture(t)), false);
  assert.throws(() => getNativePiRun(JSON.parse(JSON.stringify(invocation)), root), /native Pi command/);
});

test('a generic signed local receipt cannot elevate parsed JSON to a Pi write capability', t => {
  const root = fixture(t);
  const invocation = createTestNativePiInvocation({ root, host });
  const copied = JSON.parse(JSON.stringify(invocation));
  const signed = mintSelfSignedReceipt({ projectRoot: root, argv: process.argv, ...invocation.current, payloadAuthorizations: [] });
  const receipt = join(root, 'receipt.json');
  const signature = join(root, 'signature.txt');
  writeFileSync(receipt, JSON.stringify(signed.receipt));
  writeFileSync(signature, signed.signature.toString('base64'));
  const previous = { receipt: process.env.OMD_SELF_SIGNED_RECEIPT, signature: process.env.OMD_SELF_SIGNED_SIGNATURE };
  t.after(() => {
    if (previous.receipt === undefined) delete process.env.OMD_SELF_SIGNED_RECEIPT;
    else process.env.OMD_SELF_SIGNED_RECEIPT = previous.receipt;
    if (previous.signature === undefined) delete process.env.OMD_SELF_SIGNED_SIGNATURE;
    else process.env.OMD_SELF_SIGNED_SIGNATURE = previous.signature;
  });
  process.env.OMD_SELF_SIGNED_RECEIPT = receipt;
  process.env.OMD_SELF_SIGNED_SIGNATURE = signature;
  assert.equal(hasHostBoundLocalProjectWriteAuthority(copied, root), false);
});

test('command identity survives a restart and different argv but not request, model or build changes', t => {
  const root = fixture(t);
  const first = createTestNativePiInvocation({ root, host });
  const restarted = createTestNativePiInvocation({ root, host: { ...host, parentSessionId: 'session-two' } });
  assert.equal(getNativePiRun(first, root).runId, getNativePiRun(restarted, root).runId);
  for (const changed of ['buildSha256', 'loadedSkillSha256', 'briefSha256'] as const) {
    const different = createTestNativePiInvocation({ root, host, current: { ...first.current, [changed]: digest(changed) } });
    assert.notEqual(getNativePiRun(first, root).runId, getNativePiRun(different, root).runId);
  }
  const model = createTestNativePiInvocation({ root, host: { ...host, model: 'different-model' } });
  assert.notEqual(getNativePiRun(first, root).runId, getNativePiRun(model, root).runId);
});

test('durable derived payload approval survives a fresh invocation while rejecting wrong purpose and bytes', t => {
  const root = fixture(t);
  const first = createTestNativePiInvocation({ root, host });
  const bytes = Buffer.from('trusted derived browser output');
  authorizeDerivedPayload(first, root, 'evaluator-result', bytes);
  const next = createTestNativePiInvocation({ root, host: { ...host, parentSessionId: 'resumed' } });
  assert.doesNotThrow(() => requireHostPayloadAuthorization(next, root, 'evaluator-result', bytes));
  assert.throws(() => requireHostPayloadAuthorization(next, root, 'final-evidence-manifest', bytes), /exact/);
  assert.throws(() => requireHostPayloadAuthorization(next, root, 'evaluator-result', Buffer.from('edited')), /exact/);
});

test('changed run identities cannot reuse a previous payload approval', t => {
  const root = fixture(t);
  const first = createTestNativePiInvocation({ root, host });
  const bytes = Buffer.from('verified review lane');
  authorizeNativePiPayload(first, root, 'final-reviewer-lane', bytes);
  const changed = createTestNativePiInvocation({ root, host: { ...host, model: 'other' } });
  assert.throws(() => requireHostPayloadAuthorization(changed, root, 'final-reviewer-lane', bytes), /missing/);
});

test('tampered approval signatures cannot bless edited artifact bytes', t => {
  const root = fixture(t);
  const invocation = createTestNativePiInvocation({ root, host });
  const bytes = Buffer.from('verified bytes');
  authorizeNativePiPayload(invocation, root, 'evaluator-result', bytes);
  const run = getNativePiRun(invocation, root);
  const path = join(root, `.omd/native-pi/payloads/${run.runId}/evaluator-result/${digest(bytes)}.json`);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  record.signature = Buffer.alloc(64).toString('base64');
  writeFileSync(path, JSON.stringify(record));
  assert.throws(() => requireHostPayloadAuthorization(invocation, root, 'evaluator-result', bytes), /mismatch/);
});

test('structural run data cannot publish a durable native run and model changes invalidate its digest', t => {
  const root = fixture(t);
  const run = getNativePiRun(createTestNativePiInvocation({ root, host }), root);
  assert.throws(() => Reflect.apply(publishNativePiRun, undefined, [run]));
  assert.throws(() => parseNativePiRun({ ...run, host: { ...host, model: 'forged' } }), /identity digest/);
});

test('native store directory refuses arbitrary paths before creating them', t => {
  const root = fixture(t);
  assert.throws(() => nativePiDirectory(root, '.omd/not-native'), /native store/);
  assert.throws(() => nativePiDirectory(root, '../outside'), /native store/);
});

test('private command transport binds exact argv and reuses one consumed command only in the same process', t => {
  const root = fixture(t);
  const run = getNativePiRun(createTestNativePiInvocation({ root, host }), root);
  const command = stageNativePiCommand({ run, runtimeRoot, argv: ['guard', 'completion', '--json'] });
  t.after(command.dispose);
  const input = { projectRoot: root, descriptorPath: command.path, cliPath, argv: [host.nodePath, cliPath, ...command.argv] };
  assert.throws(() => createNativePiInvocation({ ...input, argv: [...input.argv, '--different'] }), /different command/);
  const accepted = createNativePiInvocation(input);
  assert.equal(createNativePiInvocation(input), accepted);
  assert.equal(getNativePiRun(accepted, root).runId, run.runId);
});

test('wrapper transport canonicalizes only its executable paths while preserving authored arguments', t => {
  const root = fixture(t);
  const run = getNativePiRun(createTestNativePiInvocation({ root, host }), root);
  const alias = join(root, 'runtime-link');
  symlinkSync(runtimeRoot, alias, 'dir');
  const command = stageNativePiCommand({ run, runtimeRoot: alias, argv: ['domain', 'set', '--input', `${alias}/authored input.json`] });
  t.after(command.dispose);
  const invocation = createNativePiInvocation({ projectRoot: root, descriptorPath: command.path, cliPath,
    argv: [host.nodePath, realpathSync(join(alias, 'bin/omd.ts')), ...command.argv] });
  assert.equal(getNativePiRun(invocation, root).runId, run.runId);
  assert.equal(command.argv[3], `${alias}/authored input.json`);
});

test('parsed run JSON cannot issue command authority and conflicting activation flags are refused', t => {
  const root = fixture(t);
  const run = getNativePiRun(createTestNativePiInvocation({ root, host }), root);
  assert.throws(() => stageNativePiCommand({ run: parseNativePiRun(JSON.parse(JSON.stringify(run))), runtimeRoot, argv: [] }), /native Pi host/);
  assert.throws(() => stageNativePiCommand({ run, runtimeRoot, argv: ['--activation', 'fake.json'] }), /conflicting/);
});
