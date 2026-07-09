import { isApproved } from '../frame/index.mjs';

export async function preTool(input, deps = {}) {
  try {
    const env = input.env ?? process.env;
    if (env.OMD_NO_FRAME) return { decision: 'allow' };

    const check = deps.isApproved ?? isApproved;
    const approved = await check(input.cwd);
    if (approved) return { decision: 'allow' };

    return {
      decision: 'deny',
      reason: 'Frame not approved. Run `omd frame approve` before writing.',
    };
  } catch (err) {
    return {
      decision: 'deny',
      reason: `OMD internal error, blocking to stay safe: ${err.message}`,
    };
  }
}
