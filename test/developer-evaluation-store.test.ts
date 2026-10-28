import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';
import { captureDesignExecutionPolicy } from '../core/config/design-execution.ts';
import {
  appendDeveloperEvaluation,
  createDeveloperEvaluationExperiment,
  openDeveloperEvaluationStore,
  parseDeveloperEvaluationInput,
  resolveDeveloperEvaluationHome,
  pinEligibleDeveloperEvaluationSnapshot,
  pinDeveloperEvaluationSnapshot,
  promoteDeveloperEvaluationCase,
  readDeveloperEvaluationInput,
  readDeveloperEvaluationSnapshot,
  readDeveloperEvaluationSnapshotForPublication,
  readHistoricalDeveloperEvaluationRecord,
  readHistoricalDeveloperEvaluationSnapshot,
  recordDeveloperEvaluationExperimentRun,
  reviseDeveloperEvaluation,
  revokeDeveloperEvaluation,
  type DeveloperEvaluationRecordInput,
} from '../core/coach/developer-evaluation-store.ts';
import { canonicalJson } from '../core/ref/board-artifacts.ts';
import { capturePiRequest } from '../extensions/omd-request-source.ts';
import { PiNativeRuns } from '../extensions/omd-native-run.ts';

import { fixture, hash, interview, nativeRun, png, record, roots } from './helpers/developer-evaluation.ts';

test('verbatim developer text preserves surrounding whitespace and line breaks', () => {
  const fx = fixture('fixture');
  const input = record(fx, 'verbatim', 'request-verbatim');
  const text = '  B가 좋아요.\n이유는 아직 모르겠습니다.  ';
  const saved = appendDeveloperEvaluation(fx.store, {
    ...input,
    humanResponse: { ...input.humanResponse,
      interview: { questions: [...input.humanResponse.interview.questions, { id: 'note', prompt: '의견', options: [] }],
        answers: [...input.humanResponse.interview.answers, { questionId: 'note', optionIds: [], text }] } },
  });
  assert.equal(saved.humanResponse.interview.answers.find(answer => answer.questionId === 'note')?.text, text);
});

test('refusing project-local evaluation storage creates no directory or record', () => {
  const fx = fixture('fixture');
  const forbidden = join(fx.store.projectRoot, 'private-evaluations');
  assert.throws(() => openDeveloperEvaluationStore({
    directory: forbidden, projectRoot: fx.store.projectRoot, namespace: 'real',
  }), /outside the project tree/);
  assert.equal(existsSync(forbidden), false);
});

test('developer evaluation home is host-resolved and private storage cannot overlap the project', () => {
  assert.equal(
    resolveDeveloperEvaluationHome({}, '/tmp/example-home'),
    '/tmp/example-home/.config/oh-my-design/developer-evaluation',
  );
  assert.equal(
    resolveDeveloperEvaluationHome({ OMD_EVALUATION_HOME: '/tmp/private-evaluations' }, '/ignored'),
    '/tmp/private-evaluations',
  );
  const root = mkdtempSync(join(tmpdir(), 'omd-developer-evaluation-overlap-'));
  roots.push(root);
  const projectRoot = join(root, 'project');
  mkdirSync(projectRoot);
  assert.throws(() => openDeveloperEvaluationStore({
    directory: join(projectRoot, 'private'),
    projectRoot,
    namespace: 'real',
  }), /outside the project tree/);
});

