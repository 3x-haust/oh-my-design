import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Verdict = 'found' | 'partial' | 'absent';
export interface ReferenceDistance { numerator: bigint | number | string; denominator: bigint | number | string; }
export interface TranscriptEvidence { path: string; sha256: string; kind: 'screenshot' | 'timing' | 'transcript' | 'server-stdout' | 'server-stderr' | 'server-exit'; }
export interface AuthenticatedTranscript { schemaVersion: 'product-ux-browser-transcript-v1'; steps: readonly { task: string; detail: string; elapsedMs: number; }[]; evidence: readonly TranscriptEvidence[]; failures: readonly string[]; }
export interface SynthesisMap {
  references: readonly { traitNamed: Verdict; traitVisible: Verdict; adaptation: Verdict; distance?: ReferenceDistance }[];
  integration: { noClone: Verdict; oneSystem: Verdict; explicitDeclines: Verdict };
}
export interface ScoreInput {
  schemaVersion: 'product-ux-score-input-v1';
  ux: Record<string, number>;
  synthesisMap: SynthesisMap;
  visual: Record<string, number>;
  transcript?: AuthenticatedTranscript;
  candidateId?: string;
}
export interface SealedScore { result: ScoreResult; transcript: AuthenticatedTranscript; }
export interface RegressionEvidence {
  sealedBefore: SealedScore; sealedAfter: SealedScore;
  publicFixtureBefore: readonly SealedScore[]; publicFixtureAfter: readonly SealedScore[];
  marketingGuard: { before: number; after: number; threshold: number };
}
export interface ScoreResult {
  schemaVersion: 'product-ux-score-result-v1'; score: number; rawScore: number;
  categoryScores: { ux: number; synthesis: number; visual: number }; floors: string[];
  synthesisAvailable: boolean; referenceDistancePass: boolean | null; publicRegressionPass: boolean;
  adjudicationRequired: boolean; anonymizedId?: 'A' | 'B';
}

const scoring = JSON.parse(readFileSync(fileURLToPath(new URL('../../evals/product-ux/harness/scoring-v1.json', import.meta.url)), 'utf8')) as {
  dimensions: { ux: Record<string, number>; visual: Record<string, number> };
  publicRegression: { candidateNonRegression: number; publicFixtureNonRegression: number; marketingNonRegression: number };
};
const requiredEvidence = new Set<TranscriptEvidence['kind']>(['transcript', 'timing', 'server-stdout', 'server-stderr', 'server-exit']);

