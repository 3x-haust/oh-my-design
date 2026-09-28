// Query strings are agent-authored search suggestions. Only mechanical resource bounds apply here;
// relevance and language are judgments about observed results, not properties of query spelling.

import { createHash } from 'node:crypto';
import { referenceDecision, type ReferenceJudgmentBinding } from './judgment-policy.ts';

export const REFERENCE_QUERY_SCHEMA = 'reference-query-v1' as const;

export const MAX_QUERY_WORDS = 4;
export const MAX_MOOD_QUERY_WORDS = 12;
const MAX_QUERY_LENGTH = 4096;

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

export function validateReferenceQuery(_lane: ReferenceQueryLane, query: string): string {
  if (typeof query !== 'string') fail('MALFORMED_REFERENCE_QUERY', 'query must be text');
  const trimmed = query.trim();
  if (!trimmed || trimmed.length > MAX_QUERY_LENGTH || /[\u0000-\u001f\u007f]/u.test(trimmed))
    fail('MALFORMED_REFERENCE_QUERY', 'query must be nonempty, bounded text');
  return trimmed;
}

/**
 * Surface names are suggestions, not proof that a query fits the task.
 */
export function queriesFromSurfaces(surfaces: readonly string[], _domain: string): readonly string[] {
  return Object.freeze(surfaces.flatMap((surface) => {
    const query = surface.trim();
    if (query === '') return [];
    try {
      return [validateReferenceQuery('component', query)];
    } catch {
      return [];
    }
  }));
}

export async function assessDiscoveryQuery(query: string, binding?: ReferenceJudgmentBinding) {
  if (binding && binding.subjectId !== query) throw new Error('AI_JUDGMENT_CONTEXT_MISMATCH');
  return referenceDecision('discovery-query', binding);
}

export function referenceQuerySha256(queries: readonly ReferenceQuery[]): string {
  return createHash('sha256').update(JSON.stringify(queries.map((query) => `${query.lane}:${query.query}`))).digest('hex');
}

/**
 * Retain bounded, nonempty seeds without deciding their relevance from vocabulary.
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
