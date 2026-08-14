import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DESIGN_DEVELOPMENT_CONTRACT_SCHEMA } from '../core/design-development/contract.ts';
import {
  ADAPTIVE_WORKFLOW_PLAN_SCHEMA,
  AdaptiveWorkflowPlanError,
  adaptiveWorkflowPlanPath,
  adaptiveWorkflowPlanSha256,
  canonicalWorkflowPlanJson,
  createAdaptiveWorkflowPlan,
  parseAdaptiveWorkflowPlan,
} from '../core/design-development/workflow-plan.ts';
import { adaptiveRouteRecordSha256 } from '../core/route/adaptive-route-persistence.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { routeAdaptiveFlow } from '../core/route/adaptive-flow.ts';

const fixture = (): unknown => JSON.parse(readFileSync(
  new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url),
  'utf8',
));
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

function routeContext() {
  const routeRecord = routeAdaptiveFlow(fixture());
  const routeSha256 = adaptiveRouteRecordSha256(routeRecord);
  const authority = {
    schema: 'adaptive-route-authority-v1',
    invocation: {
      buildSha256: hash('build'),
      loadedSkillSha256: hash('skill'),
      briefSha256: hash('brief'),
    },
    sourceSha256: routeRecord.sourceContractSha256,
    routeSha256,
    selectedModel: routeRecord.selectedModel,
    allowedPaths: routeRecord.allowedPaths,
    namedDependencies: routeRecord.namedDependencies,
  };
  return {
    routeRecord,
    routeAuthorityBytes: Buffer.from(`${canonicalRouteJson(authority)}\n`),
  };
}

const directDevelopment = () => ({
  schema: DESIGN_DEVELOPMENT_CONTRACT_SCHEMA,
  owner: 'user-selected-model',
  mode: 'direct',
  risks: [],
  investigations: [],
  referencePrinciples: [],
  rationale: 'The exact copy repair can proceed without an intermediate design investigation.',
});

const investigatedDevelopment = () => ({
  schema: DESIGN_DEVELOPMENT_CONTRACT_SCHEMA,
  owner: 'user-selected-model',
  mode: 'investigate',
  risks: [{
    id: 'risk:approval-context',
    question: 'Can operators identify authority and recovery before approval?',
    consequence: 'high',
    uncertainty: 'high',
    lateReversalCost: 'high',
  }],
  investigations: [
    {
      id: 'probe:content',
      kind: 'content-state-model',
      riskIds: ['risk:approval-context'],
      question: 'Which states and content tails shape approval?',
      fidelity: { content: 'production-like', visual: 'none', interaction: 'none', behavior: 'representative', environment: 'none' },
      stopWhen: 'Representative states and content tails are explicit.',
    },
    {
      id: 'probe:structure',
      kind: 'structural-layout',
      riskIds: ['risk:approval-context'],
      question: 'Does approval hierarchy survive responsive reordering?',
      fidelity: { content: 'production-like', visual: 'structural', interaction: 'none', behavior: 'representative', environment: 'responsive-browser' },
      stopWhen: 'Authority, consequence, and recovery retain their order.',
    },
    {
      id: 'probe:component',
      kind: 'component-in-context',
      riskIds: ['risk:approval-context'],
      question: 'Does the component hold in its representative page context?',
      fidelity: { content: 'production-like', visual: 'representative', interaction: 'interactive', behavior: 'representative', environment: 'responsive-browser' },
      stopWhen: 'Allowed, denied, stale, and conflicting examples preserve a next action.',
    },
  ],
  referencePrinciples: [],
  rationale: 'Approval has costly content, hierarchy, and page-context uncertainty.',
});

const receipt = (name: string) => ({
  path: `.omd/inputs/${name}.json`,
  schema: 'workflow-input-v1',
  sha256: hash(name),
  locator: `/${name}`,
});

const evidence = () => [
  { id: 'evidence:content', kind: 'content-shape', value: 'variable', source: receipt('content') },
  { id: 'evidence:structure', kind: 'structural-impact', value: 'responsive-order', source: receipt('structure') },
  { id: 'evidence:component', kind: 'component-impact', value: 'context-risk', source: receipt('component') },
];

const citations = () => [
  { id: 'probe:content', evidenceIds: ['evidence:content'] },
  { id: 'probe:structure', evidenceIds: ['evidence:structure'] },
  { id: 'probe:component', evidenceIds: ['evidence:component'] },
];

function investigatedPlan() {
  const context = routeContext();
  return {
    context,
    plan: createAdaptiveWorkflowPlan({
      ...context,
      development: investigatedDevelopment(),
      evidence: evidence(),
      investigations: citations(),
      rationale: 'Run only the three probes justified by current approval evidence.',
    }),
  };
}

test('direct mode remains a valid zero-investigation adaptive workflow', () => {
  const context = routeContext();
  const plan = createAdaptiveWorkflowPlan({
    ...context,
    development: directDevelopment(),
    evidence: [],
    investigations: [],
    rationale: 'Proceed directly to the unchanged route-selected production path.',
  });

  assert.equal(plan.schema, ADAPTIVE_WORKFLOW_PLAN_SCHEMA);
  assert.deepEqual(plan.investigations, []);
  assert.equal(plan.route.recordSha256, adaptiveRouteRecordSha256(context.routeRecord));
  assert.equal(plan.route.sourceContractSha256, context.routeRecord.sourceContractSha256);
  assert.equal(plan.route.authoritySha256, hash(context.routeAuthorityBytes));
  assert.equal(context.routeRecord.schema, 'adaptive-design-route-v1');
});

