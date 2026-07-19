import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReferenceBoard } from '../core/ref/board-parser.ts';

type BoardFixture = { readonly board: Record<string, unknown>; readonly candidate: Record<string, unknown>; readonly piece: Record<string, unknown>; readonly taskIds: string[] };

const fixture = (): BoardFixture => {
  const taskIds = ['T1'];
  const piece: Record<string, unknown> = { slotId: 'hero', sourceKind: 'component-capture', referenceId: 'ref-0000000000000000', targetComponent: 'hero', targetSelector: '.hero', taskIds, reason: 'Establish hierarchy.', take: ['structure'], avoid: 'Avoid copied copy.', adaptation: 'Use local tokens.', grid: { column: 1, span: 6, order: 0 } };
  const candidate: Record<string, unknown> = { id: 'alpha', label: 'Alpha', route: '/work', rationale: 'A local composition.', pieces: [piece] };
  return { board: { schemaVersion: 'reference-board-v1', frameSha256: 'a'.repeat(64), candidates: [candidate] }, candidate, piece, taskIds };
};

const fields: readonly (readonly [string, (value: BoardFixture, payload: string) => void])[] = [
  ['candidate id', (value, payload) => { value.candidate['id'] = payload; }], ['candidate label', (value, payload) => { value.candidate['label'] = payload; }], ['candidate rationale', (value, payload) => { value.candidate['rationale'] = payload; }],
  ['slot ID', (value, payload) => { value.piece['slotId'] = payload; }], ['target component', (value, payload) => { value.piece['targetComponent'] = payload; }],
  ['task ID', (value, payload) => { value.taskIds[0] = payload; }], ['reason', (value, payload) => { value.piece['reason'] = payload; }], ['avoid', (value, payload) => { value.piece['avoid'] = payload; }], ['adaptation', (value, payload) => { value.piece['adaptation'] = payload; }],
];
const payloads = ['https://source.example', '//source.example', 'source.unlisted', 'source.xn--3e0b707e', 'source.example.', '192.0.2.1', '[2001:db8::1]', '::1', '1::', 'fe80::1', '[fe80::1]', 'localhost', 'javascript:alert(1)', 'mailto:source@example.test', 'custom+scheme:payload', 'data:image/png;base64,x', 'file:///secret', 'blob:https://source.example/x', '<img src=x>', 'text\u0000payload', './capture.png', '../capture.png', '.\\capture.png', '..\\capture.png', 'capture.png', 'assets/crop.png', 'assets\\crop.png', '.omd/refs/crop.png', '.omd\\refs\\crop.png', 'assets/reference/crop', './capture', '../capture', 'folder\\capture', '/', '%2Fprivate%2Fcrop', 'capture', 'screenshot', 'crop', 'reference', 'image', 'fragment-0123456789abcdef', 'ref-0123456789abcdef'];

test('reference board rejects contamination across every emitted manifest text surface', () => {
  // Given: every manifest string that is copied into the downstream assembly.
  // When / Then: each surface rejects broad URI, host, pixel, markup, and control carriers.
  for (const [_field, set] of fields) for (const payload of payloads) { const value = fixture(); set(value, payload); assert.throws(() => parseReferenceBoard(value.board)); }
});

test('reference board intentionally accepts ordinary local CSS target selector syntax', () => {
  // Given: ordinary selectors that target only the local build's DOM.
  const selectors = ['.card', '#hero', 'a:hover', '::before', '[data-state="active"]', '[data-id="card-01"]', 'button[aria-expanded="true"]', 'img[src="hero"]', 'main > .item + #next ~ [role="tab"]:focus-visible', 'main > .card[data-ratio="16/9"]'];

  // When / Then: selector parsing does not invent a reduced CSS grammar.
  for (const selector of selectors) { const value = fixture(); value.piece['targetSelector'] = selector; assert.doesNotThrow(() => parseReferenceBoard(value.board)); }
});

