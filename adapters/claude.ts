import { substituter } from './tokens.ts';
import type { AbstractAgent, Emitted } from '../core/types.ts';

const substitute = substituter('claude');

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

const yamlScalar = (s: string): string => JSON.stringify(s.replace(/\s*\n\s*/g, ' ').trim());

function emitAgentFile(agent: AbstractAgent): string {
  const frontmatter = [
    '---',
    `name: ${agent.name}`,
    `description: ${yamlScalar(agent.description)}`,
  ];
  if (agent.deny?.length) frontmatter.push(`disallowedTools: ${agent.deny.join(', ')}`);
  frontmatter.push('---', '');
  return `${frontmatter.join('\n')}\n${substitute(agent.instructions)}`;
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

// ── Plugin flavor (repo root, marketplace-installed as `oh-my-design`) ──
//
// A marketplace plugin loads skills/agents under its own namespace: an agent installed
// from plugin "oh-my-design" is addressed as `oh-my-design:eye`, not `omd-eye`. The dist/
// emission above stays bare-name for direct/manual installs and must not change. This
// flavor is a second, parallel emission: same agents, same MCP server, but names stripped
// of their "omd-" prefix and cross-references rewritten to the "oh-my-design:" plugin form.

// "omd-scout" is both an agent and a skill name; either pattern maps it to
// "oh-my-design:scout" — harmless overlap, the contexts (subagent spawn vs. skill mention)
// differ. Agent pattern runs first only to keep the read order obvious; running skill
// pattern first would be equally correct since neither pattern's output can match the
// other's input. "omd-figma" is skill-only — it has no agent counterpart.
const AGENT_REF = /\bomd-(composer|framer|eye|glance|hand|scout|sketch|typesetter|writer)\b/g;
const SKILL_REF = /\bomd-(ultradesign|humanize|critique|coach|figma|scout)\b/g;

const pluginizeRefs = (text: string): string => text.replace(AGENT_REF, 'oh-my-design:$1').replace(SKILL_REF, 'oh-my-design:$1');

const stripOmdPrefix = (name: string): string => (name.startsWith('omd-') ? name.slice(4) : name);

function emitAgentFilePlugin(agent: AbstractAgent): string {
  const frontmatter = [
    '---',
    `name: ${stripOmdPrefix(agent.name)}`,
    `description: ${yamlScalar(pluginizeRefs(agent.description))}`,
  ];
  if (agent.deny?.length) frontmatter.push(`disallowedTools: ${agent.deny.join(', ')}`);
  frontmatter.push('---', '');
  return `${frontmatter.join('\n')}\n${pluginizeRefs(substitute(agent.instructions))}`;
}

export function emitClaudePlugin({ agents = [] }: { agents?: AbstractAgent[] } = {}): Emitted {
  const files: Record<string, unknown> = {};

  for (const agent of agents) files[`agents/${stripOmdPrefix(agent.name)}.md`] = emitAgentFilePlugin(agent);

  files['.mcp.json'] = MCP_SERVERS;

  return { files };
}

/**
 * Rewrites one SKILL.md source for the plugin flavor: strips "omd-" from the skill's own
 * `name:` frontmatter (its own identity, stripped bare — same treatment as an agent's own
 * filename/frontmatter), then rewrites every cross-reference to another skill or agent to
 * the "oh-my-design:" plugin form. Both steps run on the whole source, so a skill's
 * description or body mentioning another skill or agent gets the plugin-resolvable form.
 */
export function pluginizeSkill(source: string): { name: string; source: string } {
  const nameLine = /^name:\s*(.+)$/m.exec(source);
  const rawName = (nameLine?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
  const bareName = stripOmdPrefix(rawName);

  let rewritten = source;
  if (nameLine) {
    rewritten = rewritten.slice(0, nameLine.index)
      + `name: ${bareName}`
      + rewritten.slice(nameLine.index + nameLine[0].length);
  }
  rewritten = pluginizeRefs(rewritten);

  return { name: bareName, source: rewritten };
}
