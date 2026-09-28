import { createHash } from 'node:crypto';
import { verifyJudgment, type JudgmentInput, type JudgmentPolicy, type JudgmentVerificationContext } from '../judgment/index.ts';
import type { Input } from './index.ts';

const HASH = /^[a-f0-9]{64}$/;

/** A lexicon alias is a suggestion. The agent's current, quoted reading owns meaning. */
export const DESIGN_LANGUAGE_READING_POLICY: JudgmentPolicy = {
  purpose: 'design-language-reading', decisions: ['resolved', 'ambiguous', 'not-applicable'],
  authorRoles: ['omd-framer', 'omd-coordinator'], sourceKinds: ['route-request', 'user-turn'],
  fields: ['request', 'text'], requiredSourceKinds: ['route-request'], mode: 'advisory',
  parsePayload(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI_JUDGMENT_INVALID');
    const payload = value as Record<string, unknown>;
    if (payload.kind !== 'intake' && payload.kind !== 'feedback') throw new Error('AI_JUDGMENT_INVALID');
    if (typeof payload.textSha256 !== 'string' || !HASH.test(payload.textSha256)
      || (payload.chosenId !== null && (typeof payload.chosenId !== 'string' || !payload.chosenId))) throw new Error('AI_JUDGMENT_INVALID');
    return { kind: payload.kind, textSha256: payload.textSha256, chosenId: payload.chosenId };
  },
};

/** Call before publishing a new translation; the shared verifier resolves the real request/turn. */
export async function verifyDesignLanguageReading(
  input: Input, judgment: JudgmentInput, context: JudgmentVerificationContext,
): Promise<void> {
  const verified = await verifyJudgment(judgment, DESIGN_LANGUAGE_READING_POLICY, context);
  const payload = verified.judgment.payload as { kind: Input['kind']; textSha256: string; chosenId: string | null };
  const decision = input.readings.length === 0 ? 'not-applicable' : input.chosenId === null ? 'ambiguous' : 'resolved';
  if (verified.judgment.decision !== decision || payload.kind !== input.kind || payload.chosenId !== input.chosenId
    || payload.textSha256 !== createHash('sha256').update(input.text).digest('hex')) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH');
}
