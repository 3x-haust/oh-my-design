import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import {
  DeveloperEvaluationError,
  appendDeveloperEvaluation,
  openDeveloperEvaluationStore,
  parseDeveloperEvaluationInput,
  parseDeveloperEvaluationSnapshot,
  pinDeveloperEvaluationSnapshot,
  promoteDeveloperEvaluationCase,
  readDeveloperEvaluationSnapshot,
  resolveDeveloperEvaluationHome,
  reviseDeveloperEvaluation,
  revokeDeveloperEvaluation,
  selectDeveloperEvaluationCases,
  type DeveloperEvaluationRecordInput,
  type DeveloperEvaluationScope,
  type DeveloperEvaluationStore,
  type EvaluationRole,
} from '../core/coach/developer-evaluation-store.ts';

const roots: string[] = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const png = (label: string): Buffer => Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.from(label),
]);
const scope: DeveloperEvaluationScope = { route: '/settings/profile', surface: 'product', task: 'edit-profile' };

function fixture(namespace: 'real' | 'fixture' = 'real'): {
  root: string;
  store: DeveloperEvaluationStore;
  imageA: string;
  imageB: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'omd-developer-evaluation-'));
  roots.push(root);
  const projectRoot = join(root, 'project');
  mkdirSync(projectRoot, { mode: 0o700 });
  const imageA = join(root, 'a.png');
  const imageB = join(root, 'b.png');
  writeFileSync(imageA, png('a'), { mode: 0o600 });
  writeFileSync(imageB, png('b'), { mode: 0o600 });
  return {
    root,
    imageA,
    imageB,
    store: openDeveloperEvaluationStore({
      directory: join(root, 'private-store'),
      projectRoot,
      namespace,
    }),
  };
}
function interview(answer = 'yes') {
  return {
    questions: [{
      id: 'preference',
      prompt: 'Which outcome better supports the task?',
      options: [{ id: 'yes', label: 'The candidate supports it.' }, { id: 'no', label: 'It does not.' }],
    }],
    answers: [{ questionId: 'preference', optionIds: [answer], text: null }],
  } as const;
}
function record(
  fx: ReturnType<typeof fixture>,
  recordId: string,
  requestId: string,
  role: EvaluationRole = { kind: 'development' },
  recordScope: DeveloperEvaluationScope = scope,
): DeveloperEvaluationRecordInput {
  return {
    recordId,
    requestId,
    taskId: `task-${recordId}`,
    capturedAt: '2026-10-11T08:00:00.000Z',
    scope: recordScope,
    role,
    images: {
      a: { path: fx.imageA, sha256: hash(readFileSync(fx.imageA)) },
      b: { path: fx.imageB, sha256: hash(readFileSync(fx.imageB)) },
    },
    humanResponse: {
      interview: interview(),
      comparisonChoice: role.kind === 'held-out' ? role.candidateImage : 'a',
      satisfaction: 'satisfied',
      postChange: interview(),
    },
    relations: { references: ['reference:profile-form'], design: ['relation:label-before-control'] },
    changes: { attempted: ['increased field grouping'], preserved: ['kept existing submit flow'] },
    modelInterpretation: {
      summary: 'The response may support preserving the task hierarchy.',
      advisory: ['Preserve the visible task hierarchy for this exact route, surface, and task.'],
    },
    experiment: {
      model: 'caller-selected-model',
      settings: { reasoning: 'medium', temperature: 0 },
      budget: { unit: 'tokens', limit: 1200 },
      criteriaVersion: 'profile-criteria-v1',
    },
    reuse: { consent: 'allow-private-advisory-reuse', scope: recordScope },
  };
}
const heldOut = (
  candidateRecordId: string,
  caseDecision: 'approve' | 'reject' | 'uncertain' = 'approve',
): EvaluationRole => ({ kind: 'held-out', candidateRecordId, candidateImage: 'a', caseDecision });

