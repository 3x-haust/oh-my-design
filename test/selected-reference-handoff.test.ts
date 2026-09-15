import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildBrief, formatBrief } from '../core/brief/index.ts';
import { canonicalJson, readReferenceBoardArtifacts, sha256 } from '../core/ref/board-artifacts.ts';
import { writeReferenceHandoffReceipt } from '../core/ref/reference-handoff.ts';
import { selectReferenceCandidateV2 } from '../core/ref/reference-selection.ts';
import { readSelectedReferenceHandoff } from '../core/ref/selected-handoff.ts';
import type { Invariants } from '../core/types.ts';
import { createSelectedReferenceFixture } from './helpers/selected-reference-fixture.ts';
import { createTestProjectRunInvocation, publishTestAdaptiveRoute } from './helpers/project-write.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const INVARIANTS: Invariants = { spacingLadder: [8, 24], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0,
  tokenCoverage: 1, paddingWeight: 8, typeScale: [16, 24], fontFamilies: [], weightLadder: [400, 700],
  motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0,
  animatedProperties: [], hasReducedMotion: false, scrollChoreography: [] };
const evidence = { invariants: INVARIANTS, viewport: { width: 1440, height: 900 } };

test('selected handoff exports canonical measured content and role-bound lineage through the CLI', context => {
  const { root } = createSelectedReferenceFixture(context, evidence);
  for (const role of ['art-direction', 'composer', 'hand'] as const) {
    const result = readSelectedReferenceHandoff(root, role);
    assert.equal(result.role, role);
    assert.equal(result.candidateId, 'selected');
    assert.equal(result.pieces.length, 1);
    assert.equal(result.pieces[0]?.availability, 'selected');
    assert.deepEqual(result.pieces[0]?.transfer,
      readReferenceBoardArtifacts(root).assembly.candidates[0]?.pieces[0]?.transfer);
    const { sha256: digest, ...payload } = result;
    assert.equal(digest, sha256(canonicalJson(payload)));
    assert.notEqual(digest, result.referenceHandoffSha256);
    assert.doesNotMatch(JSON.stringify(result), /reference\.example|\.omd\/refs\/|referenceId|imagePath|capturedAt|sourceSelector/);
    const cli = spawnSync(process.execPath, [CLI, 'ref', 'handoff', role, '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), result);
  }
  const brief = buildBrief(root, 'composition');
  assert.equal(brief.referenceHandoff?.command, 'omd ref handoff composer --json');
  assert.equal(brief.referenceHandoff?.sha256, readSelectedReferenceHandoff(root, 'composer').sha256);
  assert.match(formatBrief(brief), /omd ref handoff composer --json/);
});

test('selected handoff excludes other candidates and explicitly rejected pieces', context => {
  const { root } = createSelectedReferenceFixture(context, evidence);
  const boardPath = join(root, '.omd/reference-board.json');
  const board = JSON.parse(readFileSync(boardPath, 'utf8'));
  const selected = board.candidates[0];
  const discarded = structuredClone(selected.pieces[0]);
  discarded.slotId = 'discarded-piece';
  discarded.adaptation = 'Rejected alternative marker.';
  discarded.grid = { column: 1, span: 12, order: 1 };
  selected.pieces.push(discarded);
  const other = structuredClone(selected);
  other.id = 'other-candidate';
  other.label = 'Unselected candidate marker';
  board.candidates.push(other);
  writeFileSync(boardPath, canonicalJson(board));
  const invocation = createTestProjectRunInvocation(root);
  selectReferenceCandidateV2(root, 'selected', [
    { slotId: 'hero-card', obligationDisposition: 'used', obligationReason: 'Selected visual hierarchy.' },
    { slotId: 'discarded-piece', obligationDisposition: 'rejected', obligationReason: 'Discarded geometry.' },
  ], invocation);
  writeReferenceHandoffReceipt(root, 'art-direction', invocation);
  const result = readSelectedReferenceHandoff(root, 'art-direction');
  assert.deepEqual(result.pieces.map(piece => piece.slotId), ['hero-card']);
  assert.doesNotMatch(JSON.stringify(result), /other-candidate|Unselected candidate marker|discarded-piece|Rejected alternative marker/);
  assert.throws(() => readSelectedReferenceHandoff(root, 'composer'), /stale|current|match/);
});

test('selected handoff fails closed for missing, wrong-role, and stale persisted receipt or source', context => {
  const { root } = createSelectedReferenceFixture(context, evidence);
  const receiptPath = join(root, '.omd/reference-handoffs/composer.json');
  const receipt = readFileSync(receiptPath);
  unlinkSync(receiptPath);
  assert.throws(() => readSelectedReferenceHandoff(root, 'composer'));
  assert.equal(buildBrief(root, 'composition').referenceHandoff, null);
  assert.ok(buildBrief(root, 'composition').blockers.includes('selected reference handoff unavailable: omd ref handoff composer --json'));
  writeFileSync(receiptPath, readFileSync(join(root, '.omd/reference-handoffs/hand.json')));
  assert.throws(() => readSelectedReferenceHandoff(root, 'composer'), /role/);
  writeFileSync(receiptPath, receipt);
  const boardPath = join(root, '.omd/reference-board.json');
  const board = JSON.parse(readFileSync(boardPath, 'utf8'));
  board.candidates[0].pieces[0].adaptation = 'Changed after selection.';
  writeFileSync(boardPath, canonicalJson(board));
  assert.throws(() => readSelectedReferenceHandoff(root, 'composer'), /hash|stale/);
  const cli = spawnSync(process.execPath, [CLI, 'ref', 'handoff', 'composer', '--json'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(cli.status, 0);
  assert.equal(cli.stdout, '');
});

test('available pending motion remains inspectable by art direction and carries no production approval', context => {
  const { root } = createSelectedReferenceFixture(context, { ...evidence,
    invariants: { ...INVARIANTS, motionDurations: [160], animatedProperties: ['opacity'], animatedShare: 0.5 },
  });
  const boardPath = join(root, '.omd/reference-board.json');
  const board = JSON.parse(readFileSync(boardPath, 'utf8'));
  const motion = structuredClone(board.candidates[0].pieces[0]);
  motion.slotId = 'pending-motion';
  motion.take = ['motion'];
  motion.grid.order = 1;
  motion.evidenceAxes.signal = 'high-motion';
  motion.evidenceAxes.motionAxis = 'available';
  board.candidates[0].pieces.push(motion);
  writeFileSync(boardPath, canonicalJson(board));
  const invocation = createTestProjectRunInvocation(root);
  selectReferenceCandidateV2(root, 'selected', [
    { slotId: 'hero-card', obligationDisposition: 'used', obligationReason: 'Selected visual hierarchy.' },
    { slotId: 'pending-motion', obligationDisposition: 'not-applicable', obligationReason: 'Available motion awaits evaluation.' },
  ], invocation);
  writeReferenceHandoffReceipt(root, 'art-direction', invocation);
  const result = readSelectedReferenceHandoff(root, 'art-direction');
  assert.equal(result.pieces.find(piece => piece.slotId === 'pending-motion')?.availability, 'pending-motion-review');
  assert.equal(result.artDirectionSha256, undefined);
  assert.throws(() => readSelectedReferenceHandoff(root, 'hand'), /stale|current|match/);
});

test('unselected routes acquire no art-direction or handoff prerequisite', context => {
  const { root } = createSelectedReferenceFixture(context, evidence);
  // Historical selection/art artifacts remain. The current route's explicit skip owns applicability.
  unlinkSync(join(root, '.omd/reference-handoffs/hand.json'));
  const route = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/adaptive-flow/copy-only.json', import.meta.url)), 'utf8'));
  const invocation = publishTestAdaptiveRoute(root, route);
  const brief = buildBrief(root, 'production', undefined, invocation);
  assert.equal(brief.referenceHandoff, null);
  assert.equal(brief.blockers.some(blocker => blocker.startsWith('selected reference handoff unavailable')), false);
  const cli = spawnSync(process.execPath, [CLI, 'ref', 'handoff', 'reviewer', '--json'], { cwd: root, encoding: 'utf8' });
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /usage:/);
});

test('the CLI drains a large complete feature payload without truncating its stdout', context => {
  const { root } = createSelectedReferenceFixture(context, { ...evidence, blueprint: {
    selector: '[data-omd="shop-hero"]', capturedAt: '2026-08-25T00:00:00.000Z',
    nodes: Array.from({ length: 2500 }, (_, index) => ({ id: `node-${index}`, role: 'text' as const,
      children: [], box: { w: 200, h: 24 }, position: { x: 0, y: index * 24 } })),
  } });
  const result = spawnSync(process.execPath, [CLI, 'ref', 'handoff', 'hand', '--json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.length > 128 * 1024);
  assert.deepEqual(JSON.parse(result.stdout), readSelectedReferenceHandoff(root, 'hand'));
});
