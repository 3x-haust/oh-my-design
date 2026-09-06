import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CONTENT_STATE_MODEL_SCHEMA } from '../core/design-development/content-state-model.ts';
import {
  checkAdaptiveWorkflow,
  publishAdaptiveWorkflowArtifacts,
  publishAdaptiveWorkflowPlan,
} from '../core/design-development/workflow-persistence.ts';
import { validateSourceSeal, writeSourceSeal } from '../core/source-seal/index.ts';
import { acquireProjectMutationLock } from '../core/runtime/project-write.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';

const fixture = (): unknown => JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const direct = {
  schema: 'design-development-contract-v1', owner: 'user-selected-model', mode: 'direct', risks: [], investigations: [], referencePrinciples: [],
  rationale: 'No material design uncertainty remains for this bounded correction.',
} as const;
const investigated = {
  schema: 'design-development-contract-v1', owner: 'user-selected-model', mode: 'investigate',
  risks: [{ id: 'risk:states', question: 'Which states shape the task?', consequence: 'high', uncertainty: 'high', lateReversalCost: 'high' }],
  investigations: [{ id: 'probe:states', kind: 'content-state-model', riskIds: ['risk:states'], question: 'Which states shape the task?', fidelity: { content: 'representative', visual: 'none', interaction: 'none', behavior: 'representative', environment: 'none' }, stopWhen: 'The state set is explicit.' }],
  referencePrinciples: [], rationale: 'State uncertainty must be retired before production.',
} as const;
function project(): { root: string; invocation: ReturnType<typeof publishTestAdaptiveRoute> } {
  const root = mkdtempSync(join(tmpdir(), 'omd-workflow-persistence-'));
  mkdirSync(join(root, '.omd'), { recursive: true }); mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'app.ts'), 'export const current = true;\n');
  writeFileSync(join(root, '.omd', 'copy-deck.md'), '# Copy\n');
  return { root, invocation: publishTestAdaptiveRoute(root, fixture(), 'workflow-persistence') };
}
function publishPlan(root: string, invocation: ReturnType<typeof publishTestAdaptiveRoute>, development: unknown): void {
  publishAdaptiveWorkflowPlan(root, {
    development,
    evidence: development === direct ? [] : [{ id: 'evidence:states', kind: 'state-impact', value: 'multi-state', source: { path: '.omd/copy-deck.md', schema: 'copy-deck-v2', sha256: sha(readFileSync(join(root, '.omd', 'copy-deck.md'))), locator: '/copy' } }],
    investigations: development === direct ? [] : [{ id: 'probe:states', evidenceIds: ['evidence:states'] }],
    rationale: development === direct ? 'Proceed directly.' : 'Run the selected state probe.',
  }, createTestProjectWriteAdapter(root, invocation), invocation);
}
function contentProof(planSha256: string): unknown {
  return {
    schema: CONTENT_STATE_MODEL_SCHEMA, planSha256,
    inputReceipts: [{ id: 'input:plan', kind: 'plan', sha256: planSha256 }, { id: 'input:user', kind: 'user-input', sha256: sha('user') }],
    content: [{ id: 'content:item', label: 'Item', value: 'A representative item', provenance: { fidelity: 'representative', receiptIds: ['input:user'] } }],
    tasks: [{ id: 'task:view', label: 'View item', contentIds: ['content:item'], applicableStateIds: ['state:ready'] }],
    states: [{ id: 'state:ready', label: 'Ready', contentIds: ['content:item'], requirement: { kind: 'representative' } }],
    transitions: [{ id: 'transition:stay', taskId: 'task:view', fromStateId: 'state:ready', toStateId: 'state:ready', trigger: 'Refresh', recovery: { stateId: 'state:ready', action: 'Keep the item visible.' } }],
    densityProfiles: [{ id: 'density:one', label: 'One item', itemCount: { minimum: 1, typical: 1, maximum: 1 }, contentIds: ['content:item'], stateIds: ['state:ready'], taskIds: ['task:view'] }],
  };
}

test('workflow publication acquires the project mutation lock before input validation or pointer mutation', () => {
  const value = project();
  const contender = createTestProjectRunInvocation(value.root, 'workflow-contender');
  const release = acquireProjectMutationLock(value.root, value.invocation);
  let developmentReads = 0;
  const input = {
    get development() { developmentReads += 1; return direct; },
    evidence: [], investigations: [], rationale: 'Proceed directly.',
  };
  try {
    assert.throws(
      () => publishAdaptiveWorkflowPlan(value.root, input, createTestProjectWriteAdapter(value.root, contender), contender),
      /project mutation lock is owned by another invocation/,
    );
    assert.equal(developmentReads, 0);
    assert.equal(existsSync(join(value.root, '.omd', 'workflow-plan.json')), false);
  } finally {
    release();
    rmSync(value.root, { recursive: true, force: true });
  }
});

