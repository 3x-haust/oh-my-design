import { resumeRouteInput } from './omd-bootstrap-repair.ts';
import { parseUserQuestion, questionText, browserAnswer, type UserQuestion } from './omd-user-question.ts';
import { formatCompletionHostCapabilities } from '../core/completion/host-capabilities.ts';
import type { RepairLoop } from './omd-repair-progress.ts';
import type { RouteBootstrap } from './omd-route-bootstrap.ts';
import { guardFailure, type OmdRunResult, type PortablePiApi, type PortablePiEvent } from './omd-runtime.ts';
import { finishModelLedTurn } from './omd-model-led-completion.ts';

type StagePlanning = Readonly<{ field: string; text: string }>;
export type ReferenceWork = Readonly<{
  status: 'action' | 'ready' | 'exhausted';
  workSha256: string;
  action: Readonly<{ kind: string; args: readonly string[]; reason: string; lane?: string; url?: string; question?: string }> | null;
  code: string | null;
  attempts: readonly Readonly<{ lane: string; url: string; reason: string; receipt: string }> [];
  exclusions: readonly Readonly<{ lane: string; url: string; reason: string; receipt: string }> [];
  circuits: readonly Readonly<{ provider: string; threshold: number; receipts: readonly string[] }> [];
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
  materialProgressIdentities: readonly string[];
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
  ui?: { select?(title: string, options: string[]): Promise<string | undefined> };
  browserConsentHome?: string;
  responseLocale?: 'ko' | 'en';
  onBrowserConsentRequired?(question: string): void;
  onUserQuestion?(question: UserQuestion): void;
  onBrowserAnswer?(answer: 'user-browser' | 'omd-profile' | null, digest: string): void;
  onReferenceWork?(work: ReferenceWork | null): void;
  browserDoctor?(): Promise<import('../core/browser/contracts.ts').UserBrowserDoctorReport>;
  explicitUserBrowser?: boolean;
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
    && typeof reason === 'string' ? { kind, args, reason,
      ...(typeof Reflect.get(rawAction, 'lane') === 'string' ? { lane: Reflect.get(rawAction, 'lane') as string } : {}),
      ...(typeof Reflect.get(rawAction, 'url') === 'string' ? { url: Reflect.get(rawAction, 'url') as string } : {}) } : null;
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
  const rawCircuits = Reflect.get(value, 'circuits');
  const circuits = Array.isArray(rawCircuits) ? rawCircuits.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const provider = Reflect.get(item, 'provider');
    const threshold = Reflect.get(item, 'threshold');
    const receipts = Reflect.get(item, 'receipts');
    return typeof provider === 'string' && typeof threshold === 'number' && Array.isArray(receipts)
      ? [{ provider, threshold, receipts: receipts.map((receipt: unknown) => typeof receipt === 'string' ? receipt
        : typeof receipt === 'object' && receipt !== null ? String(Reflect.get(receipt, 'path') ?? '') : '') }] : [];
  }) : [];
  return { status, workSha256, action, code: typeof code === 'string' ? code : null,
    attempts: parsedAttempts, exclusions: parsedExclusions, circuits };
}

