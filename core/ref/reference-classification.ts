import { createHash } from 'node:crypto';
import { referenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';

export const REFERENCE_CLASSIFICATION_SCHEMA_VERSION = 'reference-classification-v1' as const;

export type ReferenceClassification = Readonly<
  | {
    schemaVersion: typeof REFERENCE_CLASSIFICATION_SCHEMA_VERSION;
    kind: 'visual';
    statements: readonly string[];
  }
  | {
    schemaVersion: typeof REFERENCE_CLASSIFICATION_SCHEMA_VERSION;
    kind: 'content-only';
    statements: readonly string[];
  }
  | {
    schemaVersion: typeof REFERENCE_CLASSIFICATION_SCHEMA_VERSION;
    kind: 'anti-reference';
    statements: readonly string[];
  }
  | {
    schemaVersion: typeof REFERENCE_CLASSIFICATION_SCHEMA_VERSION;
    kind: 'mood';
    statements: readonly string[];
  }
>;

export class ReferenceClassificationError extends Error {
  override readonly name = 'ReferenceClassificationError';
  constructor(reason: string) { super(`reference classification is invalid: ${reason}`); }
}

const fail = (reason: string): never => { throw new ReferenceClassificationError(reason); };
const MARKER = /^(content-only|anti-reference|mood):\s+(.+)$/;

/**
 * A mood statement describes a felt quality, never a measurement. "Warm, low-contrast, printed" is a
 * mood claim; "16px gutters" is a structural one that only a measured capture may make.
 */

/**
 * Parses the durable machine marker written into a reference's retained principles.
 * Unmarked references remain visual; only exact lower-case markers grant a nonvisual branch.
 */
export function parseReferenceClassification(value: Readonly<{ principles: unknown }>): ReferenceClassification {
  if (!Array.isArray(value.principles)) return fail('principles must be an array');
  const marked: { kind: 'content-only' | 'anti-reference' | 'mood'; statement: string }[] = [];
  for (const principle of value.principles) {
    if (typeof principle !== 'string') return fail('principles must contain strings');
    const match = MARKER.exec(principle);
    if (match === null) continue;
    const kind = match[1] as 'content-only' | 'anti-reference' | 'mood';
    const statement = match[2]?.trim() ?? '';
    if (statement.length === 0 || statement !== match[2] || /[\u0000-\u001f\u007f]/.test(statement)
      || /:\/\/|(?:^|\s)(?:\.?\.?[\\/]|\.omd[\\/])/.test(statement)) return fail(`${kind} statement is not canonical text`);
    marked.push({ kind, statement });
  }
  if (marked.length === 0) return Object.freeze({ schemaVersion: REFERENCE_CLASSIFICATION_SCHEMA_VERSION, kind: 'visual', statements: Object.freeze([]) });
  const kinds = new Set(marked.map(({ kind }) => kind));
  if (kinds.size !== 1) return fail('content-only and anti-reference markers conflict');
  const kind = marked[0]!.kind;
  const statements = [...new Set(marked.map(({ statement }) => statement))];
  // Marker structure is authoritative; claim meaning needs a cited claim-kind judgment.
  return Object.freeze({
    schemaVersion: REFERENCE_CLASSIFICATION_SCHEMA_VERSION,
    kind,
    statements: Object.freeze(statements),
  });
}

export async function assessReferenceClaim(statementId: string, binding?: ReferenceJudgmentBinding) {
  if (binding && binding.subjectId !== statementId) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH');
  return referenceDecision('claim-kind', binding);
}

export function referenceClassificationSha256(value: ReferenceClassification): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
