import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { withBrowser } from '../core/render/index.ts';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { parseReferenceResearch, publishReferenceResearch, readPublishedReferenceResearch,
  validateReferenceResearch } from '../core/ref/reference-research.ts';
import { ADMISSION_SOURCE_SHA, admissionHash, designAdmissionFixture } from './helpers/design-admission.ts';
import { discoveryBrowser, directoryHtml } from './helpers/discovery-capture.ts';
import { directResearch } from './helpers/direct-research.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';

const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false };

test('native direct roots publish both lanes without any executed search and retain qualified original links', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const research = await directResearch(browser, fixture);
    publishReferenceResearch(fixture.root, research, options, fixture.writer);
    assert.deepEqual(readPublishedReferenceResearch(fixture.root), research);
    assert.equal(readPublishedReferenceResearch(fixture.root).designReference.sources[0]?.url, fixture.source.source);
  });
});

test('strict intermediate captures extend a reached direct root but missing hops and cycles cannot', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const hopUrl = 'https://intermediate.example/tasks';
    const research = await directResearch(browser, fixture, hopUrl);
    const observed = discoveryBrowser(browser, { url: hopUrl, html: directoryHtml(fixture.domain.source) });
    const hop = await captureReferenceNavigation(observed.browser, hopUrl, 'domain', fixture.writer);
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(research), options), /not an observed/);
    const reached = { ...research, domainReference: { ...research.domainReference, navigation: [hop] } };
    assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parseReferenceResearch(reached), options));
    const otherUrl = 'https://disconnected.example/tasks';
    const other = discoveryBrowser(browser, { url: otherUrl, html: directoryHtml(otherUrl) });
    const cycle = await captureReferenceNavigation(other.browser, otherUrl, 'domain', fixture.writer);
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch({ ...research,
      domainReference: { ...research.domainReference, navigation: [cycle] } }), options), /not an observed/);
  });
});

test('direct root URL and public-list redirect parameters never seed retained destinations', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const redirect = `https://directory.example/link?url=${encodeURIComponent(fixture.domain.source)}`;
    const research = await directResearch(browser, fixture, redirect);
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(research), options), /not an observed/);
    const self = discoveryBrowser(browser, { url: fixture.domain.source,
      html: `${directoryHtml('https://other.example/task')}<a href="${fixture.domain.source}">This directory</a>` });
    const receipt = await captureReferenceNavigation(self.browser, fixture.domain.source, 'domain', fixture.writer, 'public-directory');
    const rootedSource = { ...research, domainReference: { ...research.domainReference,
      discoveryRoots: [{ ...receipt, reason: 'Inspect the listed task.' }] } };
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(rootedSource), options), /not an observed/);
  });
});

test('failed searches coexist with native roots but every declared query still needs its actual receipt', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const research = await directResearch(browser, fixture);
    const query = 'public task directory';
    const mixed = { ...research, domainReference: { ...research.domainReference, queries: [query],
      searches: [testSearchReceipt(fixture.root, 'domain', query, [], true)] } };
    assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parseReferenceResearch(mixed), options));
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch({ ...mixed,
      domainReference: { ...mixed.domainReference, queries: ['invented query'] } }), options), /declared queries/);
  });
});

test('retained component edges cannot substitute for strict intermediate navigation in direct mode', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const intermediate = fixture.capture('https://directory.example/retained-hop', 'hop', 'domain', 4, [fixture.domain.source]);
    const research = await directResearch(browser, fixture, intermediate.source);
    const source = { ...fixture.research.domainReference.sources[0], id: 'hop', url: intermediate.source,
      evidence: intermediate.evidence, capture: intermediate.capture };
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch({ ...research,
      domainReference: { ...research.domainReference, sources: [source, ...research.domainReference.sources] } }), options), /not an observed/);
  });
});

