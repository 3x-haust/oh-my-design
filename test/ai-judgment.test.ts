import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseJudgment, verifyJudgment, publishJudgment, readCurrentJudgment, JudgmentError, type JudgmentPolicy, type JudgmentInput, type JudgmentVerificationContext } from '../core/judgment/index.ts';
import { assessGate } from '../core/judgment/gate.ts';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const request = hash('request');
const text = '평소 쓰는 브라우저';
const sha256 = hash(text);
export const fixturePolicy: JudgmentPolicy = { purpose: 'workflow-intent', decisions: ['implement', 'inspect'], authorRoles: ['coordinator'], sourceKinds: ['user-turn'], fields: ['text'], requiredSourceKinds: ['user-turn'], parsePayload: (value) => { if (value !== null) throw new Error('payload'); return null; }, mode: 'advisory', wholeUserTurn: true };
export function fixtureJudgment(): JudgmentInput { return { schema: 'ai-judgment-v1', purpose: 'workflow-intent', subjectId: 'turn-1', context: { requestSha256: request, sourceContractSha256: null, questionDigest: null, documentSha256: null }, decision: 'implement', reason: 'Agent interpretation', quotes: [{ source: { kind: 'user-turn', sessionId: 'session', turnId: 'turn-1', sha256 }, field: 'text', itemId: null, text }], evidence: [], payload: null }; }
export function fixtureContext(): JudgmentVerificationContext { return { requestSha256: request, sourceContractSha256: null, questionDigest: null, documentSha256: null, resolve: async (_ref, field, itemId) => ({ sha256, field, itemId, text, requestSha256: request, sourceContractSha256: null, questionDigest: null, documentSha256: null }) }; }
test('judgment quotes are exact, current and field-bound', async () => {
  const input = fixtureJudgment(); const context = fixtureContext();
  assert.equal((await verifyJudgment(input, fixturePolicy, context)).judgment.decision, 'implement');
  await assert.rejects(verifyJudgment({ ...input, quotes: [{ ...input.quotes[0]!, text: 'unseen' }] }, fixturePolicy, context), (e: unknown) => e instanceof JudgmentError && e.code === 'AI_JUDGMENT_QUOTE_MISMATCH');
  await assert.rejects(verifyJudgment(input, fixturePolicy, { ...context, documentSha256: hash('changed') }), (e: unknown) => e instanceof JudgmentError && e.code === 'AI_JUDGMENT_CONTEXT_MISMATCH');
  await assert.rejects(verifyJudgment(input, fixturePolicy, { ...context, resolve: async (ref, field, itemId) => ({ ...await context.resolve(ref, field, itemId), itemId: 'other' }) }), (e: unknown) => e instanceof JudgmentError && e.code === 'AI_JUDGMENT_SOURCE_UNVERIFIED');
});
test('ordinary unknown fields warn and are discarded; getters and missing fields refuse', () => {
  const input = fixtureJudgment();
  const parsed = parseJudgment({ ...input, extra: 'note' }, fixturePolicy);
  assert.deepEqual(parsed.warnings, [{ code: 'UNKNOWN_FIELD', field: 'judgment.extra' }]);
  assert.equal('extra' in parsed.value, false);
  assert.throws(() => parseJudgment({ ...input, reason: undefined }, fixturePolicy));
  const accessor = Object.defineProperty({ ...input }, 'decision', { get() { throw Error('should not run'); } });
  assert.throws(() => parseJudgment(accessor, fixturePolicy), /data property/);
});
test('publication is verified before writing, signed and checked again on read', async () => {
  const memory = new Map<string, string>(); const context = fixtureContext();
  const publication = { ...context, author: { role: 'coordinator', invocationSha256: hash('invocation') }, now: () => '2026-09-28T00:00:00.000Z', sign: (digest: string) => `signed:${digest}`, write: async (path: string, bytes: string) => { memory.set(path, bytes); } };
  const receipt = await publishJudgment(fixtureJudgment(), fixturePolicy, publication);
  const reader = { ...context, read: async (path: string) => Buffer.from(memory.get(path)!), verifySignature: (digest: string, signature: string) => signature === `signed:${digest}` };
  assert.equal((await readCurrentJudgment(receipt, fixturePolicy, reader)).judgment.decision, 'implement');
  await assert.rejects(publishJudgment({ ...fixtureJudgment(), quotes: [{ ...fixtureJudgment().quotes[0]!, text: 'fabricated' }] }, fixturePolicy, publication));
  assert.equal(memory.size, 1);
  await assert.rejects(readCurrentJudgment(receipt, fixturePolicy, { ...reader, documentSha256: hash('new document') }));
});
test('advisory reason cannot override hard finding', () => {
  const finding = { code: 'EVIDENCE', classification: 'hard' as const, subjectId: 'x', sourceDigests: [], message: 'bad' };
  assert.equal(assessGate([finding], [{ code: 'EVIDENCE', subjectId: 'x', decision: 'skip', reason: 'skip it' }]).ok, false);
});
