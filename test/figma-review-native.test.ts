import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';
import { figmaArtifactReceipt } from '../core/figma/artifact-lifecycle.ts';
import {
  createFigmaCompareRecord,
  figmaCompareRecordPath,
  serializeFigmaCompareRecord,
  type RenderedElementFact,
} from '../core/figma/compare.ts';
import { figmaDiffRecord, figmaDiffRecordPath } from '../core/figma/completion.ts';
import { compareImages } from '../core/figma/diff.ts';
import { readFigmaFidelityReview, runFigmaFidelityReview } from '../core/figma/review.ts';
import type { FigmaSnapshot } from '../core/figma/types.ts';
import {
  createTestNativePiInvocation,
  ensureNativePiRun,
  stageNativePiCommand,
} from '../core/runtime/native-pi-run.ts';
import { capturePiRequest } from '../extensions/omd-request-source.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');

function png(shade: number): Buffer {
  const image = new PNG({ width: 60, height: 60 });
  image.data.fill(shade);
  return PNG.sync.write(image);
}

function put(root: string, path: string, bytes: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}

function project(t: test.TestContext): Readonly<{
  root: string;
  invocation: ReturnType<typeof createTestNativePiInvocation>;
}> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-figma-review-native-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const nodePath = realpathSync(process.execPath);
  const cliPath = fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url));
  const invocation = createTestNativePiInvocation({
    root,
    host: {
      nodePath,
      nodeSha256: hash(readFileSync(nodePath)),
      cliPath,
      cliSha256: hash(readFileSync(cliPath)),
      provider: 'fixture-provider',
      model: 'fixture-model',
      thinkingLevel: 'medium',
      parentSessionId: 'figma-review-parent',
    },
  });
  const adapter = createTestProjectWriteAdapter(root, invocation);
  const snapshot: FigmaSnapshot = {
    fileKey: 'Fixture123',
    fileName: 'Fixture',
    capturedAt: '2026-10-17T00:00:00.000Z',
    pages: [{
      id: '0:1',
      name: 'Page',
      frames: [{
        id: '1:2',
        name: 'Desktop',
        nodes: [
          {
            id: '1:2',
            name: 'Desktop',
            type: 'FRAME',
            absoluteBoundingBox: { x: 0, y: 0, width: 60, height: 60 },
            fills: [],
            effects: [],
          },
          {
            id: '2:3',
            name: 'Card',
            type: 'FRAME',
            absoluteBoundingBox: { x: 0, y: 0, width: 60, height: 60 },
            fills: [{ type: 'solid', hex: '#ffffff' }],
            effects: [],
          },
        ],
      }],
    }],
    componentSets: {},
  };
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot));
  const exportBytes = png(255);
  const renderBytes = png(0);
  put(root, '.omd/figma/snapshot.json', snapshotBytes);
  put(root, '.omd/figma/exports/1_2.png', exportBytes);
  put(root, '.omd/figma/exports/1_2.png.omd.json', figmaArtifactReceipt({
    kind: 'export',
    frameId: '1:2',
    snapshotBytes,
    pngBytes: exportBytes,
  }));
  put(root, '.omd/figma/renders/1_2.png', renderBytes);
  put(root, '.omd/figma/renders/1_2.png.omd.json', figmaArtifactReceipt({
    kind: 'render',
    frameId: '1:2',
    snapshotBytes,
    pngBytes: renderBytes,
  }));
  const result = compareImages(exportBytes, renderBytes);
  const diffBytes = Buffer.from(figmaDiffRecord(root, {
    frameId: '1:2',
    snapshotBytes,
    exportBytes,
    renderBytes,
    result,
  }));
  put(root, figmaDiffRecordPath('1:2'), diffBytes);
  const renderedElements: readonly RenderedElementFact[] = [{
    tag: 'article',
    selector: '#card',
    text: 'Card',
    box: { x: 0, y: 0, width: 60, height: 60 },
    styles: {
      fontFamily: 'Arial',
      fontSize: '16px',
      fontWeight: '400',
      lineHeight: 'normal',
      letterSpacing: 'normal',
      color: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(0, 0, 0)',
      border: '0px none rgb(255, 255, 255)',
      borderRadius: '0px',
      padding: '0px',
      gap: 'normal',
    },
  }];
  const frame = snapshot.pages[0]?.frames[0];
  assert.ok(frame);
  const compare = createFigmaCompareRecord(root, {
    frame,
    snapshot,
    snapshotBytes,
    exportBytes,
    renderBytes,
    diffBytes,
    result,
    renderedElements,
    adapter,
  });
  adapter.write(figmaCompareRecordPath('1:2'), serializeFigmaCompareRecord(compare));
  return { root, invocation };
}

