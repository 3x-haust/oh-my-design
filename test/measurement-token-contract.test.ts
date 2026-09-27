import assert from 'node:assert/strict';
import test from 'node:test';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { measurementFixture } from './helpers/visual-measurement.ts';
import { loadContracts } from '../core/measure/inputs.ts';
import { minimalTokenScales } from '../core/tokens/contract.ts';

test('measurement consumes the shared minimal token schema and its canonical scale projection', t => {
  const f = measurementFixture('clean'); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const tokens = { schema: 'token-commit-v3', scope: { representativeSurfaceId: 'application' }, primitives: {
    family: { type: 'font-family', value: ['Arial', 'OMD Geometry Fixture', 'sans-serif'] },
    body: { type: 'number', value: 15, unit: 'px' }, leading: { type: 'number', value: 1.55, unit: 'unitless' }, gap: { type: 'number', value: 24, unit: 'px' },
  }, semantic: { copy: { ref: 'body' }, space: { ref: 'gap' } }, textStyles: { body: { familyRef: 'family', sizeRef: 'body', weight: 400, lineHeightRef: 'leading', letterSpacingRef: null } } };
  writeFileSync(join(f.root, '.omd/tokens.json'), JSON.stringify(tokens));
  const loaded = loadContracts(f.root);
  assert.deepEqual(loaded.contracts.errors, []);
  const actual = loaded.contracts.tokens; assert.ok(actual?.schema === 'token-commit-v3');
  assert.deepEqual(loaded.contracts.composition!.spacing!.scale, minimalTokenScales(actual).spacingScale);
  assert.deepEqual(minimalTokenScales(actual).typeScale, [15]);
  assert.ok(loaded.inputs.some(i => i.kind === 'tokens'));
});
