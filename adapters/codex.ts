import { substituter } from './tokens.ts';
import type { AbstractAgent, Emitted } from '../core/types.ts';

const substitute = substituter('codex');

// Published server, not one we run: gives the model eyes (navigate/screenshot) without
// us hosting anything. Our own deterministic measurement stays in the `omd` CLI.
const MCP_SERVERS = {
  mcpServers: {
    'chrome-devtools': {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp@latest', '--headless', '--isolated'],
    },
  },
};

const tomlBasic = (s: string): string =>
  `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

function tomlMultiline(s: string): string {
  const body = s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  return `"""\n${body.endsWith('\n') ? body : `${body}\n`}"""`;
}


/**
 * Codex agent TOML has no tool-restriction key — only name, description, model,
 * model_reasoning_effort, developer_instructions, nickname_candidates, service_tier.
 * Denial is therefore prose here, not policy, exactly as Codex's own read-only agents do
 * it. Claude Code enforces the same list declaratively via disallowedTools.
 */
function denialProse(deny: string[] | undefined): string {
  if (!deny?.length) return '';
  return `\n\nHARD CONSTRAINT: you have no write access. You must never call ${deny.join(', ')}, `
    + 'and you must never ask another agent to write on your behalf. If a change is needed, '
    + 'describe it and stop.\n';
}

const emitAgentFile = (agent: AbstractAgent): string => [
  `name = ${tomlBasic(agent.name)}`,
  `description = ${tomlBasic(agent.description)}`,
  `model = ${tomlBasic(substitute(agent.model))}`,
  `model_reasoning_effort = ${tomlBasic(agent.reasoning)}`,
  `developer_instructions = ${tomlMultiline(`${agent.instructions}${denialProse(agent.deny)}`)}`,
  '',
].join('\n');

export function emitCodex({ agents = [] }: { agents?: AbstractAgent[] } = {}): Emitted {
  const files: Record<string, unknown> = {};

  for (const agent of agents) files[`agents/${agent.name}.toml`] = emitAgentFile(agent);

  files['.mcp.json'] = MCP_SERVERS;

  files['.codex-plugin/plugin.json'] = {
    name: 'oh-my-design',
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      displayName: 'Oh My Design',
      shortDescription: 'Design cognition loop — frame, diverge, see, reframe',
      capabilities: ['Hooks', 'Skills', 'Subagents', 'Design Lint'],
    },
  };

  return { files };
}
