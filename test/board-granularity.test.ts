import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_PART_CAPTURES,
  auditBoardGranularity,
  captureSelector,
  isOpaqueFrameCapture,
  isWholePageCapture,
  slotClaimAndCapture,
} from '../core/ref/board-granularity.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { parseReferenceBoard } from '../core/ref/board-parser.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { similarity, topKinshipPairs } from '../core/ref/distance.ts';

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

test('resolved image fragments supplement a board without pretending to be component registry entries', () => {
  const references = parts(MIN_PART_CAPTURES);
  const piece = (referenceId: string, sourceKind: 'component-capture' | 'image-fragment', index: number) => ({
    slotId: `zone-${index}`, sourceKind, referenceId, targetComponent: 'Content group', targetSelector: `.group-${index}`,
    taskIds: ['T1'], reason: 'Keep the content relationship visible.', take: ['structure'],
    avoid: 'Do not copy source assets.', adaptation: 'Use the project content and verify the rendered result.',
    grid: { column: 1, span: 12, order: index },
    evidenceAxes: { rights: 'unknown', signal: 'supporting-component', staticAxis: 'available', motionAxis: 'absent' },
  });
  const image = piece('fragment-0123456789abcdef', 'image-fragment', references.length);
  const board = parseReferenceBoard({
    schemaVersion: 'reference-board-v1', frameSha256: 'a'.repeat(64),
    candidates: [{ id: 'one', label: 'One', route: '/', rationale: 'Use complementary evidence.', pieces: [
      ...references.map((ref, index) => piece(refIdentity(ref.source, ref.component), 'component-capture', index)), image,
    ] }],
  });
  assert.deepEqual(auditBoardGranularity(references, { board }), [], 'fragment resolution belongs to the native board reader');
  const uncovered = auditBoardGranularity(references, { board, zones: [image.slotId] });
  assert.ok(uncovered.some(finding => finding.id === 'REF-ZONE-UNCOVERED'), 'a fragment does not waive measured zone coverage');
  const imagesOnly = parseReferenceBoard({ ...board, candidates: [{ ...board.candidates[0], pieces: [image] }] });
  const missing = auditBoardGranularity([], { board: imagesOnly, zones: [image.slotId] });
  assert.ok(missing.some(finding => finding.id === 'REF-NO-PARTS'), 'a fragment never counts as component anatomy');
  assert.ok(missing.some(finding => finding.id === 'REF-ZONE-UNCOVERED'));
  const contentOnly = parseReferenceBoard({
    ...board, schemaVersion: 'reference-board-v2', projectSha256: 'b'.repeat(64), candidates: [board.candidates[0], {
      ...board.candidates[0], id: 'two', pieces: board.candidates[0]!.pieces.map((entry, index) => index === 0 ? {
        ...entry, sourceKind: 'classified-reference', take: ['content'],
        evidenceAxes: { rights: 'unknown', signal: 'supporting-content', staticAxis: 'absent', motionAxis: 'absent' },
        classification: { kind: 'content-only', sha256: 'c'.repeat(64) },
      } : entry),
    }],
  });
  assert.ok(auditBoardGranularity(references, { board: contentOnly, zones: ['zone-0'] })
    .some(finding => finding.id === 'REF-ZONE-UNCOVERED'), 'a candidate cannot borrow another candidate\'s anatomical use for a classified claim');
  const wholePage = references.map((reference, index) => index === 0 ? { ...reference, selector: 'body' } : reference);
  const wholePageFindings = auditBoardGranularity(wholePage, { board, zones: ['zone-0'] });
  assert.ok(wholePageFindings.some(finding => finding.id === 'REF-WHOLE-PAGE'));
  assert.ok(wholePageFindings.some(finding => finding.id === 'REF-ZONE-UNCOVERED'), 'a page-root capture is not measured part coverage');
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
  const surfaces = ['hero', 'process-loop', 'skills-table', 'install', 'proof'];
  const findings = auditBoardGranularity(board, { zones: surfaces });
  const ids = findings.map((f) => f.id);
  assert.ok(ids.includes('REF-PART-CONCENTRATION'), 'three navs out of five captures is one slot studied three times');
  const uncovered = findings.find((f) => f.id === 'REF-ZONE-UNCOVERED')!;
  assert.match(uncovered.message, /no capture is bound to a composition zone/, 'an unbound board covers nothing');
  for (const surface of surfaces) assert.match(uncovered.message, new RegExp(surface), `${surface} must be named as uncovered`);
  assert.ok(!ids.includes('REF-NO-PARTS'), 'these are genuine component captures');
  assert.ok(!ids.includes('REF-WHOLE-PAGE'), 'none of them is a page root');
  const conc = findings.find((f) => f.id === 'REF-PART-CONCENTRATION')!;
  assert.match(conc.message, /3 of 5 component captures measure the same part \(`header`\)/);
  assert.equal(conc.refs.length, 3);
});