test('verbatim developer text preserves surrounding whitespace and line breaks', () => {
  const fx = fixture('fixture');
  const input = record(fx, 'verbatim', 'request-verbatim');
  const text = '  B가 좋아요.\n이유는 아직 모르겠습니다.  ';
  const saved = appendDeveloperEvaluation(fx.store, {
    ...input,
    humanResponse: { ...input.humanResponse,
      interview: { questions: [{ id: 'note', prompt: '의견', options: [] }],
        answers: [{ questionId: 'note', optionIds: [], text }] } },
  });
  assert.equal(saved.humanResponse.interview.answers[0]?.text, text);
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
  writeFileSync(fx.imageA, png('changed'), { mode: 0o600 });
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
  assert.throws(() => appendDeveloperEvaluation(fx.store, malformed), /not a recognized image/);
});

test('revision and revocation append immutable history and make the latest record inactive', () => {
  const fx = fixture();
  const original = appendDeveloperEvaluation(fx.store, record(fx, 'candidate', 'request-one'));
  const revisedBase = record(fx, 'candidate', 'request-one');
  const revisedInput: DeveloperEvaluationRecordInput = {
    ...revisedBase,
    modelInterpretation: {
      ...revisedBase.modelInterpretation,
      advisory: ['Keep the profile task grouping for this exact structural scope.'],
    },
  };
  const revised = reviseDeveloperEvaluation(fx.store, {
    reason: 'The interviewer clarified the preserved behavior.',
    revisedAt: '2026-10-11T08:15:00.000Z',
    record: revisedInput,
  });
  assert.equal(revised.revisesSha256, original.recordSha256);
  assert.equal(revised.revision, 2);
  assert.equal(readdirSync(join(fx.store.directory, 'namespaces', 'real', 'records')).length, 2);
  const revocation = revokeDeveloperEvaluation(fx.store, {
    recordId: 'candidate',
    reason: 'The participant withdrew reuse permission.',
    revokedAt: '2026-10-11T08:30:00.000Z',
  });
  assert.equal(revocation.recordSha256, revised.recordSha256);
  assert.equal(readdirSync(join(fx.store.directory, 'namespaces', 'real', 'records')).length, 2);
  assert.throws(() => reviseDeveloperEvaluation(fx.store, {
    reason: 'Cannot revise a revoked response.',
    revisedAt: '2026-10-11T08:45:00.000Z',
    record: revisedInput,
  }), /not active/);
});

test('promotion refuses fixture records, repeated requests, scope mismatch, and non-approval', () => {
  const fixtureStore = fixture('fixture');
  appendDeveloperEvaluation(fixtureStore.store, record(fixtureStore, 'candidate', 'request-one'));
  assert.throws(() => promoteDeveloperEvaluationCase(fixtureStore.store, {
    recordId: 'candidate',
    heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T09:00:00.000Z',
  }), /can never promote/);

  const repeated = fixture();
  appendDeveloperEvaluation(repeated.store, record(repeated, 'candidate', 'request-one'));
  appendDeveloperEvaluation(repeated.store, record(repeated, 'held-one', 'request-two', heldOut('candidate')));
  appendDeveloperEvaluation(repeated.store, record(repeated, 'held-two', 'request-two', heldOut('candidate')));
  assert.throws(() => promoteDeveloperEvaluationCase(repeated.store, {
    recordId: 'candidate',
    heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T09:00:00.000Z',
  }), /different requests/);

  const mismatch = fixture();
  appendDeveloperEvaluation(mismatch.store, record(mismatch, 'candidate', 'request-one'));
  appendDeveloperEvaluation(mismatch.store, record(mismatch, 'held-one', 'request-two', heldOut('candidate')));
  appendDeveloperEvaluation(mismatch.store, record(
    mismatch,
    'held-two',
    'request-three',
    heldOut('candidate'),
    { route: '/settings/profile', surface: 'product', task: 'delete-profile' },
  ));
  assert.throws(() => promoteDeveloperEvaluationCase(mismatch.store, {
    recordId: 'candidate',
    heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T09:00:00.000Z',
  }), /exact matching scope/);

  const rejected = fixture();
  appendDeveloperEvaluation(rejected.store, record(rejected, 'candidate', 'request-one'));
  appendDeveloperEvaluation(rejected.store, record(rejected, 'held-one', 'request-two', heldOut('candidate')));
  appendDeveloperEvaluation(rejected.store, record(rejected, 'held-two', 'request-three', heldOut('candidate', 'uncertain')));
  assert.throws(() => promoteDeveloperEvaluationCase(rejected.store, {
    recordId: 'candidate',
    heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T09:00:00.000Z',
  }), /explicit approving held-out/);
});

