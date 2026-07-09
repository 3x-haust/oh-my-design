import { isApproved } from '../frame/index.ts';
import { readSession, isGuarded } from '../session/index.ts';
import type { Decision, HookInput, Session } from '../types.ts';

/**
 * `types.ts` is owned elsewhere and does not carry `filePath` on `HookInput`. Claude Code
 * sends `tool_input.file_path`; Codex sends different shapes. The CLI extracts whichever
 * value it finds and passes it here as `filePath`.
 */
export type PreToolInput = HookInput & { filePath?: string };

interface Deps {
  isApproved?: (cwd: string) => boolean;
  readSession?: (cwd: string) => Session | null;
}

/**
 * Order of checks IS the design:
 *   1. env OMD_NO_FRAME truthy         -> allow  (escape hatch)
 *   2. no session open in cwd          -> allow  (this is not a design project)
 *   3. filePath given, out of scope    -> allow  (a test file, a README: not our business)
 *   4. frame approved                  -> allow
 *   5. otherwise                       -> deny
 * Any throw -> deny (FAIL CLOSED). Never allow on error.
 */
export async function preTool(input: PreToolInput, deps: Deps = {}): Promise<Decision> {
  try {
    const env = input.env ?? process.env;
    if (env['OMD_NO_FRAME']) return { decision: 'allow' };

    const getSession = deps.readSession ?? readSession;
    const session = getSession(input.cwd);
    if (!session) return { decision: 'allow' };

    if (input.filePath && !isGuarded(input.cwd, input.filePath, session)) return { decision: 'allow' };

    const check = deps.isApproved ?? isApproved;
    if (await check(input.cwd)) return { decision: 'allow' };

    return { decision: 'deny', reason: 'Frame not approved. Run `omd frame approve` before writing.' };
  } catch (err) {
    // Codex treats a non-zero exit that is not 2 as "hook failed" and then CONTINUES the
    // tool call. A crash must therefore become a block, not a pass.
    const message = err instanceof Error ? err.message : String(err);
    return { decision: 'deny', reason: `OMD internal error, blocking to stay safe: ${message}` };
  }
}
