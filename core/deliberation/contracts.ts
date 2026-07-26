// Design deliberation contracts.
//
// These records externalize decisions, not hidden chain-of-thought. A record keeps only the bounded
// facts another role can verify: the question, real alternatives, selected answer, evidence,
// constraints, rejected alternatives, downstream effects, and observable trade-offs.

export const DECISION_GRAPH_SCHEMA = 'decision-graph-v1' as const;
export const DELIBERATION_SCHEMA = 'design-deliberation-v1' as const;
export const OBSERVATION_SCHEMA = 'visual-observation-v1' as const;
export const ASSEMBLY_COVERAGE_SCHEMA = 'assembly-coverage-v1' as const;
export const ACQUISITION_PLAN_SCHEMA = 'reference-acquisition-plan-v1' as const;

export type DecisionStage = 'frame' | 'copy' | 'type' | 'composition' | 'structure' | 'production' | 'refinement';
export type DecisionRisk = 'low' | 'medium' | 'high' | 'critical';
export type DecisionOwner = 'omd-framer' | 'omd-writer' | 'omd-typesetter' | 'omd-composer' | 'omd-eye' | 'omd-hand';

export type DecisionAlternative = { readonly id: string; readonly label: string };
export type RejectedAlternative = { readonly id: string; readonly reason: string };
export type ConstraintTradeoff = {
  readonly goal: string;
  readonly constraint: string;
  readonly attempt: string;
  readonly failureEvidence: readonly string[];
  readonly compromise: string;
  readonly resultEvidence: readonly string[];
};
export type DesignDecision = {
  readonly id: string;
  readonly stage: DecisionStage;
  readonly risk: DecisionRisk;
  readonly owner: DecisionOwner;
  readonly question: string;
  readonly alternatives: readonly DecisionAlternative[];
  readonly selected: string;
  readonly evidence: readonly string[];
  readonly constraints: readonly string[];
  readonly rejected: readonly RejectedAlternative[];
  readonly affects: readonly string[];
  readonly dependsOn: readonly string[];
  readonly reversible: boolean;
  readonly tradeoffs: readonly ConstraintTradeoff[];
};
export type DecisionGraph = { readonly schema: typeof DECISION_GRAPH_SCHEMA; readonly decisions: readonly DesignDecision[] };

export type Perspective = {
  readonly inputSha256: string;
  readonly position: string;
  readonly evidence: readonly string[];
  readonly objections: readonly string[];
  readonly conditions: readonly string[];
};
export type DesignDeliberation = {
  readonly schema: typeof DELIBERATION_SCHEMA;
  readonly id: string;
  readonly decisionId: string;
  readonly trigger: string;
  readonly moderator: 'omd-eye';
  readonly perspectives: {
    readonly ux: Perspective;
    readonly artDirection: Perspective;
    readonly production: Perspective;
  };
  readonly resolution: { readonly selected: string; readonly rationale: string; readonly conditions: readonly string[] };
};

export type VisualObservation = {
  readonly schema: typeof OBSERVATION_SCHEMA;
  readonly owner: 'omd-hand';
  readonly round: number;
  readonly viewport: '1280x900' | '390x844' | '320x800';
  readonly beforeRender: string;
  readonly metric: 'position' | 'size' | 'line-count' | 'contrast' | 'visibility' | 'motion' | 'flow';
  readonly observed: string;
  readonly judgment: string;
  readonly change: string;
  readonly afterRender: string;
  readonly result: string;
  readonly status: 'RED' | 'GREEN';
};

export type AcquisitionZone = {
  readonly id: string;
  readonly kind: 'section' | 'region' | 'state';
  readonly job: string;
  readonly required: boolean;
};
export type AcquisitionPlan = {
  readonly schema: typeof ACQUISITION_PLAN_SCHEMA;
  readonly owner: 'omd-framer';
  readonly zones: readonly AcquisitionZone[];
};