test('append verifies image bytes and refuses absent interview answers', () => {
  const fx = fixture();
  assert(Object.isFrozen(parseDeveloperEvaluationInput(record(fx, 'parsed-record', 'request-zero'))));
  const noPostChangeBase = record(fx, 'no-post-change', 'request-no-post-change');
  const noPostChange = appendDeveloperEvaluation(fx.store, {
    ...noPostChangeBase,
    humanResponse: {
      ...noPostChangeBase.humanResponse,
      postChange: { questions: [], answers: [] },
    },
  });
  assert.deepEqual(noPostChange.humanResponse.postChange, { questions: [], answers: [] });
  const emptyMainBase = record(fx, 'empty-main', 'request-empty-main');
  assert.throws(() => appendDeveloperEvaluation(fx.store, {
    ...emptyMainBase,
    humanResponse: {
      ...emptyMainBase.humanResponse,
      interview: { questions: [], answers: [] },
    },
  }), /needs bounded questions and answers/);
  const rawBase = record(fx, 'raw-record', 'request-raw');
  const raw = appendDeveloperEvaluation(fx.store, {
    ...rawBase,
    modelInterpretation: { summary: '', advisory: [] },
    experiment: { ...rawBase.experiment, budget: { unit: 'unmeasured', limit: 0 } },
  });
  assert.equal(raw.modelInterpretation.summary, '');
  assert.deepEqual(raw.modelInterpretation.advisory, []);
  const missingBase = record(fx, 'missing-answer', 'request-one');
  const missing: DeveloperEvaluationRecordInput = {
    ...missingBase,
    humanResponse: {
      ...missingBase.humanResponse,
      interview: { ...missingBase.humanResponse.interview, answers: [] },
    },
  };
  assert.throws(() => appendDeveloperEvaluation(fx.store, missing), /exactly one answer/);

  const tampered = record(fx, 'tampered-image', 'request-two');
  writeFileSync(fx.imageA, png(255), { mode: 0o600 });
  assert.throws(() => appendDeveloperEvaluation(fx.store, tampered), /do not match SHA-256/);

  const malformedPath = join(fx.root, 'not-an-image.png');
  writeFileSync(malformedPath, 'plain text', { mode: 0o600 });
  const malformedBase = record(fx, 'malformed-image', 'request-three');
  const malformed: DeveloperEvaluationRecordInput = {
    ...malformedBase,
    images: {
      ...malformedBase.images,
      a: { path: malformedPath, sha256: hash(readFileSync(malformedPath)) },
    },
  };
  assert.throws(() => appendDeveloperEvaluation(fx.store, malformed), /image|PNG/);
});

test('a non-native host cannot create private automatic calibration pins', t => {
  const fx = fixture('fixture');
  const directory = join(fx.root, 'unauthorized-pins');
  const previous = process.env.OMD_EVALUATION_HOME;
  const previousSnapshot = process.env.OMD_EVALUATION_SNAPSHOT;
  process.env.OMD_EVALUATION_HOME = directory;
  delete process.env.OMD_EVALUATION_SNAPSHOT;
  t.after(() => {
    if (previous === undefined) delete process.env.OMD_EVALUATION_HOME;
    else process.env.OMD_EVALUATION_HOME = previous;
    if (previousSnapshot === undefined) delete process.env.OMD_EVALUATION_SNAPSHOT;
    else process.env.OMD_EVALUATION_SNAPSHOT = previousSnapshot;
  });
  capturePiRequest(fx.projectRoot, 'A new request');
  const runs = new PiNativeRuns(captureDesignExecutionPolicy({}));
  runs.observe({ cwd: fx.projectRoot, model: { provider: 'test', id: 'test' },
    thinkingLevel: 'high', sessionManager: { getSessionId: () => 'test' } });
  assert.throws(() => runs.prepare(fx.projectRoot, ['schema', 'route-input'],
    fileURLToPath(new URL('..', import.meta.url))), /native Pi host/);
  assert.equal(existsSync(directory), false);
});

test('caller-rehashed run JSON and arbitrary image hashes are not native experiment evidence', () => {
  const fx = fixture();
  appendDeveloperEvaluation(fx.store, record(fx, 'development', 'training-request'));
  const requestSha256 = hash('held-out-one');
  const snapshot = createDeveloperEvaluationExperiment(fx.store, {
    recordId: 'development',
    runtimeSourceSha256: hash('runtime-source'),
    plannedHeldOutRequestSha256s: [requestSha256, hash('held-out-two')],
    criteriaIds: ['hierarchy'],
    pinIdentity: hash('authority-attack-pin'),
    pinnedAt: '2026-10-11T09:00:00.000Z',
  });
  assert.throws(() => recordDeveloperEvaluationExperimentRun(fx.store, {
    snapshotId: snapshot.snapshotId,
    nativeRun: nativeRun(fx, snapshot, requestSha256),
    requestSha256,
    resultImageSha256s: { a: hash('not-a-native-image-a'), b: hash('not-a-native-image-b') },
    capturedAt: '2026-10-11T10:00:00.000Z',
  }));
});

