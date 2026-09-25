import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOmdRuntimeSnapshot, runtimeDependencyRoot } from './omd-runtime-snapshot.ts';

const MAX_OUTPUT_CHARS = 50_000;
const require = createRequire(import.meta.url);
const tsxPath = require.resolve('tsx');
const runtimeSnapshot = createOmdRuntimeSnapshot({
  sourceRoot: dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
  dependencyRoot: runtimeDependencyRoot(tsxPath),
});
process.once('exit', runtimeSnapshot.dispose);

export const OMD_COMMAND_NAME = 'omd';

export function registerDoctorCommand(pi: PortablePiApi, doctor: (cwd: string) => Promise<{ text: string }>, hooksAvailable: boolean): void {
  pi.registerCommand(OMD_COMMAND_NAME, {
    description: 'Check this project with Oh My Design',
    async handler(args, context) {
      if (args.trim() !== '') {
        context.ui.notify('Usage: /omd', 'warning');
        return;
      }
      try {
        const result = await doctor(context.cwd);
        context.ui.notify(`${result.text}${hooksAvailable ? '' : '\nOMD_HOST_GUARD_UNAVAILABLE: this host exposes no event hooks; only explicit CLI checks are available.'}`, hooksAvailable ? 'info' : 'warning');
      } catch (error) {
        context.ui.notify(error instanceof Error ? error.message : String(error), 'error');
      }
    },
  });
}

type ExecResult = Readonly<{
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
}>;

export type OmdRunResult = Readonly<{
  text: string;
  details: { code: number; killed: boolean };
}>;

export type OmdProgressCallback = (update: Readonly<{
  content: Array<{ type: 'text'; text: string }>;
  details: Readonly<{ status: 'queued' | 'running'; elapsedSeconds: number }>;
}>) => void;

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function displayTarget(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.host : '입력 파일';
  } catch { return '입력 파일'; }
}

export function formatOmdProgress(args: readonly string[], status: 'queued' | 'running', elapsedSeconds: number): string {
  const [root, action] = args;
  const lane = optionValue(args, '--lane');
  const prefix = lane === 'design' ? '디자인 ' : lane === 'domain' ? '도메인 ' : '';
  const task = root === 'ref' && action === 'navigate' ? `${prefix}레퍼런스 사이트 방문·관찰`
    : root === 'ref' && action === 'add' ? `${prefix}레퍼런스 화면 캡처·측정`
      : root === 'ref' && action === 'search' ? '레퍼런스 검색 결과 확인'
        : root === 'ref' && action === 'discover-batch' ? '레퍼런스 검색·사이트 방문 병렬 수집'
        : root === 'ref' && action === 'add-batch' ? '레퍼런스 여러 화면 캡처'
          : [root, action].filter(Boolean).join(' ') || 'OMD 명령';
  const target = displayTarget(root === 'ref' && ['navigate', 'add'].includes(action ?? '') ? args[2]
    : optionValue(args, '--input') ?? (root === 'ref' && action === 'add-batch' ? args[2] : undefined));
  const elapsed = `${Math.floor(elapsedSeconds / 60)}분 ${elapsedSeconds % 60}초`;
  const heading = status === 'queued' ? 'OMD 대기 중' : 'OMD 실행 중';
  const state = status === 'queued' ? '앞선 OMD 명령이 끝나기를 기다리는 중입니다. 이 명령은 아직 시작되지 않았습니다.'
    : 'CLI 프로세스가 실행 중입니다. 아직 결과가 돌아오지 않아 내부 세부 단계와 완료 여부는 확인되지 않았습니다.';
  const note = elapsedSeconds >= 120 && status === 'running'
    ? '\n2분 이상 결과가 없습니다. 사이트·브라우저 응답이 느리거나 멈췄을 수 있습니다. 원하면 ESC로 중단할 수 있습니다.'
    : root === 'ref' && status === 'running' ? '\n외부 사이트 응답이나 브라우저 캡처에는 시간이 걸릴 수 있습니다.' : '';
  return `${heading} · ${elapsed}\n작업: ${task}${target ? `\n대상: ${target}` : ''}\n상태: ${state}${note}`;
}

export function monitorOmdProgress(
  args: readonly string[], status: 'queued' | 'running', signal: AbortSignal | undefined, onUpdate: OmdProgressCallback | undefined,
): () => void {
  if (onUpdate === undefined) return () => undefined;
  const started = Date.now();
  const update = (): void => {
    const elapsedSeconds = Math.floor((Date.now() - started) / 1000);
    onUpdate({ content: [{ type: 'text', text: formatOmdProgress(args, status, elapsedSeconds) }], details: { status, elapsedSeconds } });
  };
  update();
  const interval = setInterval(() => { if (!signal?.aborted) update(); }, 15_000);
  const stop = (): void => { clearInterval(interval); signal?.removeEventListener('abort', stop); };
  signal?.addEventListener('abort', stop, { once: true });
  return stop;
}

