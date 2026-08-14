import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLIENT = fileURLToPath(new URL('../../bin/omd-codex-authority-client.mjs', import.meta.url));
const MAX_RESPONSE_BYTES = 1024 * 1024;

type CodexHostRequestIdentity = Readonly<{
  requesterPid: number;
  cliPath: string;
  activationPath: string;
  projectRoot: string;
  argv: readonly string[];
  activation: Readonly<{
    schemaVersion: string;
    buildSha256: string;
    loadedSkillSha256: string;
    briefSha256: string;
    hostCapability: Readonly<{ host: string }>;
  }>;
}>;

export type CodexHostAuthorizationRequest = CodexHostRequestIdentity & Readonly<{
  schema: 'omd-codex-authority-request-v1';
  requestedAuthorization?: Readonly<{ purpose: string; payloadSha256: string; payloadBase64: string }>;
}>;

export type CodexOwnerLaunchRequest = CodexHostRequestIdentity & Readonly<{
  schema: 'omd-codex-owner-launch-request-v1';
  owner: 'omd-hand';
  taskSha256: string;
}>;

export type CodexOwnerExecRequest = CodexHostRequestIdentity & Readonly<{
  schema: 'omd-codex-owner-exec-request-v1';
  owner: 'omd-hand';
  taskSha256: string;
  grantNonce: string;
  attempt: 1 | 2;
  timeoutMs: number;
  task: string;
}>;

export type CodexOwnerPersistRequest = CodexHostRequestIdentity & Readonly<{
  schema: 'omd-codex-owner-persist-request-v1';
  owner: 'omd-hand';
  taskSha256: string;
  grantNonce: string;
  resultSha256: string;
  result: Record<string, unknown>;
}>;

/**
 * The TypeScript CLI cannot synchronously service a Node socket itself. A tiny host-owned helper
 * performs the exchange in a separate process while this process blocks; the broker verifies that
 * helper's real parent and the canonical OMD CLI process before issuing anything.
 */
export function requestCodexHostAuthority(socketPath: string, request: CodexHostAuthorizationRequest | CodexOwnerLaunchRequest | CodexOwnerExecRequest | CodexOwnerPersistRequest): unknown {
  const result = spawnSync(process.execPath, [CLIENT, socketPath], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    maxBuffer: MAX_RESPONSE_BYTES,
    env: {
      PATH: process.env.PATH ?? '',
      ...(process.env.OMD_CODEX_AUTHORITY_RESPONSE_DIR === undefined
        ? {}
        : { OMD_CODEX_AUTHORITY_RESPONSE_DIR: process.env.OMD_CODEX_AUTHORITY_RESPONSE_DIR }),
    },
  });
  if (result.status !== 0 || result.error !== undefined) return undefined;
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    return undefined;
  }
}
