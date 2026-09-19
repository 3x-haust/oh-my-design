import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requireHostPayloadAuthorization, hasHostBoundLocalProjectWriteAuthority, ActivationContextValidationError } from '../core/runtime/activation.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';
import { mintSelfSignedReceipt, claimNonce } from '../core/runtime/self-signed-activation.ts';

const project = (): string => realpathSync(mkdtempSync(join(tmpdir(), 'omd-wiring-')));
const invocationFor = (root: string) => createTestProjectRunInvocation(root);
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/**
 * These assert the WIRING between self-signed activation and `requireHostPayloadAuthorization`:
 * that the environment-supplied receipt reaches verification. The primitives have their own file.
 *
 * The write gate itself (`hasHostBoundLocalProjectWriteAuthority`) is a separate check that a local
 * invocation satisfies without any receipt, so authorization is exercised directly rather than
 * through a project write — asserting it via `adapter.write` would pass for the wrong reason.
 * The invocation comes from `createTestProjectRunInvocation` because `createLocalCliInvocation`
 * refuses to mint authority outside a real CLI entrypoint, which this file is not.
 */
function withReceipt<T>(root: string, receiptBytes: { receipt: unknown; signature: string }, run: () => T): T {
  const receiptPath = join(root, 'receipt.json');
  const signaturePath = join(root, 'receipt.sig');
  writeFileSync(receiptPath, JSON.stringify(receiptBytes.receipt));
  writeFileSync(signaturePath, receiptBytes.signature);
  const previousReceipt = process.env.OMD_SELF_SIGNED_RECEIPT;
  const previousSignature = process.env.OMD_SELF_SIGNED_SIGNATURE;
  process.env.OMD_SELF_SIGNED_RECEIPT = receiptPath;
  process.env.OMD_SELF_SIGNED_SIGNATURE = signaturePath;
  try {
    return run();
  } finally {
    if (previousReceipt === undefined) delete process.env.OMD_SELF_SIGNED_RECEIPT;
    else process.env.OMD_SELF_SIGNED_RECEIPT = previousReceipt;
    if (previousSignature === undefined) delete process.env.OMD_SELF_SIGNED_SIGNATURE;
    else process.env.OMD_SELF_SIGNED_SIGNATURE = previousSignature;
  }
}

test('a self-signed receipt authorizes the exact payload it names', () => {
  const root = project();
  const invocation = invocationFor(root);
  const payload = new TextEncoder().encode('{"schema":"authorized-payload"}');
  const minted = mintSelfSignedReceipt({
    projectRoot: root,
    // The consumer compares the receipt against its own argv, so mint with this process's argv.
    argv: process.argv,
    buildSha256: invocation.activation.buildSha256,
    loadedSkillSha256: invocation.activation.loadedSkillSha256,
    briefSha256: invocation.activation.briefSha256,
    payloadAuthorizations: [{ purpose: 'adaptive-route-authority', payloadSha256: sha256(payload) }],
  });
  withReceipt(root, { receipt: minted.receipt, signature: minted.signature.toString('base64') }, () => {
    assert.doesNotThrow(() => requireHostPayloadAuthorization(invocation, root, 'adaptive-route-authority', payload));
  });
});

test('a receipt naming a different payload does not authorize these bytes', () => {
  const root = project();
  const invocation = invocationFor(root);
  const payload = new TextEncoder().encode('{"schema":"authorized-payload"}');
  const minted = mintSelfSignedReceipt({
    projectRoot: root,
    argv: process.argv,
    buildSha256: invocation.activation.buildSha256,
    loadedSkillSha256: invocation.activation.loadedSkillSha256,
    briefSha256: invocation.activation.briefSha256,
    payloadAuthorizations: [{ purpose: 'adaptive-route-authority', payloadSha256: 'f'.repeat(64) }],
  });
  withReceipt(root, { receipt: minted.receipt, signature: minted.signature.toString('base64') }, () => {
    assert.throws(
      () => requireHostPayloadAuthorization(invocation, root, 'adaptive-route-authority', payload),
      ActivationContextValidationError,
    );
  });
});

