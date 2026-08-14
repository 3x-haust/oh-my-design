import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BRIEF_REFERENCES, buildBrief, formatBrief } from '../core/brief/index.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

function project(refCount = 0): string {
  const dir = mkdtempSync(join(tmpdir(), 'omd-brief-'));
  mkdirSync(join(dir, '.omd', 'refs'), { recursive: true });
  for (let index = 0; index < refCount; index++) {
    writeFileSync(join(dir, '.omd', 'refs', `source-${index}.json`), JSON.stringify({
      source: `https://example.com/${index}`,
      component: `component-${index}`,
      slot: `zone-${index}`,
      // half the captures recorded a measured principle; half are just files
      principles: index % 2 === 0 ? [`Measured principle ${index}.`] : [],
    }));
  }
  return dir;
}

// The brief replaces a ~19k-token coordinator skill. A brief that grows without bound has become
// the thing it replaced.
test('a brief stays bounded even when the project holds a hundred captures', () => {
  const dir = project(120);
  const brief = buildBrief(dir, 'production');
  assert.equal(brief.references.length, MAX_BRIEF_REFERENCES);
  assert.equal(brief.referencesOmitted, 120 - MAX_BRIEF_REFERENCES);

  const printed = formatBrief(brief);
  assert.ok(printed.length / 4 < 2000, `brief is ~${Math.round(printed.length / 4)} tokens`);
  assert.match(printed, /\+108 more — omd ref list/);
});

test('an adaptive route supplies bounded measured evidence without a route quota', () => {
  const dir = project(20);
  const fixture = JSON.parse(readFileSync(fileURLToPath(
    new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url),
  ), 'utf8'));
  const invocation = publishTestAdaptiveRoute(dir, fixture);
  const brief = buildBrief(dir, 'production', undefined, invocation);
  assert.equal(brief.route?.name, 'adaptive');
  assert.equal(brief.references.length, MAX_BRIEF_REFERENCES);
  assert.equal(brief.referencesOmitted, 20 - MAX_BRIEF_REFERENCES);
  assert.match(brief.route?.references ?? '', /^skip/);
});

// A capture with a measured principle is usable evidence; one without it is a file path.
test('a copy-only production brief honors the typed composition skip', () => {
  const dir = project();
  const input = JSON.parse(readFileSync(fileURLToPath(
    new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url),
  ), 'utf8'));
  const invocation = publishTestAdaptiveRoute(dir, input);

  const brief = buildBrief(dir, 'production', undefined, invocation);
  assert.equal(brief.owner, 'omd-hand');
  assert.equal(brief.blockers.some((blocker) => /composition/i.test(blocker)), false);
  assert.match(brief.route?.references ?? '', /^skip/);
});

test('the captures that carry a measured principle are the ones supplied', () => {
  const brief = buildBrief(project(40), 'production');
  assert.ok(brief.references.every((entry) => entry.take.length > 0), 'every supplied reference carries its principle');
});

/**
 * The whole point of the supply layer: it tells a role what is true and what will be checked, and
 * says nothing about how to reason. Imperative prose is what rots when a model's guidance changes.
 */
test('a brief carries evidence and acceptance, never behavioural instruction', () => {
  const dir = project(6);
  for (const stage of ['frame', 'scout', 'copy', 'composition', 'production', 'review'] as const) {
    const printed = formatBrief(buildBrief(dir, stage));
    assert.doesNotMatch(printed, /\b(you must|never|do not|always|forbidden|terminal failure)\b/i, `${stage}: ${printed}`);
  }
});

test('a brief names the stage owner, what it owns, and what will judge it', () => {
  const production = buildBrief(project(4), 'production');
  assert.equal(production.owner, 'omd-hand');
  assert.ok(production.judgedBy.some((entry) => entry.command === 'omd route check --activation <host-issued-invocation.json>'));
  const frame = buildBrief(project(), 'frame');
  assert.equal(frame.owner, 'omd-framer');
  assert.deepEqual([...frame.owns], ['.omd/frame.md']);
  assert.throws(() => buildBrief(project(), 'nonsense' as never), /unknown stage nonsense/);
});

test('a brief reports the missing inputs instead of letting a stage start blind', () => {
  const empty = buildBrief(project(), 'production');
  assert.ok(empty.blockers.some((entry) => /no route/.test(entry)));
  assert.equal(empty.blockers.some((entry) => /no references gathered/.test(entry)), false);
});

/**
 * The ratchet.
 *
 * OMD's coordinator skill reached ~19k tokens of behavioural prose, and every model release
 * invalidated an unknown part of it. A rule that a command can check does not belong here, so this
 * budget fails the build when the prompt layer grows back instead of moving into `core/`.
 */
test('the coordinator prompt layer stays under its budget', () => {
  const skill = read('src/skills/omd-ultradesign/SKILL.md');
  const tokens = Math.round(skill.length / 4);
  assert.ok(tokens <= 3000, `coordinator skill is ~${tokens} tokens; move a rule into a check or a brief instead of growing it`);

  const imperatives = (skill.match(/\b(never|must|do not|don't|always|forbidden|terminal)\b/gi) ?? []).length;
  assert.ok(imperatives <= 40, `coordinator skill carries ${imperatives} imperatives; convert one into a check or supplied evidence`);
});

test('every command a brief names as a judge is a real CLI command', () => {
  const cli = read('bin/omd.ts');
  const dir = project(2);
  const commands = new Set<string>();
  for (const stage of ['frame', 'acquisition', 'scout', 'copy', 'composition', 'production', 'review'] as const) {
    for (const check of buildBrief(dir, stage).judgedBy) commands.add(check.command.split(' ')[1]!);
  }
  for (const command of commands) {
    assert.match(cli, new RegExp(`cmd === '${command}'`), `omd ${command} is dispatched`);
  }
});
