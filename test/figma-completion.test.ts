import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { figmaArtifactReceipt } from '../core/figma/artifact-lifecycle.ts';
import {
  createFigmaCompareRecord,
  figmaCompareRecordPath,
  serializeFigmaCompareRecord,
} from '../core/figma/compare.ts';
import {
  figmaCompletionIssues,
  figmaDiffRecord,
  figmaDiffRecordPath,
  figmaTargetsInRequest,
} from '../core/figma/completion.ts';
import type { DiffResult } from '../core/figma/diff.ts';
import {
  FIGMA_FIDELITY_REVIEW_SCHEMA,
  figmaFidelityReviewPath,
} from '../core/figma/review.ts';
import {
  FIGMA_FIDELITY_REVIEW_HANDBACK,
  FIGMA_FIDELITY_REVIEW_TASK,
  type FigmaFidelityReview,
} from '../core/figma/review-contract.ts';
import {
  PI_ROLE_EXEC_RESULT_SCHEMA,
  PI_ROLE_RESULT_SCHEMA,
  piRoleReceiptDigest,
  type PiRoleAuthorityReceipt,
} from '../core/runtime/pi-role-receipt.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const frameRequest = 'Build https://www.figma.com/design/AbC123xyz/Booking?node-id=1-2';
const pageRequest = 'Build https://www.figma.com/design/AbC123xyz/Booking?node-id=0-1';
const wholeFileRequest = 'Build https://www.figma.com/design/AbC123xyz/Booking';
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const snapshotBytes = Buffer.from(JSON.stringify({
  fileKey: 'AbC123xyz',
  fileName: 'Booking',
  capturedAt: '2026-10-17T00:00:00.000Z',
  pages: [{
    id: '0:1',
    name: 'Booking',
    frames: [
      { id: '1:2', name: 'Desktop', nodes: [{ id: '1:2', name: 'Desktop', type: 'FRAME', fills: [], effects: [] }] },
      { id: '2:3', name: 'Mobile', nodes: [{ id: '2:3', name: 'Mobile', type: 'FRAME', fills: [], effects: [] }] },
    ],
  }],
  componentSets: {},
}));

function png(shade: number, width = 2, height = 2): Buffer {
  const image = new PNG({ width, height });
  image.data.fill(shade);
  return PNG.sync.write(image);
}

function project(t: test.TestContext): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-figma-completion-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function put(root: string, path: string, bytes: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}

function putSnapshot(root: string): void {
  put(root, '.omd/figma/snapshot.json', snapshotBytes);
}

function diffed(
  root: string,
  frameId: string,
  options: Readonly<{
    actualPass?: boolean;
    recordedPass?: boolean;
    threshold?: number;
    renderSize?: Readonly<{ width: number; height: number }>;
  }> = {},
): void {
  const actualPass = options.actualPass ?? true;
  const recordedPass = options.recordedPass ?? actualPass;
  const threshold = options.threshold ?? 0.97;
  const safeId = frameId.replaceAll(':', '_');
  const exportBytes = png(10);
  const renderBytes = png(
    actualPass ? 10 : 200,
    options.renderSize?.width,
    options.renderSize?.height,
  );
  putSnapshot(root);
  put(root, `.omd/figma/exports/${safeId}.png`, exportBytes);
  put(root, `.omd/figma/exports/${safeId}.png.omd.json`, figmaArtifactReceipt({
    kind: 'export', frameId, snapshotBytes, pngBytes: exportBytes,
  }));
  put(root, `.omd/figma/renders/${safeId}.png`, renderBytes);
  put(root, `.omd/figma/renders/${safeId}.png.omd.json`, figmaArtifactReceipt({
    kind: 'render', frameId, snapshotBytes, pngBytes: renderBytes,
  }));
  const result: DiffResult = {
    score: recordedPass ? 1 : 0.4,
    threshold,
    pass: recordedPass,
    cells: [],
  };
  const diffBytes = Buffer.from(figmaDiffRecord(root, {
    frameId,
    snapshotBytes,
    exportBytes,
    renderBytes,
    result,
  }));
  put(root, figmaDiffRecordPath(frameId), diffBytes);
  const snapshot = JSON.parse(snapshotBytes.toString('utf8')) as import('../core/figma/types.ts').FigmaSnapshot;
  const frame = snapshot.pages.flatMap(page => page.frames).find(frame => frame.id === frameId);
  assert.ok(frame);
  const compare = createFigmaCompareRecord(root, {
    frame,
    snapshot,
    snapshotBytes,
    exportBytes,
    renderBytes,
    diffBytes,
    result,
    renderedElements: [],
    adapter: createTestProjectWriteAdapter(root),
  });
  put(root, figmaCompareRecordPath(frameId), serializeFigmaCompareRecord(compare));
}

