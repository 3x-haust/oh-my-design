import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { appendDeveloperEvaluation, createDeveloperEvaluationExperiment,
  readDeveloperEvaluationSnapshotForPublication, promoteDeveloperEvaluationCase,
  pinDeveloperEvaluationSnapshot, readDeveloperEvaluationSnapshot, readDeveloperEvaluationInput,
  reviseDeveloperEvaluation, recordDeveloperEvaluationExperimentRun,
} from '../core/coach/developer-evaluation-store.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { createTestNativePiInvocation } from '../core/runtime/native-pi-run.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { createProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { capturePiRequest } from '../extensions/omd-request-source.ts';
import { measurementFixture } from './helpers/visual-measurement.ts';
import { measureProject, loadMeasurement } from '../core/measure/index.ts';
import { fixture, hash, nativeRun, record, roots } from './helpers/developer-evaluation.ts';

async function heldOutRecord(
  fx: ReturnType<typeof fixture>,
  source: ReturnType<typeof appendDeveloperEvaluation>,
  snapshot: ReturnType<typeof createDeveloperEvaluationExperiment>,
  request: string,
  recordId: string,
) {
  const requestSha256 = hash(request);
  const project = measurementFixture('clean');
  roots.push(project.root);
  capturePiRequest(project.root, request);
  const run = nativeRun({ ...fx, projectRoot: project.root }, snapshot, requestSha256);
  mkdirSync(join(project.root, '.omd/native-pi'), { recursive: true });
  writeFileSync(join(project.root, '.omd/native-pi/run.json'), canonicalJson({
    schema: 'native-pi-run-v1', run,
    signature: signNativeObservation(project.root, 'pi-run', hash(canonicalRouteJson(run))),
  }));
  const invocation = createTestNativePiInvocation({
    root: project.root, host: run.host,
    current: { buildSha256: run.buildSha256, loadedSkillSha256: run.loadedSkillSha256, briefSha256: run.briefSha256 },
  });
  const handback = { files: [{ path: 'dist/index.html',
    content: readFileSync(join(project.root, 'dist/index.html'), 'utf8') }] };
  const receipt = {
    schema: 'native-pi-maker-execution-v1', projectRoot: project.root, role: 'omd-hand',
    fixedBindings: { buildSha256: run.buildSha256, briefSha256: run.briefSha256,
      calibration: { snapshotSha256: snapshot.digest, caseIds: snapshot.cases.map(entry => entry.caseId) } },
    finalMessage: canonicalJson(handback),
  };
  const execution = canonicalJson({ receipt, handback,
    signature: signNativeObservation(project.root, 'native-pi-maker-execution-v1', hash(canonicalJson(receipt))) });
  mkdirSync(join(project.root, '.omd/makers/executions'), { recursive: true });
  writeFileSync(join(project.root, `.omd/makers/executions/${hash(execution)}.json`), execution);
  const measured = await measureProject({
    root: project.root, entry: 'dist/index.html', invocation,
    writer: createProjectWriteAdapter(project.root, invocation),
  });
  const packet = loadMeasurement(project.root, measured.packet);
  const [a, b] = packet.captures;
  assert.ok(a && b);
  const compared = { ...fx, imageA: join(project.root, a.capture.path), imageB: join(project.root, b.capture.path) };
  const imageDigests = { a: a.capture.sha256, b: b.capture.sha256 };
  const evidenceInput = {
    snapshotId: snapshot.snapshotId,
    nativeRun: run,
    requestSha256,
    resultImageSha256s: imageDigests,
    capturedAt: '2026-10-11T09:00:00.000Z',
  };
  assert.throws(() => recordDeveloperEvaluationExperimentRun(fx.store, {
    ...evidenceInput, resultImageSha256s: { ...imageDigests, a: hash('uncaptured image') },
  }), /native measurement evidence/);
  const unconsumed = { ...receipt,
    fixedBindings: { buildSha256: run.buildSha256, briefSha256: run.briefSha256 } };
  const unconsumedBytes = canonicalJson({ receipt: unconsumed, handback,
    signature: signNativeObservation(project.root, 'native-pi-maker-execution-v1', hash(canonicalJson(unconsumed))) });
  const originalPath = join(project.root, `.omd/makers/executions/${hash(execution)}.json`);
  const unconsumedPath = join(project.root, `.omd/makers/executions/${hash(unconsumedBytes)}.json`);
  unlinkSync(originalPath);
  writeFileSync(unconsumedPath, unconsumedBytes);
  try {
    assert.throws(() => recordDeveloperEvaluationExperimentRun(fx.store, evidenceInput), /delivered calibration/);
  } finally {
    unlinkSync(unconsumedPath);
    writeFileSync(originalPath, execution);
  }
  const evidence = recordDeveloperEvaluationExperimentRun(fx.store, evidenceInput);
  assert.ok(snapshot.experiment);
  return appendDeveloperEvaluation(fx.store, record(compared, recordId, requestSha256, {
    kind: 'held-out',
    candidateRecordId: source.recordId,
    candidateRecordSha256: source.recordSha256,
    experimentId: snapshot.experiment.experimentId,
    experimentalSnapshotId: snapshot.snapshotId,
    experimentRunEvidenceSha256: evidence.evidenceSha256,
    nativeRunId: run.runId,
    requestSha256,
    candidateImage: 'a',
    resultImageSha256s: imageDigests,
    criteria: snapshot.experiment.criteriaIds.map(id => ({ id, outcome: 'pass' as const })),
    caseDecision: 'approve',
  }));
}

test('predeclared experiments bind source revision, actual native runs, held-out requests, criteria, and result images', async () => {
  const fx = fixture();
  const source = appendDeveloperEvaluation(fx.store, record(fx, 'candidate', hash('training')));
  const requestOne = hash('held-out-one');
  const requestTwo = hash('held-out-two');
  const snapshot = createDeveloperEvaluationExperiment(fx.store, {
    recordId: source.recordId,
    runtimeSourceSha256: hash('runtime-source'),
    plannedHeldOutRequestSha256s: [requestOne, requestTwo],
    criteriaIds: ['task-complete', 'responsive'],
    pinIdentity: hash('experiment-pin'),
    pinnedAt: '2026-10-11T08:30:00.000Z',
  });
  assert.equal(snapshot.mode, 'experimental');
  assert.equal(snapshot.cases[0]?.heldOutRecordSha256s.length, 0);
  assert.throws(() => readDeveloperEvaluationSnapshotForPublication(
    fx.store,
    snapshot.snapshotId,
    'autonomous',
  ), /explicit host developer mode/);
  assert.deepEqual(readDeveloperEvaluationSnapshotForPublication(
    fx.store,
    snapshot.snapshotId,
    'developer-evaluation',
  ), snapshot);
  const first = await heldOutRecord(fx, source, snapshot, 'held-out-one', 'held-one');
  const second = await heldOutRecord(fx, source, snapshot, 'held-out-two', 'held-two');
  const promoted = promoteDeveloperEvaluationCase(fx.store, {
    recordId: source.recordId,
    heldOutRecordIds: [first.recordId, second.recordId],
    promotedAt: '2026-10-11T10:00:00.000Z',
  });
  assert.deepEqual(promoted.heldOutRecordSha256s, [first.recordSha256, second.recordSha256]);
  const validated = pinDeveloperEvaluationSnapshot(fx.store, {
    pinIdentity: hash('ordinary-pin'),
    caseIds: [promoted.caseId],
    pinnedAt: '2026-10-11T10:15:00.000Z',
  });
  assert.equal(validated.mode, 'validated');
  assert.equal(readDeveloperEvaluationSnapshot(fx.store, validated.snapshotId).cases.length, 1);
  const editable = readDeveloperEvaluationInput(fx.store, first.recordId);
  assert.equal(editable.role.kind, 'held-out');
  if (editable.role.kind !== 'held-out') throw new Error('held-out fixture required');
  const heldOutRole = editable.role;
  assert.throws(() => reviseDeveloperEvaluation(fx.store, {
    record: { ...editable, role: { ...heldOutRole, caseDecision: 'reject' } },
    reason: 'Contradictory summary', revisedAt: '2026-10-11T11:00:00.000Z',
  }), /authoritative raw answer/);
  reviseDeveloperEvaluation(fx.store, {
    record: { ...editable, role: { ...heldOutRole, caseDecision: 'reject' },
      humanResponse: { ...editable.humanResponse, interview: {
        ...editable.humanResponse.interview,
        answers: editable.humanResponse.interview.answers.map(answer =>
          answer.questionId === 'validation-decision' ? { ...answer, optionIds: ['reject'], text: null } : answer),
      } } },
    reason: 'Explicit corrected validation', revisedAt: '2026-10-11T11:00:00.000Z',
  });
  assert.throws(() => readDeveloperEvaluationSnapshotForPublication(fx.store, validated.snapshotId, 'autonomous'), /inactive case/);
  assert.equal(readDeveloperEvaluationSnapshot(fx.store, validated.snapshotId).digest, validated.digest);
});

test('caller-labelled held-out IDs, unplanned requests, and revised experiment sources cannot promote', async () => {
  const fx = fixture();
  const source = appendDeveloperEvaluation(fx.store, record(fx, 'candidate', hash('training')));
  const requestOne = hash('held-out-one');
  const requestTwo = hash('held-out-two');
  const snapshot = createDeveloperEvaluationExperiment(fx.store, {
    recordId: source.recordId,
    runtimeSourceSha256: hash('runtime-source'),
    plannedHeldOutRequestSha256s: [requestOne, requestTwo],
    criteriaIds: ['task-complete'],
    pinIdentity: hash('experiment-pin'),
    pinnedAt: '2026-10-11T08:30:00.000Z',
  });
  assert.throws(() => recordDeveloperEvaluationExperimentRun(fx.store, {
    snapshotId: snapshot.snapshotId,
    nativeRun: nativeRun(fx, snapshot, hash('unplanned')),
    requestSha256: hash('unplanned'),
    resultImageSha256s: { a: hash(readFileSync(fx.imageA)), b: hash(readFileSync(fx.imageB)) },
    capturedAt: '2026-10-11T09:00:00.000Z',
  }), /not predeclared/);

  await heldOutRecord(fx, source, snapshot, 'held-out-one', 'held-one');
  await heldOutRecord(fx, source, snapshot, 'held-out-two', 'held-two');
  const editable = readDeveloperEvaluationInput(fx.store, source.recordId);
  reviseDeveloperEvaluation(fx.store, {
    reason: 'Changed settings after seeing held-out results.',
    revisedAt: '2026-10-11T09:30:00.000Z',
    record: {
      ...editable,
      experiment: { ...editable.experiment, budget: { unit: 'unmeasured', limit: 0 } },
    },
  });
  assert.throws(() => readDeveloperEvaluationSnapshotForPublication(
    fx.store,
    snapshot.snapshotId,
    'developer-evaluation',
  ), /source is no longer active/);
  assert.throws(() => promoteDeveloperEvaluationCase(fx.store, {
    recordId: source.recordId,
    heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T10:00:00.000Z',
  }), /explicit approving held-out evaluation records/);
});
