import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { MAX_SURFACES } from '../core/domain/domain-brief.ts';
import {
  checkReferenceApplication, parseReferenceApplication, projectReferenceApplication,
  publishReferenceApplication, referenceApplicationPlan, REFERENCE_APPLICATION_SCHEMA,
  REFERENCE_APPLICATION_PATH, REFERENCE_APPLICATION_DOC_PATH, REFERENCE_APPLICATION_PROJECTION_PATH,
} from '../core/ref/reference-application.ts';
import { publishReferenceResearch } from '../core/ref/reference-research.ts';
import { ADMISSION_SOURCE_SHA, designAdmissionFixture } from './helpers/design-admission.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false };
const publicationPaths = [REFERENCE_APPLICATION_PATH, REFERENCE_APPLICATION_DOC_PATH, REFERENCE_APPLICATION_PROJECTION_PATH];

function applicationInput(count: number) {
  const decision = { coverage: 'direct', gap: null, application: 'Keep the current task visible.',
    doNotTransfer: 'Do not copy source branding.', reason: 'The task needs a clear visual hierarchy.' };
  return {
    schema: REFERENCE_APPLICATION_SCHEMA, sourceContractSha256: ADMISSION_SOURCE_SHA,
    researchSha256: 'b'.repeat(64), domainBriefSha256: 'c'.repeat(64),
    screens: Array.from({ length: count }, (_, index) => ({
      surface: `surface-${index + 1}`, target: { route: `/surface-${index + 1}`, state: 'initial' },
      domain: { ...decision, referenceIds: ['domain-1'] }, design: { ...decision, referenceIds: ['visual'] },
      checks: [`The task for surface ${index + 1} remains visible.`],
    })),
  };
}

test('seventeen independent surface decisions survive parsing and source-free projection', () => {
  // Given a request whose seventeen screens have distinct destination bindings.
  const input = applicationInput(17);

  // When the application crosses the parser and downstream projection boundary.
  const projection = projectReferenceApplication(parseReferenceApplication(input));

  // Then every screen retains its own destination and verification criteria.
  assert.deepEqual(projection.screens.map(({ surface, target, checks }) => ({ surface, target, checks })),
    input.screens.map(({ surface, target, checks }) => ({ surface, target, checks })));
});

test('reference application accepts the complete shared domain surface capacity', () => {
  // Given distinct screens at the domain contract boundary.
  const input = applicationInput(MAX_SURFACES);

  // When the reference application parses the same surface population.
  const application = parseReferenceApplication(input);

  // Then the capacity boundary does not discard or reject a domain surface.
  assert.equal(application.screens.length, MAX_SURFACES);
});

const duplicateSurface = applicationInput(17);
duplicateSurface.screens = duplicateSurface.screens.map((screen, index) => ({
  ...screen, surface: index === 16 ? 'surface-1' : screen.surface,
}));
const duplicateTarget = applicationInput(17);
duplicateTarget.screens = duplicateTarget.screens.map((screen, index) => ({
  ...screen, target: index === 16 ? { route: '/surface-1', state: 'initial' } : screen.target,
}));
const sparseScreens = applicationInput(17);
delete sparseScreens.screens[8];

for (const scenario of [
  { name: 'over-capacity screens', input: applicationInput(MAX_SURFACES + 1), error: /surface decisions/ },
  { name: 'duplicate surface names', input: duplicateSurface, error: /duplicate surface/ },
  { name: 'duplicate destination bindings', input: duplicateTarget, error: /distinct route\/state targets/ },
  { name: 'empty screens', input: applicationInput(0), error: /surface decisions/ },
  { name: 'sparse screens', input: sparseScreens, error: /surface decisions/ },
]) {
  test(`publisher refuses ${scenario.name} without replacing existing publication`, t => {
    // Given a previous publication and a malformed replacement.
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-reference-capacity-refusal-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const writer = createTestProjectWriteAdapter(root);
    for (const path of publicationPaths) writer.write(path, `previous publication: ${path}`);
    const before = publicationPaths.map(path => readFileSync(join(root, path)));

    // When publication is attempted, the malformed screen contract is refused.
    assert.throws(() => publishReferenceApplication(root, scenario.input, options, writer), scenario.error);

    // Then none of the existing publication artifacts were overwritten.
    assert.deepEqual(publicationPaths.map(path => readFileSync(join(root, path))), before);
  });
}

test('seventeen current domain surfaces publish and pass the application check independently', t => {
  // Given current research and a domain brief with seventeen independent surfaces.
  const fixture = designAdmissionFixture(t);
  const input = applicationInput(17);
  const evidence = [{ status: 'user-provided', reference: 'test-request' }];
  publishReferenceResearch(fixture.root, fixture.research, options, fixture.writer);
  fixture.writer.write('.omd/domain-brief.json', JSON.stringify({
    schema: 'domain-brief-v1', request: 'Build a seventeen-screen welfare service', domain: 'welfare',
    summary: 'Welfare application preparation and follow-up',
    surfaces: input.screens.map(({ surface }) => ({ name: surface, purpose: `Complete the ${surface} task`, evidence })),
    coreObjects: [{ name: 'application', evidence }], audience: { description: 'welfare applicants', evidence },
    referenceQueries: { component: ['application workspace'], craft: ['status feedback'], mood: ['readable workspace'] },
    planning: { businessGoal: { text: 'Reduce application effort' }, successSignal: { text: 'Resume prepared work' },
      nonGoals: [{ text: 'No official submissions in this fixture' }] },
  }));
  const draft = referenceApplicationPlan(fixture.root, options).input;

  // When the complete plan is published through the guarded writer.
  publishReferenceApplication(fixture.root, { ...draft, screens: input.screens }, options, fixture.writer);

  // Then the persisted application and source-free check preserve every destination.
  const checked = checkReferenceApplication(fixture.root, options);
  assert.deepEqual(checked.screens.map(({ surface, target }) => ({ surface, target })),
    input.screens.map(({ surface, target }) => ({ surface, target })));
});
