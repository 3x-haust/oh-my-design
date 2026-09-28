import { createHash } from 'node:crypto';
import { canonicalJson } from '../ref/board-artifacts.ts';
import { knownFields, SchemaInputError, type SchemaWarning } from './schema.ts';

export { knownFields, SchemaInputError, type SchemaWarning } from './schema.ts';
export const AI_JUDGMENT_SCHEMA = 'ai-judgment-v1' as const;
export const AI_JUDGMENT_RECORD_SCHEMA = 'ai-judgment-record-v1' as const;
const HASH = /^[a-f0-9]{64}$/;
export type SourceRef = Readonly<
  | { kind: 'receipt'; path: string; sha256: string; schema: string }
  | { kind: 'user-turn'; sessionId: string; turnId: string; sha256: string }
  | { kind: 'route-request'; requestSourceSha256: string; requestSha256: string }
  | { kind: 'artifact'; path: string; sha256: string }
>;
export type Quote = Readonly<{ source: SourceRef; field: string; itemId: string | null; text: string }>;
export type JudgmentInput = Readonly<{
  schema: typeof AI_JUDGMENT_SCHEMA; purpose: string; subjectId: string;
  context: Readonly<{ requestSha256: string; sourceContractSha256: string | null; questionDigest: string | null; documentSha256: string | null }>;
  decision: string; reason: string; quotes: readonly Quote[]; evidence: readonly SourceRef[]; payload: unknown;
}>;
export type PublishedJudgment = Readonly<{ schema: typeof AI_JUDGMENT_RECORD_SCHEMA; judgment: JudgmentInput;
  author: Readonly<{ role: string; invocationSha256: string }>; publishedAt: string; signature: string }>;
export type JudgmentReceipt = Readonly<{ path: string; sha256: string; schema: typeof AI_JUDGMENT_RECORD_SCHEMA }>;
export type JudgmentPolicy = Readonly<{
  purpose: string; decisions: readonly string[]; authorRoles: readonly string[]; sourceKinds: readonly SourceRef['kind'][];
  fields: readonly string[]; requiredSourceKinds: readonly SourceRef['kind'][];
  parsePayload: (input: unknown) => unknown; wholeUserTurn?: boolean; mode: 'hard' | 'advisory';
}>;
/** Resolved text is supplied only by a host trusted reader, never by the judgment input. */
export type TrustedJudgmentSource = Readonly<{ sha256: string; field: string; itemId: string | null; text: string;
  requestSha256: string; sourceContractSha256: string | null; questionDigest: string | null; documentSha256: string | null }>;
export type JudgmentVerificationContext = Readonly<{ requestSha256: string; sourceContractSha256: string | null;
  questionDigest: string | null; documentSha256: string | null;
  resolve: (ref: SourceRef, field: string, itemId: string | null) => Promise<TrustedJudgmentSource> }>;
