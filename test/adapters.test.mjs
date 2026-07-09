import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitCodex } from '../adapters/codex.mjs';
import { emitClaude } from '../adapters/claude.mjs';

const HOOK = {
  id: 'require-frame',
  event: 'PreToolUse',
  matcher: '@fileWrite',
  command: 'node "@pluginRoot/bin/omd.mjs" hook pre-tool',
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
  assert.equal(cx.files['hooks/pre-tool-use-requiring-frame.json'].hooks.PreToolUse[0].matcher, 'apply_patch');
  assert.equal(cl.files['hooks/hooks.json'].hooks.PreToolUse[0].matcher, 'Write|Edit');
});

test('no @token survives emission', () => {
  const all = [emitCodex({ hooks: [HOOK], agents: [AGENT] }), emitClaude({ hooks: [HOOK], agents: [AGENT] })];
  for (const out of all) {
    const dump = JSON.stringify(out.files);
    assert.ok(!/@fileWrite|@pluginRoot|@high/.test(dump), `unsubstituted token in ${dump.slice(0, 200)}`);
  }
});

test('each host gets its own plugin-root variable', () => {
  const cx = emitCodex({ hooks: [HOOK] }).files['hooks/pre-tool-use-requiring-frame.json'];
  const cl = emitClaude({ hooks: [HOOK] }).files['hooks/hooks.json'];
  assert.ok(cx.hooks.PreToolUse[0].hooks[0].command.includes('${PLUGIN_ROOT}'));
  assert.ok(cl.hooks.PreToolUse[0].hooks[0].command.includes('$CLAUDE_PLUGIN_ROOT'));
});

test('codex emits one file per hook and lists them in the manifest', () => {
  const cx = emitCodex({ hooks: [HOOK] });
  assert.ok(cx.files['hooks/pre-tool-use-requiring-frame.json']);
  assert.deepEqual(cx.files['.codex-plugin/plugin.json'].hooks, ['./hooks/pre-tool-use-requiring-frame.json']);
});

test('claude merges every hook into one hooks.json keyed by event', () => {
  const second = { ...HOOK, id: 'enforce-stop', event: 'Stop', matcher: '*', command: 'node "@pluginRoot/bin/omd.mjs" hook stop' };
  const cl = emitClaude({ hooks: [HOOK, second] });
  const h = cl.files['hooks/hooks.json'].hooks;
  assert.equal(Object.keys(h).length, 2);
  assert.ok(h.PreToolUse && h.Stop);
  assert.equal(Object.keys(cl.files).filter((f) => f.startsWith('hooks/')).length, 1);
});

test('codex hook JSON is a stable shim — it must not embed policy', () => {
  const cx = emitCodex({ hooks: [HOOK] }).files['hooks/pre-tool-use-requiring-frame.json'];
  const cmd = cx.hooks.PreToolUse[0].hooks[0].command;
  // Codex trusts hooks by sha256; if this file changes, the user must re-approve.
  // So it may only dispatch into the CLI, never carry logic or a version string.
  assert.match(cmd, /omd\.mjs" hook pre-tool$/);
  assert.ok(!/\d+\.\d+\.\d+/.test(JSON.stringify(cx)), 'no version string may leak into a trusted hook file');
});

test('agents render to toml for codex and md for claude, with the right model', () => {
  const toml = emitCodex({ agents: [AGENT] }).files['agents/omd-eye.toml'];
  assert.match(toml, /^name = "omd-eye"/m);
  assert.match(toml, /model = "gpt-5\.5"/);
  assert.match(toml, /model_reasoning_effort = "high"/);
  assert.match(toml, /developer_instructions = """/);

  const md = emitClaude({ agents: [AGENT] }).files['agents/omd-eye.md'];
  assert.match(md, /^---\n/);
  assert.match(md, /^model: claude-opus-4-8$/m);
  assert.match(md, /^name: omd-eye$/m);
  assert.ok(md.includes('You do not know why this was built.'));
});

test('codex manifest carries no agents key — agents are installed via config.toml', () => {
  const manifest = emitCodex({ agents: [AGENT], hooks: [HOOK] }).files['.codex-plugin/plugin.json'];
  assert.equal(manifest.agents, undefined);
  assert.equal(manifest.skills, './skills/');
});
