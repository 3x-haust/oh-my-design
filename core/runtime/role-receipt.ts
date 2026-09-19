// The signed role-result receipt shape, kept separate so the reviewer publications can name what
// they verify without importing the runtime that used to produce it. The signature now comes from
// the run's own project key (`core/runtime/self-signed-activation.ts`), not a host launcher; an eye
// verdict is admissible only with a signature over these exact fields.

export const CODEX_ROLE_RESULT_SCHEMA = 'omd-codex-role-result-v1' as const;
export const CODEX_ROLE_EXEC_RESULT_SCHEMA = 'omd-codex-role-exec-result-v1' as const;

export type CodexRoleAuthorityReceipt = Readonly<{
  schema: typeof CODEX_ROLE_EXEC_RESULT_SCHEMA;
  role: string;
  projectRoot: string;
  status: 'completed' | 'failed';
  exitCode: number | null;
  signal: string | null;
  eventCount: number;
  finalMessage: string;
  processPid: number;
  roleNonce: string;
  taskSha256?: string;
  studyDirectory?: string;
  reviewerEvidence?: Readonly<{
    schema: 'omd-reviewer-evidence-consumption-v1';
    evidenceSha256: string;
    packetSha256: string;
    taskSha256: string;
    childPid: number;
    sessionId: string;
    nonce: string;
  }>;
  modelArgumentOmitted?: boolean;
  model?: string;
  modelReasoningEffort?: string;
  configurationSha256: string;
  buildSha256: string;
  briefSha256: string;
  sessionId?: string;
  failure?: string;
}>;

export type CodexRoleResult = Readonly<{
  schema: typeof CODEX_ROLE_RESULT_SCHEMA;
  agent: string;
  projectRoot: string;
  result: 'completed' | 'failed';
  finalMessage: string;
  authority: Readonly<{ receipt: CodexRoleAuthorityReceipt; signature: string }>;
}>;
