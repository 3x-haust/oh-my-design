import { createHash, randomUUID } from 'node:crypto';

export type ExpectedDecision = 'one' | 'none';
export type RaterVote = ExpectedDecision | 'abstain';
export type BriefKind = 'silent-evidence' | 'showpiece' | 'quiet';
export type Surface = 'marketing' | 'product' | 'editorial' | 'mixed';
export type Domain = 'commerce' | 'health' | 'finance' | 'culture';
export type Language = 'en' | 'ko' | 'ja' | 'es';

export interface HoldoutBrief { id: string; kind: BriefKind; expectedDecision: ExpectedDecision; evidence: readonly string[]; surface: Surface; domain: Domain; language: Language; critical?: boolean; deterministic?: boolean; }
export interface ProjectedBrief { id: string; kind: BriefKind; surface: Surface; domain: Domain; language: Language; briefHash: string; evidenceAliases: readonly string[]; }
export interface EvaluatorHoldout { id: string; kind: BriefKind; surface: Surface; domain: Domain; language: Language; expectedDecision: ExpectedDecision; critical: boolean; deterministic: boolean; }
export interface FrozenDevelopmentCorpus { briefs: readonly HoldoutBrief[]; routeMap: Readonly<Record<string, Surface>>; digest: string; }
export interface EvaluatorHoldoutMetadata { holdouts: readonly EvaluatorHoldout[]; digest: string; }
export interface RaterDecision { raterId: string; vote: RaterVote; }
export interface BriefScore { id: string; winner: boolean; complete: boolean; votesForExpected: number; votesAgainstExpected: number; abstentions: number; reason: string; }
export interface HarnessBudget { rounds: number; elapsedMinutes: number; browserLaunches: number; tokens: number; usd: number; }
export interface HarnessResult { pass: boolean; score: number; wins: number; denominator: number; deterministicFailures: string[]; criticalFailures: string[]; briefScores: BriefScore[]; }
export interface EvidenceConsumptionReceipt { alias: string; bytes: number; sha256: string; expiresAt: number; receiptHash: string; }
export interface AliasAuthority { alias: string; sha256: string; byteLength: number; }
export interface UsageTelemetry { tokens: number; usd: number; }
export interface BuildRunReceipt { laneId: string; briefHash: string; artifactHash: string; artifactBytes: Uint8Array; consumptionReceiptHashes: readonly string[]; receiptHash: string; }
export interface BrowserRunReceipt { laneId: string; briefHash: string; buildReceiptHash: string; observationHash: string; observationBytes: Uint8Array; receiptHash: string; }
export interface ReviewerRunReceipt { laneId: string; raterId: string; briefHash: string; buildReceiptHash: string; browserReceiptHash: string; vote: RaterVote; receiptHash: string; }
export interface AliasResolver { readonly scope: string; readonly expiresAt: number; resolve(alias: string): { readonly bytes: Uint8Array; readonly receipt: EvidenceConsumptionReceipt }; consumedReceipts(): readonly EvidenceConsumptionReceipt[]; }
export interface AliasResolverCapability { readonly now: number; readonly scope: string; }

const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(value);
const hashRecord = (value: object): string => sha256(canonical(value));
const hashPattern = /^[a-f0-9]{64}$/;
const legalSurfaces: readonly Surface[] = ['marketing', 'product', 'editorial', 'mixed'];
const legalDomains: readonly Domain[] = ['commerce', 'health', 'finance', 'culture'];
const legalLanguages: readonly Language[] = ['en', 'ko', 'ja', 'es'];
const legalDecisions: readonly ExpectedDecision[] = ['none', 'one'];
export type LegalCell = Readonly<{ surface: Surface; domain: Domain; language: Language; expectedDecision: ExpectedDecision }>;
export function canonicalLegalCellManifest(): readonly LegalCell[] { return Object.freeze(legalSurfaces.flatMap(surface => legalDomains.flatMap(domain => legalLanguages.flatMap(language => legalDecisions.map(expectedDecision => Object.freeze({ surface, domain, language, expectedDecision })))))); }

