import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  COMPONENT_STRESS_PROOF_SCHEMA,
  ComponentStressProofError,
  parseComponentStressProof,
  type ComponentStressProofCurrent,
  type ComponentStressProofErrorCode,
} from '../core/design-development/component-stress-proof.ts';

const sha = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');
const renders = new Map<string, Buffer>([
  ['.omd/workflow/renders/approval-isolated.png', png],
  ['.omd/workflow/renders/approval-page.png', png],
]);
const current = (): ComponentStressProofCurrent => ({
  planSha256: sha('workflow-plan'),
  inputs: [
    { path: '.omd/workflow/content-state.json', schema: 'content-state-model-v1', sha256: sha('content-state') },
    { path: '.omd/workflow/structure.json', schema: 'structural-wireframe-v1', sha256: sha('structure') },
  ],
  component: {
    sourcePath: 'src/components/ApprovalPanel.tsx',
    selector: '[data-component="approval-panel"]',
    contractSha256: sha('approval-component-contract'),
  },
  applicableCases: [{
    id: 'evidence:pending-approval-mobile',
    contentProfileId: 'density:representative-order',
    stateId: 'state:approval-pending',
    viewport: { name: 'mobile', width: 1, height: 1 },
    requiredAssertions: ['overflow', 'visibility', 'focus-reach'],
  }],
  readRender: (path) => renders.get(path) ?? (() => { throw new Error('missing render'); })(),
});
const assertions = () => [
  { metric: 'overflow', expected: 'No horizontal overflow.', observed: 'scrollWidth equals clientWidth.', pass: true },
  { metric: 'visibility', expected: 'Authority and scope remain visible.', observed: 'Both labels are visible.', pass: true },
  { metric: 'focus-reach', expected: 'The action is keyboard reachable.', observed: 'Focus reaches the action.', pass: true },
];
const valid = () => ({
  schema: COMPONENT_STRESS_PROOF_SCHEMA,
  planSha256: sha('workflow-plan'),
  inputs: [
    { path: '.omd/workflow/structure.json', schema: 'structural-wireframe-v1', sha256: sha('structure') },
    { path: '.omd/workflow/content-state.json', schema: 'content-state-model-v1', sha256: sha('content-state') },
  ],
  component: {
    sourcePath: 'src/components/ApprovalPanel.tsx',
    selector: '[data-component="approval-panel"]',
    contractSha256: sha('approval-component-contract'),
  },
  cases: [
    {
      id: 'case:page', evidenceId: 'evidence:pending-approval-mobile', context: 'representative-page',
      contentProfileId: 'density:representative-order', stateId: 'state:approval-pending', viewport: 'mobile',
      render: { path: '.omd/workflow/renders/approval-page.png', schema: 'png', sha256: sha(png) },
      assertions: assertions(),
    },
    {
      id: 'case:isolated', evidenceId: 'evidence:pending-approval-mobile', context: 'isolated',
      contentProfileId: 'density:representative-order', stateId: 'state:approval-pending', viewport: 'mobile',
      render: { path: '.omd/workflow/renders/approval-isolated.png', schema: 'png', sha256: sha(png) },
      assertions: assertions(),
    },
  ],
});

function throwsCode(run: () => unknown, expected: ComponentStressProofErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof ComponentStressProofError);
    assert.equal(error.code, expected);
    return true;
  });
}

test('stress cases derive only from applicable evidence and prove isolation plus representative page context', () => {
  const source = valid();
  const parsed = parseComponentStressProof(source, current());

  source.cases[0]!.assertions[0]!.observed = 'mutated';
  assert.deepEqual(parsed.cases.map(({ context }) => context), ['isolated', 'representative-page']);
  assert.equal(parsed.cases[1]?.assertions[0]?.observed, 'scrollWidth equals clientWidth.');
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.cases[0]?.assertions), true);
});

test('stress proof has no universal short, long, empty, loading, or error quota', () => {
  const parsed = parseComponentStressProof(valid(), current());
  assert.deepEqual([...new Set(parsed.cases.map(({ contentProfileId }) => contentProfileId))], ['density:representative-order']);
  assert.deepEqual([...new Set(parsed.cases.map(({ stateId }) => stateId))], ['state:approval-pending']);
});

test('missing applicable cases, fabricated evidence cases, or either required context fail', () => {
  const missingContext = valid();
  missingContext.cases.splice(0, 1);
  throwsCode(() => parseComponentStressProof(missingContext, current()), 'COMPONENT_STRESS_INCOMPLETE_COVERAGE');

  const fabricated = valid();
  fabricated.cases[0]!.evidenceId = 'evidence:invented-error';
  fabricated.cases[0]!.stateId = 'state:invented-error';
  throwsCode(() => parseComponentStressProof(fabricated, current()), 'COMPONENT_STRESS_INAPPLICABLE_CASE');
});

test('real render bytes, dimensions, plan, upstream receipts, and component contract are current', () => {
  const staleRender = new Map(renders);
  staleRender.set('.omd/workflow/renders/approval-page.png', Buffer.from('changed'));
  throwsCode(
    () => parseComponentStressProof(valid(), { ...current(), readRender: (path) => staleRender.get(path) ?? Buffer.alloc(0) }),
    'COMPONENT_STRESS_STALE_RENDER',
  );
  throwsCode(
    () => parseComponentStressProof({ ...valid(), planSha256: sha('stale-plan') }, current()),
    'COMPONENT_STRESS_STALE_PLAN',
  );
  const staleInput = valid();
  staleInput.inputs[0]!.sha256 = sha('stale-input');
  throwsCode(() => parseComponentStressProof(staleInput, current()), 'COMPONENT_STRESS_STALE_INPUT');
  const staleComponent = valid();
  staleComponent.component.contractSha256 = sha('stale-component');
  throwsCode(() => parseComponentStressProof(staleComponent, current()), 'COMPONENT_STRESS_STALE_COMPONENT');

  throwsCode(
    () => parseComponentStressProof(valid(), {
      ...current(),
      applicableCases: [{ ...current().applicableCases[0]!, viewport: { name: 'mobile', width: 390, height: 844 } }],
    }),
    'COMPONENT_STRESS_RENDER_DIMENSIONS',
  );
});

test('a failed or omitted required assertion fails the whole stress proof', () => {
  const failed = valid();
  failed.cases[0]!.assertions[0]!.pass = false;
  throwsCode(() => parseComponentStressProof(failed, current()), 'COMPONENT_STRESS_ASSERTION_FAILED');

  const omitted = valid();
  omitted.cases[1]!.assertions.splice(2, 1);
  throwsCode(() => parseComponentStressProof(omitted, current()), 'COMPONENT_STRESS_MISSING_ASSERTION');
});

test('stress proof shape is closed and render paths cannot be reused across contexts', () => {
  const reused = valid();
  reused.cases[0]!.render.path = reused.cases[1]!.render.path;
  throwsCode(() => parseComponentStressProof(reused, current()), 'COMPONENT_STRESS_RENDER_REUSED');

  const extra = valid() as ReturnType<typeof valid> & { green?: boolean };
  extra.green = true;
  throwsCode(() => parseComponentStressProof(extra, current()), 'COMPONENT_STRESS_MALFORMED');
});
