import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse as parseToml } from 'smol-toml';
import { build } from '../../adapters/build.ts';
import type { Detected } from './detect.ts';
import { unpatchSettings, patchSettings, unpatchHooks } from './patch-claude.ts';
import type { Settings } from './patch-claude.ts';
import { patchConfigToml, unpatchConfigToml } from './patch-codex.ts';
import type { Host } from '../types.ts';

// core/install/install.ts -> core/install -> core -> package root
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MARKETPLACE_URL = 'https://github.com/3x-haust/oh-my-design.git';
// Derived from what the build emitted, never hardcoded: a hardcoded list is how
// omd-sketch survived its own deletion, twice.
function shippedSkillNames(): string[] {
  return readdirSafe(join(pkgRoot, 'dist', 'codex', 'skills'));
}

function pkgVersion(): string {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Every config we are about to patch gets backed up first, unconditionally. */
function backupFile(path: string, home: string): void {
  if (!existsSync(path)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(home, 'backups', `${basename(path)}.${stamp}.bak`);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(path, dest);
}

// Every omd subcommand the skill invokes. A loop that raises a permission prompt ten times
// per iteration is a loop nobody finishes.
const OMD_ALLOW = [
  'Bash(omd check:*)', 'Bash(omd ir:*)', 'Bash(omd render:*)',
  'Bash(omd frame:*)', 'Bash(omd ref:*)', 'Bash(omd choose:*)',
  'Bash(omd decision:*)', 'Bash(omd taste:*)', 'Bash(omd coach:*)',
  'Bash(omd probe:*)', 'Bash(omd config:*)', 'Bash(omd craft:*)', 'Bash(omd copy:*)',
  'Bash(omd composition:*)',
  'Bash(omd text-slop:*)', 'Bash(omd visual-richness:*)', 'Bash(omd stack:*)',
  'Bash(omd source:*)', 'Bash(omd pack:*)', 'Bash(shasum:*)',
];

// Pre-namespace skill directory names that predate the `omd-` prefix. Pruned on install so a
// legacy bare directory cannot shadow the `oh-my-design:` plugin.
const LEGACY_SKILLS = ['ultradesign', 'critique'];

/**
 * Claude Code loads OMD as the marketplace plugin `oh-my-design@omd` (marketplace `omd` ->
 * github `3x-haust/oh-my-design`). Everything resolves under the `oh-my-design:` namespace,
 * so the installer registers the plugin in settings.json and prunes any bare-name `omd-*`
 * skills/agents a previous direct install left behind — one surface, never a duplicate.
 */
function installClaude(d: Detected, changes: string[]): void {
  // Claude Code installs OMD as the marketplace plugin `oh-my-design@omd`, so every skill and
  // agent resolves under the `oh-my-design:` namespace (e.g. `oh-my-design:ultradesign`). The
  // older bare-name copy under ~/.claude/skills and ~/.claude/agents is pruned here so a stale
  // `omd-*` surface can never shadow the plugin with a duplicate.
  const skillsDest = join(d.home, 'skills');
  for (const name of readdirSafe(skillsDest)) {
    if (!name.startsWith('omd-') && !LEGACY_SKILLS.includes(name)) continue;
    rmSync(join(skillsDest, name), { recursive: true, force: true });
    changes.push(`claude: removed direct skill ${name}`);
  }
  const agentsDest = join(d.home, 'agents');
  for (const file of readdirSafe(agentsDest)) {
    if (!file.startsWith('omd-')) continue;
    rmSync(join(agentsDest, file), { force: true });
    changes.push(`claude: removed direct agent ${file}`);
  }

  const settingsPath = join(d.home, 'settings.json');
  backupFile(settingsPath, d.home);
  const current: Settings = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings)
    : {};
  // Register the marketplace + enable the plugin (patchSettings) and clear the legacy gate.
  const next = unpatchHooks(patchSettings(current, { marketplaceUrl: MARKETPLACE_URL, allow: OMD_ALLOW }));
  mkdirSync(d.home, { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
  changes.push(`claude: registered oh-my-design@omd plugin and patched ${settingsPath}`);
}

function uninstallClaude(d: Detected, changes: string[]): void {
  const settingsPath = join(d.home, 'settings.json');
  if (existsSync(settingsPath)) {
    const current = JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings;
    const next = unpatchHooks(unpatchSettings(current));
    writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
    changes.push(`claude: unpatched ${settingsPath}`);
  }

  // Remove any bare-name skill directory a previous direct install left, by prefix. The
  // user's own skills (no omd- prefix) live beside them and are never touched.
  const skillsDir = join(d.home, 'skills');
  for (const name of readdirSafe(skillsDir)) {
    if (!name.startsWith('omd-') && !LEGACY_SKILLS.includes(name)) continue;
    rmSync(join(skillsDir, name), { recursive: true, force: true });
    changes.push(`claude: removed ${join(skillsDir, name)}`);
  }

  for (const file of readdirSafe(join(d.home, 'agents'))) {
    if (!file.startsWith('omd-')) continue;
    rmSync(join(d.home, 'agents', file), { force: true });
    changes.push(`claude: removed ${join(d.home, 'agents', file)}`);
  }

  // NEVER delete .omd/ — that is the user's own work.
  const pluginRoot = join(d.home, 'plugins', 'omd');
  if (existsSync(pluginRoot)) {
    rmSync(pluginRoot, { recursive: true, force: true });
    changes.push(`claude: removed ${pluginRoot}`);
  }
}

function installCodex(d: Detected, version: string, changes: string[]): void {
  const pluginDir = join(d.home, 'plugins', 'cache', 'omd', 'oh-my-design', version);
  mkdirSync(pluginDir, { recursive: true });
  cpSync(join(pkgRoot, 'dist', 'codex'), pluginDir, { recursive: true });
  changes.push(`codex: installed plugin -> ${pluginDir}`);

  const agentsDir = join(d.home, 'agents');
  mkdirSync(agentsDir, { recursive: true });
  const srcAgentsDir = join(pkgRoot, 'dist', 'codex', 'agents');
  const agentNames: string[] = [];
  for (const file of readdirSafe(srcAgentsDir)) {
    if (!file.endsWith('.toml')) continue;
    cpSync(join(srcAgentsDir, file), join(agentsDir, file));
    agentNames.push(file.replace(/\.toml$/, ''));
  }
  changes.push(`codex: registered agents -> ${agentsDir} (${agentNames.join(', ') || 'none'})`);

  const skillsSrc = join(pkgRoot, 'dist', 'codex', 'skills');
  const skillsDest = join(d.home, 'skills');
  if (existsSync(skillsSrc)) {
    mkdirSync(skillsDest, { recursive: true });
    cpSync(skillsSrc, skillsDest, { recursive: true });
    changes.push(`codex: installed skills -> ${skillsDest}`);
  }

  const configPath = join(d.home, 'config.toml');
  backupFile(configPath, d.home);
  const currentText = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
  const patched = patchConfigToml(currentText, { agents: agentNames });
  mkdirSync(d.home, { recursive: true });
  writeFileSync(configPath, patched);
  changes.push(`codex: patched ${configPath}`);
}

function uninstallCodex(d: Detected, changes: string[]): void {
  const configPath = join(d.home, 'config.toml');
  if (existsSync(configPath)) {
    writeFileSync(configPath, unpatchConfigToml(readFileSync(configPath, 'utf8')));
    changes.push(`codex: unpatched ${configPath}`);
  }

  const pluginRoot = join(d.home, 'plugins', 'cache', 'omd');
  if (existsSync(pluginRoot)) {
    rmSync(pluginRoot, { recursive: true, force: true });
    changes.push(`codex: removed ${pluginRoot}`);
  }

  const agentsDir = join(d.home, 'agents');
  for (const file of readdirSafe(agentsDir)) {
    if (!file.startsWith('omd-') || !file.endsWith('.toml')) continue;
    rmSync(join(agentsDir, file), { force: true });
    changes.push(`codex: removed ${join(agentsDir, file)}`);
  }

  // NEVER delete .omd/ anywhere — only our own skill copies live under ~/.codex/skills/.
  const skillsDir = join(d.home, 'skills');
  for (const name of shippedSkillNames()) {
    const path = join(skillsDir, name);
    if (!existsSync(path)) continue;
    rmSync(path, { recursive: true, force: true });
    changes.push(`codex: removed skill ${name}`);
  }
}

export function install(hosts: Detected[]): string[] {
  build();
  const version = pkgVersion();
  const changes: string[] = [];
  for (const d of hosts) {
    if (d.host === 'claude') installClaude(d, changes);
    else installCodex(d, version, changes);
  }
  return changes;
}

export function uninstall(hosts: Detected[]): string[] {
  const changes: string[] = [];
  for (const d of hosts) {
    if (d.host === 'claude') uninstallClaude(d, changes);
    else uninstallCodex(d, changes);
  }
  return changes;
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface DoctorResult {
  host: Host;
  ok: boolean;
  checks: DoctorCheck[];
}

function check(name: string, ok: boolean, detail?: string): DoctorCheck {
  return detail === undefined ? { name, ok } : { name, ok, detail };
}

function omdVersionRuns(): DoctorCheck {
  try {
    execFileSync(process.execPath, [join(pkgRoot, 'bin', 'omd.ts'), '--version'], { stdio: 'pipe' });
    return check('omd --version runs', true);
  } catch (err) {
    return check('omd --version runs', false, err instanceof Error ? err.message : String(err));
  }
}

function doctorClaude(d: Detected): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const settingsPath = join(d.home, 'settings.json');
  let settings: Settings | undefined;
  try {
    settings = existsSync(settingsPath) ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings) : {};
    checks.push(check('settings.json parses', true));
  } catch (err) {
    checks.push(check('settings.json parses', false, err instanceof Error ? err.message : String(err)));
  }

  const legacyHookPresent = settings?.hooks?.PreToolUse?.some(
    (entry) => entry.hooks.some((hook) => hook.command.includes('omd.ts')),
  ) ?? false;
  checks.push(check('legacy PreToolUse hook absent', settings !== undefined && !legacyHookPresent));

  const pluginEnabled = settings?.enabledPlugins?.['oh-my-design@omd'] === true;
  checks.push(check('oh-my-design@omd plugin enabled', pluginEnabled));

  const marketplaces = settings?.extraKnownMarketplaces as Record<string, unknown> | undefined;
  checks.push(check('omd marketplace registered', Boolean(marketplaces && marketplaces['omd'])));

  const strayAgents = readdirSafe(join(d.home, 'agents')).filter((file) => file.startsWith('omd-') && file.endsWith('.md')).sort();
  checks.push(check('no duplicate direct agents', strayAgents.length === 0, strayAgents.length ? `found ${strayAgents.join(', ')}` : undefined));

  const straySkills = readdirSafe(join(d.home, 'skills')).filter((name) => name.startsWith('omd-') || LEGACY_SKILLS.includes(name)).sort();
  checks.push(check('no duplicate direct skills', straySkills.length === 0, straySkills.length ? `found ${straySkills.join(', ')}` : undefined));

  const copyPermission = settings?.permissions?.allow?.includes('Bash(omd copy:*)') ?? false;
  checks.push(check('copy check permission present', copyPermission));
  const compositionPermission = settings?.permissions?.allow?.includes('Bash(omd composition:*)') ?? false;
  checks.push(check('composition check permission present', compositionPermission));
  const shasumPermission = settings?.permissions?.allow?.includes('Bash(shasum:*)') ?? false;
  checks.push(check('composition hash permission present', shasumPermission));
  const sourcePermission = settings?.permissions?.allow?.includes('Bash(omd source:*)') ?? false;
  checks.push(check('source seal permission present', sourcePermission));

  return checks;
}

function doctorCodex(d: Detected): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const configPath = join(d.home, 'config.toml');
  let config: { agents?: Record<string, { config_file?: string }> } | undefined;
  try {
    config = existsSync(configPath)
      ? parseToml(readFileSync(configPath, 'utf8')) as { agents?: Record<string, { config_file?: string }> }
      : {};
    checks.push(check('config.toml parses', true));
  } catch (err) {
    checks.push(check('config.toml parses', false, err instanceof Error ? err.message : String(err)));
  }

  const omdAgents = readdirSafe(join(d.home, 'agents')).filter((f) => f.startsWith('omd-') && f.endsWith('.toml'));
  checks.push(check('agents registered', omdAgents.length > 0));
  const typesetterRegistered = config?.agents?.['omd-typesetter']?.config_file === './agents/omd-typesetter.toml'
    && existsSync(join(d.home, 'agents', 'omd-typesetter.toml'));
  checks.push(check('typesetter agent registered', typesetterRegistered));
  const composerRegistered = config?.agents?.['omd-composer']?.config_file === './agents/omd-composer.toml'
    && existsSync(join(d.home, 'agents', 'omd-composer.toml'));
  checks.push(check('composer agent registered', composerRegistered));

  const skillsPresent = shippedSkillNames().some((name) => existsSync(join(d.home, 'skills', name)));
  checks.push(check('skills present', skillsPresent));

  // Not a pass/fail: we could not confirm Codex's trusted_hash key format against a real
  // install, so this must read as unverified rather than claim success.
  checks.push(check(
    'hook trust: unverified',
    true,
    'trusted_hash key format (see core/install/patch-codex.ts) has not been confirmed against a real Codex session',
  ));

  return checks;
}

export function doctor(hosts: Detected[]): DoctorResult[] {
  const versionCheck = omdVersionRuns();
  return hosts.map((d) => {
    const checks = d.host === 'claude' ? doctorClaude(d) : doctorCodex(d);
    checks.push(versionCheck);
    return { host: d.host, ok: checks.every((c) => c.ok), checks };
  });
}
