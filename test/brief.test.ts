import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BRIEF_REFERENCES, buildBrief, formatBrief } from '../core/brief/index.ts';
import { scanProject } from '../core/layout/scan.ts';
import { classifyArtifact } from '../core/layout/index.ts';
import { publishContentGrain } from '../core/content-grain/files.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter, publishTestAdaptiveRoute } from './helpers/project-write.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

test('route-only safety and browser stages have inspectable briefs with real schemas', () => {
  const dir = project();
  for (const stage of ['safety-validation', 'browser-evidence'] as const) {
    const brief = buildBrief(dir, stage);
    assert.equal(brief.owner, stage === 'safety-validation' ? 'omd-writer' : 'omd-hand');
    assert.ok(brief.owns.length > 0);
    assert.ok(brief.judgedBy.length > 0);
  }
});

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
test('a brief stays bounded even when the project holds a hundred captures', () => {  const dir = project(120);
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

test('greenfield composition records debt for captures without visual reference evidence', () => {
  const dir = project();
  const input = JSON.parse(read('test/fixtures/adaptive-flow/medical-new-product.json'));
  const invocation = publishTestAdaptiveRoute(dir, input);
  mkdirSync(join(dir, '.omd', 'captures'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'captures', 'home.png'), 'capture only\n');
  const brief = buildBrief(dir, 'composition', undefined, invocation);
  // Phase 1: missing research is debt, not permission to fabricate reference evidence.
  assert.ok(brief.confidenceDebt.some(item => item.reason.includes('visual reference evidence')));
  assert.equal(brief.blockers.some(blocker => blocker.includes('visual reference evidence')), false);
});

// A capture with a measured principle is usable evidence; one without it is a file path.
test('selected content grain reaches downstream briefs and stale bytes become explicit debt', () => {
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
  // A stale evidence projection is withheld; it no longer prevents first implementation.
  assert.ok(stale.confidenceDebt.some(item => item.reason.includes('STALE_CONTENT_GRAIN_SOURCE')));
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
  // Candidate evidence stays selected but may yield to first render.
  assert.ok(missing.confidenceDebt.some(item => item.stage === 'candidate-generation'));
  assert.ok(missing.blockers.some((blocker) =>
    blocker === 'selected production input missing: .omd/.cache/copy-eye.md'
  ));

  const selectedInputs = [
    '.omd/domain-brief.json',
    '.omd/frame.md',
    '.omd/content-grain.json',
    '.omd/scout.md',
    '.omd/reference-board.json',
    '.omd/reference-pre-selection-v2.json',
    '.omd/copy-deck.md',
    '.omd/composition.md',
  ];
  for (const path of selectedInputs) writeFileSync(join(dir, path), path.endsWith('.json') ? '{}\n' : `${path}\n`);
  writeFileSync(join(dir, '.omd', 'refs', 'selected.json'), '{"source":"https://example.com/selected","principles":["Measured hierarchy"]}\n');
  mkdirSync(join(dir, '.omd', '.cache'), { recursive: true });
  writeFileSync(join(dir, '.omd', '.cache', 'copy-eye.md'), 'copy review\n');
  const selectedCandidate = join(dir, '.omd', '.cache', 'sketches', 'test-selected');
  mkdirSync(selectedCandidate, { recursive: true });
  for (const name of ['index.html', 'noun-swap-test.json', 'selection.json', 'ux-models.json']) {
    writeFileSync(join(selectedCandidate, name), `${name}\n`);
  }
  writeFileSync(join(dir, '.omd/.cache/sketches/current.json'), JSON.stringify({
    schema: 'candidate-selection-pointer-v1', directory: 'test-selected',
    indexSha256: createHash('sha256').update(readFileSync(join(selectedCandidate, 'index.html'))).digest('hex'),
    selectionSha256: createHash('sha256').update(readFileSync(join(selectedCandidate, 'selection.json'))).digest('hex'),
  }));

  writeFileSync(join(dir, '.omd', 'design-judgment.json'), JSON.stringify({
    schema: 'design-judgment-v1', referenceBoardSha256: 'a'.repeat(64),
    hypothesis: {
      schema: 'design-judgment-v1', feelsLike: 'a focused work surface, not a generic dashboard',
      dominantObject: 'the selected work object', subordinate: ['navigation'],
      densityIntent: 'enough detail to compare the work objects without losing the task',
      trustSource: 'explicit state and next actions', twoSecondRead: 'understand the work and next action',
    },
    judgments: [{ id: 'fixture', observation: 'a scoped reference shows a work object and its action', whyItWorksThere: 'the task requires comparison before action', relevance: 'high', adopt: ['comparison'], reject: ['ornamental chrome'], interpretation: 'make the work object the first viewport anchor', scope: 'surface' }],
  }));

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
    '.omd/domain-brief.json',
    '.omd/frame.md',
    '.omd/content-grain.json',
    '.omd/scout.md',
    '.omd/reference-board.json',
    '.omd/reference-pre-selection-v2.json',
    '.omd/copy-deck.md',
    '.omd/composition.md',
  ];
  for (const path of selectedInputs) writeFileSync(join(dir, path), path.endsWith('.json') ? '{}\n' : `${path}\n`);
  writeFileSync(join(dir, '.omd', 'refs', 'selected.json'), '{"source":"https://example.com/selected","principles":["Measured hierarchy"]}\n');

  writeFileSync(join(dir, '.omd', 'design-judgment.json'), JSON.stringify({
    schema: 'design-judgment-v1', referenceBoardSha256: 'a'.repeat(64),
    hypothesis: {
      schema: 'design-judgment-v1', feelsLike: 'a focused work surface, not a generic dashboard',
      dominantObject: 'the selected work object', subordinate: ['navigation'],
      densityIntent: 'enough detail to compare the work objects without losing the task',
      trustSource: 'explicit state and next actions', twoSecondRead: 'understand the work and next action',
    },
    judgments: [{ id: 'fixture', observation: 'a scoped reference shows a work object and its action', whyItWorksThere: 'the task requires comparison before action', relevance: 'high', adopt: ['comparison'], reject: ['ornamental chrome'], interpretation: 'make the work object the first viewport anchor', scope: 'surface' }],
  }));

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
    '.omd/domain-brief.json',
    '.omd/frame.md',
    '.omd/content-grain.json',
    '.omd/scout.md',
    '.omd/reference-board.json',
    '.omd/copy-deck.md',
    '.omd/composition.md',
  ]) writeFileSync(join(dir, path), path.endsWith('.json') ? '{}\n' : `${path}\n`);

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

/* Coordinator prompt size is intentionally unbounded; contracts belong in core gates and targeted tests. */

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

test('current provenance families are classified instead of being offered for cleanup', () => {
  for (const path of ['final-review/executions/sha256-test.json', 'route-source.json', 'workflow-plan.json', 'learning/rules-index.json']) {
    assert.equal(classifyArtifact(path)?.cls, 'state', path);
  }
});

test('declared probe plans stay in the design record while probe output is disposable', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd', 'probes'));
  mkdirSync(join(dir, '.omd', '.cache', 'probes'), { recursive: true });
  writeFileSync(join(dir, '.omd', 'probes', 'primary.json'), '{}');
  writeFileSync(join(dir, '.omd', '.cache', 'probes', 'primary.json'), '{}');
  const scan = scanProject(dir);
  assert.equal(scan.byClass.human.files, 1);
  assert.deepEqual(scan.cleanable.map(entry => entry.path), ['.cache/probes/primary.json']);
});

test('legacy persisted briefs are retired scratch, not design records', () => {
  const dir = project();
  mkdirSync(join(dir, '.omd', 'briefs'));
  writeFileSync(join(dir, '.omd', 'briefs', 'domain.json'), '{}');
  writeFileSync(join(dir, '.omd', 'briefs', 'domain.md'), '# duplicate');
  const scan = scanProject(dir);
  assert.deepEqual(scan.retired.map(entry => entry.path).sort(), ['briefs/domain.json', 'briefs/domain.md']);
  assert.equal(scan.unclassified.length, 0);
});

test('stage briefs stay inspectable without persisting duplicate JSON or markdown', () => {
  const dir = project();
  const cli = join(root, 'bin', 'omd.mjs');
  for (const args of [['brief', 'composition', '--json'], ['brief', 'domain'], ['brief', 'composition', '--json']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    if (args.includes('--json')) assert.equal(JSON.parse(result.stdout).stage, 'composition');
    else assert.match(result.stdout, /domain/);
    assert.equal(existsSync(join(dir, '.omd', 'briefs')), false);
  }
});
