import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reading the whole pack is what made a run expensive: the loop protocol alone is ~16k tokens and
// every role reloaded it, some in overlapping slices after truncation. Roles now cite the sections
// they need. A renamed heading would silently send them back to reading everything, so every cited
// section is checked against the file it names.

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACK = join(ROOT, 'core');
const run = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: ROOT });

const SOURCES = [
  ...readdirSync(join(ROOT, 'src', 'agents')).map((file) => join('src', 'agents', file)),
  join('src', 'skills', 'omd-ultradesign', 'SKILL.md'),
];

/** `omd pack <file> --section "<heading>"` and bare `--section "<heading>"` continuations. */
function citedSections(body: string): readonly { readonly file: string; readonly section: string }[] {
  const cited: { file: string; section: string }[] = [];
  let file: string | undefined;
  const pattern = /(?:omd pack\s+(\S+\.md)[^\n]*?)?--section\s+"([^"]+)"/g;
  for (const match of body.replace(/\n\s*/g, ' ').matchAll(pattern)) {
    if (match[1] !== undefined) file = match[1];
    // `--section "<heading>"` in prose is the placeholder documenting the flag, not a citation.
    if (file !== undefined && match[2] !== undefined && !match[2].startsWith('<')) cited.push({ file, section: match[2] });
  }
  return cited;
}

test('every pack section a role cites exists in the file it names', () => {
  const checked: string[] = [];
  for (const source of SOURCES) {
    for (const { file, section } of citedSections(readFileSync(join(ROOT, source), 'utf8'))) {
      const body = readFileSync(join(PACK, file), 'utf8');
      const headings = body.match(/^##\s+.+$/gm) ?? [];
      assert.ok(
        headings.some((heading) => heading.replace(/^##\s+/, '').trim() === section),
        `${source} cites "${section}" which is not a heading in ${file}: ${headings.join(' | ')}`,
      );
      checked.push(`${file}#${section}`);
    }
  }
  assert.ok(checked.length >= 12, `expected the roles to cite scoped sections, found ${checked.length}`);
});

test('a scoped read returns one section and costs a fraction of the whole file', () => {
  const whole = run(['pack', 'protocol/human-design-loop.md']);
  const scoped = run(['pack', 'protocol/human-design-loop.md', '--section', 'Surface grammar']);
  assert.equal(scoped.status, 0, scoped.stderr);
  assert.match(scoped.stdout, /^## Surface grammar\n/);
  assert.doesNotMatch(scoped.stdout, /^## Stack routing/m);
  assert.ok(scoped.stdout.length * 10 < whole.stdout.length, `scoped ${scoped.stdout.length} vs whole ${whole.stdout.length}`);
});

test('an unknown section names the available headings instead of printing the file', () => {
  const missing = run(['pack', 'protocol/human-design-loop.md', '--section', 'Nope']);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /pack section not found: Nope/);
  assert.match(missing.stderr, /## Surface grammar/);
});

test('no spawned role is told to read the coordinator skill', () => {
  for (const file of readdirSync(join(ROOT, 'src', 'agents'))) {
    const body = readFileSync(join(ROOT, 'src', 'agents', file), 'utf8').replace(/\s+/g, ' ');
    assert.doesNotMatch(body, /Read [^.]*omd-ultradesign/, `${file} sends a role into the coordinator skill`);
  }
  const scoped = ['composer', 'eye', 'framer', 'hand', 'scout', 'sketch', 'typesetter'];
  for (const role of scoped) {
    const body = readFileSync(join(ROOT, 'src', 'agents', `${role}.agent.yaml`), 'utf8').replace(/\s+/g, ' ');
    assert.match(body, /Never read the coordinator's `omd-ultradesign` skill/, `${role} may still reload the coordinator skill`);
  }
});

// Roles ask for several sections in one call; taking only the first would silently drop the rest
// and cost the extra round trip the flag exists to avoid.
test('repeated --section prints every requested section in one call', () => {
  const both = run(['pack', 'protocol/human-design-loop.md', '--section', 'Surface grammar', '--section', 'Task coverage matrix']);
  assert.equal(both.status, 0, both.stderr);
  assert.equal((both.stdout.match(/^## /gm) ?? []).length, 2);
  assert.match(both.stdout, /^## Surface grammar$/m);
  assert.match(both.stdout, /^## Task coverage matrix$/m);

  const partial = run(['pack', 'protocol/human-design-loop.md', '--section', 'Surface grammar', '--section', 'Nope']);
  assert.equal(partial.status, 1);
  assert.match(partial.stderr, /pack section not found: Nope/);
});
