import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { patchConfigToml, unpatchConfigToml, trustedHashKey } from '../core/install/patch-codex.ts';
import { patchSettings, unpatchSettings, patchAllow, unpatchHooks } from '../core/install/patch-claude.ts';
import type { Settings } from '../core/install/patch-claude.ts';
import { detectHosts } from '../core/install/detect.ts';
import { doctor, install } from '../core/install/install.ts';
import { must, asRecord } from './helpers.ts';

const AGENTS = ['omd-framer', 'omd-eye', 'omd-writer', 'omd-typesetter', 'omd-composer'];

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
    'omd-writer'?: { config_file?: string };
    'omd-typesetter'?: { config_file?: string };
    'omd-composer'?: { config_file?: string };
  };
}

test('patchConfigToml registers agents and enables required features', () => {
  const out = patchConfigToml(EXISTING_TOML, { agents: AGENTS });
  const cfg = parseToml(out) as unknown as CodexConfig;
  const agents = must(cfg.agents, 'agents');
  assert.equal(must(agents['omd-framer'], 'omd-framer').config_file, './agents/omd-framer.toml');
  assert.equal(must(agents['omd-eye'], 'omd-eye').config_file, './agents/omd-eye.toml');
  assert.equal(must(agents['omd-writer'], 'omd-writer').config_file, './agents/omd-writer.toml');
  assert.equal(must(agents['omd-typesetter'], 'omd-typesetter').config_file, './agents/omd-typesetter.toml');
  assert.equal(must(agents['omd-composer'], 'omd-composer').config_file, './agents/omd-composer.toml');
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

// ── Claude Code: removing the gate that older versions installed ──
//
// Nothing installs a hook now. But a machine that ran an earlier version still has the
// PreToolUse gate wired into settings.json, and install must clear it.

const GATE = { matcher: 'Write|Edit', hooks: [{ type: 'command' as const, command: '"/usr/bin/node" "/opt/omd/bin/omd.ts" hook pre-tool', timeout: 5 }] };
const FOREIGN = { matcher: '*', hooks: [{ type: 'command' as const, command: 'some-other-plugin.sh', timeout: 3 }] };

test('unpatchHooks removes the legacy omd gate', () => {
  const gated: Settings = { model: 'opus', hooks: { PreToolUse: [GATE] } };
  assert.deepEqual(unpatchHooks(gated), { model: 'opus' });
});

test('unpatchHooks leaves another plugin\'s hooks exactly as they were', () => {
  const mixed: Settings = { hooks: { PreToolUse: [FOREIGN, GATE], Stop: [FOREIGN] } };
  assert.deepEqual(unpatchHooks(mixed), { hooks: { PreToolUse: [FOREIGN], Stop: [FOREIGN] } });
});

test('unpatchHooks is a no-op on settings that never had the gate', () => {
  const clean: Settings = { model: 'opus', hooks: { Stop: [FOREIGN] } };
  assert.deepEqual(unpatchHooks(clean), clean);
  assert.deepEqual(unpatchHooks({}), {});
});

test('Claude direct install and doctor agree on writer, skills, permissions, and hook removal', () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-claude-install-'));
  const detected = { host: 'claude' as const, home };
  try {
    writeFileSync(join(home, 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [FOREIGN, GATE] } }));
    install([detected]);

    assert.ok(existsSync(join(home, 'agents', 'omd-writer.md')));
    assert.ok(existsSync(join(home, 'agents', 'omd-typesetter.md')));
    assert.ok(existsSync(join(home, 'agents', 'omd-composer.md')));
    assert.ok(existsSync(join(home, 'skills', 'omd-ultradesign', 'SKILL.md')));
    const settings = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')) as Settings;
    assert.ok(settings.permissions?.allow?.includes('Bash(omd copy:*)'));
    assert.ok(settings.permissions?.allow?.includes('Bash(omd composition:*)'));
    assert.ok(settings.permissions?.allow?.includes('Bash(shasum:*)'));
    assert.ok(settings.permissions?.allow?.includes('Bash(omd source:*)'));
    assert.equal(
      settings.hooks?.PreToolUse?.some((entry) => entry.hooks.some((hook) => hook.command.includes('omd.ts'))) ?? false,
      false,
    );
    assert.deepEqual(settings.hooks?.PreToolUse, [FOREIGN], 'foreign hooks survive legacy OMD hook removal');

    const result = doctor([detected])[0]!;
    assert.equal(result.ok, true, result.checks.filter((check) => !check.ok).map((check) => check.name).join(', '));
    assert.ok(result.checks.every((check) => check.ok));

    settings.permissions = {
      ...settings.permissions,
      allow: (settings.permissions?.allow ?? []).filter((entry) => entry !== 'Bash(omd composition:*)'),
    };
    writeFileSync(join(home, 'settings.json'), JSON.stringify(settings));
    const missingCompositionPermission = doctor([detected])[0]!;
    assert.equal(missingCompositionPermission.ok, false);
    assert.equal(missingCompositionPermission.checks.find((check) => check.name === 'composition check permission present')?.ok, false);

    install([detected]);
    const restoredSettings = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')) as Settings;
    restoredSettings.permissions = {
      ...restoredSettings.permissions,
      allow: (restoredSettings.permissions?.allow ?? []).filter((entry) => entry !== 'Bash(shasum:*)'),
    };
    writeFileSync(join(home, 'settings.json'), JSON.stringify(restoredSettings));
    const missingHashPermission = doctor([detected])[0]!;
    assert.equal(missingHashPermission.ok, false);
    assert.equal(missingHashPermission.checks.find((check) => check.name === 'composition hash permission present')?.ok, false);

    install([detected]);
    const sourceSettings = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')) as Settings;
    sourceSettings.permissions = {
      ...sourceSettings.permissions,
      allow: (sourceSettings.permissions?.allow ?? []).filter((entry) => entry !== 'Bash(omd source:*)'),
    };
    writeFileSync(join(home, 'settings.json'), JSON.stringify(sourceSettings));
    const missingSourcePermission = doctor([detected])[0]!;
    assert.equal(missingSourcePermission.ok, false);
    assert.equal(missingSourcePermission.checks.find((check) => check.name === 'source seal permission present')?.ok, false);

    install([detected]);
    rmSync(join(home, 'agents', 'omd-typesetter.md'));
    const missingTypesetter = doctor([detected])[0]!;
    assert.equal(missingTypesetter.ok, false);
    assert.equal(missingTypesetter.checks.find((check) => check.name === 'direct agents match shipped set')?.ok, false);

    install([detected]);
    rmSync(join(home, 'agents', 'omd-composer.md'));
    const missingComposer = doctor([detected])[0]!;
    assert.equal(missingComposer.ok, false);
    assert.equal(missingComposer.checks.find((check) => check.name === 'direct agents match shipped set')?.ok, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Claude doctor rejects stale plugin-only layout and a legacy OMD hook', () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-claude-stale-'));
  const detected = { host: 'claude' as const, home };
  try {
    const legacyPlugin = join(home, 'plugins', 'omd', 'oh-my-design', '0.14.0');
    mkdirSync(join(legacyPlugin, 'agents'), { recursive: true });
    mkdirSync(join(legacyPlugin, 'skills', 'omd-ultradesign'), { recursive: true });
    writeFileSync(join(legacyPlugin, 'agents', 'omd-writer.md'), 'legacy');
    writeFileSync(join(legacyPlugin, 'skills', 'omd-ultradesign', 'SKILL.md'), 'legacy');
    writeFileSync(join(home, 'settings.json'), JSON.stringify({
      permissions: { allow: ['Bash(omd copy:*)'] },
      hooks: { PreToolUse: [GATE] },
    }));

    const result = doctor([detected])[0]!;
    assert.equal(result.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'legacy PreToolUse hook absent')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'direct agents match shipped set')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'direct skills installed')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'composition check permission present')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'composition hash permission present')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'source seal permission present')?.ok, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Codex doctor requires the typesetter and composer files and config registrations', () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-codex-install-'));
  const detected = { host: 'codex' as const, home };
  try {
    install([detected]);
    const installed = doctor([detected])[0]!;
    assert.equal(installed.ok, true, installed.checks.filter((check) => !check.ok).map((check) => check.name).join(', '));

    rmSync(join(home, 'agents', 'omd-typesetter.toml'));
    const missing = doctor([detected])[0]!;
    assert.equal(missing.ok, false);
    assert.equal(missing.checks.find((check) => check.name === 'typesetter agent registered')?.ok, false);

    install([detected]);
    rmSync(join(home, 'agents', 'omd-composer.toml'));
    const missingComposer = doctor([detected])[0]!;
    assert.equal(missingComposer.ok, false);
    assert.equal(missingComposer.checks.find((check) => check.name === 'composer agent registered')?.ok, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ── detectHosts ──

test('detectHosts finds only hosts whose config directory exists', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'omd-detect-'));
  try {
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    const detected = detectHosts({}, { homedir: fakeHome });
    assert.deepEqual(detected, [{ host: 'claude', home: join(fakeHome, '.claude') }]);
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test('detectHosts finds both hosts when both config directories exist', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'omd-detect-'));
  try {
    mkdirSync(join(fakeHome, '.claude'), { recursive: true });
    mkdirSync(join(fakeHome, '.codex'), { recursive: true });
    const detected = detectHosts({}, { homedir: fakeHome });
    assert.deepEqual(new Set(detected.map((d) => d.host)), new Set(['claude', 'codex']));
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test('detectHosts finds nothing when neither config directory exists', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'omd-detect-'));
  try {
    assert.deepEqual(detectHosts({}, { homedir: fakeHome }), []);
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
  }
});