test('raw comparison, candidate satisfaction, reference preference, and reuse answers are authoritative', () => {
  const fx = fixture();
  const base = record(fx, 'contradictory', hash('request'));
  for (const humanResponse of [
    { ...base.humanResponse, comparisonChoice: 'b' as const },
    { ...base.humanResponse, satisfaction: 'mixed' as const },
    { ...base.humanResponse, satisfactionCandidate: 'b' as const },
    { ...base.humanResponse, interview: { ...base.humanResponse.interview,
      answers: base.humanResponse.interview.answers.map(answer => answer.questionId === 'comparison'
        ? { ...answer, text: 'B' } : answer) } },
  ]) {
    assert.throws(() => appendDeveloperEvaluation(fx.store, {
      ...base,
      recordId: `${base.recordId}-${humanResponse.comparisonChoice}-${humanResponse.satisfaction}-${humanResponse.satisfactionCandidate}`,
      humanResponse,
    }), /authoritative|candidate-specific|raw interview option|option label/);
  }
  assert.throws(() => appendDeveloperEvaluation(fx.store, {
    ...base,
    recordId: 'reuse-conflict',
    reuse: { ...base.reuse, consent: 'deny' },
  }), /reuse summary conflicts/);

  const separate = record(fx, 'separate-signals', hash('separate'));
  const saved = appendDeveloperEvaluation(fx.store, {
    ...separate,
    images: { ...separate.images, references: { a: separate.images.b, b: separate.images.a } },
    humanResponse: {
      interview: interview('b', 'mixed', 'b', 'allow', 'a'),
      comparisonChoice: 'b',
      satisfaction: 'mixed',
      satisfactionCandidate: 'b',
      referencePreference: 'a',
      postChange: { questions: [], answers: [] },
    },
  });
  assert.equal(saved.humanResponse.referencePreference, 'a');
  assert.equal(saved.humanResponse.satisfactionCandidate, 'b');
  assert.equal(saved.humanResponse.satisfaction, 'mixed');
  assert.throws(() => appendDeveloperEvaluation(fx.store, {
    ...separate, recordId: 'unbound-reference-preference', humanResponse: saved.humanResponse,
  }), /actual displayed reference image pair/);
});

test('only decodable permission-authorized PNGs are retained as immutable private evidence', () => {
  const fx = fixture();
  const malformed = join(fx.root, 'header-only.png');
  writeFileSync(malformed, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { mode: 0o600 });
  const malformedInput = record(fx, 'malformed', hash('malformed'));
  assert.throws(() => appendDeveloperEvaluation(fx.store, {
    ...malformedInput,
    images: { ...malformedInput.images, a: { path: malformed, sha256: hash(readFileSync(malformed)) } },
  }), /decodable PNG/);

  const saved = appendDeveloperEvaluation(fx.store, record(fx, 'retained', hash('retained')));
  assert.notEqual(saved.images.a.path, fx.imageA);
  assert.match(saved.images.a.path, /private-store.*images.*sha256-/);
  unlinkSync(fx.imageA);
  unlinkSync(fx.imageB);
  const recovered = readDeveloperEvaluationInput(fx.store, saved.recordId);
  assert.equal(hash(readFileSync(recovered.images.a.path)), saved.images.a.sha256);
  assert.equal(hash(readFileSync(recovered.images.b.path)), saved.images.b.sha256);
  assert.deepEqual(recovered.imageUse, {
    modelDisclosure: 'allow-current-developer-session',
    retention: 'allow-private-evidence-copy',
    externalShare: 'deny',
    productAssetReuse: 'deny',
  });
});

