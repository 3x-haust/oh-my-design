import { createHash, randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesignExecutionPolicy } from '../core/config/design-execution.ts';
import { currentCalibrationScope } from '../core/coach/developer-calibration.ts';
import {
  appendDeveloperEvaluation, createDeveloperEvaluationExperiment, openDeveloperEvaluationStore, parseDeveloperEvaluationInput,
  pinDeveloperEvaluationSnapshot, promoteDeveloperEvaluationCase, revokeDeveloperEvaluation,
  reviseDeveloperEvaluation, readDeveloperEvaluationInput, recordDeveloperEvaluationExperimentRun,
} from '../core/coach/developer-evaluation-store.ts';
import { readPiRequest } from './omd-request-source.ts';
import { collectDeveloperInterview } from './omd-developer-interview.ts';
import type { PortablePiApi } from './omd-runtime.ts';
import type { EvaluationRole, InterviewAnswer, InterviewQuestion } from '../core/coach/developer-evaluation-contract.ts';
import { nativePiRuntimeSha256, readSignedNativePiRun } from '../core/runtime/native-pi-run-record.ts';
import { join } from 'node:path';
import { loadDeveloperImagePair } from './omd-developer-images.ts';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const usage = '사용법: /omd-evaluate compare ["A.png","B.png"] 또는 compare {"images":["A.png","B.png"],"references":["refA.png","refB.png"]} | repair ["before.png","after.png"] | validate {"images":["control.png","calibrated.png"],"recordId":"기준 기록 ID","candidateImage":"b","projects":["기준 프로젝트","보정 프로젝트"]} | experiment <recordId, heldOutRequests, criteriaIds 계획 JSON 경로> | export <기록 ID> | revise <입력 JSON 경로> | revoke <기록 ID> | promote <기록 ID> <새 요청 평가 ID 두 개 이상> | pin <사례 ID...>';

