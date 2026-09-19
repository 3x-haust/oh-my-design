// Test helper: a real self-signed receipt for a spawned CLI.
//
// Tests used to hand a spawned CLI a hand-built "host" receipt over fd 3, which the deleted launcher
// verified with its own key. That mechanism is gone, so the honest replacement is to do what the real
// CLI does: mint a receipt with the project's own key and give it to the child through the same
// environment the production path reads.
//
// This keeps the tests' actual subject unchanged. They assert that an unauthorized run is refused and
// an authorized one proceeds; only the way authority is produced moved.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { mintSelfSignedReceipt, SELF_SIGNED_RECEIPT_TTL_MS } from '../../core/runtime/self-signed-activation.ts';

export const SELF_SIGNED_RECEIPT_ENV = 'OMD_SELF_SIGNED_RECEIPT';
export const SELF_SIGNED_SIGNATURE_ENV = 'OMD_SELF_SIGNED_SIGNATURE';

export function selfSignedReceiptEnv(
  root: string,
  argv: readonly string[],
  identity: Readonly<{ buildSha256: string; loadedSkillSha256: string; briefSha256: string }>,
  payloadAuthorizations: readonly { purpose: string; payloadSha256: string }[] = [],
  // A case testing a mismatched binding mints the receipt with that binding, rather than editing the
  // signed file afterwards — a receipt is a signature over its own content, so an edit invalidates it.
  overrides: Readonly<{ projectRoot?: string; expiresAt?: number }> = {},
): Readonly<Record<string, string>> {
  const canonicalRoot = realpathSync(root);
  // A forged-root case must produce a receipt genuinely SIGNED over the forged root, so the refusal
  // is about the binding rather than a broken signature.
  const minted = mintSelfSignedReceipt({
    projectRoot: overrides.projectRoot ?? canonicalRoot,
    argv,
    buildSha256: identity.buildSha256,
    loadedSkillSha256: identity.loadedSkillSha256,
    briefSha256: identity.briefSha256,
    payloadAuthorizations,
    ...(overrides.expiresAt === undefined ? {} : { now: overrides.expiresAt - SELF_SIGNED_RECEIPT_TTL_MS }),
  });
  const directory = join(canonicalRoot, '.omd', 'receipts');
  mkdirSync(directory, { recursive: true });
  // One pair per minted receipt: a nonce is single-use, so a shared path would let a later call
  // overwrite a receipt a still-running child has yet to read.
  const stamp = `${process.pid}-${(selfSignedReceiptSequence += 1)}`;
  const receiptPath = join(directory, `self-signed-${stamp}.json`);
  const signaturePath = join(directory, `self-signed-${stamp}.sig`);
  writeFileSync(receiptPath, JSON.stringify(minted.receipt));
  writeFileSync(signaturePath, minted.signature.toString('base64'));
  return Object.freeze({
    [SELF_SIGNED_RECEIPT_ENV]: receiptPath,
    [SELF_SIGNED_SIGNATURE_ENV]: signaturePath,
  });
}

let selfSignedReceiptSequence = 0;

export function readMintedReceipt(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}
