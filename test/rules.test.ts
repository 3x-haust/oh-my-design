import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../core/ir/normalize.ts';
import { loadRules, check } from '../core/rules/engine.ts';
import type { RawIr, RawNode, Rule } from '../core/types.ts';
import { must, asRecord, readJson } from './helpers.ts';

const ir = normalize(readJson<RawIr>(new URL('./fixtures/ir.raw.json', import.meta.url)));
const builtin = loadRules(new URL('../core/rules/builtin/', import.meta.url).pathname);

test('loadRules reads every builtin rule and validates required fields', () => {
  assert.ok(builtin.length >= 4);
  for (const r of builtin) {
    for (const k of ['id', 'layer', 'category', 'severity', 'when', 'assert', 'message']) {
      assert.ok(asRecord(r)[k] !== undefined, `${r.id ?? '?'} missing ${k}`);
    }
    assert.ok(['error', 'warn'].includes(r.severity));
    assert.ok([1, 2].includes(r.layer));
    assert.ok(['a11y', 'system', 'slop'].includes(r.category));
  }
});

test('loadRules rejects a rule missing category', () => {
  assert.throws(
    () => loadRules(new URL('./fixtures/rules-missing-category/', import.meta.url).pathname),
    /NO-CATEGORY-001.*category/i,
  );
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
  const spacing = must(v.find((x) => x.id === 'SPACING-001'), 'spacing violation');
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

test('category filter selects rules by category', () => {
  const v = check(ir, builtin, { categories: ['a11y'] });
  assert.ok(v.length > 0);
  for (const violation of v) assert.equal(violation.category, 'a11y');
  assert.deepEqual(v.map((x) => x.id).sort(), ['CONTRAST-001', 'HIT-002']);
});

test('a rule whose when-expression throws is reported, not silently skipped', () => {
  const bad: Rule[] = [{ id: 'BAD-001', layer: 1, category: 'system', severity: 'error', when: 'node.nope.deep', assert: 'true', message: 'x' }];
  assert.throws(() => check(ir, bad), /BAD-001/);
});

test('team rules can reference frame concepts (Layer 2)', () => {
  const teamRule: Rule[] = [{
    id: 'BRAND-014',
    layer: 2,
    category: 'system',
    severity: 'error',
    when: "node.path.startsWith('Screen/Checkout/') && node.computed.isInteractive",
    value: 'node.fill.token',
    assert: "value === 'brand/primary'",
    message: 'Checkout CTA must use brand/primary, got {value}',
  }];
  const v = check(ir, teamRule, { layers: [2] });
  assert.equal(v.length, 1);
  const violation = must(v[0], 'violation');
  assert.equal(violation.nodeId, '1:30');
  assert.ok(violation.message.includes('null'));
});

test('SLOP-GRADIENT fires when both stops sit in the 240-290deg violet band', () => {
  const root: RawNode = {
    id: 'r1',
    name: 'Hero',
    type: 'FRAME',
    path: 'Hero',
    parent: null,
    box: { x: 0, y: 0, w: 100, h: 100 },
    children: [],
    gradient: 'linear-gradient(135deg, #4f46e5, #a855f7)',
  };
  const synthetic = normalize({ nodes: [root] });
  const v = check(synthetic, builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-GRADIENT'));
});

// Helpers for text-node rule tests
function makeTextIr(text: string) {
  const node: RawNode = {
    id: 'txt1',
    name: 'CopyText',
    type: 'TEXT',
    path: 'Screen/CopyText',
    parent: null,
    box: { x: 0, y: 0, w: 400, h: 24 },
    children: [],
    text,
  };
  return normalize({ nodes: [node] });
}

test('SLOP-PINK-ELEPHANT fires on English self-negating meta-copy', () => {
  const positives = [
    "You won't find clutter here.",
    "We will never bore you with long sign-up forms.",
    "We won't waste your attention.",
    "No distractions, just the work.",
    "Zero ads, just great content.",
  ];
  for (const text of positives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-PINK-ELEPHANT'), `expected SLOP-PINK-ELEPHANT for: ${text}`);
  }
});

test('SLOP-PINK-ELEPHANT fires on Korean self-negating meta-copy', () => {
  const positives = [
    '이런 내용은 없습니다.',
    '이런 것은 없어요.',
    '여기에는 광고가 없습니다.',
    '이 페이지에는 잡동사니는 없습니다.',
    '여기에는 군더더기 없습니다.',
  ];
  for (const text of positives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-PINK-ELEPHANT'), `expected SLOP-PINK-ELEPHANT for: ${text}`);
  }
});

test('SLOP-COPY-KO fires on C-11: sentence-opening connective followed by a comma', () => {
  const positives = [
    '또한, 이 제품은 빠릅니다.',
    '그러나, 문제가 있습니다.',
    '하지만, 우리는 다르게 접근합니다.',
    '따라서, 결론을 도출할 수 있습니다.',
    '즉, 핵심은 단순함입니다.',
  ];
  for (const text of positives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-COPY-KO'), `expected SLOP-COPY-KO for: ${text}`);
  }
});

test('SLOP-COPY-KO does not fire when the same connectives appear without a comma', () => {
  const negatives = [
    '또한 그날 밤 모두가 모였다.',        // 또한 as adverb, no comma
    '그러나 이것은 다른 문제다.',          // connective without comma
    '하지만 우리는 여기까지 왔다.',        // same
    '따라서 이 결론은 타당하다.',          // same
    '즉 이렇게 말할 수 있다.',             // same
  ];
  for (const text of negatives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-COPY-KO'), `unexpected SLOP-COPY-KO for: ${text}`);
  }
});

test('SLOP-COPY-KO fires on AI structural openers 살펴보겠습니다 and 알아보겠습니다', () => {
  const positives = [
    '이번 글에서는 주요 기능을 살펴보겠습니다.',
    '이 제품에 대해 자세히 알아보겠습니다.',
  ];
  for (const text of positives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-COPY-KO'), `expected SLOP-COPY-KO for: ${text}`);
  }
});

test('SLOP-COPY-KO fires on 둘째, and 셋째, list-enumeration patterns', () => {
  const positives = [
    '둘째, 디자인의 일관성이 중요합니다.',
    '셋째, 사용자 경험을 최우선으로 합니다.',
    '셋째，세 번째 이유는 다음과 같습니다.',  // ideographic comma variant
  ];
  for (const text of positives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-COPY-KO'), `expected SLOP-COPY-KO for: ${text}`);
  }
});

test('SLOP-PINK-ELEPHANT does not fire on legitimate negative-statement copy', () => {
  const negatives = [
    // privacy / policy copy
    "We don't use trackers or third-party analytics.",
    "We do not sell your data.",
    // empty states
    "검색 결과가 없습니다.",
    "일치하는 항목이 없습니다.",
    // 404 / error
    "404 — Page not found.",
    "This page no longer exists.",
    // out-of-stock / unavailable
    "Out of stock. Check back next week.",
    "No items match your current filter.",
    "품절되어 재고가 없습니다.",
  ];
  for (const text of negatives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-PINK-ELEPHANT'), `unexpected SLOP-PINK-ELEPHANT for: ${text}`);
  }
});
