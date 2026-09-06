import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BRIEF_REFERENCES, buildBrief, formatBrief } from '../core/brief/index.ts';
import { publishContentGrain } from '../core/content-grain/files.ts';
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
test('selected content grain reaches downstream briefs and stale bytes block them', () => {
  const dir = project();
  const content = '{"services":[{"description":"짧음"},{"description":"대표 설명"},{"description":"보호해야 할 긴 예외 설명"}]}';
  mkdirSync(join(dir, 'content'), { recursive: true });
  writeFileSync(join(dir, 'content', 'catalog.json'), content);
  const input = JSON.parse(read('test/fixtures/adaptive-flow/medical-new-product.json'));
  const invocation = publishTestAdaptiveRoute(dir, input);
  const grain = publishContentGrain(dir, {
    schema: 'content-grain-v1',
    status: 'active',
    sources: [{
      id: 'catalog',
      authority: 'project-first-party',
      path: 'content/catalog.json',
      sha256: createHash('sha256').update(content).digest('hex'),
    }],
    fixtures: [
      { id: 'typical', sourceId: 'catalog', locator: '$.services[1]', role: 'typical' },
      { id: 'longest', sourceId: 'catalog', locator: '$.services[2]', role: 'maximum' },
    ],
    traits: [{
      id: 'description-length',
      sourceIds: ['catalog'],
      fixtureIds: ['typical', 'longest'],
      metric: { kind: 'range', unit: 'graphemes', minimum: 2, typical: 5, maximum: 18 },
      semanticRole: 'primary-proof',
      antiTemplateConsequence: 'Do not flatten all descriptions into equal cards.',
      responsiveConsequence: 'Keep the long exception adjacent to its action.',
      falsifier: 'The longest fixture clips or loses priority.',
    }],
  }, invocation);

  const brief = buildBrief(dir, 'composition', undefined, invocation);
  assert.deepEqual(brief.contentGrain, {
    path: '.omd/content-grain.json',
    schema: 'content-grain-v1',
    status: 'active',
    sha256: grain.grainSha256,
  });
  assert.equal(brief.blockers.some((entry) => entry.includes('content grain')), false);

  writeFileSync(join(dir, 'content', 'catalog.json'), '{"services":[]}');
  const stale = buildBrief(dir, 'composition', undefined, invocation);
  assert.equal(stale.contentGrain, null);
  assert.ok(stale.blockers.some((entry) => entry.includes('STALE_CONTENT_GRAIN_SOURCE')));
});

test('skipped content grain is omitted from downstream judgedBy checks', () => {
  const dir = project();
  const input = JSON.parse(readFileSync(fileURLToPath(
    new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url),
  ), 'utf8')) as Record<string, unknown>;
  const strategy = Reflect.get(input, 'strategyDecision') as Record<string, unknown>;
  Reflect.set(
    strategy,
    'stages',
    (Reflect.get(strategy, 'stages') as string[]).filter((stage) => stage !== 'content-grain'),
  );
  const skips = Reflect.get(strategy, 'skips') as Array<{ id: string; reason: string }>;
  skips.push({
    id: 'content-grain',
    reason: 'No supplied content source exists to justify a Grain contract.',
  });
  const invocation = publishTestAdaptiveRoute(dir, input);

  for (const stage of ['composition', 'production'] as const) {
    const brief = buildBrief(dir, stage, undefined, invocation);
    assert.equal(
      brief.judgedBy.some((check) => check.command === 'omd grain check --json'),
      false,
      `${stage} must not require skipped Content Grain`,
    );
  }
});

test('single-locale briefs omit the multi-locale gate until a contract exists', () => {
  const dir = project();
  const withoutContract = buildBrief(dir, 'copy');
  assert.equal(
    withoutContract.judgedBy.some((check) => check.command === 'omd locale check'),
    false,
  );

  writeFileSync(join(dir, '.omd', 'locale.json'), '{}');
  const withContract = buildBrief(dir, 'copy');
  assert.equal(
    withContract.judgedBy.some((check) => check.command === 'omd locale check'),
    true,
  );
});

