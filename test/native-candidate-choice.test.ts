import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { runNativeCandidateChoice } from '../core/brief/candidate-native-review.ts';
import { candidateDirectionState, directionCommitmentBlocker, publishCandidatePacket, readCurrentCandidateSelection } from '../core/brief/candidate-choice.ts';
import { CANDIDATE_REVIEW_FEEDBACK_PATH, readCandidateReviewFeedback, readCurrentCandidateReviewFeedback } from '../core/brief/candidate-review.ts';
import { publishCandidatePlan } from '../core/brief/candidate-plan.ts';
import { makerVisuals } from '../core/runtime/native-maker-visuals.ts';
import { publishAdaptiveRoute, readPersistedRoute } from '../core/route/index.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { createTestNativePiInvocation, getNativePiRun } from '../core/runtime/native-pi-run.ts';
import { createProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { hash } from '../core/brief/candidate-data.ts';
import { captureDesignExecutionPolicy } from '../core/config/design-execution.ts';
import { capturePiRequest } from '../extensions/omd-request-source.ts';
import { confidenceDebt, recordConfidenceDebt } from '../core/brief/confidence-debt.ts';
import { observePiReviewPurpose } from '../extensions/omd-review-purpose.ts';
import { fixture, renderedSet } from './helpers/phase6-process.ts';

for (const mode of ['success', 'candidate-choice-none', 'candidate-choice-wrong-alias', 'candidate-choice-no-quality',
  'candidate-choice-quality-fail', 'candidate-choice-quality-unassessed']) {
  test(`native candidate choice uses actual isolated image review: ${mode}`, { timeout: 120_000 }, async t => {
    const base = fixture(t);
    capturePiRequest(base.root, base.input.request);
    observePiReviewPurpose(base.root, base.input.request, 'pi-rpc');
    const nodePath = realpathSync(process.execPath);
    const cliPath = fileURLToPath(new URL('fixtures/pi-reviewer-rpc.mjs', import.meta.url));
    const invocation = createTestNativePiInvocation({
      root: base.root, current: { ...base.invocation.current, briefSha256: hash(base.input.request) },
      designPolicy: captureDesignExecutionPolicy({}),
      host: { nodePath, nodeSha256: hash(readFileSync(nodePath)), cliPath, cliSha256: hash(readFileSync(cliPath)),
        provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'choice-parent' },
    });
    const run = getNativePiRun(invocation, base.root);
    mkdirSync(join(base.root, '.omd/native-pi'), { recursive: true });
    writeFileSync(join(base.root, '.omd/native-pi/run.json'), canonicalRouteJson({
      schema: 'native-pi-run-v1', run,
      signature: signNativeObservation(base.root, 'pi-run', hash(canonicalRouteJson(run))),
    }));
    const writer = createProjectWriteAdapter(base.root, invocation);
    publishAdaptiveRoute(base.root, base.input, writer, invocation);
    const route = readPersistedRoute(base.root, invocation);
    const f = { ...base, invocation, writer, route,
      plan: { ...base.plan, sourceContractSha256: route.sourceContractSha256 } };
    const candidates = await renderedSet(f);
    publishCandidatePacket(f.root, candidates, writer, invocation);
    const previous = process.env.PI_REVIEWER_FIXTURE_MODE;
    process.env.PI_REVIEWER_FIXTURE_MODE = mode;
    t.after(() => {
      if (previous === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
      else process.env.PI_REVIEWER_FIXTURE_MODE = previous;
    });
    assert.equal(candidateDirectionState(f.root).pending, null);
    if (['candidate-choice-wrong-alias', 'candidate-choice-no-quality', 'candidate-choice-quality-fail',
      'candidate-choice-quality-unassessed'].includes(mode)) {
      await assert.rejects(runNativeCandidateChoice(f.root, invocation, t.signal));
      assert.equal(candidateDirectionState(f.root).selection, null);
      assert.equal(existsSync(join(f.root, CANDIDATE_REVIEW_FEEDBACK_PATH)), true);
      assert.equal(readCurrentCandidateReviewFeedback(f.root, run.runId, route.sourceContractSha256)?.status, 'rejected');
      assert.match(directionCommitmentBlocker(f.root) ?? '', /independent candidate review exists/);
    } else {
      const result = await runNativeCandidateChoice(f.root, invocation, t.signal);
      if (mode === 'success') {
        assert.equal(result.status, 'selected');
        const choice = readCurrentCandidateSelection(f.root);
        assert.equal(choice.selectedId, 'B');
        assert.equal(choice.decision.decidedBy, 'agent');
        assert.equal('userMessage' in choice.decision, false);
      } else {
        assert.equal(result.status, 'no-feasible-direction');
        assert.equal(candidateDirectionState(f.root).selection, null);
      }
      process.env.PI_REVIEWER_FIXTURE_MODE = 'extra-tool';
      const reused = await runNativeCandidateChoice(f.root, invocation, t.signal);
      assert.equal(reused.status, result.status);
      process.env.PI_REVIEWER_FIXTURE_MODE = mode;
      const currentFeedback = readCurrentCandidateReviewFeedback(f.root, run.runId, route.sourceContractSha256);
      assert.equal(currentFeedback?.status, 'current');
      const feedback = readCandidateReviewFeedback(f.root, run.runId, route.sourceContractSha256, 'A');
      assert.ok(feedback);
      const visuals = makerVisuals({ root: f.root, invocation, route, maker: {
        schema: 'native-maker-input-v1', role: 'omd-sketch', branch: 'current-sketch',
        candidateId: 'A', paths: ['.omd/.cache/sketches/A/index.html'], readPaths: [], axis: null,
      } });
      assert.deepEqual(visuals.renders.filter(image => image.role === 'first-party-candidate-review-baseline')
        .map(image => image.captureSha256), feedback.previews.map(view => view.png.sha256));
      const pointerPath = join(f.root, CANDIDATE_REVIEW_FEEDBACK_PATH);
      const pointerBytes = readFileSync(pointerPath);
      const pointer = JSON.parse(pointerBytes.toString('utf8'));
      writeFileSync(pointerPath, JSON.stringify({ ...pointer, signature: 'forged' }));
      assert.throws(() => readCandidateReviewFeedback(f.root, run.runId, route.sourceContractSha256, 'A'));
      writeFileSync(pointerPath, pointerBytes);
    }
    assert.equal(candidateDirectionState(f.root).pending, null);
    if (mode !== 'success') {
      recordConfidenceDebt(f.root, route.sourceContractSha256,
        [confidenceDebt('candidate-generation', 'Exploration is unverified.')], invocation);
      const productionRoute = { ...route, strategy: { ...route.strategy,
        stages: route.strategy.stages.filter(stage => stage !== 'reference-board') } };
      assert.throws(() => makerVisuals({ root: f.root, invocation, route: productionRoute, maker: {
        schema: 'native-maker-input-v1', role: 'omd-hand', branch: 'standard',
        candidateId: null, paths: ['index.html'], readPaths: [], axis: null,
      } }), /candidate|feedback|first-party/i);
    }
    if (mode === 'success') {
      const pointerPath = join(f.root, CANDIDATE_REVIEW_FEEDBACK_PATH);
      const original = readFileSync(pointerPath);
      const pointer = JSON.parse(original.toString('utf8'));
      publishAdaptiveRoute(f.root, { ...base.input, allowedPaths: [...base.input.allowedPaths, 'dist/**'] }, writer, invocation);
      const currentRoute = readPersistedRoute(f.root, invocation);
      assert.notEqual(currentRoute.sourceContractSha256, route.sourceContractSha256);
      const currentPlan = publishCandidatePlan(f.root, {
        ...f.plan, sourceContractSha256: currentRoute.sourceContractSha256,
        candidates: f.plan.candidates.map(candidate => ({ ...candidate, id: `${candidate.id}-next` })),
      }, writer, invocation);
      assert.equal(readCandidateReviewFeedback(f.root, run.runId, currentRoute.sourceContractSha256, 'A-next'), null);
      const visuals = makerVisuals({ root: f.root, invocation, route: currentRoute, maker: {
        schema: 'native-maker-input-v1', role: 'omd-sketch', branch: 'current-sketch',
        candidateId: 'A-next', paths: ['.omd/.cache/sketches/A-next/index.html'], readPaths: [], axis: null,
      } });
      assert.equal(visuals.renders.some(image => image.role === 'first-party-candidate-review-baseline'), false);
      assert.throws(() => readCurrentCandidateSelection(f.root));
      assert.deepEqual(readFileSync(pointerPath), original);

      const malformed = { ...pointer, plan: currentPlan };
      const { signature: _signature, ...payload } = malformed;
      writeFileSync(pointerPath, canonicalRouteJson({
        ...payload, signature: signNativeObservation(f.root, 'native-candidate-feedback-v2', hash(canonicalRouteJson(payload))),
      }));
      assert.throws(() => readCandidateReviewFeedback(f.root, run.runId, currentRoute.sourceContractSha256, 'A-next'));
      const mismatchedHistory = { ...pointer, sourceContractSha256: 'f'.repeat(64) };
      const { signature: _historicalSignature, ...historicalPayload } = mismatchedHistory;
      writeFileSync(pointerPath, canonicalRouteJson({
        ...historicalPayload,
        signature: signNativeObservation(f.root, 'native-candidate-feedback-v2', hash(canonicalRouteJson(historicalPayload))),
      }));
      assert.throws(() => readCandidateReviewFeedback(f.root, run.runId, currentRoute.sourceContractSha256, 'A-next'));
      writeFileSync(pointerPath, canonicalRouteJson({ ...pointer, signature: 'forged' }));
      assert.throws(() => readCandidateReviewFeedback(f.root, run.runId, currentRoute.sourceContractSha256, 'A-next'));
      writeFileSync(pointerPath, original);
    }
  });
}
