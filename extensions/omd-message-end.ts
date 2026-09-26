import { resumeRouteInput } from './omd-bootstrap-repair.ts';
import type { RepairLoop } from './omd-repair-progress.ts';
import type { RouteBootstrap } from './omd-route-bootstrap.ts';
import { guardFailure, type OmdRunResult, type PortablePiApi, type PortablePiEvent } from './omd-runtime.ts';

type StagePlanning = Readonly<{ field: string; text: string }>;
export type ReferenceWork = Readonly<{
  status: 'action' | 'ready' | 'exhausted';
  workSha256: string;
  action: Readonly<{ kind: string; args: readonly string[]; reason: string }> | null;
  code: string | null;
  attempts: readonly Readonly<{ lane: string; url: string; reason: string; receipt: string }> [];
  exclusions: readonly Readonly<{ lane: string; url: string; reason: string; receipt: string }> [];
}>;
type StageWorkPointer = Readonly<{
  stage: string;
  owner: string;
  action: string;
  next: string;
  instruction: string;
  problems: readonly string[];
  entryBlockers: readonly string[];
  planning: readonly StagePlanning[];
  routeSha256: string | null;
  validatedStages: readonly string[];
  referenceWork: ReferenceWork | null;
  limitations: readonly string[];
}>;

type MessageEndTask = Readonly<{
  cwd: string;
  signal?: AbortSignal;
  message: NonNullable<PortablePiEvent['message']>;
  run(args: readonly string[], cwd: string, signal?: AbortSignal): Promise<OmdRunResult>;
  interrupted(): boolean;
  bootstrap?: RouteBootstrap;
  hasRoute: boolean;
  workflowStarted: boolean;
  ownedWorkStarted: boolean;
  productionAttempted: boolean;
  revision: number;
  routeRevision: string;
  repairLoop: RepairLoop;
  pi: PortablePiApi;
  onReferenceWork?(work: ReferenceWork | null): void;
}>;

const stringList = (value: unknown): readonly string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string') : [];

function limitationList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => typeof item?.stage === 'string' && typeof item?.reason === 'string'
    ? [`${item.stage}: ${item.reason}`] : []);
}

function planningList(value: unknown): readonly StagePlanning[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item !== 'object' || item === null) return [];
    const field = Reflect.get(item, 'field');
    const text = Reflect.get(item, 'text');
    return typeof field === 'string' && typeof text === 'string' ? [{ field, text }] : [];
  });
}

function referenceWork(value: unknown): ReferenceWork | null {
  if (typeof value !== 'object' || value === null) return null;
  const status = Reflect.get(value, 'status');
  const workSha256 = Reflect.get(value, 'workSha256');
  if (!['action', 'ready', 'exhausted'].includes(status) || typeof workSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(workSha256)) return null;
  const rawAction = Reflect.get(value, 'action');
  const kind = typeof rawAction === 'object' && rawAction !== null ? Reflect.get(rawAction, 'kind') : null;
  const args = typeof rawAction === 'object' && rawAction !== null ? Reflect.get(rawAction, 'args') : null;
  const reason = typeof rawAction === 'object' && rawAction !== null ? Reflect.get(rawAction, 'reason') : null;
  const action = typeof kind === 'string' && Array.isArray(args) && args.every((arg): arg is string => typeof arg === 'string')
    && typeof reason === 'string' ? { kind, args, reason } : null;
  const attempts = Reflect.get(value, 'attempts');
  const parsedAttempts = Array.isArray(attempts) ? attempts.flatMap(item => {
    if (typeof item !== 'object' || item === null) return [];
    const lane = Reflect.get(item, 'lane');
    const url = Reflect.get(item, 'url');
    const failure = Reflect.get(item, 'reason');
    const receipt = Reflect.get(item, 'receipt');
    const path = typeof receipt === 'object' && receipt !== null ? Reflect.get(receipt, 'path') : null;
    return typeof lane === 'string' && typeof url === 'string' && typeof failure === 'string' && typeof path === 'string'
      ? [{ lane, url, reason: failure, receipt: path }] : [];
  }) : [];
  const code = Reflect.get(value, 'code');
  const exclusions = Reflect.get(value, 'exclusions');
  const parsedExclusions = Array.isArray(exclusions) ? exclusions.flatMap(item => {
    if (typeof item !== 'object' || item === null) return [];
    const decision = Reflect.get(item, 'decision');
    const receipt = Reflect.get(item, 'receipt');
    if (typeof decision !== 'object' || decision === null || typeof receipt !== 'object' || receipt === null) return [];
    const lane = Reflect.get(decision, 'researchLane');
    const url = Reflect.get(decision, 'source');
    const reason = Reflect.get(decision, 'reason');
    const path = Reflect.get(receipt, 'path');
    return typeof lane === 'string' && typeof url === 'string' && typeof reason === 'string' && typeof path === 'string'
      ? [{ lane, url, reason, receipt: path }] : [];
  }) : [];
  return { status, workSha256, action, code: typeof code === 'string' ? code : null,
    attempts: parsedAttempts, exclusions: parsedExclusions };
}

