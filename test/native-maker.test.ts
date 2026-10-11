import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { publishAdaptiveRoute } from '../core/route/adaptive-route-persistence.ts';
import { prepareNativeMaker } from '../core/runtime/native-maker-packet.ts';
import { runPiMaker } from '../adapters/pi-maker-runtime.ts';
import { publishNativeMaker, makeNativeSource } from '../core/runtime/native-maker.ts';
import { contractSha256, deliveryReceipt } from '../core/stage/contract.ts';
import { selectReviewedCandidate } from '../core/brief/candidate-reference-review.ts';
import { CANDIDATE_EVIDENCE_FILES, validateCandidateSelectionPointer } from '../core/brief/candidate-selection.ts';
import { candidateStateHtml, candidateCaptureStates } from './helpers/candidate-states.ts';
import { fixture, input, packRoot, repo } from './helpers/native-maker.ts';
import { createTestNativePiInvocation, getNativePiRun } from '../core/runtime/native-pi-run.ts';
import { publishDesignJudgment } from '../core/design/judgment-files.ts';
import { publishFirstRenderCheck } from '../core/design/first-render-evidence.ts';
import { readFirstRenderReview, runFirstRenderReview } from '../core/design/first-render-review.ts';
import { nativeCompletionWork } from '../core/stage/native-completion.ts';
import { nextStageWork } from '../core/stage/next.ts';
import { runNativeEvaluation } from '../core/runtime/native-evaluation.ts';
import { runNativeFinalReview } from '../core/runtime/native-final-publication.ts';
import { checkTerminalCompletion } from '../core/completion/preflight.ts';
import { currentMakerSource } from '../core/runtime/native-maker-state.ts';

test('fresh maker receives host-built first-party context and imports authorized multi-file source', async t => {
  // Given a source-aware parent with unrelated ambient records.
  const context = fixture(t);
  // When the real native RPC fixture consumes the one-use packet.
  const result = await makeNativeSource(context);
  // Then the observed model is inherited and only its bounded source result is imported.
  assert.equal(result.receipt.provider, 'fixture-provider');
  assert.equal(result.receipt.model, 'fixture-maker-model');
  assert.equal(result.receipt.modelReasoningEffort, 'medium');
  assert.notEqual(result.receipt.sessionId, result.receipt.parentSessionId);
  assert.deepEqual(result.paths, input.paths);
  for (const path of input.paths) assert.match(readFileSync(join(context.root, path), 'utf8'), /maker-fixture/);
  assert.equal(readFileSync(join(context.root, 'AGENTS.md'), 'utf8'), 'AMBIENT_PROJECT_SENTINEL');
});

test('delivered maker packet excludes ambient history, raw briefs and verdict records', async t => {
  // Given a prepared maker packet and ambient source-aware files.
  const context = fixture(t, 'maker-context');
  const prepared = prepareNativeMaker(context);
  // When the RPC fixture inspects the actual evidence-tool text it receives.
  const result = await runPiMaker({ root: context.root, invocation: context.invocation, prepared, signal: t.signal });
  // Then the fixture rejects forbidden sentinels and observes the full required outcome.
  assert.equal(result.receipt.role, 'omd-hand');
  assert.deepEqual(JSON.parse(prepared.packet.toString('utf8')).evidence.context.taskOutcome, context.routeInput.taskOutcome);
});

for (const mode of ['wrong-model', 'thinking-drift', 'prehistory', 'extra-tool', 'ambient-system', 'extra-file', 'evidence-drift']) {
  test(`maker refuses ${mode} without mutating source`, async t => {
    // Given an RPC child violating the execution or publication contract.
    const context = fixture(t, mode);
    const before = readFileSync(join(context.root, input.paths[0] ?? ''));
    // When it tries to author production.
    await assert.rejects(makeNativeSource(context));
    // Then neither the existing file nor the new file changes.
    assert.deepEqual(readFileSync(join(context.root, input.paths[0] ?? '')), before);
    assert.equal(existsSync(join(context.root, input.paths[1] ?? '')), false);
  });
}