test('native Figma review delivers composites and persists a signed accepted record', { timeout: 120_000 }, async t => {
  const { root, invocation } = project(t);
  const previousMode = process.env.PI_REVIEWER_FIXTURE_MODE;
  const previousTrace = process.env.PI_REVIEWER_FIXTURE_TRACE;
  const tracePath = join(root, 'trace.jsonl');
  writeFileSync(tracePath, '');
  process.env.PI_REVIEWER_FIXTURE_MODE = 'figma-mismatch';
  process.env.PI_REVIEWER_FIXTURE_TRACE = tracePath;
  t.after(() => {
    if (previousMode === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = previousMode;
    if (previousTrace === undefined) delete process.env.PI_REVIEWER_FIXTURE_TRACE;
    else process.env.PI_REVIEWER_FIXTURE_TRACE = previousTrace;
  });
  const reviewed = await runFigmaFidelityReview(root, '1:2', invocation, t.signal);
  assert.equal(reviewed.verdict, 'mismatch');
  assert.equal(reviewed.fixes[0]?.element.renderedSelector, '#card');
  const persisted = readFigmaFidelityReview(root, '1:2');
  assert.equal(persisted?.review.verdict, 'mismatch');
  assert.equal(persisted?.history.at(-1)?.unresolved[0]?.count, 1);
  const trace = readFileSync(tracePath, 'utf8');
  assert.match(trace, /evidence-image:/);
  await runFigmaFidelityReview(root, '1:2', invocation, t.signal);
  const third = await runFigmaFidelityReview(root, '1:2', invocation, t.signal);
  assert.deepEqual(third.stuckFixes, [{ id: 'card-background', count: 3 }]);
  assert.equal(readFigmaFidelityReview(root, '1:2')?.history.length, 3);
});

test('invalid Figma reviewer handback publishes no accepted record', { timeout: 120_000 }, async t => {
  const { root, invocation } = project(t);
  const previousMode = process.env.PI_REVIEWER_FIXTURE_MODE;
  process.env.PI_REVIEWER_FIXTURE_MODE = 'figma-unknown-element';
  t.after(() => {
    if (previousMode === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = previousMode;
  });
  await assert.rejects(
    () => runFigmaFidelityReview(root, '1:2', invocation, t.signal),
    /unknown rendered element/,
  );
  assert.equal(existsSync(join(root, '.omd/figma/reviews/1_2.json')), false);
});

test('figma review CLI publishes JSON on success and preserves it on refused handback', { timeout: 120_000 }, async t => {
  const { root } = project(t);
  const runtimeRoot = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
  const hostRoot = join(root, 'fake-pi-host');
  const hostCli = join(hostRoot, 'cli.mjs');
  mkdirSync(hostRoot);
  writeFileSync(join(hostRoot, 'package.json'), JSON.stringify({ name: '@code-yeongyu/senpi' }));
  copyFileSync(fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url)), hostCli);
  capturePiRequest(root, 'Implement the supplied Figma frame exactly.');
  const previousEntry = process.argv[1];
  let run: ReturnType<typeof ensureNativePiRun> | undefined;
  try {
    process.argv[1] = hostCli;
    run = ensureNativePiRun({
      root,
      runtimeRoot,
      loadedSkillPath: join(runtimeRoot, 'src/skills/omd-ultradesign/SKILL.md'),
      provider: 'fixture-provider',
      model: 'fixture-model',
      thinkingLevel: 'medium',
      parentSessionId: 'figma-cli-parent',
    });
  } finally {
    if (previousEntry === undefined) delete process.argv[1];
    else process.argv[1] = previousEntry;
  }
  assert.ok(run);
  const nativeRun = run;
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !key.startsWith('OMD_') && key !== 'NODE_TEST_CONTEXT'));
  const cli = join(runtimeRoot, 'bin/omd.mjs');
  const invoke = (mode: string) => {
    const command = stageNativePiCommand({ run: nativeRun, runtimeRoot, argv: ['figma', 'review', '1:2', '--json'] });
    try {
      return spawnSync(process.execPath, [cli, ...command.argv], {
        cwd: root,
        env: { ...env, PI_REVIEWER_FIXTURE_MODE: mode },
        encoding: 'utf8',
        timeout: 60_000,
      });
    } finally { command.dispose(); }
  };
  const success = invoke('success');
  assert.equal(success.status, 0, success.stderr);
  const output = JSON.parse(success.stdout) as { verdict: string; path: string };
  assert.equal(output.verdict, 'match');
  assert.equal(output.path, '.omd/figma/reviews/1_2.json');
  const accepted = readFileSync(join(root, output.path));
  const refused = invoke('figma-unknown-element');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /unknown rendered element/);
  assert.equal(refused.stdout, '');
  assert.deepEqual(readFileSync(join(root, output.path)), accepted);
});