test('selected investigations cite applicable evidence and dependencies are derived', () => {
  const { plan } = investigatedPlan();

  assert.deepEqual(plan.investigations, [
    { id: 'probe:content', evidenceIds: ['evidence:content'], dependsOn: [] },
    { id: 'probe:structure', evidenceIds: ['evidence:structure'], dependsOn: ['probe:content'] },
    { id: 'probe:component', evidenceIds: ['evidence:component'], dependsOn: ['probe:content', 'probe:structure'] },
  ]);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.investigations[2]?.dependsOn), true);
});

test('workflow plans are canonical content-addressable records', () => {
  const { context, plan } = investigatedPlan();
  const canonical = canonicalWorkflowPlanJson(plan);
  const parsed = parseAdaptiveWorkflowPlan(JSON.parse(canonical), context);

  assert.equal(canonicalWorkflowPlanJson(parsed), canonical);
  assert.equal(adaptiveWorkflowPlanSha256(parsed), hash(`${canonical}\n`));
  assert.equal(adaptiveWorkflowPlanPath(parsed), `workflow-plan-runs/sha256-${adaptiveWorkflowPlanSha256(parsed)}.json`);
});

test('route, source, and authority substitutions fail the exact binding', () => {
  const { context, plan } = investigatedPlan();
  for (const field of ['recordSha256', 'sourceContractSha256', 'authoritySha256'] as const) {
    const forged = structuredClone(plan) as unknown as { route: Record<typeof field, string> };
    forged.route[field] = hash(`forged-${field}`);
    assert.throws(
      () => parseAdaptiveWorkflowPlan(forged, context),
      (error: unknown) => error instanceof AdaptiveWorkflowPlanError && error.code === 'WORKFLOW_PLAN_ROUTE_MISMATCH',
    );
  }

  const unrelatedAuthority = Buffer.from(context.routeAuthorityBytes);
  unrelatedAuthority[10] = unrelatedAuthority[10] === 97 ? 98 : 97;
  assert.throws(
    () => createAdaptiveWorkflowPlan({
      ...context,
      routeAuthorityBytes: unrelatedAuthority,
      development: directDevelopment(), evidence: [], investigations: [], rationale: 'Forged authority.',
    }),
    /WORKFLOW_PLAN_ROUTE_MISMATCH|WORKFLOW_PLAN_MALFORMED/,
  );
});

test('missing, dangling, and inapplicable evidence cannot justify an investigation', () => {
  const context = routeContext();
  const base = {
    ...context,
    development: investigatedDevelopment(),
    evidence: evidence(),
    investigations: citations(),
    rationale: 'Evidence-bound probes.',
  };

  assert.throws(
    () => createAdaptiveWorkflowPlan({ ...base, investigations: [{ ...citations()[0], evidenceIds: [] }, ...citations().slice(1)] }),
    /WORKFLOW_PLAN_UNSUPPORTED_INVESTIGATION/,
  );
  assert.throws(
    () => createAdaptiveWorkflowPlan({ ...base, investigations: [{ ...citations()[0], evidenceIds: ['evidence:missing'] }, ...citations().slice(1)] }),
    /WORKFLOW_PLAN_UNKNOWN_EVIDENCE/,
  );
  assert.throws(
    () => createAdaptiveWorkflowPlan({ ...base, investigations: [{ ...citations()[0], evidenceIds: ['evidence:structure'] }, ...citations().slice(1)] }),
    /WORKFLOW_PLAN_INAPPLICABLE_EVIDENCE/,
  );
});

test('persisted dependencies and every nested shape reject caller invention', () => {
  const { context, plan } = investigatedPlan();
  const invented = structuredClone(plan) as unknown as { investigations: Array<{ dependsOn: string[] }> };
  invented.investigations[0]?.dependsOn.push('probe:component');
  assert.throws(() => parseAdaptiveWorkflowPlan(invented, context), /WORKFLOW_PLAN_DEPENDENCY_MISMATCH/);

  for (const mutate of [
    (value: Record<string, unknown>) => { value.extra = true; },
    (value: Record<string, unknown>) => { (value.route as Record<string, unknown>).extra = true; },
    (value: Record<string, unknown>) => {
      const inputs = value.evidence as Record<string, unknown>[];
      const first = inputs[0];
      if (first !== undefined) (first.source as Record<string, unknown>).extra = true;
    },
  ]) {
    const malformed = structuredClone(plan) as unknown as Record<string, unknown>;
    mutate(malformed);
    assert.throws(() => parseAdaptiveWorkflowPlan(malformed, context), /WORKFLOW_PLAN_MALFORMED/);
  }
});

test('one justified investigation is valid without a universal stage quota', () => {
  const context = routeContext();
  const development = investigatedDevelopment();
  const selected = development.investigations[0];
  if (selected === undefined) throw new Error('investigated fixture requires one investigation');
  development.investigations = [selected];
  const plan = createAdaptiveWorkflowPlan({
    ...context,
    development,
    evidence: [evidence()[0]],
    investigations: [citations()[0]],
    rationale: 'Only content shape remains uncertain.',
  });
  assert.deepEqual(plan.investigations.map(({ id }) => id), ['probe:content']);
});
