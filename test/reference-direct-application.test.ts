import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { withBrowser } from '../core/render/index.ts';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { publishReferenceResearch } from '../core/ref/reference-research.ts';
import { checkReferenceApplication, publishReferenceApplication, referenceApplicationPlan } from '../core/ref/reference-application.ts';
import { ADMISSION_SOURCE_SHA, designAdmissionFixture } from './helpers/design-admission.ts';
import { discoveryBrowser, directoryHtml } from './helpers/discovery-capture.ts';
import { directResearch } from './helpers/direct-research.ts';

const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false };
function applicationInput(root: string) {
  const evidence = [{ status: 'user-provided', reference: 'test-request' }];
  writeFileSync(join(root, '.omd/domain-brief.json'), JSON.stringify({ schema: 'domain-brief-v1', request: 'Study the service',
    domain: 'service', summary: 'Task preparation', surfaces: [{ name: 'home', purpose: 'Prepare the task', evidence }],
    coreObjects: [{ name: 'request', evidence }], audience: { description: 'applicants', evidence },
    referenceQueries: { component: ['task list'], craft: ['feedback'], mood: ['focused'] },
    planning: { businessGoal: { text: 'Reduce effort' }, successSignal: { text: 'Complete preparation' }, nonGoals: [{ text: 'No submissions' }] } }));
  const draft = referenceApplicationPlan(root, options).input;
  const decision = { coverage: 'direct', gap: null, application: 'Keep task requirements visible.',
    doNotTransfer: 'Do not reuse branding.', reason: 'The work object needs clear hierarchy.' };
  return { ...draft, screens: [{ surface: 'home', target: { route: '/', state: 'initial' },
    domain: { ...decision, referenceIds: ['domain'] }, design: { ...decision, referenceIds: ['visual'] }, checks: ['Task requirements remain visible.'] }] };
}

test('direct-entry identity and discovery paths cannot leak through application decision prose', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const research = await directResearch(browser, fixture);
    const url = 'https://directory.example/tasks';
    const finalUrl = 'https://redirected-directory.example/tasks';
    const observed = discoveryBrowser(browser, { url, finalUrl, html: directoryHtml(fixture.domain.source) });
    const receipt = await captureReferenceNavigation(observed.browser, url, 'domain', fixture.writer, 'public-directory');
    const input = { ...research, domainReference: { ...research.domainReference, discoveryRoots: [{ ...receipt, reason: 'Inspect listed tasks.' }] } };
    publishReferenceResearch(fixture.root, input, options, fixture.writer);
    const application = applicationInput(fixture.root);
    publishReferenceApplication(fixture.root, application, options, fixture.writer);
    const paths = ['.omd/reference-application.json', '.omd/reference-application.md', '.omd/reference-application-projection.json'];
    const before = paths.map(path => readFileSync(join(fixture.root, path)));
    for (const identity of ['.omd/discovery/domain/entries/file.png', 'directory.example', 'redirected-directory.example', 'DIRECTORY.EXAMPLE', 'pinterest.com']) {
      const screens = application.screens.map(screen => ({ ...screen, domain: { ...screen.domain, application: `Follow ${identity} for layout.` } }));
      assert.throws(() => publishReferenceApplication(fixture.root, { ...application, screens }, options, fixture.writer), /source|capture paths/);
    }
    assert.deepEqual(paths.map(path => readFileSync(join(fixture.root, path))), before);
    const projection = JSON.stringify(checkReferenceApplication(fixture.root, options));
    assert.doesNotMatch(projection, /discoveryRoots|direct-public|\.omd\/discovery|directory\.example|pinterest\.com/);
  });
});

test('a changed direct-entry PNG invalidates the dependent application', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const research = await directResearch(browser, fixture);
    publishReferenceResearch(fixture.root, research, options, fixture.writer);
    publishReferenceApplication(fixture.root, applicationInput(fixture.root), options, fixture.writer);
    const receipt = research.domainReference.discoveryRoots[0];
    assert.ok(receipt);
    writeFileSync(join(fixture.root, receipt.evidence.path), Buffer.from('changed capture'));
    assert.throws(() => checkReferenceApplication(fixture.root, options), /discovery evidence changed/);
  });
});
