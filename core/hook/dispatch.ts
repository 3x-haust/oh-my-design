import { isApproved } from '../frame/index.ts';
import type { Decision, HookInput } from '../types.ts';

interface Deps {
  isApproved?: (cwd: string) => boolean;
}

export async function preTool(input: HookInput, deps: Deps = {}): Promise<Decision> {
  try {
    const env = input.env ?? process.env;
    if (env['OMD_NO_FRAME']) return { decision: 'allow' };

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
