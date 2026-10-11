import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { type TestContext } from 'node:test';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { selectReferenceCandidateV2 } from '../core/ref/reference-selection.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { createSourceStudySet, readSelectedSourceStudy, readSourceStudySet, readLatestSourceStudySet, selectSourceStudy } from '../core/art-direction/source-study.ts';
import { SOURCE_STUDY_CURRENT, SOURCE_STUDY_BASE } from '../core/art-direction/source-study-records.ts';
import { SOURCE_STUDY_INPUT_SCHEMA } from '../core/art-direction/source-study-input.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';
import { prepareFinalRenderReviewFixture } from './helpers/final-render-review.ts';
import { installNativeFidelityReferences } from './helpers/native-reference-fidelity.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { piRecord } from '../adapters/pi-reviewer-contract.ts';
import { buildBrief } from '../core/brief/index.ts';

const input = {
  schema: SOURCE_STUDY_INPUT_SCHEMA,
  reason: 'One hypothesis exercises the author publication boundary, not aesthetic selection.',
  primaryAction: 'Save a reading note.',
  destinationContent: [{ path: 'content.txt', content: '독서 기록\n산책의 문장들\n윤서하\n메모 추가' }],
  variants: [{ id: 'attached', relationship: 'The note belongs to its book.',
    observableConsequence: 'Book identity remains visible while writing.' }],
};

