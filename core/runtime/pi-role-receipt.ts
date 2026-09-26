import { canonicalJson } from '../ref/board-artifacts.ts';
import { verifyNativeObservation } from './self-signed-activation.ts';
import { PiReviewerError, piDigest, piHash, piInteger, piRecord, piText } from '../../adapters/pi-reviewer-contract.ts';

export const PI_ROLE_RESULT_SCHEMA = 'omd-pi-role-result-v1';
export const PI_ROLE_EXEC_RESULT_SCHEMA = 'omd-pi-role-exec-result-v1';
export type PiRoleAuthorityReceipt = Readonly<{
  schema: typeof PI_ROLE_EXEC_RESULT_SCHEMA; host: 'pi'; role: 'omd-eye'; projectRoot: string;
  status: 'completed'; exitCode: 0; signal: null; eventCount: number; finalMessage: string;
  processPid: number; roleNonce: string; sessionId: string; parentSessionId: string;
  taskSha256: string; configurationSha256: string; buildSha256: string; briefSha256: string;
  provider: string; model: string; modelReasoningEffort: string; modelSelection: 'inherited-pi-host';
  nodeSha256: string; cliSha256: string; bridgeSha256: string; systemPromptSha256: string; transcriptSha256: string;
  reviewerEvidence: Readonly<{
    schema: 'omd-reviewer-evidence-consumption-v1'; evidenceSha256: string; packetSha256: string;
    taskSha256: string; childPid: number; sessionId: string; nonce: string;
  }>;
}>;
export type PiRoleResult = Readonly<{
  schema: typeof PI_ROLE_RESULT_SCHEMA; agent: 'omd-eye'; projectRoot: string;
  result: 'completed'; finalMessage: string;
  authority: Readonly<{ receipt: PiRoleAuthorityReceipt; signature: string }>;
}>;
export const piRoleReceiptDigest = (receipt: PiRoleAuthorityReceipt): string => piHash(canonicalJson(receipt));

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new PiReviewerError('role-receipt-fields');
}
export function verifySignedPiEyeRoleResult(value: unknown, projectRoot: string): Readonly<{
  receipt: PiRoleAuthorityReceipt; finalMessage: string;
}> {
  const result = piRecord(value, 'role-result');
  exact(result, ['schema', 'agent', 'projectRoot', 'result', 'finalMessage', 'authority']);
  const authority = piRecord(result.authority, 'role-authority');
  exact(authority, ['receipt', 'signature']);
  const receipt = piRecord(authority.receipt, 'role-receipt');
  exact(receipt, ['schema', 'host', 'role', 'projectRoot', 'status', 'exitCode', 'signal', 'eventCount', 'finalMessage',
    'processPid', 'roleNonce', 'sessionId', 'parentSessionId', 'taskSha256', 'configurationSha256', 'buildSha256',
    'briefSha256', 'provider', 'model', 'modelReasoningEffort', 'modelSelection', 'nodeSha256', 'cliSha256',
    'bridgeSha256', 'systemPromptSha256', 'transcriptSha256', 'reviewerEvidence']);
  const proof = piRecord(receipt.reviewerEvidence, 'role-evidence');
  exact(proof, ['schema', 'evidenceSha256', 'packetSha256', 'taskSha256', 'childPid', 'sessionId', 'nonce']);
  if (result.schema !== PI_ROLE_RESULT_SCHEMA || result.agent !== 'omd-eye' || result.result !== 'completed'
    || result.projectRoot !== projectRoot || receipt.projectRoot !== projectRoot
    || receipt.schema !== PI_ROLE_EXEC_RESULT_SCHEMA || receipt.host !== 'pi' || receipt.role !== 'omd-eye'
    || receipt.status !== 'completed' || receipt.exitCode !== 0 || receipt.signal !== null
    || receipt.modelSelection !== 'inherited-pi-host' || proof.schema !== 'omd-reviewer-evidence-consumption-v1'
    || result.finalMessage !== receipt.finalMessage || receipt.sessionId === receipt.parentSessionId
    || proof.sessionId !== receipt.sessionId || proof.nonce !== receipt.roleNonce
    || proof.taskSha256 !== receipt.taskSha256 || proof.childPid === receipt.processPid
    || !/^(off|minimal|low|medium|high|xhigh)$/.test(String(receipt.modelReasoningEffort))) {
    throw new PiReviewerError('role-authority');
  }
  const processPid = piInteger(receipt.processPid, 'role-pid');
  const childPid = piInteger(proof.childPid, 'evidence-pid');
  const eventCount = piInteger(receipt.eventCount, 'role-events');
  if (processPid === 0 || childPid === 0 || eventCount === 0) throw new PiReviewerError('role-execution');
  const parsed: PiRoleAuthorityReceipt = Object.freeze({
    schema: PI_ROLE_EXEC_RESULT_SCHEMA, host: 'pi', role: 'omd-eye', projectRoot, status: 'completed', exitCode: 0, signal: null,
    eventCount, processPid, finalMessage: piText(receipt.finalMessage, 'role-final'),
    roleNonce: piText(receipt.roleNonce, 'role-nonce'), sessionId: piText(receipt.sessionId, 'role-session'),
    parentSessionId: piText(receipt.parentSessionId, 'role-parent-session'),
    taskSha256: piDigest(receipt.taskSha256, 'role-task'), configurationSha256: piDigest(receipt.configurationSha256, 'role-configuration'),
    buildSha256: piDigest(receipt.buildSha256, 'role-build'), briefSha256: piDigest(receipt.briefSha256, 'role-brief'),
    provider: piText(receipt.provider, 'role-provider'), model: piText(receipt.model, 'role-model'),
    modelReasoningEffort: piText(receipt.modelReasoningEffort, 'role-thinking'), modelSelection: 'inherited-pi-host',
    nodeSha256: piDigest(receipt.nodeSha256, 'role-node'), cliSha256: piDigest(receipt.cliSha256, 'role-cli'),
    bridgeSha256: piDigest(receipt.bridgeSha256, 'role-bridge'), systemPromptSha256: piDigest(receipt.systemPromptSha256, 'role-system'),
    transcriptSha256: piDigest(receipt.transcriptSha256, 'role-transcript'),
    reviewerEvidence: Object.freeze({ schema: 'omd-reviewer-evidence-consumption-v1',
      evidenceSha256: piDigest(proof.evidenceSha256, 'evidence-sha'), packetSha256: piDigest(proof.packetSha256, 'packet-sha'),
      taskSha256: piDigest(proof.taskSha256, 'evidence-task'), childPid,
      sessionId: piText(proof.sessionId, 'evidence-session'), nonce: piText(proof.nonce, 'evidence-nonce'),
    }),
  });
  if (!verifyNativeObservation(projectRoot, PI_ROLE_EXEC_RESULT_SCHEMA, piRoleReceiptDigest(parsed),
    piText(authority.signature, 'role-signature'))) throw new PiReviewerError('role-signature');
  return Object.freeze({ receipt: parsed, finalMessage: parsed.finalMessage });
}