function parseStageWork(text: string): StageWorkPointer | null {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Reflect.get(value, 'schema') !== 'stage-next-v1') return null;
  const stage = Reflect.get(value, 'stage');
  if (typeof stage !== 'string') return null;
  const progress = Reflect.get(value, 'progress');
  const routeSha256 = typeof progress === 'object' && progress !== null ? Reflect.get(progress, 'routeSha256') : null;
  const validatedStages = typeof progress === 'object' && progress !== null ? stringList(Reflect.get(progress, 'validatedStages')) : [];
  const owner = Reflect.get(value, 'owner');
  const action = Reflect.get(value, 'action');
  const next = Reflect.get(value, 'next');
  const observed = referenceWork(Reflect.get(value, 'referenceWork'));
  const recovering = observed?.status === 'exhausted';
  const recoveryArgs = ['ref', 'discover-batch', '--input', '.omd/.cache/reference-recovery-batch.json', '--recovery', '--json'];
  const instruction = recovering
    ? 'Read omd schema reference-discovery-batch. Author the recovery batch with new qualified sources or materially changed acquisition strategies justified by the signed failures and exclusions. Preserve both research lanes and evidence requirements; unchanged failed commands are not recovery. Publish it with the named command, inspect captured sources, then recompute stage next.'
    : Reflect.get(value, 'instruction');
  return {
    stage,
    owner: typeof owner === 'string' ? owner : `${stage} owner`,
    action: recovering ? 'replan-discovery' : typeof action === 'string' ? action : 'repair-output',
    next: recovering ? `omd ${recoveryArgs.join(' ')}` : typeof next === 'string' ? next : `omd brief ${stage} --check --json`,
    instruction: typeof instruction === 'string' ? instruction : 'Perform the owned work, then recompute stage next.',
    problems: stringList(Reflect.get(value, 'problems')),
    entryBlockers: stringList(Reflect.get(value, 'entryBlockers')),
    planning: planningList(Reflect.get(value, 'planning')),
    routeSha256: typeof routeSha256 === 'string' && /^[a-f0-9]{64}$/.test(routeSha256) ? routeSha256 : null,
    validatedStages,
    limitations: limitationList(Reflect.get(value, 'confidenceDebt')),
    referenceWork: recovering ? { ...observed, status: 'action', action: {
      kind: 'replan-discovery', args: recoveryArgs, reason: instruction,
    } } : observed,
  };
}

export function referenceWorkAdvanced(text: string, previous: ReferenceWork): boolean {
  const work = parseStageWork(text);
  return work !== null && (work.stage !== 'reference-board'
    || (work.referenceWork !== null && work.referenceWork.workSha256 !== previous.workSha256));
}