function setup(t: TestContext, mode: string, selectedMethod = false) {
  const fixture = prepareFinalRenderReviewFixture('synth-marketing');
  const root = realpathSync(fixture.root);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  installNativeFidelityReferences(t, root);
  selectReferenceCandidateV2(root, 'selected', [
    { slotId: 'hero-card', obligationDisposition: 'used', obligationReason: 'Collection context.' },
    { slotId: 'rejected-slot', obligationDisposition: 'used', obligationReason: 'Record context.' },
  ], createTestProjectRunInvocation(root));
  const old = process.env.PI_STUDY_FIXTURE_MODE;
  process.env.PI_STUDY_FIXTURE_MODE = mode;
  t.after(() => {
    if (old === undefined) delete process.env.PI_STUDY_FIXTURE_MODE;
    else process.env.PI_STUDY_FIXTURE_MODE = old;
  });
  const nodePath = realpathSync(process.execPath);
  const cliPath = fileURLToPath(new URL('fixtures/pi-study-rpc.mjs', import.meta.url));
  let current = fixture.invocation.current;
  if (selectedMethod) {
    const raw: unknown = JSON.parse(readFileSync(new URL('./fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8'));
    const record = piRecord(raw, 'route-fixture');
    const strategy = routeAdaptiveFlow(record).strategy;
    const roles = [...new Set([...strategy.roles, 'omd-study'])];
    const groups = [
      ['omd-framer'], ['omd-scout', 'omd-writer'], ['omd-study'], ['omd-typesetter'],
      ['omd-composer'], ['omd-sketch'], ['omd-hand'], ['omd-eye', 'omd-glance'],
    ];
    current = publishTestAdaptiveRoute(root, { ...record, strategyDecision: {
      ...strategy, roles, methods: [...strategy.methods, 'provisional-source-study'],
      stages: strategy.stages.filter(stage => stage !== 'art-direction'),
      skips: [...strategy.skips, { id: 'art-direction', reason: 'Provisional form exploration feeds composition without a separate register evaluation.' }],
      executionWaves: groups.map((group, index) => ({
        id: `wave-${index}`, mode: 'concurrent', roles: group.filter(role => roles.includes(role)),
      })).filter(wave => wave.roles.length > 0),
    } }).current;
    rmSync(join(root, '.omd/art-direction.json'), { force: true });
  }
  const invocation = createTestNativePiInvocation({ root, current, host: {
    nodePath, nodeSha256: sha256(readFileSync(nodePath)), cliPath, cliSha256: sha256(readFileSync(cliPath)),
    provider: 'fixture-provider', model: 'fixture-model', thinkingLevel: 'high', parentSessionId: 'study-parent',
  } });
  return { root, invocation };
}

test('authenticated studies publish first-party source and actual renders before provisional selection', async t => {
  const { root, invocation } = setup(t, 'success');
  const productionBefore = readFileSync(join(root, 'index.html'));
  const created = await createSourceStudySet(root, invocation, input, t.signal);
  assert.equal(created.provisional, true);
  assert.equal(readLatestSourceStudySet(root, invocation)?.sha256, created.sha256);
  assert.equal(existsSync(join(root, SOURCE_STUDY_CURRENT)), false);
  assert.equal(created.variants.length, 1);
  const variant = created.variants[0];
  assert.ok(variant);
  assert.equal(variant.renders.length, 4);
  assert.deepEqual(variant.renders.map(render => render.state), ['initial', 'primary-work', 'initial', 'primary-work']);
  assert.equal(Object.hasOwn(created, 'packets'), false);
  assert.equal(readSourceStudySet(root, invocation, created.sha256).variants.length, 1);
  const selected = selectSourceStudy(root, invocation, {
    setSha256: created.sha256, variantId: variant.id, reason: 'Provisional direction for later candidate evaluation.',
  });
  assert.equal(selected.provisional, true);
  assert.equal(selected.id, variant.id);
  assert.deepEqual(readFileSync(join(root, 'index.html')), productionBefore);
  assert.equal(readSelectedSourceStudy(root, invocation).sha256, selected.sha256);
  const original = readFileSync(join(root, variant.html.path));
  writeFileSync(join(root, variant.html.path), `${original.toString('utf8')} changed`);
  assert.throws(() => readSelectedSourceStudy(root, invocation), /file-digest/);
  assert.throws(() => readLatestSourceStudySet(root, invocation), /file-digest/);
});

test('invalid author output cannot publish study files or a selection pointer', async t => {
  const { root, invocation } = setup(t, 'extra-file');
  const productionBefore = readFileSync(join(root, 'index.html'));
  await assert.rejects(createSourceStudySet(root, invocation, input, t.signal), /SOURCE_STUDY_INVALID/);
  assert.equal(existsSync(join(root, SOURCE_STUDY_BASE)), false);
  assert.deepEqual(readFileSync(join(root, 'index.html')), productionBefore);
});

test('missing actual work refuses publication after author execution without changing production', async t => {
  const { root, invocation } = setup(t, 'missing-work');
  const productionBefore = readFileSync(join(root, 'index.html'));
  await assert.rejects(createSourceStudySet(root, invocation, input, t.signal), /work-not-visible/);
  assert.equal(existsSync(join(root, SOURCE_STUDY_BASE)), false);
  assert.deepEqual(readFileSync(join(root, 'index.html')), productionBefore);
});

test('selected study is required before type and composition and is not leaked into final blind review', async t => {
  const { root, invocation } = setup(t, 'success', true);
  const packRoot = fileURLToPath(new URL('../core', import.meta.url));
  for (const stage of ['type-proof', 'composition', 'candidate-generation', 'production'] as const) {
    assert.ok(buildBrief(root, stage, packRoot, invocation).blockers
      .some(blocker => blocker.startsWith('SOURCE_STUDY_REQUIRED')));
  }
  const created = await createSourceStudySet(root, invocation, input, t.signal);
  const selected = selectSourceStudy(root, invocation, {
    setSha256: created.sha256, variantId: 'attached', reason: 'Provisional rendered relationship.',
  });
  for (const stage of ['type-proof', 'composition', 'candidate-generation'] as const) {
    const brief = buildBrief(root, stage, packRoot, invocation);
    assert.equal(brief.sourceStudy?.sha256, selected.sha256);
    assert.equal(brief.sourceStudy?.provisional, true);
    assert.ok(!brief.blockers.some(blocker => blocker.startsWith('SOURCE_STUDY_REQUIRED')));
    assert.equal(Object.hasOwn(brief.sourceStudy ?? {}, 'roleResult'), false);
    assert.equal(Object.hasOwn(brief.sourceStudy ?? {}, 'referenceRenders'), false);
  }
  assert.equal(buildBrief(root, 'production', packRoot, invocation).sourceStudy, undefined);
  assert.equal(buildBrief(root, 'review', packRoot, invocation).sourceStudy, undefined);
});
