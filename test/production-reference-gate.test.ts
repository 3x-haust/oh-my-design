import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { requireProductionReferenceInputs } from '../core/runtime/production-reference-gate.ts';

const project = (): string => mkdtempSync(join(tmpdir(), 'omd-production-reference-gate-'));

const writeRoute = (root: string, projectMode: 'greenfield' | 'existing'): void => {
  mkdirSync(join(root, '.omd'), { recursive: true });
  writeFileSync(join(root, '.omd', 'route.json'), JSON.stringify({ projectMode }));
};

test('non-production callers are not blocked by the production reference gate', () => {
  const root = project();
  assert.doesNotThrow(() => requireProductionReferenceInputs(root, {}));
});

test('production source writes require a route before any greenfield source write', () => {
  const root = project();
  assert.throws(
    () => requireProductionReferenceInputs(root, { productionOwnerRole: 'omd-hand' }),
    /route\.json is required/,
  );
});

test('existing-product production may use its current evidence without a new reference board', () => {
  const root = project();
  writeRoute(root, 'existing');
  assert.doesNotThrow(() => requireProductionReferenceInputs(root, { productionOwnerRole: 'omd-hand' }));
});

test('greenfield production requires a board and non-empty captured references', () => {
  const root = project();
  writeRoute(root, 'greenfield');
  assert.throws(
    () => requireProductionReferenceInputs(root, { productionOwnerRole: 'omd-hand' }),
    /reference-board\.json and non-empty \.omd\/refs/,
  );

  writeFileSync(join(root, '.omd', 'reference-board.json'), '{}\n');
  mkdirSync(join(root, '.omd', 'refs'));
  assert.throws(
    () => requireProductionReferenceInputs(root, { productionOwnerRole: 'omd-hand' }),
    /reference-board\.json and non-empty \.omd\/refs/,
  );

  writeFileSync(join(root, '.omd', 'refs', 'reference.json'), '{}\n');
  assert.doesNotThrow(() => requireProductionReferenceInputs(root, { productionOwnerRole: 'omd-hand' }));
});
