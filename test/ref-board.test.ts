import assert from 'node:assert/strict';
import { deflateSync, crc32 } from 'node:zlib';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test, { type TestContext } from 'node:test';
import { validateCompositionContract } from '../core/composition-contract/index.ts';
import { loadReferenceBoard, projectReferenceAssembly, resolveReferenceBoard, type ImageFragmentProvenance, type ImageFragmentResolver, type ImageFragmentTransfer } from '../core/ref/board.ts';
import { parseReferenceBoard } from '../core/ref/board-parser.ts';
import { similarity } from '../core/ref/distance.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import { persistImageFragment } from '../core/ref/image-fragment.ts';
import type { Blueprint, Invariants, Reference, RefKind } from '../core/types.ts';

const root = (context: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-ref-board-'));
  mkdirSync(join(directory, '.omd', 'refs'), { recursive: true });
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const chunk = (type: string, bytes: Buffer): Buffer => {
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const body = Buffer.concat([Buffer.from(type), bytes]);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, checksum]);
};
const png = (colorType: 0 | 2 = 2): Buffer => {
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = colorType;
  const pixels = colorType === 0 ? Buffer.from([0, 1]) : Buffer.from([0, 1, 2, 3]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
};
const blueprint = (selector: string): Blueprint => ({ selector, capturedAt: '2026-07-18T00:00:00.000Z', nodes: [{ id: 'source-blueprint-node', role: 'container', children: [], box: { w: 160, h: 40 }, padding: [8, 8, 8, 8] }] });
const MEASURED: Invariants = { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] };
type Capture = { readonly ref: Reference; readonly referenceId: string; readonly image: string };
type CapturePatch = { readonly selector?: string | null; readonly blueprint?: Blueprint | null; readonly imagePath?: string | null };
const capture = (directory: string, component: string, kind: RefKind = 'component', patch: CapturePatch = {}): Capture => {
  const source = `https://source.example/${component}?instruction=ignore-this-source-prose`;
  const image = refImagePath(directory, { source, component });
  const selector = patch.selector === null ? undefined : patch.selector ?? '[data-source-selector="secret"]';
  const capturedBlueprint = patch.blueprint === null ? undefined : patch.blueprint ?? blueprint('[data-source-selector="secret"]');
  const imagePath = patch.imagePath === null ? undefined : patch.imagePath ?? relative(directory, image);
  const ref: Reference = {
    source, component, kind, capturedAt: '2026-07-18T00:00:00.000Z', invariants: MEASURED, principles: ['Keep hierarchy distinct.'],
    ...(selector === undefined ? {} : { selector }), ...(capturedBlueprint === undefined ? {} : { blueprint: capturedBlueprint }), ...(imagePath === undefined ? {} : { imagePath }),
  };
  saveRef(directory, ref);
  if (ref.imagePath !== undefined && ref.imagePath === relative(directory, image)) writeFileSync(image, png());
  return { ref, referenceId: refIdentity(source, component), image };
};
const piece = (referenceId: string, patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  slotId: 'hero', sourceKind: 'component-capture', referenceId, targetComponent: 'hero', targetSelector: 'main > [data-board="hero"]', taskIds: ['T1'], reason: 'Establish the primary reading path.', take: ['structure'], avoid: 'Do not reproduce source copy.', adaptation: 'Use local spacing tokens.', grid: { column: 1, span: 6, order: 0 }, ...patch,
});
const candidate = (id: string, referenceId: string, pieces: readonly Record<string, unknown>[] = [piece(referenceId)]): Record<string, unknown> => ({ id, label: `Candidate ${id}`, route: '/work', rationale: 'A measured structure for local adaptation.', pieces });
const manifest = (candidates: readonly Record<string, unknown>[], patch: Record<string, unknown> = {}): Record<string, unknown> => ({ schemaVersion: 'reference-board-v1', frameSha256: 'a'.repeat(64), candidates, ...patch });
const writeBoard = (directory: string, value: unknown): void => writeFileSync(join(directory, '.omd', 'reference-board.json'), JSON.stringify(value));

