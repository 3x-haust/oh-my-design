import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { authorizeTestPayloads } from '../core/runtime/activation.ts';
import { createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';
import {
  checkAdaptiveWorkflow,
  checkAdaptiveWorkflowProductionReadiness,
  checkAdaptiveWorkflowProductionSlice,
  isAdaptiveWorkflowSourceBinding,
  publishAdaptiveWorkflowArtifacts,
  publishAdaptiveWorkflowPlan,
  publishAdaptiveWorkflowProductionReadiness,
  publishAdaptiveWorkflowProductionSlice,
} from '../core/design-development/workflow-persistence.ts';
import {
  ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_INPUT_SCHEMA,
  createWorkflowProductionSlice,
  workflowProductionSliceBytes,
} from '../core/design-development/production-slice.ts';
import { COMPONENT_STRESS_PROOF_V2_SCHEMA } from '../core/design-development/production-proofs.ts';
import { CONTENT_STATE_MODEL_SCHEMA } from '../core/design-development/content-state-model.ts';
import { writeSourceSeal } from '../core/source-seal/index.ts';

const fixture = (): unknown => JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');
const receipt = (root: string, path: string, schema: string) => ({ path, schema, sha256: sha(readFileSync(join(root, path))) });
const identity = (id: string) => ({ actor: 'independent-reviewer', id, processId: `process:${id}`, sessionId: `session:${id}`, nonce: `nonce:${id}`, configurationSha256: sha(`configuration:${id}`) });

function project() {
  const root = mkdtempSync(join(tmpdir(), 'omd-workflow-checkpoints-'));
  mkdirSync(join(root, '.omd', 'workflow', 'renders'), { recursive: true });
  mkdirSync(join(root, 'src', 'copy'), { recursive: true });
  writeFileSync(join(root, '.omd', 'workflow-evidence.json'), '{"risk":"component context"}\n');
  const invocation = publishTestAdaptiveRoute(root, fixture(), 'workflow-production-checkpoints');
  return { root, invocation, writer: () => createTestProjectWriteAdapter(root, invocation) };
}

const development = {
  schema: 'design-development-contract-v1', owner: 'user-selected-model', mode: 'investigate',
  risks: [{ id: 'risk:component', question: 'Does the component work in context?', consequence: 'high', uncertainty: 'high', lateReversalCost: 'high' }],
  investigations: [
    { id: 'probe:content', kind: 'content-state-model', riskIds: ['risk:component'], question: 'Which content and state are representative?', fidelity: { content: 'representative', visual: 'none', interaction: 'none', behavior: 'representative', environment: 'none' }, stopWhen: 'The representative state is explicit.' },
    { id: 'probe:structure', kind: 'structural-layout', riskIds: ['risk:component'], question: 'Where does the component belong?', fidelity: { content: 'representative', visual: 'structural', interaction: 'none', behavior: 'representative', environment: 'responsive-browser' }, stopWhen: 'Responsive order is explicit.' },
    { id: 'probe:component', kind: 'component-in-context', riskIds: ['risk:component'], question: 'Does the actual component survive page context?', fidelity: { content: 'representative', visual: 'representative', interaction: 'interactive', behavior: 'representative', environment: 'responsive-browser' }, stopWhen: 'Isolation and representative page assertions pass.' },
  ],
  referencePrinciples: [], rationale: 'A new component needs production-independent structure before rendered proof.',
} as const;

function publishPlan(value: ReturnType<typeof project>): ReturnType<typeof checkAdaptiveWorkflow> {
  const source = receipt(value.root, '.omd/workflow-evidence.json', 'workflow-evidence-v1');
  publishAdaptiveWorkflowPlan(value.root, {
    development,
    evidence: [
      { id: 'evidence:content', kind: 'content-shape', value: 'variable', source: { ...source, locator: '/content' } },
      { id: 'evidence:structure', kind: 'structural-impact', value: 'responsive-order', source: { ...source, locator: '/structure' } },
      { id: 'evidence:component', kind: 'component-impact', value: 'new', source: { ...source, locator: '/component' } },
    ],
    investigations: [
      { id: 'probe:content', evidenceIds: ['evidence:content'] },
      { id: 'probe:structure', evidenceIds: ['evidence:structure'] },
      { id: 'probe:component', evidenceIds: ['evidence:component'] },
    ],
    rationale: 'Retire content and structure uncertainty before the bounded owner slice.',
  }, value.writer(), value.invocation);
  return checkAdaptiveWorkflow(value.root, value.invocation, { requireComplete: false });
}

test('workflow source binding rejects symbols and accessor authority fields', () => {
  const value = project();
  try {
    const binding = publishPlan(value).binding;
    assert.equal(
      isAdaptiveWorkflowSourceBinding({ ...binding, [Symbol('authority')]: true }),
      false,
    );
    const withAccessor = { ...binding };
    Object.defineProperty(withAccessor, 'schema', {
      enumerable: true,
      get: () => binding.schema,
    });
    assert.equal(isAdaptiveWorkflowSourceBinding(withAccessor), false);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

function contentProof(planSha256: string) {
  return {
    schema: CONTENT_STATE_MODEL_SCHEMA, planSha256,
    inputReceipts: [{ id: 'input:plan', kind: 'plan', sha256: planSha256 }, { id: 'input:user', kind: 'user-input', sha256: sha('user') }],
    content: [{ id: 'content:item', label: 'Approval', value: 'Representative approval', provenance: { fidelity: 'representative', receiptIds: ['input:user'] } }],
    tasks: [{ id: 'task:view', label: 'View approval', contentIds: ['content:item'], applicableStateIds: ['state:ready'] }],
    states: [{ id: 'state:ready', label: 'Ready', contentIds: ['content:item'], requirement: { kind: 'representative' } }],
    transitions: [{ id: 'transition:stay', taskId: 'task:view', fromStateId: 'state:ready', toStateId: 'state:ready', trigger: 'Refresh', recovery: { stateId: 'state:ready', action: 'Keep approval visible.' } }],
    densityProfiles: [{ id: 'density:one', label: 'One approval', itemCount: { minimum: 1, typical: 1, maximum: 1 }, contentIds: ['content:item'], stateIds: ['state:ready'], taskIds: ['task:view'] }],
  };
}

function publishIndependent(value: ReturnType<typeof project>, current: ReturnType<typeof checkAdaptiveWorkflow>) {
  const contentPath = '.omd/workflow/content.json';
  writeFileSync(join(value.root, contentPath), `${JSON.stringify(contentProof(current.planReceipt.sha256))}\n`);
  const content = receipt(value.root, contentPath, CONTENT_STATE_MODEL_SCHEMA);
  const structurePath = '.omd/workflow/structure.json';
  writeFileSync(join(value.root, structurePath), `${JSON.stringify({
    schema: 'structural-wireframe-v1', planSha256: current.planReceipt.sha256, inputs: [content],
    regions: [{ id: 'region:approval', role: 'work-object', parentId: null, order: 0, taskIds: ['task:view'], contentIds: ['content:item'], stateIds: ['state:ready'] }],
    layouts: [
      { viewport: 'desktop', regionId: 'region:approval', placement: 'Main work area', priority: 0 },
      { viewport: 'mobile', regionId: 'region:approval', placement: 'Primary flow', priority: 0 },
    ],
  })}\n`);
  const structure = receipt(value.root, structurePath, 'structural-wireframe-v1');
  const reviewPath = '.omd/workflow/structure-review.json';
  writeFileSync(join(value.root, reviewPath), `${JSON.stringify({
    schema: 'design-review-v1', lens: 'structure', planSha256: current.planReceipt.sha256,
    reviewer: identity('structure'), inputs: [content, structure], verdict: 'pass', findings: [],
    authority: 'workflow-support-only', cannotSubstitute: ['final-v2'],
  })}\n`);
  const review = receipt(value.root, reviewPath, 'design-review-v1');
  publishAdaptiveWorkflowProductionReadiness(value.root, {
    schema: 'adaptive-workflow-production-readiness-input-v1',
    artifacts: [{ investigationId: 'probe:content', artifact: content }, { investigationId: 'probe:structure', artifact: structure }],
    reviews: [review],
  }, value.writer(), value.invocation);
  return { content, structure, review };
}

function sliceInput() {
  return {
    schema: ADAPTIVE_WORKFLOW_PRODUCTION_SLICE_INPUT_SCHEMA,
    slices: [{
      investigationId: 'probe:component',
      component: { sourcePath: 'src/copy/ApprovalPanel.tsx', selector: '[data-component="approval-panel"]', contractSha256: sha('approval-contract') },
      representativeContext: { sourcePath: 'src/copy/approval-page.tsx', route: '/approvals/representative', selector: '[data-page="approval-context"]' },
    }],
  };
}

function publishSlice(value: ReturnType<typeof project>) {
  writeFileSync(join(value.root, 'src/copy/ApprovalPanel.tsx'), 'export const ApprovalPanel = () => <section data-component="approval-panel" />;\n');
  writeFileSync(join(value.root, 'src/copy/approval-page.tsx'), 'export const Page = () => <main data-page="approval-context" />;\n');
  const current = checkAdaptiveWorkflowProductionReadiness(value.root, value.invocation);
  const expected = createWorkflowProductionSlice({
    route: current.plan.route,
    plan: current.planReceipt as { path: string; schema: 'adaptive-workflow-plan-v1'; sha256: string },
    readiness: current.readinessReceipt as { path: string; schema: 'adaptive-workflow-production-readiness-v1'; sha256: string },
    owner: { role: 'omd-hand', ...value.invocation.current }, slices: sliceInput().slices,
    readSource: (path) => readFileSync(join(value.root, path)),
  });
  const bytes = workflowProductionSliceBytes(expected);
  assert.throws(() => publishAdaptiveWorkflowProductionSlice(value.root, sliceInput(), value.writer(), value.invocation), /authority|authorize/i);
  authorizeTestPayloads(value.invocation, value.root, [{ purpose: 'workflow-production-slice', payload: bytes }]);
  publishAdaptiveWorkflowProductionSlice(value.root, sliceInput(), value.writer(), value.invocation);
  return checkAdaptiveWorkflowProductionSlice(value.root, value.invocation);
}

function componentProof(value: ReturnType<typeof project>, current: ReturnType<typeof checkAdaptiveWorkflowProductionSlice>, upstream: ReturnType<typeof publishIndependent>) {
  writeFileSync(join(value.root, '.omd/workflow/renders/component-isolated.png'), png);
  writeFileSync(join(value.root, '.omd/workflow/renders/component-page.png'), png);
  const sliceReceipt = current.productionSliceReceipt!;
  const source = current.productionSlice!.slices[0]!.component.source;
  const assertions = [{ metric: 'overflow', expected: 'No overflow.', observed: 'No overflow observed.', pass: true }];
  const baseCase = { evidenceId: 'evidence:component', contentProfileId: 'density:one', stateId: 'state:ready', viewport: 'mobile' };
  return {
    schema: COMPONENT_STRESS_PROOF_V2_SCHEMA, planSha256: current.planReceipt.sha256, investigationId: 'probe:component',
    inputs: [upstream.content, upstream.structure], productionSlice: sliceReceipt,
    component: { sourcePath: source.path, selector: '[data-component="approval-panel"]', contractSha256: sha('approval-contract'), sourceSha256: source.sha256 },
    cases: [
      { id: 'case:isolated', ...baseCase, context: 'isolated', render: receipt(value.root, '.omd/workflow/renders/component-isolated.png', 'png'), assertions },
      { id: 'case:page', ...baseCase, context: 'representative-page', render: receipt(value.root, '.omd/workflow/renders/component-page.png', 'png'), assertions },
    ],
  };
}

function publishComplete(value: ReturnType<typeof project>, current: ReturnType<typeof checkAdaptiveWorkflowProductionSlice>, upstream: ReturnType<typeof publishIndependent>, suppliedProof?: ReturnType<typeof componentProof>) {
  const proofPath = '.omd/workflow/component-proof.json';
  const proof = suppliedProof ?? componentProof(value, current, upstream);
  writeFileSync(join(value.root, proofPath), `${JSON.stringify(proof)}\n`);
  const proofReceipt = receipt(value.root, proofPath, COMPONENT_STRESS_PROOF_V2_SCHEMA);
  const expressionPath = '.omd/workflow/expression-review.json';
  writeFileSync(join(value.root, expressionPath), `${JSON.stringify({
    schema: 'design-review-v1', lens: 'expression', planSha256: current.planReceipt.sha256,
    structureReview: upstream.review, reviewer: identity('expression'), inputs: [proofReceipt], verdict: 'pass', findings: [],
    invalidatesStructureReviewSha256: null, authority: 'workflow-support-only', cannotSubstitute: ['final-v2'],
  })}\n`);
  const expression = receipt(value.root, expressionPath, 'design-review-v1');
  publishAdaptiveWorkflowArtifacts(value.root, {
    schema: 'adaptive-workflow-artifact-selection-input-v1',
    artifacts: [
      { investigationId: 'probe:content', artifact: upstream.content },
      { investigationId: 'probe:structure', artifact: upstream.structure },
      { investigationId: 'probe:component', artifact: proofReceipt },
    ], reviews: [upstream.review, expression],
  }, value.writer(), value.invocation);
  return { proof, proofReceipt };
}

test('RED hypothesis 1 / GREEN: greenfield component proof uses production readiness, authenticated owner slice, then complete artifacts', () => {
  const value = project();
  try {
    const current = publishPlan(value);
    const upstream = publishIndependent(value, current);
    assert.doesNotThrow(() => checkAdaptiveWorkflowProductionReadiness(value.root, value.invocation));
    assert.throws(() => checkAdaptiveWorkflow(value.root, value.invocation), /selected proof|artifact/i);
    assert.throws(() => writeSourceSeal(value.root, value.invocation), 'premature finalization stays blocked');
    const sliced = publishSlice(value);
    publishComplete(value, sliced, upstream);
    assert.doesNotThrow(() => checkAdaptiveWorkflow(value.root, value.invocation));
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('RED hypothesis 2 / GREEN: forged slice, missing page context, and failed assertions fail closed', () => {
  const value = project();
  try {
    const upstream = publishIndependent(value, publishPlan(value));
    const sliced = publishSlice(value);
    const missing = componentProof(value, sliced, upstream); missing.cases.splice(1, 1);
    assert.throws(() => publishComplete(value, sliced, upstream, missing), /coverage|representative|component stress/i);
    const failed = componentProof(value, sliced, upstream); failed.cases[1]!.assertions[0]!.pass = false;
    writeFileSync(join(value.root, '.omd/workflow/component-proof.json'), `${JSON.stringify(failed)}\n`);
    assert.throws(() => publishAdaptiveWorkflowArtifacts(value.root, {
      schema: 'adaptive-workflow-artifact-selection-input-v1', artifacts: [
        { investigationId: 'probe:content', artifact: upstream.content }, { investigationId: 'probe:structure', artifact: upstream.structure },
        { investigationId: 'probe:component', artifact: receipt(value.root, '.omd/workflow/component-proof.json', COMPONENT_STRESS_PROOF_V2_SCHEMA) },
      ], reviews: [upstream.review],
    }, value.writer(), value.invocation), /failed assertion|expression review/i);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('RED hypothesis 3 / GREEN: source and rerender invalidation stop at the exact downstream closure', () => {
  const value = project();
  try {
    const upstream = publishIndependent(value, publishPlan(value));
    const sliced = publishSlice(value);
    publishComplete(value, sliced, upstream);
    writeFileSync(join(value.root, '.omd/workflow/renders/component-page.png'), Buffer.from('stale-render'));
    assert.doesNotThrow(() => checkAdaptiveWorkflowProductionReadiness(value.root, value.invocation));
    assert.doesNotThrow(() => checkAdaptiveWorkflowProductionSlice(value.root, value.invocation));
    assert.throws(() => checkAdaptiveWorkflow(value.root, value.invocation), /bytes changed|render/i);
    writeFileSync(join(value.root, '.omd/workflow/renders/component-page.png'), png);
    writeFileSync(join(value.root, 'src/copy/ApprovalPanel.tsx'), 'changed source\n');
    assert.doesNotThrow(() => checkAdaptiveWorkflowProductionReadiness(value.root, value.invocation));
    assert.throws(() => checkAdaptiveWorkflowProductionSlice(value.root, value.invocation), /bytes changed|stale/i);
    assert.throws(() => checkAdaptiveWorkflow(value.root, value.invocation));
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('a supplied existing component retains the complete artifact path without a production slice', () => {
  const value = project();
  try {
    const current = publishPlan(value);
    const upstream = (() => {
      const contentPath = '.omd/workflow/content.json';
      writeFileSync(join(value.root, contentPath), `${JSON.stringify(contentProof(current.planReceipt.sha256))}\n`);
      const content = receipt(value.root, contentPath, CONTENT_STATE_MODEL_SCHEMA);
      const structurePath = '.omd/workflow/structure.json';
      writeFileSync(join(value.root, structurePath), `${JSON.stringify({ schema: 'structural-wireframe-v1', planSha256: current.planReceipt.sha256, inputs: [content], regions: [{ id: 'region:approval', role: 'work-object', parentId: null, order: 0, taskIds: ['task:view'], contentIds: ['content:item'], stateIds: ['state:ready'] }], layouts: [{ viewport: 'desktop', regionId: 'region:approval', placement: 'Main', priority: 0 }, { viewport: 'mobile', regionId: 'region:approval', placement: 'Main', priority: 0 }] })}\n`);
      return { content, structure: receipt(value.root, structurePath, 'structural-wireframe-v1') };
    })();
    writeFileSync(join(value.root, 'src/copy/ApprovalPanel.tsx'), 'existing component\n');
    writeFileSync(join(value.root, '.omd/workflow/renders/component-isolated.png'), png);
    writeFileSync(join(value.root, '.omd/workflow/renders/component-page.png'), png);
    const assertions = [{ metric: 'overflow', expected: 'No overflow.', observed: 'No overflow.', pass: true }];
    const base = { evidenceId: 'evidence:component', contentProfileId: 'density:one', stateId: 'state:ready', viewport: 'mobile' };
    const proofPath = '.omd/workflow/component-proof-v1.json';
    writeFileSync(join(value.root, proofPath), `${JSON.stringify({ schema: 'component-stress-proof-v1', planSha256: current.planReceipt.sha256, inputs: [upstream.content, upstream.structure], component: { sourcePath: 'src/copy/ApprovalPanel.tsx', selector: '[data-component="approval-panel"]', contractSha256: sha('approval-contract') }, cases: [{ id: 'case:isolated', ...base, context: 'isolated', render: receipt(value.root, '.omd/workflow/renders/component-isolated.png', 'png'), assertions }, { id: 'case:page', ...base, context: 'representative-page', render: receipt(value.root, '.omd/workflow/renders/component-page.png', 'png'), assertions }] })}\n`);
    publishAdaptiveWorkflowArtifacts(value.root, { schema: 'adaptive-workflow-artifact-selection-input-v1', artifacts: [{ investigationId: 'probe:content', artifact: upstream.content }, { investigationId: 'probe:structure', artifact: upstream.structure }, { investigationId: 'probe:component', artifact: receipt(value.root, proofPath, 'component-stress-proof-v1') }], reviews: [] }, value.writer(), value.invocation);
    const complete = checkAdaptiveWorkflow(value.root, value.invocation);
    assert.equal(complete.readiness, null);
    assert.equal(complete.productionSlice, null);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('no component selection retains the one-checkpoint complete artifact path', () => {
  const value = project();
  try {
    const onlyContent = { ...development, investigations: [development.investigations[0]], rationale: 'Only content uncertainty remains.' };
    const source = receipt(value.root, '.omd/workflow-evidence.json', 'workflow-evidence-v1');
    publishAdaptiveWorkflowPlan(value.root, {
      development: onlyContent,
      evidence: [{ id: 'evidence:content', kind: 'content-shape', value: 'variable', source: { ...source, locator: '/content' } }],
      investigations: [{ id: 'probe:content', evidenceIds: ['evidence:content'] }], rationale: 'Only content proof is selected.',
    }, value.writer(), value.invocation);
    const current = checkAdaptiveWorkflow(value.root, value.invocation, { requireComplete: false });
    const path = '.omd/workflow/content.json'; writeFileSync(join(value.root, path), `${JSON.stringify(contentProof(current.planReceipt.sha256))}\n`);
    publishAdaptiveWorkflowArtifacts(value.root, { schema: 'adaptive-workflow-artifact-selection-input-v1', artifacts: [{ investigationId: 'probe:content', artifact: receipt(value.root, path, CONTENT_STATE_MODEL_SCHEMA) }], reviews: [] }, value.writer(), value.invocation);
    assert.doesNotThrow(() => checkAdaptiveWorkflow(value.root, value.invocation));
    assert.throws(() => checkAdaptiveWorkflowProductionReadiness(value.root, value.invocation), /does not require/i);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
