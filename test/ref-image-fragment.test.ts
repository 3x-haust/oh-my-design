import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync, crc32 } from 'node:zlib';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test, { type TestContext } from 'node:test';
import { loadReferenceBoard, projectReferenceAssembly } from '../core/ref/board.ts';
import { persistImageFragment, readImageFragment, type ImageFragmentInput } from '../core/ref/image-fragment.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';

const root = (context: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-image-fragment-'));
  mkdirSync(join(directory, '.omd', 'refs'), { recursive: true });
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const chunk = (type: string, bytes: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const body = Buffer.concat([Buffer.from(type), bytes]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, checksum]);
};
const png = (pixel = Buffer.from([0, 1, 2, 3])): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixel)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
const writePng = (directory: string, name: string, bytes = png()): string => {
  const path = join(directory, '.omd', 'refs', name);
  writeFileSync(path, bytes);
  return relative(directory, path);
};
const input = (inputPath: string, sourcePage = 'https://gallery.example/pin/one'): ImageFragmentInput => ({
  inputPath,
  provenance: {
    sourcePage,
    sourceImage: 'https://cdn.gallery.example/pin/one.png',
    captureRegion: 'caption image',
    cropBox: { x: 0, y: 0, width: 1, height: 1 },
    licenseStatus: 'unknown',
    rightsNotes: 'Verify rights before publication.',
    capturedAt: '2026-07-18T00:00:00.000Z',
  },
  transfer: {
    visualRole: 'background texture',
    principles: ['Use only as an abstract local texture.'],
    geometry: { width: 1, height: 1, aspectRatio: 1 },
  },
});
const piece = (referenceId: string): Record<string, unknown> => ({
  slotId: 'texture',
  sourceKind: 'image-fragment',
  referenceId,
  targetComponent: 'hero',
  targetSelector: '.hero',
  taskIds: ['T1'],
  reason: 'Ground the local visual field.',
  take: ['density'],
  avoid: 'Avoid reproducing the source composition.',
  adaptation: 'Use local tokens and local copy.',
  grid: { column: 1, span: 12, order: 0 },
  evidenceAxes: { rights: 'unknown', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' },
});
const board = (referenceId: string): Record<string, unknown> => ({
  schemaVersion: 'reference-board-v1',
  frameSha256: 'a'.repeat(64),
  candidates: [
    { id: 'alpha', label: 'Alpha', route: '/alpha', rationale: 'One local route.', pieces: [piece(referenceId)] },
    { id: 'beta', label: 'Beta', route: '/beta', rationale: 'Another local route.', pieces: [piece(referenceId)] },
  ],
});
const isMissingPathError = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';
const fragmentFiles = (directory: string): readonly string[] => {
  const path = join(directory, '.omd', 'refs', 'fragments');
  try {
    return readdirSync(path).sort();
  } catch (error) {
    if (isMissingPathError(error)) return [];
    throw error;
  }
};

test('fragment file listing rethrows a nonmissing directory-read error', (context) => {
  // Given: a corrupt fragment-store path that is a regular file rather than a directory.
  const directory = root(context);
  writeFileSync(join(directory, '.omd', 'refs', 'fragments'), 'not a directory');

  // When / Then: an IO error is visible instead of being treated as an empty store.
  assert.throws(() => fragmentFiles(directory), /ENOTDIR/);
});

test('image fragments persist content-addressed PNG bytes and provenance-addressed records', (context) => {
  // Given: two local PNG inputs with identical bytes but distinct source-page provenance.
  const directory = root(context);
  const invocation = createTestProjectRunInvocation(directory);
  const firstPath = writePng(directory, 'first.png');
  const secondPath = writePng(directory, 'second.png');
  const first = persistImageFragment(directory, input(firstPath), invocation);

  // When: the second provenance record and an idempotent first record are persisted.
  const second = persistImageFragment(directory, input(secondPath, 'https://gallery.example/pin/two'), invocation);
  const repeated = persistImageFragment(directory, input(firstPath), invocation);

  // Then: one content-derived PNG backs two stable, separately retained provenance records.
  const sha256 = createHash('sha256').update(png()).digest('hex');
  assert.equal(first.sha256, sha256);
  assert.equal(first.imagePath, `.omd/refs/fragments/${sha256}.png`);
  assert.notEqual(first.id, second.id);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.imagePath, second.imagePath);
  assert.deepEqual(repeated, first);
  assert.deepEqual(readImageFragment(directory, second.id).provenance.sourcePage, 'https://gallery.example/pin/two');
  assert.deepEqual(fragmentFiles(directory), [`${sha256}.png`, `${first.id}.json`, `${second.id}.json`].sort());
  assert.equal(readFileSync(join(directory, first.imagePath)).equals(png()), true);
});

