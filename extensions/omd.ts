import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';
import { classifyPiWrite, hasPiRoute, isPreproductionReadCommand } from './omd-guard.ts';
import { classificationAllowsInputRepair, isRouteValidationSuccess, routeInputFailure, routeValidationArgs, type RouteBootstrap } from './omd-route-bootstrap.ts';

export const OMD_TOOL_NAME = 'omd_cli';
export const OMD_COMMAND_NAME = 'omd';

const MAX_OUTPUT_CHARS = 50_000;
const OMD_ENTRY = fileURLToPath(new URL('../bin/omd.mjs', import.meta.url));

type ExecResult = Readonly<{
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
}>;

type ExecOptions = Readonly<{
  cwd: string;
  signal?: AbortSignal;
}>;

type PortablePiContext = Readonly<{ cwd: string; signal?: AbortSignal }>;

export type PortablePiEvent = {
  prompt?: string; systemPrompt?: string; toolName?: string; input?: Record<string, unknown>; source?: string;
  message?: { role: string; content?: Array<{ type: string; text?: string; [key: string]: unknown }>; stopReason?: string; [key: string]: unknown };
};
export type PortablePiHook = (event: PortablePiEvent, context: PortablePiContext) => Promise<unknown>;

type PortablePiCommandContext = PortablePiContext & Readonly<{
  ui: {
    notify(message: string, level?: 'info' | 'warning' | 'error'): void;
  };
}>;

export type PortablePiTool = Readonly<{
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  parameters: unknown;
  execute(
    toolCallId: string,
    params: { args: string[] },
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    context: PortablePiContext,
  ): Promise<{
    content: Array<{ type: 'text'; text: string }>;
    details: { code: number; killed: boolean };
  }>;
}>;

export type PortablePiCommand = Readonly<{
  description: string;
  handler(args: string, context: PortablePiCommandContext): Promise<void>;
}>;

export type PortablePiApi = Readonly<{
  registerTool(definition: PortablePiTool): void;
  registerCommand(name: string, definition: PortablePiCommand): void;
  exec(command: string, args: readonly string[], options: ExecOptions): Promise<ExecResult>;
  on?(event: 'before_agent_start' | 'tool_call' | 'message_end' | 'session_start' | 'input', handler: PortablePiHook): void;
  sendMessage?(message: { customType: string; content: string; display: boolean }, options: { triggerTurn: boolean; deliverAs: 'followUp' }): void;
}>;

function boundedOutput(result: ExecResult): string {
  const combined = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n');
  if (combined.length <= MAX_OUTPUT_CHARS) return combined;
  return `${combined.slice(0, MAX_OUTPUT_CHARS)}\n[OMD output truncated]`;
}

function guardFailure(error: unknown): { summary: string; repairable: boolean } {
  const raw = error instanceof Error ? error.message : String(error);
  const payload = raw.replace(/^OMD_CLI_FAILED \([^)]*\):\s*/, '');
  try {
    const parsed = JSON.parse(payload) as { blockers?: unknown };
    if (Array.isArray(parsed.blockers) && parsed.blockers.length && parsed.blockers.every(b => typeof b === 'string')) {
      const blockers = parsed.blockers as string[];
      return { summary: blockers.slice(0, 12).map(b => `- ${b}`).join('\n')
        + (blockers.length > 12 ? `\n(+${blockers.length - 12}; omd guard production --json)` : ''),
      repairable: !blockers.some(b => /^(?:route:|unconfirmed planning:)|authority|outside the current route|production is not selected|forbids application/i.test(b)) };
    }
  } catch { /* A terminal authority/validation error is ordinary text, not a readiness report. */ }
  return { summary: raw.slice(0, 12000), repairable: /SLOP_REVIEW_REQUIRED:|REFERENCE_APPLICATION_REVIEW:/.test(raw) };
}