test('revision and revocation invalidate future publication but preserve frozen and historical reads', () => {
  const fx = fixture();
  const source = appendDeveloperEvaluation(fx.store, record(fx, 'candidate', hash('training')));
  const revised = reviseDeveloperEvaluation(fx.store, {
    reason: 'Clarified the model interpretation separately.',
    revisedAt: '2026-10-11T08:15:00.000Z',
    record: {
      ...readDeveloperEvaluationInput(fx.store, source.recordId),
      modelInterpretation: {
        summary: 'Revised model hypothesis.',
        advisory: ['Preserve the task context, not the literal styling.'],
      },
    },
  });
  assert.equal(revised.revisesSha256, source.recordSha256);
  revokeDeveloperEvaluation(fx.store, {
    recordId: revised.recordId,
    reason: 'Developer withdrew reuse permission.',
    revokedAt: '2026-10-11T08:30:00.000Z',
  });
  assert.throws(() => readDeveloperEvaluationInput(fx.store, revised.recordId), /not active/);

  const historicalCore = {
    schema: 'developer-evaluation-snapshot-v1',
    requestRunId: 'historical-run',
    pinnedAt: '2026-10-11T08:00:00.000Z',
    cases: [],
  };
  const digest = hash(canonicalJson(historicalCore));
  writeFileSync(
    join(fx.store.directory, 'namespaces', 'real', 'snapshots', `sha256-${digest}.json`),
    canonicalJson({ ...historicalCore, snapshotId: digest, digest }),
    { mode: 0o600 },
  );
  assert.equal(readHistoricalDeveloperEvaluationSnapshot(fx.store, digest).schema, 'developer-evaluation-snapshot-v1');
  assert.throws(() => readDeveloperEvaluationSnapshot(fx.store, digest), /snapshot.*unknown|snapshot.schema/);

  const historicalRecord = {
    schema: 'developer-evaluation-record-v1',
    namespace: 'real',
    recordId: 'historical-only',
    note: 'Historical records require an explicit reader and never enter current publication.',
  };
  const recordSha256 = hash(canonicalJson(historicalRecord));
  writeFileSync(
    join(fx.store.directory, 'namespaces', 'real', 'records', `sha256-${recordSha256}.json`),
    canonicalJson({ ...historicalRecord, recordSha256 }),
    { mode: 0o600 },
  );
  assert.equal(readHistoricalDeveloperEvaluationRecord(fx.store, recordSha256).schema, 'developer-evaluation-record-v1');
  assert.doesNotThrow(() => appendDeveloperEvaluation(fx.store, record(fx, 'current-after-history', hash('current'))));
});

test('fixture data cannot create experiments or validated production snapshots', () => {
  const fx = fixture('fixture');
  const source = appendDeveloperEvaluation(fx.store, record(fx, 'candidate', hash('training')));
  assert.throws(() => createDeveloperEvaluationExperiment(fx.store, {
    recordId: source.recordId,
    runtimeSourceSha256: hash('runtime-source'),
    plannedHeldOutRequestSha256s: [hash('one'), hash('two')],
    criteriaIds: ['task-complete'],
    pinIdentity: hash('pin'),
    pinnedAt: '2026-10-11T08:30:00.000Z',
  }), /fixture/);
  assert.throws(() => pinDeveloperEvaluationSnapshot(fx.store, {
    pinIdentity: hash('pin'),
    caseIds: [],
    pinnedAt: '2026-10-11T08:30:00.000Z',
  }), /fixture/);
});

test('an ordinary preflight pin freezes an empty eligible selection', () => {
  const fx = fixture();
  const pinIdentity = hash('ordinary-native-preflight');
  const first = pinEligibleDeveloperEvaluationSnapshot(fx.store, {
    pinIdentity,
    pinnedAt: '2026-10-11T08:00:00.000Z',
  });
  assert.equal(first.mode, 'validated');
  assert.deepEqual(first.cases, []);
  appendDeveloperEvaluation(fx.store, record(fx, 'later-record', hash('later-request')));
  const resumed = pinEligibleDeveloperEvaluationSnapshot(fx.store, {
    pinIdentity,
    pinnedAt: '2026-10-11T09:00:00.000Z',
  });
  assert.equal(resumed.snapshotId, first.snapshotId);
  assert.deepEqual(resumed.cases, []);
});