test('image fragments reject untrusted input before any fragment bytes or metadata are copied', (context) => {
  // Given: a valid local PNG plus malformed source, rights, crop, schema, and PNG boundaries.
  const directory = root(context);
  const invocation = createTestProjectRunInvocation(directory);
  const goodPath = writePng(directory, 'good.png');
  const badPath = writePng(directory, 'bad.png', Buffer.from('not a PNG'));
  const invalid: readonly unknown[] = [
    { ...input('https://gallery.example/pin.png') },
    { ...input(goodPath), provenance: { ...input(goodPath).provenance, sourcePage: '/relative' } },
    { ...input(goodPath), provenance: { ...input(goodPath).provenance, licenseStatus: 'inferred' } },
    { ...input(goodPath), provenance: { ...input(goodPath).provenance, cropBox: { x: 0, y: 0, width: 0, height: 1 } } },
    { ...input(goodPath), provenance: { ...input(goodPath).provenance, capturedAt: '2026-07-18T00:00:00Z' } },
    { ...input(goodPath), provenance: { ...input(goodPath).provenance, unexpected: true } },
    { ...input(goodPath), transfer: { ...input(goodPath).transfer, principles: [] } },
    ...['./capture.png', '../capture.png', '.\\capture.png', '..\\capture.png', 'capture.png', 'assets/crop.png', 'assets\\crop.png', '.omd/refs/crop.png', '.omd\\refs\\crop.png', 'assets/reference/crop', './capture', '../capture', 'folder\\capture', '/', '%2Fprivate%2Fcrop', 'capture', 'screenshot', 'crop', 'reference', 'image', 'fragment-0123456789abcdef', 'ref-0123456789abcdef'].map((visualRole) => ({ ...input(goodPath), transfer: { ...input(goodPath).transfer, visualRole } })),
    ...['assets/reference/crop', 'folder\\capture', '%2Fprivate%2Fcrop', 'fragment-0123456789abcdef'].map((sourceText) => ({ ...input(goodPath), provenance: { ...input(goodPath).provenance, captureRegion: sourceText } })),
    ...['assets/reference/crop', 'folder\\capture', '%2Fprivate%2Fcrop', 'ref-0123456789abcdef'].map((sourceText) => ({ ...input(goodPath), provenance: { ...input(goodPath).provenance, rightsNotes: sourceText } })),
    { ...input(goodPath), unexpected: true },
    input(badPath),
  ];

  // When / Then: every unsafe boundary fails while the closed fragment store remains empty.
  for (const value of invalid) assert.throws(() => persistImageFragment(directory, value, invocation));
  assert.deepEqual(fragmentFiles(directory), []);
  for (const [index, visualRole] of ['background texture', 'hero emphasis', 'editorial rhythm'].entries()) {
    const accepted = input(goodPath, `https://gallery.example/pin/accepted-${index}`);
    assert.doesNotThrow(() => persistImageFragment(directory, { ...accepted, transfer: { ...accepted.transfer, visualRole } }, invocation));
  }
});

test('image fragments reject a traversal-shaped record identity before filesystem lookup', (context) => {
  // Given: an otherwise empty project and a reference ID that would escape the fragments directory.
  const directory = root(context);

  // When / Then: the record ID fails as data instead of becoming a filesystem path.
  for (const id of ['../../secrets', '/absolute', 'fragment-0123456789abcdef/', 'fragment-0123456789abcdef%2f', 'fragment-0123456789abcdef\u0000']) {
    assert.throws(() => readImageFragment(directory, id), /stable fragment identity/);
  }
});