function reviewed(
  root: string,
  frameId: string,
  options: Readonly<{
    verdict?: 'match' | 'mismatch';
    unresolvedCount?: number;
  }> = {},
): void {
  const verdict = options.verdict ?? 'match';
  const diffBytes = readFileSync(join(root, figmaDiffRecordPath(frameId)));
  const compareBytes = readFileSync(join(root, figmaCompareRecordPath(frameId)));
  const bindings = {
    buildSha256: 'a'.repeat(64),
    briefSha256: 'b'.repeat(64),
    evidenceSha256: 'c'.repeat(64),
    browserSha256: 'd'.repeat(64),
    diffSha256: hash(diffBytes),
    compareSha256: hash(compareBytes),
  };
  const fixes = verdict === 'match' ? [] : [{
    id: 'card-background',
    regionIndex: 0,
    element: { figmaNodeId: null, figmaNodeName: null, renderedSelector: '#card' },
    property: 'background-color',
    figmaValue: '#ffffff',
    renderValue: 'rgb(0, 0, 0)',
    instruction: 'Set the card background to the Figma fill.',
  }];
  const review: FigmaFidelityReview = { verdict, fixes, priorFixes: [] };
  const handback = {
    schema: FIGMA_FIDELITY_REVIEW_HANDBACK,
    fixedBindings: bindings,
    ...review,
  };
  const packetSha256 = 'e'.repeat(64);
  const finalMessage = canonicalJson(handback);
  const receipt: PiRoleAuthorityReceipt = {
    schema: PI_ROLE_EXEC_RESULT_SCHEMA,
    host: 'pi',
    role: 'omd-eye',
    projectRoot: root,
    status: 'completed',
    exitCode: 0,
    signal: null,
    eventCount: 1,
    finalMessage,
    processPid: 10,
    roleNonce: 'role-nonce',
    sessionId: 'review-session',
    parentSessionId: 'parent-session',
    taskSha256: hash(FIGMA_FIDELITY_REVIEW_TASK),
    configurationSha256: 'f'.repeat(64),
    buildSha256: bindings.buildSha256,
    briefSha256: bindings.briefSha256,
    provider: 'fixture-provider',
    model: 'fixture-model',
    modelReasoningEffort: 'high',
    modelSelection: 'inherited-pi-host',
    nodeSha256: '1'.repeat(64),
    cliSha256: '2'.repeat(64),
    bridgeSha256: '3'.repeat(64),
    systemPromptSha256: '4'.repeat(64),
    transcriptSha256: '5'.repeat(64),
    reviewerEvidence: {
      schema: 'omd-reviewer-evidence-consumption-v1',
      evidenceSha256: bindings.evidenceSha256,
      packetSha256,
      taskSha256: hash(FIGMA_FIDELITY_REVIEW_TASK),
      childPid: 11,
      sessionId: 'review-session',
      nonce: 'role-nonce',
    },
  };
  const roleResult = {
    schema: PI_ROLE_RESULT_SCHEMA,
    agent: 'omd-eye' as const,
    projectRoot: root,
    result: 'completed' as const,
    finalMessage,
    authority: {
      receipt,
      signature: signNativeObservation(root, PI_ROLE_EXEC_RESULT_SCHEMA, piRoleReceiptDigest(receipt)),
    },
  };
  const history = [{
    compareSha256: bindings.compareSha256,
    unresolved: verdict === 'match' ? [] : [{
      id: 'card-background',
      count: options.unresolvedCount ?? 1,
    }],
  }];
  const body = {
    schema: FIGMA_FIDELITY_REVIEW_SCHEMA,
    frameId,
    safeId: frameId.replaceAll(':', '_'),
    diffSha256: bindings.diffSha256,
    compareSha256: bindings.compareSha256,
    previousReviewSha256: null,
    bindings,
    packetSha256,
    review,
    history,
    roleResult,
  };
  put(root, figmaFidelityReviewPath(frameId), `${canonicalJson({
    ...body,
    signature: signNativeObservation(root, FIGMA_FIDELITY_REVIEW_SCHEMA, hash(canonicalJson(body))),
  })}\n`);
}

const codes = (root: string, request = frameRequest): string[] =>
  figmaCompletionIssues(root, request).map(entry => entry.code);

test('only figma.com file and design links become implementation targets with normalized node ids', () => {
  assert.deepEqual(figmaTargetsInRequest(frameRequest), [{
    url: 'https://www.figma.com/design/AbC123xyz/Booking?node-id=1-2',
    fileKey: 'AbC123xyz',
    nodeId: '1:2',
  }]);
  assert.deepEqual(figmaTargetsInRequest('see https://figma.com.evil.example/design/AbC and https://www.figma.com/community/file/1'), []);
  assert.deepEqual(figmaTargetsInRequest('no link here'), []);
});

