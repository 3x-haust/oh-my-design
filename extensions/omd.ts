import { fileURLToPath } from 'node:url';
import { Type } from 'typebox';

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

type PortablePiContext = Readonly<{ cwd: string }>;

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
}>;

function boundedOutput(result: ExecResult): string {
  const combined = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n');
  if (combined.length <= MAX_OUTPUT_CHARS) return combined;
  return `${combined.slice(0, MAX_OUTPUT_CHARS)}\n[OMD output truncated]`;
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
  pi.registerTool({
    name: OMD_TOOL_NAME,
    label: 'OMD CLI',
    description: 'Run the packaged Oh My Design CLI in the current project with structured arguments.',
    promptSnippet: 'Use omd_cli for OMD validation, rendering, evidence, reference, and project-state commands.',
    parameters: Type.Object({
      args: Type.Array(Type.String(), { minItems: 1 }),
    }, { additionalProperties: false }),
    async execute(_toolCallId, params, signal, _onUpdate, context) {
      if (!Array.isArray(params.args) || params.args.length === 0 || params.args.some((arg) => typeof arg !== 'string')) {
        throw new Error('OMD_CLI_ARGS_INVALID: args must be a non-empty string array');
      }
      const result = await runOmd(pi, params.args, context.cwd, signal);
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
        const result = await runOmd(pi, ['doctor'], context.cwd);
        context.ui.notify(result.text, 'info');
      } catch (error) {
        context.ui.notify(error instanceof Error ? error.message : String(error), 'error');
      }
    },
  });
}