function actionPacket(work: StageWorkPointer): string {
  const issues = [...work.problems, ...work.entryBlockers];
  return [
    `Owner: ${work.owner}`,
    `Required action: ${work.action}`,
    `Start/check: ${work.next}`,
    ...(work.referenceWork?.action === null || work.referenceWork === null ? [] : [
      `Reference action: ${work.referenceWork.action.args.length > 0 ? `omd ${work.referenceWork.action.args.join(' ')}` : work.next}`,
      `Reference reason: ${work.referenceWork.action.reason}`,
    ]),
    ...(work.referenceWork?.action?.kind === 'replan-discovery' ? [
      ...(work.referenceWork.code === null ? [] : [work.referenceWork.code]),
      ...work.referenceWork.attempts.slice(-12).map(attempt => `- ${attempt.lane}: ${attempt.url}: ${attempt.reason} (${attempt.receipt})`),
      ...(work.referenceWork.attempts.length > 12 ? [`(+${work.referenceWork.attempts.length - 12} earlier attempts)`] : []),
      ...work.referenceWork.exclusions.slice(-12).map(exclusion => `- excluded ${exclusion.lane}: ${exclusion.url}: ${exclusion.reason} (${exclusion.receipt})`),
      ...(work.referenceWork.exclusions.length > 12 ? [`(+${work.referenceWork.exclusions.length - 12} earlier exclusions)`] : []),
    ] : []),
    `Procedure: ${work.instruction}`,
    ...(work.limitations.length ? ['Confidence debt (not verified):', ...work.limitations.map(item => `- ${item}`)] : []),
    ...(issues.length ? ['Current blockers:', ...issues.map(issue => `- ${issue}`)] : []),
    'Do the required action before rerunning stage next. Repeating checks without changing owned evidence is not progress.',
  ].join('\n');
}

const koreanMessage = (message: NonNullable<PortablePiEvent['message']>): boolean =>
  message.content?.some(part => part.type === 'text' && /[가-힣]/.test(part.text ?? '')) ?? false;

