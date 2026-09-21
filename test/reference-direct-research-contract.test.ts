import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseReferenceResearch, publishReferenceResearch, readPublishedReferenceResearch,
  referenceResearchArtifacts } from '../core/ref/reference-research.ts';
import { ADMISSION_SOURCE_SHA, admissionHash, designAdmissionFixture } from './helpers/design-admission.ts';

const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false,
  expectedRequest: 'Study Korean public benefits' };
// Parser-only envelope; this does not claim that capture files exist or prove publication.
function rootEnvelope(lane: 'domain' | 'design') {
  const digest = (lane === 'domain' ? 'c' : 'd').repeat(64);
  return { method: 'direct-public', entry: lane === 'domain' ? 'public-directory' : 'free-gallery',
    url: lane === 'domain' ? 'https://directory.example/tasks' : 'https://www.siteinspire.com/',
    reason: 'The public list exposes comparable task entries.',
    evidence: { path: `.omd/discovery/${lane}/entries/${digest}.png`, sha256: digest },
    capture: { path: `.omd/discovery/${lane}/entries/${digest}.json`, sha256: digest } };
}

test('v5 publication preserves its version and absent optional fields', t => {
  const { root, research, writer } = designAdmissionFixture(t);
  publishReferenceResearch(root, research, options, writer);
  assert.deepEqual(readPublishedReferenceResearch(root), research);
  assert.equal(JSON.parse(readFileSync(join(root, '.omd/reference-research.json'), 'utf8')).schema, 'reference-research-v5');
});

test('historical v5 keeps its original exact-host lane separation', t => {
  const { research } = designAdmissionFixture(t);
  const historical = { ...research,
    domainReference: { ...research.domainReference, sources: research.domainReference.sources.map((source, index) => ({ ...source,
      url: index === 0 ? 'https://benefits.gov.uk/task' : source.url })) },
    designReference: { ...research.designReference, sources: research.designReference.sources.map(source => ({ ...source,
      url: 'https://service.gov.uk/task' })) } };
  assert.doesNotThrow(() => parseReferenceResearch(historical));
});

test('v6 parses direct-only lanes and retains direct roots in each lane artifact', t => {
  const { research } = designAdmissionFixture(t);
  const input = { ...research, schema: 'reference-research-v6',
    domainReference: { ...research.domainReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('domain')] },
    designReference: { ...research.designReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('design')] } };
  const parsed = parseReferenceResearch(input);
  assert.deepEqual(parsed, input);
  const artifacts = referenceResearchArtifacts(parsed);
  assert.deepEqual(artifacts['.omd/refs/domain/research.json'].discoveryRoots, input.domainReference.discoveryRoots);
  assert.deepEqual(artifacts['.omd/refs/design/research.json'].discoveryRoots, input.designReference.discoveryRoots);
});

test('direct discovery root reasons are bounded and Unicode-well-formed before market validation', t => {
  const { research } = designAdmissionFixture(t);
  const direct = { ...research, schema: 'reference-research-v6',
    domainReference: { ...research.domainReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('domain')] },
    designReference: { ...research.designReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('design')] } };
  for (const reason of ['x'.repeat(4097), `Malformed direct root \ud800`]) {
    assert.throws(() => parseReferenceResearch({ ...direct, domainReference: { ...direct.domainReference,
      discoveryRoots: [{ ...rootEnvelope('domain'), reason }] } }), /DISCOVERY_ROOT_REASON/);
  }
});

test('v6 refuses fewer than three independent domain service families', t => {
  const { research } = designAdmissionFixture(t);
  const direct = { ...research, schema: 'reference-research-v6',
    domainReference: { ...research.domainReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('domain')] },
    designReference: { ...research.designReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('design')] } };
  assert.throws(() => parseReferenceResearch({ ...direct,
    domainReference: { ...direct.domainReference, sources: direct.domainReference.sources.slice(0, 2) } }), /DOMAIN_SOURCE_COVERAGE/);
  const oneFamily = direct.domainReference.sources.map((source, index) => ({ ...source,
    url: [`https://www.gov.uk/task-${index}`, `https://benefits.gov.uk/task-${index}`, `https://service.gov.uk/task-${index}`][index] }));
  assert.throws(() => parseReferenceResearch({ ...direct,
    domainReference: { ...direct.domainReference, sources: oneFamily } }), /DOMAIN_SOURCE_DIVERSITY/);
  assert.doesNotThrow(() => parseReferenceResearch(direct));
});

