import { canonicalJson as canonicalDocument } from '../board-artifacts.ts';
export { sha256 } from '../board-artifacts.ts';
/** Trace hashes exclude framing; JSONL storage adds exactly one newline per event. The shared
 * reference document encoder already appends a newline, unlike a canonical JSON value encoder. */
export const canonicalJson = (value: unknown): string => canonicalDocument(value).slice(0, -1);
