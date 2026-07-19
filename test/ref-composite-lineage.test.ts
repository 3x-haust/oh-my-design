import assert from 'node:assert/strict';
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import {
  ReferenceCompositeLineageValidationError,
  checkReferenceCompositeLineage,
  parseReferenceCompositeLineage,
  recordReferenceCompositeLineage,
} from '../core/ref/composite-lineage.ts';
import { readReferenceBoardArtifacts } from '../core/ref/board-artifacts.ts';
import { trustedPrompt } from '../core/ref/composite-lineage-files.ts';
import { selectReferenceCandidate } from '../core/ref/reference-selection.ts';
import { compositeLineageFixture } from './ref-composite-lineage-fixture.ts';

const generated = (compositePath: string, promptPath: string) => ({
  state: 'generated' as const,
  compositePath,
  promptPath,
  provider: 'host-imagegen',
  hostCapability: 'image-generation' as const,
  permittedInputClasses: [
    'sanitized-selected-assembly',
    'sanitized-principles',
    'sanitized-blueprints',
    'project-owned-concept-material',
  ] as const,
});

const boardWithSecondCandidate = (board: { candidates: Array<{ id: string; label: string }> }) => ({
  ...board,
  candidates: [...board.candidates, { ...board.candidates[0], id: 'clean-room-two', label: 'Clean room two' }],
});

test('recording retries an atomically replaced board and selection as one generation', (context) => {
  // Given: one selected candidate and a deterministic replacement with a second valid candidate.
  const value = compositeLineageFixture(context);
  const boardFile = join(value.root, '.omd', 'reference-board.json');
  const firstBoard = JSON.parse(readFileSync(boardFile, 'utf8'));
  const secondBoard = boardWithSecondCandidate(firstBoard);
  let replaced = false;
  const readers = {
    readBoardArtifacts: (root: string, path?: string) => {
      if (!replaced) {
        replaced = true;
      writeFileSync(boardFile, `${JSON.stringify(secondBoard)}\n`);
      selectReferenceCandidate(value.root, 'clean-room-two');
      }
      return path === undefined ? readReferenceBoardArtifacts(root) : readReferenceBoardArtifacts(root, path);
    },
  };

  // When: recording crosses the atomic replacement during its first board-artifact read.
  const recorded = recordReferenceCompositeLineage(value.root, generated(value.compositePath, value.promptPath), readers);

  // Then: it records the replacement candidate, never candidate one with candidate two's selection hash.
  assert.equal(recorded.state, 'generated');
  if (recorded.state === 'generated') assert.equal(recorded.selectedCandidateId, 'clean-room-two');
});

test('recording fails closed when a changed board keeps a prior selection binding', (context) => {
  // Given: one selected candidate and a board replacement without a matching selection rewrite.
  const value = compositeLineageFixture(context);
  const boardFile = join(value.root, '.omd', 'reference-board.json');
  const secondBoard = boardWithSecondCandidate(JSON.parse(readFileSync(boardFile, 'utf8')));
  let replaced = false;
  const readers = {
    readBoardArtifacts: (root: string, path?: string) => {
      if (!replaced) {
        replaced = true;
        writeFileSync(boardFile, `${JSON.stringify(secondBoard)}\n`);
      }
      return path === undefined ? readReferenceBoardArtifacts(root) : readReferenceBoardArtifacts(root, path);
    },
  };

  // When / Then: no lineage can bind the changed assembly to the stale selection.
  assert.throws(() => recordReferenceCompositeLineage(value.root, generated(value.compositePath, value.promptPath), readers), ReferenceCompositeLineageValidationError);
  assert.equal(existsSync(join(value.root, '.omd', 'reference-composite-lineage.json')), false);
});

