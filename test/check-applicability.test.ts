import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextualCheckViolations, isStructuralSketchTarget } from '../core/rules/applicability.ts';
import type { Violation } from '../core/types.ts';

const finding = (id: string): Violation => ({
  id,
  severity: 'warn',
  layer: 1,
  category: 'slop',
  nodeId: 'body',
  path: 'body',
  value: null,
  message: id,
});

test('structural sketch targets omit only the colour-direction rule', () => {
  const root = '/project';
  const target = '.omd/.cache/sketches/candidate/index.html';
  const violations = [finding('SLOP-COLORLESS'), finding('SLOP-DIVIDER-SPAM')];
  assert.equal(isStructuralSketchTarget(root, target), true);
  assert.deepEqual(
    contextualCheckViolations(root, target, violations).map(({ id }) => id),
    ['SLOP-DIVIDER-SPAM'],
  );
  assert.equal(
    isStructuralSketchTarget(root, 'omd-test/run-004/.omd/.cache/sketches/candidate/index.html'),
    true,
  );
});

test('product source and unrelated cache targets retain colourless findings', () => {
  const root = '/project';
  const violations = [finding('SLOP-COLORLESS')];
  assert.equal(isStructuralSketchTarget(root, 'src/index.html'), false);
  assert.equal(isStructuralSketchTarget(root, '.omd/.cache/type-proof/index.html'), false);
  assert.equal(contextualCheckViolations(root, 'src/index.html', violations), violations);
});
