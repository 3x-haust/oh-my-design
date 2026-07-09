#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { emitCodex } from './codex.mjs';
import { emitClaude } from './claude.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const readAll = (dir, ext, parse) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(ext))
    .map((f) => parse(readFileSync(join(root, dir, f), 'utf8')));

const hooks = readAll('src/hooks', '.hook.json', JSON.parse);
const agents = readAll('src/agents', '.agent.yaml', parseYaml);

for (const [host, emit] of [['codex', emitCodex], ['claude', emitClaude]]) {
  const { files } = emit({ hooks, agents });
  for (const [rel, content] of Object.entries(files)) {
    const path = join(root, 'dist', host, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
  console.log(`${host}: ${Object.keys(files).length} files`);
}
