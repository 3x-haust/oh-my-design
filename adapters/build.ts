#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { emitCodex } from './codex.ts';
import { emitClaude, emitClaudePlugin, pluginizeSkill } from './claude.ts';
import { substituter } from './tokens.ts';
import type { AbstractAgent, Emitted, Host } from '../core/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readAll<T>(dir: string, ext: string, parseOne: (text: string) => T): T[] {
  const path = join(root, dir);
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((f) => f.endsWith(ext))
    .map((f) => parseOne(readFileSync(join(path, f), 'utf8')));
}

interface Skill {
  name: string;
  description: string;
  source: string;
}

function readSkills(): Skill[] {
  const dir = join(root, 'src', 'skills');
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

const firstSentence = (s: string): string => (/^[^.。]*[.。]?/.exec(s.trim())?.[0] ?? '').trim();
const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function write(host: Host, rel: string, content: unknown): void {
  const path = join(root, 'dist', host, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

export function build(): void {
  // Wipe first. A file that stopped being emitted must stop being installed — a stale
  // hooks/ directory left here is a gate that quietly comes back to life.
  rmSync(join(root, 'dist'), { recursive: true, force: true });

  const agents = readAll<AbstractAgent>('src/agents', '.agent.yaml', (t) => parse(t) as AbstractAgent);
  const skills = readSkills();

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

  const emitters: Record<Host, (opts: { agents: AbstractAgent[] }) => Emitted> = {
    codex: (opts) => emitCodex({ ...opts, version: pkg.version }),
    claude: emitClaude,
  };

  for (const host of Object.keys(emitters) as Host[]) {
    const { files } = emitters[host]({ agents });
    for (const [rel, content] of Object.entries(files)) write(host, rel, content);

    const sub = substituter(host);
    for (const skill of skills) {
      write(host, `skills/${skill.name}/SKILL.md`, sub(skill.source));
      if (host === 'codex') {
        write(host, `skills/${skill.name}/agents/openai.yaml`, [
          'interface:',
          `  display_name: ${JSON.stringify(titleCase(skill.name))}`,
          `  short_description: ${JSON.stringify(firstSentence(skill.description))}`,
          '',
        ].join('\n'));
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
  for (const { name, source } of pluginized) {
    const path = join(root, 'skills', name, 'SKILL.md');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
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
