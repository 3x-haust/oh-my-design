import { createHash, randomInt, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import type { DesignExecutionPolicy } from '../core/config/design-execution.ts';
import { currentCalibrationScope } from '../core/coach/developer-calibration.ts';
import {
  appendDeveloperEvaluation, openDeveloperEvaluationStore, parseDeveloperEvaluationInput,
  pinDeveloperEvaluationSnapshot, promoteDeveloperEvaluationCase, revokeDeveloperEvaluation,
  reviseDeveloperEvaluation, readDeveloperEvaluationInput,
} from '../core/coach/developer-evaluation-store.ts';
import { readPiRequest } from './omd-request-source.ts';
import { collectDeveloperInterview } from './omd-developer-interview.ts';
import type { PortablePiApi } from './omd-runtime.ts';
import type { EvaluationRole } from '../core/coach/developer-evaluation-contract.ts';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const usage = '사용법: /omd-evaluate compare ["A.png","B.png"] | repair ["before.png","after.png"] | validate {"images":["control.png","calibrated.png"],"recordId":"기준 기록 ID","candidateImage":"b"} | export <기록 ID> | revise <입력 JSON 경로> | revoke <기록 ID> | promote <기록 ID> <새 요청 평가 ID 두 개 이상> | pin <사례 ID...>';

export function registerDeveloperEvaluation(pi: PortablePiApi, policy: DesignExecutionPolicy, home: string): void {
  if (policy.mode !== 'developer-evaluation') return;
  pi.registerCommand('omd-evaluate', {
    description: 'Compare existing OMD renders and manage private developer calibration',
    async handler(args, context) {
      const separator = args.indexOf(' ');
      const action = separator < 0 ? args.trim() : args.slice(0, separator);
      const payload = separator < 0 ? '' : args.slice(separator + 1).trim();
      if (!['compare', 'repair', 'validate', 'export', 'revise', 'revoke', 'promote', 'pin'].includes(action)) {
        context.ui.notify(usage, 'info');
        return;
      }
      try {
        if (action === 'compare' || action === 'repair' || action === 'validate') {
          if (!context.ui.select || !pi.sendMessage) throw new Error('OMD_DEVELOPER_UI_REQUIRED');
          const consent = await context.ui.select(
            '지정한 두 이미지를 현재 Pi 대화에 표시·전달하고 평가를 비공개 로컬 저장소에 기록합니다.',
            ['허용', '취소'],
          );
          if (consent !== '허용') return;
          const supplied: unknown = JSON.parse(payload);
          let validation: { recordId: string; candidateImage: 'a' | 'b' } | undefined;
          if (action === 'validate') {
            if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)
              || Object.keys(supplied).sort().join(',') !== 'candidateImage,images,recordId') throw new Error(usage);
            const recordId: unknown = Reflect.get(supplied, 'recordId');
            const candidateImage: unknown = Reflect.get(supplied, 'candidateImage');
            if (typeof recordId !== 'string' || !recordId || (candidateImage !== 'a' && candidateImage !== 'b')) throw new Error(usage);
            validation = { recordId, candidateImage };
          }
          const paths: unknown = validation === undefined ? supplied : Reflect.get(Object(supplied), 'images');
          if (!Array.isArray(paths) || paths.length !== 2
            || !paths.every((path): path is string => typeof path === 'string' && path.length > 0)) {
            throw new Error('OMD_DEVELOPER_IMAGES_REQUIRED: compare expects a JSON array of two PNG paths');
          }
          const reversed = action !== 'repair' && randomInt(2) === 1;
          const images = (reversed ? [...paths].reverse() : paths).map(path => {
            const absolute = resolve(context.cwd, path);
            const stat = lstatSync(absolute);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) {
              throw new Error('OMD_DEVELOPER_IMAGE_INVALID');
            }
            const bytes = readFileSync(absolute);
            if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
              throw new Error('OMD_DEVELOPER_IMAGE_INVALID');
            }
            PNG.sync.read(bytes);
            return { path: absolute, sha256: hash(bytes), bytes };
          });
          const a = images[0], b = images[1];
          if (a === undefined || b === undefined) throw new Error('OMD_DEVELOPER_IMAGES_REQUIRED');
          await pi.sendMessage({
            customType: 'omd-developer-comparison', display: true,
            content: [
              { type: 'text', text: 'A' }, { type: 'image', data: a.bytes.toString('base64'), mimeType: 'image/png' },
              { type: 'text', text: 'B' }, { type: 'image', data: b.bytes.toString('base64'), mimeType: 'image/png' },
            ],
          }, { triggerTurn: false, deliverAs: 'followUp' });
          if (await context.ui.select('두 실제 이미지를 확인한 뒤 평가합니다.', ['화면을 확인했습니다', '표시되지 않아 중단']) !== '화면을 확인했습니다') return;
          const response = await collectDeveloperInterview(context, action === 'repair');
          if (response === null) return;
          let role: EvaluationRole = { kind: 'development' };
          let validationAnswer: string | undefined;
          if (validation !== undefined) {
            validationAnswer = await context.ui.select('이 새 요청을 해당 보정 사례의 검증 결과로 기록할까요?', [
              '검증 성공으로 기록', '검증 실패로 기록', '판단 유보',
            ]);
            role = { kind: 'held-out', candidateRecordId: validation.recordId,
              candidateImage: reversed ? validation.candidateImage === 'a' ? 'b' : 'a' : validation.candidateImage,
              caseDecision: validationAnswer === '검증 성공으로 기록' ? 'approve' : validationAnswer === '검증 실패로 기록' ? 'reject' : 'uncertain' };
          }
          const request = readPiRequest(context.cwd);
          const scope = currentCalibrationScope(context.cwd) ?? { route: '/', surface: 'unclassified', task: 'unbound' };
          const store = openDeveloperEvaluationStore({ directory: home, projectRoot: context.cwd, namespace: 'real' });
          const record = appendDeveloperEvaluation(store, {
            recordId: randomUUID(), requestId: request?.requestSha256 ?? 'unbound', taskId: scope.task,
            capturedAt: new Date().toISOString(), scope, role,
            images: { a: { path: a.path, sha256: a.sha256 }, b: { path: b.path, sha256: b.sha256 } },
            humanResponse: {
              ...response.humanResponse,
              interview: {
                questions: [...response.humanResponse.interview.questions,
                  ...(validationAnswer === undefined ? [] : [{
                    id: 'validation-decision', prompt: '이 새 요청을 해당 보정 사례의 검증 결과로 기록할까요?',
                    options: [{ id: 'approve', label: '검증 성공으로 기록' }, { id: 'reject', label: '검증 실패로 기록' },
                      { id: 'uncertain', label: '판단 유보' }],
                  }]),
                  { id: 'image-permission', prompt: '지정 이미지의 Pi 대화 전달과 비공개 평가 기록', options: [{ id: 'allow', label: '허용' }] }],
                answers: [...response.humanResponse.interview.answers,
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
          });
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
        } else if (action === 'promote') {
          const [recordId, ...heldOutRecordIds] = payload.split(/\s+/);
          if (!recordId) throw new Error(usage);
          const result = promoteDeveloperEvaluationCase(store, { recordId, heldOutRecordIds, promotedAt: now });
          context.ui.notify(`검증 사례: ${result.caseId}`, 'info');
        } else {
          const snapshot = pinDeveloperEvaluationSnapshot(store, {
            requestRunId: randomUUID(), caseIds: payload ? payload.split(/\s+/) : [], pinnedAt: now,
          });
          context.ui.notify(`새 실행에 적용: OMD_EVALUATION_SNAPSHOT=${snapshot.digest}\n기존 실행에는 소급 적용되지 않습니다.`, 'info');
        }
      } catch (error) {
        context.ui.notify(error instanceof Error ? error.message : String(error), 'error');
      }
    },
  });
}
