import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseMakerInput } from '../adapters/pi-maker-contract.ts';
import { candidateContentProjection, publishCandidatePlan } from '../core/brief/candidate-plan.ts';
import { fileReceipt } from '../core/brief/candidate-data.ts';
import { captureAndPublishCandidateSet } from '../core/brief/candidate-capture.ts';
import { makeNativeSource } from '../core/runtime/native-maker.ts';
import { prepareNativeMaker } from '../core/runtime/native-maker-packet.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { createProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { sha256 } from '../core/ref/board-artifacts.ts';
import { fixture, pack, write } from './helpers/phase6-process.ts';
import { nodePath, repo } from './helpers/native-maker.ts';
import { contractSha256, deliveryReceipt } from '../core/stage/contract.ts';
import { nativeCompletionBrief } from '../core/stage/native-completion-brief.ts';
import { buildBrief } from '../core/brief/index.ts';
import { makerVisuals } from '../core/runtime/native-maker-visuals.ts';
import { confidenceDebt, recordConfidenceDebt } from '../core/brief/confidence-debt.ts';

test('current production may omit an absent candidate only with current recorded exploration debt', t => {
  const f = nativeCurrentFixture(t);
  const route = { ...f.route, strategy: { ...f.route.strategy,
    stages: f.route.strategy.stages.filter(stage => stage !== 'reference-board') } };
  const maker = parseMakerInput({ schema: 'native-maker-input-v1', role: 'omd-hand',
    candidateId: null, paths: ['index.html'], readPaths: [], axis: null });
  const visuals = () => makerVisuals({ root: f.root, invocation: f.invocation, route, maker });
  assert.throws(visuals, /maker first-party material/);
  recordConfidenceDebt(f.root, '0'.repeat(64),
    [confidenceDebt('candidate-generation', 'Exploration is unverified.')], f.invocation);
  assert.throws(visuals, /maker first-party material/);
  recordConfidenceDebt(f.root, route.sourceContractSha256,
    [confidenceDebt('candidate-generation', 'Exploration is unverified.')], f.invocation);
  assert.equal(visuals().candidateSelectionSha256, null);
  assert.deepEqual(visuals().renders, []);
  assert.ok(visuals().lineage.some(item => JSON.stringify(item) ===
    '{"kind":"candidate-exploration-deferred","claim":"not-verified"}'));
  write(f.root, '.omd/.cache/sketches/review-current.json', '{"schema":"forged"}');
  assert.throws(visuals, /candidate|feedback|field/i);
  write(f.root, '.omd/.cache/sketches/current.json', '{"schema":"forged"}');
  assert.throws(visuals, /candidate|selection|pointer/i);
});

test('current native candidate procedure invokes capture and isolated review rather than legacy selection', t => {
  const f = nativeCurrentFixture(t);
  const steps = buildBrief(f.root, 'candidate-generation', pack, f.invocation).procedure?.steps;
  assert.ok(steps);
  assert.ok(steps.includes('omd candidate capture --json'));
  assert.ok(steps.includes('omd candidate review --json'));
  assert.equal(steps.some(step => step.startsWith('omd candidate select')), false);
  assert.ok(nativeCompletionBrief('candidate-generation', false)?.procedure.steps
    .some(step => step.startsWith('omd candidate select')));
});

test('current native browser procedure accepts a request-bound proposal without inventing a benchmark', () => {
  const current = nativeCompletionBrief('browser-evidence', true, true);
  assert.ok(current?.procedure.steps.includes('omd schema trusted-lifecycle-manifest --json'));
  assert.ok(current?.procedure.steps.includes(
    'omd lifecycle evaluate --manifest .omd/.cache/trusted-lifecycle-manifest.json --json'));
  assert.ok(nativeCompletionBrief('browser-evidence', true)?.procedure.steps.includes('omd lifecycle evaluate --json'));
});

test('native production exposes owned verification when the host has no direct bash tool', () => {
  const production = nativeCompletionBrief('production', false, true);
  assert.ok(production?.procedure.steps.includes('omd lifecycle verify build --json'));
  assert.ok(production?.procedure.steps.includes('omd lifecycle verify typecheck --json'));
  assert.ok(production?.procedure.steps.includes('omd lifecycle verify install --json'));
});