export type AssemblyZone = {
  readonly id: string;
  readonly job: string;
  readonly referenceRef: string;
  readonly principle: string;
  readonly compositionDecisionId: string;
  readonly productionSelector: string;
  readonly fidelityEvidence: readonly string[];
};
export type AssemblyCoverage = {
  readonly schema: typeof ASSEMBLY_COVERAGE_SCHEMA;
  readonly owner: 'omd-hand';
  /** Sections/regions/states of the selected composition — not domain-level pages/screens. */
  readonly expectedZones: readonly string[];
  readonly zones: readonly AssemblyZone[];
};

export type ContractFinding = { readonly id: string; readonly path: string; readonly message: string };

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const slug = (v: unknown): v is string => text(v) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const texts = (v: unknown, min = 1): v is string[] => Array.isArray(v) && v.length >= min && v.every(text);
const exact = (v: Record<string, unknown>, keys: readonly string[]): boolean => {
  const got = Object.keys(v).sort(); const wanted = [...keys].sort();
  return got.length === wanted.length && got.every((key, i) => key === wanted[i]);
};
const finding = (out: ContractFinding[], id: string, path: string, message: string): void => { out.push({ id, path, message }); };

const DECISION_KEYS = ['affects', 'alternatives', 'constraints', 'dependsOn', 'evidence', 'id', 'owner', 'question', 'rejected', 'reversible', 'risk', 'selected', 'stage', 'tradeoffs'] as const;
const STAGES = new Set<DecisionStage>(['frame', 'copy', 'type', 'composition', 'structure', 'production', 'refinement']);
const RISKS = new Set<DecisionRisk>(['low', 'medium', 'high', 'critical']);
const OWNER_BY_STAGE: Record<DecisionStage, DecisionOwner> = {
  frame: 'omd-framer',
  copy: 'omd-writer',
  type: 'omd-typesetter',
  composition: 'omd-composer',
  structure: 'omd-eye',
  production: 'omd-hand',
  refinement: 'omd-hand',
};

