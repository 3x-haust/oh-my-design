import type { Ir, Violation } from '../types.ts';

const MIN_NODE_TOKENS = 6;
const WINDOW = 5;

/**
 * Lowercase, strip markdown/frontmatter punctuation, collapse whitespace, tokenize on
 * whitespace. Korean uses spaces between words, so whitespace tokenization still works —
 * a CJK source with no spaces (e.g. Chinese) would need character n-grams instead; that
 * case is out of scope here.
 *
 * F4: the leading YAML frontmatter block (`---\n...\n---`) is stripped entirely before
 * tokenizing — previously only its `---` fences were removed by the punctuation strip
 * below, leaving frontmatter keys (`why:`, `generator:`) and values as live grams. The
 * body text (which conventionally repeats the same rationale in prose) still matches.
 */
function tokenize(text: string): string[] {
  return text
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .toLowerCase()
    .replace(/[#*`>|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function windows(tokens: string[], size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + size <= tokens.length; i++) out.push(tokens.slice(i, i + size).join(' '));
  return out;
}

/**
 * Design rationale belongs in .omd/, never in the shipped copy. This is the deterministic
 * subset of that failure: a node's text quotes five or more consecutive tokens verbatim
 * from a frame/decision record. Paraphrase is fine — only literal overlap fires, checked
 * against a precomputed Set of record 5-grams so the whole scan stays O(text + records)
 * rather than comparing every node window against every record window.
 */
export function findLeakedRationale(ir: Ir, records: string[]): Violation[] {
  const recordGrams = new Set<string>();
  for (const record of records) {
    if (!record) continue;
    const tokens = tokenize(record);
    for (const w of windows(tokens, WINDOW)) recordGrams.add(w);
  }
  if (recordGrams.size === 0) return [];

  const violations: Violation[] = [];
  for (const node of ir.nodes) {
    if (!node.text) continue;
    const tokens = tokenize(node.text);
    if (tokens.length < MIN_NODE_TOKENS) continue;

    for (const w of windows(tokens, WINDOW)) {
      if (!recordGrams.has(w)) continue;
      violations.push({
        id: 'SLOP-LEAKED-RATIONALE',
        severity: 'warn',
        layer: 1,
        category: 'slop',
        nodeId: node.id,
        path: node.path,
        value: w,
        message: `Design rationale leaked into shipped copy: "${w}". The frame explains the work; the page must never quote it.`,
      });
      break; // one violation per node — first match
    }
  }
  return violations;
}