export class OmdCancelledError extends Error {
  override readonly name = 'OmdCancelledError';
  constructor() { super('OMD_CLI_CANCELLED: 요청이 중단되어 이 명령은 완료되지 않았습니다.'); }
}

export class OmdCommandError extends Error {
  override readonly name = 'OmdCommandError';
  readonly output: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly killed: boolean;
  constructor(
    output: string,
    stdout: string,
    stderr: string,
    code: number,
    killed: boolean,
  ) {
    super(`OMD_CLI_FAILED (${code}): ${output || 'no output'}`);
    this.output = output;
    this.stdout = stdout;
    this.stderr = stderr;
    this.code = code;
    this.killed = killed;
  }
}

type ExecOptions = Readonly<{
  cwd: string;
  signal?: AbortSignal;
}>;

export type PortablePiContext = Readonly<{ cwd: string; signal?: AbortSignal }>;

export type PortablePiEvent = {
  toolCallId?: string; isError?: boolean;
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
    onUpdate: OmdProgressCallback | undefined,
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
  on?(event: 'before_agent_start' | 'tool_call' | 'tool_result' | 'message_end' | 'session_start' | 'input', handler: PortablePiHook): void;
  sendMessage?(message: { customType: string; content: string; display: boolean }, options: { triggerTurn: boolean; deliverAs: 'followUp' }): void;
}>;

function boundedOutput(result: ExecResult): string {
  const combined = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n');
  if (combined.length <= MAX_OUTPUT_CHARS) return combined;
  return `${combined.slice(0, MAX_OUTPUT_CHARS)}\n[OMD output truncated]`;
}

export function guardFailure(error: unknown): { summary: string; repairable: boolean } {
  const raw = error instanceof Error ? error.message : String(error);
  const payload = raw.replace(/^OMD_CLI_FAILED \([^)]*\):\s*/, '');
  let parsed: { blockers?: unknown } | undefined;
  try {
    parsed = JSON.parse(payload) as { blockers?: unknown };
  } catch (parseError) {
    if (!(parseError instanceof SyntaxError)) throw parseError;
  }
  if (parsed !== undefined && Array.isArray(parsed.blockers) && parsed.blockers.length
    && parsed.blockers.every(blocker => typeof blocker === 'string')) {
    const blockers = parsed.blockers as string[];
    return { summary: blockers.slice(0, 12).map(blocker => `- ${blocker}`).join('\n')
      + (blockers.length > 12 ? `\n(+${blockers.length - 12}; omd guard production --json)` : ''),
    repairable: !blockers.some(blocker => /^(?:route:|unconfirmed planning:)|authority|outside the current route|production is not selected|forbids application/i.test(blocker)) };
  }
  return { summary: raw.slice(0, 12000), repairable: /SLOP_REVIEW_REQUIRED:|REFERENCE_APPLICATION_REVIEW:/.test(raw) };
}

export async function runOmd(
  pi: PortablePiApi,
  args: readonly string[],
  cwd: string,
  signal?: AbortSignal,
  onUpdate?: OmdProgressCallback,
): Promise<OmdRunResult> {
  if (signal?.aborted) throw new OmdCancelledError();
  const stopProgress = monitorOmdProgress(args, 'running', signal, onUpdate);
  try {
    let result: ExecResult;
    try { result = await pi.exec('node', [runtimeSnapshot.entryPath, ...args], signal === undefined ? { cwd } : { cwd, signal }); }
    catch (error) {
      if (signal?.aborted) throw new OmdCancelledError();
      throw error;
    }
    if (signal?.aborted) throw new OmdCancelledError();
    const text = boundedOutput(result);
    if (result.code !== 0 || result.killed) {
      throw new OmdCommandError(text, result.stdout, result.stderr, result.code, result.killed);
    }
    return { text: text || 'OMD completed successfully.', details: { code: result.code, killed: result.killed } };
  } finally {
    stopProgress();
  }
}

export function structuredToolDiagnostic(error: unknown, args: readonly string[]): OmdRunResult | null {
  const [root, action] = args;
  const expectedCheck = root === 'guard' || (root === 'route' && action === 'validate')
    || (root === 'brief' && args.includes('--check'))
    || /^(?:check|validate|research-check|apply-check|apply-review-check|review-check|discover-batch)$/.test(action ?? '');
  if (!(error instanceof OmdCommandError) || error.code !== 1 || error.killed || !expectedCheck || !args.includes('--json')
    || error.stderr.trim() !== '' || error.stdout.trim() === '') return null;
  try {
    const parsed: unknown = JSON.parse(error.stdout);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (root === 'ref' && action === 'discover-batch'
      && (!('ok' in parsed) || parsed.ok !== false
        || !('outcomes' in parsed) || !Array.isArray(parsed.outcomes))) return null;
  } catch (parseError) {
    if (parseError instanceof SyntaxError) return null;
    throw parseError;
  }
  return { text: error.stdout.trim(), details: { code: error.code, killed: false } };
}
