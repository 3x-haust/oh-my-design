import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';

import { canonicalJson, readReferenceBoardArtifacts, referenceBoardProjectSha256, sha256 } from '../core/ref/board-artifacts.ts';
import { authorReferenceBoard } from '../core/ref/board-author.ts';
import { parseReferenceBoard } from '../core/ref/board-parser.ts';
import {
  parseReferenceClassification,
  referenceClassificationSha256,
} from '../core/ref/reference-classification.ts';
import { refIdentity } from '../core/ref/identity.ts';

// Hypotheses exercised by this suite:
// H1: the checker loses validated board classifications when it falls back to raw captures.
// H2: resolution applies visual-capture requirements before branching on nonvisual classification.
// H3: no canonical binding detects forged, stale, copied, or drifted classifications.

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const contentPrinciples = ['content-only: Preserve approved terminology and a concise operational voice.'];
const antiPrinciples = ['anti-reference: Reject the source visual treatment as an explicit destination constraint.'];

function project(context: TestContext, frame = '# Current frame\n'): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-reference-classification-'));
  mkdirSync(join(root, '.omd', 'refs'), { recursive: true });
  writeFileSync(join(root, '.omd', 'frame.md'), frame);
  context.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function reference(root: string, component: string, principles: readonly string[]): { id: string; path: string } {
  const source = `https://evidence.example/${component}`;
  const path = join(root, '.omd', 'refs', `${component}.json`);
  writeFileSync(path, `${JSON.stringify({
    source,
    component,
    kind: 'page',
    capturedAt: '2026-08-13T00:00:00.000Z',
    invariants: null,
    principles,
  })}\n`);
  return { id: refIdentity(source, component), path };
}

function classifiedPiece(
  referenceId: string,
  classification: ReturnType<typeof parseReferenceClassification>,
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  const contentOnly = classification.kind === 'content-only';
  return {
    slotId: 'voice',
    sourceKind: 'classified-reference',
    referenceId,
    targetComponent: 'ProductVoice',
    targetSelector: '[data-zone="voice"]',
    taskIds: ['T1'],
    reason: contentOnly ? 'Preserve the approved product vocabulary.' : 'Exclude the rejected source treatment.',
    take: contentOnly ? ['content', 'voice'] : ['rejection'],
    avoid: 'Do not infer source pixels.',
    adaptation: contentOnly ? 'Apply the semantic rule to local copy.' : 'Keep the rejected treatment out of the destination.',
    grid: { column: 1, span: 12, order: 0 },
    evidenceAxes: {
      rights: 'lawful',
      signal: contentOnly ? 'supporting-content' : 'anti-reference',
      staticAxis: 'absent',
      motionAxis: 'absent',
    },
    classification: { kind: classification.kind, sha256: referenceClassificationSha256(classification) },
    ...patch,
  };
}

function board(root: string, piece: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: 'reference-board-v2',
    projectSha256: referenceBoardProjectSha256(root),
    frameSha256: sha256(readFileSync(join(root, '.omd', 'frame.md'))),
    candidates: [{ id: 'candidate', label: 'Candidate', route: '/', rationale: 'Use only typed evidence.', pieces: [piece] }],
  };
}

function writeBoard(root: string, value: unknown): void {
  writeFileSync(join(root, '.omd', 'reference-board.json'), canonicalJson(value));
}

test('content-only evidence supports content and voice principles without pixels', (context) => {
  const root = project(context);
  const saved = reference(root, 'voice-guide', contentPrinciples);
  const classification = parseReferenceClassification({ principles: contentPrinciples });
  writeBoard(root, board(root, classifiedPiece(saved.id, classification)));

  const artifacts = readReferenceBoardArtifacts(root);
  const resolved = artifacts.resolved.candidates[0]?.pieces[0];
  const assembly = artifacts.assembly.candidates[0]?.pieces[0];

  assert.equal(resolved?.sourceKind, 'classified-reference');
  assert.deepEqual(assembly?.take, ['content', 'voice']);
  assert.deepEqual(assembly?.transfer, {
    classification: 'content-only',
    principles: ['Preserve approved terminology and a concise operational voice.'],
  });
  assert.doesNotMatch(artifacts.boardBytes, /imagePath|imageSha256|blueprint|invariants/);
});

test('anti-reference evidence supports an explicit rejection constraint without pixels', (context) => {
  const root = project(context);
  const saved = reference(root, 'rejected-style', antiPrinciples);
  const classification = parseReferenceClassification({ principles: antiPrinciples });
  writeBoard(root, board(root, classifiedPiece(saved.id, classification)));

  const artifacts = readReferenceBoardArtifacts(root);
  assert.deepEqual(artifacts.assembly.candidates[0]?.pieces[0]?.transfer, {
    classification: 'anti-reference',
    constraints: ['Reject the source visual treatment as an explicit destination constraint.'],
  });
  assert.doesNotMatch(artifacts.boardBytes, /imagePath|imageSha256|blueprint|invariants/);
});

