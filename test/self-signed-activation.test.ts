import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ACTIVATION_KEY_DIRECTORY,
  SELF_SIGNED_RECEIPT_SCHEMA,
  SELF_SIGNED_RECEIPT_TTL_MS,
  SelfSignedActivationError,
  authorizationFor,
  claimNonce,
  hasActivationKey,
  mintSelfSignedReceipt,
  verifySelfSignedReceipt,
} from '../core/runtime/self-signed-activation.ts';

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-selfsigned-'));

const identity = () => ({
  argv: ['check', 'index.html'],
  buildSha256: 'a'.repeat(64),
  loadedSkillSha256: 'b'.repeat(64),
  briefSha256: 'c'.repeat(64),
});

function mintedWith(root: string, authorizations: readonly { purpose: string; payloadSha256: string }[] = []) {
  const id = identity();
  return mintSelfSignedReceipt({ projectRoot: root, ...id, payloadAuthorizations: authorizations });
}

type Minted = ReturnType<typeof mintedWith>;

const verify = (root: string, receipt: Minted, expected = identity()) =>
  verifySelfSignedReceipt({ projectRoot: root, receipt: receipt.receipt, signature: receipt.signature, expected });

test('a minted receipt verifies against its own project and names its payloads', () => {
  const root = project();
  const payload = new Uint8Array([1, 2, 3]);
  const receipt = mintedWith(root, [authorizationFor('adaptive-route-authority', payload)]);
  const result = verify(root, receipt);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receipt.schema, SELF_SIGNED_RECEIPT_SCHEMA);
  assert.equal(result.receipt.payloadAuthorizations[0]!.purpose, 'adaptive-route-authority');
  assert.equal(result.receipt.payloadAuthorizations[0]!.payloadSha256, createHash('sha256').update(payload).digest('hex'));
});

test('the key is created once, confined to the project, and not world-readable', () => {
  const root = project();
  assert.equal(hasActivationKey(root), false);
  mintedWith(root);
  assert.equal(hasActivationKey(root), true);

  const keyPath = join(root, ACTIVATION_KEY_DIRECTORY, 'project.key');
  const stat = lstatSync(keyPath);
  assert.equal(stat.isFile(), true);
  assert.equal(stat.mode & 0o077, 0, 'the private key must not be readable by other users');

  const first = readFileSync(keyPath, 'utf8');
  mintedWith(root);
  assert.equal(readFileSync(keyPath, 'utf8'), first, 'the key is reused, not regenerated per call');
});

test("another project's key cannot verify this project's receipt", () => {
  const mine = project();
  const theirs = project();
  const minted = mintedWith(mine, []);
  // Give the other project its own key, so the refusal is about identity and not a missing key.
  mintedWith(theirs, []);
  const result = verifySelfSignedReceipt({
    projectRoot: theirs, receipt: minted.receipt, signature: minted.signature, expected: identity(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /different project root|signature/);
});

test('a project with no key refuses every receipt rather than trusting one', () => {
  const root = project();
  const minted = mintedWith(project(), []);
  const result = verify(root, minted);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /holds no activation key/);
});

test('a tampered receipt fails signature verification', () => {
  const root = project();
  const receipt = mintedWith(root, []);
  const tampered = { ...receipt.receipt, payloadAuthorizations: [{ purpose: 'final-evidence-manifest', payloadSha256: 'd'.repeat(64) }] };
  const result = verifySelfSignedReceipt({ projectRoot: root, receipt: tampered, signature: receipt.signature, expected: identity() });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /signature/);
});

