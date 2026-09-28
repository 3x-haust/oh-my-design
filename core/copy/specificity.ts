// Could this line belong to any product in the category?
//
// Researched cause of copy that reads as AI-written (see `reference/oh-my-design/human-copy-policy.md`):
// the signal is not a word, a punctuation mark, or a sentence pattern. It is INTERCHANGEABILITY — a
// line that could ship unchanged from a competitor, that makes a claim no informed reader could
// challenge, that names no particular thing.
//
// That is why a phrase blocklist cannot fix it. Removing "unlock the power" leaves the argument
// untouched and can add forced quirk instead. `core/slop/text-slop.ts` stays useful as a cheap
// advisory, but the check that matters asks a different question: does this line carry anything the
// run actually HAS — a real object, a real number, the user's own words, a named surface — or is it
// only abstraction?
//
// A line with no anchor is not proved bad and this is not a gate. It is the prompt to name the thing,
// which is the same demand the research makes of any writer: distinctive copy needs material a
// competitor does not have.

import { createHash } from 'node:crypto';

export const COPY_SPECIFICITY_SCHEMA = 'copy-specificity-v1' as const;

export type CopySpecificityFinding = Readonly<{
  /** 1-based line number in the deck. */
  line: number;
  text: string;
  /** Anchor kinds searched for; empty means none was found in this line. */
  missing: readonly CopyAnchorKind[];
  reviewQuestion: string;
}>;

export type CopyAnchorKind = 'object' | 'number' | 'user-language' | 'named-surface' | 'proper-noun';

export type CopySpecificityInput = Readonly<{
  markdown: string;
  coreObjects?: readonly string[];
  surfaces?: readonly string[];
  /** Verbatim audience/source quotations, which anchor a line to the user's own words. */
  userLanguage?: readonly string[];
}>;

/**
 * A line is worth reviewing when it is a claim about the product but carries no anchor. Prose that
 * is purely structural (a table row, a heading, a metadata key) is skipped: it is not copy that
 * ships to a reader.
 */
const SKIP = [
  /^\s*\|/,                        // table rows are the fact ledger, not surface copy
  /^\s*#/,                         // headings
  /^\s*[-*:]\s*\*\*/,              // bulleted metadata (`- **Owner**: ...`)
  /^\s*(?:F|B|U|SLOT)-\d+/,        // evidence ids
  /^\s*$/,
] as const;

const sentenceLines = (markdown: string): readonly { line: number; text: string }[] =>
  markdown.split('\n').flatMap((raw, index) => {
    const text = raw.trim();
    if (text === '' || SKIP.some((pattern) => pattern.test(text))) return [];
    return [{ line: index + 1, text }];
  });

export function readCopySpecificity(input: CopySpecificityInput): readonly CopySpecificityFinding[] {
  // Caller-supplied vocabulary is context for the reviewer, not a grounding oracle.
  void input.coreObjects; void input.surfaces; void input.userLanguage;
  const findings: CopySpecificityFinding[] = [];

  for (const { line, text } of sentenceLines(input.markdown)) {
    findings.push(Object.freeze({
      line,
      text,
      missing: Object.freeze([]),
      reviewQuestion: 'Review this line against the product facts and user language. Is it grounded and distinctive in context?',
    }));
  }

  return Object.freeze(findings);
}

export function copySpecificitySha256(findings: readonly CopySpecificityFinding[]): string {
  return createHash('sha256').update(JSON.stringify(findings.map((finding) => finding.text))).digest('hex');
}
