import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { emitCodex } from '../adapters/codex.ts';
import { emitClaude } from '../adapters/claude.ts';
import { must, textFile } from './helpers.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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
  assert.equal(parsed.model, 'gpt-5.6');
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

// ── CLAUDE_PLUGIN_ROOT must never appear in emitted output ──
//
// Regression gate: if any src agent or skill reintroduces ${CLAUDE_PLUGIN_ROOT},
// the emitters for both hosts will carry a path that resolves to nothing on Codex
// (and is fragile on Claude Code too). Both codex and claude emission are checked
// so a host-conditional reintroduction does not slip through.

function loadRealAgents(): import('../core/types.ts').AbstractAgent[] {
  const dir = join(root, 'src', 'agents');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.agent.yaml'))
    .map((f) => parseYaml(readFileSync(join(dir, f), 'utf8')) as import('../core/types.ts').AbstractAgent);
}

function loadRealSkillSources(): string[] {
  const dir = join(root, 'src', 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => join(dir, name, 'SKILL.md'))
    .filter((p) => existsSync(p))
    .map((p) => readFileSync(p, 'utf8'));
}

test('no CLAUDE_PLUGIN_ROOT in emitted codex agent output', () => {
  const agents = loadRealAgents();
  const dump = JSON.stringify(emitCodex({ agents }).files);
  assert.ok(
    !dump.includes('CLAUDE_PLUGIN_ROOT'),
    `CLAUDE_PLUGIN_ROOT leaked into codex emission — update src agent/skill to use omd pack dir instead`,
  );
});

test('no CLAUDE_PLUGIN_ROOT in emitted claude agent output', () => {
  const agents = loadRealAgents();
  const dump = JSON.stringify(emitClaude({ agents }).files);
  assert.ok(
    !dump.includes('CLAUDE_PLUGIN_ROOT'),
    `CLAUDE_PLUGIN_ROOT leaked into claude emission — update src agent/skill to use omd pack dir instead`,
  );
});

test('no CLAUDE_PLUGIN_ROOT in real skill sources', () => {
  for (const source of loadRealSkillSources()) {
    assert.ok(
      !source.includes('CLAUDE_PLUGIN_ROOT'),
      `CLAUDE_PLUGIN_ROOT found in skill source — update to use omd pack dir instead`,
    );
  }
});
