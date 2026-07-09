import { substituter } from './tokens.ts';
import type { AbstractAgent, Emitted } from '../core/types.ts';

const substitute = substituter('claude');

// Published server, not one we run: gives the model eyes (navigate/screenshot) without
// us hosting anything. Our own deterministic measurement stays in the `omd` CLI.
const MCP_SERVERS = {
  mcpServers: {
    'chrome-devtools': { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] },
  },
};

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

export function emitClaude({ agents = [] }: { agents?: AbstractAgent[] } = {}): Emitted {
  const files: Record<string, unknown> = {};


  for (const agent of agents) files[`agents/${agent.name}.md`] = emitAgentFile(agent);

  files['.mcp.json'] = MCP_SERVERS;

  files['.claude-plugin/plugin.json'] = {
    name: 'oh-my-design',
    description: 'Design cognition loop — frame, diverge, see, reframe',
    skills: './skills/',
    agents: './agents/',
    mcpServers: './.mcp.json',
  };

  return { files };
}