export function validateDecisionGraph(value: unknown): { readonly value?: DecisionGraph; readonly findings: readonly ContractFinding[] } {
  const out: ContractFinding[] = [];
  if (!record(value) || !exact(value, ['schema', 'decisions']) || value.schema !== DECISION_GRAPH_SCHEMA || !Array.isArray(value.decisions)) {
    finding(out, 'DECISION-GRAPH-INVALID', '$', 'expected a closed decision-graph-v1 object with a decisions array');
    return { findings: out };
  }
  const ids = new Set<string>();
  const decisions = value.decisions;
  if (decisions.length === 0) finding(out, 'DECISION-GRAPH-EMPTY', 'decisions', 'at least one consequential decision is required');
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i]; const path = `decisions[${i}]`;
    if (!record(d) || !exact(d, DECISION_KEYS)) { finding(out, 'DECISION-INVALID', path, 'decision has unknown or missing keys'); continue; }
    if (!slug(d.id)) finding(out, 'DECISION-ID', `${path}.id`, 'id must be a lowercase kebab slug');
    else if (ids.has(d.id)) finding(out, 'DECISION-DUPLICATE', `${path}.id`, `duplicate decision id ${d.id}`); else ids.add(d.id);
    if (!STAGES.has(d.stage as DecisionStage)) finding(out, 'DECISION-STAGE', `${path}.stage`, 'unknown decision stage');
    if (!RISKS.has(d.risk as DecisionRisk)) finding(out, 'DECISION-RISK', `${path}.risk`, 'risk must be low, medium, high, or critical');
    if (STAGES.has(d.stage as DecisionStage) && d.owner !== OWNER_BY_STAGE[d.stage as DecisionStage]) finding(out, 'DECISION-OWNER', `${path}.owner`, `${d.stage} decisions belong to ${OWNER_BY_STAGE[d.stage as DecisionStage]}, not the coordinator`);
    if (!text(d.question)) finding(out, 'DECISION-QUESTION', `${path}.question`, 'question must be substantive');
    const alternativesValid = Array.isArray(d.alternatives)
      && d.alternatives.length >= 2
      && d.alternatives.every((a) => record(a) && exact(a, ['id', 'label']) && slug(a.id) && text(a.label));
    if (!alternativesValid) finding(out, 'DECISION-NO-DIVERGENCE', `${path}.alternatives`, 'a decision needs at least two named alternatives');
    const alternativeIds = Array.isArray(d.alternatives)
      ? d.alternatives.filter((a) => record(a) && slug(a.id)).map((a) => (a as { id: string }).id)
      : [];
    if (new Set(alternativeIds).size !== alternativeIds.length) finding(out, 'DECISION-ALTERNATIVE-DUPLICATE', `${path}.alternatives`, 'alternatives must be unique');
    if (!text(d.selected) || !alternativeIds.includes(d.selected)) finding(out, 'DECISION-SELECTION', `${path}.selected`, 'selected must name one alternative');
    if (!texts(d.evidence)) finding(out, 'DECISION-EVIDENCE', `${path}.evidence`, 'selection needs at least one verifiable evidence reference');
    if (!texts(d.constraints)) finding(out, 'DECISION-CONSTRAINT', `${path}.constraints`, 'selection needs at least one named constraint');
    if (!Array.isArray(d.rejected) || !d.rejected.every((r) => record(r) && exact(r, ['id', 'reason']) && slug(r.id) && text(r.reason))) {
      finding(out, 'DECISION-REJECTION', `${path}.rejected`, 'rejected alternatives need bounded reasons');
    } else {
      const rejected = new Set(d.rejected.map((r) => (r as { id: string }).id));
      const expected = alternativeIds.filter((id) => id !== d.selected);
      if (expected.some((id) => !rejected.has(id)) || rejected.has(d.selected as string)) finding(out, 'DECISION-REJECTION-COVERAGE', `${path}.rejected`, 'every non-selected alternative must be rejected exactly; the selected one must not be');
    }
    if (!texts(d.affects)) finding(out, 'DECISION-AFFECTS', `${path}.affects`, 'decision must name downstream artifacts or zones it affects');
    if (!Array.isArray(d.dependsOn) || !d.dependsOn.every(slug)) finding(out, 'DECISION-DEPENDENCY', `${path}.dependsOn`, 'dependsOn must be an array of decision ids');
    if (typeof d.reversible !== 'boolean') finding(out, 'DECISION-REVERSIBILITY', `${path}.reversible`, 'reversible must be boolean');
    if (!Array.isArray(d.tradeoffs)) finding(out, 'DECISION-TRADEOFF', `${path}.tradeoffs`, 'tradeoffs must be an array');
    else {
      for (let j = 0; j < d.tradeoffs.length; j++) {
        const t = d.tradeoffs[j];
        if (!record(t) || !exact(t, ['attempt', 'compromise', 'constraint', 'failureEvidence', 'goal', 'resultEvidence']) || !text(t.goal) || !text(t.constraint) || !text(t.attempt) || !text(t.compromise) || !texts(t.failureEvidence) || !texts(t.resultEvidence)) {
          finding(out, 'DECISION-TRADEOFF', `${path}.tradeoffs[${j}]`, 'tradeoff must record goal, constraint, attempted failure evidence, compromise, and result evidence');
        }
      }
      if ((d.risk === 'high' || d.risk === 'critical') && d.tradeoffs.length === 0) finding(out, 'DECISION-HIGH-RISK-NO-TRADEOFF', `${path}.tradeoffs`, 'high-risk decisions must externalize at least one tested trade-off');
    }
  }
  const known = new Set(decisions.filter(record).map((d) => d.id).filter(slug));
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i]; if (!record(d) || !Array.isArray(d.dependsOn)) continue;
    for (const dep of d.dependsOn) if (typeof dep === 'string' && !known.has(dep)) finding(out, 'DECISION-DEPENDENCY-MISSING', `decisions[${i}].dependsOn`, `unknown dependency ${dep}`);
  }
  return out.length === 0 ? { value: value as DecisionGraph, findings: out } : { findings: out };
}

function validPerspective(v: unknown): v is Perspective {
  return record(v) && exact(v, ['conditions', 'evidence', 'inputSha256', 'objections', 'position'])
    && digest(v.inputSha256) && text(v.position) && texts(v.evidence) && Array.isArray(v.objections) && v.objections.every(text) && Array.isArray(v.conditions) && v.conditions.every(text);
}

