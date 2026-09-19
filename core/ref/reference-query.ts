// Reference query construction.
//
// A borrowed rule from a designer's actual Pinterest practice, because the difference is measurable:
//
//   1. English. The interface material is indexed in English even when the product is not. A Korean
//      query retrieves Korean-language results ABOUT the topic, which is a different and far smaller
//      pool than the screens themselves.
//   2. One part per query, never a whole concept. "AI desktop assistant" retrieves almost nothing,
//      because no real screen carries that name. The screens that exist are the parts: "task
//      management", "side panel", "contextual sidebar". Search the parts; let composition assemble.
//
// The domain brief already names surfaces, so its own surface names are the natural first seeds.
// This module builds queries from those names and refuses the whole-concept phrasing that returns
// nothing, because a query list that is never validated is a list a model can quietly replace with
// confident-sounding phrases that retrieve no evidence.

import { createHash } from 'node:crypto';

export const REFERENCE_QUERY_SCHEMA = 'reference-query-v1' as const;

/** Above this many words a COMPONENT query is describing a product, not a part. */
export const MAX_QUERY_WORDS = 4;

/**
 * A felt direction legitimately needs more words than a part name: "analog warmth, patched panel,
 * low glow" names qualities, while "side panel" names a thing. Capping both at four silently dropped
 * every real mood query, so the mood lane gets its own, wider bound.
 */
export const MAX_MOOD_QUERY_WORDS = 12;

export type ReferenceQueryLane = 'component' | 'craft' | 'mood';

export type ReferenceQuery = Readonly<{
  lane: ReferenceQueryLane;
  query: string;
  seed: string;
}>;

export type ReferenceQueryErrorCode = 'MALFORMED_REFERENCE_QUERY' | 'QUERY_NOT_ENGLISH' | 'QUERY_WHOLE_CONCEPT';

export class ReferenceQueryError extends Error {
  override readonly name = 'ReferenceQueryError';
  readonly code: ReferenceQueryErrorCode;
  constructor(code: ReferenceQueryErrorCode, reason: string) {
    super(`reference query is invalid: ${reason}`);
    this.code = code;
  }
}

const fail = (code: ReferenceQueryErrorCode, reason: string): never => { throw new ReferenceQueryError(code, reason); };

/**
 * Non-Latin script, including Latin-with-diacritics used by French, Spanish, Turkish, and Vietnamese.
 * A query in those languages retrieves its own pool, which is not the interface pool these sites
 * index, so the same refusal applies as for Korean or Cyrillic.
 */
const NON_ENGLISH = /[^\u0020-\u007e]|[^\x00-\x7f]/;

/**
 * A query naming one of these describes a product or whole page rather than a part. Matched against
 * any word, not just the final one: "task management tool" and "design system for developers" both
 * describe a product, and being lenient about position let both through.
 */
const WHOLE_CONCEPT_WORDS = [
  'app', 'application', 'website', 'webapp', 'platform', 'system', 'tool', 'product',
  'dashboard design', 'landing page design', 'interface design', 'ui design', 'ux design',
  'assistant', 'solution', 'experience', 'concept',
] as const;

export function validateReferenceQuery(lane: ReferenceQueryLane, query: string): string {
  const trimmed = query.trim();
  if (trimmed === '') fail('MALFORMED_REFERENCE_QUERY', 'a query must be a non-empty string');
  if (NON_ENGLISH.test(trimmed)) {
    fail('QUERY_NOT_ENGLISH', `"${trimmed}" is not English; these sites index interface patterns in English, so a translated query retrieves a different and smaller pool`);
  }
  const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  const wordLimit = lane === 'mood' ? MAX_MOOD_QUERY_WORDS : MAX_QUERY_WORDS;
  if (words.length > wordLimit) {
    fail('QUERY_WHOLE_CONCEPT', `"${trimmed}" is ${words.length} words, past the ${wordLimit} that describe one ${lane === 'mood' ? 'felt direction' : 'part'}; name the ${lane === 'mood' ? 'qualities' : 'part'} instead of the product`);
  }
  // A product noun is wrong in every lane: no screen is named after a product, in a part query or a
  // mood phrase alike. A mood phrase reaches it through a trailing qualifier ("analog synth app").
  for (const whole of WHOLE_CONCEPT_WORDS) {
    if (words.some((word) => word === whole)) {
      fail('QUERY_WHOLE_CONCEPT', `"${trimmed}" names a whole product ("${whole}") rather than a screen or part; no real screen is named that, so the query retrieves nothing usable`);
    }
  }
  return trimmed;
}

/** Words that only ever connect a part name to its description, never part of the name itself. */
const STOPWORDS = new Set(['with', 'and', 'or', 'for', 'in', 'on', 'of', 'to', 'the', 'a', 'an', 'that', 'which', 'including', 'plus']);

/**
 * Turns a surface name into a query. Surface names are already part-shaped ("seat map", "approval
 * queue"), so they are the right seed; the function exists to drop the domain qualifier that makes
 * them whole-concept phrases and to cut the trailing description that makes them too long.
 */
export function queriesFromSurfaces(surfaces: readonly string[], domain: string): readonly string[] {
  return Object.freeze(surfaces.flatMap((surface) => {
    const words = surface.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const domainWords = new Set(domain.trim().toLowerCase().split(/\s+/).filter(Boolean));
    let candidate = words;
    while (candidate.length > 1 && domainWords.has(candidate[0]!)) candidate = candidate.slice(1);
    // Cut at the first stopword so a long surface yields its part name ("seat map") rather than a
    // truncated description ("seat map with availability").
    const stop = candidate.findIndex((word) => STOPWORDS.has(word));
    if (stop > 0) candidate = candidate.slice(0, stop);
    const query = candidate.slice(0, MAX_QUERY_WORDS).join(' ');
    if (query === '') return [];
    try {
      return [validateReferenceQuery('component', query)];
    } catch {
      return [];
    }
  }));
}

export function referenceQuerySha256(queries: readonly ReferenceQuery[]): string {
  return createHash('sha256').update(JSON.stringify(queries.map((query) => `${query.lane}:${query.query}`))).digest('hex');
}

/**
 * Validates a lane's seeds and drops the ones that would retrieve nothing.
 *
 * Called where the discovery plan builds its lanes, so a whole-concept phrase ("AI desktop
 * assistant") or a non-English one never reaches the scout as a search seed. Dropping is
 * deliberate: a run with two usable part queries is better than one that spends its rounds on
 * phrases that return no screens. The lane itself stays, and its `purpose` still says what is
 * wanted, so a reader sees a thin lane rather than a silently confident one.
 */
export function querySeeds(lane: 'component' | 'craft' | 'mood', seeds: readonly string[]): readonly string[] {
  const kept: string[] = [];
  for (const seed of seeds) {
    try {
      const query = validateReferenceQuery(lane, seed);
      if (!kept.includes(query)) kept.push(query);
    } catch {
      continue;
    }
  }
  return Object.freeze(kept);
}
