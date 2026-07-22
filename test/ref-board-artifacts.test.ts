import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { deflateSync, crc32 } from 'node:zlib';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import test, { type TestContext } from 'node:test';
import { readReferenceBoardArtifacts, sha256 } from '../core/ref/board-artifacts.ts';
import { refIdentity } from '../core/ref/identity.ts';
import { persistImageFragment } from '../core/ref/image-fragment.ts';
import { parseReferenceSelectionV2, selectReferenceCandidate, validateReferenceSelection, validateReferenceSelectionV2 } from '../core/ref/reference-selection.ts';
import { refImagePath, saveRef } from '../core/ref/store.ts';
import type { Blueprint, Invariants, Reference } from '../core/types.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';

const CLI = new URL('../bin/omd.ts', import.meta.url).pathname;

const root = (context: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-board-artifacts-'));
  mkdirSync(join(directory, '.omd', 'refs'), { recursive: true });
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const chunk = (type: string, bytes: Buffer): Buffer => {
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const body = Buffer.concat([Buffer.from(type), bytes]); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, checksum]);
};
const png = (red: number): Buffer => {
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, red, 52, 86]))), chunk('IEND', Buffer.alloc(0))]);
};
const invariants: Invariants = { spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0, tokenCoverage: 1, paddingWeight: 8, typeScale: [], fontFamilies: [], weightLadder: [], motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0, animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] };
const blueprint = (selector: string): Blueprint => ({ selector, capturedAt: '2026-07-18T00:00:00.000Z', nodes: [{ id: 'node', role: 'container', children: [], box: { w: 160, h: 40 } }] });
type Fixture = { readonly component: Reference; readonly componentImage: string; readonly fragmentRecord: string; readonly root: string; readonly invocation: ReturnType<typeof createTestProjectRunInvocation>; readonly writer: ReturnType<typeof createTestProjectWriteAdapter> };
const fixture = (context: TestContext): Fixture => {
  const directory = root(context); const writer = createTestProjectWriteAdapter(directory); const invocation = createTestProjectRunInvocation(directory); const source = 'https://capture.example/card'; const component = 'card'; const componentImage = refImagePath(directory, { source, component });
  const reference: Reference = { source, component, kind: 'component', capturedAt: '2026-07-18T00:00:00.000Z', selector: '[data-card]', invariants, principles: ['Keep hierarchy distinct.'], blueprint: blueprint('[data-card]'), imagePath: relative(directory, componentImage) };
  saveRef(directory, reference, writer); writeFileSync(componentImage, png(12));
  const fragment = persistImageFragment(directory, { inputPath: relative(directory, componentImage), provenance: { sourcePage: 'https://gallery.example/reference', captureRegion: 'hero image', licenseStatus: 'allowed', rightsNotes: 'Licensed for the declared local abstract study.', capturedAt: '2026-07-18T00:00:00.000Z' }, transfer: { visualRole: 'atmosphere', principles: ['Use only as a local abstract accent.'] } }, invocation);
  const componentId = refIdentity(source, component);
  writeFileSync(join(directory, '.omd', 'reference-board.json'), JSON.stringify({ schemaVersion: 'reference-board-v1', frameSha256: 'a'.repeat(64), candidates: [{ id: 'candidate', label: 'Candidate', route: '/work', rationale: 'Raw evidence must bind local capture changes.', pieces: [{ slotId: 'component', sourceKind: 'component-capture', referenceId: componentId, targetComponent: 'hero', targetSelector: '[data-board="hero"]', taskIds: ['T1'], reason: 'Use measured hierarchy.', take: ['structure'], avoid: 'Do not reproduce source copy.', adaptation: 'Use local spacing tokens.', evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' }, grid: { column: 1, span: 6, order: 0 } }, { slotId: 'fragment', sourceKind: 'image-fragment', referenceId: fragment.id, targetComponent: 'hero', targetSelector: '[data-board="hero"]', taskIds: ['T1'], reason: 'Keep a local color study.', take: ['density'], avoid: 'Do not reproduce source composition.', adaptation: 'Use local spacing tokens.', evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' }, grid: { column: 7, span: 6, order: 1 } }] }] }));
  return { component: reference, componentImage, fragmentRecord: join(directory, '.omd', 'refs', 'fragments', `${fragment.id}.json`), root: directory, invocation, writer };
};

