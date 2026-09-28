import { Type } from 'typebox';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runOmd, monitorOmdProgress, createOmdProgressId, registerDoctorCommand, structuredToolDiagnostic, OmdCancelledError, type PortablePiApi } from './omd-runtime.ts';
export { OMD_COMMAND_NAME } from './omd-runtime.ts';
export type { PortablePiApi, PortablePiCommand, PortablePiEvent, PortablePiHook, PortablePiTool } from './omd-runtime.ts';
import { classifyPiWrite, hasPiRoute, isMutatingOmdCommand, isPreproductionReadCommand } from './omd-guard.ts';
import { routeValidationArgs, type RouteBootstrap } from './omd-route-bootstrap.ts';
import { RepairLoop } from './omd-repair-progress.ts';
import { StageWork, checkNativeStageEntry, nativeEntryStage, nativeOwnedStage } from './omd-stage-work.ts';
import { handleOmdMessageEnd, referenceWorkAdvanced, type ReferenceWork } from './omd-message-end.ts';
import { WorkflowResume } from './omd-workflow-resume.ts';
import { PiRequestBindings } from './omd-request-binding.ts';
import { normalizeOmdAlias, extractOmdWorkflowRequest } from './omd-request-prompt.ts';
import { capturePiUserTurn, readPiUserTurn, readPiRequest, type PiUserTurn } from './omd-request-source.ts';
import { PiNativeRuns } from './omd-native-run.ts';
import { RouteEntryContinuation, ROUTE_ENTRY_INPUT, ROUTE_ENTRY_VALIDATION } from './omd-bootstrap-entry.ts';
import { parseUserQuestion, questionText, browserAnswer, type UserQuestion } from './omd-user-question.ts';
import { clearBrowserAnswerReceipt, writeBrowserAnswerReceipt } from '../core/ref/browser-consent.ts';

export const OMD_TOOL_NAME = 'omd_cli';

