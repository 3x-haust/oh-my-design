import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPersistedRoute } from '../core/route/index.ts';
import { readPiRequest, readPiUserTurn, requestDigest } from '../extensions/omd-request-source.ts';
import { nativeJudgmentSources } from '../core/judgment/sources.ts';
import { knownFields, parseJudgment, publishJudgment, readCurrentJudgment, type JudgmentInput, type JudgmentPolicy, type JudgmentReceipt, type JudgmentVerificationContext } from '../core/judgment/index.ts';
import { DESIGN_LANGUAGE_READING_POLICY } from '../core/design-language/judgment.ts';
import { REFERENCE_JUDGMENT_DECISIONS, referenceJudgmentPolicy, type ReferenceJudgmentPurpose, type ReferenceJudgmentBinding } from '../core/ref/judgment-policy.ts';
import { signNativeObservation, verifyNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { readContainedRegularFile, projectRunInvocationSha256 } from '../core/ref/reference-selection.ts';
import type { ProjectRunInvocation } from '../core/runtime/invocation.ts';
import type { ProjectWriteAdapter } from '../core/runtime/project-write.ts';

const SIGNING_KIND = 'ai-judgment-record-v1';
const REQUEST_POLICIES: Record<string, JudgmentPolicy> = Object.fromEntries(([
  ['workflow-intent', ['implement', 'inspect', 'skill-only', 'other']],
  ['workflow-continuation', ['resume', 'pause', 'cancel', 'unrelated']],
  ['target-market', ['explicit', 'unspecified', 'excluded']],
] as const).map(([purpose, decisions]) => [purpose, {
  purpose, decisions, authorRoles: ['coordinator'],
  sourceKinds: purpose === 'workflow-continuation' ? ['user-turn'] : ['route-request'],
  fields: purpose === 'workflow-continuation' ? ['text'] : ['request'],
  requiredSourceKinds: purpose === 'workflow-continuation' ? ['user-turn'] : ['route-request'], mode: 'advisory',
  wholeUserTurn: purpose === 'workflow-continuation',
  parsePayload: (value: unknown) => {
    const { value: fields } = knownFields(value, purpose === 'workflow-continuation' ? ['routeSha256'] : [], purpose === 'target-market' ? ['region'] : [], purpose);
    if (purpose === 'workflow-continuation' && (typeof fields.routeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(fields.routeSha256)))
      throw new Error('AI_JUDGMENT_INVALID: routeSha256');
    if (purpose === 'target-market' && fields.region !== undefined
      && (typeof fields.region !== 'string' || !fields.region.trim())) throw new Error('AI_JUDGMENT_INVALID: region');
    return fields;
  },
} satisfies JudgmentPolicy]));
function policyFor(input: JudgmentInput): JudgmentPolicy {
  if (Object.hasOwn(REQUEST_POLICIES, input.purpose)) return REQUEST_POLICIES[input.purpose]!;
  if (input.purpose === 'design-language-reading') return DESIGN_LANGUAGE_READING_POLICY;
  if (Object.hasOwn(REFERENCE_JUDGMENT_DECISIONS, input.purpose)) {
    // Fields are exact JSON pointers into signed observations, not permission to choose a different source.
    const fields = input.quotes.map(quote => quote.field);
    return referenceJudgmentPolicy(input.purpose as ReferenceJudgmentPurpose, fields,
      input.quotes.some(quote => quote.source.kind === 'receipt') ? ['receipt'] : ['route-request']);
  }
  throw new Error('AI_JUDGMENT_INVALID: unknown policy');
}
function contextFor(root: string, invocation: ProjectRunInvocation, judgment: JudgmentInput): JudgmentVerificationContext {
  const request = readPiRequest(root);
  const requestOnly = judgment.purpose !== 'workflow-continuation' && Object.hasOwn(REQUEST_POLICIES, judgment.purpose);
  const route = requestOnly ? null : readPersistedRoute(root, invocation);
  if (!request || request.requestSha256 !== judgment.context.requestSha256
    || (route !== null && request.request !== route.request)
    || judgment.context.sourceContractSha256 !== (route?.sourceContractSha256 ?? null) || judgment.context.questionDigest !== null)
    throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH: current signed request and route required');
  if (judgment.purpose === 'workflow-continuation') {
    const turn = readPiUserTurn(root);
    if (!turn || turn.routeSha256 !== (typeof judgment.payload === 'object' && judgment.payload !== null ? Reflect.get(judgment.payload, 'routeSha256') : undefined)
      || turn.routeSha256 !== requestDigest(readFileSync(join(root, '.omd/route.json'), 'utf8')))
      throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH: current authenticated user turn and route required');
  }
  const current = { requestSha256: request.requestSha256, sourceContractSha256: route?.sourceContractSha256 ?? null,
    questionDigest: null, documentSha256: judgment.context.documentSha256 };
  return { ...current, resolve: nativeJudgmentSources(root, current,
    judgment.purpose === 'workflow-continuation' ? async ref => {
      const turn = readPiUserTurn(root);
      if (!turn || turn.sessionId !== ref.sessionId || turn.turnId !== ref.turnId || turn.sha256 !== ref.sha256)
        throw new Error('AI_JUDGMENT_SOURCE_UNVERIFIED');
      return { ...turn, afterQuestionDigest: null };
    } : undefined) };
}
function receiptPath(value: string): JudgmentReceipt {
  const match = /^\.omd\/judgments\/records\/sha256-([a-f0-9]{64})\.json$/.exec(value);
  if (!match) throw new Error('AI_JUDGMENT_INVALID: expected contained immutable judgment record path');
  return { path: value, sha256: match[1]!, schema: 'ai-judgment-record-v1' };
}
export async function readVerifiedCliJudgment(root: string, invocation: ProjectRunInvocation, path: string) {
  const receipt = receiptPath(path);
  const bytes = readContainedRegularFile(root, join(root, receipt.path), 'current AI judgment');
  const record = JSON.parse(bytes.toString('utf8')) as { judgment?: JudgmentInput };
  if (!record.judgment) throw new Error('AI_JUDGMENT_INVALID');
  const policy = policyFor(record.judgment);
  const context = contextFor(root, invocation, record.judgment);
  return readCurrentJudgment(receipt, policy, { ...context,
    read: async file => readContainedRegularFile(root, join(root, file), 'current AI judgment'),
    verifySignature: (digest, signature) => verifyNativeObservation(root, SIGNING_KIND, digest, signature) });
}
export async function cliReferenceActionBinding(root: string, invocation: ProjectRunInvocation,
  path: string, purpose: 'reference-action' | 'overlay-action', subjectId: string): Promise<ReferenceJudgmentBinding> {
  const verified = await readVerifiedCliJudgment(root, invocation, path);
  if (verified.judgment.purpose !== purpose || verified.judgment.subjectId !== subjectId)
    throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH: action target changed');
  const context = contextFor(root, invocation, verified.judgment);
  return { receipt: receiptPath(path), subjectId, fields: verified.judgment.quotes.map(quote => quote.field),
    context: { ...context, read: async file => readContainedRegularFile(root, join(root, file), 'current AI judgment'),
      verifySignature: (digest, signature) => verifyNativeObservation(root, SIGNING_KIND, digest, signature) } };
}

export function judgmentStarter(root: string, purpose: string, invocation: ProjectRunInvocation) {
  const policy = REQUEST_POLICIES[purpose];
  if (!policy) throw new Error(`AI_JUDGMENT_INVALID: unsupported starter purpose ${purpose}; choose ${Object.keys(REQUEST_POLICIES).join('|')}`);
  const request = readPiRequest(root);
  if (!request) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH: current signed request required');
  const turn = purpose === 'workflow-continuation' ? readPiUserTurn(root) : undefined;
  if (purpose === 'workflow-continuation' && !turn) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH: current authenticated user turn required');
  const route = purpose === 'workflow-continuation' ? readPersistedRoute(root, invocation) : null;
  const path = `.omd/.cache/ai-judgment-${purpose}.json`;
  const skeleton = { schema: 'ai-judgment-v1', purpose, subjectId: turn?.turnId ?? 'request',
    context: { requestSha256: request.requestSha256, sourceContractSha256: route?.sourceContractSha256 ?? null,
      questionDigest: null, documentSha256: null }, decision: policy.decisions[0], reason: 'Explain the decision using the cited source',
    quotes: [{ source: turn ? { kind: 'user-turn', sessionId: turn.sessionId, turnId: turn.turnId, sha256: turn.sha256 }
      : { kind: 'route-request', requestSourceSha256: request.recordSha256, requestSha256: request.requestSha256 },
      field: turn ? 'text' : 'request', itemId: null, text: turn?.text ?? request.request }], evidence: [],
    payload: turn ? { routeSha256: turn.routeSha256 } : {} };
  mkdirSync(join(root, '.omd/.cache'), { recursive: true });
  writeFileSync(join(root, path), `${JSON.stringify(skeleton, null, 2)}\n`);
  return { name: 'ai-judgment', purpose, path, command: `omd ai-judgment publish --input ${path} --json`,
    decisions: policy.decisions, skeleton };
}

export async function runJudgmentCommand(root: string, invocation: ProjectRunInvocation,
  mode: 'publish' | 'check', inputPath: string, writer?: ProjectWriteAdapter) {
  if (mode === 'publish') {
    if (!writer) throw new Error('AI_JUDGMENT_AUTHOR_UNAUTHORIZED');
    const input = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown;
    if (!input || typeof input !== 'object' || !('purpose' in input)) throw new Error('AI_JUDGMENT_INVALID');
    const policy = policyFor(input as JudgmentInput);
    const parsed = parseJudgment(input, policy);
    const context = contextFor(root, invocation, parsed.value);
    const author = { role: policy.purpose === 'design-language-reading' ? 'omd-coordinator' : 'coordinator',
      invocationSha256: projectRunInvocationSha256(invocation) };
    const receipt = await publishJudgment(parsed.value, policy, { ...context, author,
      now: () => new Date().toISOString(), sign: digest => signNativeObservation(root, SIGNING_KIND, digest),
      write: async (path, bytes) => { writer.mkdir('.omd/judgments/records'); writer.writeContentAddressed(path, bytes); } });
    return { receipt, warnings: parsed.warnings };
  }
  const verified = await readVerifiedCliJudgment(root, invocation, inputPath);
  return { receipt: receiptPath(inputPath), judgment: verified.judgment };
}
