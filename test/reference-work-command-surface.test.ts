import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { PUBLIC_COMMANDS, PUBLIC_REF_COMMANDS } from '../bin/cli/public-surface.ts';
import { parseBrowseCommand } from '../core/ref/browse/parser.ts';

const root = new URL('..', import.meta.url).pathname;
const recommenderFiles = [
  'core/ref/browse/work.ts',
  'core/ref/discovery-work.ts',
  'core/ref/discovery-plan.ts',
] as const;

type EmittedCommand = Readonly<{ file: string; args: readonly string[] }>;

function emittedCommands(): readonly EmittedCommand[] {
  const emitted: EmittedCommand[] = [];
  for (const file of recommenderFiles) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const match of source.matchAll(/args:\s*\[((?:\s*'[^']*'\s*,?)+)\]/gu)) {
      const body = match[1];
      if (body === undefined) continue;
      const args = [...body.matchAll(/'([^']*)'/gu)]
        .map(token => token[1])
        .filter((token): token is string => token !== undefined);
      if (args[0] === 'ref' || args[0] === 'stage') emitted.push({ file, args });
    }
    for (const match of source.matchAll(/command:\s*'omd\s+([^']+)'/gu)) {
      const body = match[1];
      if (body === undefined) continue;
      const args = body.trim().split(/\s+/u);
      if (args[0] === 'ref' || args[0] === 'stage') emitted.push({ file, args });
    }
  }
  return emitted;
}

test('every retained reference recommender action resolves against the public dispatcher', () => {
  const publicCommands = new Set<string>(PUBLIC_COMMANDS);
  const publicRefCommands = new Set<string>(PUBLIC_REF_COMMANDS);
  const emitted = emittedCommands();
  assert.ok(emitted.length > 0);
  for (const { file, args } of emitted) {
    const [command, subcommand] = args;
    assert.ok(command !== undefined && publicCommands.has(command),
      `${relative(root, file)} emits unknown command: ${args.join(' ')}`);
    assert.ok(subcommand !== undefined, `${relative(root, file)} emits incomplete command: ${args.join(' ')}`);
    if (command === 'ref') {
      assert.ok(publicRefCommands.has(subcommand),
        `${relative(root, file)} emits unknown ref command: ${args.join(' ')}`);
      if (subcommand === 'browse') {
        assert.doesNotThrow(() => parseBrowseCommand(args.slice(2)));
      }
    } else {
      assert.deepEqual([command, subcommand], ['stage', 'next']);
    }
  }
});
