import * as v from '../brief/candidate-data.ts';
export type Receipt = v.Receipt;
export type SurfacePlan = Readonly<{
  schema: 'surface-plan-v1'; representativeSurfaceId: string;
  views: readonly { id: string; width: number; height: number }[];
  surfaces: readonly {
    id: string; purpose: string; taskIds: readonly string[]; componentIds: readonly string[];
    states: readonly { id: string; required: boolean; reason: string; primaryActionId: string | null; primaryRequired: boolean }[];
    viewIds: readonly string[]; referenceCoverage: 'direct' | 'partial' | 'brief-derived'; referenceIds: readonly string[]; referenceGap: string | null; referenceDecision: string | null;
    contentCases: readonly { id: string; kind: 'long-text' | 'many-items' | 'error' | 'other'; fixture: Receipt; contentProfileId: string; stateIds: readonly string[]; viewIds: readonly string[]; expectationIds: readonly string[]; reason: string }[];
  }[];
}>;
export type ValidationPlan = Readonly<{ schema: 'validation-plan-v1'; items: readonly {
  id: string; assumption: { claimId: string | null; text: string };
  participant: { kind: 'target-user' | 'domain-expert' | 'accessibility-user' | 'proxy'; criteria: string; plannedCount: number | null };
  task: { taskIds: readonly string[]; scenario: string };
  signal: { observable: string; successCriterion: string; contradictingCriterion: string };
  decisionChanged: { decisionId: string; ifSupported: string; ifContradicted: string };
  method: 'task-observation' | 'interview' | 'usability-session' | 'expert-review' | 'automated-probe'; status: 'planned' | 'not-run' | 'observed' | 'inconclusive'; evidence: readonly Receipt[]; limitation: string | null;
}[] }>;
export const ACCESSIBILITY_CONCERNS = ['names-roles-values', 'live-status', 'reading-focus-order', 'zoom-reflow-text-resize', 'forced-colors', 'direction-writing-mode', 'motion', 'contrast-non-color'] as const;
export type AccessibilityPlan = Readonly<{ schema: 'accessibility-plan-v1'; items: readonly {
  id: string; concern: typeof ACCESSIBILITY_CONCERNS[number]; applicability: 'applicable' | 'not-applicable' | 'unknown';
  surfaceIds: readonly string[]; taskIds: readonly string[]; stateIds: readonly string[]; viewIds: readonly string[];
  rationale: string; requiredEvidence: readonly string[]; method: string;
}[] }>;
const nullableText = (value: unknown): string | null => value === null ? null : v.text(value);
function subset(values: readonly string[], known: readonly string[], label: string): void { if (values.some(id => !known.includes(id))) v.fail(`unknown ${label} reference`); }
export function parseSurfacePlan(value: unknown): SurfacePlan {
  const p = v.object(value, ['schema', 'representativeSurfaceId', 'views', 'surfaces']); v.enumeration(p.schema, ['surface-plan-v1']);
  const views = v.list(p.views, value => { const x = v.object(value, ['id', 'width', 'height']); return { id: v.id(x.id), width: v.positive(x.width), height: v.positive(x.height) }; }); v.unique(views, x => x.id);
  if (!views.length) v.fail('surface plan needs its actual viewport dimensions');
  const surfaces = v.list(p.surfaces, value => {
    const s = v.object(value, ['id', 'purpose', 'taskIds', 'componentIds', 'states', 'viewIds', 'referenceCoverage', 'referenceIds', 'referenceGap', 'referenceDecision', 'contentCases']);
    const states = v.list(s.states, value => {
      const x = v.object(value, ['id', 'required', 'reason', 'primaryActionId', 'primaryRequired']);
      const primaryActionId = x.primaryActionId === null ? null : v.id(x.primaryActionId), primaryRequired = v.boolean(x.primaryRequired);
      if (primaryRequired && primaryActionId === null) v.fail('primaryRequired needs an action; informational/loading states may set false');
      return { id: v.id(x.id), required: v.boolean(x.required), reason: v.text(x.reason), primaryActionId, primaryRequired };
    }); v.unique(states, x => x.id); if (!states.some(x => x.required)) v.fail('each surface needs an explicit required entry/default state');
    const viewIds = v.ids(s.viewIds, true); subset(viewIds, views.map(x => x.id), 'view');
    const referenceCoverage = v.enumeration(s.referenceCoverage, ['direct', 'partial', 'brief-derived']), referenceIds = v.ids(s.referenceIds);
    const referenceGap = nullableText(s.referenceGap), referenceDecision = nullableText(s.referenceDecision);
    if (referenceCoverage === 'direct' && !referenceIds.length || referenceCoverage !== 'direct' && (!referenceGap || !referenceDecision)) v.fail('reference coverage needs its evidence or an explicit gap/application decision');
    const contentCases = v.list(s.contentCases, value => {
      const c = v.object(value, ['id', 'kind', 'fixture', 'contentProfileId', 'stateIds', 'viewIds', 'expectationIds', 'reason']);
      const caseStates = v.ids(c.stateIds, true), caseViews = v.ids(c.viewIds, true);
      subset(caseStates, states.map(x => x.id), 'content-case state'); subset(caseViews, viewIds, 'content-case view');
      return { id: v.id(c.id), kind: v.enumeration(c.kind, ['long-text', 'many-items', 'error', 'other']), fixture: v.receipt(c.fixture), contentProfileId: v.id(c.contentProfileId), stateIds: caseStates, viewIds: caseViews, expectationIds: v.ids(c.expectationIds, true), reason: v.text(c.reason) };
    }); v.unique(contentCases, x => x.id);
    return { id: v.id(s.id), purpose: v.text(s.purpose), taskIds: v.ids(s.taskIds), componentIds: v.ids(s.componentIds), states, viewIds, referenceCoverage, referenceIds, referenceGap, referenceDecision, contentCases };
  }); v.unique(surfaces, x => x.id);
  const representativeSurfaceId = v.id(p.representativeSurfaceId); subset([representativeSurfaceId], surfaces.map(s => s.id), 'representative surface');
  return { schema: 'surface-plan-v1', representativeSurfaceId, views, surfaces };
}
export function parseValidationPlan(value: unknown): ValidationPlan {
  const p = v.object(value, ['schema', 'items']); v.enumeration(p.schema, ['validation-plan-v1']);
  const items = v.list(p.items, value => {
    const x = v.object(value, ['id', 'assumption', 'participant', 'task', 'signal', 'decisionChanged', 'method', 'status', 'evidence', 'limitation']);
    const a = v.object(x.assumption, ['claimId', 'text']), p = v.object(x.participant, ['kind', 'criteria', 'plannedCount']), t = v.object(x.task, ['taskIds', 'scenario']);
    const s = v.object(x.signal, ['observable', 'successCriterion', 'contradictingCriterion']), d = v.object(x.decisionChanged, ['decisionId', 'ifSupported', 'ifContradicted']);
    const method = v.enumeration(x.method, ['task-observation', 'interview', 'usability-session', 'expert-review', 'automated-probe']), status = v.enumeration(x.status, ['planned', 'not-run', 'observed', 'inconclusive']);
    const evidence = v.list(x.evidence, v.receipt), kind = v.enumeration(p.kind, ['target-user', 'domain-expert', 'accessibility-user', 'proxy']), limitation = nullableText(x.limitation);
    if (status === 'observed' && !evidence.length) v.fail('observed validation requires method evidence; planned people are not recruited people');
    if (method === 'automated-probe' && kind !== 'proxy') v.fail('automated probes cannot claim human participants');
    if (['not-run', 'inconclusive'].includes(status) && limitation === null) v.fail('unrun/inconclusive validation needs its limitation');
    return { id: v.id(x.id), assumption: { claimId: a.claimId === null ? null : v.id(a.claimId), text: v.text(a.text) }, participant: { kind, criteria: v.text(p.criteria), plannedCount: p.plannedCount === null ? null : v.positive(p.plannedCount) }, task: { taskIds: v.ids(t.taskIds), scenario: v.text(t.scenario) }, signal: { observable: v.text(s.observable), successCriterion: v.text(s.successCriterion), contradictingCriterion: v.text(s.contradictingCriterion) }, decisionChanged: { decisionId: v.id(d.decisionId), ifSupported: v.text(d.ifSupported), ifContradicted: v.text(d.ifContradicted) }, method, status, evidence, limitation };
  }); v.unique(items, x => x.id); return { schema: 'validation-plan-v1', items };
}
export function parseAccessibilityPlan(value: unknown): AccessibilityPlan {
  const p = v.object(value, ['schema', 'items']); v.enumeration(p.schema, ['accessibility-plan-v1']);
  const items = v.list(p.items, value => {
    const x = v.object(value, ['id', 'concern', 'applicability', 'surfaceIds', 'taskIds', 'stateIds', 'viewIds', 'rationale', 'requiredEvidence', 'method']);
    const applicability = v.enumeration(x.applicability, ['applicable', 'not-applicable', 'unknown']), requiredEvidence = v.list(x.requiredEvidence, v.text);
    if (applicability !== 'not-applicable' && !requiredEvidence.length) v.fail('applicable/unknown accessibility needs required evidence, not an invented pass');
    return { id: v.id(x.id), concern: v.enumeration(x.concern, ACCESSIBILITY_CONCERNS), applicability, surfaceIds: v.ids(x.surfaceIds, true), taskIds: v.ids(x.taskIds), stateIds: v.ids(x.stateIds), viewIds: v.ids(x.viewIds, true), rationale: v.text(x.rationale), requiredEvidence, method: v.text(x.method) };
  }); v.unique(items, x => x.id); return { schema: 'accessibility-plan-v1', items };
}
export function validateFrameProcessPlans(plans: { surfacePlan?: SurfacePlan; validationPlan?: ValidationPlan; accessibilityPlan?: AccessibilityPlan }, taskMatrix = '', root?: string): void {
  const surface = plans.surfacePlan && parseSurfacePlan(plans.surfacePlan), validation = plans.validationPlan && parseValidationPlan(plans.validationPlan), accessibility = plans.accessibilityPlan && parseAccessibilityPlan(plans.accessibilityPlan);
  const taskIds = [...taskMatrix.matchAll(/^\s*(T[1-9]\d*)\s*\|/gm)].map(m => m[1]!);
  for (const s of surface?.surfaces ?? []) {
    subset(s.taskIds, taskIds, 'surface task');
    if (root) for (const c of s.contentCases) v.readReceipt(root, c.fixture);
  }
  for (const item of validation?.items ?? []) { subset(item.task.taskIds, taskIds, 'validation task'); if (root) for (const r of item.evidence) v.readReceipt(root, r); }
  for (const item of accessibility?.items ?? []) {
    if (!surface) v.fail('accessibility scope needs surfacePlan');
    subset(item.surfaceIds, surface!.surfaces.map(s => s.id), 'accessibility surface'); subset(item.taskIds, taskIds, 'accessibility task');
    for (const id of item.surfaceIds) { const s = surface!.surfaces.find(s => s.id === id)!; subset(item.stateIds, s.states.map(s => s.id), 'accessibility state'); subset(item.viewIds, s.viewIds, 'accessibility view'); }
  }
}
export function requiredSurfaceCells(plan: SurfacePlan): readonly { surfaceId: string; stateId: string; viewId: string }[] {
  return plan.surfaces.flatMap(s => s.states.filter(state => state.required).flatMap(state => s.viewIds.map(viewId => ({ surfaceId: s.id, stateId: state.id, viewId }))));
}
