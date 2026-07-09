import toolMap from './tool-map.json' with { type: 'json' };

const TOKENS = {
  '@fileWrite': toolMap.fileWrite.codex,
  '@pluginRoot': toolMap.pluginRoot.codex,
  '@high': toolMap.model.high.codex,
  '@medium': toolMap.model.medium.codex,
};

function substitute(value) {
  if (typeof value !== 'string') return value;
  let out = value;
  for (const [token, replacement] of Object.entries(TOKENS)) out = out.split(token).join(replacement);
  return out;
}

function tomlBasic(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function tomlMultiline(s) {
  const body = String(s).replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
  return `"""\n${body.endsWith('\n') ? body : `${body}\n`}"""`;
}

function emitHookFile(hook) {
  return {
    hooks: {
      [hook.event]: [
        {
          matcher: substitute(hook.matcher),
          hooks: [
            {
              type: 'command',
              command: substitute(hook.command),
              timeout: hook.timeout,
              statusMessage: hook.statusMessage,
            },
          ],
        },
      ],
    },
  };
}

// Codex agent TOML has no tool-restriction key — only name, description, model,
// model_reasoning_effort, developer_instructions, nickname_candidates, service_tier.
// Denial is therefore prose here, not policy, exactly as Codex's own read-only
// agents do it. Claude Code enforces the same list declaratively via disallowedTools.
function denialProse(deny) {
  if (!deny?.length) return '';
  return `\n\nHARD CONSTRAINT: you have no write access. You must never call ${deny.join(', ')}, `
    + 'and you must never ask another agent to write on your behalf. If a change is needed, '
    + 'describe it and stop.\n';
}

function emitAgentFile(agent) {
  const instructions = `${agent.instructions ?? ''}${denialProse(agent.deny)}`;
  return [
    `name = ${tomlBasic(agent.name)}`,
    `description = ${tomlBasic(agent.description)}`,
    `model = ${tomlBasic(substitute(agent.model))}`,
    `model_reasoning_effort = ${tomlBasic(agent.reasoning)}`,
    `developer_instructions = ${tomlMultiline(instructions)}`,
    '',
  ].join('\n');
}

export function emitCodex({ hooks = [], agents = [] } = {}) {
  const files = {};

  for (const hook of hooks) files[`hooks/${hook.codexFileName}`] = emitHookFile(hook);
  for (const agent of agents) files[`agents/${agent.name}.toml`] = emitAgentFile(agent);

  files['.codex-plugin/plugin.json'] = {
    name: 'oh-my-design',
    skills: './skills/',
    hooks: hooks.map((h) => `./hooks/${h.codexFileName}`),
    interface: {
      displayName: 'Oh My Design',
      shortDescription: 'Design cognition loop — frame, diverge, see, reframe',
      capabilities: ['Hooks', 'Skills', 'Subagents', 'Design Lint'],
    },
  };

  return { files };
}
