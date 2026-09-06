import assert from 'node:assert/strict';
import test from 'node:test';
import { normalize } from '../core/ir/normalize.ts';
import { check, loadRules } from '../core/rules/engine.ts';
import type { RawNode } from '../core/types.ts';

const builtin = loadRules(new URL('../core/rules/builtin/', import.meta.url).pathname);

function koreanText(overrides: Partial<RawNode> = {}): RawNode {
  return {
    id: 'text',
    name: 'h1',
    type: 'TEXT',
    path: 'body/h1',
    parent: null,
    box: { x: 0, y: 0, w: 320, h: 120 },
    children: [],
    text: '오늘의 감각을 다시 발견합니다',
    ...overrides,
  };
}

const koreanViolations = (node: RawNode) =>
  check(normalize({ nodes: [node] }), builtin, { categories: ['a11y'] })
    .filter((violation) => violation.id.startsWith('KO-DISPLAY-'));

test('Korean display text requires keep-all and balanced wrapping by default', () => {
  const violations = koreanViolations(koreanText({ displayText: true, wordBreak: 'normal', textWrap: 'wrap' }));
  assert.ok(violations.some((violation) => violation.id === 'KO-DISPLAY-WRAP'));

  assert.deepEqual(
    koreanViolations(koreanText({ displayText: true, wordBreak: 'keep-all', textWrap: 'balance' })),
    [],
  );
});

test('character-based Korean display wrapping needs the exact contextual override', () => {
  assert.deepEqual(
    koreanViolations(koreanText({
      displayText: true,
      koreanWrap: 'character',
      wordBreak: 'normal',
      textWrap: 'balance',
    })),
    [],
  );

  const unrecognized = {
    ...koreanText({ displayText: true, wordBreak: 'normal', textWrap: 'balance' }),
    koreanWrap: 'characters',
  } as unknown as RawNode;
  assert.ok(koreanViolations(unrecognized).some((violation) => violation.id === 'KO-DISPLAY-WRAP'));
});

test('ordinary Korean body text preserves the KLREQ contextual choice', () => {
  assert.deepEqual(
    koreanViolations(koreanText({ name: 'p', path: 'body/p', wordBreak: 'normal', textWrap: 'wrap' })),
    [],
  );
});

test('a final display line with one meaningful Korean grapheme is an orphan violation', () => {
  const violations = koreanViolations(koreanText({
    displayText: true,
    wordBreak: 'keep-all',
    textWrap: 'balance',
    textLines: [
      { graphemes: [{ text: '오늘의 감각', box: { x: 0, y: 0, w: 180, h: 40 } }] },
      {
        graphemes: [
          { text: '빛', box: { x: 0, y: 40, w: 32, h: 40 } },
          { text: '!', box: { x: 32, y: 40, w: 10, h: 40 } },
        ],
      },
    ],
  }));
  assert.ok(violations.some((violation) => violation.id === 'KO-DISPLAY-ORPHAN'));
});

test('punctuation-only final lines and multi-grapheme final lines do not false-positive', () => {
  for (const finalLine of [
    [{ text: '!', box: { x: 0, y: 40, w: 10, h: 40 } }],
    [
      { text: '새', box: { x: 0, y: 40, w: 32, h: 40 } },
      { text: '빛', box: { x: 32, y: 40, w: 32, h: 40 } },
    ],
  ]) {
    const violations = koreanViolations(koreanText({
      displayText: true,
      wordBreak: 'keep-all',
      textWrap: 'balance',
      textLines: [
        { graphemes: [{ text: '오늘의 감각', box: { x: 0, y: 0, w: 180, h: 40 } }] },
        { graphemes: finalLine },
      ],
    }));
    assert.ok(!violations.some((violation) => violation.id === 'KO-DISPLAY-ORPHAN'));
  }
});

test('Korean display checks do not replace clipping detection', () => {
  const parent: RawNode = {
    id: 'parent',
    name: 'section',
    type: 'FRAME',
    path: 'body/section',
    parent: null,
    box: { x: 0, y: 0, w: 320, h: 80 },
    children: ['text'],
    overflow: 'hidden',
  };
  const child = koreanText({
    parent: 'parent',
    displayText: true,
    wordBreak: 'keep-all',
    textWrap: 'balance',
    box: { x: 0, y: 0, w: 320, h: 120 },
  });
  const violations = check(normalize({ nodes: [parent, child] }), builtin, { categories: ['system'] });
  assert.ok(violations.some((violation) => violation.id === 'SYS-TEXT-CLIP'));
});
