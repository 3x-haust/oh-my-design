import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { PNG } from 'pngjs';
import { captureDesignExecutionPolicy } from '../../core/config/design-execution.ts';
import { createDeveloperEvaluationExperiment, openDeveloperEvaluationStore,
  type DeveloperEvaluationRecordInput, type DeveloperEvaluationScope, type EvaluationRole,
} from '../../core/coach/developer-evaluation-store.ts';
import { nativePiRunId, type NativePiRun } from '../../core/runtime/native-pi-run-record.ts';

export const roots: string[] = [];
after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));
export const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const scope: DeveloperEvaluationScope = { route: '/settings/profile', surface: 'product', task: 'edit-profile' };

export function png(seed: number): Buffer {
  const image = new PNG({ width: 2, height: 2 });
  image.data.fill(seed);
  return PNG.sync.write(image);
}
export function fixture(namespace: 'real' | 'fixture' = 'real') {
  const root = mkdtempSync(join(tmpdir(), 'omd-developer-evaluation-'));
  roots.push(root);
  const projectRoot = join(root, 'project');
  mkdirSync(projectRoot, { mode: 0o700 });
  const imageA = join(root, 'a.png');
  const imageB = join(root, 'b.png');
  writeFileSync(imageA, png(240), { mode: 0o600 });
  writeFileSync(imageB, png(80), { mode: 0o600 });
  return {
    root,
    projectRoot,
    imageA,
    imageB,
    store: openDeveloperEvaluationStore({
      directory: join(root, 'private-store'),
      projectRoot,
      namespace,
    }),
  };
}
export function interview(
  comparison: 'a' | 'b' | 'tie' | 'neither' | 'uncertain' = 'a',
  satisfaction: 'satisfied' | 'mixed' | 'unsatisfied' | 'uncertain' = 'satisfied',
  satisfactionCandidate: 'a' | 'b' = 'a',
  reuse: 'allow' | 'deny' = 'allow',
  referencePreference: 'a' | 'b' | 'tie' | 'neither' | 'uncertain' | null = null,
) {
  const questions = [
    { id: 'comparison', prompt: 'Which application is better?', options: [
      { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'tie', label: 'Tie' },
      { id: 'neither', label: 'Neither' }, { id: 'uncertain', label: 'Uncertain' },
    ] },
    { id: `application-satisfaction-${satisfactionCandidate}`, prompt: `Is application ${satisfactionCandidate.toUpperCase()} satisfactory?`, options: [
      { id: 'satisfied', label: 'Satisfied' }, { id: 'mixed', label: 'Mixed' },
      { id: 'unsatisfied', label: 'Unsatisfied' }, { id: 'uncertain', label: 'Uncertain' },
    ] },
    ...(referencePreference === null ? [] : [{
      id: 'reference-preference', prompt: 'Which source reference is preferred?', options: [
        { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'tie', label: 'Tie' },
        { id: 'neither', label: 'Neither' }, { id: 'uncertain', label: 'Uncertain' },
      ],
    }]),
    { id: 'reuse', prompt: 'Allow private advisory reuse?', options: [
      { id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' },
    ] },
    { id: 'image-permission', prompt: 'Allow private image retention and current model disclosure?', options: [
      { id: 'allow', label: 'Allow' },
    ] },
  ];
  return {
    questions,
    answers: [
      { questionId: 'comparison', optionIds: [comparison], text: null },
      { questionId: `application-satisfaction-${satisfactionCandidate}`, optionIds: [satisfaction], text: null },
      ...(referencePreference === null ? [] : [{
        questionId: 'reference-preference', optionIds: [referencePreference], text: null,
      }]),
      { questionId: 'reuse', optionIds: [reuse], text: null },
      { questionId: 'image-permission', optionIds: ['allow'], text: null },
    ],
  };
}
export function record(
  fx: ReturnType<typeof fixture>,
  recordId: string,
  requestId: string,
  role: EvaluationRole = { kind: 'development' },
): DeveloperEvaluationRecordInput {
  const raw = interview();
  const humanInterview = role.kind !== 'held-out' ? raw : {
    questions: [...raw.questions,
      ...role.criteria.map(criterion => ({ id: `criterion:${criterion.id}`, prompt: criterion.id,
        options: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }, { id: 'uncertain', label: 'Uncertain' }] })),
      { id: 'validation-decision', prompt: 'Validation decision',
        options: [{ id: 'approve', label: 'Approve' }, { id: 'reject', label: 'Reject' }, { id: 'uncertain', label: 'Uncertain' }] }],
    answers: [...raw.answers,
      ...role.criteria.map(criterion => ({ questionId: `criterion:${criterion.id}`, optionIds: [criterion.outcome], text: null })),
      { questionId: 'validation-decision', optionIds: [role.caseDecision], text: null }],
  };
  return {
    recordId,
    requestId,
    taskId: `task-${recordId}`,
    capturedAt: '2026-10-11T08:00:00.000Z',
    scope,
    role,
    images: {
      a: { path: fx.imageA, sha256: hash(readFileSync(fx.imageA)) },
      b: { path: fx.imageB, sha256: hash(readFileSync(fx.imageB)) },
    },
    humanResponse: {
      interview: humanInterview,
      comparisonChoice: 'a',
      satisfaction: 'satisfied',
      satisfactionCandidate: 'a',
      referencePreference: null,
      postChange: { questions: [], answers: [] },
    },
    relations: { references: ['reference:profile-form'], design: ['relation:label-before-control'] },
    changes: { attempted: ['increased field grouping'], preserved: ['kept existing submit flow'] },
    modelInterpretation: {
      summary: 'A model hypothesis, not a developer quote.',
      advisory: ['Preserve the visible task hierarchy for this exact route and task.'],
    },
    experiment: {
      model: 'observed-host-model',
      settings: { reasoning: 'medium' },
      budget: { unit: 'tokens', limit: 1200 },
      criteriaVersion: 'profile-criteria-v1',
    },
    reuse: { consent: 'allow-private-advisory-reuse', scope },
    imageUse: {
      modelDisclosure: 'allow-current-developer-session',
      retention: 'allow-private-evidence-copy',
      externalShare: 'deny',
      productAssetReuse: 'deny',
    },
  };
}
export function nativeRun(
  fx: ReturnType<typeof fixture>,
  snapshot: ReturnType<typeof createDeveloperEvaluationExperiment>,
  requestSha256: string,
): NativePiRun {
  const experiment = snapshot.experiment;
  assert.ok(experiment);
  const identity = {
    projectRoot: fx.projectRoot,
    buildSha256: hash('build'),
    loadedSkillSha256: hash('skill'),
    briefSha256: requestSha256,
    runtimeSha256: experiment.runtimeSourceSha256,
    host: {
      nodePath: '/private/node',
      nodeSha256: hash('node'),
      cliPath: '/private/omd',
      cliSha256: hash('cli'),
      provider: 'provider',
      model: 'model',
      thinkingLevel: 'medium',
      parentSessionId: 'session',
    },
    designPolicy: captureDesignExecutionPolicy({ OMD_DESIGN_MODE: 'developer-evaluation' }),
    calibration: snapshot,
  };
  return Object.freeze({ ...identity, runId: nativePiRunId(identity) });
}
