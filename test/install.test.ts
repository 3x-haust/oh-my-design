import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseToml } from 'smol-toml';
import { patchConfigToml, unpatchConfigToml } from '../core/install/patch-codex.ts';
import { patchSettings, unpatchSettings } from '../core/install/patch-claude.ts';
import type { Settings } from '../core/install/patch-claude.ts';
import { must, asRecord } from './helpers.ts';

const AGENTS = ['omd-framer', 'omd-eye'];

const EXISTING_TOML = `model = "gpt-5.5"

[features]
hooks = true
js_repl = false

[agents]
max_threads = 1000

[agents.explorer]
config_file = "./agents/explorer.toml"
`;

interface CodexConfig {
  model?: string;
  features?: Record<string, boolean>;
  agents?: {
    max_threads?: number;
    explorer?: { config_file?: string };
    'omd-framer'?: { config_file?: string };
    'omd-eye'?: { config_file?: string };
  };
}

test('patchConfigToml registers agents and enables required features', () => {
  const out = patchConfigToml(EXISTING_TOML, { agents: AGENTS });
  const cfg = parseToml(out) as unknown as CodexConfig;
  const agents = must(cfg.agents, 'agents');
  assert.equal(must(agents['omd-framer'], 'omd-framer').config_file, './agents/omd-framer.toml');
  assert.equal(must(agents['omd-eye'], 'omd-eye').config_file, './agents/omd-eye.toml');
  const features = must(cfg.features, 'features');
  for (const f of ['hooks', 'plugins', 'plugin_hooks', 'multi_agent']) {
    assert.equal(features[f], true, `feature ${f} must be enabled`);
  }
});

test('patchConfigToml preserves the user settings it did not author', () => {
  const cfg = parseToml(patchConfigToml(EXISTING_TOML, { agents: AGENTS })) as unknown as CodexConfig;
  assert.equal(cfg.model, 'gpt-5.5');
  assert.equal(must(cfg.features, 'features').js_repl, false, 'must merge features, never clobber');
  const agents = must(cfg.agents, 'agents');
  assert.equal(agents.max_threads, 1000);
  assert.equal(must(agents.explorer, 'explorer').config_file, './agents/explorer.toml');
});

test('patchConfigToml is idempotent — patching twice equals patching once', () => {
  const once = patchConfigToml(EXISTING_TOML, { agents: AGENTS });
  assert.equal(patchConfigToml(once, { agents: AGENTS }), once);
});

test('patchConfigToml writes a removable marker block', () => {
  const out = patchConfigToml(EXISTING_TOML, { agents: AGENTS });
  assert.ok(out.includes('# ── OMD BEGIN'));
  assert.ok(out.includes('# ── OMD END'));
});

test('unpatchConfigToml restores the original byte-for-byte', () => {
  const out = patchConfigToml(EXISTING_TOML, { agents: AGENTS });
  assert.equal(unpatchConfigToml(out), EXISTING_TOML);
});

test('unpatchConfigToml on an unpatched file is a no-op', () => {
  assert.equal(unpatchConfigToml(EXISTING_TOML), EXISTING_TOML);
});

// ── Claude Code ──

const EXISTING_SETTINGS: Settings = {
  model: 'opus',
  permissions: { defaultMode: 'acceptEdits', allow: ['Bash(git status)'] },
  enabledPlugins: { 'oh-my-claudecode@omc': true },
  extraKnownMarketplaces: { omc: { source: { source: 'git', url: 'https://example.com/omc.git' } } },
};

const OPTS = { marketplaceUrl: 'https://github.com/x/oh-my-design.git', allow: ['Bash(omd check:*)', 'Bash(omd frame:*)'] };

test('patchSettings registers the marketplace, enables the plugin, allows omd', () => {
  const s = patchSettings(EXISTING_SETTINGS, OPTS);
  const omd = asRecord(must(s.extraKnownMarketplaces, 'extraKnownMarketplaces')['omd']);
  assert.equal(asRecord(omd['source'])['url'], OPTS.marketplaceUrl);
  assert.equal(must(s.enabledPlugins, 'enabledPlugins')['oh-my-design@omd'], true);
  assert.ok(must(s.permissions, 'permissions').allow?.includes('Bash(omd check:*)'));
});

test('patchSettings preserves foreign plugins, marketplaces and permissions', () => {
  const s = patchSettings(EXISTING_SETTINGS, OPTS);
  assert.equal(s.model, 'opus');
  assert.equal(must(s.permissions, 'permissions').defaultMode, 'acceptEdits');
  assert.ok(must(s.permissions, 'permissions').allow?.includes('Bash(git status)'));
  assert.equal(must(s.enabledPlugins, 'enabledPlugins')['oh-my-claudecode@omc'], true);
  assert.ok(must(s.extraKnownMarketplaces, 'extraKnownMarketplaces')['omc']);
});

test('patchSettings does not mutate its input', () => {
  const before = JSON.stringify(EXISTING_SETTINGS);
  patchSettings(EXISTING_SETTINGS, OPTS);
  assert.equal(JSON.stringify(EXISTING_SETTINGS), before);
});

test('patchSettings is idempotent and never duplicates allow entries', () => {
  const once = patchSettings(EXISTING_SETTINGS, OPTS);
  const twice = patchSettings(once, OPTS);
  assert.deepEqual(twice, once);
  assert.equal(must(twice.permissions, 'permissions').allow?.filter((a) => a === 'Bash(omd check:*)').length, 1);
});

test('unpatchSettings removes only what we added', () => {
  const restored = unpatchSettings(patchSettings(EXISTING_SETTINGS, OPTS));
  assert.deepEqual(restored, EXISTING_SETTINGS);
});

test('patchSettings works on an empty settings file', () => {
  const s = patchSettings({}, OPTS);
  assert.equal(must(s.enabledPlugins, 'enabledPlugins')['oh-my-design@omd'], true);
  assert.deepEqual(unpatchSettings(s), {});
});
