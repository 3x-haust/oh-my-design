import { createRequire } from 'node:module';
import { dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOmdRuntimeSnapshot } from './omd-runtime-snapshot.ts';

const MAX_OUTPUT_CHARS = 50_000;
const require = createRequire(import.meta.url);
const tsxPath = require.resolve('tsx');
const dependencyMarker = `${sep}node_modules${sep}`;
const dependencyIndex = tsxPath.indexOf(dependencyMarker);
if (dependencyIndex < 0) throw new Error('OMD_RUNTIME_DEPENDENCIES_INVALID: tsx did not resolve through node_modules');
const runtimeSnapshot = createOmdRuntimeSnapshot({
  sourceRoot: dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
  dependencyRoot: tsxPath.slice(0, dependencyIndex + dependencyMarker.length - 1),
});
const OMD_ENTRY = runtimeSnapshot.entryPath;
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
