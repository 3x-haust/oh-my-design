import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as yaml } from 'yaml';
import { parse as toml } from 'smol-toml';
import { readBuildAgents } from '../../adapters/build-identity.ts';
import { emitClaude, emitClaudePlugin } from '../../adapters/claude.ts';
import { emitCodex } from '../../adapters/codex.ts';
import { substituter } from '../../adapters/tokens.ts';
export const promptRoot = fileURLToPath(new URL('../..', import.meta.url));
export function assertRoleDelivery(role: string): void {
  const agent = readBuildAgents(promptRoot).find(a => a.name === `omd-${role}`)!;
  assert.ok(agent); assert.equal(agent.model, undefined);
  const claude = emitClaude({ agents: [agent] }).files[`agents/${agent.name}.md`] as string;
  const codex = emitCodex({ agents: [agent] }).files[`agents/${agent.name}.toml`] as string;
  const frontmatter = yaml(/^---\n([\s\S]*?)\n---/.exec(claude)![1]!);
  assert.equal(frontmatter.model, 'inherit'); assert.equal(frontmatter.effort, agent.reasoning);
  assert.equal(claude.split('\n---\n')[1]!.trim(), substituter('claude')(agent.instructions).trim());
  const config = toml(codex); assert.equal(config.model, undefined); assert.equal(config.model_reasoning_effort, agent.reasoning);
  assert.equal(typeof config.developer_instructions, 'string');
  assert.ok((config.developer_instructions as string).startsWith(substituter('codex')(agent.instructions)));
  for (const [host, extension, expected] of [['claude', 'md', claude], ['codex', 'toml', codex]] as const) {
    assert.equal(readFileSync(join(promptRoot, `dist/${host}/agents/${agent.name}.${extension}`), 'utf8'), expected);
  }
  const plugin = emitClaudePlugin({ agents: [agent] }).files[`agents/${role}.md`];
  assert.equal(readFileSync(join(promptRoot, `agents/${role}.md`), 'utf8'), plugin);
}
