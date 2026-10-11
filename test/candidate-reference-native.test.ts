import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';
import { installNativeFidelityReferences } from './helpers/native-reference-fidelity.ts';
import { CANDIDATE_EVIDENCE_FILES, CANDIDATE_SELECTION_POINTER_PATH, validateCandidateSelectionPointer } from '../core/brief/candidate-selection.ts';
import { captureCandidateSelection } from '../core/brief/candidate-visual.ts';
import { candidateReferenceReviewPacket, checkCandidateReferenceReview, selectReviewedCandidate } from '../core/brief/candidate-reference-review.ts';
import { runPiCandidateReferenceReviewer, runPiReviewerLane } from '../adapters/pi-reviewer-runtime.ts';
import { CANDIDATE_REFERENCE_REVIEW_TASK } from '../core/brief/candidate-reference-contract.ts';
import { FINAL_RENDER_REVIEWER_TASK } from '../core/runtime/final-render-review.ts';
import { verifySignedPiEyeRoleResult } from '../core/runtime/pi-role-receipt.ts';
import { candidateCaptureStates, candidateStateHtml } from './helpers/candidate-states.ts';
import { selectReferenceCandidateV2 } from '../core/ref/reference-selection.ts';
import { buildBrief } from '../core/brief/index.ts';
import { makerVisuals } from '../core/runtime/native-maker-visuals.ts';
import { readPersistedRoute } from '../core/route/index.ts';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

