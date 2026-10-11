import { canonicalJson } from '../ref/board-artifacts.ts';
import { signNativeObservation, verifyNativeObservation } from './self-signed-activation.ts';
import { parseSourceStudyUsage, type SourceStudyUsage } from '../../adapters/pi-study-usage.ts';
import {
  parseSourceStudyHandback,
  SOURCE_STUDY_EFFORT,
  SOURCE_STUDY_ROLE,
  type SourceStudyFixedBindings,
  type SourceStudyHandback,
} from '../../adapters/pi-study-contract.ts';
import {
  PiReviewerError,
  piDigest,
  piHash,
  piInteger,
  piRecord,
  piText,
} from '../../adapters/pi-reviewer-contract.ts';

export const PI_STUDY_RESULT_SCHEMA = 'omd-pi-study-result-v1' as const;
export const PI_STUDY_EXEC_RESULT_SCHEMA = 'omd-pi-study-exec-result-v1' as const;
export const PI_STUDY_EVIDENCE_SCHEMA = 'omd-study-evidence-consumption-v1' as const;

export type PiStudyAuthorityReceipt = Readonly<{
  schema: typeof PI_STUDY_EXEC_RESULT_SCHEMA;
  host: 'pi';
  role: typeof SOURCE_STUDY_ROLE;
  projectRoot: string;
  status: 'completed';
  exitCode: 0;
  signal: null;
  eventCount: number;
  runtimeDurationMs: number;
  usage: SourceStudyUsage | null;
  finalMessage: string;
  processPid: number;
  roleNonce: string;
  sessionId: string;
  parentSessionId: string;
  taskSha256: string;
  configurationSha256: string;
  fixedBindings: SourceStudyFixedBindings;
  provider: string;
  model: string;
  modelReasoningEffort: typeof SOURCE_STUDY_EFFORT;
  modelSelection: 'inherited-pi-host';
  nodeSha256: string;
  cliSha256: string;
  bridgeSha256: string;
  systemPromptSha256: string;
  transcriptSha256: string;
  studyEvidence: Readonly<{
    schema: typeof PI_STUDY_EVIDENCE_SCHEMA;
    packetSha256: string;
    taskSha256: string;
    childPid: number;
    sessionId: string;
    nonce: string;
  }>;
}>;

export type PiSourceStudyResult = Readonly<{
  schema: typeof PI_STUDY_RESULT_SCHEMA;
  role: typeof SOURCE_STUDY_ROLE;
  projectRoot: string;
  result: 'completed';
  handback: SourceStudyHandback;
  authority: Readonly<{ receipt: PiStudyAuthorityReceipt; signature: string }>;
}>;

export const piStudyReceiptDigest = (receipt: PiStudyAuthorityReceipt): string =>
  piHash(canonicalJson(receipt));

