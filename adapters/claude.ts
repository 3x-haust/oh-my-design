import { substituter } from './tokens.ts';
import type { AbstractAgent, AbstractHook, Emitted } from '../core/types.ts';

const substitute = substituter('claude');

const yamlScalar = (s: string): string => JSON.stringify(s.replace(/\s*\n\s*/g, ' ').trim());

function emitAgentFile(agent: AbstractAgent): string {
  const frontmatter = [
    '---',
    `name: ${agent.name}`,
    `description: ${yamlScalar(agent.description)}`,
    `model: ${substitute(agent.model)}`,
  ];
  if (agent.deny?.length) frontmatter.push(`disallowedTools: ${agent.deny.join(', ')}`);
  frontmatter.push('---', '');
  return `${frontmatter.join('\n')}\n${agent.instructions}`;
}

export function emitClaude({ hooks = [], agents = [] }: { hooks?: AbstractHook[]; agents?: AbstractAgent[] } = {}): Emitted {
  const files: Record<string, unknown> = {};

  const merged: Record<string, unknown[]> = {};
  for (const hook of hooks) {
    (merged[hook.event] ??= []).push({
      matcher: substitute(hook.matcher),
      hooks: [{ type: 'command', command: substitute(hook.command), timeout: hook.timeout }],
    });
  }
  if (hooks.length) files['hooks/hooks.json'] = { hooks: merged };

  for (const agent of agents) files[`agents/${agent.name}.md`] = emitAgentFile(agent);

  files['.claude-plugin/plugin.json'] = {
    name: 'oh-my-design',
    description: 'Design cognition loop — frame, diverge, see, reframe',
    skills: './skills/',
    agents: './agents/',
    hooks: './hooks/hooks.json',
  };

  return { files };
}