test('a receipt minted for another command does not authorize this one', () => {
  const root = project();
  const receipt = mintedWith(root, []);
  const result = verifySelfSignedReceipt({
    projectRoot: root, receipt: receipt.receipt, signature: receipt.signature,
    expected: { ...identity(), argv: ['production', 'run'] },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /different command/);
});

test('a stale build, skill, or brief invalidates the receipt', () => {
  const root = project();
  const receipt = mintedWith(root, []);
  for (const field of ['buildSha256', 'loadedSkillSha256', 'briefSha256'] as const) {
    const result = verifySelfSignedReceipt({
      projectRoot: root, receipt: receipt.receipt, signature: receipt.signature,
      expected: { ...identity(), [field]: 'e'.repeat(64) },
    });
    assert.equal(result.ok, false, field);
    if (!result.ok) assert.match(result.reason, /stale/);
  }
});

test('an expired receipt is refused', () => {
  const root = project();
  const id = identity();
  const minted = mintSelfSignedReceipt({ projectRoot: root, ...id, payloadAuthorizations: [], now: 1_000 });
  const fresh = verifySelfSignedReceipt({ projectRoot: root, receipt: minted.receipt, signature: minted.signature, expected: id, now: 1_000 + SELF_SIGNED_RECEIPT_TTL_MS - 1 });
  assert.equal(fresh.ok, true);
  const expired = verifySelfSignedReceipt({ projectRoot: root, receipt: minted.receipt, signature: minted.signature, expected: id, now: 1_000 + SELF_SIGNED_RECEIPT_TTL_MS });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.match(expired.reason, /expired/);
});

test('a shape-extended receipt is refused rather than partially read', () => {
  const root = project();
  const receipt = mintedWith(root, []);
  for (const extra of [
    { ...receipt.receipt, granted: true },
    { ...receipt.receipt, payloadAuthorizations: [{ purpose: 'x', payloadSha256: 'f'.repeat(64), note: 'y' }] },
    { ...receipt.receipt, payloadAuthorizations: [{ purpose: '', payloadSha256: 'f'.repeat(64) }] },
    { ...receipt.receipt, nonce: 'short' },
  ]) {
    const result = verifySelfSignedReceipt({ projectRoot: root, receipt: extra, signature: receipt.signature, expected: identity() });
    assert.equal(result.ok, false);
  }
});

test('a nonce is claimed exactly once, across processes', () => {
  const root = project();
  assert.equal(claimNonce(root, 'a'.repeat(32)), true);
  assert.equal(claimNonce(root, 'a'.repeat(32)), false, 'a replay in the same process is refused');
  // A second call after the first returns re-reads the journal, which is the cross-process path.
  assert.equal(claimNonce(root, 'b'.repeat(32)), true);
  assert.equal(claimNonce(root, 'a'.repeat(32)), false);
  assert.match(readFileSync(join(root, ACTIVATION_KEY_DIRECTORY, 'consumed-nonces.jsonl'), 'utf8'), /a{32}/);
});

test('a key copied between machines with the wrong mode is repaired, not refused', () => {
  const root = project();
  mintedWith(root);
  const keyPath = join(root, ACTIVATION_KEY_DIRECTORY, 'project.key');
  chmodSync(keyPath, 0o644);
  const result = verify(root, mintedWith(root, []));
  assert.equal(result.ok, true);
  assert.equal(lstatSync(keyPath).mode & 0o077, 0, 'the mode is repaired on the next read');
});

test('a symlinked key file is refused', () => {
  const root = project();
  mintedWith(root);
  const keyPath = join(root, ACTIVATION_KEY_DIRECTORY, 'project.key');
  const real = `${keyPath}.real`;
  writeFileSync(real, readFileSync(keyPath));
  unlinkSync(keyPath);
  symlinkSync(real, keyPath);
  assert.throws(() => mintedWith(root, []), SelfSignedActivationError);
  assert.equal(existsSync(join(root, ACTIVATION_KEY_DIRECTORY, 'project.pub')), true);
});

test('the activation directory is created lazily, not by reading a receipt', () => {
  const root = project();
  mkdirSync(join(root, '.omd'), { recursive: true });
  assert.equal(existsSync(join(root, ACTIVATION_KEY_DIRECTORY)), false);
  verifySelfSignedReceipt({ projectRoot: root, receipt: {}, signature: Buffer.alloc(0), expected: identity() });
  assert.equal(existsSync(join(root, ACTIVATION_KEY_DIRECTORY)), false, 'verification must not mint a key as a side effect');
});
