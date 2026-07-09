import toolMap from './tool-map.json' with { type: 'json' };

const TOKENS = {
  '@fileWrite': toolMap.fileWrite.claude,
  '@pluginRoot': toolMap.pluginRoot.claude,
  '@high': toolMap.model.high.claude,
  '@medium': toolMap.model.medium.claude,
};

function substitute(value) {
  if (typeof value !== 'string') return value;
  let out = value;
  for (const [token, replacement] of Object.entries(TOKENS)) out = out.split(token).join(replacement);
  return out;
}

function yamlScalar(s) {
  return JSON.stringify(String(s).replace(/\s*\n\s*/g, ' ').trim());
}

function emitAgentFile(agent) {
  const frontmatter = [
    '---',
    `name: ${agent.name}`,
    `description: ${yamlScalar(agent.description)}`,
    `model: ${substitute(agent.model)}`,
  ];
  if (agent.deny?.length) frontmatter.push(`disallowedTools: ${agent.deny.join(', ')}`);
  frontmatter.push('---', '');
  return `${frontmatter.join('\n')}\n${agent.instructions ?? ''}`;
}

export function emitClaude({ hooks = [], agents = [] } = {}) {
  const files = {};

  const merged = {};
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