export function signPiStudyResult(input: Readonly<{
  projectRoot: string;
  handback: SourceStudyHandback;
  finalMessage: string;
  eventCount: number;
  runtimeDurationMs: number;
  usage: SourceStudyUsage | null;
  processPid: number;
  roleNonce: string;
  sessionId: string;
  parentSessionId: string;
  taskSha256: string;
  configurationSha256: string;
  fixedBindings: SourceStudyFixedBindings;
  provider: string;
  model: string;
  nodeSha256: string;
  cliSha256: string;
  bridgeSha256: string;
  systemPromptSha256: string;
  transcriptSha256: string;
  packetSha256: string;
  childPid: number;
  evidenceSessionId: string;
  evidenceNonce: string;
}>): PiSourceStudyResult {
  const receipt: PiStudyAuthorityReceipt = Object.freeze({
    schema: PI_STUDY_EXEC_RESULT_SCHEMA,
    host: 'pi',
    role: SOURCE_STUDY_ROLE,
    projectRoot: input.projectRoot,
    status: 'completed',
    exitCode: 0,
    signal: null,
    eventCount: input.eventCount,
    runtimeDurationMs: input.runtimeDurationMs,
    usage: input.usage,
    finalMessage: input.finalMessage,
    processPid: input.processPid,
    roleNonce: input.roleNonce,
    sessionId: input.sessionId,
    parentSessionId: input.parentSessionId,
    taskSha256: input.taskSha256,
    configurationSha256: input.configurationSha256,
    fixedBindings: input.fixedBindings,
    provider: input.provider,
    model: input.model,
    modelReasoningEffort: SOURCE_STUDY_EFFORT,
    modelSelection: 'inherited-pi-host',
    nodeSha256: input.nodeSha256,
    cliSha256: input.cliSha256,
    bridgeSha256: input.bridgeSha256,
    systemPromptSha256: input.systemPromptSha256,
    transcriptSha256: input.transcriptSha256,
    studyEvidence: Object.freeze({
      schema: PI_STUDY_EVIDENCE_SCHEMA,
      packetSha256: input.packetSha256,
      taskSha256: input.taskSha256,
      childPid: input.childPid,
      sessionId: input.evidenceSessionId,
      nonce: input.evidenceNonce,
    }),
  });
  return Object.freeze({
    schema: PI_STUDY_RESULT_SCHEMA,
    role: SOURCE_STUDY_ROLE,
    projectRoot: input.projectRoot,
    result: 'completed',
    handback: input.handback,
    authority: Object.freeze({
      receipt,
      signature: signNativeObservation(input.projectRoot, PI_STUDY_EXEC_RESULT_SCHEMA, piStudyReceiptDigest(receipt)),
    }),
  });
}

function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
    throw new PiReviewerError('study-receipt-fields');
  }
}

function parseBindings(value: unknown): SourceStudyFixedBindings {
  const bindings = piRecord(value, 'study-receipt-bindings');
  exact(bindings, ['buildSha256', 'briefSha256', 'evidenceSha256', 'referenceSha256', 'contentSha256']);
  return Object.freeze({
    buildSha256: piDigest(bindings.buildSha256, 'study-build'),
    briefSha256: piDigest(bindings.briefSha256, 'study-brief'),
    evidenceSha256: piDigest(bindings.evidenceSha256, 'study-evidence'),
    referenceSha256: piDigest(bindings.referenceSha256, 'study-reference'),
    contentSha256: piDigest(bindings.contentSha256, 'study-content'),
  });
}