test('promotion refuses forged favorable decisions and inconsistent or unmeasured experiments', () => {
  const uninterpreted = fixture();
  const uninterpretedBase = record(uninterpreted, 'candidate', 'request-one');
  appendDeveloperEvaluation(uninterpreted.store, {
    ...uninterpretedBase,
    modelInterpretation: { summary: '', advisory: [] },
  });
  appendDeveloperEvaluation(uninterpreted.store, record(uninterpreted, 'held-one', 'request-two', heldOut('candidate')));
  appendDeveloperEvaluation(uninterpreted.store, record(uninterpreted, 'held-two', 'request-three', heldOut('candidate')));
  assert.throws(() => promoteDeveloperEvaluationCase(uninterpreted.store, {
    recordId: 'candidate', heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T09:00:00.000Z',
  }), /separately recorded model advisory/);

  const forged = fixture();
  appendDeveloperEvaluation(forged.store, record(forged, 'candidate', 'request-one'));
  appendDeveloperEvaluation(forged.store, record(forged, 'held-one', 'request-two', heldOut('candidate')));
  const neitherBase = record(forged, 'held-two', 'request-three', heldOut('candidate'));
  appendDeveloperEvaluation(forged.store, {
    ...neitherBase,
    humanResponse: { ...neitherBase.humanResponse, comparisonChoice: 'neither' },
  });
  assert.throws(() => promoteDeveloperEvaluationCase(forged.store, {
    recordId: 'candidate', heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T09:00:00.000Z',
  }), /favor the declared candidate/);

  const unsatisfied = fixture();
  appendDeveloperEvaluation(unsatisfied.store, record(unsatisfied, 'candidate', 'request-one'));
  appendDeveloperEvaluation(unsatisfied.store, record(unsatisfied, 'held-one', 'request-two', heldOut('candidate')));
  const mixedBase = record(unsatisfied, 'held-two', 'request-three', heldOut('candidate'));
  appendDeveloperEvaluation(unsatisfied.store, {
    ...mixedBase,
    humanResponse: { ...mixedBase.humanResponse, satisfaction: 'mixed' },
  });
  assert.throws(() => promoteDeveloperEvaluationCase(unsatisfied.store, {
    recordId: 'candidate', heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T09:00:00.000Z',
  }), /be satisfied/);

  const inconsistent = fixture();
  appendDeveloperEvaluation(inconsistent.store, record(inconsistent, 'candidate', 'request-one'));
  appendDeveloperEvaluation(inconsistent.store, record(inconsistent, 'held-one', 'request-two', heldOut('candidate')));
  const differentExperiment = record(inconsistent, 'held-two', 'request-three', heldOut('candidate'));
  appendDeveloperEvaluation(inconsistent.store, {
    ...differentExperiment,
    experiment: { ...differentExperiment.experiment, criteriaVersion: 'profile-criteria-v2' },
  });
  assert.throws(() => promoteDeveloperEvaluationCase(inconsistent.store, {
    recordId: 'candidate', heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T09:00:00.000Z',
  }), /same measured experiment contract/);

  const unmeasured = fixture();
  const unmeasuredRecord = (recordId: string, requestId: string, role: EvaluationRole): DeveloperEvaluationRecordInput => {
    const base = record(unmeasured, recordId, requestId, role);
    return { ...base, experiment: { ...base.experiment, budget: { unit: 'unmeasured', limit: 0 } } };
  };
  appendDeveloperEvaluation(unmeasured.store, unmeasuredRecord('candidate', 'request-one', { kind: 'development' }));
  appendDeveloperEvaluation(unmeasured.store, unmeasuredRecord('held-one', 'request-two', heldOut('candidate')));
  appendDeveloperEvaluation(unmeasured.store, unmeasuredRecord('held-two', 'request-three', heldOut('candidate')));
  assert.throws(() => promoteDeveloperEvaluationCase(unmeasured.store, {
    recordId: 'candidate', heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T09:00:00.000Z',
  }), /measured experiment metadata/);
});