test('canonical board authoring derives the versioned classification binding from the persisted reference', (context) => {
  const root = project(context);
  reference(root, 'voice-guide', contentPrinciples);
  writeFileSync(join(root, '.omd', 'acquisition-plan.json'), JSON.stringify({
    zones: [{ id: 'voice', required: true }],
  }));
  const candidate = (id: string) => ({
    id, label: id, route: '/', rationale: 'Use approved voice evidence.', pieces: [{
      slotId: 'voice', source: 'https://evidence.example/voice-guide', component: 'voice-guide',
      targetComponent: 'ProductVoice', targetSelector: '[data-zone="voice"]', taskIds: ['T1'],
      reason: 'Preserve approved terminology.', take: ['content', 'voice'], avoid: 'Do not infer source pixels.',
      adaptation: 'Apply the semantic rule to local copy.', grid: { column: 1, span: 12, order: 0 },
      rights: 'lawful', signal: 'supporting-content', motionAxis: 'absent',
    }],
  });

  const authored = authorReferenceBoard(root, { candidates: [candidate('a'), candidate('b')] });
  assert.equal(authored.schemaVersion, 'reference-board-v2');
  if (authored.schemaVersion !== 'reference-board-v2') assert.fail('expected v2 board');
  assert.equal(authored.projectSha256, referenceBoardProjectSha256(root));
  assert.equal(authored.candidates[0]?.pieces[0]?.sourceKind, 'classified-reference');
  writeBoard(root, authored);
  assert.doesNotThrow(() => readReferenceBoardArtifacts(root));
});

test('nonvisual classifications cannot claim geometry, visual style, motion, or interaction evidence', () => {
  const content = parseReferenceClassification({ principles: contentPrinciples });
  const anti = parseReferenceClassification({ principles: antiPrinciples });
  for (const take of ['structure', 'proportion', 'density', 'rhythm', 'motion', 'interaction']) {
    assert.throws(() => parseReferenceBoard({
      schemaVersion: 'reference-board-v2', projectSha256: 'b'.repeat(64), frameSha256: 'a'.repeat(64),
      candidates: [{ id: 'candidate', label: 'Candidate', route: '/', rationale: 'Typed evidence.', pieces: [
        classifiedPiece('ref-0000000000000000', content, { take: [take] }),
      ] }],
    }), take);
  }
  assert.throws(() => parseReferenceBoard({
    schemaVersion: 'reference-board-v2', projectSha256: 'b'.repeat(64), frameSha256: 'a'.repeat(64),
    candidates: [{ id: 'candidate', label: 'Candidate', route: '/', rationale: 'Typed evidence.', pieces: [
      classifiedPiece('ref-0000000000000000', anti, { take: ['content'] }),
    ] }],
  }), /rejection/);
  assert.throws(() => parseReferenceClassification({
    principles: ['content-only: Copy the exact source layout geometry and interaction motion.'],
  }), /content-only/i);
});

test('visual references still require a current scoped capture', (context) => {
  const root = project(context);
  const saved = reference(root, 'visual-layout', ['Keep the measured hierarchy.']);
  writeBoard(root, {
    schemaVersion: 'reference-board-v2', projectSha256: referenceBoardProjectSha256(root), frameSha256: sha256(readFileSync(join(root, '.omd', 'frame.md'))),
    candidates: [{ id: 'candidate', label: 'Candidate', route: '/', rationale: 'Use measured layout.', pieces: [{
      slotId: 'hero', sourceKind: 'component-capture', referenceId: saved.id,
      targetComponent: 'Hero', targetSelector: '[data-zone="hero"]', taskIds: ['T1'],
      reason: 'Use measured hierarchy.', take: ['structure'], avoid: 'Do not copy source content.',
      adaptation: 'Apply local tokens.', grid: { column: 1, span: 12, order: 0 },
      evidenceAxes: { rights: 'lawful', signal: 'high-visual-system', staticAxis: 'available', motionAxis: 'absent' },
    }] }],
  });

  assert.throws(() => readReferenceBoardArtifacts(root), /component capture|selector|blueprint|imagePath/);
});

test('forged, stale, cross-project, and drifted classification evidence fails closed', (context) => {
  const root = project(context, '# Project A\n');
  const saved = reference(root, 'voice-guide', contentPrinciples);
  const classification = parseReferenceClassification({ principles: contentPrinciples });
  const validBoard = board(root, classifiedPiece(saved.id, classification));

  const forged = structuredClone(validBoard) as Record<string, any>;
  forged.candidates[0].pieces[0].classification.sha256 = digest('forged');
  writeBoard(root, forged);
  assert.throws(() => readReferenceBoardArtifacts(root), /classification.*stale|classification.*hash/i);

  writeBoard(root, validBoard);
  writeFileSync(saved.path, `${JSON.stringify({
    source: 'https://evidence.example/voice-guide', component: 'voice-guide', kind: 'page',
    capturedAt: '2026-08-13T00:00:00.000Z', invariants: null,
    principles: ['content-only: Use a newly substituted product voice.'],
  })}\n`);
  assert.throws(() => readReferenceBoardArtifacts(root), /classification.*stale|classification.*hash/i);

  writeFileSync(saved.path, `${JSON.stringify({
    source: 'https://evidence.example/voice-guide', component: 'voice-guide', kind: 'page',
    capturedAt: '2026-08-13T00:00:00.000Z', invariants: null, principles: antiPrinciples,
  })}\n`);
  assert.throws(() => readReferenceBoardArtifacts(root), /classification.*drift|classification.*kind/i);

  const other = project(context, '# Project B\n');
  mkdirSync(join(other, '.omd', 'refs'), { recursive: true });
  writeFileSync(join(other, '.omd', 'refs', 'voice-guide.json'), readFileSync(saved.path));
  writeBoard(other, validBoard);
  assert.throws(() => readReferenceBoardArtifacts(other), /project.*stale|cross-project/i);
});