test('reference board resolves multiple component captures and emits deterministic sanitized assembly bytes', (context) => {
  // Given: two captured components whose manifest order differs from canonical identity order.
  const directory = root(context);
  const second = capture(directory, 'second'); const first = capture(directory, 'first');
  writeBoard(directory, manifest([candidate('zeta', second.referenceId, [piece(second.referenceId, { slotId: 'later', grid: { column: 7, span: 6, order: 1 } })]), candidate('alpha', first.referenceId)]));

  // When: the board joins its captures and projects the downstream assembly twice.
  const firstBytes = JSON.stringify(projectReferenceAssembly(loadReferenceBoard(directory)));
  const secondBytes = JSON.stringify(projectReferenceAssembly(loadReferenceBoard(directory)));

  // Then: ordering is stable and no source-private material crosses the boundary.
  assert.equal(firstBytes, secondBytes);
  assert.deepEqual(projectReferenceAssembly(loadReferenceBoard(directory)).candidates.map((value) => value.id), ['alpha', 'zeta']);
  for (const privateValue of ['source.example', 'source-selector', '.omd/refs', 'referenceId', 'sourceKind']) assert.doesNotMatch(firstBytes, new RegExp(privateValue.replace(/[.]/g, '\\.')));
  const transfer = projectReferenceAssembly(loadReferenceBoard(directory)).candidates[0]?.pieces[0]?.transfer;
  assert.ok(transfer); assert.deepEqual(Object.keys(transfer).sort(), ['blueprint', 'invariants', 'principles']);
  assert.deepEqual(transfer, { invariants: MEASURED, principles: ['Keep hierarchy distinct.'], blueprint: { nodes: [{ role: 'container', children: [], box: { w: 160, h: 40 }, padding: [8, 8, 8, 8] }] } });
  assert.notEqual(transfer.invariants, MEASURED); assert.notEqual(transfer.principles, first.ref.principles);
});

test('reference board rejects closed-key, candidate, source, and grid contract violations', (context) => {
  // Given: a valid captured component and malformed manifest variants.
  const directory = root(context); const component = capture(directory, 'component');
  const invalid = [
    manifest([candidate('one', component.referenceId)], { unexpected: true }),
    manifest([{ ...candidate('one', component.referenceId), unexpected: true }]),
    manifest([candidate('one', component.referenceId, [{ ...piece(component.referenceId), unexpected: true }])]),
    manifest([candidate('one', component.referenceId), candidate('one', component.referenceId)]),
    manifest([candidate('one', component.referenceId, [piece(component.referenceId), piece(component.referenceId, { slotId: 'hero', grid: { column: 7, span: 6, order: 1 } })])]),
    manifest([candidate('one', component.referenceId, [piece(component.referenceId), piece(component.referenceId, { slotId: 'aside', grid: { column: 7, span: 6, order: 0 } })])]),
    manifest([candidate('one', component.referenceId, [piece(component.referenceId, { taskIds: [] })])]),
    manifest([{ ...candidate('one', component.referenceId), route: 'https://outside.example/work' }]),
    ...['http://outside.example/target', 'https://outside.example/target', '//outside.example/target', 'data:text/html,poison', 'file:///secret', 'blob:https://source.example/x', 'www.source.example', '  ', '<img src=x>', '[data-board="x"]\u0000'].map((targetSelector) => manifest([candidate('one', component.referenceId, [piece(component.referenceId, { targetSelector })])])),
    manifest([candidate('one', 'ref-0000000000000000')]),
    manifest([candidate('one', component.referenceId, [piece(component.referenceId, { sourceKind: 'page' })])]),
    manifest([candidate('one', component.referenceId, [piece(component.referenceId, { grid: { column: 0, span: 6, order: 0 } })])]),
    manifest([candidate('one', component.referenceId, [piece(component.referenceId, { grid: { column: 8, span: 6, order: 0 } })])]),
    manifest([], { candidates: [] }),
  ];

  // When / Then: each boundary violation fails before an assembly is returned.
  for (const value of invalid) { writeBoard(directory, value); assert.throws(() => loadReferenceBoard(directory)); }
});

