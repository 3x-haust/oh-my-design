#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { emitCodex } from './codex.ts';
import { emitClaude } from './claude.ts';
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

  const emitters: Record<Host, (opts: { agents: AbstractAgent[] }) => Emitted> = {
    codex: emitCodex,
    claude: emitClaude,
  };

  for (const host of Object.keys(emitters) as Host[]) {
    const { files } = emitters[host]({ agents });
    for (const [rel, content] of Object.entries(files)) write(host, rel, content);

    for (const skill of skills) {
      write(host, `skills/${skill.name}/SKILL.md`, skill.source);
      if (host === 'codex') {
        write(host, `skills/${skill.name}/agents/openai.yaml`, [
          'interface:',
          `  display_name: ${JSON.stringify(titleCase(skill.name))}`,
          `  short_description: ${JSON.stringify(firstSentence(skill.description))}`,
          '',
        ].join('\n'));
      }
    }

    console.log(`${host}: ${Object.keys(files).length} files, ${skills.length} skills`);
  }
}

// Run when invoked directly (`node adapters/build.ts`), not when imported by install.ts.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) build();