test('raw board artifacts bind resolved provenance and capture bytes without leaking assembly fields', (context) => {
  // Given: a board with both a scoped component capture and a persisted image fragment.
  const value = fixture(context);

  // When: the board emits its raw and sanitized canonical artifacts.
  const artifacts = readReferenceBoardArtifacts(value.root);
  const component = artifacts.raw.candidates[0]?.pieces[0];
  const fragment = artifacts.raw.candidates[0]?.pieces[1];
  if (component?.evidence.kind !== 'component-capture' || fragment?.evidence.kind !== 'image-fragment') throw new Error('fixture must resolve a component and image fragment');

  // Then: raw evidence is closed and attributable while assembly remains source-free.
  assert.equal(component.evidence.capturedAt, value.component.capturedAt);
  assert.equal(typeof component.evidence.imageSha256, 'string');
  assert.equal(fragment.evidence.sourcePage, 'https://gallery.example/reference');
  assert.doesNotMatch(artifacts.assemblyBytes, /capture\.example|gallery\.example|imagePath|capturedAt|imageSha256/);
});

test('selection rejects component and fragment raw-evidence mutations', (context) => {
  // Given: a selected board with trusted capture, component metadata, and fragment provenance.
  const value = fixture(context); const selected = (): void => { selectReferenceCandidate(value.root, 'candidate', value.invocation); };

  // When: each raw evidence source changes without changing the manifest shape.
  selected(); writeFileSync(value.componentImage, png(34)); assert.throws(() => validateReferenceSelection(value.root), /board hash/);
  writeFileSync(value.componentImage, png(12)); selected(); saveRef(value.root, { ...value.component, capturedAt: '2026-07-19T00:00:00.000Z' }, value.writer); assert.throws(() => validateReferenceSelection(value.root), /board hash/);
  saveRef(value.root, value.component, value.writer); const alternate = join(value.root, '.omd', 'refs', 'alternate.png'); writeFileSync(alternate, png(12)); selected(); saveRef(value.root, { ...value.component, imagePath: relative(value.root, alternate) }, value.writer); assert.throws(() => validateReferenceSelection(value.root), /board hash/);
  saveRef(value.root, value.component, value.writer); selected(); writeFileSync(value.fragmentRecord, readFileSync(value.fragmentRecord, 'utf8').replace('hero image', 'secondary texture')); assert.throws(() => validateReferenceSelection(value.root), /board hash/);

  // Then: any raw capture identity, bytes, or provenance change makes the closed selection stale.
  assert.equal(readReferenceBoardArtifacts(value.root).assembly.candidates[0]?.id, 'candidate');
});

test('board artifacts canonicalize an ancestor-symlink project alias after CLI selection', (context) => {
  // Given: one project is reachable through a symlinked ancestor without symlinking the project directory itself.
  const value = fixture(context); const aliasParent = join(dirname(value.root), `omd-board-artifacts-alias-${basename(value.root)}`);
  symlinkSync(dirname(value.root), aliasParent, 'dir'); context.after(() => unlinkSync(aliasParent));
  const aliasRoot = join(aliasParent, basename(value.root));

  // When: the CLI selects the candidate from the real root while a parent validates from the alias root.
  const cli = spawnSync(process.execPath, [CLI, 'ref', 'select', 'candidate', '--json'], { cwd: value.root, encoding: 'utf8' });
  const real = readReferenceBoardArtifacts(value.root); const alias = readReferenceBoardArtifacts(aliasRoot);
  const selection = parseReferenceSelectionV2(JSON.parse(readFileSync(join(aliasRoot, '.omd', 'reference-selection-v2.json'), 'utf8')));
  const realSelection = validateReferenceSelectionV2(value.root); const aliasSelection = validateReferenceSelectionV2(aliasRoot);

  // Then: canonical artifacts remain byte-identical and the v2 selection binds the real-root artifacts from either spelling.
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(alias.boardBytes, real.boardBytes);
  assert.equal(alias.assemblyBytes, real.assemblyBytes);
  assert.equal(selection.captureSha256, sha256(real.boardBytes));
  assert.equal(selection.assemblySha256, sha256(real.assemblyBytes));
  assert.equal(selection.projectionSha256, sha256(real.projectionBytes));
  assert.deepEqual(realSelection, selection);
  assert.deepEqual(aliasSelection, selection);
});

test('board artifacts reject direct-symlink, missing, and non-directory project roots', (context) => {
  // Given: a valid board plus lexical roots that are not real project directories.
  const value = fixture(context); const linked = join(dirname(value.root), `omd-board-artifacts-direct-${basename(value.root)}`); const file = join(value.root, 'not-a-directory'); const missing = join(value.root, 'missing-project');
  symlinkSync(value.root, linked, 'dir'); context.after(() => unlinkSync(linked)); writeFileSync(file, 'not a directory');

  // When / Then: artifact reads reject every unsafe or unreadable public project root.
  for (const [rootPath, reason] of [[linked, /symlinked project root/], [`${linked}/`, /symlinked project root/], [file, /project root must be a real directory/], [missing, /project root is missing or unreadable/]] as const) assert.throws(() => readReferenceBoardArtifacts(rootPath), reason);
});
