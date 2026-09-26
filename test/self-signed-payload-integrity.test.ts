import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ActivationContextValidationError, requireHostPayloadAuthorization } from '../core/runtime/activation.ts';
import {
  authorizationFor,
  claimNonce,
  mintSelfSignedReceipt,
  verifySelfSignedReceipt,
  type SelfSignedPayloadAuthorization,
} from '../core/runtime/self-signed-activation.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';

const identity = {
  argv: ['receipt-integrity'], buildSha256: 'a'.repeat(64),
  loadedSkillSha256: 'b'.repeat(64), briefSha256: 'c'.repeat(64),
};
const intended = authorizationFor('adaptive-route-authority', Buffer.from('approved route'));
const injected = authorizationFor('final-evidence-manifest', Buffer.from('unapproved final evidence'));

function project(t: TestContext): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-selfsigned-tamper-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

const substitutions: readonly Readonly<{ name: string; entries: readonly SelfSignedPayloadAuthorization[] }>[] = [
  { name: 'purpose replacement', entries: [{ ...intended, purpose: injected.purpose }] },
  { name: 'payload digest replacement', entries: [{ ...intended, payloadSha256: injected.payloadSha256 }] },
  { name: 'same-length authorization replacement', entries: [injected] },
  { name: 'authorization insertion', entries: [intended, injected] },
];

for (const substitution of substitutions) {
  test(`receipt signature refuses ${substitution.name}`, t => {
    // Given: a real signature over one approved authorization.
    const root = project(t);
    const minted = mintSelfSignedReceipt({ projectRoot: root, ...identity, payloadAuthorizations: [intended] });
    // When: signed nested permissions change without a new signature.
    const result = verifySelfSignedReceipt({ projectRoot: root, expected: identity, signature: minted.signature,
      receipt: { ...minted.receipt, payloadAuthorizations: substitution.entries } });
    // Then: the cryptographic check refuses the modified permissions.
    assert.deepEqual(result, { ok: false, reason: 'signature does not match this project key' });
  });
}

test('receipt verification accepts reordered JSON keys with unchanged nested permissions', t => {
  // Given: multiple distinct, legitimately signed payload permissions.
  const root = project(t);
  const minted = mintSelfSignedReceipt({ projectRoot: root, ...identity, payloadAuthorizations: [intended, injected] });
  const reordered = Object.fromEntries(Object.entries(minted.receipt).reverse());
  reordered.payloadAuthorizations = [intended, injected].map(entry => ({ payloadSha256: entry.payloadSha256, purpose: entry.purpose }));
  // When: the same receipt is decoded from JSON with different object key ordering.
  const result = verifySelfSignedReceipt({ projectRoot: root, expected: identity, signature: minted.signature, receipt: reordered });
  // Then: all approved permissions remain usable.
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.receipt.payloadAuthorizations, [intended, injected]);
});

test('the real payload consumer refuses a forged authorization without consuming the legitimate nonce', t => {
  // Given: a signed receipt for another purpose and payload, transported through real files.
  const root = project(t);
  const invocation = createTestProjectRunInvocation(root);
  const payload = Buffer.from('unapproved final evidence');
  const minted = mintSelfSignedReceipt({ projectRoot: root, argv: process.argv,
    buildSha256: invocation.current.buildSha256, loadedSkillSha256: invocation.current.loadedSkillSha256,
    briefSha256: invocation.current.briefSha256, payloadAuthorizations: [intended] });
  const receiptPath = join(root, 'receipt.json');
  const signaturePath = join(root, 'receipt.sig');
  writeFileSync(receiptPath, JSON.stringify({ ...minted.receipt, payloadAuthorizations: [injected] }));
  writeFileSync(signaturePath, minted.signature.toString('base64'));
  const previousReceipt = process.env.OMD_SELF_SIGNED_RECEIPT;
  const previousSignature = process.env.OMD_SELF_SIGNED_SIGNATURE;
  process.env.OMD_SELF_SIGNED_RECEIPT = receiptPath;
  process.env.OMD_SELF_SIGNED_SIGNATURE = signaturePath;
  t.after(() => {
    if (previousReceipt === undefined) delete process.env.OMD_SELF_SIGNED_RECEIPT;
    else process.env.OMD_SELF_SIGNED_RECEIPT = previousReceipt;
    if (previousSignature === undefined) delete process.env.OMD_SELF_SIGNED_SIGNATURE;
    else process.env.OMD_SELF_SIGNED_SIGNATURE = previousSignature;
  });
  // When: the consumer is asked to trust the forged purpose and exact forged payload.
  // Then: it rejects the signature before granting authority or spending its nonce.
  assert.throws(() => requireHostPayloadAuthorization(invocation, root, 'final-evidence-manifest', payload), ActivationContextValidationError);
  assert.equal(claimNonce(root, minted.receipt.nonce), true);
});