test('detectHosts honours CLAUDE_CONFIG_DIR and CODEX_HOME overrides', () => {
  const fakeHome = mkdtempSync(join(tmpdir(), 'omd-detect-'));
  const claudeDir = mkdtempSync(join(tmpdir(), 'omd-claude-'));
  try {
    const detected = detectHosts({ CLAUDE_CONFIG_DIR: claudeDir }, { homedir: fakeHome });
    assert.deepEqual(detected, [{ host: 'claude', home: claudeDir }]);
  } finally {
    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(claudeDir, { recursive: true, force: true });
  }
});

// ── Codex: hook trust key format ──

test('trustedHashKey follows <plugin>@<marketplace>:<file>:<snake_event>:<i>:<j>', () => {
  const key = trustedHashKey('omd@omd', 'hooks/pre-tool-use-requiring-frame.json', 'PreToolUse', 0, 0);
  assert.equal(key, 'omd@omd:hooks/pre-tool-use-requiring-frame.json:pre_tool_use:0:0');
});

// Found in review: patchAllow only appended, so a subcommand removed in an upgrade kept
// its permission forever. `omd session` survived long after the command was deleted.
test('patchAllow replaces our namespace rather than accumulating dead permissions', () => {
  const stale: Settings = { permissions: { allow: ['Bash(git status)', 'Bash(omd session:*)', 'Bash(omd check:*)'] } };
  const next = patchAllow(stale, ['Bash(omd check:*)', 'Bash(omd coach:*)']);
  assert.deepEqual(next.permissions?.allow, ['Bash(git status)', 'Bash(omd check:*)', 'Bash(omd coach:*)']);
});

test('patchAllow is idempotent and preserves foreign permissions', () => {
  const base: Settings = { permissions: { allow: ['Bash(git status)'], defaultMode: 'acceptEdits' } };
  const once = patchAllow(base, ['Bash(omd check:*)']);
  assert.deepEqual(patchAllow(once, ['Bash(omd check:*)']), once);
  assert.equal(once.permissions?.['defaultMode'], 'acceptEdits');
});