export function verifySignedPiStudyResult(value: unknown, projectRoot: string): Readonly<{
  receipt: PiStudyAuthorityReceipt;
  handback: SourceStudyHandback;
}> {
  const result = piRecord(value, 'study-result');
  exact(result, ['schema', 'role', 'projectRoot', 'result', 'handback', 'authority']);
  const authority = piRecord(result.authority, 'study-authority');
  exact(authority, ['receipt', 'signature']);
  const receipt = piRecord(authority.receipt, 'study-receipt');
  exact(receipt, [
    'schema', 'host', 'role', 'projectRoot', 'status', 'exitCode', 'signal', 'eventCount', 'runtimeDurationMs', 'usage', 'finalMessage',
    'processPid', 'roleNonce', 'sessionId', 'parentSessionId', 'taskSha256', 'configurationSha256',
    'fixedBindings', 'provider', 'model', 'modelReasoningEffort', 'modelSelection', 'nodeSha256',
    'cliSha256', 'bridgeSha256', 'systemPromptSha256', 'transcriptSha256', 'studyEvidence',
  ]);
  const proof = piRecord(receipt.studyEvidence, 'study-evidence-proof');
  exact(proof, ['schema', 'packetSha256', 'taskSha256', 'childPid', 'sessionId', 'nonce']);
  const fixedBindings = parseBindings(receipt.fixedBindings);
  if (result.schema !== PI_STUDY_RESULT_SCHEMA || result.role !== SOURCE_STUDY_ROLE
    || result.projectRoot !== projectRoot || result.result !== 'completed'
    || receipt.schema !== PI_STUDY_EXEC_RESULT_SCHEMA || receipt.host !== 'pi'
    || receipt.role !== SOURCE_STUDY_ROLE || receipt.projectRoot !== projectRoot
    || receipt.status !== 'completed' || receipt.exitCode !== 0 || receipt.signal !== null
    || receipt.modelReasoningEffort !== SOURCE_STUDY_EFFORT
    || receipt.modelSelection !== 'inherited-pi-host'
    || proof.schema !== PI_STUDY_EVIDENCE_SCHEMA
    || receipt.sessionId === receipt.parentSessionId
    || proof.sessionId !== receipt.sessionId || proof.nonce !== receipt.roleNonce
    || proof.taskSha256 !== receipt.taskSha256 || proof.childPid === receipt.processPid) {
    throw new PiReviewerError('study-authority');
  }
  const processPid = piInteger(receipt.processPid, 'study-pid');
  const childPid = piInteger(proof.childPid, 'study-evidence-pid');
  const eventCount = piInteger(receipt.eventCount, 'study-events');
  if (processPid === 0 || childPid === 0 || eventCount === 0) throw new PiReviewerError('study-execution');
  const finalMessage = piText(receipt.finalMessage, 'study-final');
  let parsedFinal: unknown;
  try { parsedFinal = JSON.parse(finalMessage); } catch { throw new PiReviewerError('study-final-json'); }
  const handback = parseSourceStudyHandback(parsedFinal, fixedBindings);
  if (canonicalJson(result.handback) !== canonicalJson(handback)) throw new PiReviewerError('study-handback');
  const parsed: PiStudyAuthorityReceipt = Object.freeze({
    schema: PI_STUDY_EXEC_RESULT_SCHEMA,
    host: 'pi',
    role: SOURCE_STUDY_ROLE,
    projectRoot,
    status: 'completed',
    exitCode: 0,
    signal: null,
    eventCount,
    runtimeDurationMs: piInteger(receipt.runtimeDurationMs, 'study-duration'),
    usage: parseSourceStudyUsage(receipt.usage),
    finalMessage,
    processPid,
    roleNonce: piText(receipt.roleNonce, 'study-nonce'),
    sessionId: piText(receipt.sessionId, 'study-session'),
    parentSessionId: piText(receipt.parentSessionId, 'study-parent-session'),
    taskSha256: piDigest(receipt.taskSha256, 'study-task'),
    configurationSha256: piDigest(receipt.configurationSha256, 'study-configuration'),
    fixedBindings,
    provider: piText(receipt.provider, 'study-provider'),
    model: piText(receipt.model, 'study-model'),
    modelReasoningEffort: SOURCE_STUDY_EFFORT,
    modelSelection: 'inherited-pi-host',
    nodeSha256: piDigest(receipt.nodeSha256, 'study-node'),
    cliSha256: piDigest(receipt.cliSha256, 'study-cli'),
    bridgeSha256: piDigest(receipt.bridgeSha256, 'study-bridge'),
    systemPromptSha256: piDigest(receipt.systemPromptSha256, 'study-system'),
    transcriptSha256: piDigest(receipt.transcriptSha256, 'study-transcript'),
    studyEvidence: Object.freeze({
      schema: PI_STUDY_EVIDENCE_SCHEMA,
      packetSha256: piDigest(proof.packetSha256, 'study-packet'),
      taskSha256: piDigest(proof.taskSha256, 'study-evidence-task'),
      childPid,
      sessionId: piText(proof.sessionId, 'study-evidence-session'),
      nonce: piText(proof.nonce, 'study-evidence-nonce'),
    }),
  });
  if (!verifyNativeObservation(projectRoot, PI_STUDY_EXEC_RESULT_SCHEMA, piStudyReceiptDigest(parsed),
    piText(authority.signature, 'study-signature'))) throw new PiReviewerError('study-signature');
  return Object.freeze({ receipt: parsed, handback });
}