test('reference board accepts human prose with ratios and non-path slashes', () => {
  const value = fixture();
  value.candidate['rationale'] = 'Keep a calm 16/9 ratio and balanced reading rhythm.';
  value.piece['reason'] = 'Use contrast to support a clear 3/2 visual cadence.';

  assert.doesNotThrow(() => parseReferenceBoard(value.board));
});

test('reference board keeps typed local candidate routes outside prose path detection', () => {
  const value = fixture();
  value.candidate['route'] = '/assets/reference/crop';

  assert.doesNotThrow(() => parseReferenceBoard(value.board));
});

test('reference board rejects broad URL, host, and literal carriers from CSS targets', () => {
  // Given: target selectors that are transport values rather than local CSS targets.
  const selectors = ['https://source.example', '//source.example', 'javascript:alert(1)', 'mailto:source@example.test', 'source.unlisted', 'source.xn--3e0b707e', 'source.example.', '192.0.2.1', '[2001:db8::1]', '::1', '1::', 'fe80::1', '[fe80::1]', 'localhost', 'data:image/png;base64,x', 'file:///secret', 'blob:https://source.example/x', '<svg>', 'text\u0000payload'];

  // When / Then: carrier detection rejects them without restricting normal pseudo syntax.
  for (const selector of selectors) { const value = fixture(); value.piece['targetSelector'] = selector; assert.throws(() => parseReferenceBoard(value.board)); }
});

test('reference board rejects local paths and source identities inside CSS selector attributes', () => {
  // Given: selector syntax whose attribute values are source or local-file carriers.
  const selectors = ['[src=".omd/refs/capture"]', 'img[src="/tmp/capture"]', '[src="../capture"]', '[src=".\\\\refs\\\\capture"]', '[src="C:\\\\refs\\\\capture"]', '[data-ref="ref-0123456789abcdef"]', '[data-fragment="fragment-0123456789abcdef"]', '[src="capture.png"]', '[src="assets/capture"]', '[src="https://source.example/capture"]', '[src="data:image/png;base64,x"]', '[src="file:///secret"]', '[src="blob:https://source.example/x"]'];

  // When / Then: no unsafe selector reaches the sanitized assembly boundary.
  for (const selector of selectors) { const value = fixture(); value.piece['targetSelector'] = selector; assert.throws(() => parseReferenceBoard(value.board)); }
});

test('reference board rejects CSS-escaped selector carriers by their decoded meaning', () => {
  const selectors = [String.raw`[src="\2e \6f \6d \64 /refs/capture"]`, String.raw`[src="\.\o\m\d/refs/capture"]`, String.raw`[data-ref="\72 ef-0123456789abcdef"]`, String.raw`[src="\68\74\74\70\73\3a\2f\2f\73\6f\75\72\63\65\2e\65\78\61\6d\70\6c\65"]`, String.raw`[data-origin="\73\6f\75\72\63\65\2e\65\78\61\6d\70\6c\65"]`];

  for (const selector of selectors) { const value = fixture(); value.piece['targetSelector'] = selector; assert.throws(() => parseReferenceBoard(value.board)); }
});

test('reference board accepts safe CSS-escaped selector syntax and rejects malformed escapes', () => {
  const safeSelectors = [String.raw`.\63 ard`, String.raw`[\64 ata-state="\61 ctive"]`, String.raw`[data-ratio="\31 6\2f 9"]`, String.raw`.card\:featured`];
  const malformedSelectors = ['.card\\', '.card\\\n', String.raw`.card\0 `, String.raw`.card\d800 `, String.raw`.card\110000 `];

  for (const selector of safeSelectors) {
    const value = fixture(); value.piece['targetSelector'] = selector;
    assert.equal(parseReferenceBoard(value.board).candidates[0]?.pieces[0]?.targetSelector, selector);
  }
  for (const selector of malformedSelectors) { const value = fixture(); value.piece['targetSelector'] = selector; assert.throws(() => parseReferenceBoard(value.board)); }
});