export type VerifiedJudgment = Readonly<{ judgment: JudgmentInput; sources: readonly TrustedJudgmentSource[] }>;
const verifiedJudgments = new WeakSet<object>();
export function isVerifiedJudgment(value: unknown): value is VerifiedJudgment {
  return typeof value === 'object' && value !== null && verifiedJudgments.has(value);
}
export type JudgmentPublicationContext = JudgmentVerificationContext & Readonly<{
  author: { role: string; invocationSha256: string }; now: () => string;
  sign: (digest: string) => string; write: (path: string, bytes: string) => Promise<void>;
}>;
export type JudgmentReadContext = JudgmentVerificationContext & Readonly<{
  read: (path: string) => Promise<Uint8Array>; verifySignature: (digest: string, signature: string) => boolean;
}>;
export type JudgmentErrorCode = 'AI_JUDGMENT_INVALID' | 'AI_JUDGMENT_REQUIRED' | 'AI_JUDGMENT_SOURCE_UNVERIFIED' | 'AI_JUDGMENT_SOURCE_STALE' | 'AI_JUDGMENT_QUOTE_MISMATCH' | 'AI_JUDGMENT_CONTEXT_MISMATCH' | 'AI_JUDGMENT_AUTHOR_UNAUTHORIZED';
export class JudgmentError extends Error {
  readonly code: JudgmentErrorCode;
  constructor(code: JudgmentErrorCode, detail: string = code) { super(detail); this.name = 'JudgmentError'; this.code = code; }
}
const invalid = (detail: string): never => { throw new JudgmentError('AI_JUDGMENT_INVALID', detail); };
const string = (value: unknown, label: string): string => typeof value === 'string' && value.trim() ? value : invalid(label);
const digest = (value: unknown, label: string): string => typeof value === 'string' && HASH.test(value) ? value : invalid(label);
const nullableDigest = (value: unknown, label: string): string | null => value === null ? null : digest(value, label);
const list = (value: unknown, label: string): unknown[] => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && Reflect.ownKeys(value).length === value.length + 1 && Array.from({ length: value.length }, (_, i) => Object.hasOwn(value, i)).every(Boolean) ? value : invalid(label);
const fields = (value: unknown, keys: string[], label: string, warnings: SchemaWarning[]): Record<string, unknown> => {
  try { const result = knownFields(value, keys, [], label);
    if (result.warnings.some(w => /(?:^|\.)(?:signature|author|publishedAt|invocationSha256|authority|hostReceipt)$/u.test(w.field))) invalid(`${label} contains host-owned authority`);
    warnings.push(...result.warnings); return result.value; }
  catch (error) { if (error instanceof SchemaInputError) return invalid(error.message); throw error; }
};
function source(value: unknown, warnings: SchemaWarning[], label: string): SourceRef {
  const kind = knownFields(value, ['kind']).value.kind;
  const keys = kind === 'receipt' ? ['kind', 'path', 'sha256', 'schema'] : kind === 'user-turn' ? ['kind', 'sessionId', 'turnId', 'sha256']
    : kind === 'route-request' ? ['kind', 'requestSourceSha256', 'requestSha256'] : kind === 'artifact' ? ['kind', 'path', 'sha256'] : invalid(`${label}.kind`);
  const item = fields(value, keys, label, warnings);
  if (kind === 'receipt') return { kind, path: string(item.path, label), sha256: digest(item.sha256, label), schema: string(item.schema, label) };
  if (kind === 'user-turn') return { kind, sessionId: string(item.sessionId, label), turnId: string(item.turnId, label), sha256: digest(item.sha256, label) };
  if (kind === 'route-request') return { kind, requestSourceSha256: digest(item.requestSourceSha256, label), requestSha256: digest(item.requestSha256, label) };
  return { kind: 'artifact', path: string(item.path, label), sha256: digest(item.sha256, label) };
}
export const normalizeQuoteWhitespace = (text: string): string => text.replace(/\s+/gu, ' ').trim();
export function parseJudgment(input: unknown, policy: JudgmentPolicy): { value: JudgmentInput; warnings: SchemaWarning[] } {
  const warnings: SchemaWarning[] = [];
  const item = fields(input, ['schema', 'purpose', 'subjectId', 'context', 'decision', 'reason', 'quotes', 'evidence', 'payload'], 'judgment', warnings);
  const context = fields(item.context, ['requestSha256', 'sourceContractSha256', 'questionDigest', 'documentSha256'], 'context', warnings);
  if (item.schema !== AI_JUDGMENT_SCHEMA || item.purpose !== policy.purpose || !policy.decisions.includes(item.decision as string)) invalid('judgment schema, purpose or decision');
  const quotes = list(item.quotes, 'quotes').map((q, i) => {
    const quote = fields(q, ['source', 'field', 'itemId', 'text'], `quotes[${i}]`, warnings);
    const text = string(quote.text, 'quote.text');
    if (!normalizeQuoteWhitespace(text)) invalid('empty quote');
    return { source: source(quote.source, warnings, `quotes[${i}].source`), field: string(quote.field, 'quote.field'),
      itemId: quote.itemId === null ? null : string(quote.itemId, 'quote.itemId'), text };
  });
  if (!quotes.length) invalid('at least one quote is required');
  const evidence = list(item.evidence, 'evidence').map((s, i) => source(s, warnings, `evidence[${i}]`));
  return { value: { schema: AI_JUDGMENT_SCHEMA, purpose: policy.purpose, subjectId: string(item.subjectId, 'subjectId'),
    context: { requestSha256: digest(context.requestSha256, 'requestSha256'), sourceContractSha256: nullableDigest(context.sourceContractSha256, 'sourceContractSha256'),
      questionDigest: nullableDigest(context.questionDigest, 'questionDigest'), documentSha256: nullableDigest(context.documentSha256, 'documentSha256') },
    decision: item.decision as string, reason: string(item.reason, 'reason'), quotes, evidence, payload: policy.parsePayload(item.payload) }, warnings };
}
export async function verifyJudgment(judgment: JudgmentInput, policy: JudgmentPolicy, context: JudgmentVerificationContext): Promise<VerifiedJudgment> {
  const parsed = parseJudgment(judgment, policy).value;
  if (canonicalJson(parsed.context) !== canonicalJson({ requestSha256: context.requestSha256, sourceContractSha256: context.sourceContractSha256, questionDigest: context.questionDigest, documentSha256: context.documentSha256 }))
    throw new JudgmentError('AI_JUDGMENT_CONTEXT_MISMATCH');
  const sources: TrustedJudgmentSource[] = [];
  for (const quote of parsed.quotes) {
    if (!policy.sourceKinds.includes(quote.source.kind) || !policy.fields.includes(quote.field)) invalid('source kind or field is not allowed by policy');
    let resolved: TrustedJudgmentSource;
    try { resolved = await context.resolve(quote.source, quote.field, quote.itemId); }
    catch { throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED'); }
    const claimedDigest = quote.source.kind === 'route-request' ? quote.source.requestSourceSha256 : quote.source.sha256;
    if (resolved.sha256 !== claimedDigest || resolved.field !== quote.field || resolved.itemId !== quote.itemId) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
    if (resolved.requestSha256 !== context.requestSha256 || resolved.sourceContractSha256 !== context.sourceContractSha256
      || resolved.questionDigest !== context.questionDigest || resolved.documentSha256 !== context.documentSha256) throw new JudgmentError('AI_JUDGMENT_SOURCE_STALE');
    const observed = normalizeQuoteWhitespace(resolved.text);
    const cited = normalizeQuoteWhitespace(quote.text);
    if (policy.wholeUserTurn && quote.source.kind === 'user-turn' ? observed !== cited : !observed.includes(cited)) throw new JudgmentError('AI_JUDGMENT_QUOTE_MISMATCH');
    sources.push(resolved);
  }
  for (const kind of policy.requiredSourceKinds) if (!parsed.quotes.some(q => q.source.kind === kind)) throw new JudgmentError('AI_JUDGMENT_REQUIRED');
  for (const ref of parsed.evidence) {
    if (!policy.sourceKinds.includes(ref.kind)) invalid('evidence source kind is not allowed');
    let resolved: TrustedJudgmentSource;
    try { resolved = await context.resolve(ref, '', null); } catch { throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED'); }
    const claimedDigest = ref.kind === 'route-request' ? ref.requestSourceSha256 : ref.sha256;
    if (resolved.sha256 !== claimedDigest || resolved.requestSha256 !== context.requestSha256
      || resolved.sourceContractSha256 !== context.sourceContractSha256 || resolved.questionDigest !== context.questionDigest
      || resolved.documentSha256 !== context.documentSha256) throw new JudgmentError('AI_JUDGMENT_SOURCE_STALE');
  }
  const verified = Object.freeze({ judgment: parsed, sources: Object.freeze(sources) });
  verifiedJudgments.add(verified);
  return verified;
}
export const judgmentSha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export async function publishJudgment(input: unknown, policy: JudgmentPolicy, context: JudgmentPublicationContext): Promise<JudgmentReceipt> {
  const judgment = parseJudgment(input, policy).value;
  if (!policy.authorRoles.includes(context.author.role) || !HASH.test(context.author.invocationSha256)) throw new JudgmentError('AI_JUDGMENT_AUTHOR_UNAUTHORIZED');
  await verifyJudgment(judgment, policy, context);
  const body = { schema: AI_JUDGMENT_RECORD_SCHEMA, judgment, author: context.author, publishedAt: context.now() };
  const signature = context.sign(judgmentSha256(canonicalJson(body)));
  const bytes = `${canonicalJson({ ...body, signature })}\n`;
  const sha256 = judgmentSha256(bytes);
  const path = `.omd/judgments/records/sha256-${sha256}.json`;
  await context.write(path, bytes);
  return { path, sha256, schema: AI_JUDGMENT_RECORD_SCHEMA };
}
export async function readCurrentJudgment(receipt: JudgmentReceipt, policy: JudgmentPolicy, context: JudgmentReadContext): Promise<VerifiedJudgment> {
  if (receipt.schema !== AI_JUDGMENT_RECORD_SCHEMA || receipt.path !== `.omd/judgments/records/sha256-${receipt.sha256}.json` || !HASH.test(receipt.sha256)) invalid('receipt path');
  const bytes = await context.read(receipt.path);
  if (judgmentSha256(bytes) !== receipt.sha256) throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
  let raw: unknown;
  try { raw = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return invalid('record JSON'); }
  const warnings: SchemaWarning[] = [];
  const record = fields(raw, ['schema', 'judgment', 'author', 'publishedAt', 'signature'], 'record', warnings);
  const author = fields(record.author, ['role', 'invocationSha256'], 'author', warnings);
  if (record.schema !== AI_JUDGMENT_RECORD_SCHEMA || !policy.authorRoles.includes(author.role as string) || !HASH.test(author.invocationSha256 as string)
    || typeof record.publishedAt !== 'string' || !Number.isFinite(Date.parse(record.publishedAt as string)) || typeof record.signature !== 'string') invalid('record authority');
  const judgment = parseJudgment(record.judgment, policy).value;
  if (!context.verifySignature(judgmentSha256(canonicalJson({ schema: AI_JUDGMENT_RECORD_SCHEMA, judgment, author, publishedAt: record.publishedAt })), record.signature as string))
    throw new JudgmentError('AI_JUDGMENT_SOURCE_UNVERIFIED');
  return verifyJudgment(judgment, policy, context);
}