test('generated lineage records and checks exact clean-room inputs', (context) => {
  // Given: one hash-bound chat selection, one local draft, and one cache-confined prompt file.
  const value = compositeLineageFixture(context);

  // When: the clean-room generation record is written then checked from its declared prompt file.
  const recorded = recordReferenceCompositeLineage(value.root, generated(value.compositePath, value.promptPath));
  const checked = checkReferenceCompositeLineage(value.root);

  // Then: current assembly, selection, selected candidate, composite, and prompt all stay bound.
  assert.deepEqual(checked, recorded);
  assert.equal(recorded.state, 'generated');
  if (recorded.state === 'generated') {
    assert.equal(recorded.selectedCandidateId, 'clean-room-one');
    assert.equal(recorded.assemblySha256, '2508be9765cb8502068a4388692d22d2f1e8cc5e16c1fdc38005af6659599ea1');
    assert.equal(recorded.selectionSha256, 'e51caf3e5961f7cf034a9bba42d1cc20e3fd46c6e5cc40140c5b31207f3ba80e');
    assert.equal(recorded.compositePath, '.omd/.cache/imagegen/draft-01.png');
    assert.equal(recorded.compositeSha256, '2adcb304db0321c13929f2050ae54b5db1273ce0bed146f770df770c4c13e2c8');
    assert.equal(recorded.promptPath, '.omd/.cache/imagegen/draft-01.prompt.txt');
    assert.equal(recorded.promptSha256, 'd0b01c4d3cb96a10bfe7a3750323ec5ada2c7fd5efbc3a49a80a3f9fb815273f');
    assert.deepEqual(recorded.permittedInputClasses, generated(value.compositePath, value.promptPath).permittedInputClasses);
  }
});

test('generated checks reject a stale declared prompt file', (context) => {
  // Given: one recorded generated lineage and a later prompt-file replacement.
  const value = compositeLineageFixture(context);
  recordReferenceCompositeLineage(value.root, generated(value.compositePath, value.promptPath));
  writeFileSync(value.promptPath, 'Create a different clean-room concept draft.');

  // When / Then: checking reads the declared file and rejects its changed exact bytes.
  assert.throws(() => checkReferenceCompositeLineage(value.root), ReferenceCompositeLineageValidationError);
});

test('generated checks reject a stale composite file', (context) => {
  // Given: one recorded generated lineage and a later composite-file replacement.
  const value = compositeLineageFixture(context);
  recordReferenceCompositeLineage(value.root, generated(value.compositePath, value.promptPath));
  writeFileSync(value.compositePath, Buffer.from('different composite bytes'));

  // When / Then: checking rejects changed composite bytes independently of the prompt.
  assert.throws(() => checkReferenceCompositeLineage(value.root), ReferenceCompositeLineageValidationError);
});

test('generated checks reject a stale selection file', (context) => {
  // Given: one recorded generated lineage and an independently malformed selection rewrite.
  const value = compositeLineageFixture(context);
  recordReferenceCompositeLineage(value.root, generated(value.compositePath, value.promptPath));
  writeFileSync(join(value.root, '.omd', 'reference-selection.json'), '{}');

  // When / Then: checking fails without consulting caller-provided prompt bytes.
  assert.throws(() => checkReferenceCompositeLineage(value.root), ReferenceCompositeLineageValidationError);
});

test('recording uses a stable prompt-file snapshot after replacement', (context) => {
  // Given: a prompt that is replaced immediately after the first trusted file read.
  const value = compositeLineageFixture(context);
  const replacement = 'Create a refreshed clean-room concept draft from local design tokens.';
  let promptReads = 0;
  const readers = {
    readPrompt: (root: string, path: string) => {
      const prompt = trustedPrompt(root, path);
      if (++promptReads === 1) writeFileSync(value.promptPath, replacement);
      return prompt;
    },
  };

  // When: recording samples the prompt file before and after its replacement.
  const recorded = recordReferenceCompositeLineage(value.root, generated(value.compositePath, value.promptPath), readers);

  // Then: the record binds only the stable replacement bytes and still checks successfully.
  assert.equal(recorded.state, 'generated');
  if (recorded.state === 'generated') assert.equal(recorded.promptSha256, '133b9393504c362c7d27179ae1d99a7b5487d8b06f5681fb7d12ef3aab787e29');
  assert.deepEqual(checkReferenceCompositeLineage(value.root), recorded);
});

