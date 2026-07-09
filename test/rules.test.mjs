import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize } from '../core/ir/normalize.mjs';
import { loadRules, check } from '../core/rules/engine.mjs';

const ir = normalize(JSON.parse(readFileSync(new URL('./fixtures/ir.raw.json', import.meta.url))));
const builtin = loadRules(new URL('../core/rules/builtin/', import.meta.url).pathname);

test('loadRules reads every builtin rule and validates required fields', () => {
  assert.ok(builtin.length >= 4);
  for (const r of builtin) {
    for (const k of ['id', 'layer', 'severity', 'when', 'assert', 'message']) {
      assert.ok(r[k] !== undefined, `${r.id ?? '?'} missing ${k}`);
    }
    assert.ok(['error', 'warn'].includes(r.severity));
    assert.ok([1, 2].includes(r.layer));
  }
});

test('loadRules rejects a rule with a duplicate id', () => {
  assert.throws(() => loadRules(new URL('./fixtures/rules-duplicate/', import.meta.url).pathname), /duplicate/i);
});

test('check finds exactly the seeded violations', () => {
  const v = check(ir, builtin);
  const ids = v.map((x) => x.id).sort();
  assert.deepEqual(ids, ['CONTRAST-001', 'HIT-002', 'SPACING-001', 'TOKEN-003', 'TOKEN-003']);
});

test('violations carry nodeId, path, value and an interpolated message', () => {
  const v = check(ir, builtin);
  const spacing = v.find((x) => x.id === 'SPACING-001');
  assert.equal(spacing.nodeId, '1:20');
  assert.equal(spacing.path, 'Screen/List/CardOffGrid');
  assert.deepEqual(spacing.value, [16, 16, 14, 16]);
  assert.equal(spacing.severity, 'warn');
  assert.ok(!spacing.message.includes('{'), 'message must be fully interpolated');
});

test('check output is deterministic — sorted by path then id', () => {
  const a = check(ir, builtin).map((x) => `${x.path}|${x.id}`);
  const b = [...a].sort();
  assert.deepEqual(a, b);
  assert.deepEqual(check(ir, builtin), check(ir, builtin));
});

test('layer filter selects rules by layer', () => {
  assert.equal(check(ir, builtin, { layers: [2] }).length, 0);
  assert.equal(check(ir, builtin, { layers: [1] }).length, 5);
});

test('a rule whose when-expression throws is reported, not silently skipped', () => {
  const bad = [{ id: 'BAD-001', layer: 1, severity: 'error', when: 'node.nope.deep', assert: 'true', message: 'x' }];
  assert.throws(() => check(ir, bad), /BAD-001/);
});

test('team rules can reference frame concepts (Layer 2)', () => {
  const teamRule = [{
    id: 'BRAND-014',
    layer: 2,
    severity: 'error',
    when: "node.path.startsWith('Screen/Checkout/') && node.computed.isInteractive",
    value: 'node.fill.token',
    assert: "value === 'brand/primary'",
    message: 'Checkout CTA must use brand/primary, got {value}',
  }];
  const v = check(ir, teamRule, { layers: [2] });
  assert.equal(v.length, 1);
  assert.equal(v[0].nodeId, '1:30');
  assert.ok(v[0].message.includes('null'));
});