function asBigInt(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error('reference distance must use exact integers');
}
function floorRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) throw new Error('invalid rational denominator');
  return Number(numerator / denominator);
}
function units(verdict: Verdict): bigint {
  if (verdict === 'found') return 2n;
  if (verdict === 'partial') return 1n;
  if (verdict === 'absent') return 0n;
  throw new Error('invalid synthesis verdict');
}
function category(name: 'ux' | 'visual', values: Record<string, number>): number {
  let score = 0;
  for (const [dimension, maximum] of Object.entries(scoring.dimensions[name])) {
    const value = values[dimension];
    if (value === undefined || !Number.isInteger(value) || value < 0 || value > maximum) throw new Error(`invalid ${name}.${dimension}`);
    score += value;
  }
  for (const dimension of Object.keys(values)) if (!(dimension in scoring.dimensions[name])) throw new Error(`unknown ${name}.${dimension}`);
  return score;
}
function synthesisScore(map: SynthesisMap): { score: number; available: boolean; referenceDistancePass: boolean | null } {
  if (!Array.isArray(map.references) || !map.integration) throw new Error('missing synthesis map');
  const references = map.references;
  let extractionUnits = 0n, reflectionUnits = 0n;
  let distancePass: boolean | null = references.length ? true : null;
  for (const reference of references) {
    extractionUnits += units(reference.traitNamed) + units(reference.traitVisible);
    reflectionUnits += units(reference.adaptation);
    if (!reference.distance) { distancePass = false; continue; }
    const numerator = asBigInt(reference.distance.numerator), denominator = asBigInt(reference.distance.denominator);
    if (numerator < 0n || denominator <= 0n) throw new Error('invalid reference distance');
    if (!(numerator * 5n < denominator * 3n)) distancePass = false;
  }
  const count = BigInt(references.length);
  const extraction = count ? floorRatio(5n * extractionUnits, 4n * count) : 0;
  const reflection = count ? floorRatio(10n * reflectionUnits, 2n * count) : 0;
  const integration = floorRatio(10n * (units(map.integration.noClone) + units(map.integration.oneSystem) + units(map.integration.explicitDeclines)), 6n);
  return { score: extraction + reflection + integration, available: references.length > 0, referenceDistancePass: distancePass };
}
function authenticatedEvidenceMissing(transcript: AuthenticatedTranscript | undefined): boolean {
  if (!transcript || transcript.schemaVersion !== 'product-ux-browser-transcript-v1') return true;
  const present = new Set<TranscriptEvidence['kind']>();
  for (const item of transcript.evidence) {
    if (!/^[a-f0-9]{64}$/.test(item.sha256)) return true;
    try { if (createHash('sha256').update(readFileSync(item.path)).digest('hex') !== item.sha256) return true; } catch { return true; }
    present.add(item.kind);
  }
  return [...requiredEvidence].some((kind) => !present.has(kind));
}
function hasTaskFailure(transcript: AuthenticatedTranscript | undefined): boolean { return Boolean(transcript?.failures.length); }
function hasMobileFailure(transcript: AuthenticatedTranscript | undefined): boolean {
  return transcript?.failures.some((failure) => /\/(390|320)(?::|\b)/.test(failure)) ?? false;
}
function regressionPass(score: number, evidence: RegressionEvidence | undefined): boolean {
  if (!evidence || authenticatedEvidenceMissing(evidence.sealedBefore.transcript) || authenticatedEvidenceMissing(evidence.sealedAfter.transcript)) return false;
  const nonRegression = (after: number, before: number, threshold: number) => after - before >= threshold;
  if (evidence.sealedAfter.result.score !== score || !nonRegression(score, evidence.sealedBefore.result.score, scoring.publicRegression.candidateNonRegression)) return false;
  if (!evidence.publicFixtureBefore.length || evidence.publicFixtureBefore.length !== evidence.publicFixtureAfter.length) return false;
  if (!evidence.publicFixtureBefore.every((before, index) => !authenticatedEvidenceMissing(before.transcript) && !authenticatedEvidenceMissing(evidence.publicFixtureAfter[index]!.transcript) && nonRegression(evidence.publicFixtureAfter[index]!.result.score, before.result.score, scoring.publicRegression.publicFixtureNonRegression))) return false;
  return evidence.marketingGuard.threshold === scoring.publicRegression.marketingNonRegression && nonRegression(evidence.marketingGuard.after, evidence.marketingGuard.before, evidence.marketingGuard.threshold);
}

export function scoreResult(input: ScoreInput, options: { compare?: ScoreResult; identityMap?: Readonly<Record<string, 'A' | 'B'>>; regression?: RegressionEvidence } = {}): ScoreResult {
  if (input.schemaVersion !== 'product-ux-score-input-v1') throw new Error('unsupported score input schema');
  const ux = category('ux', input.ux), visual = category('visual', input.visual), synthesis = synthesisScore(input.synthesisMap);
  const floors: string[] = []; let maximum = 100;
  if (hasTaskFailure(input.transcript)) { floors.push('task-failure'); maximum = Math.min(maximum, 59); }
  if (hasMobileFailure(input.transcript)) { floors.push('mobile-failure'); maximum = Math.min(maximum, 69); }
  if (authenticatedEvidenceMissing(input.transcript)) { floors.push('missing-evidence'); maximum = Math.min(maximum, 49); }
  if (synthesis.referenceDistancePass === false) { floors.push('reference-distance'); maximum = Math.min(maximum, 74); }
  const rawScore = ux + synthesis.score + visual, score = Math.min(rawScore, maximum);
  const candidate = input.candidateId === undefined ? undefined : options.identityMap?.[input.candidateId];
  if (input.candidateId !== undefined && candidate === undefined) throw new Error('candidate identity is not anonymized');
  return { schemaVersion: 'product-ux-score-result-v1', score, rawScore, categoryScores: { ux, synthesis: synthesis.score, visual }, floors, synthesisAvailable: synthesis.available, referenceDistancePass: synthesis.referenceDistancePass, publicRegressionPass: regressionPass(score, options.regression), adjudicationRequired: options.compare !== undefined && options.compare.score === score, ...(candidate === undefined ? {} : { anonymizedId: candidate }) };
}
export function compareAnonymized(a: ScoreInput, b: ScoreInput, identityMap: Readonly<Record<string, 'A' | 'B'>>): { A: ScoreResult; B: ScoreResult; adjudicationRequired: boolean } {
  const first = scoreResult(a, { identityMap }), second = scoreResult(b, { identityMap, compare: first });
  if (first.anonymizedId === second.anonymizedId) throw new Error('candidates must map to distinct anonymous identities');
  const ordered = first.anonymizedId === 'A' ? { A: first, B: second } : { A: second, B: first };
  return { ...ordered, adjudicationRequired: first.score === second.score };
}
