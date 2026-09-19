// Design judgment — the layer between an observation and a product decision.
//
// The failure this module exists to prevent, observed on a real run:
//
//   reference: "radius ladder empty"
//     -> "square corners are trustworthy"
//     -> "the product uses square corners"
//
// Each step looks reasonable and the conclusion is wrong. The middle question was never asked:
// **why did that work THERE?** Square corners work in a dense administrative form because they lower
// visual ambiguity in an official context. That is a property of that form's job, not a verdict on
// the product's visual language. Promoting it silently killed the hierarchy of every screen.
//
// The same error ran through the whole set: "two type sizes", "no decorative motion", "one primary
// action", "no diffuse accent" are each true OF THE PLACE THEY WERE OBSERVED. Handed to a model as
// generation rules they are applied literally and every screen flattens together.
//
// So an observation is EVIDENCE, and evidence needs a judgment before it becomes a decision:
//
//   OBSERVATION      what the capture actually shows
//   WHY IT WORKS     the job that made it work there
//   RELEVANCE        how much of that job this product shares
//   ADOPT / REJECT   what transfers, and what deliberately does not
//   INTERPRETATION   what this product does instead
//
// A low-relevance observation may inform a local decision; it may not become product-wide language.

import { createHash } from 'node:crypto';

export const DESIGN_JUDGMENT_SCHEMA = 'design-judgment-v1' as const;

export const JUDGMENT_RELEVANCE = ['high', 'medium', 'low', 'none'] as const;
export type JudgmentRelevance = (typeof JUDGMENT_RELEVANCE)[number];

/** How far a decision reaches. A product-wide decision needs a relevance judgment that supports it. */
export const JUDGMENT_SCOPES = ['product-wide', 'surface', 'component'] as const;
export type JudgmentScope = (typeof JUDGMENT_SCOPES)[number];

export type ReferenceJudgment = Readonly<{
  id: string;
  /** What the capture shows, measurably where possible. A verdict here fails the judgment. */
  observation: string;
  whyItWorksThere: string;
  relevance: JudgmentRelevance;
  adopt: readonly string[];
  /** What deliberately does not transfer, and why not. */
  reject: readonly string[];
  interpretation: string;
  scope: JudgmentScope;
}>;

/**
 * The product-level direction, stated the way a designer states it — as a felt target the composition
 * can be judged against, not as a numeric constraint. This is what a model can actually design from;
 * "the benefit is the dominant object; navigation and assistance stay visually subordinate" carries
 * more compositional information than a spacing ladder.
 */
export type DesignHypothesis = Readonly<{
  schema: typeof DESIGN_JUDGMENT_SCHEMA;
  /** What this product should feel like, as a comparison. */
  feelsLike: string;
  dominantObject: string;
  subordinate: readonly string[];
  densityIntent: string;
  trustSource: string;
  /** The impression a stranger should report after two seconds. */
  twoSecondRead: string;
}>;

export const DESIGN_JUDGMENT_PATH = '.omd/design-judgment.json' as const;

export type DesignJudgmentRecord = Readonly<{
  schema: typeof DESIGN_JUDGMENT_SCHEMA;
  /** Exact current reference-board digest this interpretation was made from. */
  referenceBoardSha256: string;
  hypothesis: DesignHypothesis;
  judgments: readonly ReferenceJudgment[];
}>;

export type DesignJudgmentErrorCode =
  | 'MALFORMED_DESIGN_JUDGMENT'
  | 'JUDGMENT_MISSING_WHY'
  | 'JUDGMENT_OVERREACH'
  | 'DESIGN_HYPOTHESIS_GENERIC';

export class DesignJudgmentError extends Error {
  override readonly name = 'DesignJudgmentError';
  readonly code: DesignJudgmentErrorCode;
  constructor(code: DesignJudgmentErrorCode, reason: string) {
    super(`design judgment is invalid: ${reason}`);
    this.code = code;
  }
}

