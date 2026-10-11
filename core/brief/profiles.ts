import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROFILE_MODES = {
  'omd-eye': ['concept-selection', 'structural-selection', 'visual-study', 'copy-editor', 'typography-proof', 'production-visual', 'fidelity', 'protocol', 'perspective', 'moderator'],
  'omd-sketch': ['structural', 'visual-study'],
  'omd-hand': ['source', 'observer'],
} as const;
export type ProfileRole = keyof typeof PROFILE_MODES;
export type RoleProfile = Readonly<{ role: ProfileRole; mode: string; file: string; budget: number; source: string; sha256: string }>;
export const PROFILE_SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const fail = (reason: string): never => { throw new Error(`ROLE_PROFILE: ${reason}`); };

/** A closed registry, not recursive agent discovery. Exactly one trusted profile is loaded per call. */
export function readRoleProfiles(sourceRoot = PROFILE_SOURCE_ROOT): readonly RoleProfile[] {
  const directory = join(sourceRoot, 'src/agents/profiles');
  const manifest: unknown = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return fail('invalid manifest');
  const m = manifest as Record<string, unknown>;
  if (Object.keys(m).sort().join(',') !== 'profiles,schema' || m.schema !== 'role-profile-manifest-v1' || !Array.isArray(m.profiles)) return fail('invalid manifest fields');
  const expected = Object.entries(PROFILE_MODES).flatMap(([role, modes]) => modes.map(mode => `${role}:${mode}`)).sort();
  const profiles = m.profiles.map((value: unknown): RoleProfile => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('invalid entry');
    const p = value as Record<string, unknown>;
    if (Object.keys(p).sort().join(',') !== 'budget,file,mode,role' || typeof p.role !== 'string' || !(p.role in PROFILE_MODES)
      || typeof p.mode !== 'string' || !(PROFILE_MODES[p.role as ProfileRole] as readonly string[]).includes(p.mode)
      || p.file !== `${p.role.slice(4)}/${p.mode}.md` || !Number.isSafeInteger(p.budget) || Number(p.budget) < 1) return fail('unknown mode or invalid profile path/budget');
    const source = readFileSync(join(directory, p.file as string), 'utf8');
    if (!source.trim()) return fail('empty profile');
    return { role: p.role as ProfileRole, mode: p.mode, file: p.file as string, budget: p.budget as number, source, sha256: hash(source) };
  });
  if (profiles.map(p => `${p.role}:${p.mode}`).sort().join(',') !== expected.join(',')) return fail('missing or duplicate mode');
  const actualFiles = Object.keys(PROFILE_MODES).flatMap(role => readdirSync(join(directory, role.slice(4))).map(file => `${role.slice(4)}/${file}`)).sort();
  if (actualFiles.join(',') !== profiles.map(p => p.file).sort().join(',')) return fail('unregistered profile file');
  return profiles;
}
export function loadRoleProfile(role: string, mode: string, sourceRoot = PROFILE_SOURCE_ROOT): RoleProfile {
  return readRoleProfiles(sourceRoot).find(profile => profile.role === role && profile.mode === mode) ?? fail(`unsupported ${role}/${mode}`);
}
export function emittedRoleProfiles(sourceRoot = PROFILE_SOURCE_ROOT): Readonly<Record<string, string>> {
  const profiles = readRoleProfiles(sourceRoot);
  return Object.fromEntries([
    ['profiles/manifest.json', readFileSync(join(sourceRoot, 'src/agents/profiles/manifest.json'), 'utf8')],
    ...profiles.map(p => [`profiles/${p.file}`, p.source]),
  ]);
}