test('direct workflow publishes only an immutable current plan and source-seal v2 without phantom artifacts', () => {
  const value = project();
  try {
    publishPlan(value.root, value.invocation, direct);
    const current = checkAdaptiveWorkflow(value.root, value.invocation);
    assert.equal(current.plan.development.mode, 'direct');
    assert.equal(current.artifacts, null);
    assert.equal(existsSync(join(value.root, '.omd', 'workflow-artifacts.json')), false);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('investigate workflow cannot seal until every selected proof is current and passed', () => {
  const value = project();
  try {
    publishPlan(value.root, value.invocation, investigated);
    assert.throws(() => writeSourceSeal(value.root, value.invocation), /workflow artifact|selected proof/i);
    const current = checkAdaptiveWorkflow(value.root, value.invocation, { requireComplete: false });
    const proofPath = '.omd/workflow/content-state.json'; mkdirSync(join(value.root, '.omd', 'workflow'), { recursive: true });
    writeFileSync(join(value.root, proofPath), `${JSON.stringify(contentProof(current.planReceipt.sha256))}\n`);
    const proofReceipt = { path: proofPath, schema: CONTENT_STATE_MODEL_SCHEMA, sha256: sha(readFileSync(join(value.root, proofPath))) };
    const failedReviewPath = '.omd/workflow/failed-review.json';
    writeFileSync(join(value.root, failedReviewPath), `${JSON.stringify({
      schema: 'design-review-v1', lens: 'structure', planSha256: current.planReceipt.sha256,
      reviewer: { actor: 'independent-reviewer', id: 'reviewer', processId: 'process', sessionId: 'session', nonce: 'nonce', configurationSha256: sha('review-configuration') },
      inputs: [proofReceipt], verdict: 'revise', findings: [{ axis: 'hierarchy', severity: 'blocking', evidence: 'The hierarchy remains unresolved.' }],
      authority: 'workflow-support-only', cannotSubstitute: ['final-v2'],
    })}\n`);
    assert.throws(() => publishAdaptiveWorkflowArtifacts(value.root, {
      schema: 'adaptive-workflow-artifact-selection-input-v1', artifacts: [{ investigationId: 'probe:states', artifact: proofReceipt }],
      reviews: [{ path: failedReviewPath, schema: 'design-review-v1', sha256: sha(readFileSync(join(value.root, failedReviewPath))) }],
    }, createTestProjectWriteAdapter(value.root, value.invocation), value.invocation), /failed|revise/i);
    publishAdaptiveWorkflowArtifacts(value.root, {
      schema: 'adaptive-workflow-artifact-selection-input-v1',
      artifacts: [{ investigationId: 'probe:states', artifact: proofReceipt }],
      reviews: [],
    }, createTestProjectWriteAdapter(value.root, value.invocation), value.invocation);
    writeSourceSeal(value.root, value.invocation);
    assert.deepEqual(validateSourceSeal(value.root, value.invocation), []);
    assert.equal(JSON.parse(readFileSync(join(value.root, '.omd', 'source-seal.json'), 'utf8')).schemaVersion, 2);
    writeFileSync(join(value.root, proofPath), '{}\n');
    assert.ok(validateSourceSeal(value.root, value.invocation).some((finding) => finding.path.includes('workflow')));
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test('workflow pointer, record, path, hash, and symlink substitutions fail closed', () => {
  for (const mutate of [
    (root: string) => writeFileSync(join(root, '.omd', 'workflow-plan.json'), '{}\n'),
    (root: string) => { const pointer = JSON.parse(readFileSync(join(root, '.omd', 'workflow-plan.json'), 'utf8')); pointer.sha256 = '0'.repeat(64); writeFileSync(join(root, '.omd', 'workflow-plan.json'), JSON.stringify(pointer)); },
    (root: string) => { const pointer = JSON.parse(readFileSync(join(root, '.omd', 'workflow-plan.json'), 'utf8')); writeFileSync(join(root, '.omd', pointer.record), '{}\n'); },
    (root: string) => { rmSync(join(root, '.omd', 'workflow-plan.json')); symlinkSync('route.json', join(root, '.omd', 'workflow-plan.json')); },
  ]) {
    const value = project();
    try { publishPlan(value.root, value.invocation, direct); mutate(value.root); assert.throws(() => checkAdaptiveWorkflow(value.root, value.invocation)); }
    finally { rmSync(value.root, { recursive: true, force: true }); }
  }
});
