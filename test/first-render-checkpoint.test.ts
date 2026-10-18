import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { adaptiveRouteRecordSha256, readPersistedRoute } from '../core/route/index.ts';
import {
  FIRST_RENDER_CHECKPOINT_SCHEMA,
  FIRST_RENDER_ITERATION_HISTORY_SCHEMA,
  MAX_FIRST_RENDER_CHECKPOINT_BYTES,
  collectFirstRenderSourceSnapshot,
  firstRenderLoopState,
  firstRenderReviewMatchesCurrentRoute,
  persistFirstRenderCheckpoint,
  readFirstRenderIterationHistory,
  recordFirstRenderIterationReview,
  restoreFirstRenderIteration,
} from '../core/design/first-render-checkpoint.ts';
import { modelLedInput, publishModelLedRoute } from './helpers/model-led.ts';

const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const cliPath = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const captures = [
  { viewport: 'desktop' as const, captureSha256: '1'.repeat(64) },
  { viewport: 'mobile' as const, captureSha256: '2'.repeat(64) },
];

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-first-render-checkpoint-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/app.ts'), 'export const state = "initial";\n');
  const input = modelLedInput('Build a checkpointed interface.');
  input.allowedPaths = ['src/**', 'dist/**'];
  const { invocation, writer } = publishModelLedRoute(root, input);
  const route = readPersistedRoute(root, invocation);
  return { root, invocation, writer, route };
}

test('checkpoint persistence snapshots only allowed source and enforces the byte limit', t => {
  const value = fixture(t);
  mkdirSync(join(value.root, 'dist'), { recursive: true });
  writeFileSync(join(value.root, 'dist/index.html'), '<p>generated</p>');
  const source = collectFirstRenderSourceSnapshot(value.root, value.route);
  assert.deepEqual(source.files.map(file => file.path), ['src/app.ts']);
  const iteration = persistFirstRenderCheckpoint({
    ...value,
    source,
    routeSha256: adaptiveRouteRecordSha256(value.route),
    reportSha256: 'b'.repeat(64),
    captures,
  });
  assert.equal(iteration.id, '1');
  assert.equal(readFirstRenderIterationHistory(value.root, value.route).iterations.length, 1);
  assert.ok(existsSync(join(value.root, `.omd/first-render/checkpoints/${iteration.checkpointSha256}.json`)));

  writeFileSync(join(value.root, 'src/large.bin'), Buffer.alloc(MAX_FIRST_RENDER_CHECKPOINT_BYTES));
  assert.throws(() => collectFirstRenderSourceSnapshot(value.root, value.route),
    new RegExp(`exceeds ${MAX_FIRST_RENDER_CHECKPOINT_BYTES} bytes`));
  assert.equal(readFirstRenderIterationHistory(value.root, value.route).iterations.length, 1);
});

test('restore refuses absent checkpoints without source mutation', t => {
  const value = fixture(t);
  const before = readFileSync(join(value.root, 'src/app.ts'));
  assert.throws(() => restoreFirstRenderIteration(value), /no checkpoint exists/);
  assert.deepEqual(readFileSync(join(value.root, 'src/app.ts')), before);
  assert.equal(existsSync(join(value.root,
    `.omd/first-render/routes/${adaptiveRouteRecordSha256(value.route)}/restore.json`)), false);
});

test('checkpoint refuses an allowed source directory symlink', t => {
  const value = fixture(t);
  const actual = join(value.root, 'actual-source');
  mkdirSync(actual);
  writeFileSync(join(actual, 'app.ts'), 'export const linked = true;\n');
  rmSync(join(value.root, 'src'), { recursive: true, force: true });
  symlinkSync(actual, join(value.root, 'src'), 'dir');
  assert.throws(() => collectFirstRenderSourceSnapshot(value.root, value.route),
    /allowed source path is a symbolic link: src/);
  assert.equal(readFirstRenderIterationHistory(value.root, value.route).iterations.length, 0);
});

