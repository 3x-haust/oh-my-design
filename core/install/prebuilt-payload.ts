import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createBuildIdentityFromSource, skillOpenaiMetadata } from '../../adapters/build.ts';
import { emitClaude } from '../../adapters/claude.ts';
import { emitCodex } from '../../adapters/codex.ts';
import { substituter } from '../../adapters/tokens.ts';
import type { AbstractAgent, Host } from '../types.ts';

const PACK_DIRECTORIES = [
  ['core', 'theory'],
  ['core', 'motion'],
  ['core', 'motion', 'recipes'],
  ['core', 'composition'],
  ['core', 'graphics'],
  ['core', 'craft'],
  ['core', 'protocol'],
] as const;

export type ExpectedPrebuiltFile =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'json'; readonly value: unknown };

export function prebuiltRelativePath(path: string, pathSeparator: string = sep): string {
  return path.split(pathSeparator).join('/');
}

export class PrebuiltPayloadSourceError extends Error {
  override readonly name = 'PrebuiltPayloadSourceError';
  readonly path: string;
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`${path}: ${reason}`);
    this.path = path;
    this.reason = reason;
  }
}

export function expectedPrebuiltFiles(sourceRoot: string, host: Host): ReadonlyMap<string, ExpectedPrebuiltFile> {
  const agents = sourceAgents(sourceRoot);
  const buildIdentity = createBuildIdentityFromSource(sourceRoot);
  const emitted = host === 'codex'
    ? emitCodex({ agents, version: packageVersion(sourceRoot), buildIdentity })
    : emitClaude({ agents, buildIdentity });
  const files = new Map<string, ExpectedPrebuiltFile>();
  for (const [path, value] of Object.entries(emitted.files)) files.set(path, expectedValue(value));

  const substitute = substituter(host);
  for (const skill of sourceSkills(sourceRoot)) {
    files.set(`skills/${skill.name}/SKILL.md`, { kind: 'text', value: substitute(skill.source) });
    if (host === 'codex') {
      files.set(`skills/${skill.name}/agents/openai.yaml`, { kind: 'text', value: skillOpenaiMetadata(skill.name, skill.description) });
    }
  }
  for (const parts of PACK_DIRECTORIES) addPackFiles(files, sourceRoot, parts);
  return files;
}

function expectedValue(value: unknown): ExpectedPrebuiltFile {
  return typeof value === 'string' ? { kind: 'text', value } : { kind: 'json', value };
}

function sourceAgents(sourceRoot: string): AbstractAgent[] {
  const root = join(sourceRoot, 'src', 'agents');
  return readdirSync(root)
    .filter((name) => name.endsWith('.agent.yaml'))
    .map((name) => sourceAgent(join(root, name)));
}

function sourceAgent(path: string): AbstractAgent {
  const parsed = parseYaml(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) sourceInvalid(path, 'must contain a YAML object');
  const model = optionalString(parsed, 'model', path);
  const allow = optionalStrings(parsed, 'allow', path);
  const deny = optionalStrings(parsed, 'deny', path);
  return {
    name: sourceString(parsed, 'name', path),
    description: sourceString(parsed, 'description', path),
    reasoning: sourceString(parsed, 'reasoning', path),
    ...(model === undefined ? {} : { model }),
    ...(allow === undefined ? {} : { allow }),
    ...(deny === undefined ? {} : { deny }),
    instructions: sourceString(parsed, 'instructions', path),
  };
}

function sourceSkills(sourceRoot: string): readonly { readonly name: string; readonly description: string; readonly source: string }[] {
  const root = join(sourceRoot, 'src', 'skills');
  return readdirSync(root).flatMap((directory) => {
    const path = join(root, directory, 'SKILL.md');
    if (!existsSync(path)) return [];
    const source = readFileSync(path, 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1];
    const parsed = frontmatter === undefined ? undefined : parseYaml(frontmatter);
    const value = isRecord(parsed) ? parsed : {};
    return [{
      name: typeof value['name'] === 'string' ? value['name'] : directory,
      description: typeof value['description'] === 'string' ? value['description'] : '',
      source,
    }];
  });
}

function addPackFiles(files: Map<string, ExpectedPrebuiltFile>, sourceRoot: string, parts: readonly string[]): void {
  const source = join(sourceRoot, ...parts);
  if (!existsSync(source)) return;
  for (const name of readdirSync(source).filter((item) => item.endsWith('.md'))) {
    files.set(prebuiltRelativePath(join(...parts, name)), { kind: 'text', value: readFileSync(join(source, name), 'utf8') });
  }
}

function packageVersion(sourceRoot: string): string {
  const parsed = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'));
  if (!isRecord(parsed)) sourceInvalid(join(sourceRoot, 'package.json'), 'must contain a JSON object');
  return sourceString(parsed, 'version', join(sourceRoot, 'package.json'));
}

function sourceString(value: Record<string, unknown>, key: string, path: string): string {
  const item = value[key];
  if (typeof item === 'string') return item;
  return sourceInvalid(path, `${key} must be a string`);
}

function optionalString(value: Record<string, unknown>, key: string, path: string): string | undefined {
  const item = value[key];
  if (item === undefined || typeof item === 'string') return item;
  return sourceInvalid(path, `${key} must be a string`);
}

function optionalStrings(value: Record<string, unknown>, key: string, path: string): string[] | undefined {
  const item = value[key];
  if (item === undefined) return undefined;
  if (Array.isArray(item) && item.every((entry) => typeof entry === 'string')) return [...item];
  return sourceInvalid(path, `${key} must be an array of strings`);
}

function sourceInvalid(path: string, reason: string): never {
  throw new PrebuiltPayloadSourceError(path, reason);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
