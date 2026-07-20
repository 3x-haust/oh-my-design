import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseToml } from 'smol-toml';
import { patchConfigToml, unpatchConfigToml, trustedHashKey } from '../core/install/patch-codex.ts';
import { patchSettings, unpatchSettings, patchAllow, unpatchHooks } from '../core/install/patch-claude.ts';
import type { Settings } from '../core/install/patch-claude.ts';
import { detectHosts } from '../core/install/detect.ts';
import { BROWSER_RS_RELEASES } from '../core/install/browser-rs.ts';
import { doctor, install, type DoctorOptions, type InstallOptions } from '../core/install/install.ts';
import { browserRsTestDependencies, browserRsTestInstallDependencies, unavailableBrowserRsDownload } from './browser-rs-test-support.ts';
import { must, asRecord } from './helpers.ts';

const AGENTS = ['omd-framer', 'omd-eye', 'omd-writer', 'omd-typesetter', 'omd-composer'];
const TEST_BROWSER_HOME = '/omd-test-browser-rs-home';
const UNSUPPORTED_BROWSER = {
  browser: browserRsTestInstallDependencies({
    home: TEST_BROWSER_HOME,
    platform: 'unsupported',
    arch: 'unsupported',
    releases: [],
    downloader: unavailableBrowserRsDownload,
  }),
} satisfies InstallOptions;
const UNSUPPORTED_BROWSER_DOCTOR = {
  browser: {
    browser: browserRsTestDependencies({
      home: TEST_BROWSER_HOME,
      platform: 'unsupported',
      arch: 'unsupported',
      releases: [],
    }),
    fallback: async () => ({ kind: 'ready', path: '/test/playwright-chromium' }),
  },
} satisfies DoctorOptions;
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPOSITORY_ARTIFACTS = ['src', 'dist', 'agents', 'skills', '.mcp.json'] as const;

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