export function parseStageWork(text: string): StageWorkPointer | null {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || !['stage-next-v1', 'stage-next-v2'].includes(Reflect.get(value, 'schema'))) return null;
  const stageValue = Reflect.get(value, 'stage');
  if (stageValue === null && Reflect.get(value, 'schema') === 'stage-next-v1') return null;
  const stage = typeof stageValue === 'string' ? stageValue : Reflect.get(value, 'deliveryMode') === 'design-only' ? 'design-handoff' : 'production';
  const progress = Reflect.get(value, 'progress');
  const routeSha256 = typeof progress === 'object' && progress !== null ? Reflect.get(progress, 'routeSha256') : null;
  const validatedStages = typeof progress === 'object' && progress !== null ? stringList(Reflect.get(progress, 'validatedStages')) : [];
  const materialProgressIdentities = typeof progress === 'object' && progress !== null ? stringList(Reflect.get(progress, 'materialProgressIdentities')) : [];
  const owner = Reflect.get(value, 'owner');
  const action = Reflect.get(value, 'action');
  const autonomousReading = action !== null && typeof action === 'object'
    && Reflect.get(action, 'kind') === 'design-language-ambiguity';
  const next = Reflect.get(value, 'next');
  const observed = referenceWork(Reflect.get(value, 'referenceWork'));
  const recovering = observed?.status === 'exhausted';
  const recoveryArgs = ['ref', 'discover-batch', '--input', '.omd/.cache/reference-recovery-batch.json', '--recovery', '--json'];
  const instruction = autonomousReading
    ? 'Choose the strongest grounded design reading internally from the current request, content, project system and references. Publish chosenId and decision through language translate. Record the harness as decision maker, never a user answer. Developer interviews are separate from production.'
    : recovering
    ? 'Read omd schema reference-discovery-batch. Author the recovery batch with new qualified sources or materially changed acquisition strategies justified by the signed failures and exclusions. Preserve both research lanes and evidence requirements; unchanged failed commands are not recovery. Publish it with the named command, inspect captured sources, then recompute stage next.'
    : Reflect.get(value, 'instruction');
  return {
    stage,
    owner: typeof owner === 'string' ? owner : `${stage} owner`,
    action: autonomousReading ? 'resolve-design-reading' : recovering ? 'replan-discovery' : typeof action === 'string' ? action : 'repair-output',
    next: autonomousReading ? 'omd schema design-language-input' : recovering ? `omd ${recoveryArgs.join(' ')}` : typeof next === 'string' ? next : '',
    instruction: typeof instruction === 'string' ? instruction : 'Perform the owned work, then recompute stage next.',
    problems: stringList(Reflect.get(value, 'problems')),
    entryBlockers: stringList(Reflect.get(value, 'entryBlockers')),
    planning: planningList(Reflect.get(value, 'planning')),
    routeSha256: typeof routeSha256 === 'string' && /^[a-f0-9]{64}$/.test(routeSha256) ? routeSha256 : null,
    validatedStages, materialProgressIdentities,
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
    `Start/check: ${work.next || 'no command; perform the required action directly'}`,
    ...(work.referenceWork?.action === null || work.referenceWork === null ? [] : [
      `Reference action: ${work.referenceWork.action.args.length > 0 ? `omd ${work.referenceWork.action.args.join(' ')}` : work.next}`,
      `Reference reason: ${work.referenceWork.action.reason}`,
    ]),
    ...(work.referenceWork?.circuits ?? []).map(circuit => `REFERENCE_PROVIDER_CIRCUIT_OPEN: ${circuit.provider} (${circuit.threshold} failures): ${circuit.receipts.join(', ')}`),
    ...(work.referenceWork === null ? [] : [
      ...(work.referenceWork.code === null ? [] : [work.referenceWork.code]),
      ...work.referenceWork.attempts.slice(-12).map(attempt => `- ${attempt.lane}: ${attempt.url}: ${attempt.reason} (${attempt.receipt})`),
      ...(work.referenceWork.attempts.length > 12 ? [`(+${work.referenceWork.attempts.length - 12} earlier attempts)`] : []),
      ...work.referenceWork.exclusions.slice(-12).map(exclusion => `- excluded ${exclusion.lane}: ${exclusion.url}: ${exclusion.reason} (${exclusion.receipt})`),
      ...(work.referenceWork.exclusions.length > 12 ? [`(+${work.referenceWork.exclusions.length - 12} earlier exclusions)`] : []),
    ]),
    `Procedure: ${work.instruction}`,
    ...(work.limitations.length ? ['Confidence debt (not verified):', ...work.limitations.map(item => `- ${item}`)] : []),
    ...(issues.length ? ['Current blockers:', ...issues.map(issue => `- ${issue}`)] : []),
    'Do the required action before rerunning stage next. Repeating checks without changing owned evidence is not progress.',
  ].join('\n');
}