for (const drift of ['source', 'route'] as const) {
  test(`maker refuses changed ${drift} after execution before any import`, async t => {
    // Given an authenticated result produced against a baseline.
    const context = fixture(t);
    const prepared = prepareNativeMaker(context);
    const result = await runPiMaker({ root: context.root, invocation: context.invocation, prepared, signal: t.signal });
    if (drift === 'source') writeFileSync(join(context.root, input.paths[0] ?? ''), 'concurrent edit');
    else publishAdaptiveRoute(context.root, { ...context.routeInput, allowedPaths: ['src/copy/confirmation.ts'] },
      context.writer, context.invocation);
    const before = readFileSync(join(context.root, input.paths[0] ?? ''));
    // When the original proposal is imported.
    assert.throws(() => publishNativeMaker({ ...context, prepared, result }), /stale|baseline|route/i);
    // Then the publisher preserves the concurrent state and creates no second source.
    assert.deepEqual(readFileSync(join(context.root, input.paths[0] ?? '')), before);
    assert.equal(existsSync(join(context.root, input.paths[1] ?? '')), false);
  });
}

test('production readiness remains mandatory before fresh maker execution', async t => {
  // Given a stale copy-review gate.
  const context = fixture(t);
  context.writer.write('.omd/copy-deck.md', 'changed copy without review');
  // When maker production is requested.
  await assert.rejects(makeNativeSource(context), /copy/i);
  // Then the source is untouched.
  assert.equal(readFileSync(join(context.root, input.paths[0] ?? ''), 'utf8'), 'export const confirmation = "old";');
});

for (const paths of [
  ['src/copy/widget', 'src/copy/widget/index.ts'],
  ['src/copy/widget/index.ts', 'src/copy/widget'],
]) {
  test(`conflicting output paths refuse without mutation: ${paths.join(', ')}`, async t => {
    const context = fixture(t);
    await assert.rejects(makeNativeSource({ ...context, input: { ...input, paths } }), /path-conflict/);
    assert.equal(existsSync(join(context.root, 'src/copy/widget')), false);
    assert.equal(existsSync(join(context.root, '.omd/makers/current/hand.json')), false);
  });
}

function candidateRoute(context: ReturnType<typeof fixture>) {
  const routeInput = context.routeInput;
  routeInput.strategyDecision.stages.splice(2, 0, 'candidate-generation');
  routeInput.strategyDecision.roles.push('omd-sketch');
  routeInput.strategyDecision.executionWaves.splice(1, 0, { id: 'candidates', mode: 'concurrent', roles: ['omd-sketch'] });
  routeInput.strategyDecision.skips = routeInput.strategyDecision.skips.filter((skip: { id: string }) => skip.id !== 'candidate-generation');
  publishAdaptiveRoute(context.root, routeInput, context.writer, context.invocation);
  context.writer.write('.omd/composition.md', '## Candidate axes\n- Task before metadata\n');
  const delivered = readFileSync(join(context.root, '.omd/delivery.jsonl'), 'utf8');
  context.writer.write('.omd/delivery.jsonl', delivered + ['protocol/composition-contract.md', 'theory/layout.md']
    .map(contract => JSON.stringify(deliveryReceipt('candidate-generation', contract,
      contractSha256(packRoot, contract), '2026-09-20T00:00:00Z'))).join('\n') + '\n');
}

for (const missing of CANDIDATE_EVIDENCE_FILES) {
  test(`Sketch refuses an absent ungranted ${missing} before preparing a child`, t => {
    const context = fixture(t);
    candidateRoute(context);
    const directory = '.omd/.cache/sketches/alpha';
    const candidate = { schema: 'native-maker-input-v1', role: 'omd-sketch', candidateId: 'alpha', readPaths: [],
      axis: 'Task before metadata', paths: CANDIDATE_EVIDENCE_FILES
        .filter(name => name !== missing).map(name => `${directory}/${name}`) };
    assert.throws(() => prepareNativeMaker({ ...context, input: candidate }),
      /candidate-file-required-in-grant/);
    assert.equal(existsSync(join(context.root, directory)), false);
    assert.equal(existsSync(join(context.root, '.omd/makers')), false);
    assert.equal(readFileSync(join(context.root, 'src/copy/confirmation.ts'), 'utf8'), 'export const confirmation = "old";');
  });
}

test('Sketch reports every missing metadata grant in one preparation refusal', t => {
  const context = fixture(t);
  candidateRoute(context);
  const candidate = { schema: 'native-maker-input-v1', role: 'omd-sketch', candidateId: 'alpha', readPaths: [],
    axis: 'Task before metadata', paths: ['.omd/.cache/sketches/alpha/index.html'] };
  assert.throws(() => prepareNativeMaker({ ...context, input: candidate }),
    /candidate-file-required-in-grant:noun-swap-test.json,selection.json,ux-models.json/);
});

