import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PART_CAPTURES,
  auditBoardGranularity,
  captureSelector,
  isWholePageCapture,
} from '../core/ref/board-granularity.ts';
import type { Reference } from '../core/types.ts';

const ref = (source: string, component: string, selector?: string, extra: Partial<Reference> = {}): Reference => ({
  source,
  component,
  kind: 'component',
  capturedAt: '2026-07-25T00:00:00.000Z',
  ...(selector === undefined ? {} : { selector }),
  invariants: null,
  principles: [],
  ...extra,
} as Reference);

const parts = (n: number): Reference[] =>
  Array.from({ length: n }, (_u, i) => ref(`https://site${i}.com`, `part-${i}`, `.part-${i}`));

test('a page-root selector is a whole-page capture; a component selector is not', () => {
  for (const root of ['main', 'body', 'html', ':root', '#root', '#__next', '*']) {
    assert.equal(isWholePageCapture(ref('https://a.com', 'x', root)), true, `${root} must read as whole-page`);
  }
  assert.equal(isWholePageCapture(ref('https://a.com', 'x', '  MAIN  ')), true, 'case and padding must not evade the check');
  assert.equal(isWholePageCapture(ref('https://a.com', 'x')), true, 'an unscoped capture is whole-page');
  assert.equal(isWholePageCapture(ref('https://a.com', 'x', '.pricing-card')), false);
});

test('captureSelector prefers the blueprint selector the measurements were actually taken at', () => {
  assert.equal(captureSelector({ selector: 'main', blueprint: { selector: '.hero' } } as never), '.hero');
  assert.equal(captureSelector({ selector: '.nav' } as never), '.nav');
  assert.equal(captureSelector({} as never), '');
});

test('the real board that shipped is caught: whole-page captures and same-source duplicates', () => {
  // Reconstructed from the audited board: refs measured at `main`, and sources captured twice.
  const board = [
    ref('https://warp.dev', 'hero-terminal-warp', 'main'),
    ref('https://warp.dev', 'motion-warp-hero', 'main'),
    ref('https://ghostty.org', 'terminal-craft-ghostty', 'main'),
    ref('https://ghostty.org', 'motion-ghostty-hero', 'main'),
    ref('https://astro.build', 'process-diagram-astro', 'main'),
  ];
  const findings = auditBoardGranularity(board);
  const ids = findings.map((f) => f.id);
  assert.ok(ids.includes('REF-WHOLE-PAGE'), 'page-root captures must be named');
  assert.ok(ids.includes('REF-DUPLICATE-CAPTURE'), 'same source at the same selector must be named');
  assert.ok(ids.includes('REF-NO-PARTS'), 'a board with no parts cannot be assembled from');
  const dup = findings.find((f) => f.id === 'REF-DUPLICATE-CAPTURE')!;
  assert.ok(dup.refs.some((r) => r.includes('warp.dev')) && dup.refs.some((r) => r.includes('ghostty.org')));
  assert.match(dup.message, /renaming one capture does not make it a second piece of evidence/);
});

test('a board of distinct component-scoped captures passes clean', () => {
  assert.deepEqual(auditBoardGranularity(parts(MIN_PART_CAPTURES)), []);
});

test('two parts from the SAME source at different selectors are lawful evidence', () => {
  const board = [
    ref('https://linear.app', 'pricing-card', '.pricing-card'),
    ref('https://linear.app', 'nav', 'header nav'),
    ref('https://stripe.com', 'code-block', '.code'),
  ];
  assert.deepEqual(auditBoardGranularity(board), [], 'different parts of one site are different evidence');
});

test('image references carry reasoning, not anatomy, so they do not count as parts', () => {
  const board = [
    ...parts(MIN_PART_CAPTURES - 1),
    ref('https://mood.com', 'mood-shot', undefined, { kind: 'image' }),
  ];
  const ids = auditBoardGranularity(board).map((f) => f.id);
  assert.ok(ids.includes('REF-NO-PARTS'), 'an image cannot fill the part quota');
  assert.ok(!ids.includes('REF-WHOLE-PAGE'), 'an unscoped image is not reported as a whole-page capture');
});

test('an empty board reports the missing parts rather than passing vacuously', () => {
  const ids = auditBoardGranularity([]).map((f) => f.id);
  assert.deepEqual(ids, ['REF-NO-PARTS']);
});