export default function omdExtension(pi: PortablePiApi): void {
  const queues = new Map<string, Promise<unknown>>();
  const managed = new Set<string>();
  const touched = new Set<string>();
  const productionAttempted = new Set<string>();
  const repairLoop = new RepairLoop();
  const pendingReferenceWork = new Map<string, ReferenceWork>();
  const pendingQuestions = new Map<string, UserQuestion>();
  const browserConsentGranted = new Map<string, { digest: string; engine: string }>();
  const consentHomes = new Map<string, string>();
  const shownQuestions = new Map<string, string>();
  const observedAnswers = new Map<string, { digest: string; text: string }>();
  const rememberQuestion = (cwd: string, question: UserQuestion) => {
    if (pendingQuestions.get(cwd)?.digest !== question.digest) {
      browserConsentGranted.delete(cwd); shownQuestions.delete(cwd); observedAnswers.delete(cwd);
      if (consentHomes.has(cwd)) clearBrowserAnswerReceipt(consentHomes.get(cwd));
    }
    pendingQuestions.set(cwd, question);
  };
  const consentAnswer = (cwd: string, args: readonly string[]) => {
    if (args[0] !== 'browser' || !['setup', 'login', 'skip'].includes(args[1] ?? '')) return null;
    const question = pendingQuestions.get(cwd);
    const observed = observedAnswers.get(cwd);
    const index = args.indexOf('--user-answer');
    const answer = index < 0 ? undefined : args[index + 1];
    const interpretation = args[1] === 'skip' ? args[args.indexOf('--decision') + 1] : args[args.indexOf('--engine') + 1];
    if (!question || question.kind !== 'browser-consent' || !observed || observed.digest !== question.digest
      || shownQuestions.get(cwd) !== question.digest || answer === undefined || !answer.trim()
      || answer !== observed.text || interpretation === undefined
      || !(args[1] === 'skip' ? ['skipped-this-run', 'never-ask'] : ['user-browser', 'omd-profile']).includes(interpretation)) return null;
    return { questionDigest: question.digest, userText: answer, agentInterpretation: interpretation as 'user-browser' | 'omd-profile' | 'skipped-this-run' | 'never-ask' };
  };
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
  const workflowResume = new WorkflowResume();
  const requests = new PiRequestBindings();
  const lastStops = new Map<string, string>();
  const realTurns = new Map<string, PiUserTurn>();
  const judgedIntents = new Map<string, { requestSha256: string; decision: string }>();
  const paused = new Set<string>();
  const nativeRuns = new PiNativeRuns();
  const routeEntry = new RouteEntryContinuation();
  const rememberWorkflow = (cwd: string) => workflowResume.remember(cwd, fileRevision(cwd, '.omd/route.json'));
  // Pi may execute sibling tools concurrently. Serialize OMD commands per project so two
  // legitimate publishers cannot collide with OMD's project mutation lock.
  const run = (args: readonly string[], cwd: string, signal?: AbortSignal, onUpdate?: Parameters<typeof runOmd>[4]) => {
    const requestSource = requests.pin(cwd, args);
    const queued = queues.get(cwd);
    const progressId = createOmdProgressId();
    const stopWaiting = queued === undefined ? () => undefined : monitorOmdProgress(args, 'queued', signal, onUpdate, progressId);
    const previous = queued ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      stopWaiting();
      if (signal?.aborted) throw new OmdCancelledError();
      await requests.verifyRestored(cwd, requestSource, () => runOmd(pi, ['route', 'show', '--json'], cwd, signal, undefined, undefined, nativeRuns));
      if (signal?.aborted) throw new OmdCancelledError();
      const effective = requests.materialize(cwd, args, requestSource);
      try {
        const result = await runOmd(pi, effective.args, cwd, signal, onUpdate, progressId, nativeRuns);
        return effective.info === undefined ? result : { ...result, details: { ...result.details, requestBinding: effective.info } };
      } finally { effective.dispose(); }
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
  const pendingFeedback = new Set<string>();
  const guarded = (cwd: string) => managed.has(cwd) || hasPiRoute(cwd);
  const hook = 'on' in pi ? pi.on : undefined;
  const on = typeof hook === 'function' ? hook.bind(pi) : undefined;
  const hooksAvailable = on !== undefined;
  if (on !== undefined) {
    on('session_start', async (_event, context) => {
      epochs.clear(); pendingFeedback.clear(); repairLoop.clear(); pendingReferenceWork.clear(); pendingQuestions.clear(); browserConsentGranted.clear(); shownQuestions.clear(); observedAnswers.clear(); consentHomes.clear(); revisions.clear(); pendingMutations.clear(); ownedWork.clear(); managed.clear(); touched.clear(); productionAttempted.clear(); authoredInputs.clear(); bootstraps.clear(); freshRoutes.clear(); workflowStarted.clear(); workflowResume.clear(); requests.clear(); lastStops.clear(); realTurns.clear(); judgedIntents.clear(); paused.clear(); nativeRuns.clear(); routeEntry.clear();
      const { clearBrowserSessionSkip } = await import('../core/ref/browser-consent.ts');
      clearBrowserSessionSkip(context.browserConsentHome);
    });
    on('input', async (event, context) => {
      if (context.browserConsentHome) consentHomes.set(context.cwd, context.browserConsentHome);
      const pendingQuestion = pendingQuestions.get(context.cwd);
      if (pendingQuestion?.kind === 'browser-consent' && shownQuestions.get(context.cwd) === pendingQuestion.digest
        && (event.source === 'interactive' || event.source === 'rpc') && typeof event.text === 'string') {
        observedAnswers.set(context.cwd, { digest: pendingQuestion.digest, text: event.text });
        if (event.text.trim()) writeBrowserAnswerReceipt({ questionDigest: pendingQuestion.digest, userText: event.text }, context.browserConsentHome);
        else clearBrowserAnswerReceipt(context.browserConsentHome);
      }
      const realInput = (event.source === 'interactive' || event.source === 'rpc') && typeof event.text === 'string';
      const alias = realInput ? normalizeOmdAlias(event.text!) : undefined;
      if (realInput && event.text!.trim() && hasPiRoute(context.cwd)
        && extractOmdWorkflowRequest(alias ?? event.text!) === undefined) {
        if (!lastStops.has(context.cwd)) lastStops.set(context.cwd, 'session-restored');
        const turn = capturePiUserTurn(context.cwd, { text: event.text!,
          sessionId: context.sessionManager?.getSessionId() ?? `pi-${createHash('sha256').update(context.cwd).digest('hex')}`,
          turnId: randomBytes(16).toString('hex'), afterStopId: lastStops.get(context.cwd) ?? 'session-restored' });
        realTurns.set(context.cwd, turn);
      }
      if (realInput) paused.delete(context.cwd);
      requests.receive(context.cwd, alias === undefined ? event : { ...event, text: alias });
      const { explicitDesignFeedback } = await import('./omd-feedback.ts');
      if (explicitDesignFeedback(context.cwd, event) !== null) pendingFeedback.add(context.cwd);
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
      if (alias !== undefined) return { action: 'transform', text: alias, ...(event.images === undefined ? {} : { images: event.images }) };
    });
    on('before_agent_start', async (event, context) => {
      nativeRuns.observe(context);
      requests.activate(context.cwd, event.prompt ?? '');
      const source = requests.current(context.cwd);
      const intent = judgedIntents.get(context.cwd);
      if (requests.classificationGranted(context.cwd) && hasPiRoute(context.cwd)
        && (intent === undefined || intent.requestSha256 !== source?.requestSha256 || intent.decision !== 'inspect')) {
        workflowStarted.add(context.cwd); touched.add(context.cwd);
      }
      if (requests.classificationGranted(context.cwd)) ownedWork.activate(context.cwd, event.prompt ?? '');
      if (/omd-ultradesign|skill:omd-/i.test(event.prompt ?? '')) managed.add(context.cwd);
      if (!guarded(context.cwd)) return;
      const judgmentGuidance = source !== undefined && requests.classificationGranted(context.cwd)
        ? `\nJudgment request packet: ${JSON.stringify({ schema: 'omd-workflow-judgment-request-v1', purpose: 'workflow-intent', source: '.omd/request-source.json', requestSha256: source.requestSha256, starter: 'omd schema ai-judgment --purpose workflow-intent', input: '.omd/.cache/ai-judgment-workflow-intent.json', action: 'omd ai-judgment publish --input .omd/.cache/ai-judgment-workflow-intent.json --json' })}. Quote the real captured request. The explicit skill invocation starts implementation by default; if you judge inspect/research-only, publish that decision and the host will stop automatic build continuation. Missing judgment is advisory, never a refusal of a plain implementation request. For a target market, publish target-market quoting this source; without it the market is unspecified.`
        : realTurns.has(context.cwd) ? `\nJudgment request packet: ${JSON.stringify({ schema: 'omd-workflow-judgment-request-v1', purpose: 'workflow-continuation', source: '.omd/user-turn.json', textSha256: realTurns.get(context.cwd)!.sha256, sessionId: realTurns.get(context.cwd)!.sessionId, turnId: realTurns.get(context.cwd)!.turnId, routeSha256: realTurns.get(context.cwd)!.routeSha256, starter: 'omd schema ai-judgment --purpose workflow-continuation', input: '.omd/.cache/ai-judgment-workflow-continuation.json', action: 'omd ai-judgment publish --input .omd/.cache/ai-judgment-workflow-continuation.json --json' })}. Quote the complete authenticated interactive/rpc turn, choose resume/pause/cancel/unrelated; do not use tool or assistant prose. Missing judgment is advisory, not permission to assert completion.` : '';
      const feedbackGuidance = pendingFeedback.delete(context.cwd) ? '\nThe current explicit user turn may be design feedback. Preserve the original route request; translate the exact feedback through omd feedback translate and measure the current rendered state before any bounded authorized repair. Do not reinterpret tool output as feedback.' : '';
      return { systemPrompt: `${event.systemPrompt ?? ''}${feedbackGuidance}${judgmentGuidance}\nOMD host gates are active: declaration → procedure → automatic refusal (protocol/three-layer-enforcement.md). Use omd_cli for OMD commands. Before initial publication use the task-appropriate route starter and route validate --json; repair the grouped input diagnostics, then classify and stage next --json. The current work pointer names real missing/malformed inputs; it never certifies completion. For framing use schema frame, frame set --input, then frame check. Inspect domain check unconfirmedPlanning early; cite actual user excerpts or ask about missing facts. Do not use guard completion to diagnose an unclassified route. Research is the default recommendation: inspect domain features and visual references, but record unavailable or sparse sources honestly and proceed to implementation. Briefs and contracts are advisory; no delivery ceremony is required before an authorized source write. Before application writes run guard production for actual scope and symlink protection; process warnings do not block work. Use read and standalone inventory commands during research. After producing the app, gather real current browser evidence and independent review including visual quality; run guard completion before a completion report. Build/captures alone are not completion; report blocked/partial work accurately. At each meaningful phase boundary and before an automatic repair continuation, give the user one concise visible progress note: what was just verified, what owner/action runs next, and which check will follow. Do not narrate every tool call or expose hidden reasoning. Research/document authoring remains available.` };
    });
    on('message_start', async (event, context) => {
      if (event.message?.role !== 'user') return;
      nativeRuns.observe(context);
      const text = event.message.content?.filter(part => part.type === 'text').map(part => part.text ?? '').join('');
      if (text !== undefined) {
        requests.activate(context.cwd, text);
        if (requests.classificationGranted(context.cwd)) ownedWork.activate(context.cwd, text);
      }
    });
    on('tool_call', async (event, context) => {
      if (event.toolName === OMD_TOOL_NAME) {
        const args = event.input?.args;
        if (Array.isArray(args) && args[0] === 'browser' && ['setup', 'login', 'skip'].includes(args[1] ?? '')
          && !(consentAnswer(context.cwd, args)
            || args[1] !== 'skip' && browserConsentGranted.get(context.cwd)?.digest === pendingQuestions.get(context.cwd)?.digest
              && args.includes('--consent') && args[args.indexOf('--engine') + 1] === browserConsentGranted.get(context.cwd)?.engine))
          return { block: true, reason: 'OMD_BROWSER_SETUP_CONSENT_REQUIRED: Setup is blocked without an answer to the current browser choice. Do NOT ask another yes/no question; report this block and the original options to the user.' };
        if (Array.isArray(args) && args[0] === 'route' && args[1] === 'classify') { managed.add(context.cwd); touched.add(context.cwd); }
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
              // Entry diagnostics advise the owner; authorized authoring remains available.
              ownedWork.nativeStarted(context.cwd, event, stage);
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
      if (event.toolName === OMD_TOOL_NAME && event.isError === false) {
        const parts = event.content ?? event.message?.content ?? [];
        for (const part of parts) {
          const question = typeof part.text === 'string' ? parseUserQuestion(part.text) : null;
          if (question) rememberQuestion(context.cwd, question);
        }
      }
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
        if (ownedWork.started(context.cwd)) rememberWorkflow(context.cwd);
      }
    });
    on('message_end', async (event, context) => {
      if (context.browserConsentHome) consentHomes.set(context.cwd, context.browserConsentHome);
      const message = event.message;
      if (message?.role === 'assistant' && message.stopReason === 'stop') lastStops.set(context.cwd, randomBytes(16).toString('hex'));
      if (paused.has(context.cwd)) return { message };
      const entryAuthorized = !hasPiRoute(context.cwd) && requests.classificationGranted(context.cwd) && ownedWork.token(context.cwd) !== undefined;
      if ((!touched.has(context.cwd) && !entryAuthorized && !pendingQuestions.has(context.cwd)) || message?.role !== 'assistant' || message.stopReason !== 'stop'
        || message.content?.some(part => part.type === 'toolCall')) return;
      pendingMutations.delete(context.cwd);
      if (context.signal?.aborted) return;
      const taskEpoch = epoch(context.cwd);
      const interrupted = () => context.signal?.aborted || epochs.get(context.cwd) !== taskEpoch;
      const bootstrap = bootstraps.get(context.cwd) ?? (entryAuthorized && authoredInputs.get(context.cwd)?.has(ROUTE_ENTRY_INPUT)
        ? { inputPath: ROUTE_ENTRY_INPUT, validationArgs: [...ROUTE_ENTRY_VALIDATION], classificationAttempted: false, classificationAuthorized: true }
        : undefined);
      if (entryAuthorized && bootstrap === undefined) {
        try {
          const source = requests.pin(context.cwd, ROUTE_ENTRY_VALIDATION);
          if (source !== undefined) return routeEntry.resume({ cwd: context.cwd, sourceSha256: source.recordSha256, message, pi });
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          return { message: { ...message, content: [{ type: 'text', text: `OMD route entry is blocked; the current request cannot be verified.\n${error.message}` }] } };
        }
      }
      const pendingQuestion = pendingQuestions.get(context.cwd);
      if (pendingQuestion) {
        const grant = browserConsentGranted.get(context.cwd);
        if (grant?.digest === pendingQuestion.digest) return { message };
        if (pendingQuestion.kind === 'browser-consent') shownQuestions.set(context.cwd, pendingQuestion.digest);
        if (pendingQuestion.kind === 'browser-consent' && context.ui?.select) {
          const choice = await context.ui.select(pendingQuestion.question, [...pendingQuestion.options]);
          if (interrupted()) return;
          if (choice !== undefined) {
            const answer = browserAnswer(pendingQuestion, choice);
            if (answer === 'user-browser' || answer === 'omd-profile') {
              browserConsentGranted.set(context.cwd, { digest: pendingQuestion.digest, engine: answer });
              try {
                const setup = await run(['browser', 'setup', '--engine', answer, '--consent', '--json'], context.cwd, context.signal);
                const { writeBrowserInterpretation } = await import('../core/ref/browser-consent.ts');
                writeBrowserInterpretation({ questionDigest: pendingQuestion.digest, userText: choice, agentInterpretation: answer }, context.browserConsentHome);
                browserConsentGranted.delete(context.cwd);
                pendingQuestions.delete(context.cwd);
                return { message: { ...message, content: [...(message.content ?? []), { type: 'text', text: `Browser setup result: ${setup.text}` }] } };
              } catch (error) {
                return { message: { ...message, content: [...(message.content ?? []), { type: 'text', text: `Browser setup failed: ${error instanceof Error ? error.message : String(error)}. Do NOT ask for consent again; the choice remains authorized for a retry.` }] } };
              }
            }
            if (answer === 'skipped-this-run' || answer === 'never-ask') {
              const { writeBrowserConsent, writeUserBrowserConsent, writeBrowserInterpretation } = await import('../core/ref/browser-consent.ts');
              writeBrowserConsent(answer, context.browserConsentHome); writeUserBrowserConsent(answer, context.browserConsentHome);
              writeBrowserInterpretation({ questionDigest: pendingQuestion.digest, userText: choice, agentInterpretation: answer }, context.browserConsentHome);
              pendingQuestions.delete(context.cwd);
              return { message };
            }
          }
        }
        const text = questionText(pendingQuestion);
        const existing = message.content?.filter(part => part.type === 'text').map(part => part.text ?? '').join('\n') ?? '';
        return { message: { ...message, content: existing.includes(text) ? message.content : [...(message.content ?? []), { type: 'text', text }] } };
      }
      return handleOmdMessageEnd({ cwd: context.cwd, ...(context.signal === undefined ? {} : { signal: context.signal }),
        ...(context.ui === undefined ? {} : { ui: context.ui }),
        ...(context.browserConsentHome === undefined ? {} : { browserConsentHome: context.browserConsentHome }), message,
        run, interrupted, ...(bootstrap === undefined ? {} : { bootstrap }), hasRoute: hasPiRoute(context.cwd),
        workflowStarted: workflowStarted.has(context.cwd), ownedWorkStarted: ownedWork.started(context.cwd),
        productionAttempted: productionAttempted.has(context.cwd), revision: revision(context.cwd),
        routeRevision: fileRevision(context.cwd, '.omd/route.json'), repairLoop, pi,
        onBrowserConsentRequired: text => {
          const question = parseUserQuestion(JSON.stringify({ action: { kind: 'browser-consent', question: text,
            options: ['평소 쓰는 브라우저 그대로 쓰기', 'OMD 전용 로그인 브라우저', '이번엔 건너뛰기', '다시 묻지 않기'] } }));
          if (question) rememberQuestion(context.cwd, question);
        },
        onUserQuestion: question => rememberQuestion(context.cwd, question),
        onBrowserAnswer: (answer, digest) => {
          if (answer === null) { browserConsentGranted.delete(context.cwd); pendingQuestions.delete(context.cwd); }
          else browserConsentGranted.set(context.cwd, { digest, engine: answer });
        },
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
      nativeRuns.observe(context);
      const workToken = ownedWork.token(context.cwd);
      const taskEpoch = epoch(context.cwd);
      if (!Array.isArray(params.args) || params.args.length === 0 || params.args.some((arg) => typeof arg !== 'string')) {
        throw new Error('OMD_CLI_ARGS_INVALID: args must be a non-empty string array');
      }
      const browserEvidence = consentAnswer(context.cwd, params.args);
      if (params.args[0] === 'browser' && ['setup', 'login', 'skip'].includes(params.args[1] ?? '')
        && !(browserEvidence && (params.args[1] === 'skip' || params.args.includes('--consent'))
          || params.args[1] !== 'skip' && browserConsentGranted.get(context.cwd)?.digest === pendingQuestions.get(context.cwd)?.digest
            && params.args.includes('--consent') && params.args[params.args.indexOf('--engine') + 1] === browserConsentGranted.get(context.cwd)?.engine))
        throw new Error('OMD_BROWSER_SETUP_CONSENT_REQUIRED: No matching answer to the current question. Do NOT ask another yes/no question; report the block and original options.');
      const pendingReference = pendingReferenceWork.get(context.cwd);
      const referenceMutation = params.args[0] === 'ref'
        && ['advance', 'search', 'leads', 'navigate', 'discover-batch', 'add', 'add-batch', 'import-image', 'exclude', 'board'].includes(params.args[1] ?? '');
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
            classificationAuthorized: requests.classificationGranted(context.cwd),
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
        if (params.args[0] === 'ai-judgment' && params.args[1] === 'publish') {
          const published: unknown = JSON.parse(result.text);
          const receipt = typeof published === 'object' && published !== null ? Reflect.get(published, 'receipt') : undefined;
          const path = typeof receipt === 'object' && receipt !== null ? Reflect.get(receipt, 'path') : undefined;
          if (typeof path === 'string') {
            const checked: unknown = JSON.parse((await run(['ai-judgment', 'check', '--judgment', path, '--json'], context.cwd, signal)).text);
            const judgment = typeof checked === 'object' && checked !== null ? Reflect.get(checked, 'judgment') : undefined;
            if (typeof judgment === 'object' && judgment !== null) {
              const purpose = Reflect.get(judgment, 'purpose');
              const decision = Reflect.get(judgment, 'decision');
              if (purpose === 'workflow-intent') {
                const request = requests.current(context.cwd);
                const source = readPiRequest(context.cwd);
                if (request && source?.recordSha256 === request.recordSha256
                  && Reflect.get(Reflect.get(judgment, 'context'), 'requestSha256') === request.requestSha256
                  && typeof decision === 'string') {
                  judgedIntents.set(context.cwd, { requestSha256: request.requestSha256, decision });
                  if (decision === 'inspect') {
                    requests.suspend(context.cwd); workflowStarted.delete(context.cwd); ownedWork.delete(context.cwd);
                    paused.add(context.cwd);
                  }
                }
              } else if (purpose === 'workflow-continuation') {
                const turn = realTurns.get(context.cwd);
                const signed = readPiUserTurn(context.cwd);
                const routeSha256 = fileRevision(context.cwd, '.omd/route.json');
                if (turn && signed && turn.sha256 === signed.sha256 && turn.text === signed.text
                  && turn.turnId === signed.turnId && turn.sessionId === signed.sessionId
                  && turn.afterStopId === lastStops.get(context.cwd) && signed.afterStopId === turn.afterStopId
                  && turn.routeSha256 === routeSha256 && typeof decision === 'string') {
                  if (workflowResume.acceptCheckedTurn(context.cwd, routeSha256, decision)) {
                    workflowStarted.add(context.cwd); touched.add(context.cwd); paused.delete(context.cwd);
                  } else {
                    workflowStarted.delete(context.cwd); ownedWork.delete(context.cwd); paused.add(context.cwd);
                  }
                }
              }
            }
          }
        }
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
        if (browserEvidence) {
          const { writeBrowserInterpretation } = await import('../core/ref/browser-consent.ts');
          writeBrowserInterpretation(browserEvidence, consentHomes.get(context.cwd) ?? context.browserConsentHome);
          observedAnswers.delete(context.cwd); pendingQuestions.delete(context.cwd); shownQuestions.delete(context.cwd);
        }
        if (params.args[0] === 'browser' && ['setup', 'login'].includes(params.args[1] ?? '')) {
          browserConsentGranted.delete(context.cwd); pendingQuestions.delete(context.cwd);
        }
        if (isMutatingOmdCommand(params.args)) bumpRevision(context.cwd);
        if (hasPiRoute(context.cwd) && ownedWork.commandSucceeded(context.cwd, { args: params.args, token: workToken })) {
          touched.add(context.cwd);
          if (ownedWork.started(context.cwd)) rememberWorkflow(context.cwd);
        }
        if (params.args[0] === 'recipe' && params.args[1] === 'add') productionAttempted.add(context.cwd);
        if (params.args[0] === 'route' && params.args[1] === 'classify' && commandBootstrap
          && authoredInputs.get(context.cwd)?.has(classifyPiWrite(context.cwd, commandBootstrap.inputPath).path)) {
          freshRoutes.add(context.cwd);
          if (commandBootstrap.classificationAuthorized && !paused.has(context.cwd)) workflowStarted.add(context.cwd);
        }
        if (freshRoutes.has(context.cwd) && ownedWork.token(context.cwd) !== undefined && params.args[0] === 'brief' && params.args.includes('--check')) {
          workflowStarted.add(context.cwd); rememberWorkflow(context.cwd);
        }
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
        content: [{ type: 'text', text: result.text }, ...(result.details.requestBinding === undefined ? [] : [{ type: 'text' as const,
          text: `OMD used the captured original user request (${result.details.requestBinding.characters} characters; sha256 ${result.details.requestBinding.sha256}). The authored request field cannot replace it. Publish domain input with domain set --input; it inherits the complete current route request.` }])],
        details: result.details,
      };
    },
  });

  registerDoctorCommand(pi, cwd => run(['doctor'], cwd), hooksAvailable);
}