test('service-family comparison canonicalizes a DNS root trailing dot', t => {
  const { research } = designAdmissionFixture(t);
  const direct = { ...research, schema: 'reference-research-v6',
    domainReference: { ...research.domainReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('domain')] },
    designReference: { ...research.designReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('design')] } };
  const aliases = direct.domainReference.sources.map((source, index) => ({ ...source,
    url: index === 0 ? 'https://example.com./task' : `https://service-${index}.example.com/task` }));
  assert.throws(() => parseReferenceResearch({ ...direct,
    domainReference: { ...direct.domainReference, sources: aliases } }), /DOMAIN_SOURCE_DIVERSITY/);
});

test('common country-code registrable domains remain independent families', t => {
  const { research } = designAdmissionFixture(t);
  const direct = { ...research, schema: 'reference-research-v6',
    domainReference: { ...research.domainReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('domain')] },
    designReference: { ...research.designReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('design')] } };
  const independent = direct.domainReference.sources.map((source, index) => ({ ...source,
    url: `https://${['alpha', 'bravo', 'charlie'][index]}.com.mx/task` }));
  assert.doesNotThrow(() => parseReferenceResearch({ ...direct,
    domainReference: { ...direct.domainReference, sources: independent } }));
});

test('private public-suffix tenants remain independent service families', t => {
  const { research } = designAdmissionFixture(t);
  const direct = { ...research, schema: 'reference-research-v6',
    domainReference: { ...research.domainReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('domain')] },
    designReference: { ...research.designReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('design')] } };
  const independent = direct.domainReference.sources.map((source, index) => ({ ...source,
    url: `https://${['alpha', 'bravo', 'charlie'][index]}.github.io/task` }));
  assert.doesNotThrow(() => parseReferenceResearch({ ...direct,
    domainReference: { ...direct.domainReference, sources: independent } }));
});

test('v6 publication measures independent domain families after redirects', t => {
  const fixture = designAdmissionFixture(t);
  const finalUrl = 'https://www.gov.uk/benefits';
  for (const entry of [fixture.domain, fixture.domainTwo, fixture.domainThree]) {
    const capture = JSON.parse(readFileSync(entry.path, 'utf8')) as { acquisition: { finalUrl: string } };
    capture.acquisition.finalUrl = finalUrl;
    writeFileSync(entry.path, JSON.stringify(capture));
  }
  const redirected = { ...fixture.research, schema: 'reference-research-v6',
    domainReference: { ...fixture.research.domainReference,
      sources: fixture.research.domainReference.sources.map(source => ({ ...source, capture: fixture.receipt(join(fixture.root, source.capture.path)) })) },
    designReference: { ...fixture.research.designReference } };
  assert.throws(() => publishReferenceResearch(fixture.root, redirected, options, fixture.writer), /DOMAIN_SOURCE_DIVERSITY/);
});

test('v6 search-only lanes preserve omitted and explicitly empty direct roots', t => {
  const { research } = designAdmissionFixture(t);
  const input = { ...research, schema: 'reference-research-v6', designReference: { ...research.designReference, discoveryRoots: [] } };
  assert.deepEqual(parseReferenceResearch(input), input);
});

test('v5 refuses the new root field even when search receipts remain', t => {
  const { research } = designAdmissionFixture(t);
  assert.throws(() => parseReferenceResearch({ ...research,
    domainReference: { ...research.domainReference, discoveryRoots: [rootEnvelope('domain')] } }), /DOMAIN_KEYS/);
});

test('v6 refuses missing search arrays and empty discovery', t => {
  const { research } = designAdmissionFixture(t);
  for (const lane of [
    { ...research.domainReference, queries: [], searches: [] },
    { ...research.domainReference, queries: [], searches: [], discoveryRoots: [] },
    { ...research.domainReference, queries: undefined, searches: [], discoveryRoots: [rootEnvelope('domain')] },
    { ...research.domainReference, queries: [], searches: undefined, discoveryRoots: [rootEnvelope('domain')] },
  ]) assert.throws(() => parseReferenceResearch({ ...research, schema: 'reference-research-v6', domainReference: lane }), /SEARCH_EXECUTION_REQUIRED|DOMAIN_QUERY/);
});

