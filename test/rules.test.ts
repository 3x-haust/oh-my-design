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
    assert.ok(['a11y', 'system', 'slop', 'motion'].includes(r.category));
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

test('SLOP-KO-EMDASH fires when Hangul text contains a spaced em-dash or en-dash', () => {
  const positives = [
    '가장 흔한 답이 나와요 — 인디고에서 보라색으로 이어지는 그라디언트.',
    '디자인은 결정이에요 — 기본값이 아니라.',
    '모든 색은 이유가 있어요 – 브랜드가 결정한다.',
    '우리는 다르게 생각합니다 — 평균이 아닌 입장.',
  ];
  for (const text of positives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-KO-EMDASH'), `expected SLOP-KO-EMDASH for: ${text}`);
  }
});

test('SLOP-KO-EMDASH does not fire on English copy even with spaced em-dash', () => {
  const negatives = [
    'Design is a decision — not a default.',
    'Every color has a reason — the brand decides.',
    'We think differently — not the average.',
    // Korean without any spaced dash
    '디자인은 결정이에요, 기본값이 아니라.',
    '모든 색은 이유가 있어요: 브랜드가 결정한다.',
  ];
  for (const text of negatives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-KO-EMDASH'), `unexpected SLOP-KO-EMDASH for: ${text}`);
  }
});

test('SLOP-KO-REGISTER-MIX fires when 해요체 and 합니다체 alternate in one block', () => {
  const positives = [
    // exact screenshot text from the task
    '모델은 정답을 만들지 않아요. 훈련 데이터의 평균을 만듭니다.',
    '빠르고 정확해요. 품질을 보장합니다.',
    '사용하기 쉬워요. 전문가도 만족합니다.',
    '나와요. 평균을 만듭니다.',
  ];
  for (const text of positives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-KO-REGISTER-MIX'), `expected SLOP-KO-REGISTER-MIX for: ${text}`);
  }
});

test('SLOP-KO-REGISTER-MIX does not fire on uniform-register blocks', () => {
  const negatives = [
    // all 해요체
    '빠르고 정확해요. 사용하기 쉬워요. 품질이 좋아요.',
    // all 합니다체
    '빠르고 정확합니다. 사용하기 쉽습니다. 품질을 보장합니다.',
    // non-Korean text
    'Fast and accurate. Easy to use. Quality guaranteed.',
  ];
  for (const text of negatives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-KO-REGISTER-MIX'), `unexpected SLOP-KO-REGISTER-MIX for: ${text}`);
  }
});

test('SLOP-KO-REGISTER-MIX stays silent when quotation marks are present', () => {
  const negatives = [
    // quoted dialogue legitimately mixes registers
    '그는 "나는 좋아요"라고 했습니다.',
    "그녀가 '정말 좋아요'라고 대답했습니다.",
    '“빠르고 좋아요”라고 평가했습니다.',
  ];
  for (const text of negatives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-KO-REGISTER-MIX'), `unexpected SLOP-KO-REGISTER-MIX for: ${text}`);
  }
});