function nativeCurrentFixture(t: Parameters<typeof fixture>[0]) {
  const base = fixture(t);
  const cliPath = join(repo, 'test/fixtures/pi-study-rpc.mjs');
  const invocation = createTestNativePiInvocation({
    root: base.root,
    current: base.invocation.current,
    host: {
      nodePath,
      nodeSha256: sha256(readFileSync(nodePath)),
      cliPath,
      cliSha256: sha256(readFileSync(cliPath)),
      provider: 'fixture-provider',
      model: 'fixture-maker-model',
      thinkingLevel: 'high',
      parentSessionId: 'current-candidate-parent',
    },
  });
  const writer = createProjectWriteAdapter(base.root, invocation);
  const evidence = [{ status: 'user-provided', reference: 'request' }];
  const statement = (text: string) => ({
    text,
    userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message',
      reference: 'request', excerpt: base.input.request }],
  });
  write(base.root, '.omd/domain-brief.json', JSON.stringify({
    schema: 'domain-brief-v1',
    request: base.input.request,
    domain: 'Patchable synthesizer',
    summary: 'Explain the supplied patching relationship.',
    surfaces: [{ name: 'Main', purpose: 'Understand patching', evidence }],
    coreObjects: [{ name: 'Instrument', evidence }],
    audience: { description: 'People learning signal patching', evidence },
    referenceQueries: { component: ['signal flow'], craft: ['readable hierarchy'], mood: ['quiet workspace'] },
    planning: {
      businessGoal: statement('Explain patching'),
      successSignal: statement('Understand source and destination'),
      nonGoals: [statement('Do not invent commercial terms')],
    },
  }));
  write(base.root, '.omd/delivery.jsonl', [
    'protocol/composition-contract.md',
    'theory/layout.md',
  ].map(contract => JSON.stringify(deliveryReceipt(
    'candidate-generation',
    contract,
    contractSha256(pack, contract, 'candidate-generation'),
    '2026-10-11T00:00:00Z',
  ))).join('\n') + '\n');
  const previous = process.env.PI_STUDY_FIXTURE_MODE;
  process.env.PI_STUDY_FIXTURE_MODE = 'success';
  t.after(() => {
    if (previous === undefined) delete process.env.PI_STUDY_FIXTURE_MODE;
    else process.env.PI_STUDY_FIXTURE_MODE = previous;
  });
  return { ...base, invocation, writer };
}

test('current Sketch input is mutually exclusive and derives committed ownership', t => {
  const f = nativeCurrentFixture(t);
  const plan = publishCandidatePlan(f.root, f.plan, f.writer, f.invocation);
  const sketch = {
    schema: 'sketch-brief-v1' as const,
    mode: 'visual-study' as const,
    plan,
    candidateId: 'A',
    sourceDirectory: '.omd/.cache/sketches/A',
  };
  const parsed = parseMakerInput({
    schema: 'native-maker-input-v1',
    role: 'omd-sketch',
    sketch,
  });
  assert.equal(parsed.branch, 'current-sketch');
  assert.deepEqual(parsed.paths, ['.omd/.cache/sketches/A/index.html']);
  assert.equal(parsed.axis, null);
  const prepared = prepareNativeMaker({
    root: f.root, invocation: f.invocation, packRoot: pack,
    input: { schema: 'native-maker-input-v1', role: 'omd-sketch', sketch },
  });
  const delivered = JSON.parse(prepared.packet.toString('utf8'));
  assert.deepEqual(delivered.evidence.context.currentSketchRole.candidateInputs.renderContract, {
    schema: 'candidate-render-contract-v1',
    matching: 'whitespace-normalized-visible-text-multiset',
    coverage: 'every-declared-view',
    extraText: 'forbidden',
    contentOwnership: 'data-omd-content-id',
    units: f.content.units,
    textStyles: JSON.parse(readFileSync(join(f.root, '.omd/tokens.json'), 'utf8')).textStyles,
  });
  assert.throws(() => parseMakerInput({
    schema: 'native-maker-input-v1',
    role: 'omd-sketch',
    sketch,
    paths: ['.omd/.cache/sketches/B/index.html'],
  }), /fields/);
  assert.throws(() => prepareNativeMaker({
    root: f.root,
    invocation: f.invocation,
    packRoot: pack,
    input: {
      schema: 'native-maker-input-v1',
      role: 'omd-sketch',
      sketch: { ...sketch, plan: { ...plan, sha256: '0'.repeat(64) } },
    },
  }), /current|stale|receipt/i);
  assert.throws(() => prepareNativeMaker({
    root: f.root,
    invocation: f.invocation,
    packRoot: pack,
    input: {
      schema: 'native-maker-input-v1',
      role: 'omd-sketch',
      candidateId: 'alpha',
      paths: ['index.html', 'noun-swap-test.json', 'selection.json', 'ux-models.json']
        .map(name => `.omd/.cache/sketches/alpha/${name}`),
      readPaths: [],
      axis: 'spoofed legacy axis',
    },
  }), /historical-sketch-input-on-current-process/);
});