test('a receipt for another purpose does not authorize this one', () => {
  const root = project();
  const invocation = invocationFor(root);
  const payload = new TextEncoder().encode('{"schema":"x"}');
  const minted = mintSelfSignedReceipt({
    projectRoot: root,
    argv: process.argv,
    buildSha256: invocation.activation.buildSha256,
    loadedSkillSha256: invocation.activation.loadedSkillSha256,
    briefSha256: invocation.activation.briefSha256,
    payloadAuthorizations: [{ purpose: 'final-evidence-manifest', payloadSha256: sha256(payload) }],
  });
  withReceipt(root, { receipt: minted.receipt, signature: minted.signature.toString('base64') }, () => {
    assert.throws(() => requireHostPayloadAuthorization(invocation, root, 'adaptive-route-authority', payload));
  });
});

test('a nonce is spent on disk, so a receipt cannot be replayed by another process', () => {
  const root = project();
  const invocation = invocationFor(root);
  const payload = new TextEncoder().encode('{"schema":"replay"}');
  const minted = mintSelfSignedReceipt({
    projectRoot: root,
    argv: process.argv,
    buildSha256: invocation.activation.buildSha256,
    loadedSkillSha256: invocation.activation.loadedSkillSha256,
    briefSha256: invocation.activation.briefSha256,
    payloadAuthorizations: [{ purpose: 'adaptive-route-authority', payloadSha256: sha256(payload) }],
  });
  withReceipt(root, { receipt: minted.receipt, signature: minted.signature.toString('base64') }, () => {
    assert.doesNotThrow(() => requireHostPayloadAuthorization(invocation, root, 'adaptive-route-authority', payload));
    // Within one command the same receipt is read more than once — the write gate and the payload
    // check both verify it — so a repeat here must succeed. The grant is one-shot ACROSS runs, which
    // the nonce journal enforces: another process cannot claim a spent nonce.
    assert.doesNotThrow(() => requireHostPayloadAuthorization(invocation, root, 'adaptive-route-authority', payload));
  });
  assert.equal(claimNonce(root, minted.receipt.nonce), false, 'a fresh process must not claim a spent nonce');
});

test('a tampered receipt is refused rather than partially trusted', () => {
  const root = project();
  const invocation = invocationFor(root);
  const payload = new TextEncoder().encode('{"schema":"tamper"}');
  const minted = mintSelfSignedReceipt({
    projectRoot: root,
    argv: process.argv,
    buildSha256: invocation.activation.buildSha256,
    loadedSkillSha256: invocation.activation.loadedSkillSha256,
    briefSha256: invocation.activation.briefSha256,
    payloadAuthorizations: [],
  });
  const forged = {
    ...minted.receipt,
    payloadAuthorizations: [{ purpose: 'adaptive-route-authority', payloadSha256: sha256(payload) }],
  };
  withReceipt(root, { receipt: forged, signature: minted.signature.toString('base64') }, () => {
    assert.throws(() => requireHostPayloadAuthorization(invocation, root, 'adaptive-route-authority', payload));
  });
});

test('the write gate requires the invocation own minted receipt, not merely a local invocation', () => {
  const root = project();
  const real = createTestProjectRunInvocation(root);
  assert.equal(hasHostBoundLocalProjectWriteAuthority(real, root), true, 'a CLI-issued invocation may write its own project');

  // A hand-built invocation carries no receipt. Being "local" must not be enough, or any process
  // that can import this module could write to the project.
  const forged = {
    activation: {
      schemaVersion: 'activation-context-v2',
      buildSha256: 'a'.repeat(64), loadedSkillSha256: 'b'.repeat(64), briefSha256: 'c'.repeat(64),
      hostCapability: { host: 'local' },
    },
    current: { buildSha256: 'a'.repeat(64), loadedSkillSha256: 'b'.repeat(64), briefSha256: 'c'.repeat(64) },
  } as never;
  assert.equal(hasHostBoundLocalProjectWriteAuthority(forged, root), false);
});

test('the write gate refuses a project other than the one the invocation was issued for', () => {
  const mine = project();
  const theirs = project();
  const invocation = createTestProjectRunInvocation(mine);
  assert.equal(hasHostBoundLocalProjectWriteAuthority(invocation, mine), true);
  assert.equal(hasHostBoundLocalProjectWriteAuthority(invocation, theirs), false);
});