test('generated recording rejects missing, outside, or symlinked prompt files before publication', (context) => {
  // Given: valid selection state and prompt candidates that violate cache-file boundaries.
  const value = compositeLineageFixture(context);
  const missing = join(value.root, '.omd', '.cache', 'imagegen', 'missing.prompt.txt');
  const outside = join(value.root, 'outside.prompt.txt');
  const link = join(value.root, '.omd', '.cache', 'imagegen', 'linked.prompt.txt');
  writeFileSync(outside, 'outside prompt');
  symlinkSync(value.promptPath, link);

  // When / Then: no missing, project-external, or symlinked prompt publishes lineage.
  for (const promptPath of [missing, outside, link]) {
    assert.throws(() => recordReferenceCompositeLineage(value.root, generated(value.compositePath, promptPath)), ReferenceCompositeLineageValidationError);
    assert.equal(existsSync(join(value.root, '.omd', 'reference-composite-lineage.json')), false);
  }
});

test('generated recording rejects missing and outside composite paths before publication', (context) => {
  // Given: valid selection state with missing and project-external draft paths.
  const value = compositeLineageFixture(context);
  const missing = join(value.root, '.omd', '.cache', 'imagegen', 'missing.png');
  const outside = join(value.root, 'outside.png');
  writeFileSync(outside, Buffer.from('outside'));

  // When / Then: neither nonlocal nor absent bytes create a lineage record.
  assert.throws(() => recordReferenceCompositeLineage(value.root, generated(missing, value.promptPath)), ReferenceCompositeLineageValidationError);
  assert.throws(() => recordReferenceCompositeLineage(value.root, generated(outside, value.promptPath)), ReferenceCompositeLineageValidationError);
  assert.equal(existsSync(join(value.root, '.omd', 'reference-composite-lineage.json')), false);
});

test('lineage parsers close both variants against raw carriers and unknown fields', () => {
  // Given: closed generated and unavailable records at their trust boundary.
  const generatedRecord = {
    schemaVersion: 'reference-composite-lineage-v1',
    state: 'generated',
    assemblySha256: 'a'.repeat(64),
    selectionSha256: 'b'.repeat(64),
    selectedCandidateId: 'clean-room-one',
    compositePath: '.omd/.cache/imagegen/draft-01.png',
    compositeSha256: 'c'.repeat(64),
    promptPath: '.omd/.cache/imagegen/draft-01.prompt.txt',
    promptSha256: 'd'.repeat(64),
    provider: 'host-imagegen',
    hostCapability: 'image-generation',
    permittedInputClasses: ['sanitized-selected-assembly', 'sanitized-principles', 'sanitized-blueprints', 'project-owned-concept-material'],
  };
  const unavailable = { schemaVersion: 'reference-composite-lineage-v1', state: 'unavailable', reason: 'Host lacks image generation.' };

  // When / Then: raw source fields, undeclared inputs, and unavailable image fields cross the parser.
  assert.deepEqual(parseReferenceCompositeLineage(unavailable), unavailable);
  for (const value of [
    { ...generatedRecord, sourceImage: 'capture.png' },
    { ...generatedRecord, sourceUrl: 'https://source.example' },
    { ...generatedRecord, screenshot: 'capture.png' },
    { ...generatedRecord, pixels: 'iVBORw0KGgo' },
    { ...generatedRecord, likeness: 'source likeness' },
    { ...generatedRecord, imageReference: 'capture.png' },
    { ...generatedRecord, inputCarrier: 'unapproved' },
    { ...generatedRecord, compositePath: '../source.png' },
    { ...generatedRecord, promptPath: '../prompt.txt' },
    { ...unavailable, provider: 'host-imagegen' },
    { ...unavailable, compositePath: '.omd/.cache/imagegen/draft-01.png' },
    { ...unavailable, imageReference: 'draft-01.png' },
    { ...unavailable, assemblySha256: 'a'.repeat(64) },
  ]) assert.throws(() => parseReferenceCompositeLineage(value), ReferenceCompositeLineageValidationError);
});

