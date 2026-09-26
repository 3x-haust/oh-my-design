import { readPiRequest } from './omd-request-source.ts';
import { ensureNativePiRun, stageNativePiCommand } from '../core/runtime/native-pi-run.ts';
import { fileURLToPath } from 'node:url';

export type PiHostContext = Readonly<{
  cwd: string;
  model?: Readonly<{ provider: string; id: string }>;
  thinkingLevel?: string;
  sessionManager?: Readonly<{ getSessionId(): string }>;
}>;
type ObservedHost = Readonly<{ provider: string; model: string; thinkingLevel: string; parentSessionId: string }>;
type PreparedCommand = Readonly<{ args: readonly string[]; dispose(): void }>;

export class PiNativeRuns {
  private readonly hosts = new Map<string, ObservedHost>();

  clear(): void { this.hosts.clear(); }

  observe(context: PiHostContext): void {
    if (context.model === undefined) return;
    if (context.sessionManager === undefined || context.thinkingLevel === undefined) {
      throw new Error('NATIVE_PI_AUTHORITY: host model is available but session identity or thinking level is missing');
    }
    this.hosts.set(context.cwd, { provider: context.model.provider, model: context.model.id,
      thinkingLevel: context.thinkingLevel, parentSessionId: context.sessionManager.getSessionId() });
  }

  prepare(cwd: string, args: readonly string[], runtimeRoot: string): PreparedCommand {
    if (args.some(arg => arg === '--pi-command' || arg.startsWith('--pi-command='))) {
      throw new Error('NATIVE_PI_AUTHORITY: command descriptors belong to the native host, not tool arguments');
    }
    const host = this.hosts.get(cwd);
    if (host === undefined || readPiRequest(cwd) === undefined) return { args, dispose() {} };
    const run = ensureNativePiRun({ root: cwd, runtimeRoot,
      loadedSkillPath: fileURLToPath(new URL('../src/skills/omd-ultradesign/SKILL.md', import.meta.url)), ...host });
    const command = stageNativePiCommand({ run, runtimeRoot, argv: args });
    return { args: command.argv, dispose: command.dispose };
  }
}
