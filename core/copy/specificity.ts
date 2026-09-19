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

/** Words that assert a quality without naming anything: the interchangeable vocabulary. */
const ABSTRACT_QUALITY = new Set([
  'seamless', 'effortless', 'powerful', 'intuitive', 'robust', 'advanced', 'innovative',
  'world-class', 'best-in-class', 'cutting-edge', 'next-generation', 'state-of-the-art',
  'comprehensive', 'flexible', 'scalable', 'streamlined', 'delightful', 'engaging',
  'smart', 'simple', 'easy', 'fast', 'quick', 'modern', 'beautiful', 'stunning',
  '원활한', '강력한', '직관적인', '혁신적인', '편리한', '스마트한', '최적화된', '다양한',
]);

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

const NUMBER_WORDS = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;
/** Korean numerals as words: Korean copy writes counts this way, and a bare digit is not required. */
const KOREAN_NUMERALS = /(?:한|두|세|네|다섯|여섯|일곱|여덞|아홉|열)\s*(?:건|개|명|일|번|종|가지|단계)/;

const hasNumber = (text: string): boolean =>
  /\d/.test(text) || NUMBER_WORDS.test(text) || KOREAN_NUMERALS.test(text);

/**
 * A proper noun is a capitalised word that is not simply the sentence's first word in English, or any
 * Latin-script token in a Korean line (Korean copy rarely capitalises, so a Latin brand inside it is
 * the signal).
 */
const properNouns = (text: string): readonly string[] => {
  const words = text.split(/[\s,.;:!?()"'`]+/).filter(Boolean);
  const korean = /[\uac00-\ud7a3]/.test(text);
  return words.filter((word, index) => {
    if (korean) return /^[A-Za-z][A-Za-z0-9.+-]*$/.test(word) && word.length > 1;
    if (index === 0) return false;
    return /^[A-Z][a-z]+/.test(word) || /^[A-Z]{2,}$/.test(word);
  });
};

const containsPhrase = (text: string, phrase: string): boolean => {
  const needle = phrase.trim().toLowerCase();
  return needle.length >= 2 && text.toLowerCase().includes(needle);
};

export function readCopySpecificity(input: CopySpecificityInput): readonly CopySpecificityFinding[] {
  const objects = (input.coreObjects ?? []).filter((entry) => entry.trim() !== '');
  const surfaces = (input.surfaces ?? []).filter((entry) => entry.trim() !== '');
  const userLanguage = (input.userLanguage ?? []).filter((entry) => entry.trim() !== '');
  const findings: CopySpecificityFinding[] = [];

  for (const { line, text } of sentenceLines(input.markdown)) {
    const anchored: CopyAnchorKind[] = [];
    if (objects.some((object) => containsPhrase(text, object))) anchored.push('object');
    if (surfaces.some((surface) => containsPhrase(text, surface))) anchored.push('named-surface');
    if (userLanguage.some((quotation) => containsPhrase(text, quotation))) anchored.push('user-language');
    if (hasNumber(text)) anchored.push('number');
    if (properNouns(text).length > 0) anchored.push('proper-noun');
    if (anchored.length > 0) continue;

    // Only lines that actually assert a quality are worth the reader's attention. A bare label
    // ("Cancel", "Save") is specific enough by being short and functional, and flagging it would
    // train the reader to ignore this check.
    const words = text.toLowerCase().split(/[^A-Za-z\uac00-\ud7a3]+/).filter((word) => word.length > 1);
    if (words.length < 4) continue;
    const assertsQuality = words.some((word) => ABSTRACT_QUALITY.has(word)) || words.length >= 6;
    if (!assertsQuality) continue;

    findings.push(Object.freeze({
      line,
      text,
      missing: Object.freeze(['object', 'number', 'user-language', 'named-surface', 'proper-noun'] as const),
      reviewQuestion: 'Could this line ship unchanged from another product in this category? It names no object, number, surface, or user phrase. Name the particular thing it is about, or cut it.',
    }));
  }

  return Object.freeze(findings);
}

export function copySpecificitySha256(findings: readonly CopySpecificityFinding[]): string {
  return createHash('sha256').update(JSON.stringify(findings.map((finding) => finding.text))).digest('hex');
}
