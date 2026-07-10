import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitCodex } from '../adapters/codex.ts';
import { emitClaude, emitClaudePlugin, pluginizeSkill } from '../adapters/claude.ts';
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
    assert.deepEqual(server.args, ['-y', 'chrome-devtools-mcp@latest', '--headless', '--isolated']);
  }
});

test('both plugin manifests point mcpServers at ./.mcp.json', () => {
  const cx = jsonFile<CodexManifest>(emitCodex({}), '.codex-plugin/plugin.json');
  const cl = jsonFile<ClaudeManifest>(emitClaude({}), '.claude-plugin/plugin.json');
  assert.equal(cx.mcpServers, './.mcp.json');
  assert.equal(cl.mcpServers, './.mcp.json');
});

// ── marketplace plugin flavor (repo root, `omd:` namespace) ──

const PLUGIN_AGENT = {
  name: 'omd-framer',
  description: 'Interrogates a design brief. References omd-eye and omd-humanize.',
  reasoning: 'high',
  model: '@high',
  instructions: 'Before you finish, spawn omd-eye and omd-humanize to check the result.\n',
};

test('emitClaudePlugin strips the omd- prefix from agent filename and frontmatter name', () => {
  const emitted = emitClaudePlugin({ agents: [PLUGIN_AGENT] });
  assert.equal(emitted.files['agents/omd-framer.md'], undefined);

  const md = textFile(emitted, 'agents/framer.md');
  assert.match(md, /^name: framer$/m);
  assert.ok(!md.includes('omd-framer'), `filename prefix leaked into body: ${md}`);
});

test('emitClaudePlugin rewrites subagent/skill cross-references to the omd: plugin form', () => {
  const md = textFile(emitClaudePlugin({ agents: [PLUGIN_AGENT] }), 'agents/framer.md');
  assert.ok(md.includes('omd:eye'), `expected omd:eye in body: ${md}`);
  assert.ok(md.includes('omd:humanize'), `expected omd:humanize in body: ${md}`);
});

test('emitClaudePlugin emits only agents/*.md and .mcp.json — no .claude-plugin/plugin.json', () => {
  const emitted = emitClaudePlugin({ agents: [PLUGIN_AGENT] });
  assert.equal(emitted.files['.claude-plugin/plugin.json'], undefined);
  assert.ok(emitted.files['.mcp.json']);
});

test('emitClaudePlugin leaves no bare omd- token in any emitted file', () => {
  const emitted = emitClaudePlugin({ agents: [PLUGIN_AGENT] });
  const dump = JSON.stringify(emitted.files);
  assert.ok(!/\bomd-/.test(dump), `leftover omd- token: ${dump}`);
});

const SKILL_FIXTURE = [
  '---',
  'name: omd-ultradesign',
  'description: Spawns omd-scout for references and omd-humanize for copy.',
  '---',
  '',
  '# omd-ultradesign',
  '',
  'Spawn `omd-scout` for a reference board, then `omd-humanize` on the final copy.',
  '',
].join('\n');

test('pluginizeSkill strips the omd- prefix from the frontmatter name', () => {
  const { name } = pluginizeSkill(SKILL_FIXTURE);
  assert.equal(name, 'ultradesign');
});

test('pluginizeSkill rewrites cross-references and leaves no bare omd- token', () => {
  const { source } = pluginizeSkill(SKILL_FIXTURE);
  assert.ok(source.includes('omd:scout'), `expected omd:scout: ${source}`);
  assert.ok(source.includes('omd:humanize'), `expected omd:humanize: ${source}`);
  assert.ok(!/\bomd-/.test(source), `leftover omd- token: ${source}`);
});
