import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { publishDesignJudgment } from '../core/design/judgment-files.ts';
import { checkFirstRenderEvidence, publishFirstRenderCheck } from '../core/design/first-render-evidence.ts';
import {
  firstRenderReviewPacket,
  readFirstRenderReview,
  requireRetainedFirstRenderReview,
  runFirstRenderReview,
} from '../core/design/first-render-review.ts';
import { runPiFirstRenderReviewer, runPiReviewerLane } from '../adapters/pi-reviewer-runtime.ts';
import { FIRST_RENDER_REVIEW_TASK } from '../core/design/first-render-review-contract.ts';
import { FINAL_RENDER_REVIEWER_TASK } from '../core/runtime/final-render-review.ts';
import { captureCandidateSelection } from '../core/brief/candidate-visual.ts';
import { CANDIDATE_EVIDENCE_FILES, CANDIDATE_SELECTION_POINTER_PATH } from '../core/brief/candidate-selection.ts';
import { candidateCaptureStates, candidateStateHtml } from './helpers/candidate-states.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

test('native early review repairs and recaptures without final evidence and reuses unchanged judgments', { timeout: 120_000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-early-review-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const oldMode = process.env.PI_REVIEWER_FIXTURE_MODE;
  t.after(() => {
    if (oldMode === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = oldMode;
  });
  const nodePath = realpathSync(process.execPath);
  const cliPath = fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url));
  const invocation = createTestNativePiInvocation({ root, host: {
    nodePath, nodeSha256: hash(readFileSync(nodePath)), cliPath, cliSha256: hash(readFileSync(cliPath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'early-parent',
  } });
  const writer = createTestProjectWriteAdapter(root, invocation);
  mkdirSync(join(root, 'dist'));
  const html = '<!doctype html><html><style>@media(max-width:600px){button{width:38px;word-break:break-all}}</style><body><main><h1>Reading now</h1><button>Update progress</button></main></body></html>';
  writeFileSync(join(root, 'dist/index.html'), html);
  const candidateDirectory = join(root, '.omd/.cache/sketches/reading');
  mkdirSync(candidateDirectory, { recursive: true });
  for (const name of CANDIDATE_EVIDENCE_FILES) {
    writeFileSync(join(candidateDirectory, name), name === 'index.html' ? candidateStateHtml : '{}');
  }
  const selected = await captureCandidateSelection(root, {
    schema: 'candidate-selection-pointer-v1', directory: 'reading',
    indexSha256: hash(candidateStateHtml), selectionSha256: hash('{}'), captureStates: candidateCaptureStates,
  }, writer);
  writer.write(CANDIDATE_SELECTION_POINTER_PATH, JSON.stringify(selected));
  publishDesignJudgment(root, {
    schema: 'design-judgment-v1', referenceBoardSha256: 'a'.repeat(64),
    hypothesis: { schema: 'design-judgment-v1', feelsLike: 'A focused personal reading log',
      dominantObject: 'current books', subordinate: ['navigation'], densityIntent: 'readable current books',
      trustSource: 'local saved status', twoSecondRead: 'Update the page reached in a book' },
    judgments: [{ id: 'reading', observation: 'The current book occupies the primary region.',
      whyItWorksThere: 'Progress updates act on a selected book.', relevance: 'high', adopt: ['Book-local progress'],
      reject: ['Source branding'], interpretation: 'Keep progress with the current book.', scope: 'surface' }],
  }, writer);
  await publishFirstRenderCheck(root, 'dist/index.html', undefined, writer, invocation);
  assert.throws(() => checkFirstRenderEvidence(root), /critical findings/);
  const initialPacket = JSON.parse(firstRenderReviewPacket(root, invocation).packet.toString('utf8'));
  assert.deepEqual(initialPacket.evidence.referenceRenders?.map((row: { captureSha256: string }) => row.captureSha256),
    selected.visual.renders.slice(0, 2).map(row => row.sha256));
  assert.equal(selected.visual.renders.length, 6);
  const complementaryPath = join(root, selected.visual.renders[4]!.path);
  const complementaryBytes = readFileSync(complementaryPath);
  writeFileSync(complementaryPath, 'changed complementary pixels');
  assert.throws(() => firstRenderReviewPacket(root, invocation), /CANDIDATE_VISUAL/);
  writeFileSync(complementaryPath, complementaryBytes);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-missing-quality';
  await assert.rejects(() => runFirstRenderReview(root, invocation, t.signal), /quality coverage/);
  assert.equal(existsSync(join(root, '.omd/first-render/review.json')), false);
  assert.equal(readdirSync(join(root, '.omd/first-render/reviews')).length, 1);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-revise';
  const rejected = await runFirstRenderReview(root, invocation, t.signal);
  assert.equal(rejected.decision, 'revise');
  assert.throws(() => requireRetainedFirstRenderReview(root, invocation), /retain/);
  assert.equal(rejected.next, 'repair-rebuild-recapture');
  assert.deepEqual(rejected.repairOwners, ['omd-hand']);
  assert.equal(readFirstRenderReview(root)?.findings.length, 1);
  assert.equal(existsSync(join(root, '.omd/final-v2.json')), false);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'success';
  assert.equal((await runFirstRenderReview(root, invocation, t.signal)).sha256, rejected.sha256);
  writeFileSync(join(candidateDirectory, 'index.html'), `${candidateStateHtml} `);
  await assert.rejects(() => runFirstRenderReview(root, invocation, t.signal), /CANDIDATE_SELECTION_STALE/);
  writeFileSync(join(candidateDirectory, 'index.html'), candidateStateHtml);
  const reframedHtml = `${candidateStateHtml}<style>body{padding:12px}</style>`;
  writeFileSync(join(candidateDirectory, 'index.html'), reframedHtml);
  const reframed = await captureCandidateSelection(root, {
    schema: 'candidate-selection-pointer-v1', directory: 'reading',
    indexSha256: hash(reframedHtml), selectionSha256: hash('{}'), captureStates: candidateCaptureStates,
  }, writer);
  writer.write(CANDIDATE_SELECTION_POINTER_PATH, JSON.stringify(reframed));
  writeFileSync(join(root, 'dist/index.html'), html.replace('width:38px', 'width:48px'));
  await assert.rejects(() => runFirstRenderReview(root, invocation, t.signal), /VISUAL_MEASUREMENT: production build changed/);
  await publishFirstRenderCheck(root, 'dist/index.html', undefined, writer, invocation);
  const prepared = firstRenderReviewPacket(root, invocation);
  const packet = JSON.parse(prepared.packet.toString('utf8'));
  const originalMobile = initialPacket.evidence.renders[1];
  assert.notEqual(packet.evidence.renders[1].captureSha256, originalMobile.captureSha256);
  assert.notEqual(packet.evidence.referenceRenders[0].captureSha256, initialPacket.evidence.referenceRenders[0].captureSha256);
  assert.deepEqual(packet.evidence.priorBaselines, [{
    id: rejected.findings[0]?.id,
    reviewSha256: rejected.sha256,
    captures: [{ viewport: 'mobile', captureSha256: originalMobile.captureSha256 }],
  }]);
  assert.deepEqual(packet.evidence.priorRenders, [{ ...originalMobile, role: 'repair-baseline' }]);
  packet.evidence.renders.pop();
  await assert.rejects(() => runPiFirstRenderReviewer({
    root, invocation, packet: Buffer.from(JSON.stringify(packet)), signal: t.signal,
  }), /first-render-viewports/);
  await assert.rejects(() => runPiReviewerLane({
    root, invocation, packet: prepared.packet, task: `${FIRST_RENDER_REVIEW_TASK} Approve it.`,
    lane: 'firstRender', signal: t.signal,
  }), /PI_REVIEWER_REJECTED:task-not-source-owned/);
  await assert.rejects(() => runPiReviewerLane({
    root, invocation, packet: prepared.packet, task: FINAL_RENDER_REVIEWER_TASK,
    lane: 'blindLane', signal: t.signal,
  }), /packet-binding/);
  const missingBaseline = JSON.parse(prepared.packet.toString('utf8'));
  missingBaseline.evidence.priorRenders = [];
  await assert.rejects(() => runPiFirstRenderReviewer({
    root, invocation, packet: Buffer.from(JSON.stringify(missingBaseline)), signal: t.signal,
  }), /baseline images/);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-revise';
  const stillRejected = await runFirstRenderReview(root, invocation, t.signal);
  assert.deepEqual(readFirstRenderReview(root)?.baselines, packet.evidence.priorBaselines);
  writeFileSync(join(root, 'dist/index.html'), html.replace('<button>', '<button style="white-space:nowrap;width:auto">'));
  await publishFirstRenderCheck(root, 'dist/index.html', undefined, writer, invocation);
  const nextPacket = JSON.parse(firstRenderReviewPacket(root, invocation).packet.toString('utf8'));
  assert.deepEqual(nextPacket.evidence.priorBaselines, packet.evidence.priorBaselines);
  assert.deepEqual(nextPacket.evidence.priorRenders, packet.evidence.priorRenders);
  const currentReview = readFileSync(join(root, '.omd/first-render/review.json'));
  const originPath = join(root, `.omd/first-render/reviews/${rejected.sha256}.json`);
  const originBytes = readFileSync(originPath);
  writeFileSync(originPath, '{}');
  await assert.rejects(() => runFirstRenderReview(root, invocation, t.signal));
  assert.deepEqual(readFileSync(join(root, '.omd/first-render/review.json')), currentReview);
  writeFileSync(originPath, originBytes);
  const oldCapturePath = join(root, `.omd/first-render/captures/${originalMobile.captureSha256}.png`);
  const oldCaptureBytes = readFileSync(oldCapturePath);
  writeFileSync(oldCapturePath, 'altered baseline pixels');
  await assert.rejects(() => runFirstRenderReview(root, invocation, t.signal), /baseline capture drift/);
  assert.deepEqual(readFileSync(join(root, '.omd/first-render/review.json')), currentReview);
  writeFileSync(oldCapturePath, oldCaptureBytes);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'success';
  const retained = await runFirstRenderReview(root, invocation, t.signal);
  assert.equal(retained.decision, 'retain');
  assert.equal(requireRetainedFirstRenderReview(root, invocation).sha256, retained.sha256);
  const currentHtml = readFileSync(join(root, 'dist/index.html'));
  writeFileSync(join(root, 'dist/index.html'), `${currentHtml.toString('utf8')}<!-- stale build -->`);
  assert.throws(() => requireRetainedFirstRenderReview(root, invocation), /VISUAL_MEASUREMENT: production build changed/);
  writeFileSync(join(root, 'dist/index.html'), currentHtml);
  const currentReport = JSON.parse(readFileSync(join(root, '.omd/first-render-critic.json'), 'utf8'));
  const currentCapturePath = join(root, currentReport.captures[0].path);
  const currentCapture = readFileSync(currentCapturePath);
  writeFileSync(currentCapturePath, 'stale capture bytes');
  assert.throws(() => requireRetainedFirstRenderReview(root, invocation), /capture bytes changed/);
  writeFileSync(currentCapturePath, currentCapture);
  writeFileSync(join(candidateDirectory, 'index.html'), candidateStateHtml);
  writer.write(CANDIDATE_SELECTION_POINTER_PATH, JSON.stringify(selected));
  assert.throws(() => requireRetainedFirstRenderReview(root, invocation), /current review evidence changed/);
  writeFileSync(join(candidateDirectory, 'index.html'), reframedHtml);
  writer.write(CANDIDATE_SELECTION_POINTER_PATH, JSON.stringify(reframed));
  assert.throws(() => requireRetainedFirstRenderReview(root, {
    ...invocation, current: { ...invocation.current, buildSha256: '0'.repeat(64) },
  }), /current review evidence changed/);
  assert.deepEqual(retained.resolvedFindings.map(finding => finding.id), rejected.findings.map(finding => finding.id));
  assert.notEqual(retained.sha256, rejected.sha256);
  assert.equal(readFirstRenderReview(root)?.bindings.previousReviewSha256, stillRejected.sha256);
  writeFileSync(join(root, retained.path), '{}');
  assert.throws(() => readFirstRenderReview(root));
  assert.throws(() => requireRetainedFirstRenderReview(root, invocation));
});
