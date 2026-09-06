export const DESIGN_DEVELOPMENT_CONTRACT_SCHEMA = 'design-development-contract-v1' as const;

type RiskLevel = 'low' | 'medium' | 'high';
type InvestigationKind =
  | 'reference-principle'
  | 'content-state-model'
  | 'structural-layout'
  | 'component-in-context'
  | 'interaction-behavior'
  | 'technical-slice';
type PrincipleDimension = 'spacing' | 'hierarchy' | 'interaction' | 'density' | 'content';
type Fidelity = Readonly<{
  content: 'placeholder' | 'representative' | 'production-like';
  visual: 'none' | 'structural' | 'representative';
  interaction: 'none' | 'clickable' | 'interactive';
  behavior: 'none' | 'representative' | 'production-like';
  environment: 'none' | 'responsive-browser' | 'production-like';
}>;

export type DesignDevelopmentRisk = Readonly<{
  id: string;
  question: string;
  consequence: RiskLevel;
  uncertainty: RiskLevel;
  lateReversalCost: RiskLevel;
}>;
export type DesignDevelopmentInvestigation = Readonly<{
  id: string;
  kind: InvestigationKind;
  riskIds: readonly string[];
  question: string;
  fidelity: Fidelity;
  stopWhen: string;
}>;
export type ReferencePrinciple = Readonly<{
  id: string;
  sourceIds: readonly string[];
  dimension: PrincipleDimension;
  statement: string;
  doNotCopy: readonly string[];
  observableConsequence: string;
}>;
export type DesignDevelopmentContract = Readonly<{
  schema: typeof DESIGN_DEVELOPMENT_CONTRACT_SCHEMA;
  owner: 'user-selected-model';
  mode: 'direct' | 'investigate';
  risks: readonly DesignDevelopmentRisk[];
  investigations: readonly DesignDevelopmentInvestigation[];
  referencePrinciples: readonly ReferencePrinciple[];
  rationale: string;
}>;

export class DesignDevelopmentContractError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const fail = (code: string): never => { throw new DesignDevelopmentContractError(code); };
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('DESIGN_DEVELOPMENT_MALFORMED');
  }
  return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: readonly string[]): void => {
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== 'string') || own.length !== keys.length
    || keys.some((key) => !Object.hasOwn(value, key))) {
    fail('DESIGN_DEVELOPMENT_MALFORMED');
  }
};
const text = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) return fail('DESIGN_DEVELOPMENT_MALFORMED');
  return value;
};
const choice = <T extends string>(value: unknown, values: readonly T[]): T => {
  if (typeof value !== 'string' || !values.includes(value as T)) return fail('DESIGN_DEVELOPMENT_MALFORMED');
  return value as T;
};
const strings = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return fail('DESIGN_DEVELOPMENT_MALFORMED');
  const parsed = value.map(text);
  if (new Set(parsed).size !== parsed.length) fail('DESIGN_DEVELOPMENT_DUPLICATE');
  return Object.freeze(parsed);
};
const list = <T>(value: unknown, parse: (item: unknown) => T): readonly T[] => {
  if (!Array.isArray(value)) return fail('DESIGN_DEVELOPMENT_MALFORMED');
  return Object.freeze(value.map(parse));
};

const parseRisk = (value: unknown): DesignDevelopmentRisk => {
  const item = record(value);
  exact(item, ['id', 'question', 'consequence', 'uncertainty', 'lateReversalCost']);
  return Object.freeze({
    id: text(item.id),
    question: text(item.question),
    consequence: choice(item.consequence, ['low', 'medium', 'high']),
    uncertainty: choice(item.uncertainty, ['low', 'medium', 'high']),
    lateReversalCost: choice(item.lateReversalCost, ['low', 'medium', 'high']),
  });
};

