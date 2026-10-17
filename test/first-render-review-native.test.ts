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
import { publishQualitativeFeedback } from '../core/design/qualitative-feedback.ts';
import { publishConsultedReferences } from '../core/design/consulted-references.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

test('native early review repairs and recaptures without final evidence and reuses unchanged judgments', { timeout: 120_000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-early-review-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const oldMode = process.env.PI_REVIEWER_FIXTURE_MODE;
  const oldTrace = process.env.PI_REVIEWER_FIXTURE_TRACE;
  t.after(() => {
    if (oldMode === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = oldMode;
    if (oldTrace === undefined) delete process.env.PI_REVIEWER_FIXTURE_TRACE;
    else process.env.PI_REVIEWER_FIXTURE_TRACE = oldTrace;
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
  assert.equal(initialPacket.evidence.referenceRenders, undefined);
  const reportedPng = Buffer.from(initialPacket.evidence.renders[0].pngBase64, 'base64');
  mkdirSync(join(root, '.omd/.cache'), { recursive: true });
  writeFileSync(join(root, '.omd/.cache/reported.png'), reportedPng);
  const reported = publishQualitativeFeedback(root, {
    schema: 'qualitative-feedback-input-v1', requestSha256: hash('reading task'),
    origin: 'reported', text: 'The whole result is rejected.', interpretation: 'Reconsider the whole system.',
    images: [{ path: '.omd/.cache/reported.png', sha256: hash(reportedPng), viewport: 'desktop', state: 'initial' }],
  }, writer);
  const withFeedback = JSON.parse(firstRenderReviewPacket(root, invocation).packet.toString('utf8'));
  assert.equal(withFeedback.outputContract.fixedBindings.reportedFeedbackSha256, reported.sha256);
  assert.equal(withFeedback.evidence.feedbackRenders[0].pngBase64, reportedPng.toString('base64'));
  assert.equal(JSON.stringify(withFeedback).includes('The whole result is rejected.'), false);
  assert.equal(JSON.stringify(withFeedback).includes('reported.png'), false);
  const consulted = publishConsultedReferences(root, {
    schema: 'consulted-references-input-v1', requestSha256: hash('reading task'),
    images: [{ path: '.omd/.cache/reported.png', sha256: hash(reportedPng),
      sourceUrl: 'https://example.com/portrait-original', role: 'primary' }],
  }, writer);
  const withOriginal = JSON.parse(firstRenderReviewPacket(root, invocation).packet.toString('utf8'));
  assert.equal(withOriginal.outputContract.fixedBindings.consultedReferencesSha256, consulted.sha256);
  assert.equal(withOriginal.evidence.consultedReferenceRenders[0].role, 'consulted-external-original');
  assert.equal(withOriginal.evidence.consultedReferenceRenders[0].pngBase64, reportedPng.toString('base64'));
  assert.deepEqual(withOriginal.outputContract.referenceComparisons,
    withOriginal.evidence.renders.map((row: { viewport: string; captureSha256: string }) => ({
      viewport: row.viewport, captureSha256: row.captureSha256, referenceSha256: hash(reportedPng),
    })));
  assert.equal(withOriginal.evidence.referenceRenders, undefined);
  assert.deepEqual(withOriginal.evidence.feedbackRenders, withFeedback.evidence.feedbackRenders);
  assert.equal(JSON.stringify(withOriginal).includes('example.com'), false);
  assert.equal(JSON.stringify(withOriginal).includes('reported.png'), false);
  const tracePath = join(root, 'reviewer-trace.jsonl');
  writeFileSync(tracePath, '');
  process.env.PI_REVIEWER_FIXTURE_TRACE = tracePath;
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-missing-comparison';
  await assert.rejects(() => runFirstRenderReview(root, invocation, t.signal), /reference comparison/);
  assert.equal(existsSync(join(root, '.omd/first-render/review.json')), false);
  assert.equal(readFileSync(join(root, 'dist/index.html'), 'utf8'), html);
  assert.equal(readdirSync(join(root, '.omd/first-render/reviews')).length, 1);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-missing-quality';
  await assert.rejects(() => runFirstRenderReview(root, invocation, t.signal), /quality coverage/);
  assert.equal(existsSync(join(root, '.omd/first-render/review.json')), false);
  assert.equal(readdirSync(join(root, '.omd/first-render/reviews')).length, 2);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-revise';
  const rejected = await runFirstRenderReview(root, invocation, t.signal);
  assert.equal(rejected.decision, 'revise');
  const deliveredImages = readFileSync(tracePath, 'utf8').trim().split('\n')
    .map(line => JSON.parse(line) as { event: string; pid: number });
  assert.ok(deliveredImages.some(({ pid }) => deliveredImages
    .filter(row => row.pid === pid && row.event === `evidence-image:${hash(reportedPng)}`).length >= 3),
    'current render, reported rejection and external original must each reach the actual evidence tool');
  assert.throws(() => requireRetainedFirstRenderReview(root, invocation), /retain/);
  assert.equal(rejected.next, 'repair-model-led-source-and-recapture');
  assert.deepEqual(rejected.repairOwners, ['coordinator']);
  assert.equal(readFirstRenderReview(root)?.findings.length, 1);
  assert.equal(existsSync(join(root, '.omd/final-v2.json')), false);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'success';
  assert.equal((await runFirstRenderReview(root, invocation, t.signal)).sha256, rejected.sha256);
  writeFileSync(join(root, 'dist/index.html'), html.replace('width:38px', 'width:48px'));
  await assert.rejects(() => runFirstRenderReview(root, invocation, t.signal), /VISUAL_MEASUREMENT: production build changed/);
  await publishFirstRenderCheck(root, 'dist/index.html', undefined, writer, invocation);
  const prepared = firstRenderReviewPacket(root, invocation);
  const packet = JSON.parse(prepared.packet.toString('utf8'));
  const originalMobile = initialPacket.evidence.renders[1];
  assert.notEqual(packet.evidence.renders[1].captureSha256, originalMobile.captureSha256);
  assert.equal(packet.evidence.referenceRenders, undefined);
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
  const forgedOriginal = JSON.parse(prepared.packet.toString('utf8'));
  forgedOriginal.evidence.consultedReferenceRenders[0].captureSha256 = 'f'.repeat(64);
  await assert.rejects(() => runPiFirstRenderReviewer({
    root, invocation, packet: Buffer.from(JSON.stringify(forgedOriginal)), signal: t.signal,
  }), /consulted-reference/);
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
  assert.throws(() => requireRetainedFirstRenderReview(root, {
    ...invocation, current: { ...invocation.current, buildSha256: '0'.repeat(64) },
  }), /current review evidence changed/);
  assert.deepEqual(retained.resolvedFindings.map(finding => finding.id), rejected.findings.map(finding => finding.id));
  assert.notEqual(retained.sha256, rejected.sha256);
  assert.equal(readFirstRenderReview(root)?.bindings.previousReviewSha256, stillRejected.sha256);
  publishConsultedReferences(root, {
    schema: 'consulted-references-input-v2', requestSha256: hash('reading task'),
    images: [{ path: '.omd/.cache/reported.png', sha256: hash(reportedPng),
      sourceUrl: 'https://example.com/portrait-original', role: 'primary',
      component: 'portrait-detail', state: 'open' }],
  }, writer);
  assert.throws(() => requireRetainedFirstRenderReview(root, invocation), /current review evidence changed/);
  const withoutCandidate = JSON.parse(firstRenderReviewPacket(root, invocation).packet.toString('utf8'));
  assert.equal(withoutCandidate.evidence.referenceRenders, undefined);
  assert.equal(withoutCandidate.evidence.consultedReferenceRenders.length, 1);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-revise';
  const changedOriginalReview = await runFirstRenderReview(root, invocation, t.signal);
  assert.notEqual(changedOriginalReview.sha256, retained.sha256);
  assert.equal(changedOriginalReview.decision, 'revise');
  writeFileSync(join(root, retained.path), '{}');
  assert.throws(() => readFirstRenderReview(root));
  assert.throws(() => requireRetainedFirstRenderReview(root, invocation));
});
