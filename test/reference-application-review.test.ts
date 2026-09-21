import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkReferenceApplicationReview, publishReferenceApplicationReview, referenceApplicationCriteria,
  referenceApplicationReviewPlan, referenceApplicationReviewContext, validateReferenceApplicationReview, REFERENCE_APPLICATION_REVIEW_PATH } from '../core/ref/reference-application-review.ts';
import { parseReferenceApplication, projectReferenceApplication } from '../core/ref/reference-application.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { testPng } from './helpers/search-execution.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { browserObservationSha256, designDecisionSha256, type BrowserObservationCore } from '../core/runtime/browser-observation.ts';
import type { DesignDecision } from '../core/deliberation/contracts.ts';

const sha = (n: number) => String(n).repeat(64);
function fixture() {
  const lane = { referenceIds: [], coverage: 'brief-derived', gap: 'No direct reference for this case.', application: 'Keep the current task dominant.', doNotTransfer: 'Source branding.', reason: 'The user needs a readable work object.' };
  const application = projectReferenceApplication(parseReferenceApplication({ schema: 'reference-application-v2', sourceContractSha256: sha(1), researchSha256: sha(2), domainBriefSha256: sha(3),
    screens: ['home', 'detail'].map(surface => ({ surface, target: { route: `/${surface}`, state: 'long-title' }, domain: lane, design: lane, checks: ['The long title keeps the primary action visible.'] })) }));
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const context = { application, build: { path: '.omd/build.json', sha256: sha(4) }, sourceSeal: { path: '.omd/source-seal.json', sha256: sha(5) },
    observations: application.screens.flatMap(screen => (['desktop', 'mobile'] as const).map(viewport => ({ observationSha256: sha(6), browserObservationSha256: digest(`${screen.surface}:${viewport}`), captureSha256: digest(`${screen.surface}:${viewport}:pixels`), viewport, state: 'long-title' }))),
    captureIndex: application.screens.flatMap(screen => (['desktop', 'mobile'] as const).map(viewport => ({ path: `.omd/${screen.surface}-${viewport}.png`, testedUrl: `http://127.0.0.1${screen.target.route}`, browserObservationSha256: digest(`${screen.surface}:${viewport}`) }))) };
  const plan = referenceApplicationReviewPlan(context);
  const review = { ...plan.input, results: plan.input.results.map(result => {
    const criterion = plan.criteria.find(row => row.criterionId === result.criterionId)!;
    const observation = context.observations.find(row => row.viewport === result.viewport && row.browserObservationSha256 === digest(`${criterion.surface}:${result.viewport}`))!;
    return { ...result, observationSha256: observation.observationSha256, captureSha256: observation.captureSha256, state: observation.state,
      verdict: 'met', reason: 'Inspected this surface at the named viewport: title wraps and the action remains visible.' };
  }) };
  return { context, plan, review };
}
test('every surface criterion has stable IDs and requires both current fixed viewport judgments', () => {
  const { context, review, plan } = fixture();
  assert.equal(new Set(plan.criteria.map(item => item.criterionId)).size, 2);
  assert.equal(validateReferenceApplicationReview(review, context).results.length, 4);
  assert.throws(() => validateReferenceApplicationReview(plan.input, context), /missing|digest/);
  for (let index = 0; index < review.results.length; index++) {
    assert.throws(() => validateReferenceApplicationReview({ ...review, results: review.results.filter((_, i) => i !== index) }, context), /missing screen/);
  }
  assert.throws(() => validateReferenceApplicationReview({ ...review, results: [review.results[0], ...review.results.slice(0, 3)] }, context), /duplicate/);
  const changed = structuredClone(context.application); changed.screens[0]!.checks = ['A different criterion.'];
  assert.notEqual(referenceApplicationCriteria(changed)[0]!.criterionId, plan.criteria[0]!.criterionId);
});
test('home captures cannot certify detail; exact query/hash and state are destination-bound', () => {
  const { context, review } = fixture();
  const homeOnly = { ...context, captureIndex: context.captureIndex.filter(row => row.testedUrl.endsWith('/home')) };
  assert.throws(() => validateReferenceApplicationReview(review, homeOnly), /destination surface detail/);
  const wrongUrl = { ...context, captureIndex: context.captureIndex.map(row => ({ ...row, testedUrl: 'http://127.0.0.1/home' })) };
  assert.throws(() => validateReferenceApplicationReview(review, wrongUrl), /destination surface detail/);
  const changed = structuredClone(context.application); changed.screens[0]!.target = { route: '/home?tab=saved#details', state: 'long-title' };
  assert.notEqual(referenceApplicationCriteria(changed)[0]!.criterionId, referenceApplicationCriteria(context.application)[0]!.criterionId);
  assert.throws(() => validateReferenceApplicationReview(review, { ...context, captureIndex: [] }), /destination surface/);
});
test('no stale build, application, seal, capture, observation, state, viewport or unknown field can clear review', () => {
  const { context, review } = fixture();
  for (const mutate of [
    (r: typeof review) => { r.applicationSha256 = sha(0); },
    (r: typeof review) => { r.build = { ...r.build, sha256: sha(0) }; },
    (r: typeof review) => { r.sourceSeal = { ...r.sourceSeal, sha256: sha(0) }; },
    (r: typeof review) => { r.results[0]!.captureSha256 = sha(0); },
    (r: typeof review) => { r.results[0]!.observationSha256 = sha(0); },
    (r: typeof review) => { r.results[0]!.state = 'not-rendered'; },
    (r: typeof review) => { r.results[0]!.viewport = 'mobile'; },
    (r: typeof review) => { r.results[0]!.reason = ''; },
    (r: typeof review) => { Object.assign(r, { approvedByUser: true }); },
  ]) { const changed = structuredClone(review); mutate(changed); assert.throws(() => validateReferenceApplicationReview(changed, context)); }
});
test('revise can be recorded but not completed; justified departure needs an inspected reason, and history is retained', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-application-review-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root);
  const { context, review } = fixture();
  assert.throws(() => checkReferenceApplicationReview(root, context), /REFERENCE_APPLICATION_REVIEW:.*unavailable/);
  review.results[0]!.verdict = 'revise';
  assert.equal(publishReferenceApplicationReview(root, review, context, writer).closed, false);
  assert.throws(() => checkReferenceApplicationReview(root, context), /unresolved/);
  review.results[0]!.verdict = 'justified-departure';
  review.results[0]!.reason = 'At mobile the longer translated title pushes the action below the title; its distinct group remains clear in the captured state.';
  publishReferenceApplicationReview(root, review, context, writer);
  assert.deepEqual(checkReferenceApplicationReview(root, context), { criteria: 2, results: 4, closed: true, independence: 'not-attested' });
  const path = join(root, REFERENCE_APPLICATION_REVIEW_PATH);
  const saved = readFileSync(path, 'utf8'); writeFileSync(path, `${saved} `);
  assert.throws(() => checkReferenceApplicationReview(root, context), /read stably|history/);
});

