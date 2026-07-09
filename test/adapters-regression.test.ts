import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { emitCodex } from '../adapters/codex.ts';
import { emitClaude } from '../adapters/claude.ts';
import { must, textFile } from './helpers.ts';

interface AgentToml {
  name?: string;
  description?: string;
  model?: string;
  model_reasoning_effort?: string;
  developer_instructions?: string;
  [key: string]: unknown;
}

// Found in review: agent fields were interpolated into TOML and YAML unescaped.
const NASTY = {
  name: 'omd-eye',
  description: 'Critiques "rendered" output: never edits. C:\\path\\to',
  reasoning: 'high',
  model: '@high',
  deny: ['Write', 'Edit', 'apply_patch'],
  instructions: 'Quote test: """ and a backslash \\ and a colon: here.\n',
};

test('codex agent toml survives quotes, colons and backslashes', () => {
  const toml = textFile(emitCodex({ agents: [NASTY] }), 'agents/omd-eye.toml');
  const parsed = parseToml(toml) as unknown as AgentToml;
  assert.equal(parsed.name, 'omd-eye');
  assert.equal(parsed.description, NASTY.description);
  assert.equal(parsed.model, 'gpt-5.5');
  assert.ok(must(parsed.developer_instructions, 'developer_instructions').includes('Quote test:'));
});

test('claude agent frontmatter survives quotes and colons', () => {
  const md = textFile(emitClaude({ agents: [NASTY] }), 'agents/omd-eye.md');
  const fm = parseYaml(must(md.split('---')[1], 'frontmatter'));
  assert.equal(fm.name, 'omd-eye');
  assert.equal(fm.model, 'claude-opus-4-8');
  assert.ok(fm.description.includes('"rendered"'));
  assert.ok(md.includes('Quote test:'));
});

// Found in review: Codex agent TOML has no tool-restriction key at all. Claude Code
// enforces `deny` declaratively; Codex can only be told. Dropping `deny` on the floor
// would let omd-eye edit the very files it is supposed to judge from the outside.
test('claude enforces deny declaratively', () => {
  const md = textFile(emitClaude({ agents: [NASTY] }), 'agents/omd-eye.md');
  const fm = parseYaml(must(md.split('---')[1], 'frontmatter'));
  assert.equal(fm.disallowedTools, 'Write, Edit, apply_patch');
});

test('codex carries deny into the prompt, since it cannot carry it into policy', () => {
  const toml = textFile(emitCodex({ agents: [NASTY] }), 'agents/omd-eye.toml');
  const cfg = parseToml(toml) as unknown as AgentToml;
  const instructions = must(cfg.developer_instructions, 'developer_instructions');
  assert.match(instructions, /never call Write, Edit, apply_patch/);
  for (const key of ['tools', 'allowed_tools', 'disallowed_tools', 'permissions']) {
    assert.equal((parseToml(toml) as unknown as AgentToml)[key], undefined, `codex agent schema has no ${key}; do not invent one`);
  }
});

test('an agent with no deny list gets no denial prose', () => {
  const plain = { ...NASTY, deny: [] };
  const toml = textFile(emitCodex({ agents: [plain] }), 'agents/omd-eye.toml');
  const cfg = parseToml(toml) as unknown as AgentToml;
  const instructions = must(cfg.developer_instructions, 'developer_instructions');
  assert.ok(!/HARD CONSTRAINT/.test(instructions));
});