export function createEvaluatorHoldout(brief: HoldoutBrief): EvaluatorHoldout { return { id: brief.id, kind: brief.kind, surface: brief.surface, domain: brief.domain, language: brief.language, expectedDecision: brief.expectedDecision, critical: brief.critical === true, deterministic: brief.deterministic === true }; }
export function createEvaluatorHoldoutMetadata(briefs: readonly HoldoutBrief[]): EvaluatorHoldoutMetadata { const holdouts = briefs.map(brief => Object.freeze(createEvaluatorHoldout(brief))); return Object.freeze({ holdouts: Object.freeze(holdouts), digest: hashRecord(holdouts) }); }
export function projectHoldoutBrief(brief: HoldoutBrief, salt: string): ProjectedBrief {
  if (!salt || !brief.evidence.length) throw new Error(`projection salt and evidence are required for ${brief.id}`);
  const id = `holdout-${sha256(`${salt}:${brief.id}`).slice(0, 32)}`;
  return Object.freeze({ id, kind: brief.kind, surface: brief.surface, domain: brief.domain, language: brief.language, briefHash: sha256(canonical({ id, kind: brief.kind, surface: brief.surface, domain: brief.domain, language: brief.language, salt })), evidenceAliases: Object.freeze(brief.evidence.map((evidence, index) => `evidence-${index + 1}-${sha256(`${salt}:${evidence}`).slice(0, 16)}`)) });
}
export function validateProjectedBrief(projected: ProjectedBrief): void {
  const serialized = canonical(projected).toLowerCase();
  if ('expectedDecision' in projected || serialized.includes('expecteddecision') || serialized.includes('"one"') || serialized.includes('"none"')) throw new Error('projected brief leaks an expected outcome');
  if (!/^holdout-[a-f0-9]{32}$/.test(projected.id) || !hashPattern.test(projected.briefHash) || !legalSurfaces.includes(projected.surface) || !legalDomains.includes(projected.domain) || !legalLanguages.includes(projected.language) || !projected.evidenceAliases.length || projected.evidenceAliases.some(alias => !/^evidence-\d+-[a-f0-9]{16}$/.test(alias))) throw new Error('projected brief has invalid fields');
}
export function validateAliasEvidence(projected: ProjectedBrief, rawEvidence: readonly string[], authority: readonly AliasAuthority[]): void {
  validateProjectedBrief(projected);
  if (rawEvidence.length !== projected.evidenceAliases.length || authority.length !== projected.evidenceAliases.length) throw new Error('invalid immutable alias authority');
  for (const [index, alias] of projected.evidenceAliases.entries()) {
    const bytes = new TextEncoder().encode(rawEvidence[index]!);
    const expected = authority[index];
    if (!expected || expected.alias !== alias || !hashPattern.test(expected.sha256) || !Number.isSafeInteger(expected.byteLength) || expected.byteLength <= 0 || expected.byteLength !== bytes.byteLength || expected.sha256 !== sha256(bytes)) throw new Error(`raw evidence does not match immutable alias authority: ${alias}`);
  }
}
/** Evaluator-owned resolver: one alias, one consumption, byte-authorized, and explicitly expiring. */
export function createAliasResolver(projected: ProjectedBrief, rawEvidence: readonly string[], authority: readonly AliasAuthority[], now: number, ttlMs = 60_000, byteLimit = 8 * 1024 * 1024, capability?: AliasResolverCapability): AliasResolver {
  validateProjectedBrief(projected);
  if (!Number.isSafeInteger(now) || ttlMs <= 0 || byteLimit <= 0 || (capability && (!Number.isSafeInteger(capability.now) || !capability.scope))) throw new Error('invalid alias resolver capability');
  validateAliasEvidence(projected, rawEvidence, authority);
  const source = new Map<string, Uint8Array>(projected.evidenceAliases.map((alias, index): [string, Uint8Array] => [alias, new TextEncoder().encode(rawEvidence[index]!)]));
  const used = new Set<string>(); const consumed: EvidenceConsumptionReceipt[] = []; const expiresAt = now + ttlMs; const scope = capability?.scope ?? `alias:${projected.briefHash}:${randomUUID()}`;
  return Object.freeze({ scope, expiresAt, resolve(alias: string) {
    if ((capability ? capability.now : Date.now()) > expiresAt || used.has(alias)) throw new Error('alias capability expired or already consumed');
    const bytes = source.get(alias); if (!bytes || bytes.byteLength > byteLimit) throw new Error('alias is unavailable or exceeds byte limit');
    used.add(alias); const receipt = Object.freeze({ alias, bytes: bytes.byteLength, sha256: sha256(bytes), expiresAt, receiptHash: hashRecord({ scope, alias, bytes: bytes.byteLength, sha256: sha256(bytes), expiresAt }) });
    consumed.push(receipt);
    return Object.freeze({ bytes: bytes.slice(), receipt });
  }, consumedReceipts: () => Object.freeze([...consumed]) });
}
export function validateLegalSurfaceMatrix(briefs: readonly HoldoutBrief[], routeMap: Readonly<Record<string, Surface>>): void {
  const ids = new Set<string>(); const cells = new Set<string>();
  for (const brief of briefs) {
    if (!brief.id || ids.has(brief.id) || !legalSurfaces.includes(brief.surface) || !legalDomains.includes(brief.domain) || !legalLanguages.includes(brief.language) || !legalDecisions.includes(brief.expectedDecision) || !Array.isArray(brief.evidence) || !brief.evidence.length || routeMap[brief.id] !== brief.surface) throw new Error(`invalid legal-cell brief: ${brief.id}`);
    ids.add(brief.id); const cell = `${brief.surface}:${brief.domain}:${brief.language}:${brief.expectedDecision}`;
    if (cells.has(cell)) throw new Error(`duplicate legal cell: ${cell}`); cells.add(cell);
  }
  if (Object.keys(routeMap).length !== briefs.length || canonicalLegalCellManifest().some(cell => !cells.has(`${cell.surface}:${cell.domain}:${cell.language}:${cell.expectedDecision}`)) || cells.size !== canonicalLegalCellManifest().length) throw new Error('canonical crossed legal-cell manifest is missing, extra, or illegal cells');
}
type QuotaBrief = Pick<EvaluatorHoldout, 'surface' | 'expectedDecision' | 'domain' | 'language'>;
function quota(briefs: readonly QuotaBrief[], label: string): void {
  for (const surface of legalSurfaces) for (const domain of legalDomains) for (const language of legalLanguages) {
    const none = briefs.filter(brief => brief.surface === surface && brief.domain === domain && brief.language === language && brief.expectedDecision === 'none').length;
    const one = briefs.filter(brief => brief.surface === surface && brief.domain === domain && brief.language === language && brief.expectedDecision === 'one').length;
    if (none !== 1 || one !== 1) throw new Error(`${label} requires exactly one none and one one in every legal stratum`);
  }
}
export function validateDevelopmentCorpus(briefs: readonly HoldoutBrief[], routeMap: Readonly<Record<string, Surface>> = Object.fromEntries(briefs.map(brief => [brief.id, brief.surface]))): void { validateLegalSurfaceMatrix(briefs, routeMap); quota(briefs, 'development corpus'); }
export function freezeDevelopmentCorpus(briefs: readonly HoldoutBrief[], routeMap: Readonly<Record<string, Surface>>): FrozenDevelopmentCorpus { validateDevelopmentCorpus(briefs, routeMap); const snapshot = briefs.map(brief => Object.freeze({ ...brief, evidence: Object.freeze([...brief.evidence]) })); const frozenRouteMap = Object.freeze({ ...routeMap }); return Object.freeze({ briefs: Object.freeze(snapshot), routeMap: frozenRouteMap, digest: hashRecord({ briefs: snapshot, routeMap: frozenRouteMap }) }); }
export function validateFrozenDevelopmentCorpus(corpus: FrozenDevelopmentCorpus): void { if (!Object.isFrozen(corpus) || !Object.isFrozen(corpus.briefs) || !Object.isFrozen(corpus.routeMap) || corpus.briefs.some(brief => !Object.isFrozen(brief) || !Object.isFrozen(brief.evidence)) || !hashPattern.test(corpus.digest) || corpus.digest !== hashRecord({ briefs: corpus.briefs, routeMap: corpus.routeMap })) throw new Error('development corpus is not frozen or its digest drifted'); validateDevelopmentCorpus(corpus.briefs, corpus.routeMap); }
export function validateEvaluatorHoldoutMetadata(metadata: EvaluatorHoldoutMetadata): void { if (!Object.isFrozen(metadata) || !Object.isFrozen(metadata.holdouts) || metadata.holdouts.some(holdout => !Object.isFrozen(holdout)) || !hashPattern.test(metadata.digest) || metadata.digest !== hashRecord(metadata.holdouts)) throw new Error('evaluator holdout metadata is not frozen or its digest drifted'); quota(metadata.holdouts, 'evaluator holdout'); const count = (expected: ExpectedDecision) => metadata.holdouts.filter(holdout => holdout.kind === 'silent-evidence' && holdout.expectedDecision === expected).length; if (count('one') < 2 || count('none') < 2) throw new Error('evaluator holdout requires balanced silent decisions'); }
export function scoreBrief(expected: EvaluatorHoldout, decisions: readonly RaterDecision[]): BriefScore { const unique = new Map<string, RaterVote>(); for (const decision of decisions) { if (!decision.raterId || unique.has(decision.raterId)) throw new Error(`rater identities must be independent for ${expected.id}`); unique.set(decision.raterId, decision.vote); } const votes = [...unique.values()]; const abstentions = votes.filter(vote => vote === 'abstain').length; const votesForExpected = votes.filter(vote => vote === expected.expectedDecision).length; const votesAgainstExpected = votes.length - abstentions - votesForExpected; if (votes.length < 3) return { id: expected.id, winner: false, complete: false, votesForExpected, votesAgainstExpected, abstentions, reason: 'fewer than three independent raters' }; if (votes.length - abstentions < 2) return { id: expected.id, winner: false, complete: false, votesForExpected, votesAgainstExpected, abstentions, reason: 'fewer than two non-abstaining raters' }; if (votesForExpected === votesAgainstExpected) return { id: expected.id, winner: false, complete: false, votesForExpected, votesAgainstExpected, abstentions, reason: 'tied quorum is incomplete' }; const winner = votesForExpected > votesAgainstExpected; return { id: expected.id, winner, complete: true, votesForExpected, votesAgainstExpected, abstentions, reason: winner ? 'strict majority matched expected decision' : 'strict majority rejected expected decision' }; }
export function validateBudget(budget: HarnessBudget): void { const limits: HarnessBudget = { rounds: 3, elapsedMinutes: 30, browserLaunches: 256, tokens: 250_000, usd: 10 }; for (const key of Object.keys(limits) as (keyof HarnessBudget)[]) if (!Number.isFinite(budget[key]) || budget[key] < 0 || budget[key] > limits[key]) throw new Error(`budget exceeded: ${key} (max ${limits[key]})`); }
export function evaluateHarness(holdouts: readonly EvaluatorHoldout[], decisions: Readonly<Record<string, readonly RaterDecision[]>>, budget: HarnessBudget): HarnessResult { validateBudget(budget); if (!holdouts.length) throw new Error('at least one holdout brief is required'); quota(holdouts, 'evaluator holdout'); const ids = new Set<string>(); const briefScores = holdouts.map(holdout => { if (ids.has(holdout.id)) throw new Error(`duplicate holdout id: ${holdout.id}`); ids.add(holdout.id); return scoreBrief(holdout, decisions[holdout.id] ?? []); }); const failed = (property: 'critical' | 'deterministic') => holdouts.filter((holdout, index) => holdout[property] && !briefScores[index]!.winner).map(holdout => holdout.id); const strata = new Map<string, boolean[]>(); for (const [index, holdout] of holdouts.entries()) { const key = `${holdout.surface}:${holdout.domain}:${holdout.language}`; const values = strata.get(key) ?? []; values.push(briefScores[index]!.winner); strata.set(key, values); } const score = [...strata.values()].reduce((total, values) => total + values.filter(Boolean).length / values.length, 0) / strata.size; const wins = briefScores.filter(item => item.winner).length; return { pass: score >= 0.8 && !failed('deterministic').length && !failed('critical').length, score, wins, denominator: holdouts.length, deterministicFailures: failed('deterministic'), criticalFailures: failed('critical'), briefScores }; }
export const receiptHash = hashRecord;
