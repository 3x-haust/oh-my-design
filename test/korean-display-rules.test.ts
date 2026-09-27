import assert from 'node:assert/strict';
import test from 'node:test';
import { normalize } from '../core/ir/normalize.ts';
import { check, loadRules } from '../core/rules/engine.ts';
import type { RawNode } from '../core/types.ts';

const builtin = loadRules(new URL('../core/rules/builtin/', import.meta.url).pathname);

function koreanText(overrides: Partial<RawNode> = {}): RawNode {
  return {
    id: 'text', name: 'h1', type: 'TEXT', path: 'body/h1', parent: null,
    box: { x: 0, y: 0, w: 320, h: 120 }, children: [],
    text: '오늘의 감각을 다시 발견합니다',
    ...overrides,
  };
}

const koreanViolations = (node: RawNode) =>
  check(normalize({ nodes: [node] }), builtin, { categories: ['a11y'] })
    .filter((violation) => violation.id.startsWith('KO-'));

test('Korean display rules do not require keep-all or balance declarations', () => {
  assert.deepEqual(koreanViolations(koreanText({ displayText: true, wordBreak: 'normal', textWrap: 'wrap' })), []);
  assert.deepEqual(koreanViolations(koreanText({ displayText: true, wordBreak: 'keep-all', textWrap: 'balance' })), []);
});

test('KO-MIDWORD-WRAP flags an actual Korean line boundary inside a word', () => {
  const violations = koreanViolations(koreanText({
    name: 'p', text: '동시접속 확인',
    textLines: [
      { graphemes: [{ text: '동시접', box: { x: 0, y: 0, w: 90, h: 24 } }] },
      { graphemes: [{ text: '속 확인', box: { x: 0, y: 24, w: 90, h: 24 } }] },
    ],
  }));
  assert.ok(violations.some((violation) => violation.id === 'KO-MIDWORD-WRAP'));
});

test('KO-MIDWORD-WRAP allows a rendered boundary at Korean whitespace', () => {
  assert.deepEqual(koreanViolations(koreanText({
    name: 'p', text: '동시접속 확인',
    textLines: [
      { graphemes: [{ text: '동시접속 ', box: { x: 0, y: 0, w: 100, h: 24 } }] },
      { graphemes: [{ text: '확인', box: { x: 0, y: 24, w: 50, h: 24 } }] },
    ],
  })), []);
});

test('KO-CONTROL-WRAP flags a short wrapped Korean tab-stop label', () => {
  const violations = koreanViolations(koreanText({
    interactive: true, text: '설정 저장',
    textLines: [
      { graphemes: [{ text: '설정 ', box: { x: 0, y: 0, w: 50, h: 24 } }] },
      { graphemes: [{ text: '저장', box: { x: 0, y: 24, w: 50, h: 24 } }] },
    ],
  }));
  assert.ok(violations.some((violation) => violation.id === 'KO-CONTROL-WRAP'));
});

test('KO-CONTROL-WRAP allows a one-line Korean control label', () => {
  assert.deepEqual(koreanViolations(koreanText({
    interactive: true, text: '설정 저장',
    textLines: [{ graphemes: [{ text: '설정 저장', box: { x: 0, y: 0, w: 100, h: 24 } }] }],
  })), []);
});

test('KO-DISPLAY-ORPHAN flags a one-syllable final heading line', () => {
  const violations = koreanViolations(koreanText({
    displayText: true, heading: 1,
    textLines: [
      { graphemes: [{ text: '오늘의 감각 ', box: { x: 0, y: 0, w: 180, h: 40 } }] },
      { graphemes: [
        { text: '빛', box: { x: 0, y: 40, w: 32, h: 40 } },
        { text: '!', box: { x: 32, y: 40, w: 10, h: 40 } },
      ] },
    ],
  }));
  assert.ok(violations.some((violation) => violation.id === 'KO-DISPLAY-ORPHAN'));
});

test('KO-DISPLAY-ORPHAN ignores body copy and multi-syllable final heading lines', () => {
  for (const node of [
    koreanText({ name: 'p', textLines: [
      { graphemes: [{ text: '오늘의 감각 ', box: { x: 0, y: 0, w: 180, h: 40 } }] },
      { graphemes: [{ text: '빛', box: { x: 0, y: 40, w: 32, h: 40 } }] },
    ] }),
    koreanText({ heading: 2, textLines: [
      { graphemes: [{ text: '오늘의 감각 ', box: { x: 0, y: 0, w: 180, h: 40 } }] },
      { graphemes: [
        { text: '새', box: { x: 0, y: 40, w: 32, h: 40 } },
        { text: '빛', box: { x: 32, y: 40, w: 32, h: 40 } },
      ] },
    ] }),
  ]) {
    assert.ok(!koreanViolations(node).some((violation) => violation.id === 'KO-DISPLAY-ORPHAN'));
  }
});

test('KO-TEXT-CLIP flags Korean copy lost by a clipping ancestor', () => {
  const parent: RawNode = {
    id: 'parent', name: 'section', type: 'FRAME', path: 'body/section', parent: null,
    box: { x: 0, y: 0, w: 320, h: 80 }, children: ['text'], overflow: 'hidden',
  };
  const child = koreanText({ parent: 'parent', box: { x: 0, y: 0, w: 320, h: 120 } });
  const violations = check(normalize({ nodes: [parent, child] }), builtin, { categories: ['a11y'] });
  assert.ok(violations.some((violation) => violation.id === 'KO-TEXT-CLIP'));
});

test('KO-TEXT-CLIP stays clear when Korean copy fits its clipping ancestor', () => {
  const parent: RawNode = {
    id: 'parent', name: 'section', type: 'FRAME', path: 'body/section', parent: null,
    box: { x: 0, y: 0, w: 320, h: 120 }, children: ['text'], overflow: 'hidden',
  };
  const child = koreanText({ parent: 'parent', box: { x: 0, y: 0, w: 320, h: 100 } });
  const violations = check(normalize({ nodes: [parent, child] }), builtin, { categories: ['a11y'] });
  assert.ok(!violations.some((violation) => violation.id === 'KO-TEXT-CLIP'));
});