test('prompt validation rejects canonical source-imagery carriers but permits clean-room prose', (context) => {
  // Given: prompt-file phrases that differ only by case, punctuation, spacing, or camel case.
  const permitted = compositeLineageFixture(context);
  writeFileSync(permitted.promptPath, 'Create a fresh composition from spacing tokens, local copy, and project-owned material.');
  const forbidden = [
    'CAPTURED SCREENSHOTS',
    'captured-screenshot',
    'captured / screenshots',
    'image-reference',
    'image reference',
    'imageReference',
    'source image',
    'pixels',
    'likeness',
    'likenesses',
    'source likenesses',
    'source-likenesses',
    "source likeness's",
    "source likenesses'",
    'Use https://source.example/capture.png',
  ];

  // When / Then: ordinary prose is accepted while every normalized forbidden carrier is rejected.
  assert.equal(recordReferenceCompositeLineage(permitted.root, generated(permitted.compositePath, permitted.promptPath)).state, 'generated');
  for (const phrase of ['Use likely variations and lightness from local design tokens.', 'Create a fresh project-owned composition with no source material.']) {
    const value = compositeLineageFixture(context);
    writeFileSync(value.promptPath, phrase);
    assert.equal(recordReferenceCompositeLineage(value.root, generated(value.compositePath, value.promptPath)).state, 'generated');
  }
  for (const phrase of forbidden) {
    const value = compositeLineageFixture(context);
    writeFileSync(value.promptPath, `Create a clean-room concept draft. ${phrase}`);
    assert.throws(() => recordReferenceCompositeLineage(value.root, generated(value.compositePath, value.promptPath)), ReferenceCompositeLineageValidationError);
    assert.equal(existsSync(join(value.root, '.omd', 'reference-composite-lineage.json')), false);
  }
});

test('unavailable records are atomic and generated paths reject symlinks', (context) => {
  // Given: a no-capability fallback and a symlinked draft candidate.
  const value = compositeLineageFixture(context);
  const unavailable = recordReferenceCompositeLineage(value.root, { state: 'unavailable', reason: 'Host has no image generation capability.' });
  const path = join(value.root, '.omd', 'reference-composite-lineage.json');
  const before = readFileSync(path, 'utf8');
  const link = join(value.root, '.omd', '.cache', 'imagegen', 'linked.png');
  symlinkSync(value.compositePath, link);

  // When / Then: neither a rewrite nor a symlinked composite can replace the durable record.
  assert.equal(unavailable.state, 'unavailable');
  assert.deepEqual(checkReferenceCompositeLineage(value.root), unavailable);
  assert.throws(() => recordReferenceCompositeLineage(value.root, { state: 'unavailable', reason: 'A second fallback must not replace the first.' }), ReferenceCompositeLineageValidationError);
  assert.throws(() => recordReferenceCompositeLineage(value.root, generated(link, value.promptPath)), ReferenceCompositeLineageValidationError);
  assert.equal(readFileSync(path, 'utf8'), before);
  assert.equal(existsSync(path), true);
  assert.equal(relative(value.root, link), '.omd/.cache/imagegen/linked.png');
});

test('generated checks require exact assembly and selection hashes', (context) => {
  // Given: independently recorded lineages with a malformed stored hash or a reserialized selection.
  const alteredAssembly = compositeLineageFixture(context);
  recordReferenceCompositeLineage(alteredAssembly.root, generated(alteredAssembly.compositePath, alteredAssembly.promptPath));
  const lineagePath = join(alteredAssembly.root, '.omd', 'reference-composite-lineage.json');
  writeFileSync(lineagePath, readFileSync(lineagePath, 'utf8').replace(/"assemblySha256":"[0-9a-f]{64}"/, `"assemblySha256":"${'0'.repeat(64)}"`));

  // When / Then: a mismatched assembly hash and semantically identical selection reformat both fail.
  assert.throws(() => checkReferenceCompositeLineage(alteredAssembly.root), ReferenceCompositeLineageValidationError);
  const alteredSelection = compositeLineageFixture(context);
  recordReferenceCompositeLineage(alteredSelection.root, generated(alteredSelection.compositePath, alteredSelection.promptPath));
  const selectionPath = join(alteredSelection.root, '.omd', 'reference-selection.json');
  writeFileSync(selectionPath, `${readFileSync(selectionPath, 'utf8').trimEnd()} \n`);
  assert.throws(() => checkReferenceCompositeLineage(alteredSelection.root), ReferenceCompositeLineageValidationError);
});
