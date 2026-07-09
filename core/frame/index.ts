import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Frame } from '../types.ts';

const framePath = (cwd: string): string => join(cwd, '.omd', 'frame.md');

const isEnoent = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';

export function readFrame(cwd: string): Frame | null {
  let text: string;
  try {
    text = readFileSync(framePath(cwd), 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }

  if (!text.startsWith('---\n') && text !== '---') return { approved: false, body: text };

  const closeIndex = text.indexOf('\n---', 3);
  if (closeIndex === -1) return { approved: false, body: text };

  const frontmatter = (parse(text.slice(4, closeIndex)) ?? {}) as Partial<Frame>;
  const rest = text.slice(closeIndex + 4);
  const body = rest.startsWith('\n') ? rest.slice(1) : rest;

  return { ...frontmatter, approved: frontmatter.approved === true, body };
}

export function isApproved(cwd: string): boolean {
  const frame = readFrame(cwd);
  return frame?.approved === true;
}

/**
 * The gate's key must not sit inside the gate. An agent with shell access can call
 * `omd frame approve` itself, so approval refuses two things: a caller with no terminal
 * (an agent's Bash has none), and a frame with no evidence behind its claim.
 *
 * This is not airtight — an agent that reads this file can set the override variable. It
 * moves self-approval from "one obvious command" to "deliberately defeat a named safety
 * flag", which is the honest ceiling when the agent owns the shell.
 */
export function approvalRefusal(frame: Frame, ctx: { isTTY: boolean; env?: NodeJS.ProcessEnv }): string | null {
  const env = ctx.env ?? {};

  if (!ctx.isTTY && env['OMD_ALLOW_NONINTERACTIVE_APPROVE'] !== '1') {
    return 'Approval requires a human at a terminal. Run `omd frame approve` yourself, '
      + 'or set OMD_ALLOW_NONINTERACTIVE_APPROVE=1 if you understand that this lets an '
      + 'agent sign off on its own framing.';
  }
  if (frame.approved) return 'Frame is already approved.';
  if (!frame.why || frame.why.trim().length < 10) {
    return 'Frame has no evidence. A reframing without a cited observation is a guess: '
      + 'add a `why:` field naming the review, ticket, or datum it rests on.';
  }
  if (frame.body.trim().length < 40) {
    return 'Frame is a stub. Approving it would record a sign-off on a design nobody wrote.';
  }
  return null;
}
