import { Type } from 'typebox';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runOmd, guardFailure, registerDoctorCommand, type PortablePiApi } from './omd-runtime.ts';
export { OMD_COMMAND_NAME } from './omd-runtime.ts';
export type { PortablePiApi, PortablePiCommand, PortablePiEvent, PortablePiHook, PortablePiTool } from './omd-runtime.ts';
import { classifyPiWrite, hasPiRoute, isPreproductionReadCommand } from './omd-guard.ts';
import { routeValidationArgs, type RouteBootstrap } from './omd-route-bootstrap.ts';
import { resumeRouteInput } from './omd-bootstrap-repair.ts';
import { RepairLoop } from './omd-repair-progress.ts';
import { StageWork, checkNativeStageEntry, nativeEntryStage, nativeOwnedStage } from './omd-stage-work.ts';

export const OMD_TOOL_NAME = 'omd_cli';

export default function omdExtension(pi: PortablePiApi): void {
  const queues = new Map<string, Promise<unknown>>();
  const managed = new Set<string>();
  const touched = new Set<string>();
  const productionAttempted = new Set<string>();
  const repairLoop = new RepairLoop();
  const revisions = new Map<string, number>();
  const pendingMutations = new Map<string, Map<string, { path: string; before: string; production: boolean }>>();
  const revision = (cwd: string) => revisions.get(cwd) ?? 0;
  const bumpRevision = (cwd: string) => revisions.set(cwd, revision(cwd) + 1);
  const fileRevision = (cwd: string, path: string): string => {
    try { return createHash('sha256').update(readFileSync(resolve(cwd, path))).digest('hex'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
      return 'unreadable';
    }
  };
  const mutationKey = (toolName: unknown, toolCallId: string | undefined, path: unknown) => toolCallId
    ?? (typeof toolName === 'string' && typeof path === 'string' ? `${toolName}:${path}` : undefined);
  const rememberMutation = (cwd: string, toolName: unknown, toolCallId: string | undefined, path: string | undefined, production = false) => {
    const key = mutationKey(toolName, toolCallId, path);
    if (key === undefined || path === undefined) return;
    const pending = pendingMutations.get(cwd) ?? new Map<string, { path: string; before: string; production: boolean }>();
    pending.set(key, { path, before: fileRevision(cwd, path), production });
    pendingMutations.set(cwd, pending);
  };
  const ownedWork = new StageWork();
  const epochs = new Map<string, symbol>();
  const epoch = (cwd: string): symbol => {
    let token = epochs.get(cwd);
    if (token === undefined) { token = Symbol(); epochs.set(cwd, token); }
    return token;
  };
  const authoredInputs = new Map<string, Set<string>>();
  const bootstraps = new Map<string, RouteBootstrap>();
  const freshRoutes = new Set<string>();
  const workflowStarted = new Set<string>();
  // Pi may execute sibling tools concurrently. Serialize OMD commands per project so two
  // legitimate publishers cannot collide with OMD's project mutation lock.
  const run = (args: readonly string[], cwd: string, signal?: AbortSignal) => {
    const previous = queues.get(cwd) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => {
      signal?.throwIfAborted();
      return runOmd(pi, args, cwd, signal);
    });
    queues.set(cwd, next);
    void next.finally(() => { if (queues.get(cwd) === next) queues.delete(cwd); }).catch(() => undefined);
    return next;
  };
  const guarded = (cwd: string) => managed.has(cwd) || hasPiRoute(cwd);
  const hooksAvailable = 'on' in pi && typeof pi.on === 'function';
  if (hooksAvailable) {
    pi.on!('session_start', async () => { epochs.clear(); repairLoop.clear(); revisions.clear(); pendingMutations.clear(); ownedWork.clear(); managed.clear(); touched.clear(); productionAttempted.clear(); authoredInputs.clear(); bootstraps.clear(); freshRoutes.clear(); workflowStarted.clear(); });
    pi.on!('input', async (event, context) => {
      if (event.source === 'interactive' || event.source === 'rpc') {
        epochs.delete(context.cwd);
        repairLoop.delete(context.cwd);
        revisions.delete(context.cwd);
        pendingMutations.delete(context.cwd);
        ownedWork.delete(context.cwd);
        touched.delete(context.cwd);
        productionAttempted.delete(context.cwd);
        authoredInputs.delete(context.cwd);
        bootstraps.delete(context.cwd);
        freshRoutes.delete(context.cwd);
        workflowStarted.delete(context.cwd);
      }
    });
    pi.on!('before_agent_start', async (event, context) => {
      ownedWork.activate(context.cwd, event.prompt ?? '');
      if (/omd-ultradesign|skill:omd-/i.test(event.prompt ?? '')) managed.add(context.cwd);
      if (!guarded(context.cwd)) return;
      return { systemPrompt: `${event.systemPrompt ?? ''}\nOMD host gates are active: declaration → procedure → automatic refusal (protocol/three-layer-enforcement.md). Use omd_cli for OMD commands. Before initial publication use the task-appropriate route starter and route validate --json; repair the grouped input diagnostics, then classify and stage next --json. The current work pointer names real missing/malformed inputs; it never certifies completion. For framing use schema frame, frame set --input, then frame check. Inspect domain check unconfirmedPlanning early; cite actual user excerpts or ask about missing facts. Do not use guard completion to diagnose an unclassified route. The coordinator inspects each selected stage brief, delivers contracts, then runs brief <stage> --check --json before its owner starts. Plain brief inspection is not permission. Before application writes run guard production; repair each selected-stage blocker, never replace CLI-owned records or relabel product UX to skip checks. Use read and standalone inventory commands during research. After completing the selected owned work and its checks, run guard completion before a completion report; do not use a terminal missing-output list as the next-stage procedure. Build/captures alone are not completion; report blocked/partial work accurately. Research/document authoring remains available.` };
    });
    pi.on!('tool_call', async (event, context) => {
      if (event.toolName === OMD_TOOL_NAME) {
        const args = event.input?.args;
        if (Array.isArray(args) && args[0] === 'route' && args[1] === 'classify') managed.add(context.cwd);
        const frameHelp = Array.isArray(args) && args[0] === 'frame' && (args[1] === 'help' || args.includes('--help') || args.includes('-h'));
        if (guarded(context.cwd) && Array.isArray(args) && !frameHelp && /^(?:frame|domain|route|ref|copy|type|composition|slop|lifecycle|finalize|complete)$/.test(String(args[0]))
          && !/^(?:show|check|validate|list|handoff|discover-plan|research-check|apply-plan|apply-check|apply-review-plan|apply-review-check|review-check|review-input)$/.test(String(args[1]))) touched.add(context.cwd);
        return;
      }
      if (!guarded(context.cwd)) return;
      const name = event.toolName;
      if (name !== 'write' && name !== 'edit' && name !== 'bash') return;
      if (name === 'bash' && isPreproductionReadCommand(event.input?.command)) return;
      touched.add(context.cwd);
      let target: string | undefined;
      if (name !== 'bash') {
        const classification = classifyPiWrite(context.cwd, event.input?.path);
        if (classification.kind === 'blocked') return { block: true, reason: `OMD_WRITE_BLOCKED: ${classification.reason} (${classification.path})` };
        if (classification.kind === 'authoring') {
          const stage = nativeEntryStage(classification.path);
          if (stage !== undefined && hasPiRoute(context.cwd)) {
            const taskEpoch = epoch(context.cwd);
            try {
              const selected = await checkNativeStageEntry(stage, args => run(args, context.cwd, context.signal));
              if (context.signal?.aborted || epochs.get(context.cwd) !== taskEpoch) return { block: true, reason: 'OMD_STAGE_ENTRY_INTERRUPTED' };
              if (selected) ownedWork.checked(context.cwd, stage); else ownedWork.unselected(context.cwd, stage);
            } catch (error) {
              return { block: true, reason: `OMD_STAGE_ENTRY_BLOCKED: ${stage}\n${error instanceof Error ? error.message : String(error)}\nRun omd stage next --json; repair and deliver this owner's upstream inputs, then rerun omd brief ${stage} --check --json before writing.` };
            }
          }
          const ownerStage = nativeOwnedStage(classification.path);
          if (ownerStage !== undefined) ownedWork.nativeStarted(context.cwd, event, ownerStage);
          if (classification.path.startsWith('.omd/.cache/')) {
            const paths = authoredInputs.get(context.cwd) ?? new Set<string>();
            paths.add(classification.path);
            authoredInputs.set(context.cwd, paths);
          }
          rememberMutation(context.cwd, event.toolName, event.toolCallId, classification.path);
          return;
        }
        target = classification.path;
      }
      try {
        await run(['guard', 'production', ...(target === undefined ? [] : ['--path', target]), '--json'], context.cwd, context.signal);
        if (name !== 'bash') rememberMutation(context.cwd, event.toolName, event.toolCallId, target, true);
      } catch (error) {
        return { block: true, reason: `OMD_PRODUCTION_BLOCKED: ${error instanceof Error ? error.message : String(error)}\nRepair the named design inputs through omd_cli; use read for inspection. Do not bypass with bash, scripts, or a different file tool.` };
      }
    });
    pi.on!('tool_result', async (event, context) => {
      if (context.signal?.aborted) return;
      ownedWork.nativeFinished(context.cwd, event);
      const key = mutationKey(event.toolName, event.toolCallId, event.input?.path);
      const mutation = key === undefined ? undefined : pendingMutations.get(context.cwd)?.get(key);
      if (key !== undefined) pendingMutations.get(context.cwd)?.delete(key);
      if (mutation && event.isError === false && mutation.before !== fileRevision(context.cwd, mutation.path)) {
        bumpRevision(context.cwd);
        if (mutation.production) productionAttempted.add(context.cwd);
      }
    });
    pi.on!('message_end', async (event, context) => {
      const message = event.message;
      if (!touched.has(context.cwd) || message?.role !== 'assistant' || message.stopReason !== 'stop'
        || message.content?.some(part => part.type === 'toolCall')) return;
      if (context.signal?.aborted) return;
      const taskEpoch = epoch(context.cwd);
      const interrupted = () => context.signal?.aborted || epochs.get(context.cwd) !== taskEpoch;
      const bootstrap = bootstraps.get(context.cwd);
      if (bootstrap !== undefined && !hasPiRoute(context.cwd)) {
        return resumeRouteInput(bootstrap, { ...context, message, run, interrupted, repairLoop, revision: revision(context.cwd), pi });
      }
      if ((workflowStarted.has(context.cwd) || ownedWork.started(context.cwd)) && hasPiRoute(context.cwd)) {
        try {
          const result = await run(['stage', 'next', '--json'], context.cwd, context.signal);
          if (interrupted()) return;
          const work = JSON.parse(result.text) as { schema?: string; stage?: unknown; owner?: unknown; action?: unknown; problems?: unknown; entryBlockers?: unknown; next?: unknown; planning?: Array<{ field: string; text: string }>; instruction?: string; progress?: { routeSha256?: unknown; validatedStages?: unknown } };
          if (work.schema === 'stage-next-v1' && typeof work.stage === 'string') {
            if (interrupted()) return;
            const askingForPlanning = work.action === 'resolve-planning-evidence' && (work.planning?.length ?? 0) > 0 && message.content?.some(part => part.type === 'text'
              && /[?？]|확인.*(?:필요|부탁)|알려.*(?:주세요|주실)|(?:please|could|can).*(?:confirm|clarify)/i.test(part.text ?? ''));
            const routeSha256 = typeof work.progress?.routeSha256 === 'string' && /^[a-f0-9]{64}$/.test(work.progress.routeSha256)
              ? work.progress.routeSha256 : null;
            const decision = routeSha256 === null
              ? { retry: false, pass: 0, stalled: true }
              : repairLoop.next(context.cwd, 'stage', routeSha256, {
                stage: work.stage, action: work.action, problems: work.problems,
                entryBlockers: work.entryBlockers, next: work.next,
                validatedStages: work.progress?.validatedStages,
              }, revision(context.cwd));
            const retry = !askingForPlanning && decision.retry && typeof pi.sendMessage === 'function';
            if (retry) {
              pi.sendMessage!({ customType: 'omd-stage-repair', display: true,
                content: `OMD selected-stage repair ${decision.pass}. Continue until this selected workflow is unblocked while each pass changes owned artifacts or advances the current work pointer; there is no fixed total retry ceiling. Work from this pointer, not from guard completion. Do the selected owner's real work and checks. On Pi without delegation use explicit sequential role passes; do not claim independent review. For planning evidence first reread the original request; attach only genuinely supported excerpts or ask one concrete missing-fact question and stop. Never fabricate research, weaken scope/gates, or start production before readiness.\n${result.text}` },
              { triggerTurn: true, deliverAs: 'followUp' });
            }
            const korean = message.content?.some(part => part.type === 'text' && /[가-힣]/.test(part.text ?? ''));
            const questions = work.action === 'resolve-planning-evidence' ? (work.planning ?? []).map(p => `- ${p.field}: ${p.text}`).join('\n') : '';
            const status = korean
              ? `OMD는 ${work.stage} 단계가 아직 미완료입니다. ${retry ? '해당 단계의 입력·근거를 수정하고 재검증하는 루프를 계속합니다.' : questions ? '아래 기획 내용의 사용자 근거가 확인되지 않았습니다. 이 내용이 요청 범위와 맞는지 확인이 필요합니다.' : decision.stalled ? '같은 작업 상태가 실제 진전 없이 반복되어 순환을 차단했습니다. 아래 소유 산출물을 실제로 변경해야 합니다.' : '아래 단계의 실제 입력 오류를 해결해야 합니다.'}`
              : `OMD is incomplete at ${work.stage}. ${retry ? 'Continuing the repair/recheck loop for the selected stage.' : questions ? 'User evidence is still missing for the planning statements below; confirmation is required.' : decision.stalled ? 'The same work state repeated without verified progress; change the owned artifact before retrying.' : 'Resolve the current stage inputs below.'}`;
            return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
              { type: 'text', text: `${status}\n\n${questions || result.text}` }] } };
          }
        } catch (error) {
          // Unknown/authority errors are not an invitation to auto-repair the route.
          if (interrupted()) return;
          return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
            { type: 'text', text: `OMD stage diagnosis failed; completion is unverified.\n${error instanceof Error ? error.message : String(error)}` }] } };
        }
      }
      try {
        await run(['guard', 'completion', '--json'], context.cwd, context.signal);
      } catch (error) {
        // Keep non-text provider fields intact, but do not publish a draft's unverified success
        // claim. Repairable evidence gaps get a bounded custom follow-up, never a fake user.
        // Authority failures are not auto-retried or manufactured.
        if (interrupted()) return;
        const failure = guardFailure(error);
        // A research/document-only or diagnostic turn does not authorize implementing the
        // remainder of a persisted route. Automatic repair belongs to this turn's source work.
        const decision = repairLoop.next(context.cwd, 'completion', fileRevision(context.cwd, '.omd/route.json'), failure.summary, revision(context.cwd));
        const retry = productionAttempted.has(context.cwd) && failure.repairable && decision.retry
          && 'sendMessage' in pi && typeof pi.sendMessage === 'function';
        if (retry) {
          pi.sendMessage!({ customType: 'omd-gate-repair', display: true,
            content: `OMD repair pass ${decision.pass}: terminal validation failed. Continue the existing user-authorized task until the gate passes while each pass changes the relevant artifact or blocker; there is no fixed total retry ceiling. Repair the named selected-stage inputs or rendered review loop, then rerun guard completion. Read the applicable brief/contracts; do not forge evidence, alter the route to remove requirements, or claim independent review. Stop only for repeated no-progress, missing user fact/authority, or user pause.\n${failure.summary}` },
          { triggerTurn: true, deliverAs: 'followUp' });
        }
        const korean = message.content?.some(part => part.type === 'text' && /[가-힣]/.test(part.text ?? ''));
        const status = korean
          ? `OMD 작업은 미완료입니다. 완료 검증을 통과하지 못해 최종 완료 보고를 보류했습니다.${retry ? ' 누락된 작업의 수정·재검사 루프를 이어갑니다.' : decision.stalled ? ' 동일 차단 상태가 실제 진전 없이 반복되어 순환을 멈췄습니다. 관련 산출물을 실제로 변경한 뒤 다시 검증해야 합니다.' : ' 누락·오래된 산출물 또는 권한 문제를 해결한 뒤 guard completion을 다시 실행해야 합니다.'}`
          : `OMD is incomplete. The final completion claim was withheld because validation failed.${retry ? ' Continuing the progress-driven repair/recheck loop.' : decision.stalled ? ' The same blocker repeated without verified progress; change the relevant artifact before rechecking.' : ' Resolve the missing/stale evidence or authority, then rerun guard completion.'}`;
        return { message: { ...message, content: [
          ...(message.content ?? []).filter(part => part.type !== 'text'),
          { type: 'text', text: `${status}\n\n${failure.summary}` },
        ] } };
      }
    });
  }
  pi.registerTool({
    name: OMD_TOOL_NAME,
    label: 'OMD CLI',
    description: 'Run the packaged Oh My Design CLI in the current project with structured arguments.',
    promptSnippet: 'Use omd_cli without external --activation. Start new product implementation with schema product-route-input; design-only with schema design-route-input; existing/bounded work with schema route-input. route validate --json groups current input errors; repair all named fields, validate, then route classify and stage resume. Do not run completion before classification or request a host activation file. Finish design-only with completion design-check.',
    parameters: Type.Object({
      args: Type.Array(Type.String(), { minItems: 1 }),
    }, { additionalProperties: false }),
    async execute(_toolCallId, params, signal, _onUpdate, context) {
      const workToken = ownedWork.token(context.cwd);
      const taskEpoch = epoch(context.cwd);
      if (!Array.isArray(params.args) || params.args.length === 0 || params.args.some((arg) => typeof arg !== 'string')) {
        throw new Error('OMD_CLI_ARGS_INVALID: args must be a non-empty string array');
      }
      if (params.args[0] === 'route' && params.args[1] === 'classify') managed.add(context.cwd);
      const candidate = routeValidationArgs(params.args);
      const previousBootstrap = bootstraps.get(context.cwd);
      let commandBootstrap: RouteBootstrap | undefined;
      if (params.args[0] === 'route' && ['validate', 'classify'].includes(params.args[1] ?? '')) bootstraps.delete(context.cwd);
      if (candidate !== undefined && guarded(context.cwd) && !hasPiRoute(context.cwd)) {
        const target = classifyPiWrite(context.cwd, candidate.inputPath);
        const classificationAttempted = params.args[1] === 'classify';
        if (target.kind === 'authoring' && target.path.startsWith('.omd/.cache/')
          && (classificationAttempted || authoredInputs.get(context.cwd)?.has(target.path))) {
          commandBootstrap = { ...candidate,
            classificationAttempted: classificationAttempted || (previousBootstrap?.inputPath === candidate.inputPath && previousBootstrap.classificationAttempted),
            ...(previousBootstrap?.inputPath === candidate.inputPath && previousBootstrap.classificationFailure !== undefined ? { classificationFailure: previousBootstrap.classificationFailure } : {}),
          };
          bootstraps.set(context.cwd, commandBootstrap);
          touched.add(context.cwd);
        }
      }
      if (guarded(context.cwd) && params.args[0] === 'recipe' && params.args[1] === 'add') {
        touched.add(context.cwd);
        await run(['guard', 'production', '--json'], context.cwd, signal);
      }
      let result: Awaited<ReturnType<typeof run>>;
      try {
        result = await run(params.args, context.cwd, signal);
        if (signal?.aborted || epochs.get(context.cwd) !== taskEpoch) return { content: [{ type: 'text', text: result.text }], details: result.details };
        if (hasPiRoute(context.cwd) && ownedWork.commandSucceeded(context.cwd, { args: params.args, token: workToken })) touched.add(context.cwd);
        if (params.args[0] === 'recipe' && params.args[1] === 'add') productionAttempted.add(context.cwd);
        if (params.args[0] === 'route' && params.args[1] === 'classify' && commandBootstrap
          && authoredInputs.get(context.cwd)?.has(classifyPiWrite(context.cwd, commandBootstrap.inputPath).path)) freshRoutes.add(context.cwd);
        if (freshRoutes.has(context.cwd) && ownedWork.token(context.cwd) !== undefined && params.args[0] === 'brief' && params.args.includes('--check')) workflowStarted.add(context.cwd);
        if (params.args[0] === 'route' && params.args[1] === 'classify' && bootstraps.get(context.cwd) === commandBootstrap) bootstraps.delete(context.cwd);
      } catch (error) {
        const bootstrap = bootstraps.get(context.cwd);
        if (bootstrap !== undefined && bootstrap === commandBootstrap && params.args[0] === 'route' && params.args[1] === 'classify') {
          bootstrap.classificationFailure = error instanceof Error ? error.message : String(error);
        }
        throw error;
      }
      return {
        content: [{ type: 'text', text: result.text }],
        details: result.details,
      };
    },
  });

  registerDoctorCommand(pi, cwd => run(['doctor'], cwd), hooksAvailable);
}