test('image fragments reject preexisting foreign image targets before writing provenance metadata', (context) => {
  // Given: a content-addressed target occupied by corrupt, different, or symlinked bytes.
  const sourceBytes = png();
  const sha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const scenarios: readonly [string, (directory: string, target: string) => Buffer][] = [
    ['corrupt', (_directory, target) => { const bytes = Buffer.from('not an image'); writeFileSync(target, bytes); return bytes; }],
    ['different', (_directory, target) => { const bytes = png(Buffer.from([0, 9, 8, 7])); writeFileSync(target, bytes); return bytes; }],
    ['symlinked', (directory, target) => { const foreign = join(directory, 'foreign.png'); const bytes = png(Buffer.from([0, 7, 8, 9])); writeFileSync(foreign, bytes); symlinkSync(foreign, target); return bytes; }],
  ];

  // When / Then: persistence fails, leaves foreign bytes intact, and publishes no record.
  for (const [_label, occupy] of scenarios) {
    const directory = root(context);
    const invocation = createTestProjectRunInvocation(directory);
    const sourcePath = writePng(directory, 'capture.png', sourceBytes);
    const target = join(directory, '.omd', 'refs', 'fragments', `${sha256}.png`);
    mkdirSync(join(directory, '.omd', 'refs', 'fragments'));
    const foreignBytes = occupy(directory, target);
    assert.throws(() => persistImageFragment(directory, input(sourcePath), invocation));
    assert.equal(readFileSync(target).equals(foreignBytes), true);
    assert.deepEqual(fragmentFiles(directory), [`${sha256}.png`]);
  }
});

test('image fragments preserve a preexisting foreign target and publish no record', (context) => {
  // Given: a content-addressed target already occupied by foreign bytes.
  const directory = root(context);
  const invocation = createTestProjectRunInvocation(directory);
  const sourceBytes = png();
  const sourcePath = writePng(directory, 'capture.png', sourceBytes);
  const sha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const target = join(directory, '.omd', 'refs', 'fragments', `${sha256}.png`);
  const foreignBytes = png(Buffer.from([0, 7, 8, 9]));
  mkdirSync(join(directory, '.omd', 'refs', 'fragments'));
  writeFileSync(target, foreignBytes);

  // When / Then: guarded publication rejects without overwriting or recording the foreign target.
  assert.throws(() => persistImageFragment(directory, input(sourcePath), invocation));
  assert.equal(readFileSync(target).equals(foreignBytes), true);
  assert.deepEqual(fragmentFiles(directory), [`${sha256}.png`]);
});

test('image fragment reads reject a project .omd symlink before record lookup', (context) => {
  // Given: a project whose .omd ancestor has been redirected outside its real root.
  const directory = root(context);
  const external = join(directory, 'external-omd');
  rmSync(join(directory, '.omd'), { recursive: true });
  mkdirSync(join(external, 'refs', 'fragments'), { recursive: true });
  symlinkSync(external, join(directory, '.omd'));

  // When / Then: a valid-looking record ID cannot cause a board fragment read through it.
  assert.throws(() => readImageFragment(directory, 'fragment-0123456789abcdef'), /symlinked project .omd/);
});

test('default board resolution retains fragment provenance while its assembly exposes transfer only', (context) => {
  // Given: a persisted gallery fragment referenced by two viable local candidates.
  const directory = root(context);
  const invocation = createTestProjectRunInvocation(directory);
  const stored = persistImageFragment(directory, input(writePng(directory, 'capture.png'), 'https://private.example/pin/one'), invocation);
  writeFileSync(join(directory, '.omd', 'reference-board.json'), `${JSON.stringify(board(stored.id), null, 2)}\n`);

  // When: the board uses its persisted default resolver and projects a downstream assembly.
  const raw = loadReferenceBoard(directory);
  const assembly = projectReferenceAssembly(raw);

  // Then: raw records retain provenance, but the assembly has no identity, location, source, or pixels.
  assert.equal(raw.candidates.length, 2);
  const rawPieces = raw.candidates.map((candidate) => candidate.pieces[0]);
  assert.deepEqual(rawPieces.map((piece) => piece?.sourceKind === 'image-fragment' ? piece.referenceId : null), [stored.id, stored.id]);
  const rawPiece = rawPieces[0];
  assert.ok(rawPiece !== undefined && rawPiece.sourceKind === 'image-fragment');
  assert.equal(rawPiece.provenance.sourcePage, 'https://private.example/pin/one');
  const serialized = JSON.stringify(assembly);
  for (const privateValue of [stored.id, stored.sha256, stored.imagePath, 'private.example', 'cdn.gallery.example', 'capture.png']) {
    assert.doesNotMatch(serialized, new RegExp(privateValue.replace(/[.]/g, '\\.')));
  }
  assert.deepEqual(assembly.candidates.map((candidate) => {
    const transfer = candidate.pieces[0]?.transfer;
    return transfer !== undefined && 'visualRole' in transfer ? transfer.visualRole : null;
  }), ['background texture', 'background texture']);
  for (const candidate of assembly.candidates) {
    const transfer = candidate.pieces[0]?.transfer;
    assert.ok(transfer !== undefined && 'visualRole' in transfer);
    assert.deepEqual(Object.keys(transfer).sort(), ['geometry', 'principles', 'visualRole']);
  }
});