export function validateDeliberation(value: unknown, graph?: DecisionGraph): { readonly value?: DesignDeliberation; readonly findings: readonly ContractFinding[] } {
  const out: ContractFinding[] = [];
  if (!record(value) || !exact(value, ['decisionId', 'id', 'moderator', 'perspectives', 'resolution', 'schema', 'trigger']) || value.schema !== DELIBERATION_SCHEMA || value.moderator !== 'omd-eye' || !slug(value.id) || !slug(value.decisionId) || !text(value.trigger)) {
    finding(out, 'DELIBERATION-INVALID', '$', 'expected a closed design-deliberation-v1 record'); return { findings: out };
  }
  if (graph && !graph.decisions.some((d) => d.id === value.decisionId)) finding(out, 'DELIBERATION-DECISION-MISSING', 'decisionId', 'deliberation must bind to a decision in the graph');
  if (!record(value.perspectives) || !exact(value.perspectives, ['artDirection', 'production', 'ux']) || !validPerspective(value.perspectives.ux) || !validPerspective(value.perspectives.artDirection) || !validPerspective(value.perspectives.production)) {
    finding(out, 'DELIBERATION-PERSPECTIVES', 'perspectives', 'ux, artDirection, and production perspectives are all required with evidence');
  } else {
    const hashes = [value.perspectives.ux.inputSha256, value.perspectives.artDirection.inputSha256, value.perspectives.production.inputSha256];
    if (new Set(hashes).size !== 1) finding(out, 'DELIBERATION-INPUT-MISMATCH', 'perspectives', 'independent perspectives must judge the same sanitized input bytes');
  }
  if (!record(value.resolution) || !exact(value.resolution, ['conditions', 'rationale', 'selected']) || !text(value.resolution.selected) || !text(value.resolution.rationale) || !texts(value.resolution.conditions)) {
    finding(out, 'DELIBERATION-RESOLUTION', 'resolution', 'moderator resolution needs a selection, evidence-based rationale, and conditions');
  }
  return out.length === 0 ? { value: value as DesignDeliberation, findings: out } : { findings: out };
}

export function validateAcquisitionPlan(value: unknown): { readonly value?: AcquisitionPlan; readonly findings: readonly ContractFinding[] } {
  const out: ContractFinding[] = [];
  if (!record(value) || !exact(value, ['owner', 'schema', 'zones']) || value.schema !== ACQUISITION_PLAN_SCHEMA || value.owner !== 'omd-framer' || !Array.isArray(value.zones) || value.zones.length === 0) {
    finding(out, 'ACQUISITION-PLAN-INVALID', '$', 'expected a non-empty reference-acquisition-plan-v1');
    return { findings: out };
  }
  const ids = new Set<string>();
  for (let i = 0; i < value.zones.length; i++) {
    const z = value.zones[i]; const path = `zones[${i}]`;
    if (!record(z) || !exact(z, ['id', 'job', 'kind', 'required']) || !slug(z.id) || !['section', 'region', 'state'].includes(z.kind as string) || !text(z.job) || typeof z.required !== 'boolean') {
      finding(out, 'ACQUISITION-ZONE-INVALID', path, 'zone needs a stable id, section/region/state kind, job, and required flag');
      continue;
    }
    if (ids.has(z.id)) finding(out, 'ACQUISITION-ZONE-DUPLICATE', `${path}.id`, `duplicate zone ${z.id}`);
    ids.add(z.id);
  }
  if (!value.zones.some((z) => record(z) && z.required === true)) finding(out, 'ACQUISITION-NO-REQUIRED-ZONES', 'zones', 'at least one zone must require reference evidence');
  return out.length === 0 ? { value: value as AcquisitionPlan, findings: out } : { findings: out };
}

