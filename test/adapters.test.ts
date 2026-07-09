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

const HOOK = {
  id: 'require-frame',
  event: 'PreToolUse',
  matcher: '@fileWrite',
  command: 'node "@pluginRoot/bin/omd.ts" hook pre-tool',
  timeout: 5,
  statusMessage: '(OMD) Checking frame approval',
  codexFileName: 'pre-tool-use-requiring-frame.json',
};

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

test('codex hook matches apply_patch, claude hook matches Write|Edit', () => {
  const cx = emitCodex({ hooks: [HOOK] });
  const cl = emitClaude({ hooks: [HOOK] });
  assert.equal(matcherOf(hookFile(cx, 'hooks/pre-tool-use-requiring-frame.json'), 'PreToolUse'), 'apply_patch');
  assert.equal(matcherOf(hookFile(cl, 'hooks/hooks.json'), 'PreToolUse'), 'Write|Edit');
});

test('no @token survives emission', () => {
  const all = [emitCodex({ hooks: [HOOK], agents: [AGENT] }), emitClaude({ hooks: [HOOK], agents: [AGENT] })];
  for (const out of all) {
    const dump = JSON.stringify(out.files);
    assert.ok(!/@fileWrite|@pluginRoot|@high/.test(dump), `unsubstituted token in ${dump.slice(0, 200)}`);
  }
});

test('each host gets its own plugin-root variable', () => {
  const cx = hookFile(emitCodex({ hooks: [HOOK] }), 'hooks/pre-tool-use-requiring-frame.json');
  const cl = hookFile(emitClaude({ hooks: [HOOK] }), 'hooks/hooks.json');
  assert.ok(firstCommand(cx, 'PreToolUse').includes('${PLUGIN_ROOT}'));
  assert.ok(firstCommand(cl, 'PreToolUse').includes('$CLAUDE_PLUGIN_ROOT'));
});

test('codex emits one file per hook and lists them in the manifest', () => {
  const cx = emitCodex({ hooks: [HOOK] });
  assert.ok(cx.files['hooks/pre-tool-use-requiring-frame.json']);
  const manifest = jsonFile<CodexManifest>(cx, '.codex-plugin/plugin.json');
  assert.deepEqual(manifest.hooks, ['./hooks/pre-tool-use-requiring-frame.json']);
});

test('claude merges every hook into one hooks.json keyed by event', () => {
  const second = { ...HOOK, id: 'enforce-stop', event: 'Stop', matcher: '*', command: 'node "@pluginRoot/bin/omd.ts" hook stop' };
  const cl = emitClaude({ hooks: [HOOK, second] });
  const h = hookFile(cl, 'hooks/hooks.json').hooks;
  assert.equal(Object.keys(h).length, 2);
  assert.ok(h['PreToolUse'] && h['Stop']);
  assert.equal(Object.keys(cl.files).filter((f) => f.startsWith('hooks/')).length, 1);
});

test('codex hook JSON is a stable shim — it must not embed policy', () => {
  const cx = emitCodex({ hooks: [HOOK] });
  const file = hookFile(cx, 'hooks/pre-tool-use-requiring-frame.json');
  const cmd = firstCommand(file, 'PreToolUse');
  // Codex trusts hooks by sha256; if this file changes, the user must re-approve.
  // So it may only dispatch into the CLI, never carry logic or a version string.
  assert.match(cmd, /omd\.ts" hook pre-tool$/);
  assert.ok(!/\d+\.\d+\.\d+/.test(JSON.stringify(file)), 'no version string may leak into a trusted hook file');
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
  const manifest = jsonFile<CodexManifest>(emitCodex({ agents: [AGENT], hooks: [HOOK] }), '.codex-plugin/plugin.json');
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
