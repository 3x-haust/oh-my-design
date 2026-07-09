import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitCodex } from '../adapters/codex.ts';
import { emitClaude } from '../adapters/claude.ts';
import { hookFile, jsonFile, textFile, firstCommand, matcherOf, must } from './helpers.ts';

interface CodexManifest {
  name: string;
  skills: string;
  hooks: string[];
  agents?: unknown;
  mcpServers?: string;
}

const AGENT = {
  name: 'omd-eye',
  description: 'Critiques the rendered result. Never edits.',
  reasoning: 'high',
  model: '@high',
  deny: ['Write', 'Edit', 'apply_patch'],
  instructions: 'You do not know why this was built.\n',
};

// ── The single most dangerous line in the project. ──
// If the matcher is wrong, the gate vanishes silently: the product still
// appears to work, but nothing enforces frame approval.

test('no @token survives emission', () => {
  const all = [emitCodex({ agents: [AGENT] }), emitClaude({ agents: [AGENT] })];
  for (const out of all) {
    const dump = JSON.stringify(out.files);
    assert.ok(!/@fileWrite|@pluginRoot|@high/.test(dump), `unsubstituted token in ${dump.slice(0, 200)}`);
  }
});

test('agents render to toml for codex and md for claude, with the right model', () => {
  const toml = textFile(emitCodex({ agents: [AGENT] }), 'agents/omd-eye.toml');
  assert.match(toml, /^name = "omd-eye"/m);
  assert.match(toml, /model = "gpt-5\.5"/);
  assert.match(toml, /model_reasoning_effort = "high"/);
  assert.match(toml, /developer_instructions = """/);

  const md = textFile(emitClaude({ agents: [AGENT] }), 'agents/omd-eye.md');
  assert.match(md, /^---\n/);
  assert.match(md, /^model: claude-opus-4-8$/m);
  assert.match(md, /^name: omd-eye$/m);
  assert.ok(md.includes('You do not know why this was built.'));
});

test('codex manifest carries no agents key — agents are installed via config.toml', () => {
  const manifest = jsonFile<CodexManifest>(emitCodex({ agents: [AGENT] }), '.codex-plugin/plugin.json');
  assert.equal(manifest.agents, undefined);
  assert.equal(manifest.skills, './skills/');
});

// ── chrome-devtools MCP: consumed, not run by us ──

interface McpFile {
  mcpServers: Record<string, { command: string; args: string[] }>;
}

interface ClaudeManifest {
  mcpServers?: string;
}

test('both hosts emit .mcp.json registering the published chrome-devtools-mcp server', () => {
  for (const emitted of [emitCodex({}), emitClaude({})]) {
    const mcp = jsonFile<McpFile>(emitted, '.mcp.json');
    const server = must(mcp.mcpServers['chrome-devtools'], 'chrome-devtools');
    assert.equal(server.command, 'npx');
    assert.deepEqual(server.args, ['-y', 'chrome-devtools-mcp@latest']);
  }
});

test('both plugin manifests point mcpServers at ./.mcp.json', () => {
  const cx = jsonFile<CodexManifest>(emitCodex({}), '.codex-plugin/plugin.json');
  const cl = jsonFile<ClaudeManifest>(emitClaude({}), '.claude-plugin/plugin.json');
  assert.equal(cx.mcpServers, './.mcp.json');
  assert.equal(cl.mcpServers, './.mcp.json');
});
