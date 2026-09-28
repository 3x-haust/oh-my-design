import { knownFields } from './schema.ts';

export type GateFinding = Readonly<{ code: string; classification: 'hard' | 'advisory'; subjectId: string; sourceDigests: readonly string[]; message: string }>;
export type AdvisoryResponse = Readonly<{ code: string; subjectId: string; decision: 'skip' | 'defer' | 'accept-risk'; reason: string }>;
export function assessGate(findings: readonly GateFinding[], responses: readonly AdvisoryResponse[]): {
  ok: boolean; hardBlockers: GateFinding[]; warnings: GateFinding[]; advisoryResponsesNeeded: GateFinding[];
} {
  const hardBlockers = findings.filter(f => f.classification === 'hard');
  const warnings = findings.filter(f => f.classification === 'advisory');
  return { ok: hardBlockers.length === 0, hardBlockers, warnings, advisoryResponsesNeeded: warnings.filter(f => !responses.some(r => r.code === f.code && r.subjectId === f.subjectId && r.reason.trim())) };
}
export function parseAdvisoryResponse(input: unknown): { value: AdvisoryResponse; warnings: import('./schema.ts').SchemaWarning[] } {
  const { value, warnings } = knownFields(input, ['code', 'subjectId', 'decision', 'reason'], [], 'advisoryResponse');
  if (typeof value.code !== 'string' || !value.code || typeof value.subjectId !== 'string' || !value.subjectId
    || !['skip', 'defer', 'accept-risk'].includes(value.decision as string) || typeof value.reason !== 'string' || !value.reason.trim()) throw new Error('Invalid advisory response');
  return { value: value as AdvisoryResponse, warnings };
}