export function validateObservation(value: unknown): { readonly value?: VisualObservation; readonly findings: readonly ContractFinding[] } {
  const out: ContractFinding[] = [];
  const keys = ['afterRender', 'beforeRender', 'change', 'judgment', 'metric', 'observed', 'owner', 'result', 'round', 'schema', 'status', 'viewport'];
  if (!record(value) || !exact(value, keys) || value.schema !== OBSERVATION_SCHEMA) { finding(out, 'OBSERVATION-INVALID', '$', 'expected a closed visual-observation-v1 record'); return { findings: out }; }
  if (value.owner !== 'omd-hand') finding(out, 'OBSERVATION-OWNER', 'owner', 'visual observation records belong to omd-hand');
  if (!Number.isSafeInteger(value.round) || (value.round as number) < 1) finding(out, 'OBSERVATION-ROUND', 'round', 'round must be a positive integer');
  if (!['1280x900', '390x844', '320x800'].includes(value.viewport as string)) finding(out, 'OBSERVATION-VIEWPORT', 'viewport', 'viewport must be one of the required evidence sizes');
  for (const field of ['beforeRender', 'observed', 'judgment', 'change', 'afterRender', 'result'] as const) if (!text(value[field])) finding(out, 'OBSERVATION-MISSING', field, `${field} must be non-empty`);
  if (value.beforeRender === value.afterRender) finding(out, 'OBSERVATION-NO-RENDER-DELTA', 'afterRender', 'before and after evidence must be different artifacts');
  if (!['position', 'size', 'line-count', 'contrast', 'visibility', 'motion', 'flow'].includes(value.metric as string)) finding(out, 'OBSERVATION-METRIC', 'metric', 'metric must name an observable visual or interaction property');
  if (!['RED', 'GREEN'].includes(value.status as string)) finding(out, 'OBSERVATION-STATUS', 'status', 'status must be RED or GREEN');
  return out.length === 0 ? { value: value as VisualObservation, findings: out } : { findings: out };
}

export function validateAssemblyCoverage(value: unknown, graph?: DecisionGraph): { readonly value?: AssemblyCoverage; readonly findings: readonly ContractFinding[] } {
  const out: ContractFinding[] = [];
  if (!record(value) || !exact(value, ['expectedZones', 'owner', 'schema', 'zones']) || value.schema !== ASSEMBLY_COVERAGE_SCHEMA || value.owner !== 'omd-hand' || !texts(value.expectedZones) || !Array.isArray(value.zones)) {
    finding(out, 'ASSEMBLY-COVERAGE-INVALID', '$', 'expected a closed assembly-coverage-v1 record with expectedZones and zones'); return { findings: out };
  }
  const expected = value.expectedZones as string[];
  if (new Set(expected.map((x) => x.toLowerCase())).size !== expected.length) finding(out, 'ASSEMBLY-ZONE-DUPLICATE', 'expectedZones', 'expected zones must be unique');
  const covered = new Set<string>();
  for (let i = 0; i < value.zones.length; i++) {
    const z = value.zones[i]; const path = `zones[${i}]`;
    if (!record(z) || !exact(z, ['compositionDecisionId', 'fidelityEvidence', 'id', 'job', 'principle', 'productionSelector', 'referenceRef']) || !text(z.id) || !text(z.job) || !text(z.referenceRef) || !text(z.principle) || !slug(z.compositionDecisionId) || !text(z.productionSelector) || !texts(z.fidelityEvidence)) {
      finding(out, 'ASSEMBLY-ZONE-INVALID', path, 'zone must bind job → reference → principle → composition decision → production selector → fidelity evidence'); continue;
    }
    covered.add((z.id as string).toLowerCase());
    if (graph && !graph.decisions.some((d) => d.id === z.compositionDecisionId)) finding(out, 'ASSEMBLY-DECISION-MISSING', `${path}.compositionDecisionId`, 'zone must bind to a decision in the graph');
  }
  const missing = expected.filter((id) => !covered.has(id.toLowerCase()));
  if (missing.length) finding(out, 'ASSEMBLY-ZONE-UNCOVERED', 'zones', `no complete evidence chain for: ${missing.join(', ')}`);
  return out.length === 0 ? { value: value as AssemblyCoverage, findings: out } : { findings: out };
}