const fail = (code: DesignJudgmentErrorCode, reason: string): never => { throw new DesignJudgmentError(code, reason); };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, label: string): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : fail('MALFORMED_DESIGN_JUDGMENT', `${label} must be a non-empty string`);
const exact = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('MALFORMED_DESIGN_JUDGMENT', `${label} has unknown or missing keys`);
  }
};
const strings = (value: unknown, label: string): readonly string[] => {
  const list: unknown[] = Array.isArray(value) ? value : fail('MALFORMED_DESIGN_JUDGMENT', `${label} must be an array`);
  return Object.freeze(list.map((entry, index) => text(entry, `${label}[${index}]`)));
};

/**
 * A verdict wearing an observation's clothes: "square corners are trustworthy" is a conclusion, not
 * something a capture shows. Detected rather than trusted, because this is the exact substitution the
 * observed run made.
 */
const isVerdict = (observation: string): boolean =>
  /\b(?:is|are|should be|must be)\s+(?:better|worse|trustworth\w*|clean\w*|modern|professional|good|bad|right|wrong)\b/i.test(observation)
  || /(?:하는 게 좋|해야 한다|신뢰감을 준다|세련되다)/.test(observation);

export function parseReferenceJudgment(value: unknown, index: number): ReferenceJudgment {
  const label = `judgments[${index}]`;
  const record = isRecord(value) ? value : fail('MALFORMED_DESIGN_JUDGMENT', `${label} must be an object`);
  exact(record, ['id', 'observation', 'whyItWorksThere', 'relevance', 'adopt', 'reject', 'interpretation', 'scope'], label);
  const observation = text(record.observation, `${label}.observation`);
  if (isVerdict(observation)) {
    fail('JUDGMENT_MISSING_WHY', `${label}.observation states a verdict ("${observation}") rather than what the capture shows. Record the observation, then the job that made it work in that context`);
  }
  if (!JUDGMENT_RELEVANCE.includes(record.relevance as JudgmentRelevance)) {
    fail('MALFORMED_DESIGN_JUDGMENT', `${label}.relevance must be one of ${JUDGMENT_RELEVANCE.join(', ')}`);
  }
  if (!JUDGMENT_SCOPES.includes(record.scope as JudgmentScope)) {
    fail('MALFORMED_DESIGN_JUDGMENT', `${label}.scope must be one of ${JUDGMENT_SCOPES.join(', ')}`);
  }
  const relevance = record.relevance as JudgmentRelevance;
  const scope = record.scope as JudgmentScope;
  // The overreach guard. An observation whose job this product does not share may still suggest a
  // local decision; it may not become the product's visual language. This is the rule that was
  // missing when one administrative form's square corners became every screen's geometry.
  if (scope === 'product-wide' && (relevance === 'low' || relevance === 'none')) {
    fail('JUDGMENT_OVERREACH', `${label} makes a product-wide decision from ${relevance}-relevance evidence. A capture whose job this product does not share can inform a surface or component decision at most; state the interpretation that belongs to this product instead`);
  }
  return Object.freeze({
    id: text(record.id, `${label}.id`),
    observation,
    whyItWorksThere: text(record.whyItWorksThere, `${label}.whyItWorksThere`),
    relevance,
    adopt: strings(record.adopt, `${label}.adopt`),
    reject: strings(record.reject, `${label}.reject`),
    interpretation: text(record.interpretation, `${label}.interpretation`),
    scope,
  });
}

export function parseDesignHypothesis(value: unknown): DesignHypothesis {
  const record = isRecord(value) ? value : fail('MALFORMED_DESIGN_JUDGMENT', 'hypothesis must be an object');
  exact(record, ['schema', 'feelsLike', 'dominantObject', 'subordinate', 'densityIntent', 'trustSource', 'twoSecondRead'], 'hypothesis');
  if (record.schema !== DESIGN_JUDGMENT_SCHEMA) fail('MALFORMED_DESIGN_JUDGMENT', `hypothesis.schema must be ${DESIGN_JUDGMENT_SCHEMA}`);
  const subordinate = strings(record.subordinate, 'hypothesis.subordinate');
  if (subordinate.length === 0) fail('MALFORMED_DESIGN_JUDGMENT', 'hypothesis.subordinate must name at least one thing that stays subordinate');
  return Object.freeze({
    schema: DESIGN_JUDGMENT_SCHEMA,
    feelsLike: text(record.feelsLike, 'hypothesis.feelsLike'),
    dominantObject: text(record.dominantObject, 'hypothesis.dominantObject'),
    subordinate,
    densityIntent: text(record.densityIntent, 'hypothesis.densityIntent'),
    trustSource: text(record.trustSource, 'hypothesis.trustSource'),
    twoSecondRead: text(record.twoSecondRead, 'hypothesis.twoSecondRead'),
  });
}

