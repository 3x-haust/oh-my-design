import type { PortablePiApi, PortablePiEvent } from './omd-runtime.ts';

export const ROUTE_ENTRY_INPUT = '.omd/.cache/route-input.json';
export const ROUTE_ENTRY_VALIDATION = ['route', 'validate', '--input', ROUTE_ENTRY_INPUT, '--json'] as const;
type EntryTask = Readonly<{
  cwd: string;
  sourceSha256: string;
  message: NonNullable<PortablePiEvent['message']>;
  pi: PortablePiApi;
}>;

export class RouteEntryContinuation {
  private readonly sent = new Map<string, string>();
  clear(): void { this.sent.clear(); }
  resume(task: EntryTask) {
    const { cwd, sourceSha256, message, pi } = task;
    const retry = this.sent.get(cwd) !== sourceSha256 && typeof pi.sendMessage === 'function';
    if (retry) {
      const packet = { schema: 'omd-route-entry-action-v1', action: 'author-route-input', inputPath: ROUTE_ENTRY_INPUT,
        requestSource: '.omd/request-source.json', sourceSha256,
        starterCommands: [['schema', 'product-route-input', '--json'], ['schema', 'route-input', '--json']],
        afterAuthoring: [ROUTE_ENTRY_VALIDATION, ['route', 'classify', '--input', ROUTE_ENTRY_INPUT, '--json'], ['stage', 'resume', '--json']] };
      this.sent.set(cwd, sourceSha256);
      pi.sendMessage?.({ customType: 'omd-route-entry', display: true,
        content: `The real user requested the full workflow. The missing next work is authoring ${ROUTE_ENTRY_INPUT}; the route itself is not a prerequisite for writing this input. Start with one visible progress note, then author that JSON through the native write tool using the complete captured request and the inspected starter. For a new product use schema product-route-input; for existing or bounded implementation use schema route-input. Reuse the schema and stack result already read; do not repeat diagnostics without writing the input. Schema examples do not supply user facts or authorize narrowing the requested scope. Fill the actual project mode, named dependencies, allowed paths, required outcomes, risk, evidence claims and selected strategy. The host supplies the original request text during validation, so do not retype it. If a required product fact is absent from the original request, ask that specific question; do not invent it. After writing, validate, repair the named errors, classify the same input and continue with stage resume. This action writes only the route input and creates no research, approval or application evidence.\nAction packet: ${JSON.stringify(packet)}` },
      { triggerTurn: true, deliverAs: 'followUp' });
    }
    const korean = message.content?.some(part => part.type === 'text' && /[가-힣]/u.test(part.text ?? ''));
    const text = korean
      ? `OMD 실행 계획 입력이 아직 작성되지 않았습니다. ${retry ? `현재 전체 구현 요청에 따라 ${ROUTE_ENTRY_INPUT}을 작성하고 검증·등록을 이어갑니다.` : '입력 작성이 필요합니다. 작성 없이 검사만 반복해서는 진행할 수 없습니다.'}`
      : `OMD route input has not been authored. ${retry ? `Continuing the authorized full workflow by writing ${ROUTE_ENTRY_INPUT}, then validating and classifying it.` : 'Authoring is required. Repeating checks without authoring the input cannot advance this workflow.'}`;
    return { message: { ...message, content: [...(message.content ?? []).filter(part => part.type !== 'text'), { type: 'text', text }] } };
  }
}