export function registerDeveloperEvaluation(pi: PortablePiApi, policy: DesignExecutionPolicy, home: string): void {
  if (policy.mode !== 'developer-evaluation') return;
  pi.registerCommand('omd-evaluate', {
    description: 'Compare existing OMD renders and manage private developer calibration',
    async handler(args, context) {
      const separator = args.indexOf(' ');
      const action = separator < 0 ? args.trim() : args.slice(0, separator);
      const payload = separator < 0 ? '' : args.slice(separator + 1).trim();
      if (!['compare', 'repair', 'validate', 'experiment', 'export', 'revise', 'revoke', 'promote', 'pin'].includes(action)) {
        context.ui.notify(usage, 'info');
        return;
      }
      try {
        if (action === 'compare' || action === 'repair' || action === 'validate') {
          if (!context.ui.select || !pi.sendMessage) throw new Error('OMD_DEVELOPER_UI_REQUIRED');
          const consent = await context.ui.select(
            '지정한 결과와 레퍼런스 이미지를 현재 모델 세션에 표시하고, 삭제되지 않는 비공개 증거 사본으로 보관합니다. 외부 공유와 제품 자산 재사용은 허용하지 않습니다.',
            ['허용', '취소'],
          );
          if (consent !== '허용') return;
          const supplied: unknown = JSON.parse(payload);
          let validation: {
            recordId: string;
            candidateImage: 'a' | 'b';
            projects?: readonly [string, string];
          } | undefined;
          if (action === 'validate') {
            if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)
              || Object.keys(supplied).sort().join(',') !== (Object.hasOwn(supplied, 'projects')
                ? 'candidateImage,images,projects,recordId' : 'candidateImage,images,recordId')) throw new Error(usage);
            const recordId: unknown = Reflect.get(supplied, 'recordId');
            const candidateImage: unknown = Reflect.get(supplied, 'candidateImage');
            if (typeof recordId !== 'string' || !recordId || (candidateImage !== 'a' && candidateImage !== 'b')) throw new Error(usage);
            const rawProjects: unknown = Reflect.get(supplied, 'projects');
            let projects: readonly [string, string] | undefined;
            if (rawProjects !== undefined) {
              if (!Array.isArray(rawProjects) || rawProjects.length !== 2) throw new Error(usage);
              const [a, b] = rawProjects;
              if (typeof a !== 'string' || typeof b !== 'string') throw new Error(usage);
              projects = [resolve(context.cwd, a), resolve(context.cwd, b)];
            }
            validation = { recordId, candidateImage,
              ...(projects === undefined ? {} : { projects }) };
          }
          let referencePaths: unknown;
          let paths: unknown = validation === undefined ? supplied : Reflect.get(Object(supplied), 'images');
          if (action === 'compare' && !Array.isArray(supplied)) {
            if (typeof supplied !== 'object' || supplied === null
              || Object.keys(supplied).sort().join(',') !== 'images,references') throw new Error(usage);
            paths = Reflect.get(supplied, 'images');
            referencePaths = Reflect.get(supplied, 'references');
          }
          const reversed = action !== 'repair' && randomInt(2) === 1;
          const { a, b } = loadDeveloperImagePair(context.cwd, paths, reversed);
          const references = referencePaths === undefined ? undefined
            : loadDeveloperImagePair(context.cwd, referencePaths, reversed);
          await pi.sendMessage({
            customType: 'omd-developer-comparison', display: true,
            content: [
              { type: 'text', text: 'A' }, { type: 'image', data: a.bytes.toString('base64'), mimeType: 'image/png' },
              { type: 'text', text: 'B' }, { type: 'image', data: b.bytes.toString('base64'), mimeType: 'image/png' },
              ...(references === undefined ? [] : [
                { type: 'text' as const, text: '레퍼런스 A' },
                { type: 'image' as const, data: references.a.bytes.toString('base64'), mimeType: 'image/png' },
                { type: 'text' as const, text: '레퍼런스 B' },
                { type: 'image' as const, data: references.b.bytes.toString('base64'), mimeType: 'image/png' },
              ]),
            ],
          }, { triggerTurn: false, deliverAs: 'followUp' });
          if (await context.ui.select('표시된 실제 이미지를 확인한 뒤 평가합니다.', ['화면을 확인했습니다', '표시되지 않아 중단']) !== '화면을 확인했습니다') return;
          const satisfactionTarget = validation === undefined ? undefined
            : reversed ? validation.candidateImage === 'a' ? 'b' : 'a' : validation.candidateImage;
          const response = await collectDeveloperInterview(context, action === 'repair', references !== undefined, satisfactionTarget);
          if (response === null) return;
          const store = openDeveloperEvaluationStore({ directory: home, projectRoot: context.cwd, namespace: 'real' });
          let role: EvaluationRole = { kind: 'development' };
          let validationAnswer: string | undefined;
          const validationQuestions: InterviewQuestion[] = [], validationAnswers: InterviewAnswer[] = [];
          if (validation !== undefined) {
            const run = readSignedNativePiRun(context.cwd, join(context.cwd, '.omd/native-pi/run.json'));
            const experiment = run.calibration?.experiment;
            if (run.designPolicy?.mode !== 'developer-evaluation'
              || run.calibration?.mode !== 'experimental' || experiment === null || experiment === undefined) {
              throw new Error('OMD_DEVELOPER_EXPERIMENT_REQUIRED');
            }
            const request = readPiRequest(context.cwd);
            if (request === undefined) throw new Error('OMD_DEVELOPER_EXPERIMENT_REQUEST_REQUIRED');
            const candidateImage = reversed ? validation.candidateImage === 'a' ? 'b' : 'a' : validation.candidateImage;
            const criteria: Array<{ id: string; outcome: 'pass' | 'fail' | 'uncertain' }> = [];
            for (const id of experiment.criteriaIds) {
              const prompt = `후보 ${candidateImage.toUpperCase()}의 사전 검증 항목: ${id}`;
              const options = [
                { id: 'pass', label: '관찰한 결과가 기준을 충족한다' },
                { id: 'fail', label: '기준을 충족하지 않는다' },
                { id: 'uncertain', label: '판단하기 어렵다' },
              ] as const;
              const selected = await context.ui.select(prompt, options.map(option => option.label));
              if (selected === undefined) return;
              const option = options.find(option => option.label === selected);
              if (option === undefined) throw new Error('OMD_DEVELOPER_ANSWER_INVALID');
              criteria.push({ id, outcome: option.id });
              validationQuestions.push({ id: `criterion:${id}`, prompt, options });
              validationAnswers.push({ questionId: `criterion:${id}`, optionIds: [option.id], text: selected });
            }
            validationAnswer = await context.ui.select('이 새 요청을 해당 보정 사례의 검증 결과로 기록할까요?', [
              '검증 성공으로 기록', '검증 실패로 기록', '판단 유보',
            ]);
            if (validationAnswer === undefined) return;
            const evidence = recordDeveloperEvaluationExperimentRun(store, {
              snapshotId: run.calibration.snapshotId,
              nativeRun: run,
              requestSha256: request.requestSha256,
              resultImageSha256s: { a: a.sha256, b: b.sha256 },
              ...(validation.projects === undefined ? {} : { resultProjects: {
                a: validation.projects[reversed ? 1 : 0], b: validation.projects[reversed ? 0 : 1],
              } }),
              capturedAt: new Date().toISOString(),
            });
            role = { kind: 'held-out', candidateRecordId: validation.recordId,
              candidateRecordSha256: experiment.sourceRecordSha256,
              experimentId: experiment.experimentId,
              experimentalSnapshotId: run.calibration.snapshotId,
              experimentRunEvidenceSha256: evidence.evidenceSha256,
              nativeRunId: run.runId,
              requestSha256: request.requestSha256,
              candidateImage,
              resultImageSha256s: { a: a.sha256, b: b.sha256 },
              criteria,
              caseDecision: validationAnswer === '검증 성공으로 기록' ? 'approve' : validationAnswer === '검증 실패로 기록' ? 'reject' : 'uncertain' };
          }
          const request = readPiRequest(context.cwd);
          const scope = currentCalibrationScope(context.cwd) ?? { route: '/', surface: 'unclassified', task: 'unbound' };
          const record = appendDeveloperEvaluation(store, {
            recordId: randomUUID(), requestId: request?.requestSha256 ?? 'unbound', taskId: scope.task,
            capturedAt: new Date().toISOString(), scope, role,
            images: { a: { path: a.path, sha256: a.sha256 }, b: { path: b.path, sha256: b.sha256 },
              ...(references === undefined ? {} : { references: {
                a: { path: references.a.path, sha256: references.a.sha256 },
                b: { path: references.b.path, sha256: references.b.sha256 },
              } }) },
            humanResponse: {
              ...response.humanResponse,
              interview: {
                questions: [...response.humanResponse.interview.questions, ...validationQuestions,
                  ...(validationAnswer === undefined ? [] : [{
                    id: 'validation-decision', prompt: '이 새 요청을 해당 보정 사례의 검증 결과로 기록할까요?',
                    options: [{ id: 'approve', label: '검증 성공으로 기록' }, { id: 'reject', label: '검증 실패로 기록' },
                      { id: 'uncertain', label: '판단 유보' }],
                  }]),
                  { id: 'image-permission', prompt: '지정 이미지의 Pi 대화 전달과 비공개 평가 기록', options: [{ id: 'allow', label: '허용' }] }],
                answers: [...response.humanResponse.interview.answers, ...validationAnswers,
                  ...(validationAnswer === undefined || role.kind !== 'held-out' ? [] : [{
                    questionId: 'validation-decision', optionIds: [role.caseDecision], text: validationAnswer,
                  }]),
                  { questionId: 'image-permission', optionIds: ['allow'], text: consent }],
              },
            },
            relations: { references: [], design: [] }, changes: { attempted: [], preserved: [] },
            modelInterpretation: { summary: '', advisory: [] },
            experiment: {
              model: context.model ? `${context.model.provider}/${context.model.id}` : 'unobserved',
              settings: { thinkingLevel: context.thinkingLevel ?? 'unobserved', generationConditions: 'unmeasured' },
              budget: { unit: 'unmeasured', limit: 0 }, criteriaVersion: policy.criteriaVersion,
            },
            reuse: { consent: response.reuse, scope },
            imageUse: {
              modelDisclosure: 'allow-current-developer-session',
              retention: 'allow-private-evidence-copy',
              externalShare: 'deny',
              productAssetReuse: 'deny',
            },
          });
          await pi.sendMessage({
            customType: 'omd-developer-evaluation-record', display: false,
            content: JSON.stringify({
              schema: 'developer-evaluation-session-v1', recordId: record.recordId,
              recordSha256: record.recordSha256, scope: record.scope, humanResponse: record.humanResponse,
              images: { a: record.images.a.sha256, b: record.images.b.sha256,
                ...(record.images.references === undefined ? {} : { references: {
                  a: record.images.references.a.sha256, b: record.images.references.b.sha256,
                } }) },
              limits: [
                'These are actual private developer answers, not model interpretation or production approval.',
                'Interpret only the evaluated task/images. Preserve explicit keep/change answers and original request constraints.',
                'A requested repair uses the existing bounded maker, renderer and independent review; verify current image/source bindings before editing or restoring.',
                'Do not invent post-change satisfaction, promote a case, alter the running calibration snapshot or grant external-action authority.',
              ],
            }),
          }, { triggerTurn: false, deliverAs: 'followUp' });
          context.ui.notify(`평가 기록: ${record.recordId}\n원문 SHA-256: ${record.recordSha256}\n생성 조건과 모델 해석은 아직 미검증이며 일반 실행 기준으로 승격되지 않았습니다.`, 'info');
          return;
        }
        const store = openDeveloperEvaluationStore({ directory: home, projectRoot: context.cwd, namespace: 'real' });
        const now = new Date().toISOString();
        if (action === 'export') {
          context.ui.notify(JSON.stringify(readDeveloperEvaluationInput(store, payload), null, 2), 'info');
        } else if (action === 'revise') {
          const record = parseDeveloperEvaluationInput(JSON.parse(readFileSync(resolve(context.cwd, payload), 'utf8')));
          const result = reviseDeveloperEvaluation(store, { record, reason: 'Explicit developer host revision', revisedAt: now });
          context.ui.notify(`수정 기록: ${result.recordId} / ${result.recordSha256}`, 'info');
        } else if (action === 'revoke') {
          revokeDeveloperEvaluation(store, { recordId: payload, reason: 'Explicit developer host revocation', revokedAt: now });
          context.ui.notify(`취소 기록: ${payload}. 기존 실행의 고정 기준은 바뀌지 않습니다.`, 'info');
        } else if (action === 'experiment') {
          const plan: unknown = JSON.parse(readFileSync(resolve(context.cwd, payload), 'utf8'));
          if (typeof plan !== 'object' || plan === null || Array.isArray(plan)
            || Object.keys(plan).sort().join(',') !== 'criteriaIds,heldOutRequests,recordId') throw new Error(usage);
          const recordId: unknown = Reflect.get(plan, 'recordId');
          const requests: unknown = Reflect.get(plan, 'heldOutRequests');
          const criteria: unknown = Reflect.get(plan, 'criteriaIds');
          if (typeof recordId !== 'string' || !Array.isArray(requests)
            || !requests.every((request): request is string => typeof request === 'string' && request.trim().length > 0)
            || !Array.isArray(criteria) || !criteria.every((id): id is string => typeof id === 'string')) throw new Error(usage);
          const result = createDeveloperEvaluationExperiment(store, {
            recordId, plannedHeldOutRequestSha256s: requests.map(request => hash(request)),
            criteriaIds: criteria, pinIdentity: hash(randomUUID()), pinnedAt: now,
            runtimeSourceSha256: nativePiRuntimeSha256(fileURLToPath(new URL('..', import.meta.url))),
          });
          context.ui.notify(`실험 스냅샷: ${result.snapshotId}\n명시적 개발자 모드에서만 OMD_EVALUATION_SNAPSHOT으로 사용할 수 있습니다.`, 'info');
        } else if (action === 'promote') {
          const [recordId, ...heldOutRecordIds] = payload.split(/\s+/);
          if (!recordId) throw new Error(usage);
          const result = promoteDeveloperEvaluationCase(store, { recordId, heldOutRecordIds, promotedAt: now });
          context.ui.notify(`검증 사례: ${result.caseId}`, 'info');
        } else {
          const snapshot = pinDeveloperEvaluationSnapshot(store, {
            pinIdentity: hash(randomUUID()), caseIds: payload ? payload.split(/\s+/) : [], pinnedAt: now,
          });
          context.ui.notify(`새 실행에 적용: OMD_EVALUATION_SNAPSHOT=${snapshot.digest}\n기존 실행에는 소급 적용되지 않습니다.`, 'info');
        }
      } catch (error) {
        context.ui.notify(error instanceof Error ? error.message : String(error), 'error');
      }
    },
  });
}