test('restore rejects checkpoint paths outside allowedPaths before mutation', t => {
  const value = fixture(t);
  const outside = Buffer.from('do not restore\n');
  const checkpoint = {
    schema: FIRST_RENDER_CHECKPOINT_SCHEMA,
    sourceContractSha256: value.route.sourceContractSha256,
    routeSha256: adaptiveRouteRecordSha256(value.route),
    reportSha256: 'b'.repeat(64),
    captures,
    totalBytes: outside.byteLength,
    files: [{ path: 'outside.txt', sha256: hash(outside), byteLength: outside.byteLength }],
  };
  const checkpointBytes = Buffer.from(canonicalJson(checkpoint));
  const checkpointSha256 = hash(checkpointBytes);
  value.writer.writeContentAddressed(`.omd/first-render/checkpoints/${checkpointSha256}.json`, checkpointBytes);
  value.writer.writeContentAddressed(`.omd/first-render/source-blobs/${hash(outside)}.bin`, outside);
  const history = {
    schema: FIRST_RENDER_ITERATION_HISTORY_SCHEMA,
    sourceContractSha256: value.route.sourceContractSha256,
    routeSha256: adaptiveRouteRecordSha256(value.route),
    iterations: [{
      id: '1', checkpointSha256, reportSha256: checkpoint.reportSha256, captures,
      reviewSha256: 'c'.repeat(64), decision: 'revise', progress: null, findingIds: ['remaining'],
    }],
    bestIterationId: '1',
  };
  value.writer.write(`.omd/first-render/routes/${adaptiveRouteRecordSha256(value.route)}/iterations.json`,
    canonicalJson(history));
  const before = readFileSync(join(value.root, 'src/app.ts'));
  assert.throws(() => restoreFirstRenderIteration(value), /outside allowedPaths/);
  assert.deepEqual(readFileSync(join(value.root, 'src/app.ts')), before);
  assert.equal(existsSync(join(value.root, 'outside.txt')), false);
});

test('restore preflights every target before changing an earlier source file', t => {
  const value = fixture(t);
  rmSync(join(value.root, 'src/app.ts'));
  mkdirSync(join(value.root, 'src/a'));
  mkdirSync(join(value.root, 'src/z'));
  writeFileSync(join(value.root, 'src/a/app.ts'), 'old a\n');
  writeFileSync(join(value.root, 'src/z/app.ts'), 'old z\n');
  const iteration = persistFirstRenderCheckpoint({
    ...value,
    source: collectFirstRenderSourceSnapshot(value.root, value.route),
    routeSha256: adaptiveRouteRecordSha256(value.route),
    reportSha256: 'b'.repeat(64),
    captures,
  });
  recordFirstRenderIterationReview({
    root: value.root,
    route: value.route,
    reportSha256: iteration.reportSha256,
    reviewSha256: 'c'.repeat(64),
    decision: 'revise',
    progress: null,
    findingIds: ['remaining'],
    invocation: value.invocation,
  });
  writeFileSync(join(value.root, 'src/a/app.ts'), 'new a\n');
  rmSync(join(value.root, 'src/z'), { recursive: true });
  writeFileSync(join(value.root, 'src/z'), 'obstructing file\n');
  assert.throws(() => restoreFirstRenderIteration(value), /ancestor|directory|mutation target/);
  assert.equal(readFileSync(join(value.root, 'src/a/app.ts'), 'utf8'), 'new a\n');
  assert.equal(readFileSync(join(value.root, 'src/z'), 'utf8'), 'obstructing file\n');
});

test('authorized restore writes checkpoint bytes and removes later allowed files', t => {
  const value = fixture(t);
  const original = readFileSync(join(value.root, 'src/app.ts'));
  const iteration = persistFirstRenderCheckpoint({
    ...value,
    source: collectFirstRenderSourceSnapshot(value.root, value.route),
    routeSha256: adaptiveRouteRecordSha256(value.route),
    reportSha256: 'b'.repeat(64),
    captures,
  });
  recordFirstRenderIterationReview({
    root: value.root,
    route: value.route,
    reportSha256: iteration.reportSha256,
    reviewSha256: 'c'.repeat(64),
    decision: 'revise',
    progress: null,
    findingIds: ['remaining'],
    invocation: value.invocation,
  });
  writeFileSync(join(value.root, 'src/app.ts'), 'export const state = "worse";\n');
  writeFileSync(join(value.root, 'src/extra.ts'), 'export const extra = true;\n');
  const restored = restoreFirstRenderIteration(value);
  assert.equal(restored.iterationId, '1');
  assert.equal(restored.best, true);
  assert.deepEqual(restored.written, ['src/app.ts']);
  assert.deepEqual(restored.removed, ['src/extra.ts']);
  assert.deepEqual(readFileSync(join(value.root, 'src/app.ts')), original);
  assert.equal(existsSync(join(value.root, 'src/extra.ts')), false);
  assert.equal(firstRenderLoopState(value.root, value.route).bestRestoreApplied, true);
  assert.equal(firstRenderLoopState(value.root, value.route).bestRestored, true);
  writeFileSync(join(value.root, 'src/app.ts'), 'export const state = "different approach";\n');
  assert.equal(firstRenderLoopState(value.root, value.route).bestRestoreApplied, true);
  assert.equal(firstRenderLoopState(value.root, value.route).bestRestored, false);
});