test('closed choice domains stay shared data without becoming required initial visible units', t => {
  const f = nativeCurrentFixture(t);
  const options = ['All sources', 'Oscillator', 'Filter'];
  const content = { ...f.content,
    units: [{ ...f.content.units[0]!, text: options[0]! }, ...f.content.units.slice(1)],
    facts: [...f.content.facts, JSON.stringify({ options })] };
  const path = '.omd/.cache/sketches/content.json';
  write(f.root, path, JSON.stringify(content));
  const plan = publishCandidatePlan(f.root, { ...f.plan, content: {
    ...f.plan.content, receipt: fileReceipt(f.root, path),
    projectionSha256: candidateContentProjection(f.root, content),
    contentIds: content.units.map(unit => unit.id),
  } }, f.writer, f.invocation);
  for (const candidateId of ['A', 'B']) {
    const prepared = prepareNativeMaker({ root: f.root, invocation: f.invocation, packRoot: pack,
      input: { schema: 'native-maker-input-v1', role: 'omd-sketch', sketch: {
        schema: 'sketch-brief-v1', mode: 'visual-study', plan, candidateId,
        sourceDirectory: `.omd/.cache/sketches/${candidateId}`,
      } } });
    const inputs = JSON.parse(prepared.packet.toString('utf8')).evidence.context.currentSketchRole.candidateInputs;
    assert.deepEqual(inputs.renderContract.units, content.units);
    const shared = JSON.parse(inputs.content.content);
    assert.deepEqual(JSON.parse(shared.facts.at(-1)), { options });
    assert.equal(inputs.renderContract.units.some((unit: { text: string }) => options.slice(1).includes(unit.text)), false);
  }
});

test('native Sketch sources are measured into the exact current candidate packet', { timeout: 120_000 }, async t => {
  const f = nativeCurrentFixture(t);
  const plan = publishCandidatePlan(f.root, f.plan, f.writer, f.invocation);
  for (const candidate of f.plan.candidates) {
    await makeNativeSource({
      root: f.root,
      invocation: f.invocation,
      packRoot: pack,
      input: {
        schema: 'native-maker-input-v1',
        role: 'omd-sketch',
        sketch: {
          schema: 'sketch-brief-v1',
          mode: 'visual-study',
          plan,
          candidateId: candidate.id,
          sourceDirectory: `.omd/.cache/sketches/${candidate.id}`,
        },
      },
    });
  }
  const result = await captureAndPublishCandidateSet(f.root, f.writer, f.invocation);
  assert.equal(result.candidateSet.schema, 'candidate-set-v2');
  assert.deepEqual(result.candidateSet.candidates.map(candidate => candidate.id), ['A', 'B']);
  assert.deepEqual(result.candidateSet.candidates.map(candidate =>
    candidate.previews.map(preview => preview.viewId)), [
    ['desktop-1280x900@1', 'mobile-390x844@1'],
    ['desktop-1280x900@1', 'mobile-390x844@1'],
  ]);
  assert.equal(result.publication.candidateSet.sha256.length, 64);
  assert.equal(result.publication.packet.sha256.length, 64);
  const planPath = join(f.root, '.omd/.cache/sketches/plan.json');
  const committedPlan = readFileSync(planPath);
  assert.throws(() => publishCandidatePlan(f.root, { ...f.plan, countReason: 'A different exploration decision.' },
    f.writer, f.invocation), /changed hypotheses use fresh candidate directories/);
  assert.deepEqual(readFileSync(planPath), committedPlan);

  write(f.root, '.omd/.cache/sketches/A/index.html',
    readFileSync(join(f.root, '.omd/.cache/sketches/A/index.html'), 'utf8').replace('</main>', '<p>drift</p></main>'));
  await assert.rejects(
    captureAndPublishCandidateSet(f.root, f.writer, f.invocation),
    /not current native-maker source/,
  );
  const previousPlanBytes = readFileSync(join(f.root, plan.path));
  const previousSourceBytes = readFileSync(join(f.root, '.omd/.cache/sketches/A/index.html'));
  const replanned = publishCandidatePlan(f.root, {
    ...f.plan,
    candidates: f.plan.candidates.map(candidate => ({ ...candidate, id: `${candidate.id}-next` })),
  }, f.writer, f.invocation);
  assert.notEqual(replanned.sha256, plan.sha256);
  assert.deepEqual(readFileSync(join(f.root, plan.path)), previousPlanBytes);
  assert.deepEqual(readFileSync(join(f.root, '.omd/.cache/sketches/A/index.html')), previousSourceBytes);
});

test('historical MakerInput remains compatible', () => {
  const parsed = parseMakerInput({
    schema: 'native-maker-input-v1',
    role: 'omd-hand',
    candidateId: null,
    paths: ['index.html'],
    readPaths: [],
    axis: null,
  });
  assert.equal(parsed.branch, 'standard');
  assert.equal(parsed.role, 'omd-hand');
  assert.deepEqual(parsed.paths, ['index.html']);
});