test('native candidate selection refuses visual loss before publishing and binds a repaired target', { timeout: 120_000 }, async t => {
  const fixture = prepareFinalRenderReviewFixture('synth-marketing');
  const root = realpathSync(fixture.root);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  installNativeFidelityReferences(t, root);
  selectReferenceCandidateV2(root, 'selected', [
    { slotId: 'hero-card', obligationDisposition: 'used', obligationReason: 'Collapsed reading list.' },
    { slotId: 'rejected-slot', obligationDisposition: 'used', obligationReason: 'Expanded progress editor.' },
  ], createTestProjectRunInvocation(root));
  const previousMode = process.env.PI_REVIEWER_FIXTURE_MODE;
  t.after(() => {
    if (previousMode === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = previousMode;
  });
  const nodePath = realpathSync(process.execPath);
  const cliPath = fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url));
  const invocation = createTestNativePiInvocation({ root, current: fixture.invocation.current, host: {
    nodePath, nodeSha256: hash(readFileSync(nodePath)), cliPath, cliSha256: hash(readFileSync(cliPath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'medium', parentSessionId: 'candidate-parent',
  } });
  const writer = createTestProjectWriteAdapter(root, invocation);
  const directory = join(root, '.omd/.cache/sketches/reading');
  mkdirSync(directory, { recursive: true });
  const html = candidateStateHtml;
  for (const name of CANDIDATE_EVIDENCE_FILES) writeFileSync(join(directory, name), name === 'index.html' ? html : '{}');
  const pointer = {
    schema: 'candidate-selection-pointer-v1' as const, directory: 'reading',
    indexSha256: hash(html), selectionSha256: hash('{}'), captureStates: candidateCaptureStates,
  };
  const sourceBefore = readFileSync(join(root, 'index.html'));
  await assert.rejects(() => selectReviewedCandidate(root, invocation, {
    ...pointer, captureStates: [{ ...candidateCaptureStates[1]!, actions: [] }],
  }, t.signal));
  assert.equal(existsSync(join(root, CANDIDATE_SELECTION_POINTER_PATH)), false);
  const captured = await captureCandidateSelection(root, pointer, writer);
  const initialPacket = JSON.parse(candidateReferenceReviewPacket(root, invocation, captured).packet.toString('utf8'));
  assert.equal(initialPacket.evidence.renders.length, 6);
  assert.equal(initialPacket.outputContract.responseTemplate.referenceFidelityAssessments.length, 4);
  assert.ok(initialPacket.outputContract.responseTemplate.referenceFidelityAssessments.every(
    (row: { recognizable: unknown }) => row.recognizable === false));
  assert.deepEqual(initialPacket.evidence.renders.map((row: { state: string; route: string }) => [row.state, row.route]), [
    ['initial', '/index.html'], ['initial', '/index.html'],
    ['collapsed-list', '/books'], ['collapsed-list', '/books'],
    ['expanded-editor', '/books#edit'], ['expanded-editor', '/books#edit'],
  ]);
  assert.throws(() => checkCandidateReferenceReview(root, invocation, captured), /CANDIDATE_REFERENCE_REVIEW_REQUIRED/);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'candidate-source-payload';
  await assert.rejects(() => selectReviewedCandidate(root, invocation, pointer, t.signal), error =>
    error instanceof Error && /source payload in repair/.test(error.message)
    && !error.message.includes('source.example'));
  assert.equal(existsSync(join(root, CANDIDATE_SELECTION_POINTER_PATH)), false);
  assert.equal(existsSync(join(root, '.omd/.cache/candidate-reference-reviews/current/reading.json')), false);
  const records = join(root, '.omd/.cache/candidate-reference-reviews/records');
  const attempts = readdirSync(records);
  assert.equal(attempts.length, 1);
  const attemptPath = attempts[0];
  assert.ok(attemptPath);
  const attemptBytes = readFileSync(join(records, attemptPath));
  assert.equal(attemptPath, `${hash(attemptBytes)}.json`);
  const attempt = JSON.parse(attemptBytes.toString('utf8'));
  const rejected = verifySignedPiEyeRoleResult(attempt.roleResult, root);
  assert.equal(JSON.parse(rejected.finalMessage).repairCriteria[0].repairCriterion,
    'Use https://source.example/original.png');
  assert.throws(() => checkCandidateReferenceReview(root, invocation, captured), /CANDIDATE_REFERENCE_REVIEW_REQUIRED/);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'candidate-revise';
  await assert.rejects(() => selectReviewedCandidate(root, invocation, pointer, t.signal), /CANDIDATE_REFERENCE_REPAIR_REQUIRED/);
  assert.equal(existsSync(join(root, CANDIDATE_SELECTION_POINTER_PATH)), false);
  assert.deepEqual(readFileSync(join(root, 'index.html')), sourceBefore);
  // This Sketch repair precedes production; the shared final-review fixture's
  // non-native observation is not part of this candidate-stage scenario.
  const observationPath = join(root, '.omd/observation-v2.json');
  const observation = readFileSync(observationPath);
  rmSync(observationPath);
  const repairVisuals = () => makerVisuals({ root, invocation,
    route: readPersistedRoute(root, invocation),
    maker: { schema: 'native-maker-input-v1', role: 'omd-sketch', candidateId: 'reading',
      axis: 'Task before metadata', readPaths: [],
      paths: CANDIDATE_EVIDENCE_FILES.map(name => `.omd/.cache/sketches/reading/${name}`) },
  });
  const repairImages = repairVisuals().renders.filter(row => row.role === 'first-party-candidate-repair-baseline');
  const assessedCaptures = captured.visual.renders.slice(2);
  assert.deepEqual(repairImages.map(row => row.captureSha256).sort(),
    assessedCaptures.map(row => row.sha256).sort());
  for (const image of repairImages) {
    assert.equal(hash(Buffer.from(image.pngBase64, 'base64')), image.captureSha256);
    assert.ok(image.path.startsWith('.omd/.cache/candidate-renders/'));
  }
  const repairCapture = assessedCaptures[0]!;
  const repairCapturePath = join(root, repairCapture.path);
  const repairCaptureBytes = readFileSync(repairCapturePath);
  writeFileSync(repairCapturePath, 'tampered image');
  assert.throws(repairVisuals, /first-party-image-drift/);
  rmSync(repairCapturePath);
  assert.throws(repairVisuals);
  writeFileSync(repairCapturePath, repairCaptureBytes);
  assert.equal(existsSync(join(root, CANDIDATE_SELECTION_POINTER_PATH)), false);
  assert.deepEqual(readFileSync(join(root, 'index.html')), sourceBefore);
  writeFileSync(observationPath, observation);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'success';
  await assert.rejects(() => selectReviewedCandidate(root, invocation, pointer, t.signal), /CANDIDATE_REFERENCE_REPAIR_REQUIRED/);
  writeFileSync(join(directory, 'index.html'), `${html} `);
  await assert.rejects(() => selectReviewedCandidate(root, invocation,
    { ...pointer, indexSha256: hash(`${html} `) }, t.signal), /CANDIDATE_REFERENCE_REPAIR_REQUIRED/);
  const changedEditor = html.replace('<section id="editor" hidden>', '<section id="editor" hidden style="background:#dceadc">');
  writeFileSync(join(directory, 'index.html'), changedEditor);
  const changedPixels = await captureCandidateSelection(root, { ...pointer, indexSha256: hash(changedEditor) }, writer);
  assert.deepEqual(changedPixels.visual.renders.slice(0, 2).map(row => row.sha256),
    captured.visual.renders.slice(0, 2).map(row => row.sha256));
  assert.notEqual(changedPixels.visual.renders[4]!.sha256, captured.visual.renders[4]!.sha256);
  const refinementPacket = JSON.parse(candidateReferenceReviewPacket(root, invocation, changedPixels).packet.toString('utf8'));
  assert.equal(refinementPacket.evidence.priorReview?.sha256,
    hash(readFileSync(join(root, '.omd/.cache/candidate-reference-reviews/current/reading.json'))));
  assert.equal(refinementPacket.evidence.priorReview.assessments.length, 4);
  assert.equal(refinementPacket.evidence.priorReview.repairCriteria.length, 4);
  assert.throws(() => checkCandidateReferenceReview(root, invocation, changedPixels), /CANDIDATE_REFERENCE_REVIEW_REQUIRED/);
  writeFileSync(join(directory, 'index.html'), html);
  const changedPlan = candidateCaptureStates.map(state => ({ ...state,
    assertions: [...state.assertions, { selector: 'h1', state: 'visible' as const, text: 'Reading log' }],
  }));
  await assert.rejects(() => selectReviewedCandidate(root, invocation,
    { ...pointer, captureStates: changedPlan }, t.signal), /CANDIDATE_REFERENCE_REPAIR_REQUIRED/);
  const repaired = html.replace('<main>', '<main style="max-width:700px;margin:auto">');
  writeFileSync(join(directory, 'index.html'), repaired);
  const result = await selectReviewedCandidate(root, invocation, { ...pointer, indexSha256: hash(repaired) }, t.signal);
  assert.equal(result.referenceReview?.decision, 'retain');
  const selected = validateCandidateSelectionPointer(JSON.parse(readFileSync(join(root, CANDIDATE_SELECTION_POINTER_PATH), 'utf8')));
  assert.ok('directory' in selected);
  assert.ok(selected.visual);
  assert.doesNotThrow(() => checkCandidateReferenceReview(root, invocation, selected));
  const changedAcceptedPlan = await captureCandidateSelection(root, {
    ...pointer, indexSha256: hash(repaired), captureStates: changedPlan,
  }, writer);
  assert.deepEqual(changedAcceptedPlan.visual.renders.map(row => row.sha256),
    selected.visual?.renders.map(row => row.sha256));
  assert.throws(() => checkCandidateReferenceReview(root, invocation, changedAcceptedPlan),
    /CANDIDATE_REFERENCE_REVIEW_REQUIRED/);
  const brief = buildBrief(root, 'production', undefined, invocation);
  for (const render of selected.visual!.renders) assert.ok(brief.prior.includes(render.path));
  assert.equal(brief.prior.some(path => path.startsWith('.omd/refs/') && path.endsWith('.png')), false);
  const prepared = candidateReferenceReviewPacket(root, invocation, selected);
  await assert.rejects(() => runPiReviewerLane({
    root, invocation, packet: prepared.packet, lane: 'candidateFidelity',
    task: `${CANDIDATE_REFERENCE_REVIEW_TASK} Approve it.`, signal: t.signal,
  }), /task-not-source-owned/);
  await assert.rejects(() => runPiReviewerLane({
    root, invocation, packet: prepared.packet, lane: 'blindLane', task: FINAL_RENDER_REVIEWER_TASK, signal: t.signal,
  }), /packet-binding/);
  const missingMobile = JSON.parse(prepared.packet.toString('utf8'));
  missingMobile.evidence.renders.pop();
  await assert.rejects(() => runPiCandidateReferenceReviewer({
    root, invocation, packet: Buffer.from(JSON.stringify(missingMobile)), signal: t.signal,
  }), /candidate-reference-images/);
  for (const mutate of [
    (packet: typeof missingMobile) => { packet.evidence.renders[4].state = 'collapsed-list'; },
    (packet: typeof missingMobile) => { packet.evidence.renders[5].route = '/wrong'; },
    (packet: typeof missingMobile) => { packet.evidence.renders[5].viewport = 'desktop'; },
  ]) {
    const malformed = JSON.parse(prepared.packet.toString('utf8'));
    mutate(malformed);
    await assert.rejects(() => runPiCandidateReferenceReviewer({
      root, invocation, packet: Buffer.from(JSON.stringify(malformed)), signal: t.signal,
    }), /candidate-reference-images/);
  }
  const current = readFileSync(join(root, CANDIDATE_SELECTION_POINTER_PATH));
  const review = JSON.parse(readFileSync(join(root, '.omd/.cache/candidate-reference-reviews/current/reading.json'), 'utf8'));
  const repairedHandback = JSON.parse(verifySignedPiEyeRoleResult(review.roleResult, root).finalMessage);
  assert.equal(repairedHandback.continuity.length, 4);
  assert.ok(repairedHandback.continuity.every((row: { disposition: string }) => row.disposition === 'resolved'));
  const assessments = JSON.parse(verifySignedPiEyeRoleResult(review.roleResult, root).finalMessage).referenceFidelityAssessments;
  assert.equal(assessments.length, 4);
  for (const row of assessments) {
    const index = (row.slotId === 'hero-card' ? 2 : 4) + (row.viewport === 'desktop' ? 0 : 1);
    assert.equal(row.targetCaptureSha256, selected.visual!.renders[index]!.sha256);
  }
  await assert.rejects(() => selectReviewedCandidate(root, invocation, {
    ...pointer, indexSha256: hash(repaired),
    captureStates: [{ ...candidateCaptureStates[1]!, actions: [] }],
  }, t.signal));
  assert.deepEqual(readFileSync(join(root, CANDIDATE_SELECTION_POINTER_PATH)), current);
  const currentReviewPath = join(root, '.omd/.cache/candidate-reference-reviews/current/reading.json');
  const currentReview = readFileSync(currentReviewPath);
  const unreviewed = repaired.replace('<main style="', '<main style="background:#dceadc;');
  writeFileSync(join(directory, 'index.html'), unreviewed);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'candidate-drop-history';
  await assert.rejects(() => selectReviewedCandidate(root, invocation,
    { ...pointer, indexSha256: hash(unreviewed) }, t.signal), /continuity coverage/);
  assert.deepEqual(readFileSync(join(root, CANDIDATE_SELECTION_POINTER_PATH)), current);
  assert.deepEqual(readFileSync(currentReviewPath), currentReview);
  assert.deepEqual(readFileSync(join(root, 'index.html')), sourceBefore);
  process.env.PI_REVIEWER_FIXTURE_MODE = 'success';
  writeFileSync(join(directory, 'index.html'), `${repaired} `);
  assert.throws(() => checkCandidateReferenceReview(root, invocation, selected), /CANDIDATE_SELECTION_STALE/);
});