test('the same finding across three consecutive reviews stalls, and retain resets the streak', t => {
  const value = fixture(t);
  const addReview = (round: number, decision: 'retain' | 'revise') => {
    writeFileSync(join(value.root, 'src/app.ts'), `export const state = ${round};\n`);
    const iteration = persistFirstRenderCheckpoint({
      ...value,
      source: collectFirstRenderSourceSnapshot(value.root, value.route),
      routeSha256: adaptiveRouteRecordSha256(value.route),
      reportSha256: String(round).repeat(64),
      captures,
    });
    recordFirstRenderIterationReview({
      root: value.root,
      route: value.route,
      reportSha256: iteration.reportSha256,
      reviewSha256: String(round + 4).repeat(64),
      decision,
      progress: round === 1 ? null : {
        verdict: decision === 'retain' ? 'improved' : 'same',
        comparisons: [],
        findingIds: [],
      },
      findingIds: decision === 'retain' ? [] : ['persistent'],
      invocation: value.invocation,
    });
  };
  addReview(1, 'revise');
  addReview(2, 'revise');
  addReview(3, 'revise');
  assert.deepEqual(firstRenderLoopState(value.root, value.route).reasons, ['persistent-findings']);
  addReview(4, 'retain');
  assert.equal(firstRenderLoopState(value.root, value.route).stalled, false);
});

test('route replacement cannot inherit another route checkpoint or review', t => {
  const value = fixture(t);
  const iteration = persistFirstRenderCheckpoint({
    ...value,
    source: collectFirstRenderSourceSnapshot(value.root, value.route),
    routeSha256: adaptiveRouteRecordSha256(value.route),
    reportSha256: 'b'.repeat(64),
    captures,
  });
  const history = recordFirstRenderIterationReview({
    root: value.root,
    route: value.route,
    reportSha256: iteration.reportSha256,
    reviewSha256: 'c'.repeat(64),
    decision: 'revise',
    progress: null,
    findingIds: ['remaining'],
    invocation: value.invocation,
  });
  const reviewSha256 = history.iterations[0]?.reviewSha256;
  if (typeof reviewSha256 !== 'string') throw new Error('review fixture digest is missing');
  assert.equal(firstRenderReviewMatchesCurrentRoute(value.root, value.route, {
    routeSha256: adaptiveRouteRecordSha256(value.route),
    sha256: reviewSha256,
  }), true);
  const replacement = Object.freeze({
    ...value.route,
    claims: Object.freeze({
      ...value.route.claims,
      workingContext: Object.freeze([...value.route.claims.workingContext, 'replacement route']),
    }),
  });
  assert.notEqual(adaptiveRouteRecordSha256(replacement), adaptiveRouteRecordSha256(value.route));
  assert.equal(readFirstRenderIterationHistory(value.root, replacement).iterations.length, 0);
  assert.equal(firstRenderReviewMatchesCurrentRoute(value.root, replacement, {
    routeSha256: adaptiveRouteRecordSha256(value.route),
    sha256: reviewSha256,
  }), false);
  const before = readFileSync(join(value.root, 'src/app.ts'));
  assert.throws(() => restoreFirstRenderIteration({ ...value, route: replacement }), /no checkpoint exists/);
  assert.deepEqual(readFileSync(join(value.root, 'src/app.ts')), before);
});

test('restore CLI advertises the named-iteration JSON surface', t => {
  const value = fixture(t);
  const help = spawnSync(process.execPath, [cliPath, 'first-render', 'restore', '--help'], {
    cwd: value.root,
    encoding: 'utf8',
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--iteration <id>/);
});