test('Sketch can retain nonempty existing metadata outside a partial repair grant', t => {
  const context = fixture(t);
  candidateRoute(context);
  const directory = '.omd/.cache/sketches/alpha';
  for (const name of CANDIDATE_EVIDENCE_FILES.filter(name => name !== 'index.html')) {
    context.writer.write(`${directory}/${name}`, '{}');
  }
  const candidate = { schema: 'native-maker-input-v1', role: 'omd-sketch', candidateId: 'alpha', readPaths: [],
    axis: 'Task before metadata', paths: [`${directory}/index.html`] };
  assert.deepEqual(prepareNativeMaker({ ...context, input: candidate }).input.paths, candidate.paths);
  context.writer.write(`${directory}/selection.json`, '  ');
  assert.throws(() => prepareNativeMaker({ ...context, input: candidate }),
    /candidate-file-required-in-grant:selection.json/);
  assert.equal(readFileSync(join(context.root, `${directory}/selection.json`), 'utf8'), '  ');
  assert.equal(existsSync(join(context.root, `${directory}/index.html`)), false);
});

test('integrated Sketch imports its owned files without publishing candidate selection', async t => {
  // Given a selected candidate stage and current assigned composition axis.
  const context = fixture(t);
  candidateRoute(context);
  const directory = '.omd/.cache/sketches/alpha';
  const candidate = { schema: 'native-maker-input-v1', role: 'omd-sketch', candidateId: 'alpha', readPaths: [],
    axis: 'Task before metadata', paths: ['index.html', 'selection.json', 'noun-swap-test.json', 'ux-models.json']
      .map(name => `${directory}/${name}`) };
  // When the isolated Sketch maker returns a bounded integrated candidate.
  const result = await makeNativeSource({ ...context, input: candidate });
  // Then it owns source only and leaves coordinator selection unpublished.
  assert.deepEqual(result.paths, candidate.paths);
  assert.equal(existsSync(join(context.root, '.omd/.cache/sketches/current.json')), false);
  assert.equal(readFileSync(join(context.root, 'src/copy/confirmation.ts'), 'utf8'), 'export const confirmation = "old";');
  context.writer.write('.omd/makers/current/sketch-other.json',
    readFileSync(join(context.root, '.omd/makers/current/sketch-alpha.json')));
  assert.throws(() => currentMakerSource(context.root, context.invocation, 'sketch-other'), /current-owner-files/);
});

for (const mode of ['maker-images', 'missing-image']) {
  test(`Hand ${mode === 'maker-images' ? 'receives every' : 'refuses missing'} approved complementary candidate image`, async t => {
    // Given a real coordinator selection publisher with six first-party captures.
    const context = fixture(t, mode);
    candidateRoute(context);
    const directory = '.omd/.cache/sketches/alpha';
    context.writer.write(`${directory}/index.html`, candidateStateHtml);
    for (const name of ['selection.json', 'noun-swap-test.json', 'ux-models.json']) context.writer.write(`${directory}/${name}`, '{}');
    await selectReviewedCandidate(context.root, context.invocation, validateCandidateSelectionPointer({
      schema: 'candidate-selection-pointer-v1', directory: 'alpha', indexSha256: sha256(candidateStateHtml),
      selectionSha256: sha256('{}'), captureStates: candidateCaptureStates,
    }));
    // When Hand actually consumes the packet through native RPC.
    const execution = makeNativeSource(context);
    // Then complete image delivery is necessary for source publication.
    if (mode === 'maker-images') assert.equal((await execution).receipt.role, 'omd-hand');
    else {
      await assert.rejects(execution, /maker-images-not-delivered/);
      assert.equal(readFileSync(join(context.root, 'src/copy/confirmation.ts'), 'utf8'), 'export const confirmation = "old";');
    }
  });
}