test('v6 root declarations require exact keys, lane purpose, canonical URL, dense unique receipts', t => {
  const { research } = designAdmissionFixture(t);
  const entry = rootEnvelope('domain');
  const roots: unknown[] = [
    [{ ...entry, attested: true }], [{ ...entry, reason: ' ' }], [{ ...entry, entry: 'free-gallery' }],
    [{ ...entry, url: 'https://directory.example/tasks#fragment' }],
    [{ ...entry, evidence: rootEnvelope('design').evidence }], [entry, entry], [entry, , entry],
    [{ ...entry, capture: { ...entry.capture, extra: true } }],
  ];
  for (const discoveryRoots of roots) assert.throws(() => parseReferenceResearch({ ...research, schema: 'reference-research-v6',
    domainReference: { ...research.domainReference, discoveryRoots } }), /DISCOVERY_ROOT|EVIDENCE_KEYS/);
});

test('root declarations alone cannot publish research and refusal preserves current artifacts', t => {
  const { root, research, writer, boardPath } = designAdmissionFixture(t);
  publishReferenceResearch(root, research, options, writer);
  const paths = [boardPath, ...Object.keys(referenceResearchArtifacts(parseReferenceResearch(research))).map(path => join(root, path))];
  const before = paths.map(path => readFileSync(path));
  const input = { ...research, schema: 'reference-research-v6',
    domainReference: { ...research.domainReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('domain')] } };
  assert.throws(() => publishReferenceResearch(root, input, options, writer), /discovery.*could not be read stably/);
  assert.deepEqual(paths.map(path => readFileSync(path)), before);
});

test('direct root images cannot reuse evidence from the other lane', t => {
  const { research } = designAdmissionFixture(t);
  const root = rootEnvelope('design');
  const domainImage = research.domainReference.sources[0]?.evidence;
  assert.ok(domainImage);
  const reused = { ...root, evidence: { path: `.omd/discovery/design/entries/${domainImage.sha256}.png`, sha256: domainImage.sha256 } };
  assert.throws(() => parseReferenceResearch({ ...research, schema: 'reference-research-v6',
    designReference: { ...research.designReference, discoveryRoots: [reused] } }), /LANE_EVIDENCE_REUSED/);
});

test('direct root service identities remain independent across research lanes', t => {
  const { research } = designAdmissionFixture(t);
  const root = { ...rootEnvelope('domain'), url: 'https://www.pinterest.com/' };
  assert.throws(() => parseReferenceResearch({ ...research, schema: 'reference-research-v6',
    domainReference: { ...research.domainReference, discoveryRoots: [root] } }), /DOMAIN_AS_VISUAL_DIRECTION/);
});

test('new diagnostic schemas cannot be relabeled into retained research and refusal preserves publication', t => {
  const fixture = designAdmissionFixture(t);
  publishReferenceResearch(fixture.root, fixture.research, options, fixture.writer);
  const paths = [fixture.boardPath, ...Object.keys(referenceResearchArtifacts(parseReferenceResearch(fixture.research))).map(path => join(fixture.root, path))];
  const before = paths.map(path => readFileSync(path));
  const path = join(fixture.root, fixture.domain.capture.path);
  const captured = JSON.parse(readFileSync(path, 'utf8'));
  for (const schema of ['reference-navigation-capture-v2', 'reference-discovery-entry-v1', 'reference-discovery-entry-v2']) {
    const bytes = JSON.stringify({ ...captured, schema });
    writeFileSync(path, bytes);
    const input = { ...fixture.research, domainReference: { ...fixture.research.domainReference,
      sources: fixture.research.domainReference.sources.map(source => ({ ...source, capture: { ...source.capture, sha256: admissionHash(bytes) } })) } };
    assert.throws(() => publishReferenceResearch(fixture.root, input, options, fixture.writer), /CAPTURE_PURPOSE/);
    assert.deepEqual(paths.map(path => readFileSync(path)), before);
  }
});
