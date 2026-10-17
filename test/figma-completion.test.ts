import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { figmaArtifactReceipt } from '../core/figma/artifact-lifecycle.ts';
import {
  figmaCompletionIssues,
  figmaDiffRecord,
  figmaDiffRecordPath,
  figmaTargetsInRequest,
} from '../core/figma/completion.ts';
import type { DiffResult } from '../core/figma/diff.ts';

const frameRequest = 'Build https://www.figma.com/design/AbC123xyz/Booking?node-id=1-2';
const pageRequest = 'Build https://www.figma.com/design/AbC123xyz/Booking?node-id=0-1';
const wholeFileRequest = 'Build https://www.figma.com/design/AbC123xyz/Booking';
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
  put(root, figmaDiffRecordPath(frameId), figmaDiffRecord(root, {
    frameId,
    snapshotBytes,
    exportBytes,
    renderBytes,
    result,
  }));
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

test('a node-id frame succeeds only with its signed current diff', t => {
  const root = project(t);
  assert.deepEqual(codes(root), ['FIGMA_SNAPSHOT_MISSING']);
  putSnapshot(root);
  assert.deepEqual(codes(root), ['FIGMA_DIFF_MISSING']);
  diffed(root, '1:2');
  assert.deepEqual(codes(root), []);
});

test('a self-authored forged pass is refused after byte-level recomputation', t => {
  const root = project(t);
  diffed(root, '1:2', { actualPass: false, recordedPass: true });
  assert.deepEqual(codes(root), ['FIGMA_DIFF_FAILED']);
});

test('a lowered diff threshold cannot satisfy completion', t => {
  const root = project(t);
  diffed(root, '1:2', { threshold: 0.9 });
  assert.deepEqual(codes(root), ['FIGMA_DIFF_THRESHOLD_LOWERED']);
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
  assert.deepEqual(codes(root, pageRequest), ['FIGMA_DIFF_MISSING']);
  assert.deepEqual(codes(root, wholeFileRequest), ['FIGMA_DIFF_MISSING']);
  diffed(root, '2:3');
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
