#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { emitCodex } from './codex.ts';
import { emitClaude, emitClaudePlugin, pluginizeSkill } from './claude.ts';
import { substituter } from './tokens.ts';
import type { AbstractAgent, Emitted, Host } from '../core/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readAll<T>(sourceRoot: string, dir: string, ext: string, parseOne: (text: string) => T): T[] {
  const path = join(sourceRoot, dir);
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((f) => f.endsWith(ext))
    .map((f) => parseOne(readFileSync(join(path, f), 'utf8')));
}

export interface Skill {
  name: string;
  description: string;
  source: string;
}
export const BUILD_IDENTITY_SCHEMA_VERSION = 'omd-build-identity-v1' as const;

export type BuildIdentity = {
  readonly schemaVersion: typeof BUILD_IDENTITY_SCHEMA_VERSION;
  readonly packageVersion: string;
  readonly buildSha256: string;
  readonly sourceSkillSha256: string;
};

export function canonicalSkillSourceBytes(skills: readonly Pick<Skill, 'name' | 'source'>[]): string {
  return JSON.stringify(
    [...skills]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(({ name, source }) => ({ name, source })),
  );
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function createBuildIdentity(
  packageVersion: string,
  agents: readonly AbstractAgent[],
  skills: readonly Skill[],
): BuildIdentity {
  const sourceSkillSha256 = sha256(canonicalSkillSourceBytes(skills));
  const buildSha256 = sha256(JSON.stringify({
    packageVersion,
    agents: [...agents]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((agent) => ({
        name: agent.name,
        description: agent.description,
        reasoning: agent.reasoning,
        deny: agent.deny ?? [],
        instructions: agent.instructions,
      })),
    sourceSkillSha256,
  }));
  return { schemaVersion: BUILD_IDENTITY_SCHEMA_VERSION, packageVersion, buildSha256, sourceSkillSha256 };
}

function readSkills(sourceRoot: string): Skill[] {
  const dir = join(sourceRoot, 'src', 'skills');
  if (!existsSync(dir)) return [];
  const skills: Skill[] = [];
  for (const name of readdirSync(dir)) {
    const file = join(dir, name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const source = readFileSync(file, 'utf8');
    const match = /^---\n([\s\S]*?)\n---/.exec(source);
    const frontmatter = (match?.[1] ? parse(match[1]) : {}) as { name?: string; description?: string };
    skills.push({ name: frontmatter.name ?? name, description: frontmatter.description ?? '', source });
  }
  return skills;
}

function packageVersion(sourceRoot: string): string {
  return (JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8')) as { version: string }).version;
}

export function createBuildIdentityFromSource(sourceRoot: string): BuildIdentity {
  return createBuildIdentity(
    packageVersion(sourceRoot),
    readAll<AbstractAgent>(sourceRoot, 'src/agents', '.agent.yaml', (t) => parse(t) as AbstractAgent),
    readSkills(sourceRoot),
  );
}

const firstSentence = (s: string): string => (/^[^.。]*[.。]?/.exec(s.trim())?.[0] ?? '').trim();
const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
export const skillDisplayName = (name: string): string => name.startsWith('omd-') ? `(omd) ${name.slice(4)}` : titleCase(name);

export const skillOpenaiMetadata = (name: string, description: string): string => [
  'interface:',
  `  display_name: ${JSON.stringify(skillDisplayName(name))}`,
  `  short_description: ${JSON.stringify(firstSentence(description))}`,
  '',
].join('\n');

function write(host: Host, rel: string, content: unknown): void {
  const path = join(root, 'dist', host, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

export function build(): void {
  // Wipe first. A file that stopped being emitted must stop being installed — a stale
  // hooks/ directory left here is a gate that quietly comes back to life.
  rmSync(join(root, 'dist'), { recursive: true, force: true });

  const agents = readAll<AbstractAgent>(root, 'src/agents', '.agent.yaml', (t) => parse(t) as AbstractAgent);
  const skills = readSkills(root);

  const pkg = { version: packageVersion(root) };

  const buildIdentity = createBuildIdentity(pkg.version, agents, skills);
  const emitters: Record<Host, (opts: { agents: AbstractAgent[]; buildIdentity: BuildIdentity }) => Emitted> = {
    codex: (opts) => emitCodex({ ...opts, version: pkg.version }),
    claude: emitClaude,
  };

  for (const host of Object.keys(emitters) as Host[]) {
    const { files } = emitters[host]({ agents, buildIdentity });
    for (const [rel, content] of Object.entries(files)) write(host, rel, content);

    const sub = substituter(host);
    for (const skill of skills) {
      write(host, `skills/${skill.name}/SKILL.md`, sub(skill.source));
      if (host === 'codex') {
        write(host, `skills/${skill.name}/agents/openai.yaml`, skillOpenaiMetadata(skill.name, skill.description));
      }
    }

    // Copy theory pack so agents can read it via `omd pack dir` + /theory/
    const theoryDir = join(root, 'core', 'theory');
    if (existsSync(theoryDir)) {
      for (const f of readdirSync(theoryDir).filter((f) => f.endsWith('.md'))) {
        write(host, `core/theory/${f}`, readFileSync(join(theoryDir, f), 'utf8'));
      }
    }

    // Copy motion pack (easing vocabulary + recipe cookbook) so agents can read it
    // via `omd pack dir` + /motion/ and /motion/recipes/
    const motionDir = join(root, 'core', 'motion');
    if (existsSync(motionDir)) {
      for (const f of readdirSync(motionDir).filter((f) => f.endsWith('.md'))) {
        write(host, `core/motion/${f}`, readFileSync(join(motionDir, f), 'utf8'));
      }
      const recipesDir = join(motionDir, 'recipes');
      if (existsSync(recipesDir)) {
        for (const f of readdirSync(recipesDir).filter((f) => f.endsWith('.md'))) {
          write(host, `core/motion/recipes/${f}`, readFileSync(join(recipesDir, f), 'utf8'));
        }
      }
    }

    // Copy composition pack (page-level composition recipes) so agents can read it
    // via `omd pack dir` + /composition/
    const compositionDir = join(root, 'core', 'composition');
    if (existsSync(compositionDir)) {
      for (const f of readdirSync(compositionDir).filter((f) => f.endsWith('.md'))) {
        write(host, `core/composition/${f}`, readFileSync(join(compositionDir, f), 'utf8'));
      }
    }

    // Copy graphics pack (background and image treatment recipes) so agents can read it
    // via `omd pack dir` + /graphics/
    const graphicsDir = join(root, 'core', 'graphics');
    if (existsSync(graphicsDir)) {
      for (const f of readdirSync(graphicsDir).filter((f) => f.endsWith('.md'))) {
        write(host, `core/graphics/${f}`, readFileSync(join(graphicsDir, f), 'utf8'));
      }
    }

    // Copy craft pack (finish-pass checklist and related craft material) so agents can read it
    // via `omd pack dir` + /craft/
    const craftDir = join(root, 'core', 'craft');
    if (existsSync(craftDir)) {
      for (const f of readdirSync(craftDir).filter((f) => f.endsWith('.md'))) {
        write(host, `core/craft/${f}`, readFileSync(join(craftDir, f), 'utf8'));
      }
    }

    // Copy the host-neutral loop contract alongside the theory/cookbook packs.
    const protocolDir = join(root, 'core', 'protocol');
    if (existsSync(protocolDir)) {
      for (const f of readdirSync(protocolDir).filter((f) => f.endsWith('.md'))) {
        write(host, `core/protocol/${f}`, readFileSync(join(protocolDir, f), 'utf8'));
      }
    }

    console.log(`${host}: ${Object.keys(files).length} files, ${skills.length} skills`);
  }

  emitPlugin(agents, skills);
}

/**
 * The marketplace flavor: written to <root>/skills, <root>/agents, <root>/.mcp.json —
 * NOT dist/. This is what a marketplace install of the "omd" plugin actually loads, so
 * unlike dist/ it must be committed. `join(root, 'skills')` is deliberately distinct from
 * `join(root, 'src', 'skills')` (the source of truth, read by readSkills above) — this
 * function must never wipe or write under src/.
 */
function emitPlugin(agents: AbstractAgent[], skills: Skill[]): void {
  for (const dir of ['skills', 'agents']) rmSync(join(root, dir), { recursive: true, force: true });
  rmSync(join(root, '.mcp.json'), { force: true });

  const pluginized = skills.map((skill) => pluginizeSkill(skill.source));
  for (let i = 0; i < pluginized.length; i += 1) {
    const { name, source } = pluginized[i]!;
    const canonical = skills[i]!;
    const path = join(root, 'skills', name, 'SKILL.md');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
    const metadataPath = join(root, 'skills', name, 'agents', 'openai.yaml');
    mkdirSync(dirname(metadataPath), { recursive: true });
    writeFileSync(metadataPath, skillOpenaiMetadata(canonical.name, canonical.description));
  }

  const { files } = emitClaudePlugin({ agents });
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }

  console.log(`plugin (root): ${pluginized.length} skills, ${agents.length} agents`);
}

// Run when invoked directly (`node adapters/build.ts`), not when imported by install.ts.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) build();