test('Claude plugin install registers the plugin, prunes any direct duplicate, and clears the legacy gate', async () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-claude-install-'));
  const detected = { host: 'claude' as const, home };
  try {
    // A previous direct install left bare-name omd-* skills/agents and a legacy gate.
    mkdirSync(join(home, 'agents'), { recursive: true });
    mkdirSync(join(home, 'skills', 'omd-ultradesign'), { recursive: true });
    writeFileSync(join(home, 'agents', 'omd-writer.md'), 'stale direct');
    writeFileSync(join(home, 'skills', 'omd-ultradesign', 'SKILL.md'), 'stale direct');
    writeFileSync(join(home, 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [FOREIGN, GATE] } }));

    await install([detected], UNSUPPORTED_BROWSER);

    // The direct duplicate is gone; only the plugin registration remains.
    assert.ok(!existsSync(join(home, 'agents', 'omd-writer.md')), 'direct agent pruned');
    assert.ok(!existsSync(join(home, 'skills', 'omd-ultradesign')), 'direct skill pruned');
    const settings = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')) as Settings;
    assert.equal(settings.enabledPlugins?.['oh-my-design@omd'], true);
    assert.ok(settings.extraKnownMarketplaces?.['omd']);
    assert.ok(settings.permissions?.allow?.includes('Bash(omd copy:*)'));
    assert.ok(settings.permissions?.allow?.includes('Bash(omd composition:*)'));
    assert.ok(settings.permissions?.allow?.includes('Bash(shasum:*)'));
    assert.ok(settings.permissions?.allow?.includes('Bash(omd source:*)'));
    assert.equal(
      settings.hooks?.PreToolUse?.some((entry) => entry.hooks.some((hook) => hook.command.includes('omd.ts'))) ?? false,
      false,
    );
    assert.deepEqual(settings.hooks?.PreToolUse, [FOREIGN], 'foreign hooks survive legacy OMD hook removal');

    const result = (await doctor([detected], UNSUPPORTED_BROWSER_DOCTOR))[0]!;
    assert.equal(result.ok, true, result.checks.filter((check) => !check.ok).map((check) => check.name).join(', '));
    assert.ok(result.checks.every((check) => check.ok));

    // Missing each required permission fails the matching doctor check.
    for (const [perm, checkName] of [
      ['Bash(omd composition:*)', 'composition check permission present'],
      ['Bash(shasum:*)', 'composition hash permission present'],
      ['Bash(omd source:*)', 'source seal permission present'],
    ] as const) {
      await install([detected], UNSUPPORTED_BROWSER);
      const s = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')) as Settings;
      s.permissions = { ...s.permissions, allow: (s.permissions?.allow ?? []).filter((entry) => entry !== perm) };
      writeFileSync(join(home, 'settings.json'), JSON.stringify(s));
      const missing = (await doctor([detected], UNSUPPORTED_BROWSER_DOCTOR))[0]!;
      assert.equal(missing.ok, false);
      assert.equal(missing.checks.find((check) => check.name === checkName)?.ok, false);
    }

    // A stray direct agent appearing beside the plugin is flagged as a duplicate.
    await install([detected], UNSUPPORTED_BROWSER);
    mkdirSync(join(home, 'agents'), { recursive: true });
    writeFileSync(join(home, 'agents', 'omd-typesetter.md'), 'stray');
    const dupAgent = (await doctor([detected], UNSUPPORTED_BROWSER_DOCTOR))[0]!;
    assert.equal(dupAgent.ok, false);
    assert.equal(dupAgent.checks.find((check) => check.name === 'no duplicate direct agents')?.ok, false);

    // A stray direct skill is flagged the same way.
    await install([detected], UNSUPPORTED_BROWSER);
    mkdirSync(join(home, 'skills', 'omd-scout'), { recursive: true });
    const dupSkill = (await doctor([detected], UNSUPPORTED_BROWSER_DOCTOR))[0]!;
    assert.equal(dupSkill.ok, false);
    assert.equal(dupSkill.checks.find((check) => check.name === 'no duplicate direct skills')?.ok, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Claude doctor rejects a duplicate direct install and a legacy OMD hook', async () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-claude-stale-'));
  const detected = { host: 'claude' as const, home };
  try {
    // A direct install left bare-name omd-* skills/agents; the plugin is not registered and a
    // legacy gate is still wired.
    mkdirSync(join(home, 'agents'), { recursive: true });
    mkdirSync(join(home, 'skills', 'omd-ultradesign'), { recursive: true });
    writeFileSync(join(home, 'agents', 'omd-writer.md'), 'stale');
    writeFileSync(join(home, 'skills', 'omd-ultradesign', 'SKILL.md'), 'stale');
    writeFileSync(join(home, 'settings.json'), JSON.stringify({
      permissions: { allow: ['Bash(omd copy:*)'] },
      hooks: { PreToolUse: [GATE] },
    }));

    const result = (await doctor([detected], UNSUPPORTED_BROWSER_DOCTOR))[0]!;
    assert.equal(result.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'legacy PreToolUse hook absent')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'oh-my-design@omd plugin enabled')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'omd marketplace registered')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'no duplicate direct agents')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'no duplicate direct skills')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'composition check permission present')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'composition hash permission present')?.ok, false);
    assert.equal(result.checks.find((check) => check.name === 'source seal permission present')?.ok, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Codex doctor requires the typesetter and composer files and config registrations', async () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-codex-install-'));
  const detected = { host: 'codex' as const, home };
  try {
    await install([detected], UNSUPPORTED_BROWSER);
    const installed = (await doctor([detected], UNSUPPORTED_BROWSER_DOCTOR))[0]!;
    assert.equal(installed.ok, true, installed.checks.filter((check) => !check.ok).map((check) => check.name).join(', '));

    rmSync(join(home, 'agents', 'omd-typesetter.toml'));
    const missing = (await doctor([detected], UNSUPPORTED_BROWSER_DOCTOR))[0]!;
    assert.equal(missing.ok, false);
    assert.equal(missing.checks.find((check) => check.name === 'typesetter agent registered')?.ok, false);

    await install([detected], UNSUPPORTED_BROWSER);
    rmSync(join(home, 'agents', 'omd-composer.toml'));
    const missingComposer = (await doctor([detected], UNSUPPORTED_BROWSER_DOCTOR))[0]!;
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

test('Given a valid distinct prebuilt payload When Codex install runs Then it consumes that payload without changing repository artifacts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-install-prebuilt-consumer-'));
  const prebuiltRoot = join(root, 'prebuilt');
  const home = join(root, 'codex');
  const prebuiltAgent = join(prebuiltRoot, 'dist', 'codex', 'agents', 'omd-eye.toml');
  try {
    cpSync(join(PACKAGE_ROOT, 'dist'), join(prebuiltRoot, 'dist'), { recursive: true });
    const expectedAgent = readFileSync(prebuiltAgent, 'utf8');
    const before = repositoryArtifactSnapshot();

    await install(
      [{ host: 'codex', home }],
      { prebuiltRoot, browser: UNSUPPORTED_BROWSER.browser } satisfies InstallOptions,
    );

    assert.equal(readFileSync(join(home, 'agents', 'omd-eye.toml'), 'utf8'), expectedAgent);
    assert.deepEqual(repositoryArtifactSnapshot(), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function repositoryArtifactSnapshot(): readonly string[] {
  return REPOSITORY_ARTIFACTS.flatMap((entry) => snapshotPath(join(PACKAGE_ROOT, entry), entry));
}

function snapshotPath(path: string, relativePath: string): readonly string[] {
  const metadata = lstatSync(path, { bigint: true });
  const summary = `${relativePath}:${metadata.mode}:${metadata.size}:${metadata.mtimeNs}`;
  if (metadata.isDirectory()) {
    return [summary, ...readdirSync(path).sort().flatMap((entry) => snapshotPath(join(path, entry), join(relativePath, entry)))];
  }
  if (metadata.isFile()) return [`${summary}:${statSync(path).size}:${readFileSync(path, 'utf8')}`];
  return [summary];
}

test('Given a healthy host and explicit browser provider When install runs Then it reports the provider without undoing host installation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-install-provider-'));
  const home = join(root, 'claude');
  const browser = join(root, 'browser-rs');
  try {
    writeFileSync(browser, '#!/bin/sh\nprintf "browser-rs test\\n"\n');
    chmodSync(browser, 0o755);
    const changes = await install([{ host: 'claude', home }], {
      browser: browserRsTestInstallDependencies({
        home: join(root, 'browser-home'),
        platform: 'darwin',
        arch: 'arm64',
        releases: BROWSER_RS_RELEASES,
        env: { PATH: '', OMD_BROWSER_RS_BIN: browser },
        downloader: unavailableBrowserRsDownload,
      }),
    });

    assert.ok(changes.some((line) => line.startsWith('browser-rs: present')));
    const settings = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')) as Settings;
    assert.equal(settings.enabledPlugins?.['oh-my-design@omd'], true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── CLI symlink + plugin freshness ──

const OMD_SHIM = join(PACKAGE_ROOT, 'bin', 'omd.mjs');
const INSTALL_SHIM = join(PACKAGE_ROOT, 'bin', 'omd-install.mjs');
const BUILD_VERSION = (JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string }).version;

test('install links the omd CLI to this build so omd pack dir serves the current core', async () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-cli-home-'));
  const binDir = mkdtempSync(join(tmpdir(), 'omd-cli-bin-'));
  const detected = { host: 'codex' as const, home };
  try {
    const changes = await install([detected], { browser: UNSUPPORTED_BROWSER.browser, cliBinDir: binDir });
    assert.ok(lstatSync(join(binDir, 'omd')).isSymbolicLink(), 'omd is a symlink');
    assert.ok(lstatSync(join(binDir, 'oh-my-design')).isSymbolicLink(), 'oh-my-design is a symlink');
    assert.equal(readlinkSync(join(binDir, 'omd')), OMD_SHIM);
    assert.equal(readlinkSync(join(binDir, 'oh-my-design')), INSTALL_SHIM);
    assert.ok(changes.some((c) => c.startsWith('cli: linked omd -> ') && c.endsWith('omd.mjs')));

    const result = (await doctor([detected], { ...UNSUPPORTED_BROWSER_DOCTOR, cliBinDir: binDir }))[0]!;
    assert.equal(result.checks.find((c) => c.name === 'omd CLI links to this build')?.ok, true);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test('install relinks a stale omd symlink and reports the previous target', async () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-cli-home-'));
  const binDir = mkdtempSync(join(tmpdir(), 'omd-cli-bin-'));
  const stale = join(binDir, 'stale-omd.mjs');
  writeFileSync(stale, '// stale');
  symlinkSync(stale, join(binDir, 'omd'));
  const detected = { host: 'codex' as const, home };
  try {
    const changes = await install([detected], { browser: UNSUPPORTED_BROWSER.browser, cliBinDir: binDir });
    assert.equal(readlinkSync(join(binDir, 'omd')), OMD_SHIM);
    assert.ok(changes.some((c) => c.includes('relinked omd ->') && c.includes(`(was ${stale})`)));
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test('install without a cli bin dir never touches the user PATH', async () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-cli-home-'));
  const binDir = mkdtempSync(join(tmpdir(), 'omd-cli-bin-'));
  const detected = { host: 'codex' as const, home };
  try {
    const changes = await install([detected], UNSUPPORTED_BROWSER);
    assert.ok(!existsSync(join(binDir, 'omd')), 'no symlink created without cliBinDir');
    assert.ok(!changes.some((c) => c.startsWith('cli:')), 'no cli change reported');
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});

test('a Claude plugin cache older than the build is surfaced as a /plugin update advisory', async () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-claude-stale-plugin-'));
  const detected = { host: 'claude' as const, home };
  try {
    mkdirSync(join(home, 'plugins'), { recursive: true });
    const write = (version: string) => writeFileSync(
      join(home, 'plugins', 'installed_plugins.json'),
      JSON.stringify({ plugins: { 'oh-my-design@omd': [{ version }] } }),
    );
    write('0.0.1');
    const stale = await install([detected], UNSUPPORTED_BROWSER);
    assert.ok(stale.some((c) => c.includes('loaded plugin is 0.0.1') && c.includes('/plugin')));

    write(BUILD_VERSION);
    const fresh = await install([detected], UNSUPPORTED_BROWSER);
    assert.ok(!fresh.some((c) => c.startsWith('claude: loaded plugin')), 'no advisory when versions match');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a second install with the same cli bin dir leaves the omd symlink in place', async () => {
  const home = mkdtempSync(join(tmpdir(), 'omd-cli-home-'));
  const binDir = mkdtempSync(join(tmpdir(), 'omd-cli-bin-'));
  const detected = { host: 'codex' as const, home };
  try {
    await install([detected], { browser: UNSUPPORTED_BROWSER.browser, cliBinDir: binDir });
    const changes = await install([detected], { browser: UNSUPPORTED_BROWSER.browser, cliBinDir: binDir });
    assert.ok(lstatSync(join(binDir, 'omd')).isSymbolicLink(), 'omd symlink survives a repeat install');
    assert.equal(readlinkSync(join(binDir, 'omd')), OMD_SHIM);
    assert.ok(changes.some((c) => c === `cli: omd -> ${OMD_SHIM} (already current)`));
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(binDir, { recursive: true, force: true });
  }
});
