import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PART_CAPTURES,
  auditBoardGranularity,
  captureSelector,
  isWholePageCapture,
  slotClaimAndCapture,
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

test('the real board is caught: five component captures collapsing onto two slots', () => {
  // Reconstructed from the shipped board: three navs and two install code blocks, with every other
  // section of the page carrying no reference at all.
  const board = [
    ref('https://bun.sh', 'cli-header-nav', 'header'),
    ref('https://vite.dev', 'vite-header-nav', 'header'),
    ref('https://www.warp.dev', 'warp-agentic-hero-craft', 'header'),
    ref('https://bun.sh', 'cli-install-codeblock', 'pre'),
    ref('https://vite.dev', 'hero-install-tabs', '.language-bash'),
  ];
  const findings = auditBoardGranularity(board, { surfaces: 5 });
  const ids = findings.map((f) => f.id);
  assert.ok(ids.includes('REF-PART-CONCENTRATION'), 'three navs out of five captures is one slot studied three times');
  assert.ok(ids.includes('REF-SURFACE-UNCOVERED'), 'three distinct parts cannot compose five surfaces');
  assert.ok(!ids.includes('REF-NO-PARTS'), 'these are genuine component captures');
  assert.ok(!ids.includes('REF-WHOLE-PAGE'), 'none of them is a page root');
  const conc = findings.find((f) => f.id === 'REF-PART-CONCENTRATION')!;
  assert.match(conc.message, /3 of 5 component captures measure the same part \(`header`\)/);
  assert.equal(conc.refs.length, 3);
});

test('a board with one part per surface passes the diversity audit', () => {
  const board = [
    ref('https://a.com', 'hero', '.hero'),
    ref('https://b.com', 'pipeline', '.steps'),
    ref('https://c.com', 'cards', '.grid'),
    ref('https://d.com', 'install', 'pre'),
    ref('https://e.com', 'footer', 'footer'),
  ];
  assert.deepEqual(auditBoardGranularity(board, { surfaces: 5 }), []);
});

test('concentration needs a real board; two captures of one part are not yet a pattern', () => {
  const small = [ref('https://a.com', 'nav-a', 'header'), ref('https://b.com', 'nav-b', 'header'), ref('https://c.com', 'x', '.x')];
  const ids = auditBoardGranularity(small).map((f) => f.id);
  assert.ok(!ids.includes('REF-PART-CONCENTRATION'), 'below the capture minimum the share is noise');
});

test('surface coverage is only reported when the brief declared surfaces', () => {
  const board = [
    ref('https://a.com', 'hero', '.hero'),
    ref('https://b.com', 'pipeline', '.steps'),
    ref('https://c.com', 'cards', '.grid'),
    ref('https://d.com', 'install', 'pre'),
  ];
  assert.ok(!auditBoardGranularity(board).some((f) => f.id === 'REF-SURFACE-UNCOVERED'));
  assert.ok(auditBoardGranularity(board, { surfaces: 6 }).some((f) => f.id === 'REF-SURFACE-UNCOVERED'));
});

test('a reference whose name claims a slot its capture contradicts is named', () => {
  // Both cases are from the live board, verified against the saved screenshots: a ref called
  // `warp-agentic-hero-craft` whose shot is a nav bar, and `hero-install-tabs` whose shot is one
  // line of shell inside a code block.
  const board = [
    ref('https://www.warp.dev', 'warp-agentic-hero-craft', 'header'),
    ref('https://vite.dev', 'hero-install-tabs', '.language-bash'),
    ref('https://bun.sh', 'cli-header-nav', 'header'),
  ];
  const finding = auditBoardGranularity(board).find((f) => f.id === 'REF-NAME-MISMATCH');
  assert.ok(finding, 'a name that contradicts its capture must be reported');
  assert.match(finding!.message, /`warp-agentic-hero-craft` claims hero but was captured at nav/);
  assert.match(finding!.message, /`hero-install-tabs` claims hero but was captured at code block/);
  assert.equal(finding!.refs.length, 2, 'the honestly named nav must not be reported');
});

test('slotClaimAndCapture reads a name and a selector only when each is unambiguous', () => {
  assert.deepEqual(slotClaimAndCapture({ component: 'cli-header-nav', selector: 'header' } as never), { claimed: 'nav', captured: 'nav' });
  assert.deepEqual(slotClaimAndCapture({ component: 'site-footer', selector: 'footer' } as never), { claimed: 'footer', captured: 'footer' });
  assert.deepEqual(slotClaimAndCapture({ component: 'install-codeblock', selector: 'pre' } as never), { claimed: 'code block', captured: 'code block' });
  // `header-nav` must not read as `hero`: the slot words are matched as whole segments.
  assert.equal(slotClaimAndCapture({ component: 'header-nav', selector: '.x' } as never).claimed, 'nav');
  // Outside the vocabulary nothing is claimed and nothing is asserted.
  assert.deepEqual(slotClaimAndCapture({ component: 'proof-band', selector: '.proof' } as never), { claimed: null, captured: null });
});

test('an honestly named board raises no mismatch', () => {
  const board = [
    ref('https://a.com', 'cli-header-nav', 'header'),
    ref('https://b.com', 'install-codeblock', 'pre'),
    ref('https://c.com', 'site-footer', 'footer'),
  ];
  assert.ok(!auditBoardGranularity(board).some((f) => f.id === 'REF-NAME-MISMATCH'));
});
