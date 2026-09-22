import { resumeRouteInput } from './omd-bootstrap-repair.ts';
import type { RepairLoop } from './omd-repair-progress.ts';
import type { RouteBootstrap } from './omd-route-bootstrap.ts';
import { guardFailure, type OmdRunResult, type PortablePiApi, type PortablePiEvent } from './omd-runtime.ts';

type StagePlanning = Readonly<{ field: string; text: string }>;
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
}>;

const stringList = (value: unknown): readonly string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string') : [];

function planningList(value: unknown): readonly StagePlanning[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (typeof item !== 'object' || item === null) return [];
    const field = Reflect.get(item, 'field');
    const text = Reflect.get(item, 'text');
    return typeof field === 'string' && typeof text === 'string' ? [{ field, text }] : [];
  });
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
  const instruction = Reflect.get(value, 'instruction');
  return {
    stage,
    owner: typeof owner === 'string' ? owner : `${stage} owner`,
    action: typeof action === 'string' ? action : 'repair-output',
    next: typeof next === 'string' ? next : `omd brief ${stage} --check --json`,
    instruction: typeof instruction === 'string' ? instruction : 'Perform the owned work, then recompute stage next.',
    problems: stringList(Reflect.get(value, 'problems')),
    entryBlockers: stringList(Reflect.get(value, 'entryBlockers')),
    planning: planningList(Reflect.get(value, 'planning')),
    routeSha256: typeof routeSha256 === 'string' && /^[a-f0-9]{64}$/.test(routeSha256) ? routeSha256 : null,
    validatedStages,
  };
}

function actionPacket(work: StageWorkPointer): string {
  const issues = [...work.problems, ...work.entryBlockers];
  return [
    `Owner: ${work.owner}`,
    `Required action: ${work.action}`,
    `Start/check: ${work.next}`,
    `Procedure: ${work.instruction}`,
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
      const work = parseStageWork(result.text);
      if (work !== null) {
        const askingForPlanning = work.action === 'resolve-planning-evidence' && work.planning.length > 0
          && message.content?.some(part => part.type === 'text'
            && /[?？]|확인.*(?:필요|부탁)|알려.*(?:주세요|주실)|(?:please|could|can).*(?:confirm|clarify)/i.test(part.text ?? ''));
        const decision = work.routeSha256 === null
          ? { retry: false, pass: 0, stalled: true }
          : repairLoop.next(cwd, 'stage', work.routeSha256, {
            stage: work.stage, action: work.action, problems: work.problems,
            entryBlockers: work.entryBlockers, next: work.next, validatedStages: work.validatedStages,
          }, revision);
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
          ? `OMD는 ${work.stage} 단계가 아직 미완료입니다. ${retry ? `이제 ${work.owner}가 ${work.action} 작업을 수행하고 ${work.next}로 검증합니다.` : questions ? '아래 기획 내용의 사용자 근거 확인이 필요합니다.' : decision.stalled ? '같은 상태에서 검사만 반복되어 루프를 멈췄습니다.' : '현재 단계 입력을 해결해야 합니다.'}`
          : `OMD is incomplete at ${work.stage}. ${retry ? `Next, ${work.owner} performs ${work.action}, then validates with ${work.next}.` : questions ? 'User evidence is required for the planning statements below.' : decision.stalled ? 'Checks repeated without owned-artifact progress, so the loop stopped.' : 'Resolve the current stage inputs.'}`;
        return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
          { type: 'text', text: `${status}\n\n${questions || packet}` }] } };
      }
    } catch (error) {
      if (interrupted()) return;
      return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
        { type: 'text', text: `OMD stage diagnosis failed; completion is unverified.\n${error instanceof Error ? error.message : String(error)}` }] } };
    }
  }
  try {
    await run(['guard', 'completion', '--json'], cwd, signal);
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
