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
    assert.ok(['a11y', 'system', 'slop', 'motion', 'ux'].includes(r.category));
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
  assert.deepEqual(ids, ['CONTRAST-001', 'HIT-002', 'SPACING-001', 'TOKEN-003', 'TOKEN-003', 'TOKEN-004', 'TOKEN-004', 'TOKEN-004', 'TOKEN-004']);
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
  assert.equal(check(ir, builtin, { layers: [1] }).length, 9);
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

const accentRoot = (children: string[]): RawNode => ({
  id: 'root', name: 'Root', type: 'FRAME', path: 'Root', parent: null,
  box: { x: 0, y: 0, w: 100, h: 100 }, children,
});
const accentCard = (id: string, fill: string): RawNode => ({
  id, name: 'Card', type: 'FRAME', path: `Root/${id}`, parent: 'root',
  box: { x: 0, y: 0, w: 50, h: 50 }, children: [], fill: { value: fill, token: null },
});

test('SLOP-DIFFUSE-ACCENT fires on three or more distinct saturated accent fills', () => {
  const ir = normalize({ nodes: [
    accentRoot(['a', 'b', 'c']),
    accentCard('a', '#2E5AAC'), // blue ~219
    accentCard('b', '#7B4BB7'), // purple ~267
    accentCard('c', '#1F8A8A'), // teal ~180
  ] });
  const v = check(ir, builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-DIFFUSE-ACCENT'), 'expected SLOP-DIFFUSE-ACCENT on 3 accent hue families');
});

test('SLOP-DIFFUSE-ACCENT does not fire on one accent plus status colours and neutrals', () => {
  const ir = normalize({ nodes: [
    accentRoot(['a', 'b', 'c', 'd', 'e']),
    accentCard('a', '#2E5AAC'), // one accent (blue)
    accentCard('b', '#C0392B'), // status red — excluded
    accentCard('c', '#2E8B57'), // status green — excluded
    accentCard('d', '#F7F3EC'), // cream neutral — excluded
    accentCard('e', '#1A1A1A'), // near-black — excluded
  ] });
  const v = check(ir, builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-DIFFUSE-ACCENT'), 'one accent + status + neutrals must not fire');
});

const richText = (id: string, over: Partial<RawNode>): RawNode => ({
  id, name: 'T', type: 'TEXT', path: `Root/${id}`, parent: 'root',
  box: { x: 0, y: 0, w: 320, h: 20 }, children: [], text: 'Some readable body text here.', ...over,
});
const runSlop = (nodes: RawNode[]) => check(normalize({ nodes }), builtin, { categories: ['slop'] });
const runA11y = (nodes: RawNode[]) => check(normalize({ nodes }), builtin, { categories: ['a11y'] });

test('SLOP-FONT-CIRCUS fires at four or more distinct font families, not three', () => {
  const four = runSlop([accentRoot(['a', 'b', 'c', 'd']),
    richText('a', { fontFamily: 'inter' }), richText('b', { fontFamily: 'georgia' }),
    richText('c', { fontFamily: 'jetbrains mono' }), richText('d', { fontFamily: 'arial' })]);
  assert.ok(four.some((x) => x.id === 'SLOP-FONT-CIRCUS'), 'four families should fire');
  const three = runSlop([accentRoot(['a', 'b', 'c']),
    richText('a', { fontFamily: 'inter' }), richText('b', { fontFamily: 'georgia' }),
    richText('c', { fontFamily: 'jetbrains mono' })]);
  assert.ok(!three.some((x) => x.id === 'SLOP-FONT-CIRCUS'), 'text + display + mono (three) must not fire');
});

test('SLOP-JUSTIFIED-TEXT fires on a justified prose block, not on left-aligned', () => {
  const long = 'This is a real paragraph of body copy long enough to justify.';
  const yes = runSlop([accentRoot(['a']), richText('a', { text: long, textAlign: 'justify' })]);
  assert.ok(yes.some((x) => x.id === 'SLOP-JUSTIFIED-TEXT'));
  const no = runSlop([accentRoot(['a']), richText('a', { text: long, textAlign: 'left' })]);
  assert.ok(!no.some((x) => x.id === 'SLOP-JUSTIFIED-TEXT'));
});

test('SLOP-TINY-TEXT fires on sub-11px prose, not on mid-teens body', () => {
  const long = 'This is a body sentence with more than thirty characters of prose.';
  const yes = runSlop([accentRoot(['a']), richText('a', { text: long, fontSize: 9 })]);
  assert.ok(yes.some((x) => x.id === 'SLOP-TINY-TEXT'));
  const no = runSlop([accentRoot(['a']), richText('a', { text: long, fontSize: 14 })]);
  assert.ok(!no.some((x) => x.id === 'SLOP-TINY-TEXT'));
});

test('A11Y-HEADING-SKIP fires on a skipped heading level, not on a contiguous outline', () => {
  const skip = runA11y([accentRoot(['a', 'b']),
    richText('a', { heading: 1, text: 'Title' }), richText('b', { heading: 3, text: 'Sub' })]);
  assert.ok(skip.some((x) => x.id === 'A11Y-HEADING-SKIP'));
  const ok = runA11y([accentRoot(['a', 'b', 'c']),
    richText('a', { heading: 1 }), richText('b', { heading: 2 }), richText('c', { heading: 3 })]);
  assert.ok(!ok.some((x) => x.id === 'A11Y-HEADING-SKIP'));
});

test('SLOP-TIGHT-LEADING fires on a crammed paragraph, not on well-led body', () => {
  const para = 'This is a genuinely long paragraph of body copy, long enough to exceed eighty characters and need real leading.';
  const tight = runSlop([accentRoot(['a']), richText('a', { text: para, lineHeight: 1.15 })]);
  assert.ok(tight.some((x) => x.id === 'SLOP-TIGHT-LEADING'));
  const roomy = runSlop([accentRoot(['a']), richText('a', { text: para, lineHeight: 1.5 })]);
  assert.ok(!roomy.some((x) => x.id === 'SLOP-TIGHT-LEADING'));
});

test('TOKEN-004 fires on a hardcoded radius, not on a tokenised one', () => {
  const frame = (id: string, over: Partial<RawNode>): RawNode => ({
    id, name: 'Card', type: 'FRAME', path: `Root/${id}`, parent: 'root',
    box: { x: 0, y: 0, w: 50, h: 50 }, children: [], ...over,
  });
  const sys = (nodes: RawNode[]) => check(normalize({ nodes }), builtin, { categories: ['system'] });
  const hard = sys([accentRoot(['a']), frame('a', { radius: { value: 10, token: null } })]);
  assert.ok(hard.some((x) => x.id === 'TOKEN-004'), 'untokenised radius fires');
  const soft = sys([accentRoot(['a']), frame('a', { radius: { value: 10, token: 'radius-md' } })]);
  assert.ok(!soft.some((x) => x.id === 'TOKEN-004'), 'tokenised radius silent');
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
    'This page is not a hypothetical demo.',
    "It is not a mockup.",
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
    '이 페이지는 가상 데모가 아닙니다.',
    '목업이 아니에요.',
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

test('KO-KEEP-ALL is absent because Korean wrapping requires contextual typography proof', () => {
  for (const wordBreak of ['normal', 'keep-all']) {
    const ir = makeTextIr('동시접속 확인했어요');
    ir.nodes[0]!.wordBreak = wordBreak;
    assert.ok(!check(ir, builtin, { categories: ['a11y'] }).some((x) => x.id === 'KO-KEEP-ALL'));
  }
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

// ── visual-tell rules ─────────────────────────────────────────────────────────

// Helpers for structural slop tests
function makeRootNode(overrides: Partial<RawNode> = {}): RawNode {
  return {
    id: 'root',
    name: 'Root',
    type: 'FRAME',
    path: 'Root',
    parent: null,
    box: { x: 0, y: 0, w: 1280, h: 800 },
    children: [],
    ...overrides,
  };
}

function makeChildNode(parentId: string, overrides: Partial<RawNode> = {}, idx = 0): RawNode {
  return {
    id: `child${idx}`,
    name: `Child${idx}`,
    type: 'FRAME',
    path: `Root/Child${idx}`,
    parent: parentId,
    box: { x: 0, y: idx * 50, w: 200, h: 40 },
    children: [],
    ...overrides,
  };
}

// ── SLOP-EMOJI-HEADING widened to interactive nodes ───────────────────────────

test('SLOP-EMOJI-HEADING fires on interactive nodes (buttons) that open with an emoji', () => {
  const node: RawNode = {
    id: 'btn1', name: 'CTA', type: 'TEXT', path: 'Screen/CTA',
    parent: null, box: { x: 0, y: 0, w: 160, h: 48 }, children: [],
    text: '🚀 Get Started', interactive: true,
  };
  const v = check(normalize({ nodes: [node] }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-EMOJI-HEADING'), 'expected SLOP-EMOJI-HEADING on emoji-prefixed button');
});

test('SLOP-EMOJI-HEADING does not fire on a button with a plain arrow (not emoji)', () => {
  const node: RawNode = {
    id: 'btn2', name: 'CTA', type: 'TEXT', path: 'Screen/CTA',
    parent: null, box: { x: 0, y: 0, w: 160, h: 48 }, children: [],
    text: '→ View all', interactive: true,
  };
  const v = check(normalize({ nodes: [node] }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-EMOJI-HEADING'), 'unexpected SLOP-EMOJI-HEADING for arrow-prefixed button');
});

// ── SLOP-COPY widened phrases ─────────────────────────────────────────────────

test('SLOP-COPY fires on new widened AI stock phrases', () => {
  const positives = [
    'Say goodbye to manual work.',
    'Blazing fast performance for every team.',
    "It's not just software, it's a platform.",
  ];
  for (const text of positives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-COPY'), `expected SLOP-COPY for: ${text}`);
  }
});

test('SLOP-COPY does not fire on legitimate uses of similar words', () => {
  const negatives = [
    // "goodbye" in a natural sentence
    'We said goodbye to our old architecture in 2023.',
    // "fast" without "blazing"
    'Renders in under 200ms on a fast connection.',
  ];
  for (const text of negatives) {
    const v = check(makeTextIr(text), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-COPY'), `unexpected SLOP-COPY for: ${text}`);
  }
});

// ── SLOP-GRADIENT-TEXT ────────────────────────────────────────────────────────

test('SLOP-GRADIENT-TEXT fires when a node has clipText: true', () => {
  const node: RawNode = {
    id: 'heading1', name: 'Hero', type: 'TEXT', path: 'Screen/Hero',
    parent: null, box: { x: 0, y: 0, w: 600, h: 80 }, children: [],
    text: 'The future of design',
    gradient: 'linear-gradient(135deg, #6366f1, #a855f7)',
    clipText: true,
  };
  const v = check(normalize({ nodes: [node] }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-GRADIENT-TEXT'), 'expected SLOP-GRADIENT-TEXT for clipText node');
});

test('SLOP-GRADIENT-TEXT does not fire when clipText is absent', () => {
  const node: RawNode = {
    id: 'hero1', name: 'HeroBg', type: 'FRAME', path: 'Screen/HeroBg',
    parent: null, box: { x: 0, y: 0, w: 600, h: 300 }, children: [],
    gradient: 'linear-gradient(135deg, #6366f1, #a855f7)',
  };
  const v = check(normalize({ nodes: [node] }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-GRADIENT-TEXT'), 'unexpected SLOP-GRADIENT-TEXT without clipText');
});

// ── SLOP-FAKE-STAT ────────────────────────────────────────────────────────────

test('SLOP-FAKE-STAT fires when two or more heroic stat patterns appear on the page', () => {
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n1', 'n2', 'n3'] }),
    makeChildNode('root', { id: 'n1', type: 'TEXT', text: '10k+ users worldwide', box: { x: 0, y: 0, w: 200, h: 40 } }, 1),
    makeChildNode('root', { id: 'n2', type: 'TEXT', text: '24/7 support included', box: { x: 200, y: 0, w: 200, h: 40 } }, 2),
    makeChildNode('root', { id: 'n3', type: 'TEXT', text: 'Ships in 48h', box: { x: 400, y: 0, w: 200, h: 40 } }, 3),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-FAKE-STAT'), 'expected SLOP-FAKE-STAT for two+ stat patterns');
});

test('SLOP-FAKE-STAT does not fire when only one stat pattern is present', () => {
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n1'] }),
    makeChildNode('root', { id: 'n1', type: 'TEXT', text: '99.9% uptime SLA', box: { x: 0, y: 0, w: 200, h: 40 } }, 1),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-FAKE-STAT'), 'unexpected SLOP-FAKE-STAT for single stat');
});

test('SLOP-FAKE-STAT does not fire on ordinary numeric copy', () => {
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n1', 'n2'] }),
    makeChildNode('root', { id: 'n1', type: 'TEXT', text: '847 teams migrated in Q1', box: { x: 0, y: 0, w: 300, h: 40 } }, 1),
    makeChildNode('root', { id: 'n2', type: 'TEXT', text: 'Released January 12, 2025', box: { x: 0, y: 50, w: 300, h: 40 } }, 2),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-FAKE-STAT'), 'unexpected SLOP-FAKE-STAT for ordinary numbers');
});

// ── SLOP-OVERSIZED-SHADOW ─────────────────────────────────────────────────────

test('SLOP-OVERSIZED-SHADOW fires when shadow blur ≥40px on a small node', () => {
  // 30×30 icon with 60px blur — blur > element size
  const node: RawNode = {
    id: 'icon1', name: 'Icon', type: 'FRAME', path: 'Screen/Icon',
    parent: null, box: { x: 0, y: 0, w: 30, h: 30 }, children: [],
    shadow: { value: 'rgba(0, 0, 0, 0.2) 0px 0px 60px 0px', token: null },
  };
  const v = check(normalize({ nodes: [node] }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-OVERSIZED-SHADOW'), 'expected SLOP-OVERSIZED-SHADOW for huge blur on small node');
});

test('SLOP-OVERSIZED-SHADOW does not fire when blur is proportional to element size', () => {
  // 300×200 card with 8px blur — proportionate
  const node: RawNode = {
    id: 'card1', name: 'Card', type: 'FRAME', path: 'Screen/Card',
    parent: null, box: { x: 0, y: 0, w: 300, h: 200 }, children: [],
    shadow: { value: 'rgba(0, 0, 0, 0.1) 0px 4px 8px 0px', token: null },
  };
  const v = check(normalize({ nodes: [node] }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-OVERSIZED-SHADOW'), 'unexpected SLOP-OVERSIZED-SHADOW for proportionate shadow');
});

test('SLOP-OVERSIZED-SHADOW does not fire when blur is large but node is large', () => {
  // 400×400 hero section with 40px blur — blur equals smaller dimension, but smaller is 400
  const node: RawNode = {
    id: 'hero1', name: 'Hero', type: 'FRAME', path: 'Screen/Hero',
    parent: null, box: { x: 0, y: 0, w: 400, h: 400 }, children: [],
    shadow: { value: 'rgba(0, 0, 0, 0.15) 0px 8px 40px 0px', token: null },
  };
  const v = check(normalize({ nodes: [node] }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-OVERSIZED-SHADOW'), 'unexpected SLOP-OVERSIZED-SHADOW when blur < smaller dimension');
});

// ── SLOP-NESTED-CARDS ─────────────────────────────────────────────────────────

test('SLOP-NESTED-CARDS fires when a surfaced node sits inside another surfaced node', () => {
  const outerCard: RawNode = {
    id: 'outer', name: 'OuterCard', type: 'FRAME', path: 'Screen/OuterCard',
    parent: null, box: { x: 0, y: 0, w: 320, h: 240 }, children: ['inner'],
    radius: { value: 16, token: null },
    shadow: { value: 'rgba(0, 0, 0, 0.1) 0px 4px 16px 0px', token: null },
  };
  const innerCard: RawNode = {
    id: 'inner', name: 'InnerCard', type: 'FRAME', path: 'Screen/OuterCard/InnerCard',
    parent: 'outer', box: { x: 16, y: 16, w: 288, h: 208 }, children: [],
    radius: { value: 8, token: null },
    shadow: { value: 'rgba(0, 0, 0, 0.05) 0px 2px 8px 0px', token: null },
  };
  const v = check(normalize({ nodes: [outerCard, innerCard] }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-NESTED-CARDS'), 'expected SLOP-NESTED-CARDS for surfaced node inside surfaced parent');
});

test('SLOP-NESTED-CARDS does not fire when the inner node has no shadow', () => {
  const outerCard: RawNode = {
    id: 'outer', name: 'Card', type: 'FRAME', path: 'Screen/Card',
    parent: null, box: { x: 0, y: 0, w: 320, h: 240 }, children: ['inner'],
    radius: { value: 16, token: null },
    shadow: { value: 'rgba(0, 0, 0, 0.1) 0px 4px 16px 0px', token: null },
  };
  const innerContent: RawNode = {
    id: 'inner', name: 'CardContent', type: 'FRAME', path: 'Screen/Card/CardContent',
    parent: 'outer', box: { x: 16, y: 16, w: 288, h: 208 }, children: [],
    radius: { value: 8, token: null },
    // no shadow — not a surfaced card
  };
  const v = check(normalize({ nodes: [outerCard, innerContent] }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-NESTED-CARDS'), 'unexpected SLOP-NESTED-CARDS when inner has no shadow');
});

// ── SLOP-NESTED-RADIUS ────────────────────────────────────────────────────────

test('SLOP-NESTED-RADIUS fires when child radius ≥ parent radius and parent has padding', () => {
  const parent: RawNode = {
    id: 'card', name: 'Card', type: 'FRAME', path: 'Screen/Card',
    parent: null, box: { x: 0, y: 0, w: 320, h: 200 }, children: ['inner'],
    radius: { value: 16, token: null },
    layout: { mode: 'VERTICAL', gap: 0, padding: [16, 16, 16, 16] },
  };
  const child: RawNode = {
    id: 'inner', name: 'InnerButton', type: 'FRAME', path: 'Screen/Card/InnerButton',
    parent: 'card', box: { x: 16, y: 16, w: 288, h: 48 }, children: [],
    radius: { value: 16, token: null }, // same as parent — wrong
  };
  const v = check(normalize({ nodes: [parent, child] }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-NESTED-RADIUS'), 'expected SLOP-NESTED-RADIUS for same-radius child in padded parent');
});

test('SLOP-NESTED-RADIUS does not fire when child radius is smaller than parent', () => {
  const parent: RawNode = {
    id: 'card', name: 'Card', type: 'FRAME', path: 'Screen/Card',
    parent: null, box: { x: 0, y: 0, w: 320, h: 200 }, children: ['inner'],
    radius: { value: 16, token: null },
    layout: { mode: 'VERTICAL', gap: 0, padding: [16, 16, 16, 16] },
  };
  const child: RawNode = {
    id: 'inner', name: 'InnerButton', type: 'FRAME', path: 'Screen/Card/InnerButton',
    parent: 'card', box: { x: 16, y: 16, w: 288, h: 48 }, children: [],
    radius: { value: 6, token: null }, // smaller — correct
  };
  const v = check(normalize({ nodes: [parent, child] }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-NESTED-RADIUS'), 'unexpected SLOP-NESTED-RADIUS when child radius is smaller');
});

test('SLOP-NESTED-RADIUS does not fire when parent has no padding', () => {
  // A child positioned adjacent to (not inset in) its parent: padding=0 means no inset
  const parent: RawNode = {
    id: 'card', name: 'Card', type: 'FRAME', path: 'Screen/Card',
    parent: null, box: { x: 0, y: 0, w: 320, h: 200 }, children: ['inner'],
    radius: { value: 16, token: null },
    // no layout/padding
  };
  const child: RawNode = {
    id: 'inner', name: 'InnerElement', type: 'FRAME', path: 'Screen/Card/InnerElement',
    parent: 'card', box: { x: 0, y: 0, w: 320, h: 200 }, children: [],
    radius: { value: 16, token: null },
  };
  const v = check(normalize({ nodes: [parent, child] }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-NESTED-RADIUS'), 'unexpected SLOP-NESTED-RADIUS when parent has no padding');
});

// ── SLOP-MONO-SPACING ─────────────────────────────────────────────────────────

test('SLOP-MONO-SPACING fires when one spacing value dominates ≥80% of 20+ samples', () => {
  // 6 nodes each with padding [16,16,16,16] = 24 samples at value 16 (100% domination)
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'] }),
    ...[0, 1, 2, 3, 4, 5].map((i) => makeChildNode('root', {
      id: `n${i}`,
      layout: { mode: 'VERTICAL', gap: 0, padding: [16, 16, 16, 16] },
    }, i)),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-MONO-SPACING'), 'expected SLOP-MONO-SPACING for 24-sample 16px monoculture');
});

test('SLOP-MONO-SPACING does not fire when spacing is varied', () => {
  // Nodes with different padding values — no single value dominates
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'] }),
    ...[
      [8, 8, 8, 8],
      [16, 16, 16, 16],
      [24, 24, 24, 24],
      [32, 32, 32, 32],
      [8, 16, 8, 16],
      [16, 32, 16, 32],
    ].map((padding, i) => makeChildNode('root', {
      id: `n${i}`,
      layout: { mode: 'VERTICAL', gap: 0, padding: padding as [number, number, number, number] },
    }, i)),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-MONO-SPACING'), 'unexpected SLOP-MONO-SPACING for varied spacing');
});

test('SLOP-MONO-SPACING does not fire on pages with fewer than 20 spacing samples', () => {
  // Only 2 nodes with padding = 8 samples
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n0', 'n1'] }),
    makeChildNode('root', { id: 'n0', layout: { mode: 'VERTICAL', gap: 0, padding: [16, 16, 16, 16] } }, 0),
    makeChildNode('root', { id: 'n1', layout: { mode: 'VERTICAL', gap: 0, padding: [16, 16, 16, 16] } }, 1),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-MONO-SPACING'), 'unexpected SLOP-MONO-SPACING for <20 spacing samples');
});

// ── SLOP-GLASSMORPHISM ────────────────────────────────────────────────────────

test('SLOP-GLASSMORPHISM fires when three or more nodes have backdrop-filter blur', () => {
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n0', 'n1', 'n2'] }),
    makeChildNode('root', { id: 'n0', backdropFilter: 'blur(20px)' }, 0),
    makeChildNode('root', { id: 'n1', backdropFilter: 'blur(16px)' }, 1),
    makeChildNode('root', { id: 'n2', backdropFilter: 'blur(12px)' }, 2),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-GLASSMORPHISM'), 'expected SLOP-GLASSMORPHISM for 3 blur nodes');
});

test('SLOP-GLASSMORPHISM does not fire for a single glassmorphism node', () => {
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n0'] }),
    makeChildNode('root', { id: 'n0', backdropFilter: 'blur(20px)' }, 0),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-GLASSMORPHISM'), 'unexpected SLOP-GLASSMORPHISM for single blur node');
});

test('SLOP-GLASSMORPHISM does not fire when backdropFilter is present but not blur', () => {
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n0', 'n1', 'n2'] }),
    makeChildNode('root', { id: 'n0', backdropFilter: 'brightness(0.8)' }, 0),
    makeChildNode('root', { id: 'n1', backdropFilter: 'contrast(1.2)' }, 1),
    makeChildNode('root', { id: 'n2', backdropFilter: 'saturate(1.5)' }, 2),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-GLASSMORPHISM'), 'unexpected SLOP-GLASSMORPHISM for non-blur backdropFilter');
});

// ── SLOP-BADGE-SPAM ───────────────────────────────────────────────────────────

test('SLOP-BADGE-SPAM fires on small nodes whose text is solely a badge term', () => {
  const badgeTexts = ['New', 'Beta', '🔥 Hot', 'Popular', 'trending', 'Pro', 'Soon'];
  for (const text of badgeTexts) {
    const node: RawNode = {
      id: 'badge1', name: 'Badge', type: 'TEXT', path: 'Screen/Badge',
      parent: null, box: { x: 0, y: 0, w: 60, h: 24 }, children: [], text,
    };
    const v = check(normalize({ nodes: [node] }), builtin, { categories: ['slop'] });
    assert.ok(v.some((x) => x.id === 'SLOP-BADGE-SPAM'), `expected SLOP-BADGE-SPAM for: ${text}`);
  }
});

test('SLOP-BADGE-SPAM does not fire on regular navigation or content text', () => {
  const negatives = [
    // nav items that contain badge-like words but in context
    'See what is new in v2.0',
    'Professional plan includes all features',
    'This is a beta test environment for internal use',
    // short labels that are not manufactured buzz
    'Save', 'Cancel', 'View all', '3 items',
  ];
  for (const text of negatives) {
    const node: RawNode = {
      id: 'label1', name: 'Label', type: 'TEXT', path: 'Screen/Label',
      parent: null, box: { x: 0, y: 0, w: 200, h: 24 }, children: [], text,
    };
    const v = check(normalize({ nodes: [node] }), builtin, { categories: ['slop'] });
    assert.ok(!v.some((x) => x.id === 'SLOP-BADGE-SPAM'), `unexpected SLOP-BADGE-SPAM for: ${text}`);
  }
});

test('SLOP-BADGE-SPAM does not fire on taller nodes (not badge-sized)', () => {
  // A section heading that says "What is New" — tall enough that it is not a badge
  const node: RawNode = {
    id: 'h2', name: 'SectionHeading', type: 'TEXT', path: 'Screen/SectionHeading',
    parent: null, box: { x: 0, y: 0, w: 400, h: 48 }, children: [],
    text: 'New', heading: 2,
  };
  const v = check(normalize({ nodes: [node] }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-BADGE-SPAM'), 'unexpected SLOP-BADGE-SPAM on tall heading node');
});

// ── SLOP-FLAT-TYPE ────────────────────────────────────────────────────────────

test('SLOP-FLAT-TYPE fires when three or more font sizes cluster in the 13–19px band', () => {
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n0', 'n1', 'n2', 'n3'] }),
    ...[13, 14, 16, 18].map((fs, i) => makeChildNode('root', {
      id: `n${i}`, type: 'TEXT' as const,
      text: `Text at ${fs}px`, fontSize: fs,
    }, i)),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-FLAT-TYPE'), 'expected SLOP-FLAT-TYPE for 13/14/16/18px flat hierarchy');
});

test('SLOP-FLAT-TYPE fires when adjacent scale steps differ by less than 1.15×', () => {
  // Sizes 20, 22, 24 — ratio ≈ 1.10, below the 1.15 threshold
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n0', 'n1', 'n2'] }),
    ...[20, 22, 24].map((fs, i) => makeChildNode('root', {
      id: `n${i}`, type: 'TEXT' as const,
      text: `Text at ${fs}px`, fontSize: fs,
    }, i)),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-FLAT-TYPE'), 'expected SLOP-FLAT-TYPE for 20/22/24px flat scale');
});

test('SLOP-FLAT-TYPE does not fire when the type scale has good separation', () => {
  // 14/18/28px — ratio 1.29 and 1.56, both above 1.15
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n0', 'n1', 'n2'] }),
    ...[14, 18, 28].map((fs, i) => makeChildNode('root', {
      id: `n${i}`, type: 'TEXT' as const,
      text: `Text at ${fs}px`, fontSize: fs,
    }, i)),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-FLAT-TYPE'), 'unexpected SLOP-FLAT-TYPE for 14/18/28px well-separated scale');
});

test('SLOP-FLAT-TYPE does not fire on pages with fewer than three distinct font sizes', () => {
  // A page with only two text sizes — intentionally minimal, not a hierarchy failure
  const nodes: RawNode[] = [
    makeRootNode({ children: ['n0', 'n1'] }),
    makeChildNode('root', { id: 'n0', type: 'TEXT', text: 'Heading', fontSize: 16 }, 0),
    makeChildNode('root', { id: 'n1', type: 'TEXT', text: 'Body', fontSize: 14 }, 1),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(!v.some((x) => x.id === 'SLOP-FLAT-TYPE'), 'unexpected SLOP-FLAT-TYPE for two-size page');
});

// ── SLOP-FLAT-STACK ───────────────────────────────────────────────────────────
const flatStackNodes = (over: { fills?: string[]; maxText?: number } = {}): RawNode[] => {
  const fills = over.fills ?? ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'];
  const sections = fills.map((f, i) => makeChildNode('root', {
    id: `sec${i}`, type: 'FRAME', box: { x: 0, y: i * 520, w: 1280, h: 500 }, fill: { value: f, token: null },
  }, i));
  const textSizes = [over.maxText ?? 36, 16, 16, 16, 16, 16, 16, 16];
  const texts = textSizes.map((fs, i) => makeChildNode('root', {
    id: `t${i}`, type: 'TEXT', text: `Section copy line number ${i}`, fontSize: fs, box: { x: 0, y: i * 30, w: 480, h: 24 },
  }, i + 20));
  const root = makeRootNode({ children: [...sections.map((s) => s.id), ...texts.map((t) => t.id)], box: { x: 0, y: 0, w: 1280, h: 2100 } });
  return [root, ...sections, ...texts];
};

test('SLOP-FLAT-STACK fires on a tall single-background stack with no display-scale type', () => {
  const v = runSlop(flatStackNodes());
  assert.ok(v.some((x) => x.id === 'SLOP-FLAT-STACK'), 'expected SLOP-FLAT-STACK on a flat uniform stack');
});

test('SLOP-FLAT-STACK does not fire when a section inversion is present', () => {
  const v = runSlop(flatStackNodes({ fills: ['#FFFFFF', '#111111', '#FFFFFF', '#111111'] }));
  assert.ok(!v.some((x) => x.id === 'SLOP-FLAT-STACK'), 'two section backgrounds (inversion) should not fire');
});

test('SLOP-FLAT-STACK does not fire when a display-scale type moment is present', () => {
  const v = runSlop(flatStackNodes({ maxText: 72 })); // 72/16 = 4.5x, well above the 3x floor
  assert.ok(!v.some((x) => x.id === 'SLOP-FLAT-STACK'), 'a display-scale headline should not fire');
});

test('SLOP-FLAT-STACK does not fire on a short single-viewport page', () => {
  const root = makeRootNode({ children: ['sec0'], box: { x: 0, y: 0, w: 1280, h: 700 } });
  const sec = makeChildNode('root', { id: 'sec0', type: 'FRAME', box: { x: 0, y: 0, w: 1280, h: 500 }, fill: { value: '#FFFFFF', token: null } }, 0);
  const v = runSlop([root, sec]);
  assert.ok(!v.some((x) => x.id === 'SLOP-FLAT-STACK'), 'a short page (pageH < 2000) should not fire');
});
// ── SLOP-COLORLESS ────────────────────────────────────────────────────────────
test('SLOP-COLORLESS fires on a tall multi-tone page with an all-neutral fill palette', () => {
  const v = runSlop(flatStackNodes({ fills: ['#FFFFFF', '#111111', '#F4F4F5', '#E5E5E5'] }));
  assert.ok(v.some((x) => x.id === 'SLOP-COLORLESS'), 'expected SLOP-COLORLESS on an all-neutral white/black/grey palette');
});
test('SLOP-COLORLESS does not fire when a committed chromatic fill is present', () => {
  const v = runSlop(flatStackNodes({ fills: ['#FFFFFF', '#111111', '#2E5AAC', '#FFFFFF'] }));
  assert.ok(!v.some((x) => x.id === 'SLOP-COLORLESS'), 'a chromatic fill means the page committed a colour');
});
test('SLOP-COLORLESS does not fire on a short page or a thin (<3) palette', () => {
  const shortRoot = makeRootNode({ children: ['s0', 's1', 's2'], box: { x: 0, y: 0, w: 1280, h: 700 } });
  const shortSecs = ['#FFFFFF', '#111111', '#E5E5E5'].map((f, i) => makeChildNode('root', { id: `s${i}`, type: 'FRAME', box: { x: 0, y: i * 200, w: 1280, h: 180 }, fill: { value: f, token: null } }, i));
  assert.ok(!runSlop([shortRoot, ...shortSecs]).some((x) => x.id === 'SLOP-COLORLESS'), 'a short page (pageH < 1500) must not fire');
  assert.ok(!runSlop(flatStackNodes({ fills: ['#FFFFFF', '#111111'] })).some((x) => x.id === 'SLOP-COLORLESS'), 'a two-tone palette (< 3 fills) must not fire');
});
// ── SLOP-ORNAMENT-GLYPH ───────────────────────────────────────────────────────
test('SLOP-ORNAMENT-GLYPH fires on two or more distinct geometric-shape marker glyphs', () => {
  const nodes: RawNode[] = [
    accentRoot(['a', 'b', 'c']),
    richText('a', { text: '◆ 사용자용 스킬 6개' }),
    richText('b', { text: '◇ 내부 파이프라인 에이전트 9개' }),
    richText('c', { text: '▪ 디자인 이론 팩' }),
  ];
  const v = check(normalize({ nodes }), builtin, { categories: ['slop'] });
  assert.ok(v.some((x) => x.id === 'SLOP-ORNAMENT-GLYPH'), 'expected SLOP-ORNAMENT-GLYPH on assorted geometric markers');
});
test('SLOP-ORNAMENT-GLYPH does not fire on one consistent marker or functional arrows', () => {
  const consistent: RawNode[] = [
    accentRoot(['a', 'b']),
    richText('a', { text: '◆ First feature' }),
    richText('b', { text: '◆ Second feature' }),
  ];
  assert.ok(!check(normalize({ nodes: consistent }), builtin, { categories: ['slop'] }).some((x) => x.id === 'SLOP-ORNAMENT-GLYPH'), 'one consistent marker glyph must not fire');
  const arrows: RawNode[] = [
    accentRoot(['a', 'b']),
    richText('a', { text: '→ View all' }),
    richText('b', { text: '↗ Learn more' }),
  ];
  assert.ok(!check(normalize({ nodes: arrows }), builtin, { categories: ['slop'] }).some((x) => x.id === 'SLOP-ORNAMENT-GLYPH'), 'functional arrows (U+2190–21FF) must not fire');
});