async function runOmd(
  pi: PortablePiApi,
  args: readonly string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<{ text: string; details: { code: number; killed: boolean } }> {
  const result = await pi.exec('node', [OMD_ENTRY, ...args], signal === undefined ? { cwd } : { cwd, signal });
  const text = boundedOutput(result);
  if (result.code !== 0 || result.killed) {
    throw new Error(`OMD_CLI_FAILED (${result.code}): ${text || 'no output'}`);
  }
  return {
    text: text || 'OMD completed successfully.',
    details: { code: result.code, killed: result.killed },
  };
}

export default function omdExtension(pi: PortablePiApi): void {
  const queues = new Map<string, Promise<unknown>>();
  const managed = new Set<string>();
  const touched = new Set<string>();
  const productionAttempted = new Set<string>();
  const repairs = new Map<string, number>();
  const authoredInputs = new Map<string, Set<string>>();
  const bootstraps = new Map<string, RouteBootstrap>();
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
    pi.on!('session_start', async () => { managed.clear(); touched.clear(); productionAttempted.clear(); repairs.clear(); authoredInputs.clear(); bootstraps.clear(); });
    pi.on!('input', async (event, context) => {
      if (event.source === 'interactive' || event.source === 'rpc') {
        repairs.delete(context.cwd);
        touched.delete(context.cwd);
        productionAttempted.delete(context.cwd);
        authoredInputs.delete(context.cwd);
        bootstraps.delete(context.cwd);
      }
    });
    pi.on!('before_agent_start', async (event, context) => {
      if (/omd-ultradesign|skill:omd-/i.test(event.prompt ?? '')) managed.add(context.cwd);
      if (!guarded(context.cwd)) return;
      return { systemPrompt: `${event.systemPrompt ?? ''}\nOMD host gates are active: declaration → procedure → automatic refusal (protocol/three-layer-enforcement.md). Use omd_cli for OMD commands. Before initial publication use the task-appropriate route starter and route validate --json; repair the grouped input diagnostics, then classify and stage resume. Do not use guard completion to diagnose an unclassified route. The coordinator inspects each selected stage brief, delivers contracts, then runs brief <stage> --check --json before its owner starts. Plain brief inspection is not permission. Before application writes run guard production; repair each selected-stage blocker, never replace CLI-owned records or relabel product UX to skip checks. Use read and standalone inventory commands during research. After classification, run guard completion before a completion report. Build/captures alone are not completion; report blocked/partial work accurately. Research/document authoring remains available.` };
    });
    pi.on!('tool_call', async (event, context) => {
      if (event.toolName === OMD_TOOL_NAME) {
        const args = event.input?.args;
        if (Array.isArray(args) && args[0] === 'route' && args[1] === 'classify') managed.add(context.cwd);
        if (guarded(context.cwd) && Array.isArray(args) && /^(?:frame|domain|route|ref|copy|type|composition|slop|lifecycle|finalize)$/.test(String(args[0]))
          && !/^(?:show|check|validate|list|handoff|discover-plan|research-check|apply-plan|apply-check|apply-review-plan|apply-review-check|review-check)$/.test(String(args[1]))) touched.add(context.cwd);
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
          if (classification.path.startsWith('.omd/.cache/')) {
            const paths = authoredInputs.get(context.cwd) ?? new Set<string>();
            paths.add(classification.path);
            authoredInputs.set(context.cwd, paths);
          }
          return;
        }
        productionAttempted.add(context.cwd);
        target = classification.path;
      }
      try {
        await run(['guard', 'production', ...(target === undefined ? [] : ['--path', target]), '--json'], context.cwd, context.signal);
      } catch (error) {
        return { block: true, reason: `OMD_PRODUCTION_BLOCKED: ${error instanceof Error ? error.message : String(error)}\nRepair the named design inputs through omd_cli; use read for inspection. Do not bypass with bash, scripts, or a different file tool.` };
      }
    });
    pi.on!('message_end', async (event, context) => {
      const message = event.message;
      if (!touched.has(context.cwd) || message?.role !== 'assistant' || message.stopReason !== 'stop'
        || message.content?.some(part => part.type === 'toolCall')) return;
      if (context.signal?.aborted) return;
      const bootstrap = bootstraps.get(context.cwd);
      if (bootstrap !== undefined && !hasPiRoute(context.cwd)) {
        // Diagnose the current bytes, never a cached failure or the misleading completion symptom.
        let summary: string;
        let repairable = false;
        let inputValid = false;
        try {
          const validation = await run(bootstrap.validationArgs, context.cwd, context.signal);
          inputValid = isRouteValidationSuccess(validation.text);
          repairable = inputValid && bootstrap.classificationAttempted && classificationAllowsInputRepair(bootstrap.classificationFailure);
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
        if (context.signal?.aborted) return;
        const retry = repairable && (repairs.get(context.cwd) ?? 0) < 2 && 'sendMessage' in pi && typeof pi.sendMessage === 'function';
        if (retry) {
          repairs.set(context.cwd, (repairs.get(context.cwd) ?? 0) + 1);
          pi.sendMessage!({ customType: 'omd-route-repair', display: true,
            content: `OMD route-input repair pass ${repairs.get(context.cwd)}/2. Repair the named fields together in the already-authored input ${JSON.stringify(bootstrap.inputPath)} and rerun omd_cli with args ${JSON.stringify(bootstrap.validationArgs)}. This is input repair, not application implementation or completed research. Preserve the original user request, facts, delivery mode, risk, scope and required stages. Do not invent evidence, authority or an optional skip to bypass a check. Stop for a missing user fact/authority or user pause. ${bootstrap.classificationAttempted
              ? 'Classification was already attempted in this task: after validation passes, retry that authorized classification with the same input/context, then stage resume and continue only the original user-authorized workflow.'
              : 'Classification has not been attempted: this repair authorizes input editing and validation only; do not publish a route or start downstream work from this follow-up.'}\n${summary}` },
          { triggerTurn: true, deliverAs: 'followUp' });
        }
        const korean = message.content?.some(part => part.type === 'text' && /[가-힣]/.test(part.text ?? ''));
        const status = inputValid
          ? korean ? `OMD 실행 계획 입력 검증은 통과했지만 라우트는 아직 등록되지 않았습니다.${retry ? ' 이미 요청한 등록 단계를 다시 시도합니다.' : ' 입력 검증은 후속 설계·개발의 완료를 의미하지 않습니다.'}`
            : `OMD route input validation passed, but no route was published.${retry ? ' Retrying the already-requested classification.' : ' Input validity is not downstream design or application completion.'}`
          : korean ? `OMD 실행 계획 단계에서 중단되었습니다. 라우트가 등록되지 않아 후속 단계 진입·완료를 확인할 수 없습니다.${retry ? ' 아래 입력 오류를 묶어서 수정·재검증합니다.' : ' 아래 검증·등록 상태를 확인해야 합니다. 완료 검사를 반복해도 실행 계획 문제는 해결되지 않습니다.'}`
            : `OMD stopped at route setup; no route was published, so downstream entry/completion is not established.${retry ? ' Repairing and revalidating the input errors together.' : ' Resolve the validation/publication status below; rerunning completion cannot repair route setup.'}`;
        return { message: { ...message, content: [
          ...(message.content ?? []).filter(part => part.type !== 'text'),
          { type: 'text', text: `${status}\n\n${summary}` },
        ] } };
      }
      try {
        await run(['guard', 'completion', '--json'], context.cwd, context.signal);
      } catch (error) {
        // Keep non-text provider fields intact, but do not publish a draft's unverified success
        // claim. Repairable evidence gaps get a bounded custom follow-up, never a fake user.
        // Authority failures are not auto-retried or manufactured.
        if (context.signal?.aborted) return;
        const failure = guardFailure(error);
        // A research/document-only or diagnostic turn does not authorize implementing the
        // remainder of a persisted route. Automatic repair belongs to this turn's source work.
        const retry = productionAttempted.has(context.cwd) && failure.repairable && (repairs.get(context.cwd) ?? 0) < 2
          && 'sendMessage' in pi && typeof pi.sendMessage === 'function';
        if (retry) {
          repairs.set(context.cwd, (repairs.get(context.cwd) ?? 0) + 1);
          pi.sendMessage!({ customType: 'omd-gate-repair', display: true,
            content: `OMD repair pass ${repairs.get(context.cwd)}/2: terminal validation failed. Continue the existing user-authorized task by repairing the named selected-stage inputs or rendered review loop, then rerun guard completion. Read the applicable brief/contracts; do not forge evidence, alter the route to remove requirements, or claim independent review. Stop if a user fact/authority is missing or the user pauses.\n${failure.summary}` },
          { triggerTurn: true, deliverAs: 'followUp' });
        }
        const korean = message.content?.some(part => part.type === 'text' && /[가-힣]/.test(part.text ?? ''));
        const status = korean
          ? `OMD 작업은 미완료입니다. 완료 검증을 통과하지 못해 최종 완료 보고를 보류했습니다.${retry ? ' 누락된 작업의 수정·재검사를 이어갑니다.' : ' 누락·오래된 산출물 또는 권한 문제를 해결한 뒤 guard completion을 다시 실행해야 합니다.'}`
          : `OMD is incomplete. The final completion claim was withheld because validation failed.${retry ? ' Continuing a bounded repair/recheck pass.' : ' Resolve the missing/stale evidence or authority, then rerun guard completion.'}`;
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
        productionAttempted.add(context.cwd);
        await run(['guard', 'production', '--json'], context.cwd, signal);
      }
      let result: Awaited<ReturnType<typeof run>>;
      try {
        result = await run(params.args, context.cwd, signal);
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

  pi.registerCommand(OMD_COMMAND_NAME, {
    description: 'Check this project with Oh My Design',
    async handler(args, context) {
      if (args.trim() !== '') {
        context.ui.notify('Usage: /omd', 'warning');
        return;
      }
      try {
        const result = await run(['doctor'], context.cwd);
        context.ui.notify(`${result.text}${hooksAvailable ? '' : '\nOMD_HOST_GUARD_UNAVAILABLE: this host exposes no event hooks; only explicit CLI checks are available.'}`, hooksAvailable ? 'info' : 'warning');
      } catch (error) {
        context.ui.notify(error instanceof Error ? error.message : String(error), 'error');
      }
    },
  });
}