test('production brief blocks missing selected inputs and supplies every present upstream artifact', () => {
  const dir = project();
  const input = JSON.parse(read('test/fixtures/adaptive-flow/medical-new-product.json'));
  const strategy = Reflect.get(input, 'strategyDecision') as Record<string, unknown>;
  (Reflect.get(strategy, 'methods') as string[]).push('copy-repair-workflow');
  Reflect.set(
    strategy,
    'skips',
    (Reflect.get(strategy, 'skips') as Array<{ id: string; reason: string }>)
      .filter((entry) => entry.id !== 'copy-repair-workflow'),
  );
  const invocation = publishTestAdaptiveRoute(dir, input);

  const missing = buildBrief(dir, 'production', undefined, invocation);
  assert.ok(missing.blockers.some((blocker) =>
    blocker === 'selected production input missing: .omd/composition.md'
  ));
  assert.ok(missing.blockers.some((blocker) =>
    blocker === 'selected production input missing: candidate-generation'
  ));
  assert.ok(missing.blockers.some((blocker) =>
    blocker === 'selected production input missing: .omd/.cache/copy-eye.md'
  ));

  const selectedInputs = [
    '.omd/frame.md',
    '.omd/content-grain.json',
    '.omd/scout.md',
    '.omd/reference-board.json',
    '.omd/copy-deck.md',
    '.omd/composition.md',
  ];
  for (const path of selectedInputs) writeFileSync(join(dir, path), `${path}\n`);
  mkdirSync(join(dir, '.omd', '.cache'), { recursive: true });
  writeFileSync(join(dir, '.omd', '.cache', 'copy-eye.md'), 'copy review\n');
  const selectedCandidate = join(dir, '.omd', '.cache', 'sketches', 'test-selected');
  mkdirSync(selectedCandidate, { recursive: true });
  for (const name of ['index.html', 'noun-swap-test.json', 'selection.json', 'ux-models.json']) {
    writeFileSync(join(selectedCandidate, name), `${name}\n`);
  }

  const ready = buildBrief(dir, 'production', undefined, invocation);
  for (const path of selectedInputs) assert.ok(ready.prior.includes(path), path);
  assert.ok(ready.prior.includes('.omd/.cache/copy-eye.md'));
  for (const name of ['index.html', 'noun-swap-test.json', 'selection.json', 'ux-models.json']) {
    assert.ok(ready.prior.includes(`.omd/.cache/sketches/test-selected/${name}`), name);
  }
  assert.equal(ready.blockers.some((blocker) => blocker.startsWith('selected production input missing:')), false);
});

test('candidate generation has a Sketch-owned brief with selected upstream inputs', () => {
  const dir = project();
  const input = JSON.parse(read('test/fixtures/adaptive-flow/medical-new-product.json'));
  const invocation = publishTestAdaptiveRoute(dir, input);

  const missing = buildBrief(dir, 'candidate-generation', undefined, invocation);
  assert.equal(missing.owner, 'omd-sketch');
  assert.deepEqual(missing.owns, ['structurally distinct UX candidates and selected model metadata']);
  assert.ok(missing.blockers.some((blocker) =>
    blocker === 'selected candidate-generation input missing: .omd/composition.md'
  ));

  const selectedInputs = [
    '.omd/frame.md',
    '.omd/content-grain.json',
    '.omd/scout.md',
    '.omd/reference-board.json',
    '.omd/copy-deck.md',
    '.omd/composition.md',
  ];
  for (const path of selectedInputs) writeFileSync(join(dir, path), `${path}\n`);

  const ready = buildBrief(dir, 'candidate-generation', undefined, invocation);
  for (const path of selectedInputs) assert.ok(ready.prior.includes(path), path);
  assert.equal(
    ready.blockers.some((blocker) => blocker.startsWith('selected candidate-generation input missing:')),
    false,
  );
});

test('production brief prefers the authenticated current candidate pointer over legacy suffixes', () => {
  const dir = project();
  const input = JSON.parse(read('test/fixtures/adaptive-flow/medical-new-product.json'));
  const invocation = publishTestAdaptiveRoute(dir, input);
  for (const path of [
    '.omd/frame.md',
    '.omd/content-grain.json',
    '.omd/scout.md',
    '.omd/reference-board.json',
    '.omd/copy-deck.md',
    '.omd/composition.md',
  ]) writeFileSync(join(dir, path), `${path}\n`);

  const sketches = join(dir, '.omd', '.cache', 'sketches');
  const legacy = join(sketches, 'legacy-selected');
  const current = join(sketches, 'causal-workbench');
  mkdirSync(legacy, { recursive: true });
  mkdirSync(current, { recursive: true });
  for (const name of ['index.html', 'noun-swap-test.json', 'selection.json', 'ux-models.json']) {
    writeFileSync(join(legacy, name), `legacy ${name}\n`);
    writeFileSync(join(current, name), `current ${name}\n`);
  }
  const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
  writeFileSync(join(sketches, 'current.json'), JSON.stringify({
    schema: 'candidate-selection-pointer-v1',
    directory: 'causal-workbench',
    indexSha256: sha256('current index.html\n'),
    selectionSha256: sha256('current selection.json\n'),
  }));

  const brief = buildBrief(dir, 'production', undefined, invocation);
  assert.ok(brief.prior.includes('.omd/.cache/sketches/causal-workbench/index.html'));
  assert.ok(brief.prior.includes('.omd/.cache/sketches/causal-workbench/selection.json'));
  assert.equal(brief.prior.some((path) => path.includes('legacy-selected')), false);
});

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
  assert.ok(production.judgedBy.some((entry) => entry.command === 'omd check <page> --no-log'));
  assert.equal(production.judgedBy.some((entry) => entry.command === 'omd check <page>'), false);
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