test('pinned snapshots are frozen, path-free, stable, parseable, and selected only by exact scope', () => {
  const fx = fixture();
  appendDeveloperEvaluation(fx.store, record(fx, 'candidate', 'request-one'));
  appendDeveloperEvaluation(fx.store, record(fx, 'held-one', 'request-two', heldOut('candidate')));
  appendDeveloperEvaluation(fx.store, record(fx, 'held-two', 'request-three', heldOut('candidate')));
  const promoted = promoteDeveloperEvaluationCase(fx.store, {
    recordId: 'candidate',
    heldOutRecordIds: ['held-one', 'held-two'],
    promotedAt: '2026-10-11T09:00:00.000Z',
  });
  const snapshot = pinDeveloperEvaluationSnapshot(fx.store, {
    requestRunId: 'native-run-one',
    caseIds: [promoted.caseId],
    pinnedAt: '2026-10-11T09:15:00.000Z',
  });
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.cases));
  assert(Object.isFrozen(snapshot.cases[0]?.scope));
  const serialized = JSON.stringify(snapshot);
  assert(!serialized.includes(fx.imageA));
  assert(!serialized.includes('request-one'));
  assert(!serialized.includes('Which outcome'));
  assert(!serialized.includes('caller-selected-model'));
  assert.equal(snapshot.cases[0]?.authority, 'none');
  assert.equal(snapshot.cases[0]?.currentRequestPrecedence, 'always');
  assert.deepEqual(snapshot.cases[0]?.developerSignal, { comparisonChoice: 'a', satisfaction: 'satisfied' });
  assert.deepEqual(snapshot.cases[0]?.designRelations, ['relation:label-before-control']);
  assert.deepEqual(snapshot.cases[0]?.changeSummary, {
    attempted: ['increased field grouping'],
    preserved: ['kept existing submit flow'],
  });
  assert.equal(snapshot.cases[0]?.advisorySource, 'model-interpretation');
  assert.deepEqual(parseDeveloperEvaluationSnapshot(JSON.parse(serialized)), snapshot);
  assert.deepEqual(readDeveloperEvaluationSnapshot(fx.store, snapshot.snapshotId), snapshot);
  assert.equal(selectDeveloperEvaluationCases(snapshot, scope).length, 1);
  assert.equal(selectDeveloperEvaluationCases(snapshot, { ...scope, task: 'delete-profile' }).length, 0);
  assert.throws(() => selectDeveloperEvaluationCases(snapshot, scope, 4), /at most three/);

  appendDeveloperEvaluation(fx.store, record(fx, 'unrelated', 'request-four'));
  assert.equal(JSON.stringify(snapshot), serialized);
  assert.deepEqual(readDeveloperEvaluationSnapshot(fx.store, snapshot.snapshotId), snapshot);
  revokeDeveloperEvaluation(fx.store, {
    recordId: 'candidate',
    reason: 'The developer withdrew this case after the run started.',
    revokedAt: '2026-10-11T09:30:00.000Z',
  });
  assert.equal(JSON.stringify(snapshot), serialized);
  assert.equal(selectDeveloperEvaluationCases(snapshot, scope).length, 1);
  assert.throws(
    () => readDeveloperEvaluationSnapshot(fx.store, snapshot.snapshotId),
    /references an inactive case/,
  );
});