test('final-graph join loads actual PNGs and rejects old seal, swapped graph receipts and stale pixels', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-application-final-join-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const writer = createTestProjectWriteAdapter(root);
  const { context } = fixture();
  const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
  const save = (path: string, bytes: Buffer | string, schema = 'test-artifact') => { writer.write(path, bytes); return { path, sha256: hash(bytes), schema }; };
  const buildIdentity = save('.omd/build.json', '{}');
  const sourceSeal = save('.omd/source-seal.json', JSON.stringify({ inputs: { referenceApplicationSha256: context.application.applicationSha256 } }));
  const decision: DesignDecision = { id: 'title-layout', stage: 'composition', risk: 'medium', owner: 'omd-composer', question: 'Where is the primary action?',
    alternatives: [{ id: 'grouped', label: 'Grouped' }, { id: 'separate', label: 'Separate' }], selected: 'grouped',
    evidence: ['capture:title'], constraints: ['Keep action visible'], rejected: [{ id: 'separate', reason: 'Fragmented hierarchy' }],
    affects: ['zone:work'], dependsOn: [], reversible: true, tradeoffs: [] };
  const decisionGraph = save('.omd/decision-graph.json', `${canonicalJson({ schema: 'decision-graph-v1', decisions: [decision] })}\n`);
  const captures = [{ width: 1280, height: 900 }, { width: 390, height: 844 }].map((viewport, index) => {
    const captured = save(`.omd/captures/view-${index}.png`, testPng(viewport.width, viewport.height));
    const core: BrowserObservationCore = { schema: 'browser-observation-v1', testedUrl: 'http://127.0.0.1/', testedState: 'long-title', viewport,
      observableResult: { kind: 'screenshot', capture: { path: captured.path, sha256: captured.sha256 }, result: { measurement: 'viewport-pixels', ...viewport } },
      decisionRefs: [{ decisionId: decision.id, decisionSha256: designDecisionSha256(decision) }] };
    return { ...core, observationSha256: browserObservationSha256(core) };
  });
  const aggregate = `${canonicalJson({ schema: 'observation-v2', observedAt: '2026-09-20T00:00:00Z', buildSha256: buildIdentity.sha256,
    currentArtifact: { path: buildIdentity.path, sha256: buildIdentity.sha256 }, predecessorSha256: null,
    evidence: { browserObservations: { schema: 'browser-observation-set-v1', decisionGraphSha256: decisionGraph.sha256, observations: captures } } })}\n`;
  const observation = save(`.omd/observation-v2/sha256-${hash(aggregate)}.json`, aggregate, 'observation-v2');
  // Tests the post-authentication join only. CLI/terminal callers must first pass final-v2 authority.
  const graph = { buildIdentity, sourceSeal, observations: [observation] };
  const joined = referenceApplicationReviewContext(root, context.application, graph);
  assert.equal(joined.observations.length, 2);
  assert.equal(referenceApplicationReviewPlan(joined).captureIndex[0]!.path, captures[0]!.observableResult.capture.path);
  const oldSeal = save('.omd/old-seal.json', '{"inputs":{}}');
  assert.throws(() => referenceApplicationReviewContext(root, context.application, { ...graph, sourceSeal: oldSeal }), /sealed before/);
  assert.throws(() => referenceApplicationReviewContext(root, context.application, { ...graph, buildIdentity: { ...buildIdentity, sha256: sha(0) } }), /artifact changed/);
  writer.write(captures[0]!.observableResult.capture.path, testPng(10, 10));
  assert.throws(() => referenceApplicationReviewContext(root, context.application, graph), /capture bytes changed/);
});