test('reference board rejects page/image captures and incomplete component capture joins', (context) => {
  // Given: records that are not complete scoped component captures.
  const directory = root(context);
  const invalid = [
    capture(directory, 'page', 'page'), capture(directory, 'image', 'image'),
    capture(directory, 'no-selector', 'component', { selector: null }),
    capture(directory, 'no-blueprint', 'component', { blueprint: null }),
    capture(directory, 'no-image', 'component', { imagePath: null }),
  ];

  // When / Then: no unsupported or incomplete capture can resolve as a board piece.
  for (const entry of invalid) { writeBoard(directory, manifest([candidate('one', entry.referenceId)])); assert.throws(() => loadReferenceBoard(directory)); }
});

test('reference board rejects untrusted image paths, symlinks, and forged PNG bytes', (context) => {
  // Given: a valid capture whose persisted image reference is progressively attacked.
  const directory = root(context); const entry = capture(directory, 'secured');
  const attacks = ['../escape.png', '.omd/refs/../escape.png', '%2e%2e/escape.png', '/tmp/escape.png', '.omd/refs/missing.png', '.omd/refs/not-a-png.jpg'];

  // When / Then: lexical path attacks are rejected before any projection.
  for (const imagePath of attacks) { saveRef(directory, { ...entry.ref, imagePath }); writeBoard(directory, manifest([candidate('one', entry.referenceId)])); assert.throws(() => loadReferenceBoard(directory)); }
  saveRef(directory, { ...entry.ref, imagePath: relative(directory, entry.image) }); writeFileSync(entry.image, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  writeBoard(directory, manifest([candidate('one', entry.referenceId)])); assert.throws(() => loadReferenceBoard(directory));
  writeFileSync(entry.image, png(0)); assert.doesNotThrow(() => loadReferenceBoard(directory));
  writeFileSync(entry.image, png()); const linked = join(directory, '.omd', 'refs', 'linked.png'); symlinkSync(entry.image, linked);
  saveRef(directory, { ...entry.ref, imagePath: relative(directory, linked) }); assert.throws(() => loadReferenceBoard(directory));
});

test('reference board requires each image fragment to exist in the persisted record store', (context) => {
  // Given: an otherwise valid image-fragment piece without a persisted record.
  const directory = root(context);
  writeBoard(directory, manifest([candidate('fragment', 'fragment-1', [piece('fragment-1', { sourceKind: 'image-fragment' })])]));

  // When / Then: default resolution fails closed instead of accepting an unpersisted source.
  assert.throws(() => loadReferenceBoard(directory), /stable fragment identity/);
});

test('reference board projects only sanitized transfer from an injected image-fragment resolver', (context) => {
  // Given: a valid local image plus raw fragment provenance.
  const directory = root(context); const entry = capture(directory, 'fragment-image'); const board = manifest([candidate('fragment', 'fragment-1', [piece('fragment-1', { sourceKind: 'image-fragment' })])]);
  const resolver: ImageFragmentResolver = { resolve(_root, input) { return { ...input, imagePath: relative(directory, entry.image), provenance: { sourcePage: 'https://private.example/page', sourceImage: 'https://private.example/image.png', captureRegion: 'hero', cropBox: { x: 0, y: 0, width: 20, height: 10 }, licenseStatus: 'allowed', rightsNotes: 'Internal record.', capturedAt: '2026-07-18T00:00:00.000Z' }, transfer: { visualRole: 'atmosphere', principles: ['Use as a local abstract accent.'], geometry: { width: 20, height: 10, aspectRatio: 2 } } }; } };

  // When: a resolver supplies the typed fragment record.
  const output = projectReferenceAssembly(resolveReferenceBoard(directory, parseReferenceBoard(board), resolver)); const outputPiece = output.candidates[0]?.pieces[0];

  // Then: assembly keeps the closed piece shape and excludes identity, path, and provenance.
  assert.ok(outputPiece); assert.deepEqual(Object.keys(outputPiece).sort(), ['adaptation', 'avoid', 'grid', 'reason', 'slotId', 'take', 'targetComponent', 'targetSelector', 'taskIds', 'transfer']);
  assert.deepEqual(outputPiece.transfer, { visualRole: 'atmosphere', principles: ['Use as a local abstract accent.'], geometry: { width: 20, height: 10, aspectRatio: 2 } });
  for (const privateValue of ['referenceId', 'sourceKind', 'imagePath', 'provenance', 'private.example']) assert.doesNotMatch(JSON.stringify(output), new RegExp(privateValue.replace(/[.]/g, '\\.')));
});

test('reference board rejects contaminated fragment transfer text and invalid raw provenance', (context) => {
  // Given: a fragment resolver with one valid local image and typed baseline records.
  const directory = root(context); const entry = capture(directory, 'fragment-guard'); const board = parseReferenceBoard(manifest([candidate('fragment', 'fragment-1', [piece('fragment-1', { sourceKind: 'image-fragment' })])]));
  const transfer: ImageFragmentTransfer = { visualRole: 'atmosphere', principles: ['Use as a local abstract accent.'] }; const provenance: ImageFragmentProvenance = { sourcePage: 'https://source.example/page', captureRegion: 'hero', licenseStatus: 'allowed', rightsNotes: 'Internal record.', capturedAt: '2026-07-18T00:00:00.000Z' };
  const resolver = (nextTransfer = transfer, nextProvenance = provenance): ImageFragmentResolver => ({ resolve(_root, input) { return { ...input, imagePath: relative(directory, entry.image), provenance: nextProvenance, transfer: nextTransfer }; } });

  // When / Then: source-bearing transfer strings and malformed provenance never resolve.
  const payloads = ['http://source.example', 'https://source.example', '//source.example', 'source.unlisted', 'source.xn--3e0b707e', 'source.example.', '192.0.2.1', '[2001:db8::1]', '::1', '1::', 'fe80::1', '[fe80::1]', 'localhost', 'javascript:alert(1)', 'mailto:source@example.test', 'custom+scheme:payload', 'data:image/png;base64,x', 'file:///secret', 'blob:https://source.example/x', '<img src=x>', 'text\u0000payload', '/private/crop.png', 'C:\\private\\crop.png', '\\\\server\\share\\crop.png', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'A'.repeat(160), './capture.png', '../capture.png', '.\\capture.png', '..\\capture.png', 'capture.png', 'assets/crop.png', 'assets\\crop.png', '.omd/refs/crop.png', '.omd\\refs\\crop.png', 'assets/reference/crop', './capture', '../capture', 'folder\\capture', '/', '%2Fprivate%2Fcrop', 'capture', 'screenshot', 'crop', 'reference', 'image', 'fragment-0123456789abcdef', 'ref-0123456789abcdef'];
  for (const visualRole of payloads) assert.throws(() => resolveReferenceBoard(directory, board, resolver({ ...transfer, visualRole })));
  assert.throws(() => resolveReferenceBoard(directory, board, resolver({ ...transfer, principles: [] })));
  for (const principle of [...payloads, '<picture>']) assert.throws(() => resolveReferenceBoard(directory, board, resolver({ ...transfer, principles: [principle] })));
  for (const visualRole of ['background texture', 'hero emphasis', 'editorial rhythm']) {
    assert.doesNotThrow(() => resolveReferenceBoard(directory, board, resolver({ visualRole, principles: ['Keep the contrast gentle and readable.'] })));
  }
  for (const reason of payloads) assert.throws(() => parseReferenceBoard(manifest([candidate('fragment', entry.referenceId, [piece('fragment-1', { sourceKind: 'image-fragment', reason })])] )));
  for (const sourcePage of ['/relative', 'file:///secret', 'not-a-url']) assert.throws(() => resolveReferenceBoard(directory, board, resolver(transfer, { ...provenance, sourcePage })));
  for (const sourceImage of ['/relative', 'blob:https://source.example/x']) assert.throws(() => resolveReferenceBoard(directory, board, resolver(transfer, { ...provenance, sourceImage })));
  for (const capturedAt of ['2026-07-18', '2026-07-18T00:00:00Z', '2026-99-99T00:00:00.000Z']) assert.throws(() => resolveReferenceBoard(directory, board, resolver(transfer, { ...provenance, capturedAt })));
});

test('public persistence-to-assembly boundary rejects local carriers across fragment component and manifest surfaces', (context) => {
  // Given: one persisted fragment and one component capture in a two-candidate reference board.
  const directory = root(context); const component = capture(directory, 'assembly-component');
  const fragment = persistImageFragment(directory, {
    inputPath: relative(directory, component.image),
    provenance: { sourcePage: 'https://source.example/fragment', captureRegion: 'hero texture', licenseStatus: 'unknown', rightsNotes: 'Verify rights before publication.', capturedAt: '2026-07-18T00:00:00.000Z' },
    transfer: { visualRole: 'atmosphere', principles: ['Use a local abstract accent.'] },
  });
  const good = manifest([
    candidate('alpha', fragment.id, [piece(fragment.id, { slotId: 'texture', sourceKind: 'image-fragment' })]),
    candidate('beta', component.referenceId, [piece(component.referenceId, { slotId: 'hero' })]),
  ]);
  const payloads = ['assets/reference/crop', 'folder\\capture', './capture', '../capture', '/', '%2Fprivate%2Fcrop', 'fragment-0123456789abcdef'];
  writeBoard(directory, good);
  assert.equal(projectReferenceAssembly(loadReferenceBoard(directory)).candidates.length, 2);

  // When / Then: each public input boundary rejects source-local carriers before downstream assembly.
  for (const visualRole of payloads) assert.throws(() => persistImageFragment(directory, {
    inputPath: relative(directory, component.image),
    provenance: { sourcePage: 'https://source.example/fragment', captureRegion: 'hero texture', licenseStatus: 'unknown', rightsNotes: 'Verify rights before publication.', capturedAt: '2026-07-18T00:00:00.000Z' },
    transfer: { visualRole, principles: ['Use a local abstract accent.'] },
  }));
  for (const principle of payloads) { saveRef(directory, { ...component.ref, principles: [principle] }); assert.throws(() => loadReferenceBoard(directory)); }
  saveRef(directory, component.ref);
  for (const reason of payloads) {
    writeBoard(directory, manifest([
      candidate('alpha', fragment.id, [piece(fragment.id, { slotId: 'texture', sourceKind: 'image-fragment', reason })]),
      candidate('beta', component.referenceId, [piece(component.referenceId, { slotId: 'hero' })]),
    ]));
    assert.throws(() => loadReferenceBoard(directory));
  }
});

test('reference board is a readonly side artifact for composition and distance', (context) => {
  // Given: a component board alongside existing composition and similarity inputs.
  const directory = root(context); const entry = capture(directory, 'isolated');
  const compositionBefore = validateCompositionContract(directory); const distanceBefore = similarity(MEASURED, MEASURED);
  writeBoard(directory, manifest([candidate('one', entry.referenceId)]));

  // When: the board is loaded through its public API.
  loadReferenceBoard(directory);

  // Then: existing composition and distance behavior remains unchanged.
  assert.deepEqual(validateCompositionContract(directory), compositionBefore); assert.equal(similarity(MEASURED, MEASURED), distanceBefore);
});

test('reference board rejects component captures without measured invariants', (context) => {
  // Given: a captured component whose persisted measurements are absent.
  const directory = root(context); const entry = capture(directory, 'unmeasured');
  saveRef(directory, { ...entry.ref, invariants: null }); writeBoard(directory, manifest([candidate('one', entry.referenceId)]));

  // When / Then: a transfer cannot be assembled from unmeasured source data.
  assert.throws(() => loadReferenceBoard(directory), /measured invariants/);
});

test('reference board uses locale-independent code-unit candidate ordering', (context) => {
  // Given: candidate IDs whose ä/z ordering varies under locale collation.
  const directory = root(context); const captureA = capture(directory, 'a'); const captureZ = capture(directory, 'z');
  writeBoard(directory, manifest([candidate('ä', captureA.referenceId), candidate('z', captureZ.referenceId)]));

  // When: the canonical assembly is projected.
  const ids = projectReferenceAssembly(loadReferenceBoard(directory)).candidates.map((entry) => entry.id);

  // Then: byte/code-unit order remains z then ä, independent of host locale.
  assert.deepEqual(ids, ['z', 'ä']);
});
