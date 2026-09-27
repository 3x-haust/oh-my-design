import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
import { fixture, snapshot, write } from './helpers/phase6-process.ts';
import { publishCandidatePlan } from '../core/brief/candidate-plan.ts';
import { jsonBytes } from '../core/brief/candidate-data.ts';
import { loadRoleProfile } from '../core/brief/profiles.ts';

const root = new URL('..', import.meta.url).pathname;
const cliPath = join(root, 'bin', 'omd.ts');
const cliSource = readFileSync(cliPath, 'utf8');

interface PromptCommand {
  readonly file: string;
  readonly command: string;
  readonly subcommand?: string;
}

const promptPaths = [
  ...readdirSync(join(root, 'src', 'agents'))
    .filter((name) => name.endsWith('.agent.yaml'))
    .map((name) => join(root, 'src', 'agents', name)),
  ...readdirSync(join(root, 'src', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, 'src', 'skills', entry.name, 'SKILL.md')),
];

function bracedBody(source: string, openBrace: number): string {
  let depth = 0;
  let quote: 'single' | 'double' | 'template' | undefined;
  let lineComment = false;
  let blockComment = false;
  for (let index = openBrace; index < source.length; index++) {
    const char = source[index]!;
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') { blockComment = false; index++; }
      continue;
    }
    if (quote) {
      if (char === '\\') { index++; continue; }
      if ((quote === 'single' && char === "'")
        || (quote === 'double' && char === '"')
        || (quote === 'template' && char === '`')) quote = undefined;
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; index++; continue; }
    if (char === '/' && next === '*') { blockComment = true; index++; continue; }
    if (char === "'") { quote = 'single'; continue; }
    if (char === '"') { quote = 'double'; continue; }
    if (char === '`') { quote = 'template'; continue; }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(openBrace + 1, index);
  }
  throw new Error('unterminated dispatcher block');
}

function functionBody(name: string): { body: string; firstParameter?: string } {
  const declaration = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(([^)]*)\\)[^{]*\\{`).exec(cliSource);
  assert.ok(declaration?.index !== undefined, `missing dispatcher function ${name}`);
  const openBrace = cliSource.indexOf('{', declaration.index + declaration[0].length - 1);
  const firstParameter = declaration[1]?.split(',')[0]?.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1];
  return { body: bracedBody(cliSource, openBrace), ...(firstParameter ? { firstParameter } : {}) };
}

function comparedValues(source: string, identifiers: readonly string[]): Set<string> {
  const values = new Set<string>();
  for (const identifier of identifiers) {
    const escaped = identifier.replaceAll('$', '\\$');
    for (const match of source.matchAll(new RegExp(`\\b${escaped}\\s*(?:===|!==)\\s*['\"]([^'\"]+)['\"]`, 'g'))) {
      values.add(match[1]!);
    }
    for (const match of source.matchAll(new RegExp(`\\[([^\\]]+)\\]\\.includes\\(\\s*${escaped}\\b`, 'g'))) {
      for (const literal of match[1]!.matchAll(/['"]([^'"]+)['"]/g)) values.add(literal[1]!);
    }
  }
  return values;
}