const koreanMessage = (_message: NonNullable<PortablePiEvent['message']>, locale?: 'ko' | 'en'): boolean => locale === 'ko';

export async function readyBridgeQuestion(home?: string, doctor?: () => Promise<import('../core/browser/contracts.ts').UserBrowserDoctorReport>, workSha256?: string, explicit = process.env.OMD_REFERENCE_BROWSER_ENGINE === 'user-browser'): Promise<UserQuestion | null> {
  if (!explicit) return null;
  const { readBrowserConsent, readUserBrowserConsent } = await import('../core/ref/browser-consent.ts');
  // A previously consented dedicated profile does not grant access to the everyday browser.
  if (readUserBrowserConsent(home) !== null || readBrowserConsent(home) !== 'consented') return null;
  const { readReferenceBrowserConfig } = await import('../core/ref/browser-config.ts');
  if (readReferenceBrowserConfig(process.env, home).mode !== 'profile') return null;
  const inspect = doctor ?? (await import('../core/browser/setup.ts')).userBrowserDoctor;
  if ((await inspect()).state !== 'ready') return null;
  return parseUserQuestion(JSON.stringify({ action: { kind: 'browser-consent',
    question: '평소 쓰는 브라우저가 연결되어 있습니다. 레퍼런스 조사에 이 브라우저를 사용해도 될까요? OMD 전용 브라우저를 유지하거나 이번에는 건너뛸 수도 있습니다.',
    options: ['평소 쓰는 브라우저 그대로 쓰기', 'OMD 전용 로그인 브라우저', '이번엔 건너뛰기', '다시 묻지 않기'] },
    workSha256 }));
}

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
      if (work?.action === 'finish-model-led') {
        const text = await finishModelLedTurn(task);
        let visible = text;
        if (text.startsWith('{')) {
          const result: unknown = JSON.parse(text);
          if (typeof result === 'object' && result !== null) {
            const complete = Reflect.get(result, 'ok') === true;
            const diagnostic = Reflect.get(result, 'diagnostic');
            const category = typeof diagnostic === 'object' && diagnostic !== null ? Reflect.get(diagnostic, 'category') : null;
            const canRepair = !complete && category !== 'authority' && category !== 'cancelled';
            visible = koreanMessage(message, task.responseLocale)
              ? complete
                ? `구현과 실제 브라우저 동작, 독립 모델 검토가 완료됐습니다. 사람의 미적 평가를 받은 것은 아닙니다.\n결과: ${String(Reflect.get(result, 'finalEvidencePath'))}`
                : `자동 검증의 ${String(Reflect.get(result, 'phase'))} 단계에서 문제가 확인됐습니다. ${canRepair ? '실제 결과와 검증 내용을 비교해 수정을 이어갑니다.' : '권한 또는 중단 상태를 해결하기 전에는 완료를 주장하지 않습니다.'}`
              : complete ? `Implementation, real browser checks and isolated model review completed.\nEvidence: ${String(Reflect.get(result, 'finalEvidencePath'))}`
                : `Completion is unverified at ${String(Reflect.get(result, 'phase'))}. ${canRepair ? 'Repair continues from the retained evidence.' : 'Authority or cancellation requires resolution.'}`;
            const limitations = limitationList(Reflect.get(result, 'limitations'));
            if (limitations.length) visible += `\n${limitations.join('\n')}`;
          }
        }
        return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
          { type: 'text', text: visible }] } };
      }
      if (work?.action === 'stop-blocked') {
        task.onReferenceWork?.(null);
        const status = koreanMessage(message, task.responseLocale)
          ? `반복 수정 후에도 필수 결함이 남아 자동 수정을 중단했습니다. 품질 검증을 통과한 결과는 아닙니다. 현재 산출물과 검증 기록은 ${cwd}에 보존했습니다.`
          : `Automatic repairs stopped with unresolved required defects. This is not quality approval. The current artifact and evidence remain in ${cwd}.`;
        return { message: { ...message, content: [{ type: 'text' as const,
          text: [status, ...work.problems, ...work.limitations].join('\n') }] } };
      }
      // Reporting the stalled loop is the required action itself: keep the agent's report and stop prompting.
      if (work?.action === 'report-stalled-first-render') {
        task.onReferenceWork?.(null);
        const status = koreanMessage(message, task.responseLocale)
          ? '첫 렌더 수정이 같은 지적에서 더 나아가지 못해 최선 버전을 복원하고 멈췄습니다. 검증을 통과한 결과는 아닙니다.'
          : 'The first-render repair loop stalled and the best version is restored. This is not verified completion.';
        return { message: { ...message, content: [...(message.content ?? []),
          { type: 'text' as const, text: [status, ...work.problems, ...work.limitations].join('\n') }] } };
      }
      const stageQuestion = parseUserQuestion(result.text) ?? (work?.stage === 'reference-board' && work.referenceWork?.status === 'action'
        ? await readyBridgeQuestion(task.browserConsentHome, task.browserDoctor, work.referenceWork.workSha256, task.explicitUserBrowser) : null);
      if (stageQuestion) {
        task.onUserQuestion?.(stageQuestion);
        if (stageQuestion.kind === 'browser-consent' && task.ui?.select) {
          const selected = await task.ui.select(stageQuestion.question, [...stageQuestion.options]);
          if (interrupted()) return;
          const answer = selected === undefined ? null : browserAnswer(stageQuestion, selected);
          if (answer === 'user-browser' || answer === 'omd-profile') {
            task.onBrowserAnswer?.(answer, stageQuestion.digest);
            try {
              const setup = await run(['browser', 'setup', '--engine', answer, '--consent', '--json'], cwd, signal);
              if (interrupted()) return;
              const { writeBrowserInterpretation, writeUserBrowserConsent } = await import('../core/ref/browser-consent.ts');
              if (answer === 'omd-profile') writeUserBrowserConsent('skipped-this-run', task.browserConsentHome);
              writeBrowserInterpretation({ questionDigest: stageQuestion.digest, userText: selected!, agentInterpretation: answer }, task.browserConsentHome);
              task.onBrowserAnswer?.(null, stageQuestion.digest);
              const ready = JSON.parse(setup.text) as { state?: string };
              if (ready.state === 'ready') pi.sendMessage?.({ customType: 'omd-browser-ready', display: true,
                content: 'OMD Browser bridge is ready after explicit consent. The bundled OMD browser driver is now the selected research engine; run omd ref work-next --json and continue its native browsing action. Do not ask the user to invoke a browser skill or manually click routine Enable/Use controls.' },
              { triggerTurn: true, deliverAs: 'followUp' });
              return { message: { ...message, content: [...(message.content ?? []), { type: 'text', text: `Browser setup result: ${setup.text}` }] } };
            } catch (error) {
              if (interrupted()) return;
              return { message: { ...message, content: [...(message.content ?? []), { type: 'text', text: `Browser setup failed: ${error instanceof Error ? error.message : String(error)}. Do NOT ask for consent again; retry the authorized engine or report the failure.` }] } };
            }
          }
          if (answer === 'skipped-this-run' || answer === 'never-ask') {
            const { writeBrowserConsent, writeUserBrowserConsent, writeBrowserInterpretation } = await import('../core/ref/browser-consent.ts');
            writeBrowserConsent(answer, task.browserConsentHome); writeUserBrowserConsent(answer, task.browserConsentHome);
            writeBrowserInterpretation({ questionDigest: stageQuestion.digest, userText: selected!, agentInterpretation: answer }, task.browserConsentHome);
            task.onBrowserAnswer?.(null, stageQuestion.digest);
            return { message };
          }
        }
        const text = questionText(stageQuestion);
        const existing = message.content?.filter(part => part.type === 'text').map(part => part.text ?? '').join('\n') ?? '';
        return { message: { ...message, content: existing.includes(text) ? message.content : [...(message.content ?? []), { type: 'text', text }] } };
      }
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
        const { readBrowserConsent, readUserBrowserConsent, browserProfilePath, writeBrowserConsent,
          writeUserBrowserConsent, writeBrowserInterpretation } = await import('../core/ref/browser-consent.ts');
        const { existsSync } = await import('node:fs');
        const consent = readBrowserConsent(task.browserConsentHome);
        const userConsent = readUserBrowserConsent(task.browserConsentHome);
        const userDoctor = userConsent === 'consented'
          ? await (await import('../core/browser/setup.ts')).userBrowserDoctor() : null;
        const { readReferenceBrowserConfig } = await import('../core/ref/browser-config.ts');
        const config = readReferenceBrowserConfig(process.env, task.browserConsentHome);
        const designAttempts = work.referenceWork?.attempts.filter(attempt => attempt.lane === 'design') ?? [];
        const needsSetup = config.mode !== 'cdp' && config.storageState === undefined && config.executablePath === undefined
          && work.stage === 'reference-board' && work.referenceWork !== null
          && work.referenceWork.action?.kind === 'browser-consent'
          && (userConsent === null && consent === null
            || userConsent === 'consented' && userDoctor?.state !== 'ready'
            || consent === 'consented' && !existsSync(browserProfilePath(task.browserConsentHome))
            );
        if (needsSetup && !interrupted()) {
          const question = work.referenceWork?.action?.question ?? '레퍼런스 검색 전에 브라우저 사용 방식을 선택해 주세요. 평소 쓰는 브라우저 그대로 쓰기 / OMD 전용 로그인 브라우저 / 이번엔 건너뛰기 / 다시 묻지 않기 중 무엇을 원하시나요?';
          const sites = [...new Set(designAttempts.map(attempt => attempt.url)
            .concat(work.referenceWork?.action?.lane === 'design' && work.referenceWork.action.url ? [work.referenceWork.action.url] : []))]
            .filter(url => { try { return new URL(url).protocol === 'https:'; } catch { return false; } }).slice(0, 4);
          if (task.ui?.select) {
            const choice = await task.ui.select(question, ['평소 쓰는 브라우저 그대로 쓰기', 'OMD 전용 로그인 브라우저', '이번엔 건너뛰기', '다시 묻지 않기']);
            if (interrupted()) return;
            if (choice === '평소 쓰는 브라우저 그대로 쓰기' || choice === 'OMD 전용 로그인 브라우저') {
              try {
                const attached = choice === '평소 쓰는 브라우저 그대로 쓰기';
                const result = await run(['browser', 'setup', '--engine', attached ? 'user-browser' : 'omd-profile',
                  '--consent', ...(!attached && sites.length ? ['--sites', sites.join(',')] : []), '--json'], cwd, signal);
                if (interrupted()) return;
                const questionRecord = parseUserQuestion(JSON.stringify({ action: { kind: 'browser-consent', question,
                  options: ['평소 쓰는 브라우저 그대로 쓰기', 'OMD 전용 로그인 브라우저', '이번엔 건너뛰기', '다시 묻지 않기'] } }))!;
                writeBrowserInterpretation({ questionDigest: questionRecord.digest, userText: choice,
                  agentInterpretation: attached ? 'user-browser' : 'omd-profile' }, task.browserConsentHome);
                const setup = JSON.parse(result.text) as { state?: string; humanStep?: string; candidates?: { id: string; label: string }[] };
                const detail = setup.state === 'pending-human-step'
                  ? `OMD Browser setup awaits the user: ${setup.humanStep ?? 'relaunch and enable the extension'}. Recheck browser status after acknowledgement.`
                  : setup.state === 'needs-browser-choice'
                    ? `Ask which Chromium-family browser the user uses (${setup.candidates?.map(candidate => `${candidate.label} [${candidate.id}]`).join(', ') ?? 'none detected'}); then run omd browser setup --engine user-browser --browser <id> --consent.`
                    : 'Browser setup finished. Recompute stage next and continue the selected work.';
                return { message: { ...message, content: [{ type: 'text', text: `${detail}\n${actionPacket(work)}` }] } };
              } catch (error) {
                if (interrupted()) return;
                return { message: { ...message, content: [{ type: 'text', text: `OMD_BROWSER_SETUP_CONSENT_REQUIRED: Browser setup did not finish: ${error instanceof Error ? error.message : String(error)}\n${actionPacket(work)}` }] } };
              }
            }
            if (choice === '이번엔 건너뛰기' || choice === '다시 묻지 않기') {
              const decision = choice === '다시 묻지 않기' ? 'never-ask' : 'skipped-this-run';
              writeBrowserConsent(decision, task.browserConsentHome);
              writeUserBrowserConsent(decision, task.browserConsentHome);
              const questionRecord = parseUserQuestion(JSON.stringify({ action: { kind: 'browser-consent', question,
                options: ['평소 쓰는 브라우저 그대로 쓰기', 'OMD 전용 로그인 브라우저', '이번엔 건너뛰기', '다시 묻지 않기'] } }))!;
              writeBrowserInterpretation({ questionDigest: questionRecord.digest, userText: choice, agentInterpretation: decision }, task.browserConsentHome);
            } else return { message: { ...message, content: [{ type: 'text', text: `OMD_BROWSER_SETUP_CONSENT_REQUIRED: ${question}\nOptions: 평소 쓰는 브라우저 그대로 쓰기 / OMD 전용 로그인 브라우저 / 이번엔 건너뛰기 / 다시 묻지 않기. No browser session was started.` }] } };
          } else {
            task.onBrowserConsentRequired?.(question);
            return { message: { ...message, content: [{ type: 'text', text: `OMD_BROWSER_SETUP_CONSENT_REQUIRED: ${question}\nOptions: 평소 쓰는 브라우저 그대로 쓰기 / OMD 전용 로그인 브라우저 / 이번엔 건너뛰기 / 다시 묻지 않기. Ask the user; interpret their answer and run omd browser setup --engine user-browser|omd-profile --consent --user-answer "<exact user text>" or omd browser skip --decision skipped-this-run|never-ask --user-answer "<exact user text>". Do not infer consent from keywords.\n${actionPacket(work)}` }] } };
          }
        }
        const askingForPlanning = work.action === 'resolve-planning-evidence' && work.planning.length > 0;
        const decision = work.routeSha256 === null
          ? { retry: false, pass: 0, stalled: true }
          : repairLoop.next(cwd, 'stage', 'selected-run', {
            stage: work.stage, action: work.action, problems: work.problems,
            entryBlockers: work.entryBlockers, next: work.next, validatedStages: work.validatedStages,
            workSha256: work.referenceWork?.workSha256 ?? null,
          }, 0, [...work.validatedStages.map(stage => `stage:${stage}`), ...work.materialProgressIdentities]);
        const retry = !askingForPlanning && decision.retry && typeof pi.sendMessage === 'function';
        const packet = actionPacket(work);
        if (retry) {
          pi.sendMessage?.({ customType: 'omd-stage-repair', display: true,
            content: `OMD selected-stage repair ${decision.pass}. Start with one concise user-visible progress note. Execute the action packet before running another diagnostic check; continue while owned artifacts or the work pointer advance. Never fabricate research, weaken scope/gates, or start production before readiness.\n\n${packet}` },
          { triggerTurn: true, deliverAs: 'followUp' });
        }
        const questions = work.action === 'resolve-planning-evidence'
          ? work.planning.map(item => `- ${item.field}: ${item.text}`).join('\n') : '';
        const korean = koreanMessage(message, task.responseLocale);
        const stallCode = decision.stalled && work.routeSha256 !== null && !askingForPlanning ? 'OMD_REPAIR_STALLED: Three consecutive completed repairs made no material progress.\n' : '';
        const status = korean
          ? `OMD는 ${work.stage} 단계가 아직 미완료입니다. ${retry ? `이제 ${work.owner}가 ${work.action} 작업을 수행${work.next ? `하고 ${work.next}로 검증합니다.` : '합니다.'}` : questions ? '아래 기획 내용의 사용자 근거 확인이 필요합니다.' : decision.stalled && work.referenceWork !== null ? '수집된 실제 화면을 판단하고 아래 소유 작업을 완료해야 합니다.' : decision.stalled ? '같은 상태에서 검사만 반복되어 루프를 멈췄습니다.' : '현재 단계 입력을 해결해야 합니다.'}`
          : `OMD is incomplete at ${work.stage}. ${retry ? `Next, ${work.owner} performs ${work.action}${work.next ? `, then validates with ${work.next}` : ''}.` : questions ? 'User evidence is required for the planning statements below.' : decision.stalled && work.referenceWork !== null ? 'Inspect the acquired screen and complete the owned action below.' : decision.stalled ? 'Checks repeated without owned-artifact progress, so the loop stopped.' : 'Resolve the current stage inputs.'}`;
        return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
          { type: 'text', text: `${stallCode}${status}\n\n${questions || packet}` }] } };
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
    const output = result.text.trim().startsWith('{') ? JSON.parse(result.text) : {};
    const limitations = limitationList(Reflect.get(output, 'limitations'));
    const hostCapabilities = formatCompletionHostCapabilities(Reflect.get(output, 'hostCapabilities'));
    if (limitations.length || hostCapabilities) return { message: { ...message, content: [...(message.content ?? []),
      { type: 'text', text: [limitations.length ? `Limitations (not verified):\n${limitations.map(item => `- ${item}`).join('\n')}` : '', hostCapabilities].filter(Boolean).join('\n\n') }] } };
  } catch (error) {
    if (interrupted()) return;
    if (!(error instanceof Error)) throw error;
    const failure = guardFailure(error);
    const decision = repairLoop.next(cwd, 'completion', task.routeRevision, failure.summary, revision, []);
    const retry = task.productionAttempted && failure.repairable && decision.retry && typeof pi.sendMessage === 'function';
    if (retry) {
      pi.sendMessage?.({ customType: 'omd-gate-repair', display: true,
        content: `OMD repair pass ${decision.pass}: terminal validation failed. Start with one concise user-visible progress note, repair the named selected-stage inputs or rendered review loop, then rerun guard completion. Continue while the relevant artifact or blocker changes; never forge evidence, alter the route to remove requirements, or claim independent review.\n${failure.summary}` },
      { triggerTurn: true, deliverAs: 'followUp' });
    }
    const korean = koreanMessage(message, task.responseLocale);
    const status = korean
      ? `OMD 작업은 미완료입니다. guard completion 검증을 통과하지 못해 최종 완료 보고를 보류했습니다.${retry ? ' 누락된 작업의 수정·재검사 루프를 이어갑니다.' : decision.stalled ? ' 같은 차단에서 검사만 반복되어 루프를 멈췄습니다.' : ' 누락·오래된 산출물 또는 권한 문제를 해결해야 합니다.'}`
      : `OMD is incomplete. The guard completion claim was withheld.${retry ? ' Continuing the repair/recheck loop.' : decision.stalled ? ' Checks repeated without progress, so the loop stopped.' : ' Resolve the missing, stale, or unauthorized inputs.'}`;
    return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'),
      { type: 'text', text: `${decision.stalled && task.productionAttempted ? 'OMD_REPAIR_STALLED: Three consecutive repairs made no material progress.\n' : ''}${status}\n\n${failure.summary}` }] } };
  }
}