test('requests without a Figma link impose no Figma completion requirement', t => {
  assert.deepEqual(figmaCompletionIssues(project(t), 'Build a booking service.'), []);
});

test('multiple distinct linked Figma files are refused', t => {
  const root = project(t);
  assert.deepEqual(codes(root,
    'Use https://figma.com/design/AbC123xyz/A and https://figma.com/design/Other999/B'),
  ['FIGMA_MULTIPLE_FILES_UNSUPPORTED']);
});

test('a node-id frame requires a current signed diff and isolated matching review', t => {
  const root = project(t);
  assert.deepEqual(codes(root), ['FIGMA_SNAPSHOT_MISSING']);
  putSnapshot(root);
  assert.deepEqual(codes(root), ['FIGMA_DIFF_MISSING']);
  diffed(root, '1:2');
  assert.deepEqual(codes(root), ['FIGMA_REVIEW_MISSING']);
  reviewed(root, '1:2');
  assert.deepEqual(codes(root), []);
});

test('a self-authored forged pass is refused after byte-level recomputation', t => {
  const root = project(t);
  diffed(root, '1:2', { actualPass: false, recordedPass: true });
  reviewed(root, '1:2');
  assert.deepEqual(codes(root), ['FIGMA_DIFF_BELOW_FLOOR']);
});

test('the CLI threshold remains informational for completion', t => {
  const root = project(t);
  diffed(root, '1:2', { threshold: 0.9 });
  reviewed(root, '1:2');
  assert.deepEqual(codes(root), []);
});

test('dimension-mismatched pixels cannot pass on their overlapping region', t => {
  const root = project(t);
  diffed(root, '1:2', { renderSize: { width: 1, height: 1 } });
  assert.deepEqual(codes(root), ['FIGMA_DIFF_DIMENSIONS_MISMATCH']);
});

test('unsigned and forged diff records are refused', t => {
  const root = project(t);
  diffed(root, '1:2');
  const path = join(root, figmaDiffRecordPath('1:2'));
  const signed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const { signature: _signature, ...unsigned } = signed;
  writeFileSync(path, `${JSON.stringify(unsigned)}\n`);
  assert.deepEqual(codes(root), ['FIGMA_DIFF_RECORD_UNSIGNED', 'FIGMA_DIFF_MISSING']);
  writeFileSync(path, `${JSON.stringify({ ...signed, pass: false })}\n`);
  assert.deepEqual(codes(root), ['FIGMA_DIFF_RECORD_FORGED', 'FIGMA_DIFF_MISSING']);
});

test('page and whole-file targets require every frame in scope', t => {
  const root = project(t);
  diffed(root, '1:2');
  assert.deepEqual(codes(root, pageRequest), ['FIGMA_REVIEW_MISSING', 'FIGMA_DIFF_MISSING']);
  assert.deepEqual(codes(root, wholeFileRequest), ['FIGMA_REVIEW_MISSING', 'FIGMA_DIFF_MISSING']);
  reviewed(root, '1:2');
  diffed(root, '2:3');
  assert.deepEqual(codes(root, pageRequest), ['FIGMA_REVIEW_MISSING']);
  assert.deepEqual(codes(root, wholeFileRequest), ['FIGMA_REVIEW_MISSING']);
  reviewed(root, '2:3');
  assert.deepEqual(codes(root, pageRequest), []);
  assert.deepEqual(codes(root, wholeFileRequest), []);
});

test('a changed render or a different linked file is not accepted as Figma fidelity', t => {
  const root = project(t);
  diffed(root, '1:2');
  assert.deepEqual(figmaCompletionIssues(root, 'https://www.figma.com/file/Other999/Else').map(entry => entry.code), ['FIGMA_SNAPSHOT_MISMATCH']);
  put(root, '.omd/figma/renders/1_2.png', png(90));
  assert.deepEqual(codes(root), ['FIGMA_DIFF_STALE']);
});

test('a review becomes stale when a new current diff and compare replace its evidence', t => {
  const root = project(t);
  diffed(root, '1:2');
  reviewed(root, '1:2');
  diffed(root, '1:2', { threshold: 0.8 });
  assert.deepEqual(codes(root), ['FIGMA_REVIEW_STALE']);
});

test('reviewer mismatch and three-round unresolved fixes block completion', t => {
  const root = project(t);
  diffed(root, '1:2');
  reviewed(root, '1:2', { verdict: 'mismatch' });
  assert.deepEqual(codes(root), ['FIGMA_REVIEW_MISMATCH']);
  reviewed(root, '1:2', { verdict: 'mismatch', unresolvedCount: 3 });
  assert.deepEqual(codes(root), ['FIGMA_FIX_STUCK', 'FIGMA_REVIEW_MISMATCH']);
});
