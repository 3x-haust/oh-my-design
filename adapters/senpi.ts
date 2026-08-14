// Senpi host adapter.
//
// Senpi has no in-process agent-spawn tool: its tool set is read/bash/edit/write plus extensions.
// The loop's isolation therefore comes from the process boundary — the coordinator runs each role
// as its own `senpi -p` process with that role's prompt appended to the system prompt. A fresh
// process is a stronger isolation boundary than an in-process fork, so the blind-review and
// clean-room invariants hold; what it costs is that the coordinator must wait on a command instead
// of an agent handle, and roles cannot message each other mid-task.

import { substituter } from './tokens.ts';
import type { BuildIdentity } from './build.ts';
import type { AbstractAgent, Emitted } from '../core/types.ts';
import { senpiSpawnArgs, senpiThinking } from './senpi-runtime.ts';

const substitute = substituter('senpi');

/**
 * One role prompt. The coordinator starts it through `omd host senpi run`, which resolves the
 * installed prompt and effort without shell interpolation or a concrete model override.
 */
export function emitSenpiAgentFile(agent: AbstractAgent): string {
  return [
    `<!-- ${agent.name} — run this as its own senpi process, never inline. -->`,
    '<!-- senpi spawn:',
    `  omd host senpi run --agent ${agent.name} --input <task.md>`,
    '-->',
    '',
    `# ${agent.name}`,
    '',
    agent.description === undefined ? '' : `${agent.description}\n`,
    substitute(agent.instructions),
    '',
  ].filter((line) => line !== '').join('\n');
}

export function emitSenpi({
  agents = [],
  buildIdentity,
}: {
  agents?: AbstractAgent[];
  buildIdentity?: BuildIdentity;
} = {}): Emitted {
  const files: Record<string, unknown> = {};
  for (const agent of agents) files[`agents/${agent.name}.md`] = emitSenpiAgentFile(agent);
  files['omd-host.json'] = {
    host: 'senpi',
    spawn: {
      // Documented as data so the skill and the installer cannot drift from each other.
      command: 'senpi',
      args: senpiSpawnArgs('<tier>', '<role prompt>', '<task>'),
      isolation: 'process',
      note: 'Senpi exposes no agent-spawn tool; each role is a separate process and returns through stdout.',
    },
    agents: agents.map((agent) => ({ name: agent.name, thinking: senpiThinking(agent.reasoning) })),
    ...(buildIdentity === undefined ? {} : { buildIdentity }),
  };
  return { files };
}

export { senpiThinking } from './senpi-runtime.ts';
