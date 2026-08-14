import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  STRUCTURAL_WIREFRAME_SCHEMA,
  StructuralWireframeError,
  parseStructuralWireframe,
  type StructuralWireframeCurrent,
  type StructuralWireframeErrorCode,
} from '../core/design-development/structural-wireframe.ts';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const current = (): StructuralWireframeCurrent => ({
  planSha256: sha('workflow-plan'),
  inputs: [
    { path: '.omd/workflow/content-state.json', schema: 'content-state-model-v1', sha256: sha('content-state') },
    { path: '.omd/workflow/task-contract.json', schema: 'task-outcome-contract-v1', sha256: sha('task-contract') },
  ],
  taskIds: ['task:triage-order'],
  contentIds: ['content:order', 'content:impact', 'content:next-action'],
  stateIds: ['state:blocked', 'state:approval-pending'],
});
const valid = () => ({
  schema: STRUCTURAL_WIREFRAME_SCHEMA,
  planSha256: sha('workflow-plan'),
  inputs: [
    { path: '.omd/workflow/task-contract.json', schema: 'task-outcome-contract-v1', sha256: sha('task-contract') },
    { path: '.omd/workflow/content-state.json', schema: 'content-state-model-v1', sha256: sha('content-state') },
  ],
  regions: [
    {
      id: 'region:queue', role: 'work-object', parentId: null, order: 0,
      taskIds: ['task:triage-order'], contentIds: ['content:order', 'content:impact'],
      stateIds: ['state:blocked', 'state:approval-pending'],
    },
    {
      id: 'region:next-action', role: 'action', parentId: 'region:queue', order: 0,
      taskIds: ['task:triage-order'], contentIds: ['content:next-action'],
      stateIds: ['state:approval-pending'],
    },
  ],
  layouts: [
    { viewport: 'mobile', regionId: 'region:next-action', placement: 'stacked after the work object', priority: 1 },
    { viewport: 'desktop', regionId: 'region:queue', placement: 'primary work column', priority: 0 },
    { viewport: 'mobile', regionId: 'region:queue', placement: 'primary vertical flow', priority: 0 },
    { viewport: 'desktop', regionId: 'region:next-action', placement: 'adjacent action rail', priority: 1 },
  ],
});

function throwsCode(run: () => unknown, expected: StructuralWireframeErrorCode): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof StructuralWireframeError);
    assert.equal(error.code, expected);
    return true;
  });
}

test('structural proof binds the current plan, upstream receipts, tasks, content, states, and both viewport relationships', () => {
  const source = valid();
  const parsed = parseStructuralWireframe(source, current());

  source.regions[0]!.contentIds[0] = 'content:mutated';
  assert.equal(parsed.planSha256, sha('workflow-plan'));
  assert.deepEqual(parsed.inputs.map(({ path }) => path), [
    '.omd/workflow/content-state.json',
    '.omd/workflow/task-contract.json',
  ]);
  assert.deepEqual(parsed.regions.map(({ id }) => id), ['region:next-action', 'region:queue']);
  assert.deepEqual(parsed.layouts.map(({ viewport, priority }) => `${viewport}:${priority}`), [
    'desktop:0', 'desktop:1', 'mobile:0', 'mobile:1',
  ]);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.regions[0]?.contentIds), true);
});

test('stale plans, substituted upstream receipts, and dangling task/content/state references fail closed', () => {
  throwsCode(
    () => parseStructuralWireframe({ ...valid(), planSha256: sha('stale-plan') }, current()),
    'STRUCTURAL_WIREFRAME_STALE_PLAN',
  );
  const substituted = valid();
  substituted.inputs[0]!.sha256 = sha('substituted-upstream');
  throwsCode(() => parseStructuralWireframe(substituted, current()), 'STRUCTURAL_WIREFRAME_STALE_INPUT');

  for (const key of ['taskIds', 'contentIds', 'stateIds'] as const) {
    const dangling = valid();
    dangling.regions[0]![key].push(`${key}:unknown`);
    throwsCode(() => parseStructuralWireframe(dangling, current()), 'STRUCTURAL_WIREFRAME_DANGLING_REFERENCE');
  }

  const omitted = valid();
  omitted.regions[0]!.contentIds.splice(1, 1);
  throwsCode(() => parseStructuralWireframe(omitted, current()), 'STRUCTURAL_WIREFRAME_UNCOVERED_REFERENCE');
});

test('desktop and mobile must cover the same region tree with complete ordered parent-before-child relationships', () => {
  const missingMobile = valid();
  missingMobile.layouts.splice(0, 1);
  throwsCode(() => parseStructuralWireframe(missingMobile, current()), 'STRUCTURAL_WIREFRAME_VIEWPORT_COVERAGE');

  const childFirst = valid();
  childFirst.layouts.find(({ viewport, regionId }) => viewport === 'mobile' && regionId === 'region:queue')!.priority = 1;
  childFirst.layouts.find(({ viewport, regionId }) => viewport === 'mobile' && regionId === 'region:next-action')!.priority = 0;
  throwsCode(() => parseStructuralWireframe(childFirst, current()), 'STRUCTURAL_WIREFRAME_INVALID_RELATIONSHIP');

  const cycle = valid();
  cycle.regions[0]!.parentId = 'region:next-action';
  throwsCode(() => parseStructuralWireframe(cycle, current()), 'STRUCTURAL_WIREFRAME_INVALID_RELATIONSHIP');
});

test('structural proofs reject expression fields instead of making early palette, font, material, or motion commitments', () => {
  for (const field of ['palette', 'fontFamily', 'material', 'motion'] as const) {
    const expressive = valid() as ReturnType<typeof valid> & Record<string, unknown>;
    expressive[field] = 'premature expression choice';
    throwsCode(() => parseStructuralWireframe(expressive, current()), 'STRUCTURAL_WIREFRAME_EXPRESSION_FIELD');
  }

  const nested = valid();
  Object.assign(nested.regions[0]!, { shadow: '0 4px 8px black' });
  throwsCode(() => parseStructuralWireframe(nested, current()), 'STRUCTURAL_WIREFRAME_EXPRESSION_FIELD');
});

test('structural proof shape is closed and hostile accessors are not invoked', () => {
  const extra = valid() as ReturnType<typeof valid> & { surprise?: boolean };
  extra.surprise = true;
  throwsCode(() => parseStructuralWireframe(extra, current()), 'STRUCTURAL_WIREFRAME_MALFORMED');

  let calls = 0;
  const accessor = valid();
  Object.defineProperty(accessor, 'regions', { enumerable: true, get() { calls += 1; return []; } });
  throwsCode(() => parseStructuralWireframe(accessor, current()), 'STRUCTURAL_WIREFRAME_MALFORMED');
  assert.equal(calls, 0);
});