test('a board with one bound part per surface passes', () => {
  const board = [
    ref('https://a.com', 'hero-band', '.hero', { slot: 'hero' }),
    ref('https://b.com', 'pipeline', '.steps', { slot: 'process-loop' }),
    ref('https://c.com', 'cards', '.grid', { slot: 'skills-table' }),
    ref('https://d.com', 'install-codeblock', 'pre', { slot: 'install' }),
    ref('https://e.com', 'site-footer', 'footer', { slot: 'proof' }),
  ];
  assert.deepEqual(auditBoardGranularity(board, { zones: ['hero', 'process-loop', 'skills-table', 'install', 'proof'] }), []);
});

test('coverage names exactly the surfaces with no bound capture', () => {
  const board = [
    ref('https://a.com', 'hero-band', '.hero', { slot: 'hero' }),
    ref('https://b.com', 'install-codeblock', 'pre', { slot: 'install' }),
    ref('https://c.com', 'cards', '.grid', { slot: 'skills-table' }),
    ref('https://d.com', 'nav-a', 'header', { slot: 'hero' }),
  ];
  const finding = auditBoardGranularity(board, { zones: ['hero', 'process-loop', 'install', 'skills-table', 'proof'] })
    .find((f) => f.id === 'REF-ZONE-UNCOVERED')!;
  assert.match(finding.message, /2 of 5 required composition zones lack their declared evidence kind: process-loop, proof/);
  assert.deepEqual([...finding.refs], ['zone: process-loop', 'zone: proof']);
});

test('concentration needs a real board; two captures of one part are not yet a pattern', () => {
  const small = [ref('https://a.com', 'nav-a', 'header'), ref('https://b.com', 'nav-b', 'header'), ref('https://c.com', 'x', '.x')];
  const ids = auditBoardGranularity(small).map((f) => f.id);
  assert.ok(!ids.includes('REF-PART-CONCENTRATION'), 'below the capture minimum the share is noise');
});