const parseFidelity = (value: unknown): Fidelity => {
  const item = record(value);
  exact(item, ['content', 'visual', 'interaction', 'behavior', 'environment']);
  return Object.freeze({
    content: choice(item.content, ['placeholder', 'representative', 'production-like']),
    visual: choice(item.visual, ['none', 'structural', 'representative']),
    interaction: choice(item.interaction, ['none', 'clickable', 'interactive']),
    behavior: choice(item.behavior, ['none', 'representative', 'production-like']),
    environment: choice(item.environment, ['none', 'responsive-browser', 'production-like']),
  });
};

const parseInvestigation = (value: unknown): DesignDevelopmentInvestigation => {
  const item = record(value);
  exact(item, ['id', 'kind', 'riskIds', 'question', 'fidelity', 'stopWhen']);
  return Object.freeze({
    id: text(item.id),
    kind: choice(item.kind, ['reference-principle', 'content-state-model', 'structural-layout',
      'component-in-context', 'interaction-behavior', 'technical-slice']),
    riskIds: strings(item.riskIds),
    question: text(item.question),
    fidelity: parseFidelity(item.fidelity),
    stopWhen: text(item.stopWhen),
  });
};

const parsePrinciple = (value: unknown): ReferencePrinciple => {
  const item = record(value);
  exact(item, ['id', 'sourceIds', 'dimension', 'statement', 'doNotCopy', 'observableConsequence']);
  const dimension = choice(item.dimension, ['spacing', 'hierarchy', 'interaction', 'density', 'content']);
  const statement = text(item.statement);
  const observableConsequence = text(item.observableConsequence);
  if (/\b(colou?r|palette|purple|gradient|font|radius|shadow)\b/i.test(`${dimension} ${statement} ${observableConsequence}`)
    || /\blooks? like\b/i.test(observableConsequence)) {
    fail('DESIGN_DEVELOPMENT_SURFACE_COPY');
  }
  return Object.freeze({
    id: text(item.id),
    sourceIds: strings(item.sourceIds),
    dimension,
    statement,
    doNotCopy: strings(item.doNotCopy),
    observableConsequence,
  });
};

const uniqueIds = (items: readonly Readonly<{ id: string }>[]): void => {
  if (new Set(items.map(({ id }) => id)).size !== items.length) fail('DESIGN_DEVELOPMENT_DUPLICATE');
};

export const parseDesignDevelopmentContract = (value: unknown): DesignDevelopmentContract => {
  const item = record(value);
  exact(item, ['schema', 'owner', 'mode', 'risks', 'investigations', 'referencePrinciples', 'rationale']);
  if (item.schema !== DESIGN_DEVELOPMENT_CONTRACT_SCHEMA || item.owner !== 'user-selected-model') {
    return fail('DESIGN_DEVELOPMENT_MALFORMED');
  }
  const mode = choice(item.mode, ['direct', 'investigate']);
  const risks = list(item.risks, parseRisk);
  const investigations = list(item.investigations, parseInvestigation);
  const referencePrinciples = list(item.referencePrinciples, parsePrinciple);
  uniqueIds(risks);
  uniqueIds(investigations);
  uniqueIds(referencePrinciples);

  if (mode === 'direct' && (risks.length > 0 || investigations.length > 0 || referencePrinciples.length > 0)) {
    return fail('DESIGN_DEVELOPMENT_DIRECT_HAS_INVESTIGATIONS');
  }
  if (mode === 'investigate') {
    const riskIds = new Set(risks.map(({ id }) => id));
    for (const investigation of investigations) {
      if (investigation.riskIds.length === 0 || investigation.riskIds.some((id) => !riskIds.has(id))) {
        return fail('DESIGN_DEVELOPMENT_UNBOUND_INVESTIGATION');
      }
    }
    const covered = new Set(investigations.flatMap(({ riskIds: ids }) => ids));
    if (risks.length === 0 || risks.some(({ id }) => !covered.has(id))) {
      return fail('DESIGN_DEVELOPMENT_UNCOVERED_RISK');
    }
  }

  return Object.freeze({
    schema: DESIGN_DEVELOPMENT_CONTRACT_SCHEMA,
    owner: 'user-selected-model',
    mode,
    risks,
    investigations,
    referencePrinciples,
    rationale: text(item.rationale),
  });
};