test('SLOP-KO-EMDASH and SLOP-KO-REGISTER-MIX do not fire on English-only nodes', () => {
  const englishNodes = [
    'Design is a decision — not a default.',
    'Fast. Accurate. Easy to use.',
  ];
  for (const text of englishNodes) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-KO-EMDASH'), `unexpected SLOP-KO-EMDASH for: ${text}`);
    assert.ok(!v.some((x) => x.id === 'SLOP-KO-REGISTER-MIX'), `unexpected SLOP-KO-REGISTER-MIX for: ${text}`);
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

// ── KO-KEEP-ALL ──────────────────────────────────────────────────────────────

function makeKoreanIr(wordBreak?: string) {
  const node: RawNode = {
    id: 'ko1',
    name: 'KoreanText',
    type: 'TEXT',
    path: 'Screen/KoreanText',
    parent: null,
    box: { x: 0, y: 0, w: 400, h: 24 },
    children: [],
    text: '동시접속 확인했어요',
    ...(wordBreak !== undefined ? { wordBreak } : {}),
  };
  return normalize({ nodes: [node] });
}

test('KO-KEEP-ALL fires when a Hangul text node is missing word-break: keep-all', () => {
  // no wordBreak field → computed value is not keep-all → rule fires
  const v = check(makeKoreanIr(), builtin, { categories: ['a11y'] });
  assert.ok(v.some((x) => x.id === 'KO-KEEP-ALL'), 'expected KO-KEEP-ALL when wordBreak absent');
});

test('KO-KEEP-ALL fires when wordBreak is normal (browser default)', () => {
  const v = check(makeKoreanIr('normal'), builtin, { categories: ['a11y'] });
  assert.ok(v.some((x) => x.id === 'KO-KEEP-ALL'), 'expected KO-KEEP-ALL for wordBreak:normal');
});

test('KO-KEEP-ALL does not fire when all Korean nodes have word-break: keep-all', () => {
  const v = check(makeKoreanIr('keep-all'), builtin, { categories: ['a11y'] });
  assert.ok(!v.some((x) => x.id === 'KO-KEEP-ALL'), 'unexpected KO-KEEP-ALL when wordBreak is keep-all');
});

test('KO-KEEP-ALL does not fire on a page with no Hangul text', () => {
  const v = check(makeTextIr('Design is a decision, not a default.'), builtin, { categories: ['a11y'] });
  assert.ok(!v.some((x) => x.id === 'KO-KEEP-ALL'), 'unexpected KO-KEEP-ALL on English-only page');
});

// ── SYS-TEXT-CLIP ─────────────────────────────────────────────────────────────

function makeClipIr(overflowPx: number, parentOverflow?: string) {
  const parentH = 100;
  const textH = parentH + overflowPx;
  const parent: RawNode = {
    id: 'frame1',
    name: 'HeroContainer',
    type: 'FRAME',
    path: 'Screen/HeroContainer',
    parent: null,
    box: { x: 0, y: 0, w: 600, h: parentH },
    children: ['text1'],
    ...(parentOverflow !== undefined ? { overflow: parentOverflow } : {}),
  };
  const textNode: RawNode = {
    id: 'text1',
    name: 'HeroHeading',
    type: 'TEXT',
    path: 'Screen/HeroContainer/HeroHeading',
    parent: 'frame1',
    box: { x: 0, y: 0, w: 580, h: textH },
    children: [],
    text: '다음 세대를 위한 디자인 도구',
  };
  return normalize({ nodes: [parent, textNode] });
}

test('SYS-TEXT-CLIP fires when text overflows a hidden-overflow parent by more than 4px', () => {
  const v = check(makeClipIr(20, 'hidden'), builtin, { categories: ['system'] });
  assert.ok(v.some((x) => x.id === 'SYS-TEXT-CLIP'), 'expected SYS-TEXT-CLIP for 20px overflow with hidden parent');
});

test('SYS-TEXT-CLIP does not fire when parent overflow is visible (default)', () => {
  // visible → text bleeds intentionally, no clip
  const v = check(makeClipIr(20), builtin, { categories: ['system'] }); // no overflow field = visible
  assert.ok(!v.some((x) => x.id === 'SYS-TEXT-CLIP'), 'unexpected SYS-TEXT-CLIP when parent overflow is visible');
});

test('SYS-TEXT-CLIP does not fire when text fits within the parent (overflow within threshold)', () => {
  const v = check(makeClipIr(3, 'hidden'), builtin, { categories: ['system'] });
  assert.ok(!v.some((x) => x.id === 'SYS-TEXT-CLIP'), 'unexpected SYS-TEXT-CLIP for 3px overflow (within threshold)');
});

test('SYS-TEXT-CLIP does not fire when parent overflow is scroll', () => {
  // scroll provides a scrollbar escape; content is not lost
  const v = check(makeClipIr(20, 'scroll'), builtin, { categories: ['system'] });
  assert.ok(!v.some((x) => x.id === 'SYS-TEXT-CLIP'), 'unexpected SYS-TEXT-CLIP when parent overflow is scroll');
});

// ── SLOP-KO-SIGNPOST ─────────────────────────────────────────────────────────

test('SLOP-KO-SIGNPOST fires on 아래는 … 기록/내용/목록/정리 patterns', () => {
  const positives = [
    '아래는 그 기록이에요.',
    '아래는 변경 내용입니다.',
    '아래는 전체 목록이에요.',
    '아래는 주요 정리입니다.',
  ];
  for (const text of positives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-KO-SIGNPOST'), `expected SLOP-KO-SIGNPOST for: ${text}`);
  }
});

test('SLOP-KO-SIGNPOST fires on 다음은 … 입니다/이에요 patterns', () => {
  const positives = [
    '다음은 기능 목록입니다.',
    '다음은 그 이유이에요.',
    '다음은 주요 특징입니다.',
  ];
  for (const text of positives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-KO-SIGNPOST'), `expected SLOP-KO-SIGNPOST for: ${text}`);
  }
});

test('SLOP-KO-SIGNPOST does not fire when 아래 is used as a spatial adverb (without 는)', () => {
  const negatives = [
    '아래 버튼을 누르세요.',        // spatial adverb, no topic marker
    '아래에서 다운로드하세요.',      // 아래에서, not 아래는
    '버튼은 아래에 있습니다.',      // 아래 embedded in sentence, not 아래는 opener
  ];
  for (const text of negatives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-KO-SIGNPOST'), `unexpected SLOP-KO-SIGNPOST for: ${text}`);
  }
});

test('SLOP-KO-SIGNPOST does not fire when 다음 lacks the topic marker 은', () => {
  const negatives = [
    '다음에 다시 시도해주세요.',     // 다음에, not 다음은
    '다음 단계로 이동하세요.',       // 다음 as a modifier, no topic marker
  ];
  for (const text of negatives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-KO-SIGNPOST'), `unexpected SLOP-KO-SIGNPOST for: ${text}`);
  }
});

test('SLOP-KO-SIGNPOST does not fire on English-only copy', () => {
  const negatives = [
    'Below is the full changelog.',
    'The following is a list of features.',
  ];
  for (const text of negatives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-KO-SIGNPOST'), `unexpected SLOP-KO-SIGNPOST for: ${text}`);
  }
});