export async function handleOmdMessageEnd(task: MessageEndTask): Promise<unknown> {
  const { cwd, signal, message, run, interrupted, bootstrap, repairLoop, revision, pi } = task;
  if (bootstrap !== undefined && !task.hasRoute) {
    return resumeRouteInput(bootstrap, { cwd, ...(signal === undefined ? {} : { signal }), message, run, interrupted, repairLoop, revision, pi });
  }
  if ((task.workflowStarted || task.ownedWorkStarted) && task.hasRoute) {
    try {
      const result = await run(['stage', 'next', '--json'], cwd, signal);
      if (interrupted()) return;
      let work = parseStageWork(result.text);
      const nativeReferenceAction = work?.stage === 'reference-board' && work.referenceWork?.status === 'action'
        && ['search', 'direct-entry', 'follow-link'].includes(work.referenceWork.action?.kind ?? '');
      if (nativeReferenceAction && work !== null) {
        let advanceError: unknown;
        try {
          await run(['ref', 'advance', '--json'], cwd, signal);
        } catch (error) {
          if (interrupted()) return;
          advanceError = error;
        }
        if (interrupted()) return;
        const afterAdvance = await run(['stage', 'next', '--json'], cwd, signal);
        const revised = parseStageWork(afterAdvance.text);
        if (advanceError !== undefined && revised?.referenceWork?.workSha256 === work.referenceWork?.workSha256) {
          const detail = advanceError instanceof Error ? advanceError.message : String(advanceError);
          return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
            { type: 'text', text: `OMD reference acquisition failed without a changed evidence state. ${detail}\n\n${actionPacket(work)}` }] } };
        }
        work = revised;
      }
      if (work !== null) {
        task.onReferenceWork?.(work.referenceWork);
        const askingForPlanning = work.action === 'resolve-planning-evidence' && work.planning.length > 0
          && message.content?.some(part => part.type === 'text'
            && /[?？]|확인.*(?:필요|부탁)|알려.*(?:주세요|주실)|(?:please|could|can).*(?:confirm|clarify)/i.test(part.text ?? ''));
        const decision = work.routeSha256 === null
          ? { retry: false, pass: 0, stalled: true }
          : repairLoop.next(cwd, 'stage', work.routeSha256, {
            stage: work.stage, action: work.action, problems: work.problems,
            entryBlockers: work.entryBlockers, next: work.next, validatedStages: work.validatedStages,
            workSha256: work.referenceWork?.workSha256 ?? null,
          }, work.referenceWork === null ? revision : 0);
        const retry = !askingForPlanning && decision.retry && typeof pi.sendMessage === 'function';
        const packet = actionPacket(work);
        if (retry) {
          pi.sendMessage?.({ customType: 'omd-stage-repair', display: true,
            content: `OMD selected-stage repair ${decision.pass}. Start with one concise user-visible progress note. Execute the action packet before running another diagnostic check; continue while owned artifacts or the work pointer advance. Never fabricate research, weaken scope/gates, or start production before readiness.\n\n${packet}` },
          { triggerTurn: true, deliverAs: 'followUp' });
        }
        const questions = work.action === 'resolve-planning-evidence'
          ? work.planning.map(item => `- ${item.field}: ${item.text}`).join('\n') : '';
        const korean = koreanMessage(message);
        const status = korean
          ? `OMD는 ${work.stage} 단계가 아직 미완료입니다. ${retry ? `이제 ${work.owner}가 ${work.action} 작업을 수행하고 ${work.next}로 검증합니다.` : questions ? '아래 기획 내용의 사용자 근거 확인이 필요합니다.' : decision.stalled && work.referenceWork !== null ? '수집된 실제 화면을 판단하고 아래 소유 작업을 완료해야 합니다.' : decision.stalled ? '같은 상태에서 검사만 반복되어 루프를 멈췄습니다.' : '현재 단계 입력을 해결해야 합니다.'}`
          : `OMD is incomplete at ${work.stage}. ${retry ? `Next, ${work.owner} performs ${work.action}, then validates with ${work.next}.` : questions ? 'User evidence is required for the planning statements below.' : decision.stalled && work.referenceWork !== null ? 'Inspect the acquired screen and complete the owned action below.' : decision.stalled ? 'Checks repeated without owned-artifact progress, so the loop stopped.' : 'Resolve the current stage inputs.'}`;
        return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
          { type: 'text', text: `${status}\n\n${questions || packet}` }] } };
      }
      task.onReferenceWork?.(null);
    } catch (error) {
      if (interrupted()) return;
      task.onReferenceWork?.(null);
      return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
        { type: 'text', text: `OMD stage diagnosis failed; completion is unverified.\n${error instanceof Error ? error.message : String(error)}` }] } };
    }
  }
  try {
    const result = await run(['guard', 'completion', '--json'], cwd, signal);
    const limitations = result.text.trim().startsWith('{')
      ? limitationList(Reflect.get(JSON.parse(result.text), 'limitations')) : [];
    if (limitations.length) return { message: { ...message, content: [...(message.content ?? []),
      { type: 'text', text: `Limitations (not verified):\n${limitations.map(item => `- ${item}`).join('\n')}` }] } };
  } catch (error) {
    if (interrupted()) return;
    if (!(error instanceof Error)) throw error;
    const failure = guardFailure(error);
    const decision = repairLoop.next(cwd, 'completion', task.routeRevision, failure.summary, revision);
    const retry = task.productionAttempted && failure.repairable && decision.retry && typeof pi.sendMessage === 'function';
    if (retry) {
      pi.sendMessage?.({ customType: 'omd-gate-repair', display: true,
        content: `OMD repair pass ${decision.pass}: terminal validation failed. Start with one concise user-visible progress note, repair the named selected-stage inputs or rendered review loop, then rerun guard completion. Continue while the relevant artifact or blocker changes; never forge evidence, alter the route to remove requirements, or claim independent review.\n${failure.summary}` },
      { triggerTurn: true, deliverAs: 'followUp' });
    }
    const korean = koreanMessage(message);
    const status = korean
      ? `OMD 작업은 미완료입니다. guard completion 검증을 통과하지 못해 최종 완료 보고를 보류했습니다.${retry ? ' 누락된 작업의 수정·재검사 루프를 이어갑니다.' : decision.stalled ? ' 같은 차단에서 검사만 반복되어 루프를 멈췄습니다.' : ' 누락·오래된 산출물 또는 권한 문제를 해결해야 합니다.'}`
      : `OMD is incomplete. The guard completion claim was withheld.${retry ? ' Continuing the repair/recheck loop.' : decision.stalled ? ' Checks repeated without progress, so the loop stopped.' : ' Resolve the missing, stale, or unauthorized inputs.'}`;
    return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
      { type: 'text', text: `${status}\n\n${failure.summary}` }] } };
  }
}
