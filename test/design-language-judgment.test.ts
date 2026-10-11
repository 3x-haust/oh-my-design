import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DESIGN_LANGUAGE_READING_POLICY, verifyDesignLanguageReading } from '../core/design-language/judgment.ts';
import { parseJudgment, type JudgmentInput, type JudgmentVerificationContext } from '../core/judgment/index.ts';
import type { Input } from '../core/design-language/index.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const request = 'This page feels cramped.';
const source = { kind: 'route-request' as const, requestSourceSha256: sha('signed-request'), requestSha256: sha(request) };
const input = { schema: 'design-language-input-v1', kind: 'intake', text: request, request, sourceContractSha256: sha('route'), readings: [{ id: 'space' }], chosenId: 'space', decision: 'More space for form rows' } as unknown as Input;
const context: JudgmentVerificationContext = {
  requestSha256: source.requestSha256, sourceContractSha256: input.sourceContractSha256,
  questionDigest: null, documentSha256: null,
  async resolve(ref, field, itemId) {
    if (ref.kind !== 'route-request' || field !== 'request' || itemId !== null) throw new Error('untrusted source');
    return { sha256: source.requestSourceSha256, field, itemId, text: request,
      requestSha256: source.requestSha256, sourceContractSha256: input.sourceContractSha256,
      questionDigest: null, documentSha256: null };
  },
};
const judgment: JudgmentInput = {
  schema: 'ai-judgment-v1', purpose: 'design-language-reading', subjectId: 'intake',
  context: { requestSha256: context.requestSha256, sourceContractSha256: context.sourceContractSha256, questionDigest: null, documentSha256: null },
  decision: 'resolved', reason: 'The owner selected a spatial reading.',
  quotes: [{ source, field: 'request', itemId: null, text: request }], evidence: [],
  payload: { kind: 'intake', textSha256: sha(request), chosenId: 'space' },
};

test('a reading can use language outside the lexicon when backed by the current signed request', async () => {
  assert.equal(parseJudgment(judgment, DESIGN_LANGUAGE_READING_POLICY).value.decision, 'resolved');
  await assert.doesNotReject(verifyDesignLanguageReading(input, judgment, context));
});
test('a fabricated quote, stale request, or substituted chosen reading cannot authorize translation', async () => {
  await assert.rejects(verifyDesignLanguageReading(input, { ...judgment, quotes: [{ source, field: 'request', itemId: null, text: 'unseen phrase' }] }, context), /AI_JUDGMENT_QUOTE_MISMATCH/);
  await assert.rejects(verifyDesignLanguageReading(input, judgment, { ...context, requestSha256: sha('different') }), /AI_JUDGMENT_CONTEXT_MISMATCH/);
  await assert.rejects(verifyDesignLanguageReading({ ...input, chosenId: 'other' }, judgment, context), /AI_JUDGMENT_CONTEXT_MISMATCH/);
});
