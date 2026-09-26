import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { AbstractAgent } from '../core/types.ts';

export type Skill = Readonly<{ name: string; description: string; source: string }>;
export const BUILD_IDENTITY_SCHEMA_VERSION = 'omd-build-identity-v1' as const;
export type BuildIdentity = Readonly<{
  schemaVersion: typeof BUILD_IDENTITY_SCHEMA_VERSION;
  packageVersion: string;
  buildSha256: string;
  sourceSkillSha256: string;
}>;

export function canonicalSkillSourceBytes(skills: readonly Pick<Skill, 'name' | 'source'>[]): string {
  return JSON.stringify([...skills].sort((left, right) => left.name.localeCompare(right.name)).map(({ name, source }) => ({ name, source })));
}
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
export function createBuildIdentity(packageVersion: string, agents: readonly AbstractAgent[], skills: readonly Skill[]): BuildIdentity {
  const sourceSkillSha256 = sha256(canonicalSkillSourceBytes(skills));
  const buildSha256 = sha256(JSON.stringify({ packageVersion,
    agents: [...agents].sort((left, right) => left.name.localeCompare(right.name)).map(agent => ({
      name: agent.name, description: agent.description, reasoning: agent.reasoning, deny: agent.deny ?? [], instructions: agent.instructions,
    })), sourceSkillSha256 }));
  return { schemaVersion: BUILD_IDENTITY_SCHEMA_VERSION, packageVersion, buildSha256, sourceSkillSha256 };
}
export function readBuildAgents(sourceRoot: string): AbstractAgent[] {
  const directory = join(sourceRoot, 'src/agents');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(file => file.endsWith('.agent.yaml')).map(file => parse(readFileSync(join(directory, file), 'utf8')));
}
export function readSkills(sourceRoot: string): Skill[] {
  const directory = join(sourceRoot, 'src/skills');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name, 'SKILL.md');
    if (!existsSync(path)) return [];
    const source = readFileSync(path, 'utf8');
    const match = /^---\n([\s\S]*?)\n---/u.exec(source);
    const frontmatter: { name?: string; description?: string } = match?.[1] ? parse(match[1]) : {};
    return [{ name: frontmatter.name ?? name, description: frontmatter.description ?? '', source }];
  });
}
export function packageVersion(sourceRoot: string): string {
  const manifest: { version: string } = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  return manifest.version;
}
export function createBuildIdentityFromSource(sourceRoot: string): BuildIdentity {
  return createBuildIdentity(packageVersion(sourceRoot), readBuildAgents(sourceRoot), readSkills(sourceRoot));
}
