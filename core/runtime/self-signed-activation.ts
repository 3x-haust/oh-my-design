// Self-signed activation.
//
// OMD used to get its authority from a brokered host process: a Codex launcher held a private key,
// signed a receipt that named each authorized payload, and the CLI verified that signature. Removing
// the launcher (so OMD attaches to whatever host is already running) therefore cannot simply delete
// the signing step — `requireHostPayloadAuthorization` would have nothing to verify, and the
// `activation`, `source-seal` and `independent-review` gates would become decorative.
//
// This module keeps the verification and moves the signing in-process. The key is an Ed25519 keypair
// whose private half lives in the project's `.omd/` directory, so authority is bound to ONE project
// root rather than to a host executable. What that buys, and what it honestly does not:
//
//   BUYS: a payload approval cannot be minted by a role, a spawned child, an imported script, or a
//   copied activation. Authorizing requires read access to the project's private key, and consuming
//   a receipt is once-only per nonce, so a captured receipt cannot be replayed. A receipt names the
//   exact project root, argv, build, skill bytes, and brief, so moving any of them invalidates it.
//
//   DOES NOT BUY: protection from the user's own shell, which can read the key. That was equally true
//   of the launcher — it too ran as the user and left its key readable to the same uid. This is not a
//   sandbox and must never be described as one. It is the same trust boundary, expressed without a
//   host process.
//
// Nonces are claimed in a project-local journal, not just in memory, because the process that minted
// a receipt may be gone by the time a replay is attempted.

