import { classificationAllowsInputRepair, isRouteValidationSuccess, routeInputFailure, type RouteBootstrap } from './omd-route-bootstrap.ts';
import type { PortablePiApi, PortablePiContext, PortablePiEvent } from './omd-runtime.ts';
import type { RepairLoop } from './omd-repair-progress.ts';

type BootstrapContinuation = PortablePiContext & Readonly<{
  message: NonNullable<PortablePiEvent['message']>;
  run: (args: readonly string[], cwd: string, signal?: AbortSignal) => Promise<{ text: string }>;
  interrupted: () => boolean | undefined;
  repairLoop: RepairLoop;
  revision: number;
  pi: PortablePiApi;
}>;

export async function resumeRouteInput(bootstrap: RouteBootstrap, task: BootstrapContinuation) {
  const { cwd, signal, message, run, interrupted, repairLoop, revision, pi } = task;
  // Diagnose the current bytes, never a cached failure or the misleading completion symptom.
  let summary: string;
  let repairable = false;
  let inputValid = false;
  const classificationGranted = bootstrap.classificationAttempted || bootstrap.classificationAuthorized;
  try {
    const validation = await run(bootstrap.validationArgs, cwd, signal);
    inputValid = isRouteValidationSuccess(validation.text);
    repairable = inputValid && classificationGranted && classificationAllowsInputRepair(bootstrap.classificationFailure);
    summary = inputValid
      ? `Route input is valid but not published. ${!classificationAllowsInputRepair(bootstrap.classificationFailure)
        ? `Classification is still blocked: ${bootstrap.classificationFailure}`
        : 'No successful route classification was performed; previous input errors are no longer current.'}`
      : `Route validation did not return a recognized success report.\n${validation.text}`;
  } catch (error) {
    const failure = routeInputFailure(error);
    summary = failure.summary;
    repairable = failure.repairable && classificationAllowsInputRepair(bootstrap.classificationFailure);
    if (!classificationAllowsInputRepair(bootstrap.classificationFailure)) summary += `\nClassification also failed: ${bootstrap.classificationFailure}`;
  }
  if (interrupted()) return;
  const decision = repairLoop.next(cwd, 'route-input', bootstrap.inputPath, summary, revision);
  const retry = repairable && decision.retry && 'sendMessage' in pi && typeof pi.sendMessage === 'function';
  if (retry) {
    const nextArgs = inputValid ? bootstrap.validationArgs.map((arg, index) => index === 1 ? 'classify' : arg) : bootstrap.validationArgs;
    const action = inputValid
      ? 'The current input already passed validation. Publish that same input with the same locale context, then run stage resume and continue the originally authorized workflow.'
      : `Repair the named fields together in the already-authored input ${JSON.stringify(bootstrap.inputPath)}, then validate it. Continue while the input bytes or structured diagnostics make progress; do not stop because of a fixed retry count.`;
    pi.sendMessage!({ customType: inputValid ? 'omd-route-classify' : 'omd-route-repair', display: true,
      content: `OMD route-input continuation pass ${decision.pass}. Start this turn with one concise user-visible progress note naming the current input and next command. ${action} Preserve the original user request, facts, delivery mode, risk, scope and required stages. Do not invent evidence, authority or an optional skip to bypass a check. Stop only for repeated no-progress, a missing user fact/authority, or user pause. ${bootstrap.classificationAttempted
        ? 'Classification was already attempted in this task: after validation passes, retry that authorized classification with the same input/context, then stage resume and continue only the original user-authorized workflow.'
        : bootstrap.classificationAuthorized
          ? 'The current real user input authorized the full workflow. After validation passes, classify this input and continue through stage resume; this repair does not narrow the original request to validation only.'
          : 'Classification has not been attempted: this repair authorizes input editing and validation only; do not publish a route or start downstream work from this follow-up.'}\nNext OMD command: ${JSON.stringify(nextArgs)}\n${summary}` },
    { triggerTurn: true, deliverAs: 'followUp' });
  }
  const korean = message.content?.some(part => part.type === 'text' && /[가-힣]/.test(part.text ?? ''));
  const status = inputValid
    ? korean ? `OMD 실행 계획 입력 검증은 통과했지만 라우트는 아직 등록되지 않았습니다.${retry ? ' 이미 요청한 등록 단계를 다시 시도합니다.' : ' 입력 검증은 후속 설계·개발의 완료를 의미하지 않습니다.'}`
      : `OMD route input validation passed, but no route was published.${retry ? ' Retrying the already-requested classification.' : ' Input validity is not downstream design or application completion.'}`
    : korean ? `OMD 실행 계획 단계에서 중단되었습니다. 라우트가 등록되지 않아 후속 단계 진입·완료를 확인할 수 없습니다.${retry ? ' 아래 입력 오류를 묶어서 수정·재검증합니다.' : decision.stalled ? ' 동일 입력과 오류가 반복되어 진전 없는 순환을 차단했습니다. 실제 입력을 바꾸거나 필요한 사용자 근거를 받아야 합니다.' : ' 아래 검증·등록 상태를 확인해야 합니다. 완료 검사를 반복해도 실행 계획 문제는 해결되지 않습니다.'}`
      : `OMD stopped at route setup; no route was published, so downstream entry/completion is not established.${retry ? ' Repairing and revalidating the input errors together.' : decision.stalled ? ' The same input and diagnostics repeated without progress; change the actual input or obtain the required user evidence.' : ' Resolve the validation/publication status below; rerunning completion cannot repair route setup.'}`;
  const validationCommand = `omd ${bootstrap.validationArgs.join(' ')}`;
  const progress = retry
    ? inputValid
      ? korean
        ? `이제 ${bootstrap.inputPath}의 라우트 등록을 다시 시도한 뒤 stage resume으로 다음 단계를 확인하겠습니다.`
        : `Next, I will retry route publication for ${bootstrap.inputPath}, then inspect the next stage with stage resume.`
      : korean
        ? `이제 ${bootstrap.inputPath}의 지적된 필드를 함께 수정하고 ${validationCommand}로 다시 검증하겠습니다.`
        : `Next, I will repair the named fields in ${bootstrap.inputPath} and revalidate with ${validationCommand}.`
    : '';
  return { message: { ...message, content: [
    ...(message.content ?? []).filter(part => part.type !== 'text'),
    { type: 'text', text: `${status}${progress ? `\n${progress}` : ''}\n\n${summary}` },
  ] } };
}
