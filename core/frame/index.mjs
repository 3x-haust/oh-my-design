import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

function framePath(cwd) {
  return join(cwd, '.design', 'frame.md');
}

export function readFrame(cwd) {
  let text;
  try {
    text = readFileSync(framePath(cwd), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  if (!text.startsWith('---\n') && text !== '---') {
    return { approved: false, body: text };
  }

  const closeIndex = text.indexOf('\n---', 3);
  if (closeIndex === -1) {
    return { approved: false, body: text };
  }

  const yamlText = text.slice(4, closeIndex);
  const rest = text.slice(closeIndex + 4);
  const body = rest.startsWith('\n') ? rest.slice(1) : rest;
  const frontmatter = parse(yamlText) ?? {};

  return { ...frontmatter, body };
}

// The gate's key must not sit inside the gate. An agent with shell access can call
// `omd frame approve` itself, so approval refuses two things: a caller with no terminal
// (an agent's Bash has no TTY), and a frame with no evidence behind its claim.
//
// This is not airtight — an agent that reads this file can set the override variable.
// It moves self-approval from "one obvious command" to "deliberately defeat a named
// safety flag", which is the honest ceiling when the agent owns the shell.
export function approvalRefusal(frame, { isTTY, env = {} }) {
  if (!isTTY && env.OMD_ALLOW_NONINTERACTIVE_APPROVE !== '1') {
    return 'Approval requires a human at a terminal. Run `omd frame approve` yourself, '
      + 'or set OMD_ALLOW_NONINTERACTIVE_APPROVE=1 if you understand that this lets an '
      + 'agent sign off on its own framing.';
  }
  if (frame.approved === true) return 'Frame is already approved.';
  if (!frame.why || String(frame.why).trim().length < 10) {
    return 'Frame has no evidence. A reframing without a cited observation is a guess: '
      + 'add a `why:` field naming the review, ticket, or datum it rests on.';
  }
  if (frame.body.trim().length < 40) {
    return 'Frame is a stub. Approving it would record a sign-off on a design nobody wrote.';
  }
  return null;
}

export function isApproved(cwd) {
  let frame;
  try {
    frame = readFrame(cwd);
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
  if (frame === null) return false;
  return frame.approved === true;
}
