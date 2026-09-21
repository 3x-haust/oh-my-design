import { createHash } from 'node:crypto';

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
const CONTENT_ONLY_FORBIDDEN = /\b(?:pixel|geometry|layout|grid|column|width|height|position|spacing|radius|shadow|palette|colou?r|font|typography|visual|style|motion|animation|transition|interaction|hover|focus|click|gesture|scroll)\b/i;
const MARKER = /^(content-only|anti-reference|mood):\s+(.+)$/;

/**
 * A mood statement describes a felt quality, never a measurement. "Warm, low-contrast, printed" is a
 * mood claim; "16px gutters" is a structural one that only a measured capture may make.
 */
const MOOD_FORBIDDEN = /\b(?:\d+\s*(?:px|em|rem|pt|%|vh|vw)|grid|column|spacing|padding|margin|radius|breakpoint|px)\b/i;

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
  if (kind === 'content-only' && statements.some((statement) => CONTENT_ONLY_FORBIDDEN.test(statement))) {
    return fail('content-only statements may describe content or voice, not geometry, visual style, motion, or interaction');
  }
  if (kind === 'mood' && statements.some((statement) => MOOD_FORBIDDEN.test(statement))) {
    return fail('mood statements describe a felt quality, not a measurement; a mood capture is not measured evidence');
  }
  return Object.freeze({
    schemaVersion: REFERENCE_CLASSIFICATION_SCHEMA_VERSION,
    kind,
    statements: Object.freeze(statements),
  });
}

export function referenceClassificationSha256(value: ReferenceClassification): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
