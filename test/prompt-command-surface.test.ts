import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  PUBLIC_COMMANDS,
  PUBLIC_REF_COMMANDS,
  PUBLIC_SCHEMA_NAMES,
} from '../bin/cli/public-surface.ts';

const root = new URL('..', import.meta.url).pathname;
const cli = join(root, 'bin', 'omd.ts');

type Grammar = Readonly<{
  literals: ReadonlySet<string>;
  positional: boolean;
}>;

function sources(): readonly string[] {
  return [
    join(root, 'src/skills/omd-ultradesign/SKILL.md'),
    ...readdirSync(join(root, 'core/guides'))
      .filter(name => name.endsWith('.md'))
      .map(name => join(root, 'core/guides', name)),
    ...readdirSync(join(root, 'src/agents'))
      .filter(name => name.endsWith('.agent.yaml'))
      .map(name => join(root, 'src/agents', name)),
  ];
}

function helpGrammar(output: string): ReadonlyMap<string, Grammar> {
  const mutable = new Map<string, { literals: Set<string>; positional: boolean }>();
  const add = (command: string, token: string | undefined): void => {
    const grammar = mutable.get(command) ?? { literals: new Set<string>(), positional: false };
    if (token !== undefined && !token.startsWith('[')) {
      for (const literal of token.split('|')) {
        if (literal.startsWith('<')) grammar.positional = true;
        else grammar.literals.add(literal);
      }
    }
    mutable.set(command, grammar);
  };
  for (const line of output.split('\n').map(value => value.trim()).filter(Boolean)) {
    if (line === 'Usage:' || line.startsWith('usage:')) continue;
    for (const form of line.split(/\s+\|\s+/u)) {
      const [command, token] = form.split(/\s+/u);
      if (command !== undefined) add(command, token);
    }
  }
  return new Map([...mutable].map(([command, grammar]) => [
    command,
    { literals: grammar.literals, positional: grammar.positional },
  ]));
}

test('prompt command code spans resolve against the retained CLI dispatcher surface', () => {
  const help = spawnSync(process.execPath, [cli, 'help'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(help.status, 0, help.stderr);
  const grammar = helpGrammar(help.stdout);
  const publicCommands = new Set<string>(PUBLIC_COMMANDS);
  const refCommands = new Set<string>(PUBLIC_REF_COMMANDS);
  const failures = new Set<string>();

  for (const path of sources()) {
    const text = readFileSync(path, 'utf8');
    for (const span of text.matchAll(/`([^`\n]+)`/gu)) {
      const codeSpan = span[1];
      if (codeSpan === undefined) continue;
      for (const invocation of codeSpan.matchAll(/\bomd\s+([a-z][a-z0-9-]*)(?:\s+([a-z][a-z0-9-]*))?/gu)) {
        const command = invocation[1];
        if (command === undefined) continue;
        const subcommand = invocation[2];
        let valid = publicCommands.has(command);
        if (valid && subcommand !== undefined) {
          if (command === 'ref') valid = refCommands.has(subcommand);
          else if (command === 'schema') {
            valid = subcommand === 'list' || subcommand === 'ai-judgment'
              || PUBLIC_SCHEMA_NAMES.has(subcommand);
          } else {
            const allowed = grammar.get(command);
            valid = allowed !== undefined
              && (allowed.positional || allowed.literals.has(subcommand));
          }
        }
        if (!valid) {
          failures.add(`${relative(root, path)}: omd ${command}${subcommand === undefined ? '' : ` ${subcommand}`}`);
        }
      }
    }
  }

  assert.deepEqual([...failures], []);
});