test('a consumed receipt nonce cannot be replayed in a fresh Node process', t => {
  // Given: a legitimate receipt whose nonce has already been consumed.
  const root = project(t);
  const minted = mintSelfSignedReceipt({ projectRoot: root, ...identity, payloadAuthorizations: [intended] });
  assert.equal(claimNonce(root, minted.receipt.nonce), true);
  const moduleUrl = new URL('../core/runtime/self-signed-activation.ts', import.meta.url).href;
  const driver = `import { claimNonce } from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify(claimNonce(process.argv[1], process.argv[2])));`;
  // When: another real process tries to claim that nonce.
  const replay = spawnSync(process.execPath, ['--input-type=module', '--eval', driver, root, minted.receipt.nonce], { encoding: 'utf8', timeout: 10_000 });
  // Then: persistent replay protection refuses it without a process-local cache.
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(replay.stdout, 'false');
});

async function concurrentClaims(t: TestContext, root: string, scenario: Readonly<{ nonces: readonly string[]; barrier: 'read' | 'exists' }>): Promise<boolean[]> {
  const moduleUrl = new URL('../core/runtime/self-signed-activation.ts', import.meta.url).href;
  const driver = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { join } from 'node:path';
    const journal = join(process.argv[1], '.omd/activation/consumed-nonces.jsonl');
    const operation = process.argv[3] === 'read' ? 'readFileSync' : 'existsSync';
    const original = fs[operation];
    let paused = false;
    fs[operation] = (...args) => {
      const result = original(...args);
      if (args[0] === journal && !paused) {
        paused = true;
        fs.writeSync(1, 'ready\\n');
        fs.readSync(0, Buffer.alloc(1), 0, 1, null);
      }
      return result;
    };
    syncBuiltinESMExports();
    const { claimNonce } = await import(${JSON.stringify(moduleUrl)});
    fs.writeSync(1, JSON.stringify(claimNonce(process.argv[1], process.argv[2])));
  `;
  const children = scenario.nonces.map(nonce => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', driver, root, nonce, scenario.barrier], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000 });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    let output = '', errors = '';
    child.stderr.on('data', chunk => { errors += chunk.toString(); });
    const ready = new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => { if (!output.startsWith('ready\n')) reject(new Error(`claim child exited before barrier: ${errors}`)); });
      child.stdout.on('data', chunk => {
        output += chunk.toString();
        if (output.startsWith('ready\n')) resolve();
      });
    });
    const done = once(child, 'close').then(([code]) => {
      assert.equal(code, 0, errors);
      const result: unknown = JSON.parse(output.slice('ready\n'.length));
      assert.equal(typeof result, 'boolean');
      return result === true;
    });
    return { child, ready, done };
  });
  await Promise.all(children.map(child => child.ready));
  for (const child of children) child.child.stdin.end('x');
  return Promise.all(children.map(child => child.done));
}

test('concurrent processes claim the same previously unseen nonce exactly once', async t => {
  // Given: every process reads the same unclaimed journal state before continuing.
  const root = project(t);
  mkdirSync(join(root, '.omd/activation'), { recursive: true });
  writeFileSync(join(root, '.omd/activation/consumed-nonces.jsonl'), '');
  // When: real processes race to claim the same nonce after a shared read barrier.
  const claims = await concurrentClaims(t, root, { nonces: Array.from({ length: 4 }, () => 'd'.repeat(32)), barrier: 'read' });
  // Then: exactly one wins the atomic claim.
  assert.equal(claims.filter(Boolean).length, 1);
});

test('concurrent first claims preserve every consumed nonce for later replay refusal', async t => {
  // Given: each process observes that the journal does not yet exist.
  const root = project(t);
  const nonces = ['a', 'b', 'c', 'd'].map(value => value.repeat(32));
  // When: distinct claims create the journal concurrently.
  const claims = await concurrentClaims(t, root, { nonces, barrier: 'exists' });
  // Then: all succeed once and none becomes replayable after the competing writes.
  assert.deepEqual(claims, nonces.map(() => true));
  assert.deepEqual(nonces.map(nonce => claimNonce(root, nonce)), nonces.map(() => false));
});

test('legacy journal entries remain consumed without per-nonce claim files', t => {
  // Given: a nonce was consumed by the previous journal-only implementation.
  const root = project(t);
  mkdirSync(join(root, '.omd/activation'), { recursive: true });
  writeFileSync(join(root, '.omd/activation/consumed-nonces.jsonl'), `${'e'.repeat(32)}\n`);
  // When: the current implementation receives the old nonce.
  const claimed = claimNonce(root, 'e'.repeat(32));
  // Then: migration cannot make it replayable.
  assert.equal(claimed, false);
});

test('an atomic claim remains consumed if its audit journal loses the entry', t => {
  // Given: a claim exists but its separate audit journal has lost the recorded entry.
  const root = project(t);
  assert.equal(claimNonce(root, 'f'.repeat(32)), true);
  writeFileSync(join(root, '.omd/activation/consumed-nonces.jsonl'), '');
  // When: a consumer attempts that nonce again.
  const replay = claimNonce(root, 'f'.repeat(32));
  // Then: atomic ownership remains authoritative.
  assert.equal(replay, false);
});