function commandDispatcher(): {
  commands: Set<string>;
  subcommands: Map<string, Set<string>>;
  positionalSecond: Set<string>;
} {
  const main = functionBody('main').body;
  const commands = comparedValues(main, ['cmd']);
  const subcommands = new Map<string, Set<string>>();
  // These dispatch their second token as registry/path data rather than a finite subcommand label.
  const positionalSecond = new Set<string>(['pack', 'schema']);
  const add = (command: string, values: Iterable<string>): void => {
    const target = subcommands.get(command) ?? new Set<string>();
    for (const value of values) target.add(value);
    if (target.size > 0) subcommands.set(command, target);
  };

  const addHandler = (command: string, handlerName: string): void => {
    const handler = functionBody(handlerName);
    const identifiers = [...new Set([handler.firstParameter, 'mode', 'sub', 'subcommand'].filter((value): value is string => Boolean(value)))];
    add(command, comparedValues(handler.body, identifiers));
    if (handler.firstParameter && new RegExp(`if\\s*\\(\\s*${handler.firstParameter}\\s*\\)`).test(handler.body)) {
      positionalSecond.add(command);
    }
  };

  for (const match of main.matchAll(/if\s*\(cmd\s*===\s*['"]([^'"]+)['"]\)\s*\{/g)) {
    const command = match[1]!;
    const openBrace = main.indexOf('{', match.index! + match[0].length - 1);
    const body = bracedBody(main, openBrace);
    add(command, comparedValues(body, ['sub']));
    for (const handler of body.matchAll(/return\s+(cmd[A-Za-z0-9_$]+)\(sub\b/g)) addHandler(command, handler[1]!);
  }
  for (const match of main.matchAll(/cmd\s*===\s*['"]([^'"]+)['"][^\n{;]*?sub\s*===\s*['"]([^'"]+)['"]/g)) {
    add(match[1]!, [match[2]!]);
  }

  for (const match of main.matchAll(/if\s*\(cmd\s*===\s*['"]([^'"]+)['"]\)\s*return\s+(cmd[A-Za-z0-9_$]+)\(/g)) {
    addHandler(match[1]!, match[2]!);
  }
  return { commands, subcommands, positionalSecond };
}

function codeContexts(source: string): string[] {
  const contexts: string[] = [];
  const withoutFences = source.replace(/```[^\n]*\n([\s\S]*?)```/g, (_match, body: string) => {
    contexts.push(body);
    return '';
  });
  for (const match of withoutFences.matchAll(/`([^`]+)`/gs)) contexts.push(match[1]!);
  return contexts;
}

function promptCommands(): PromptCommand[] {
  const found: PromptCommand[] = [];
  for (const absolutePath of promptPaths) {
    const source = readFileSync(absolutePath, 'utf8');
    const file = relative(root, absolutePath);
    for (const context of codeContexts(source)) {
      const normalized = context.replace(/\\\s*\n/g, ' ').replace(/\s+/g, ' ');
      for (const match of normalized.matchAll(/\bomd\s+([a-z][a-z0-9-]*)(?:\s+([a-z][a-z0-9-]*))?/g)) {
        found.push({ file, command: match[1]!, ...(match[2] ? { subcommand: match[2] } : {}) });
      }
    }
  }
  return found;
}

test('prompt OMD commands resolve through the live bin/omd.ts dispatcher', () => {
  const dispatcher = commandDispatcher();
  const unresolved: string[] = [];
  for (const invocation of promptCommands()) {
    if (!dispatcher.commands.has(invocation.command)) {
      unresolved.push(`${invocation.file}: omd ${invocation.command}`);
      continue;
    }
    const knownSubcommands = dispatcher.subcommands.get(invocation.command);
    if (!dispatcher.positionalSecond.has(invocation.command)
      && knownSubcommands && invocation.subcommand && !knownSubcommands.has(invocation.subcommand)) {
      unresolved.push(`${invocation.file}: omd ${invocation.command} ${invocation.subcommand}`);
    }
  }
  assert.deepEqual([...new Set(unresolved)].sort(), []);
});

function roleCommandArgs(role: string): string[][] {
  const agent = parse(readFileSync(join(root, 'src/agents', `${role}.agent.yaml`), 'utf8')) as { instructions: string };
  return codeContexts(agent.instructions).map(context => context.replace(/\s+/g, ' ').trim())
    .filter(context => context.startsWith('omd ')).map(context => context.split(' ').slice(1));
}

test('role projection commands cited by source prompts execute through the real CLI without granting entry or Eye evidence', t => {
  const f = fixture(t), plan = publishCandidatePlan(f.root, f.plan, f.writer, f.invocation);
  const sketchPath = '.omd/.cache/sketch-brief.json';
  write(f.root, sketchPath, jsonBytes({ schema: 'sketch-brief-v1', mode: 'visual-study', plan,
    candidateId: 'A', sourceDirectory: '.omd/.cache/sketches/A' }));
  const before = snapshot(f.root);
  const scopes = {
    'art-director': ['candidate-generation', 'art-direction'], sketch: ['candidate-generation'],
    eye: ['candidate-generation'], typesetter: ['type-proof'], composer: ['composition'], hand: ['production', 'browser-evidence'],
  };
  for (const [role, stages] of Object.entries(scopes)) {
    const commands = roleCommandArgs(role).filter(args => args[0] === 'brief');
    assert.equal(commands.length, stages.length, role);
    for (const [index, command] of commands.entries()) {
      const mode = role === 'eye' ? 'concept-selection' : 'visual-study';
      const args = command.map(arg => arg === '<stage>' ? stages[index]! : arg === '<mode>' ? mode
        : arg === '<sketch-brief.json>' ? sketchPath : arg);
      assert.equal(args[1], stages[index]);
      assert.equal(args[args.indexOf('--role') + 1], `omd-${role}`);
      assert.equal(args.includes('--check'), false);
      assert.equal(args.includes('--input'), role === 'sketch');
      const result = spawnSync(process.execPath, [cliPath, ...args], { cwd: f.root, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const brief = JSON.parse(result.stdout);
      assert.equal(brief.schema, 'role-brief-v1'); assert.equal(brief.role, `omd-${role}`);
      if (args.includes('--mode')) assert.equal(brief.profile.sha256, loadRoleProfile(`omd-${role}`, args[args.indexOf('--mode') + 1]!).sha256);
      if (role === 'eye') {
        assert.equal(brief.delivery, 'isolated-host-packet-required');
        assert.deepEqual(brief.inputs, []); assert.deepEqual(brief.images, []);
        assert.equal(Object.hasOwn(brief, 'references'), false);
      }
    }
  }
  assert.deepEqual(snapshot(f.root), before);
});

test('source publisher and study-check examples use the exact current command argument ABI', t => {
  const director = roleCommandArgs('art-director'), sketch = roleCommandArgs('sketch');
  assert.ok(director.some(args => JSON.stringify(args) === JSON.stringify(['art-direction', 'check-input', '--json'])));
  assert.ok(director.some(args => JSON.stringify(args) === JSON.stringify(['art-direction', 'check', '--input', '<art-direction-input.json>', '--json'])));
  assert.ok(sketch.some(args => JSON.stringify(args) === JSON.stringify(['candidate', 'study-check', '--input', '<study.json>', '--brief', '<sketch-brief.json>', '--json'])));
  const schema = director.find(args => args[0] === 'schema' && args[1] === 'art-direction-input-v3');
  assert.ok(schema);
  const f = fixture(t), result = spawnSync(process.execPath, [cliPath, ...schema], { cwd: f.root, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).skeleton.schema, 'art-direction-input-v3');
});

test('source prompts never reference the removed omd-codex launcher', () => {
  const offenders = promptPaths
    .filter((path) => readFileSync(path, 'utf8').includes('omd-codex'))
    .map((path) => relative(root, path));
  assert.deepEqual(offenders, []);
});