import { createHash, generateKeyPairSync, randomBytes, sign, verify, createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { accessSync, chmodSync, closeSync, constants as fsConstants, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export const SELF_SIGNED_RECEIPT_SCHEMA = 'omd-self-signed-receipt-v1' as const;
export const ACTIVATION_KEY_DIRECTORY = '.omd/activation';
const PRIVATE_KEY_PATH = `${ACTIVATION_KEY_DIRECTORY}/project.key`;
const PUBLIC_KEY_PATH = `${ACTIVATION_KEY_DIRECTORY}/project.pub`;
const NONCE_JOURNAL_PATH = `${ACTIVATION_KEY_DIRECTORY}/consumed-nonces.jsonl`;
const NONCE_CLAIMS_DIRECTORY = `${ACTIVATION_KEY_DIRECTORY}/consumed-nonces`;

/** Receipts are short-lived: long enough for one command, short enough that a leak ages out. */
export const SELF_SIGNED_RECEIPT_TTL_MS = 15 * 60 * 1000;

export type SelfSignedPayloadAuthorization = Readonly<{
  purpose: string;
  payloadSha256: string;
}>;

export type SelfSignedReceipt = Readonly<{
  schema: typeof SELF_SIGNED_RECEIPT_SCHEMA;
  projectRoot: string;
  argvSha256: string;
  buildSha256: string;
  loadedSkillSha256: string;
  briefSha256: string;
  payloadAuthorizations: readonly SelfSignedPayloadAuthorization[];
  expiresAt: number;
  nonce: string;
}>;

export class SelfSignedActivationError extends Error {
  override readonly name = 'SelfSignedActivationError';
  constructor(reason: string) { super(`self-signed activation is invalid: ${reason}`); }
}

const fail = (reason: string): never => { throw new SelfSignedActivationError(reason); };
const sha256Hex = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(value, (_key: string, entry: unknown): unknown =>
  typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
    : entry);

/**
 * Reads the project keypair, creating it once. The private key is 0600 and the directory 0700; a
 * readable-by-others key would let any process on the machine mint approvals for this project.
 */
function projectKeyPair(projectRoot: string, create: boolean): { privateKey: KeyObject; publicKey: KeyObject } {
  const directory = join(projectRoot, ACTIVATION_KEY_DIRECTORY);
  const privatePath = join(projectRoot, PRIVATE_KEY_PATH);
  const publicPath = join(projectRoot, PUBLIC_KEY_PATH);
  if (!existsSync(privatePath)) {
    if (!create) fail(`no project activation key at ${PRIVATE_KEY_PATH}; run any omd command to establish one`);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const pair = generateKeyPairSync('ed25519');
    // Write-then-rename so a crashed first run cannot leave a truncated key behind.
    const staging = `${privatePath}.${process.pid}.tmp`;
    writeFileSync(staging, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, { mode: 0o600 });
    const fd = openSync(staging, fsConstants.O_RDONLY);
    try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(staging, privatePath);
    chmodSync(privatePath, 0o600);
    writeFileSync(publicPath, pair.publicKey.export({ type: 'spki', format: 'pem' }) as string, { mode: 0o600 });
    return pair;
  }
  const stat = lstatSync(privatePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${PRIVATE_KEY_PATH} must be a regular file, not a symlink`);
  if ((stat.mode & 0o077) !== 0) {
    // Repair rather than refuse: a repo copied between machines commonly loses the mode, and
    // refusing would make every command in that project fail for a fixable reason.
    chmodSync(privatePath, 0o600);
  }
  const privateKey = createPrivateKey(readFileSync(privatePath));
  const publicKey = createPublicKey(readFileSync(publicPath));
  return { privateKey, publicKey };
}

/** True when this project already holds a key, so a caller can avoid creating one as a side effect. */
export function hasActivationKey(projectRoot: string): boolean {
  try {
    accessSync(join(projectRoot, PRIVATE_KEY_PATH), fsConstants.R_OK);
    return true;
  } catch { return false; }
}

export type MintReceiptInput = Readonly<{
  projectRoot: string;
  argv: readonly string[];
  buildSha256: string;
  loadedSkillSha256: string;
  briefSha256: string;
  payloadAuthorizations: readonly SelfSignedPayloadAuthorization[];
  /** Injection point for tests; production callers omit it. */
  now?: number;
  nonce?: string;
}>;

/**
 * Mints the receipt the CLI then verifies. `payloadAuthorizations` must name exact payload digests:
 * an empty list authorizes this command's identity but no AI-derived artifact.
 */
export function mintSelfSignedReceipt(input: MintReceiptInput): { receipt: SelfSignedReceipt; signature: Buffer } {
  const { privateKey } = projectKeyPair(input.projectRoot, true);
  const receipt: SelfSignedReceipt = Object.freeze({
    schema: SELF_SIGNED_RECEIPT_SCHEMA,
    projectRoot: input.projectRoot,
    argvSha256: sha256Hex(JSON.stringify(input.argv)),
    buildSha256: input.buildSha256,
    loadedSkillSha256: input.loadedSkillSha256,
    briefSha256: input.briefSha256,
    payloadAuthorizations: Object.freeze(input.payloadAuthorizations.map((authorization) => Object.freeze({
      purpose: authorization.purpose,
      payloadSha256: authorization.payloadSha256,
    }))),
    expiresAt: (input.now ?? Date.now()) + SELF_SIGNED_RECEIPT_TTL_MS,
    nonce: input.nonce ?? randomBytes(16).toString('hex'),
  });
  const signature = sign(null, Buffer.from(canonical(receipt)), privateKey);
  return { receipt, signature };
}

export type VerifyReceiptInput = Readonly<{
  projectRoot: string;
  receipt: unknown;
  signature: Buffer;
  expected: Readonly<{
    argv: readonly string[];
    buildSha256: string;
    loadedSkillSha256: string;
    briefSha256: string;
  }>;
  now?: number;
}>;

export type VerifyReceiptResult =
  | Readonly<{ ok: true; receipt: SelfSignedReceipt }>
  | Readonly<{ ok: false; reason: string }>;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Verifies signature, binding, freshness, and nonce in that order. Every branch returns a named
 * reason rather than a boolean, because "why was this receipt refused" is what a caller reports.
 */
export function verifySelfSignedReceipt(input: VerifyReceiptInput): VerifyReceiptResult {
  const value = record(input.receipt);
  if (value === null) return { ok: false, reason: 'receipt must be an object' };
  const keys = Object.keys(value).sort();
  const expectedKeys = ['argvSha256', 'briefSha256', 'buildSha256', 'expiresAt', 'loadedSkillSha256', 'nonce', 'payloadAuthorizations', 'projectRoot', 'schema'].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    return { ok: false, reason: 'receipt has unknown or missing keys' };
  }
  if (value.schema !== SELF_SIGNED_RECEIPT_SCHEMA) return { ok: false, reason: `schema must be ${SELF_SIGNED_RECEIPT_SCHEMA}` };

  let publicKey: KeyObject;
  try { publicKey = projectKeyPair(input.projectRoot, false).publicKey; }
  catch { return { ok: false, reason: 'this project holds no activation key, so no receipt can be trusted' }; }

  if (!verify(null, Buffer.from(canonical(value)), publicKey, input.signature)) {
    return { ok: false, reason: 'signature does not match this project key' };
  }
  if (value.projectRoot !== input.projectRoot) {
    return { ok: false, reason: 'receipt names a different project root' };
  }
  if (value.argvSha256 !== sha256Hex(JSON.stringify(input.expected.argv))) {
    return { ok: false, reason: 'receipt was minted for a different command' };
  }
  for (const field of ['buildSha256', 'loadedSkillSha256', 'briefSha256'] as const) {
    if (value[field] !== input.expected[field]) {
      return { ok: false, reason: `receipt ${field} is stale against the current run` };
    }
  }
  for (const field of ['argvSha256', 'buildSha256', 'loadedSkillSha256', 'briefSha256'] as const) {
    if (typeof value[field] !== 'string' || !SHA256.test(value[field])) return { ok: false, reason: `receipt ${field} must be a sha256` };
  }
  if (typeof value.expiresAt !== 'number' || !Number.isSafeInteger(value.expiresAt)) return { ok: false, reason: 'receipt expiresAt must be an integer' };
  if (value.expiresAt <= (input.now ?? Date.now())) return { ok: false, reason: 'receipt is expired' };
  if (typeof value.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(value.nonce)) return { ok: false, reason: 'receipt nonce must be 32 hex characters' };
  if (!Array.isArray(value.payloadAuthorizations)) return { ok: false, reason: 'receipt payloadAuthorizations must be an array' };
  for (const [index, authorization] of value.payloadAuthorizations.entries()) {
    const entry = record(authorization);
    if (entry === null || Object.keys(entry).sort().join(',') !== 'payloadSha256,purpose') {
      return { ok: false, reason: `payloadAuthorizations[${index}] has unknown or missing keys` };
    }
    if (typeof entry.purpose !== 'string' || entry.purpose === '') return { ok: false, reason: `payloadAuthorizations[${index}].purpose must be a non-empty string` };
    if (typeof entry.payloadSha256 !== 'string' || !SHA256.test(entry.payloadSha256)) return { ok: false, reason: `payloadAuthorizations[${index}].payloadSha256 must be a sha256` };
  }
  return { ok: true, receipt: value as unknown as SelfSignedReceipt };
}

/**
 * Exclusive claim files arbitrate concurrent consumers; the journal also preserves legacy claims.
 * A successful claim is never removed, even if its later audit append fails.
 */
export function claimNonce(projectRoot: string, nonce: string): boolean {
  const path = join(projectRoot, NONCE_JOURNAL_PATH);
  mkdirSync(join(projectRoot, ACTIVATION_KEY_DIRECTORY), { recursive: true, mode: 0o700 });
  if (existsSync(path)) {
    if (lstatSync(path).isSymbolicLink()) fail(`${NONCE_JOURNAL_PATH} must not be a symlink`);
    const claimed = new Set(readFileSync(path, 'utf8').split('\n').filter(Boolean));
    if (claimed.has(nonce)) return false;
  }
  const claims = join(projectRoot, NONCE_CLAIMS_DIRECTORY);
  mkdirSync(claims, { recursive: true, mode: 0o700 });
  if (lstatSync(claims).isSymbolicLink()) fail(`${NONCE_CLAIMS_DIRECTORY} must not be a symlink`);
  let claim: number;
  try {
    claim = openSync(join(claims, sha256Hex(nonce)), fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, 'code') === 'EEXIST') return false;
    throw error;
  }
  try { fsyncSync(claim); } finally { closeSync(claim); }
  const fd = openSync(path, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, 0o600);
  try { writeSync(fd, `${nonce}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  return true;
}

/** The exact payload digest a receipt must name to authorize these bytes. */
export const authorizationFor = (purpose: string, payload: Uint8Array): SelfSignedPayloadAuthorization =>
  Object.freeze({ purpose, payloadSha256: sha256Hex(payload) });

/** Durable native observation, NOT an activation or independent judgment. Only native execution
 * publishers call this after capture. Same-user key access is outside this protocol boundary. */
export function signNativeObservation(projectRoot: string, kind: string, payloadSha256: string): string {
  projectRoot = realpathSync(projectRoot); // /var and /private/var name the same macOS project across CLI processes.
  const { privateKey } = projectKeyPair(projectRoot, true);
  return sign(null, Buffer.from(JSON.stringify(['omd-native-observation-v1', projectRoot, kind, payloadSha256])), privateKey).toString('base64');
}
export function verifyNativeObservation(projectRoot: string, kind: string, payloadSha256: string, signature: string): boolean {
  try {
    projectRoot = realpathSync(projectRoot);
    const { publicKey } = projectKeyPair(projectRoot, false);
    return verify(null, Buffer.from(JSON.stringify(['omd-native-observation-v1', projectRoot, kind, payloadSha256])), publicKey, Buffer.from(signature, 'base64'));
  } catch { return false; }
}