/**
 * Confirms a hypothesis is specific enough to design from. A hypothesis that names no dominant
 * object, or whose two-second read would fit any product, gives a model nothing to compose with —
 * which is how a run ends up back at the category average.
 */
export function checkDesignHypothesis(hypothesis: DesignHypothesis): readonly string[] {
  const findings: string[] = [];
  if (/^(?:a|an|the)?\s*(?:modern|clean|simple|professional|intuitive)\b/i.test(hypothesis.feelsLike)) {
    findings.push('feelsLike opens with an interchangeable adjective; state the comparison that makes this product recognisable ("a personal administrative workspace, not a government portal")');
  }
  if (hypothesis.twoSecondRead.trim().split(/\s+/).length < 4) {
    findings.push('twoSecondRead is too short to discriminate between two plausible impressions');
  }
  if (hypothesis.dominantObject.trim().split(/\s+/).length < 2) {
    findings.push('dominantObject names nothing specific enough to carry visual weight');
  }
  return Object.freeze(findings);
}

const SHA256 = /^[a-f0-9]{64}$/;

export function parseDesignJudgmentRecord(value: unknown): DesignJudgmentRecord {
  const record = isRecord(value) ? value : fail('MALFORMED_DESIGN_JUDGMENT', 'record must be an object');
  exact(record, ['schema', 'referenceBoardSha256', 'hypothesis', 'judgments'], 'record');
  if (record.schema !== DESIGN_JUDGMENT_SCHEMA) {
    fail('MALFORMED_DESIGN_JUDGMENT', `record.schema must be ${DESIGN_JUDGMENT_SCHEMA}`);
  }
  const referenceBoardSha256 = text(record.referenceBoardSha256, 'record.referenceBoardSha256');
  if (!SHA256.test(referenceBoardSha256)) {
    fail('MALFORMED_DESIGN_JUDGMENT', 'record.referenceBoardSha256 must be a lowercase SHA-256');
  }
  if (!Array.isArray(record.judgments) || record.judgments.length === 0) {
    fail('MALFORMED_DESIGN_JUDGMENT', 'record.judgments must contain at least one interpretation');
  }
  const rawJudgments = record.judgments as unknown[];
  const judgments: readonly ReferenceJudgment[] = Object.freeze(
    rawJudgments.map((entry, index) => parseReferenceJudgment(entry, index)),
  );
  if (new Set(judgments.map((judgment) => judgment.id)).size !== judgments.length) {
    fail('MALFORMED_DESIGN_JUDGMENT', 'record.judgments must not repeat an id');
  }
  if (judgments.some((judgment) => judgment.adopt.length === 0 && judgment.reject.length === 0)) {
    fail('MALFORMED_DESIGN_JUDGMENT', 'each judgment must explicitly adopt or reject something');
  }
  const hypothesis = parseDesignHypothesis(record.hypothesis);
  const findings = checkDesignHypothesis(hypothesis);
  if (findings.length > 0) fail('DESIGN_HYPOTHESIS_GENERIC', findings.join('; '));
  return Object.freeze({ schema: DESIGN_JUDGMENT_SCHEMA, referenceBoardSha256, hypothesis, judgments });
}

export function designJudgmentSha256(
  hypothesis: DesignHypothesis,
  judgments: readonly ReferenceJudgment[],
): string {
  return createHash('sha256').update(JSON.stringify({
    hypothesis,
    judgments: judgments.map((judgment) => `${judgment.id}:${judgment.observation}:${judgment.relevance}:${judgment.scope}`),
  })).digest('hex');
}

export function designJudgmentRecordSha256(record: DesignJudgmentRecord): string {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}