test('changed direct root capture invalidates research before publication writes', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const research = await directResearch(browser, fixture);
    publishReferenceResearch(fixture.root, research, options, fixture.writer);
    const before = readFileSync(join(fixture.root, '.omd/reference-research.json'));
    const root = research.domainReference.discoveryRoots[0];
    assert.ok(root);
    const path = join(fixture.root, root.capture.path);
    writeFileSync(path, `${readFileSync(path, 'utf8')}\n`);
    assert.throws(() => publishReferenceResearch(fixture.root, research, options, fixture.writer), /changed|STALE/);
    assert.deepEqual(readFileSync(join(fixture.root, '.omd/reference-research.json')), before);
  });
});

test('direct reachability refuses a legacy navigation record even at a current content-addressed path', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const hopUrl = 'https://intermediate.example/tasks';
    const research = await directResearch(browser, fixture, hopUrl);
    const observed = discoveryBrowser(browser, { url: hopUrl, html: directoryHtml(fixture.domain.source) });
    const hop = await captureReferenceNavigation(observed.browser, hopUrl, 'domain', fixture.writer);
    const record = JSON.parse(readFileSync(join(fixture.root, hop.capture.path), 'utf8'));
    const { limitations: _limitations, ...legacy } = record;
    const bytes = JSON.stringify({ ...legacy, schema: 'reference-navigation-capture-v1' });
    const sha256 = admissionHash(bytes);
    const path = `.omd/discovery/domain/navigation/${sha256}.json`;
    fixture.writer.write(path, bytes);
    const input = { ...research, domainReference: { ...research.domainReference, navigation: [{ ...hop, capture: { path, sha256 } }] } };
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(input), options), /REFERENCE_DISCOVERY/);
  });
});

test('successful search links and direct roots jointly cover distinct retained sources', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const research = await directResearch(browser, fixture);
    const second = fixture.capture('https://second.example/task', 'second', 'domain', 5);
    const query = 'second task';
    const input = { ...research, domainReference: { ...research.domainReference, queries: [query],
      searches: [testSearchReceipt(fixture.root, 'domain', query, [second.source])],
      sources: [...research.domainReference.sources, { ...research.domainReference.sources[0], id: 'second', url: second.source,
        evidence: second.evidence, capture: second.capture }] } };
    assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parseReferenceResearch(input), options));
  });
});

test('native direct-root final hosts cannot overlap the other research lane', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const research = await directResearch(browser, fixture);
    const url = 'https://directory.example/tasks';
    const observed = discoveryBrowser(browser, { url, finalUrl: 'https://www.pinterest.com/', html: directoryHtml(fixture.domain.source) });
    const receipt = await captureReferenceNavigation(observed.browser, url, 'domain', fixture.writer, 'public-directory');
    const input = { ...research, domainReference: { ...research.domainReference,
      discoveryRoots: [{ ...receipt, reason: 'Inspect the listed task.' }] } };
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(input), options), /LANE_REDIRECT_OVERLAP/);
  });
});

test('a declared domain root cannot overlap a redirected design source final host', async t => {
  const fixture = designAdmissionFixture(t);
  await withBrowser(async browser => {
    const research = await directResearch(browser, fixture);
    const url = 'https://directory.example/tasks';
    const observed = discoveryBrowser(browser, { url, finalUrl: 'https://redirected-directory.example/tasks', html: directoryHtml(fixture.domain.source) });
    const receipt = await captureReferenceNavigation(observed.browser, url, 'domain', fixture.writer, 'public-directory');
    const path = join(fixture.root, fixture.source.capture.path);
    const source = JSON.parse(readFileSync(path, 'utf8'));
    const bytes = JSON.stringify({ ...source, acquisition: { ...source.acquisition, finalUrl: 'https://directory.example/design' } });
    writeFileSync(path, bytes);
    const input = { ...research,
      domainReference: { ...research.domainReference, discoveryRoots: [{ ...receipt, reason: 'Inspect the listed task.' }] },
      designReference: { ...research.designReference, sources: research.designReference.sources.map(source => ({ ...source,
        capture: { ...source.capture, sha256: admissionHash(bytes) } })) } };
    assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(input), options), /LANE_REDIRECT_OVERLAP/);
  });
});
