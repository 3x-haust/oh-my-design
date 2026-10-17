import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { figmaArtifactReceipt } from '../core/figma/artifact-lifecycle.ts';
import { figmaCompletionIssues, figmaDiffRecord, figmaDiffRecordPath, figmaTargetsInRequest } from '../core/figma/completion.ts';
import type { DiffResult } from '../core/figma/diff.ts';

const request = '이 디자인대로 만들어줘 https://www.figma.com/design/AbC123xyz/Booking?node-id=1-2 고마워';
const snapshotBytes = Buffer.from(JSON.stringify({ fileKey: 'AbC123xyz', fileName: 'Booking', capturedAt: '2026-10-17T00:00:00.000Z', pages: [] }));

function png(shade: number): Buffer {
  const image = new PNG({ width: 2, height: 2 });
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

function diffed(root: string, pass: boolean): void {
  const exportBytes = png(10), renderBytes = png(pass ? 10 : 200);
  put(root, '.omd/figma/snapshot.json', snapshotBytes);
  put(root, '.omd/figma/exports/1_2.png', exportBytes);
  put(root, '.omd/figma/exports/1_2.png.omd.json', figmaArtifactReceipt({ kind: 'export', frameId: '1:2', snapshotBytes, pngBytes: exportBytes }));
  put(root, '.omd/figma/renders/1_2.png', renderBytes);
  put(root, '.omd/figma/renders/1_2.png.omd.json', figmaArtifactReceipt({ kind: 'render', frameId: '1:2', snapshotBytes, pngBytes: renderBytes }));
  const result: DiffResult = { score: pass ? 1 : 0.4, threshold: 0.97, pass, cells: [] };
  put(root, figmaDiffRecordPath('1:2'), figmaDiffRecord({ frameId: '1:2', snapshotBytes, exportBytes, renderBytes, result }));
}

const codes = (root: string): string[] => figmaCompletionIssues(root, request).map(issue => issue.code);

test('only figma.com file and design links become implementation targets', () => {
  assert.deepEqual(figmaTargetsInRequest(request).map(target => target.fileKey), ['AbC123xyz']);
  assert.deepEqual(figmaTargetsInRequest('see https://figma.com.evil.example/design/AbC and https://www.figma.com/community/file/1'), []);
  assert.deepEqual(figmaTargetsInRequest('no link here'), []);
});

test('requests without a Figma link impose no Figma completion requirement', t => {
  assert.deepEqual(figmaCompletionIssues(project(t), '빈 폴더에 예약 서비스를 만들어줘'), []);
});

test('a linked Figma file refuses completion without a snapshot, without a diff, or with a failed diff', t => {
  const root = project(t);
  assert.deepEqual(codes(root), ['FIGMA_SNAPSHOT_MISSING']);
  put(root, '.omd/figma/snapshot.json', snapshotBytes);
  assert.deepEqual(codes(root), ['FIGMA_DIFF_MISSING']);
  diffed(root, false);
  assert.deepEqual(codes(root), ['FIGMA_DIFF_FAILED']);
});

test('a changed render or a different linked file is not accepted as Figma fidelity', t => {
  const root = project(t);
  diffed(root, true);
  assert.deepEqual(codes(root), []);
  assert.deepEqual(figmaCompletionIssues(root, 'https://www.figma.com/file/Other999/Else').map(issue => issue.code), ['FIGMA_SNAPSHOT_MISMATCH']);
  put(root, '.omd/figma/renders/1_2.png', png(90));
  assert.deepEqual(codes(root), ['FIGMA_DIFF_STALE']);
});