test('reframe preserves evaluator lineage through a revised candidate and fresh Hand production', async t => {
  // Given a real signed first-render reframe and corrected upstream composition.
  const context = fixture(t);
  candidateRoute(context);
  context.writer.write('src/copy/index.html', '<!doctype html><main><h1>Reading now</h1><button>Update progress</button></main>');
  publishDesignJudgment(context.root, {
    schema: 'design-judgment-v1', referenceBoardSha256: 'a'.repeat(64),
    hypothesis: { schema: 'design-judgment-v1', feelsLike: 'A focused personal reading log',
      dominantObject: 'current books', subordinate: ['navigation'], densityIntent: 'readable current books',
      trustSource: 'local saved status', twoSecondRead: 'Update the page reached in a book' },
    judgments: [{ id: 'reading', observation: 'The book occupies the primary region.',
      whyItWorksThere: 'Progress acts on a selected book.', relevance: 'high', adopt: ['Book-local progress'],
      reject: ['Source branding'], interpretation: 'Keep progress with its book.', scope: 'surface' }],
  }, context.writer);
  await publishFirstRenderCheck(context.root, 'src/copy/index.html', {
    heading: 'Reading now', landmarks: ['main'], repeatedObjects: [], trustSignals: [],
    visibleText: ['Reading now', 'Update progress'], dominantAreaShare: 0.7,
  }, context.writer);
  const reviewerCli = join(repo, 'test/fixtures/pi-reviewer-rpc.mjs');
  const reviewer = createTestNativePiInvocation({ root: context.root, current: context.invocation.current,
    host: { ...getNativePiRun(context.invocation, context.root).host,
      cliPath: reviewerCli, cliSha256: sha256(readFileSync(reviewerCli)) } });
  const previous = process.env.PI_REVIEWER_FIXTURE_MODE;
  process.env.PI_REVIEWER_FIXTURE_MODE = 'early-reframe';
  t.after(() => {
    if (previous === undefined) delete process.env.PI_REVIEWER_FIXTURE_MODE;
    else process.env.PI_REVIEWER_FIXTURE_MODE = previous;
  });
  const review = await runFirstRenderReview(context.root, reviewer, t.signal);
  assert.equal(review.decision, 'reframe');
  assert.deepEqual(review.findings.map(finding => finding.axis), ['beautyDesirability', 'hierarchyComposition']);
  const baseline = readFirstRenderReview(context.root);
  publishAdaptiveRoute(context.root, { ...context.routeInput,
    allowedPaths: [...context.routeInput.allowedPaths, 'public/build/**'] }, context.writer, context.invocation);
  context.writer.write('.omd/composition.md', '## Candidate axes\n- Action before metadata\n');
  assert.equal(nativeCompletionWork(context.root, context.invocation).action, 'author-reframe-candidate');
  await assert.rejects(makeNativeSource(context), /NATIVE_REFRAME_CANDIDATE_REQUIRED/);
  const directory = '.omd/.cache/sketches/reframed';
  const candidate = { schema: 'native-maker-input-v1', role: 'omd-sketch', candidateId: 'reframed', readPaths: [],
    axis: 'Action before metadata', paths: ['index.html', 'selection.json', 'noun-swap-test.json', 'ux-models.json']
      .map(name => `${directory}/${name}`) };
  // When fresh makers execute the revised candidate and then the selected production.
  const sketch = await makeNativeSource({ ...context, input: candidate });
  await selectReviewedCandidate(context.root, context.invocation, validateCandidateSelectionPointer({
    schema: 'candidate-selection-pointer-v1', directory: 'reframed',
    indexSha256: sha256(readFileSync(join(context.root, directory, 'index.html'))),
    selectionSha256: sha256(readFileSync(join(context.root, directory, 'selection.json'))),
  }));
  assert.equal(nativeCompletionWork(context.root, context.invocation).action, 'author-reframe-production');
  assert.equal(nextStageWork(context.root, packRoot, context.invocation).action, 'author-reframe-production');
  const packet = JSON.parse(prepareNativeMaker(context).packet.toString('utf8'));
  const hand = await makeNativeSource(context);
  // Then complete evaluator axes and original repair baselines survive, without granting approval.
  const lineage = packet.evidence.evaluatorLineage.find((row: { kind: string }) => row.kind === 'first-render');
  assert.equal(lineage.qualityAssessments.length, 12);
  assert.deepEqual(lineage.baselines, baseline?.baselines);
  assert.equal(lineage.sha256, review.sha256);
  assert.notEqual(sketch.receipt.sessionId, hand.receipt.sessionId);
  assert.equal(readFirstRenderReview(context.root)?.decision, 'reframe');
  assert.equal(nativeCompletionWork(context.root, context.invocation).action, 'recapture-reframe');
  const routed = nextStageWork(context.root, packRoot, context.invocation);
  assert.equal(routed.stage, 'production');
  assert.ok(routed.procedure?.steps[0]?.startsWith('omd first-render check --page '));
  assert.equal(routed.procedure?.steps.some(step => step.startsWith('omd lifecycle')), false);
  await assert.rejects(runNativeEvaluation(context), /NATIVE_REFRAME_UNRESOLVED/);
  await assert.rejects(runNativeFinalReview(context), /NATIVE_REFRAME_UNRESOLVED/);
  assert.throws(() => checkTerminalCompletion(context.root, context.invocation), /NATIVE_REFRAME_UNRESOLVED/);
  assert.equal(existsSync(join(context.root, '.omd/observation-v2.json')), false);
  assert.equal(existsSync(join(context.root, '.omd/final-review/native-current.json')), false);
});
