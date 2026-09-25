import { Type } from 'typebox';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runOmd, monitorOmdProgress, registerDoctorCommand, structuredToolDiagnostic, OmdCancelledError, type PortablePiApi } from './omd-runtime.ts';
export { OMD_COMMAND_NAME } from './omd-runtime.ts';
export type { PortablePiApi, PortablePiCommand, PortablePiEvent, PortablePiHook, PortablePiTool } from './omd-runtime.ts';
import { classifyPiWrite, hasPiRoute, isMutatingOmdCommand, isPreproductionReadCommand } from './omd-guard.ts';
import { routeValidationArgs, type RouteBootstrap } from './omd-route-bootstrap.ts';
import { RepairLoop } from './omd-repair-progress.ts';
import { StageWork, checkNativeStageEntry, nativeEntryStage, nativeOwnedStage } from './omd-stage-work.ts';
import { handleOmdMessageEnd, referenceWorkAdvanced, type ReferenceWork } from './omd-message-end.ts';

export const OMD_TOOL_NAME = 'omd_cli';

export default function omdExtension(pi: PortablePiApi): void {
  const queues = new Map<string, Promise<unknown>>();
  const managed = new Set<string>();
  const touched = new Set<string>();
  const productionAttempted = new Set<string>();
  const repairLoop = new RepairLoop();
  const pendingReferenceWork = new Map<string, ReferenceWork>();
  const revisions = new Map<string, number>();
  type PendingMutation = { path: string; before: string; production: boolean };
  type PendingMutationGroup = { entries: PendingMutation[]; baseline: string; production: boolean; failed: boolean };
  const pendingMutations = new Map<string, Map<string, PendingMutationGroup>>();
  const revision = (cwd: string) => revisions.get(cwd) ?? 0;
  const bumpRevision = (cwd: string) => revisions.set(cwd, revision(cwd) + 1);
  const fileRevision = (cwd: string, path: string): string => {
    try { return createHash('sha256').update(readFileSync(resolve(cwd, path))).digest('hex'); }
    catch (error) {
      if (error instanceof Error && Reflect.get(error, 'code') === 'ENOENT') return 'missing';
      return 'unreadable';
    }
  };
  const mutationKey = (toolName: unknown, toolCallId: string | undefined, path: unknown) => toolCallId
    ?? (typeof toolName === 'string' && typeof path === 'string' ? `${toolName}:${path}` : undefined);
  const rememberMutation = (cwd: string, toolName: unknown, toolCallId: string | undefined, path: string | undefined, production = false) => {
    const key = mutationKey(toolName, toolCallId, path);
    if (key === undefined || path === undefined) return;
    const pending = pendingMutations.get(cwd) ?? new Map<string, PendingMutationGroup>();
    const before = fileRevision(cwd, path);
    const group = pending.get(key) ?? { entries: [], baseline: before, production: false, failed: false };
    group.entries.push({ path, before, production });
    group.production ||= production;
    pending.set(key, group);
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
  const run = (args: readonly string[], cwd: string, signal?: AbortSignal, onUpdate?: Parameters<typeof runOmd>[4]) => {
    const queued = queues.get(cwd);
    const stopWaiting = queued === undefined ? () => undefined : monitorOmdProgress(args, 'queued', signal, onUpdate);
    const previous = queued ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => {
      stopWaiting();
      if (signal?.aborted) throw new OmdCancelledError();
      return runOmd(pi, args, cwd, signal, onUpdate);
    });
    queues.set(cwd, next);
    void next.finally(() => { if (queues.get(cwd) === next) queues.delete(cwd); }).catch(() => undefined);
    if (queued === undefined || signal === undefined) return next;
    if (signal.aborted) {
      stopWaiting();
      return Promise.reject(new OmdCancelledError());
    }
    let onAbort: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => { stopWaiting(); reject(new OmdCancelledError()); };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return Promise.race([next, cancelled]).finally(() => {
      if (onAbort !== undefined) signal.removeEventListener('abort', onAbort);
    });
  };
  const guarded = (cwd: string) => managed.has(cwd) || hasPiRoute(cwd);
  const hook = 'on' in pi ? pi.on : undefined;
  const on = typeof hook === 'function' ? hook.bind(pi) : undefined;
  const hooksAvailable = on !== undefined;
  if (on !== undefined) {
    on('session_start', async () => { epochs.clear(); repairLoop.clear(); pendingReferenceWork.clear(); revisions.clear(); pendingMutations.clear(); ownedWork.clear(); managed.clear(); touched.clear(); productionAttempted.clear(); authoredInputs.clear(); bootstraps.clear(); freshRoutes.clear(); workflowStarted.clear(); });
    on('input', async (event, context) => {
      if (event.source === 'interactive' || event.source === 'rpc') {
        epochs.delete(context.cwd);
        repairLoop.delete(context.cwd);
        pendingReferenceWork.delete(context.cwd);
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
    on('before_agent_start', async (event, context) => {
      ownedWork.activate(context.cwd, event.prompt ?? '');
      if (/omd-ultradesign|skill:omd-/i.test(event.prompt ?? '')) managed.add(context.cwd);
      if (!guarded(context.cwd)) return;
      return { systemPrompt: `${event.systemPrompt ?? ''}\nOMD host gates are active: declaration → procedure → automatic refusal (protocol/three-layer-enforcement.md). Use omd_cli for OMD commands. Before initial publication use the task-appropriate route starter and route validate --json; repair the grouped input diagnostics, then classify and stage next --json. The current work pointer names real missing/malformed inputs; it never certifies completion. For framing use schema frame, frame set --input, then frame check. Inspect domain check unconfirmedPlanning early; cite actual user excerpts or ask about missing facts. Do not use guard completion to diagnose an unclassified route. The coordinator inspects each selected stage brief, delivers contracts, then runs brief <stage> --check --json before its owner starts. Plain brief inspection is not permission. Before application writes run guard production; repair each selected-stage blocker, never replace CLI-owned records or relabel product UX to skip checks. Use read and standalone inventory commands during research. After completing the selected owned work and its checks, run guard completion before a completion report; do not use a terminal missing-output list as the next-stage procedure. Build/captures alone are not completion; report blocked/partial work accurately. At each meaningful phase boundary and before an automatic repair continuation, give the user one concise visible progress note: what was just verified, what owner/action runs next, and which check will follow. Do not narrate every tool call or expose hidden reasoning. Research/document authoring remains available.` };
    });
    on('tool_call', async (event, context) => {
      if (event.toolName === OMD_TOOL_NAME) {
        const args = event.input?.args;
        const pending = pendingReferenceWork.get(context.cwd);
        if (pending !== undefined && pending.status !== 'exhausted' && Array.isArray(args)
          && args.every((arg): arg is string => typeof arg === 'string')) {
          const [root, sub] = args;
          const diagnostic = (root === 'stage' && sub === 'next')
            || (root === 'ref' && ['discover-plan', 'check', 'research-check', 'apply-check'].includes(sub ?? ''))
            || (root === 'brief' && sub === 'reference-board' && args.includes('--check'))
            || (root === 'guard' && sub === 'completion');
          if (diagnostic) return { block: true, reason: `OMD_OWNED_WORK_REQUIRED: ${pending.action?.reason ?? 'Publish the reference board from retained evidence.'}\n${pending.action?.args.join(' ') ?? 'omd schema reference-board --json, then omd ref board --input <candidate-assemblies.json>'}\nRead-only checks cannot replace this action.` };
        }
        if (Array.isArray(args) && args[0] === 'route' && args[1] === 'classify') managed.add(context.cwd);
        const frameHelp = Array.isArray(args) && args[0] === 'frame' && (args[1] === 'help' || args.includes('--help') || args.includes('-h'));
        if (guarded(context.cwd) && Array.isArray(args) && !frameHelp
          && args.every((arg): arg is string => typeof arg === 'string') && isMutatingOmdCommand(args)) touched.add(context.cwd);
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
    on('tool_result', async (event, context) => {
      if (context.signal?.aborted) return;
      ownedWork.nativeFinished(context.cwd, event);
      const key = mutationKey(event.toolName, event.toolCallId, event.input?.path);
      const group = key === undefined ? undefined : pendingMutations.get(context.cwd)?.get(key);
      const mutation = group?.entries.shift();
      if (group && event.isError !== false) group.failed = true;
      const settled = group !== undefined && group.entries.length === 0;
      if (key !== undefined && settled) pendingMutations.get(context.cwd)?.delete(key);
      if (mutation && settled && !group.failed && group.baseline !== fileRevision(context.cwd, mutation.path)) {
        bumpRevision(context.cwd);
        if (group.production) productionAttempted.add(context.cwd);
      }
    });
    on('message_end', async (event, context) => {
      const message = event.message;
      if (!touched.has(context.cwd) || message?.role !== 'assistant' || message.stopReason !== 'stop'
        || message.content?.some(part => part.type === 'toolCall')) return;
      pendingMutations.delete(context.cwd);
      if (context.signal?.aborted) return;
      const taskEpoch = epoch(context.cwd);
      const interrupted = () => context.signal?.aborted || epochs.get(context.cwd) !== taskEpoch;
      const bootstrap = bootstraps.get(context.cwd);
      return handleOmdMessageEnd({ cwd: context.cwd, ...(context.signal === undefined ? {} : { signal: context.signal }), message,
        run, interrupted, ...(bootstrap === undefined ? {} : { bootstrap }), hasRoute: hasPiRoute(context.cwd),
        workflowStarted: workflowStarted.has(context.cwd), ownedWorkStarted: ownedWork.started(context.cwd),
        productionAttempted: productionAttempted.has(context.cwd), revision: revision(context.cwd),
        routeRevision: fileRevision(context.cwd, '.omd/route.json'), repairLoop, pi,
        onReferenceWork: work => {
          if (work === null) pendingReferenceWork.delete(context.cwd);
          else pendingReferenceWork.set(context.cwd, work);
        } });
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
    async execute(_toolCallId, params, signal, onUpdate, context) {
      const workToken = ownedWork.token(context.cwd);
      const taskEpoch = epoch(context.cwd);
      if (!Array.isArray(params.args) || params.args.length === 0 || params.args.some((arg) => typeof arg !== 'string')) {
        throw new Error('OMD_CLI_ARGS_INVALID: args must be a non-empty string array');
      }
      const pendingReference = pendingReferenceWork.get(context.cwd);
      const referenceMutation = params.args[0] === 'ref'
        && ['advance', 'search', 'navigate', 'discover-batch', 'add', 'add-batch', 'import-image', 'exclude', 'board'].includes(params.args[1] ?? '');
      const boardBefore = pendingReference !== undefined && referenceMutation ? fileRevision(context.cwd, '.omd/reference-board.json') : undefined;
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
        result = await run(params.args, context.cwd, signal, onUpdate);
        if (signal?.aborted || epochs.get(context.cwd) !== taskEpoch) return { content: [{ type: 'text', text: result.text }], details: result.details };
        if (pendingReference !== undefined && referenceMutation) {
          const boardAfter = fileRevision(context.cwd, '.omd/reference-board.json');
          const boardPublished = params.args[1] === 'board' && /^[a-f0-9]{64}$/.test(boardAfter) && boardAfter !== boardBefore;
          let advanced = boardPublished;
          if (!advanced) {
            try {
              advanced = referenceWorkAdvanced((await run(['stage', 'next', '--json'], context.cwd, signal)).text, pendingReference);
            } catch (error) {
              if (!(error instanceof Error)) throw error;
              // The reference command succeeded; leave progress unverified for message_end to diagnose.
            }
          }
          if (signal?.aborted || epochs.get(context.cwd) !== taskEpoch) return { content: [{ type: 'text', text: result.text }], details: result.details };
          if (advanced && pendingReferenceWork.get(context.cwd) === pendingReference) pendingReferenceWork.delete(context.cwd);
        }
        if (isMutatingOmdCommand(params.args)) bumpRevision(context.cwd);
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
        const diagnostic = structuredToolDiagnostic(error, params.args);
        if (diagnostic !== null) return { content: [{ type: 'text', text: diagnostic.text }], details: diagnostic.details };
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
