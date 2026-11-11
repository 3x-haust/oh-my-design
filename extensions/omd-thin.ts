import { join } from 'node:path';
import { runPiColdEye } from '../core/thin/eye.ts';
import { readThinState } from '../core/thin/state.ts';

/**
 * Pi side of the design loop behind the one user-facing entry, omd-ultradesign. A session that invokes it is exempt
 * from the older OMD workflow gates (it never classifies a route), asks the cold eye through `omd_cli thin eye --run`
 * on its own model, and at a cycle boundary opens a fresh Pi session that carries nothing but what the loop files hold.
 */
export const ENTRY_SKILL = 'omd-ultradesign';
/**
 * Pi has no hidden commands, so the restart command carries the entry's own name: `/omd-ultradesign` with no words
 * opens the fresh session when a cycle is due, and otherwise hands the words to `/skill:omd-ultradesign`.
 */
export const ENTRY_COMMAND = ENTRY_SKILL;
const ENTRY_PROMPT = /\bomd-ultradesign\b|(?:^|\s)\/ultradesign(?:\s|$)/;

/** Whether a prompt invokes (or expands) the entry skill. */
export const isThinPrompt = (prompt: string): boolean => ENTRY_PROMPT.test(prompt);

type ThinContext = Readonly<{ cwd: string; model?: Readonly<{ provider: string; id: string }>; ui?: { notify?(message: string, level?: 'info' | 'warning' | 'error'): void } }>;
type FreshSession = Readonly<{ sendUserMessage(content: string, options?: { expandPromptTemplates?: boolean }): Promise<void> }>;
type CommandContext = ThinContext & Readonly<{
  waitForIdle?(): Promise<void>;
  newSession?(options: { withSession?: (context: FreshSession) => Promise<void> }): Promise<{ cancelled: boolean }>;
}>;
type ThinPiApi = Readonly<{
  registerCommand(name: string, definition: { description: string; handler(args: string, context: CommandContext): Promise<void> }): void;
  on?(event: string, handler: (event: unknown, context: ThinContext) => Promise<unknown>): void;
  sendUserMessage?(content: string, options?: { expandPromptTemplates?: boolean }): void;
}>;

export class ThinSessions {
  private readonly thin = new Set<string>();
  private readonly restarted = new Map<string, number>();
  private readonly enabled: boolean;
  constructor(enabled = true) { this.enabled = enabled; }
  /** Once a session invokes the entry it stays a loop session; replies such as "one more" need not repeat the name. */
  observe(cwd: string, prompt: string): void {
    if (this.enabled && isThinPrompt(prompt)) this.thin.add(cwd);
  }
  has(cwd: string): boolean { return this.thin.has(cwd); }
  clear(): void { this.thin.clear(); this.restarted.clear(); }
  /** A closed cycle whose successor is due opens one fresh session, once. */
  restartDue(cwd: string): number | null {
    if (!this.thin.has(cwd)) return null;
    let state;
    try { state = readThinState(cwd); } catch { return null; }
    if (state?.phase !== 'next' || this.restarted.get(cwd) === state.cycle) return null;
    this.restarted.set(cwd, state.cycle);
    return state.cycle + 1;
  }
}

export const isThinEyeRun = (args: readonly string[]): boolean => args[0] === 'thin' && args[1] === 'eye' && args.includes('--run');

/**
 * `omd_cli thin eye --run`: the packet is assembled and the answer saved by the OMD CLI (its guarded project writer);
 * in between, a fresh tool-less Pi on the session's provider and model looks at the packet images.
 */
export async function runThinEye(context: ThinContext, cli: (args: readonly string[]) => Promise<{ text: string }>, signal?: AbortSignal): Promise<string> {
  if (context.model === undefined) throw new Error('OMD_THIN_EYE: the session has no model to inherit');
  const packet = JSON.parse((await cli(['thin', 'packet', '--json'])).text) as { dir: string; result: string[]; other?: string[]; reference: string[] };
  const entry = process.env.OMD_PI_CLI ?? process.argv[1];
  if (!entry) throw new Error('OMD_THIN_EYE: the Pi entrypoint is unknown');
  const answer = await runPiColdEye({ node: process.execPath, cli: entry, provider: context.model.provider, model: context.model.id },
    join(context.cwd, packet.dir), signal);
  const saved = (await cli(['thin', 'eye', '--record', answer])).text;
  return `The cold eye saw only ${packet.dir} (${packet.result.length} result, ${packet.other?.length ?? 0} other, ${packet.reference.length} reference images). `
    + `Its answer (${saved.trim()}):\n\n${answer}`;
}

/** Only a host with lifecycle hooks can notice a closed cycle, so only such a host gets the restart command. */
export function registerThin(pi: ThinPiApi, sessions: ThinSessions): void {
  const on = 'on' in pi && typeof pi.on === 'function' ? pi.on.bind(pi) : undefined;
  if (on === undefined) return;
  pi.registerCommand(ENTRY_COMMAND, {
    description: 'Design from a one-line request; after a stop, reply "one more" or "continue" (same as /skill:omd-ultradesign)',
    async handler(args, context) {
      await context.waitForIdle?.();
      let state;
      try { state = readThinState(context.cwd); } catch { state = null; }
      const words = args.trim();
      if (words || state?.phase !== 'next') {
        pi.sendUserMessage?.(`/skill:${ENTRY_SKILL}${words ? ` ${words}` : ''}`, { expandPromptTemplates: true });
        return;
      }
      if (context.newSession === undefined) { context.ui?.notify?.(`This Pi cannot open a new session; run /new, then /skill:${ENTRY_SKILL}.`, 'warning'); return; }
      const prompt = `/skill:${ENTRY_SKILL} fresh session: begin cycle ${state.cycle + 1}`;
      await context.newSession({ withSession: async fresh => {
        void fresh.sendUserMessage(prompt, { expandPromptTemplates: true }).catch(() => undefined);
      } });
    },
  });
  on('agent_settled', async (_event, context) => {
    if (!('sendUserMessage' in pi) || typeof pi.sendUserMessage !== 'function') return;
    const cycle = sessions.restartDue(context.cwd);
    if (cycle === null) return;
    context.ui?.notify?.(`Cycle ${cycle - 1} is closed; opening a fresh session for cycle ${cycle}.`, 'info');
    setTimeout(() => { pi.sendUserMessage?.(`/${ENTRY_COMMAND}`, { expandPromptTemplates: true }); }, 0);
  });
}
