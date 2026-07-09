import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse as parseToml } from 'smol-toml';
import { build } from '../../adapters/build.ts';
import type { Detected } from './detect.ts';
import { unpatchSettings, patchAllow, unpatchHooks } from './patch-claude.ts';
import type { Settings } from './patch-claude.ts';
import { patchConfigToml, unpatchConfigToml } from './patch-codex.ts';
import type { Host } from '../types.ts';

// core/install/install.ts -> core/install -> core -> package root
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MARKETPLACE_URL = 'https://github.com/oh-my-design/oh-my-design.git';
const CODEX_SKILL_NAMES = ['ultradesign', 'critique'];

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
];

/**
 * Skills and agents are copied into the directories the host actually reads, not into a
 * plugin folder behind a marketplace we do not publish. A plugin registered against a
 * marketplace that does not exist never loads, and `/ultradesign` never appears.
 */
function installClaude(d: Detected, _version: string, changes: string[]): void {
  const skillsSrc = join(pkgRoot, 'dist', 'claude', 'skills');
  if (existsSync(skillsSrc)) {
    const dest = join(d.home, 'skills');
    mkdirSync(dest, { recursive: true });
    cpSync(skillsSrc, dest, { recursive: true });
    changes.push(`claude: installed skills -> ${dest} (${readdirSafe(skillsSrc).join(', ')})`);
  }

  const agentsSrc = join(pkgRoot, 'dist', 'claude', 'agents');
  if (existsSync(agentsSrc)) {
    const dest = join(d.home, 'agents');
    mkdirSync(dest, { recursive: true });
    for (const file of readdirSafe(agentsSrc)) cpSync(join(agentsSrc, file), join(dest, file));
    changes.push(`claude: installed agents -> ${dest}`);
  }

  const settingsPath = join(d.home, 'settings.json');
  backupFile(settingsPath, d.home);
  const current: Settings = existsSync(settingsPath)
    ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings)
    : {};
  // unpatchHooks clears the PreToolUse gate that older versions installed.
  const next = unpatchHooks(patchAllow(current, OMD_ALLOW));
  mkdirSync(d.home, { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
  changes.push(`claude: patched ${settingsPath}`);
}

function uninstallClaude(d: Detected, changes: string[]): void {
  const settingsPath = join(d.home, 'settings.json');
  if (existsSync(settingsPath)) {
    const current = JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings;
    const next = unpatchHooks(unpatchSettings(current));
    writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`);
    changes.push(`claude: unpatched ${settingsPath}`);
  }

  // Remove only the skills we shipped, by name. The user's own skills live beside them.
  const skillsSrc = join(pkgRoot, 'dist', 'claude', 'skills');
  for (const name of readdirSafe(skillsSrc)) {
    const installed = join(d.home, 'skills', name);
    if (!existsSync(installed)) continue;
    rmSync(installed, { recursive: true, force: true });
    changes.push(`claude: removed ${installed}`);
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
  for (const name of CODEX_SKILL_NAMES) {
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
    if (d.host === 'claude') installClaude(d, version, changes);
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

function doctorClaude(d: Detected, version: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const settingsPath = join(d.home, 'settings.json');
  let settings: Settings | undefined;
  try {
    settings = existsSync(settingsPath) ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as Settings) : {};
    checks.push(check('settings.json parses', true));
  } catch (err) {
    checks.push(check('settings.json parses', false, err instanceof Error ? err.message : String(err)));
  }

  const hookOk = Boolean(
    settings?.hooks?.PreToolUse?.some((entry) => entry.hooks.some((h) => h.command.includes('omd.ts'))),
  );
  checks.push(check('PreToolUse hook registered', hookOk));

  const pluginDir = join(d.home, 'plugins', 'omd', 'oh-my-design', version);
  checks.push(check('agents installed', readdirSafe(join(pluginDir, 'agents')).length > 0));
  checks.push(check('skills installed', readdirSafe(join(pluginDir, 'skills')).length > 0));

  return checks;
}

function doctorCodex(d: Detected): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const configPath = join(d.home, 'config.toml');
  try {
    if (existsSync(configPath)) parseToml(readFileSync(configPath, 'utf8'));
    checks.push(check('config.toml parses', true));
  } catch (err) {
    checks.push(check('config.toml parses', false, err instanceof Error ? err.message : String(err)));
  }

  const omdAgents = readdirSafe(join(d.home, 'agents')).filter((f) => f.startsWith('omd-') && f.endsWith('.toml'));
  checks.push(check('agents registered', omdAgents.length > 0));

  const skillsPresent = CODEX_SKILL_NAMES.some((name) => existsSync(join(d.home, 'skills', name)));
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
  const version = pkgVersion();
  const versionCheck = omdVersionRuns();
  return hosts.map((d) => {
    const checks = d.host === 'claude' ? doctorClaude(d, version) : doctorCodex(d);
    checks.push(versionCheck);
    return { host: d.host, ok: checks.every((c) => c.ok), checks };
  });
}