test('zone coverage is only reported when the acquisition plan declares zones', () => {
  const board = [
    ref('https://a.com', 'hero', '.hero'),
    ref('https://b.com', 'pipeline', '.steps'),
    ref('https://c.com', 'cards', '.grid'),
    ref('https://d.com', 'install', 'pre'),
  ];
  assert.ok(!auditBoardGranularity(board).some((f) => f.id === 'REF-ZONE-UNCOVERED'));
  assert.ok(auditBoardGranularity(board, { zones: ['hero', 'install'] }).some((f) => f.id === 'REF-ZONE-UNCOVERED'));
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

// Zone coverage counts evidence; it cannot see that all of it agrees with itself. A real run
// covered all six zones from one design system, carried a 0.93 kinship pair, and left four
// low-signal captures on the board — each invisible to every check that existed.

const inv = (over: Partial<Invariants> = {}): Invariants => ({
  spacingLadder: [8, 16], radiusLadder: [4], elevationLevels: 1, centeredRatio: 0, tokenCoverage: 0.8,
  paddingWeight: 16, typeScale: [14, 16, 24, 40], fontFamilies: ['inter'], weightLadder: [400, 700],
  motionDurations: [200], easingVocab: ['ease-out'], animatedShare: 0.1, hoverCoverage: 0.5,
  focusCoverage: 0.9, animatedProperties: ['opacity'], hasReducedMotion: true, scrollChoreography: [],
  ...over,
} as Invariants);

test('responsive observations are one family, not duplicate evidence or self-kinship', () => {
  const mobile = ref('https://paired.example', 'mobile', '.part', { viewport: { width: 390, height: 844 }, invariants: inv(), slot: 'mobile-zone' });
  const desktop = { ...mobile, component: 'desktop', viewport: { width: 1280, height: 900 }, slot: 'desktop-zone' };
  for (const variant of [desktop, { ...desktop, invariants: inv({ typeScale: [20, 80] }) }]) {
    assert.deepEqual(topKinshipPairs([mobile, variant]), [], 'list and audit agree on responsive families');
    const findings = auditBoardGranularity([mobile, variant], { zones: ['mobile-zone', 'desktop-zone'] });
    assert.ok(findings.some(f => f.id === 'REF-NO-PARTS'), 'two viewports cannot fill the three-part quota');
    for (const id of ['REF-DUPLICATE-CAPTURE', 'REF-KINSHIP-UNRESOLVED', 'REF-NO-DESKTOP-EVIDENCE', 'REF-ZONE-UNCOVERED']) {
      assert.ok(!findings.some(f => f.id === id), id);
    }
  }
  const { viewport: _viewport, ...unknownViewport } = desktop;
  for (const variant of [
    { ...desktop, viewport: mobile.viewport! }, unknownViewport,
    { ...desktop, viewport: { width: 0, height: 900 } },
    { ...desktop, selector: '.claimed-other', viewport: mobile.viewport!, blueprint: { selector: '.part', nodes: [], capturedAt: '' } },
  ]) assert.ok(auditBoardGranularity([mobile, variant]).some(f => f.id === 'REF-DUPLICATE-CAPTURE'));
});

test('responsive variants neither manufacture source diversity nor alter family concentration', () => {
  const board = [
    ref('https://one.example/a', 'one', '.one'), ref('https://one.example/b', 'two', '.two'),
    ref('https://one.example/c', 'three', '.three'), ref('https://other.example', 'four', '.four'),
  ];
  const variants = Array.from({ length: 8 }, (_, i) => ({ ...board[3]!, component: `four-${i}`, viewport: { width: 400 + i, height: 900 } }));
  assert.ok(auditBoardGranularity([...board.slice(0, 3), ...variants]).some(f => f.id === 'REF-SOURCE-CONCENTRATION'));
  const navs = [ref('https://a.example', 'nav-a', 'nav'), ref('https://b.example', 'nav-b', 'nav'), board[2]!, board[3]!];
  const copies = Array.from({ length: 8 }, (_, i) => ({ ...board[3]!, component: `four-${i}`, viewport: { width: 400 + i, height: 900 } }));
  assert.ok(auditBoardGranularity([...navs.slice(0, 3), ...copies]).some(f => f.id === 'REF-PART-CONCENTRATION'));
});

test('case-sensitive CSS identities stay distinct and malformed desktop viewports prove nothing', () => {
  const first = ref('https://case.example', 'upper', '#Card', { viewport: { width: 1280, height: 900 }, invariants: inv() });
  const second = { ...first, component: 'lower', selector: '#card' };
  const findings = auditBoardGranularity([first, second]);
  assert.ok(!findings.some(f => f.id === 'REF-DUPLICATE-CAPTURE'));
  assert.ok(findings.some(f => f.id === 'REF-KINSHIP-UNRESOLVED'), 'distinct case-sensitive components remain cross-family comparisons');
  assert.ok(auditBoardGranularity([{ ...first, viewport: { width: 1280, height: 0 } }]).some(f => f.id === 'REF-NO-DESKTOP-EVIDENCE'));
});

test('cross-family kinship checks every variant and reports each family pair once', () => {
  const entries = [
    ref('https://a.example', 'first', '.part', { viewport: { width: 390, height: 844 }, invariants: inv({ typeScale: [2, 200], spacingLadder: [1, 100] }) }),
    ref('https://a.example', 'second', '.part', { viewport: { width: 1280, height: 900 }, invariants: inv() }),
    ref('https://b.example', 'third', '.part', { viewport: { width: 390, height: 844 }, invariants: inv() }),
    ref('https://b.example', 'fourth', '.part', { viewport: { width: 1280, height: 900 }, invariants: inv() }),
  ];
  const finding = auditBoardGranularity(entries).find(f => f.id === 'REF-KINSHIP-UNRESOLVED');
  assert.ok(finding); assert.equal(finding.refs.length, 2);
  assert.ok(finding.refs.includes('https://a.example (second)'));
  assert.equal(topKinshipPairs(entries).length, 1, 'variants cannot crowd the list with one family pair');
});

test('empty wrapper vocabulary cannot establish kinship with an unrelated text component', () => {
  // Observed on a native first-party app picture and a scoped Korean title: the
  // extractor measured the picture element, not the app depicted inside it.
  const wrapper = inv({ spacingLadder: [], radiusLadder: [], typeScale: [], fontFamilies: [],
    weightLadder: [], motionDurations: [], easingVocab: [], elevationLevels: 0,
    centeredRatio: 0, tokenCoverage: 1, paddingWeight: 0, animatedShare: 0,
    hoverCoverage: 0, focusCoverage: 0 });
  const title = { ...wrapper, spacingLadder: [16], typeScale: [24], fontFamilies: ['reader sans'], weightLadder: [600] };
  const entries = [ref('https://app.example', 'picture', 'img', { invariants: wrapper }),
    ref('https://reader.example', 'title', 'h2', { invariants: title })];
  assert.equal(similarity(wrapper, title), 1, 'raw distance remains a partial scalar comparison');
  assert.deepEqual(topKinshipPairs(entries), []);
  assert.ok(!auditBoardGranularity(entries).some(f => f.id === 'REF-KINSHIP-UNRESOLVED'));
  const rounded = entries.map(entry => ({ ...entry, invariants: { ...entry.invariants!, radiusLadder: [4] } }));
  assert.deepEqual(topKinshipPairs(rounded), [], 'a shared ordinary radius cannot supply missing typography and spacing');
  assert.ok(!auditBoardGranularity(rounded).some(f => f.id === 'REF-KINSHIP-UNRESOLVED'));

  const duplicateTitle = ref('https://other.example', 'title', 'h2', { invariants: title });
  assert.equal(topKinshipPairs([entries[1]!, duplicateTitle]).length, 1);
  assert.ok(topKinshipPairs([entries[1]!, duplicateTitle])[0]!.unmeasuredComponents?.includes('motionDurations'));
  assert.ok(auditBoardGranularity([entries[1]!, duplicateTitle]).some(f => f.id === 'REF-KINSHIP-UNRESOLVED'),
    'shared measured typography remains a kinship signal, not evidence of independent provenance');
});

test('family signal is conservative and independent of variant count or input order', () => {
  const flat = inv({ radiusLadder: [], elevationLevels: 0, motionDurations: [], easingVocab: [], weightLadder: [], typeScale: [], spacingLadder: [] });
  const weak = ref('https://a.example', 'weak', '.part', { invariants: flat });
  const entries = [weak, ref('https://b.example', 'weak-b', '.part', { invariants: flat }), ref('https://c.example', 'strong', '.part', { invariants: inv() }),
    ...Array.from({ length: 8 }, (_, i) => ({ ...weak, component: `strong-sibling-${i}`, invariants: inv(), viewport: { width: 400 + i, height: 900 } }))];
  for (const order of [entries, [...entries].reverse()]) {
    const finding = auditBoardGranularity(order).find(f => f.id === 'REF-LOW-SIGNAL-BOARD');
    assert.ok(finding); assert.match(finding.message, /2 of 3 measured source-selector families/);
  }
});

test('legacy opaque iframe boxes fail as missing anatomy without condemning legitimate leaf components', () => {
  const frameBlueprint = (selector: string): Blueprint => ({
    selector,
    capturedAt: '2026-09-06T00:00:00.000Z',
    nodes: [{ id: 'frame', role: 'container', children: [], box: { w: 809, h: 290 }, fillRole: 'bg' }],
  });
  const leafBlueprint: Blueprint = {
    selector: '.status-dot',
    capturedAt: '2026-09-06T00:00:00.000Z',
    nodes: [{ id: 'dot', role: 'container', children: [], box: { w: 12, h: 12 }, fillRole: 'accent' }],
  };
  const sameHostMeasurements = inv({
    spacingLadder: [], radiusLadder: [], typeScale: [], fontFamilies: [], weightLadder: [],
    motionDurations: [], easingVocab: [], elevationLevels: 0, centeredRatio: 0,
    tokenCoverage: 1, paddingWeight: 0, animatedShare: 0, hoverCoverage: 0.88, focusCoverage: 1,
  });
  const error = ref('https://docs.example/error', 'inline-error', 'iframe.example-frame', {
    slot: 'request-validation', invariants: sameHostMeasurements, blueprint: frameBlueprint('iframe.example-frame'),
  });
  const success = ref('https://docs.example/success', 'success-banner', 'main > iframe#success', {
    slot: 'request-confirmation', invariants: sameHostMeasurements, blueprint: frameBlueprint('main > iframe#success'),
  });
  const leaf = ref('https://status.example', 'status-dot', '.status-dot', {
    slot: 'status', invariants: sameHostMeasurements, blueprint: leafBlueprint,
  });

  assert.equal(isOpaqueFrameCapture(error), true);
  assert.equal(isOpaqueFrameCapture(success), true);
  assert.equal(isOpaqueFrameCapture(leaf), false, 'a genuine one-node leaf is not an opaque-frame capture');

  const findings = auditBoardGranularity([error, success, leaf], {
    zones: ['request-validation', 'request-confirmation', 'status'],
  });
  const missing = findings.find((finding) => finding.id === 'REF-MISSING-ANATOMY');
  assert.ok(missing);
  assert.deepEqual(missing.refs, [
    'https://docs.example/error (inline-error)',
    'https://docs.example/success (success-banner)',
  ]);
  assert.match(missing.message, /resolved embedded document URL/i);
  const uncovered = findings.find((finding) => finding.id === 'REF-ZONE-UNCOVERED');
  assert.ok(uncovered);
  assert.match(uncovered.message, /request-validation/);
  assert.match(uncovered.message, /request-confirmation/);
  assert.doesNotMatch(uncovered.message, /status(?:,|\.|$)/);
  assert.ok(!findings.some((finding) => finding.id === 'REF-KINSHIP-UNRESOLVED'), 'opaque host-page scalars cannot establish kinship');

  const piece = (entry: Reference, slotId: string, order: number) => ({
    slotId, sourceKind: 'component-capture', referenceId: refIdentity(entry.source, entry.component),
    targetComponent: slotId, targetSelector: `[data-zone="${slotId}"]`, taskIds: [`zone-${slotId}`],
    reason: 'Use the measured component.', take: ['structure'], avoid: 'Do not copy source expression.',
    adaptation: 'Apply the measured relation locally.', grid: { column: 1, span: 12, order },
    evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' },
  });
  const manifest = parseReferenceBoard({
    schemaVersion: 'reference-board-v2', projectSha256: 'b'.repeat(64), frameSha256: 'a'.repeat(64),
    candidates: [{ id: 'candidate', label: 'Candidate', route: '/', rationale: 'Bound component evidence.', pieces: [
      piece(error, 'request-validation', 0), piece(success, 'request-confirmation', 1), piece(leaf, 'status', 2),
    ] }],
  });
  const boundFindings = auditBoardGranularity([error, success, leaf], {
    zones: ['request-validation', 'request-confirmation', 'status'], board: manifest,
  });
  const boundUncovered = boundFindings.find((finding) => finding.id === 'REF-ZONE-UNCOVERED');
  assert.ok(boundUncovered);
  assert.match(boundUncovered.message, /request-validation/);
  assert.match(boundUncovered.message, /request-confirmation/);
  assert.doesNotMatch(boundUncovered.message, /status(?:,|\.|$)/);
});

test('a board drawn mostly from one source is reported even when every zone is covered', () => {
  const board = [
    ref('https://one.example/a', 'nav', '.nav', { invariants: inv(), slot: 'nav' }),
    ref('https://one.example/b', 'cards', '.cards', { invariants: inv({ radiusLadder: [8] }), slot: 'proof' }),
    ref('https://one.example/c', 'steps', '.steps', { invariants: inv({ spacingLadder: [4, 12] }), slot: 'process' }),
    ref('https://other.example/d', 'hero', '.hero', { invariants: inv({ typeScale: [16, 20, 64] }), slot: 'hero' }),
  ];
  const finding = auditBoardGranularity(board).find((f) => f.id === 'REF-SOURCE-CONCENTRATION');
  assert.ok(finding, 'three of four captures share one host');
  assert.match(finding!.message, /3 of 4 component captures come from one source/);

  const spread = [
    ref('https://one.example/a', 'nav', '.nav', { invariants: inv(), slot: 'nav' }),
    ref('https://two.example/b', 'cards', '.cards', { invariants: inv({ radiusLadder: [8] }), slot: 'proof' }),
    ref('https://three.example/c', 'steps', '.steps', { invariants: inv({ spacingLadder: [4, 12] }), slot: 'process' }),
    ref('https://four.example/d', 'hero', '.hero', { invariants: inv({ typeScale: [16, 20, 64] }), slot: 'hero' }),
  ];
  assert.ok(!auditBoardGranularity(spread).some((f) => f.id === 'REF-SOURCE-CONCENTRATION'));
});

test('matching measured vocabularies flag possible redundant visual influence', () => {
  const twin = inv();
  const board = [
    ref('https://a.example', 'alert', '.alert', { invariants: twin, slot: 'scope' }),
    ref('https://b.example', 'process', '.process', { invariants: twin, slot: 'process' }),
    ref('https://c.example', 'hero', '.hero', { invariants: inv({ typeScale: [12, 48], radiusLadder: [0], elevationLevels: 0, spacingLadder: [2, 40] }), slot: 'hero' }),
  ];
  const finding = auditBoardGranularity(board).find((f) => f.id === 'REF-KINSHIP-UNRESOLVED');
  assert.ok(finding, 'identical invariants must surface as possible redundant influence');
  assert.match(finding!.message, /similar measured design vocabularies/);
  assert.match(finding!.message, /not proof of shared provenance/);
});

test('a board that is mostly low-signal has nothing to be distinctive with', () => {
  const flat = inv({ radiusLadder: [], elevationLevels: 0, motionDurations: [], easingVocab: [], weightLadder: [], typeScale: [], spacingLadder: [] });
  const board = [
    ref('https://a.example', 'one', '.one', { invariants: flat, slot: 'a' }),
    ref('https://b.example', 'two', '.two', { invariants: flat, slot: 'b' }),
    ref('https://c.example', 'three', '.three', { invariants: inv(), slot: 'c' }),
  ];
  const finding = auditBoardGranularity(board).find((f) => f.id === 'REF-LOW-SIGNAL-BOARD');
  assert.ok(finding, 'two of three below the signal floor is a majority');
  assert.match(finding!.message, /score below 0\.4 design signal/);
});

test('the board signal gate honors measured component structure instead of requiring motion or hover', () => {
  const flat = inv({ radiusLadder: [], elevationLevels: 0, motionDurations: [], easingVocab: [], weightLadder: [400], typeScale: [16], spacingLadder: [80], paddingWeight: 0, hoverCoverage: 0 });
  const blueprint: Blueprint = {
    selector: '.evidence-split',
    capturedAt: '2026-08-31T00:00:00.000Z',
    nodes: [
      { id: 'root', role: 'container', children: ['copy', 'media'], box: { w: 1216, h: 560 } },
      { id: 'copy', role: 'container', children: ['heading', 'list'], box: { w: 496, h: 528 } },
      { id: 'heading', role: 'heading', children: [], box: { w: 496, h: 32 }, fontSize: 32, fontWeight: 500 },
      { id: 'list', role: 'container', children: ['row-1', 'row-2', 'row-3'], box: { w: 496, h: 276 } },
      { id: 'row-1', role: 'text', children: [], box: { w: 470, h: 56 }, fontSize: 16, fontWeight: 400 },
      { id: 'row-2', role: 'text', children: [], box: { w: 470, h: 56 }, fontSize: 16, fontWeight: 600 },
      { id: 'row-3', role: 'text', children: [], box: { w: 470, h: 84 }, fontSize: 16, fontWeight: 400 },
      { id: 'media', role: 'container', children: ['image'], box: { w: 640, h: 389 } },
      { id: 'image', role: 'image', children: [], box: { w: 640, h: 389 }, radius: 16 },
    ],
  };
  const board = [
    ref('https://a.example', 'split-a', '.split-a', { invariants: flat, blueprint }),
    ref('https://b.example', 'split-b', '.split-b', { invariants: flat, blueprint: { ...blueprint, selector: '.split-b' } }),
    ref('https://c.example', 'styled', '.styled', { invariants: inv() }),
  ];
  const finding = auditBoardGranularity(board).find((entry) => entry.id === 'REF-LOW-SIGNAL-BOARD');
  assert.equal(finding, undefined);
});

test('the checker consumes board classifications and candidate zone bindings instead of auditing raw captures', () => {
  const flat = inv({ radiusLadder: [], elevationLevels: 0, motionDurations: [], easingVocab: [], weightLadder: [400], typeScale: [16], spacingLadder: [8] });
  const visual = [
    ref('https://visual-a.example', 'visual-a', '.visual-a'),
    ref('https://visual-b.example', 'visual-b', '.visual-b'),
    ref('https://visual-c.example', 'visual-c', '.visual-c'),
  ];
  const nonvisual = [
    ref('https://content-a.example', 'content-a', '.content-a', { invariants: flat }),
    ref('https://content-b.example', 'content-b', '.content-b', { invariants: flat }),
    ref('https://content-c.example', 'content-c', '.content-c', { invariants: flat }),
    ref('https://anti.example', 'anti', '.anti', { invariants: flat }),
  ];
  const visualPiece = (entry: Reference, slotId: string, order: number) => ({
    slotId, sourceKind: 'component-capture', referenceId: refIdentity(entry.source, entry.component),
    targetComponent: slotId, targetSelector: `[data-zone="${slotId}"]`, taskIds: [`zone-${slotId}`], reason: 'Use only the declared visual evidence.',
    take: ['structure'], avoid: 'Do not copy source expression.', adaptation: 'Apply the rule locally.', grid: { column: 1, span: 12, order },
    evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' },
  });
  const classifiedPiece = (entry: Reference, slotId: string, order: number, kind: 'content-only' | 'anti-reference') => ({
    slotId, sourceKind: 'classified-reference', referenceId: refIdentity(entry.source, entry.component),
    targetComponent: slotId, targetSelector: `[data-zone="${slotId}"]`, taskIds: [`zone-${slotId}`], reason: 'Use only the declared nonvisual evidence.',
    take: kind === 'content-only' ? ['content'] : ['rejection'], avoid: 'Do not infer source pixels.', adaptation: 'Apply the rule locally.',
    grid: { column: 1, span: 12, order }, evidenceAxes: { rights: 'lawful', signal: kind === 'content-only' ? 'supporting-content' : 'anti-reference', staticAxis: 'absent', motionAxis: 'absent' },
    classification: { kind, sha256: 'c'.repeat(64) },
  });
  const manifest = parseReferenceBoard({
    schemaVersion: 'reference-board-v2', projectSha256: 'b'.repeat(64), frameSha256: 'a'.repeat(64), candidates: [{
      id: 'candidate', label: 'Candidate', route: '/', rationale: 'Mixed typed evidence.',
      pieces: [
        ...visual.map((entry, index) => visualPiece(entry, `visual-${index}`, index)),
        ...nonvisual.slice(0, 3).map((entry, index) => classifiedPiece(entry, index === 0 ? 'voice' : `content-${index}`, index + 3, 'content-only')),
        classifiedPiece(nonvisual[3]!, 'rejected-style', 6, 'anti-reference'),
      ],
    }],
  });
  const rawIds = auditBoardGranularity([...visual, ...nonvisual]).map((finding) => finding.id);
  assert.ok(rawIds.includes('REF-LOW-SIGNAL-BOARD'));
  assert.ok(rawIds.includes('REF-KINSHIP-UNRESOLVED'));

  const findings = auditBoardGranularity([...visual, ...nonvisual], {
    board: manifest,
    zones: ['visual-0', 'visual-1', 'visual-2', 'voice'],
  });
  assert.ok(!findings.some((finding) => finding.id === 'REF-LOW-SIGNAL-BOARD'));
  assert.ok(!findings.some((finding) => finding.id === 'REF-KINSHIP-UNRESOLVED'));
  assert.ok(!findings.some((finding) => finding.id === 'REF-ZONE-UNCOVERED'));

  const legacy = parseReferenceBoard({
    schemaVersion: 'reference-board-v1', frameSha256: 'a'.repeat(64), candidates: [{
      id: 'legacy', label: 'Legacy', route: '/', rationale: 'Caller signals alone are not classification authority.',
      pieces: nonvisual.map((entry, index) => ({
        ...visualPiece(entry, `legacy-${index}`, index),
        evidenceAxes: { rights: 'lawful', signal: index === 3 ? 'anti-reference' : 'supporting-content', staticAxis: 'available', motionAxis: 'absent' },
      })),
    }],
  });
  const legacyIds = auditBoardGranularity([...visual, ...nonvisual], { board: legacy }).map((finding) => finding.id);
  assert.ok(legacyIds.includes('REF-LOW-SIGNAL-BOARD'), 'legacy signal strings cannot forge a capture waiver');
  assert.ok(legacyIds.includes('REF-KINSHIP-UNRESOLVED'), 'legacy anti-reference signals cannot waive kinship without a classification binding');
});
