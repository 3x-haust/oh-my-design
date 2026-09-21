import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseReferenceResearch, publishReferenceResearch, readPublishedReferenceResearch,
  referenceResearchArtifacts, validateReferenceResearch, REFERENCE_RESEARCH_SCHEMA } from '../core/ref/reference-research.ts';
import { ADMISSION_SOURCE_SHA, admissionHash, designAdmissionFixture } from './helpers/design-admission.ts';
import { testSearchReceipt } from './helpers/search-execution.ts';
import { validateMarketReferenceCoverage } from '../core/ref/market-reference-coverage.ts';

const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false,
  expectedRequest: 'Study Korean public benefits' };
function searchReceiptAt(root: string, lane: 'domain' | 'design', receipt: { path: string }, observedAt: string) {
  const record = JSON.parse(readFileSync(join(root, receipt.path), 'utf8'));
  record.observedAt = observedAt;
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const sha256 = admissionHash(bytes);
  const path = `.omd/refs/${lane}/search-${sha256}.json`;
  writeFileSync(join(root, path), bytes);
  return { path, sha256 };
}
const localSource = (sourceId: string, evidenceSha256: string, reason: string) => ({ sourceId, evidenceSha256, reason });
const domainBrief = {
  schema: 'domain-brief-v1', request: 'Study Korean public benefits', domain: 'public benefits',
  summary: 'Compare public benefits',
  surfaces: [{ name: 'home', purpose: 'Find a benefit', evidence: [{ status: 'user-provided', reference: 'test' }] }],
  coreObjects: [{ name: 'benefit', evidence: [{ status: 'user-provided', reference: 'test' }] }],
  audience: { description: 'Korean residents', evidence: [{ status: 'user-provided', reference: 'test' }] },
  referenceQueries: { component: ['benefit card'], craft: ['eligibility feedback'], mood: ['visual task'] },
  planning: { businessGoal: { text: 'Find benefits' }, successSignal: { text: 'Open a relevant benefit' },
    nonGoals: [{ text: 'Do not submit official applications' }] },
};
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

test('explicit-market v7 refuses global-only research without mutation and accepts documented fallback', t => {
  const fixture = designAdmissionFixture(t);
  publishReferenceResearch(fixture.root, fixture.research, options, fixture.writer);
  const published = Object.keys(referenceResearchArtifacts(parseReferenceResearch(fixture.research))).map(path => join(fixture.root, path));
  const before = published.map(path => readFileSync(path));
  writeFileSync(join(fixture.root, '.omd/locale-design-context.json'), JSON.stringify({
    schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ko-KR',
    marketRegion: 'KR', audience: '한국에서 공공 혜택을 비교하는 주민', domain: 'public benefits',
    surface: 'product', desiredFit: 'market-grounded', brandInvariants: ['Eligibility facts remain source-bound'],
  }));
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify(domainBrief));
  const domainQueries = ['대한민국 public benefits', 'South Korea public benefits service'];
  const designQueries = ['대한민국 public benefits visual task', 'South Korea public benefits visual task'];
  const input = {
    ...fixture.research, schema: REFERENCE_RESEARCH_SCHEMA, marketCoverage: null,
    domainReference: { ...fixture.research.domainReference, queries: domainQueries,
      searches: domainQueries.map(query => testSearchReceipt(fixture.root, 'domain', query,
        [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source])) },
    designReference: { ...fixture.research.designReference, queries: designQueries,
      searches: designQueries.map(query => testSearchReceipt(fixture.root, 'design', query, [fixture.gallery.source])) },
  };
  assert.throws(() => publishReferenceResearch(fixture.root, input, options, fixture.writer), /MARKET_COVERAGE_REQUIRED/);
  assert.deepEqual(published.map(path => readFileSync(path)), before, 'refusal must not replace prior published research');
  const globalOnly = { marketRegion: 'KR',
    domain: { localSources: [], globalFallback: { sourceIds: ['domain-1', 'domain-2', 'domain-3'], gap: 'No other local operators were public.' } },
    design: { localSources: [localSource('visual', fixture.source.evidence.sha256, 'The gallery item documents a Korean product interface.')], globalFallback: null } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: globalOnly }), /MARKET_DOMAIN_LOCAL/);
  const documented = { marketRegion: 'KR',
    domain: { localSources: [localSource('domain-1', fixture.domain.evidence.sha256, 'The captured service exposes the named benefits task to residents in Korea.')], globalFallback: { sourceIds: ['domain-2', 'domain-3'], gap: 'Only one independently operated local service exposed the complete task state publicly.' } },
    design: { localSources: [localSource('visual', fixture.source.evidence.sha256, 'The inspected gallery item shows Korean product hierarchy and type at the target viewport.')], globalFallback: null } };
  const parsed = parseReferenceResearch({ ...input, marketCoverage: documented });
  assert.doesNotThrow(() => validateReferenceResearch(fixture.root, parsed, options));
  const globalQuery = 'global public benefits examples';
  const globalReceipt = searchReceiptAt(fixture.root, 'domain', testSearchReceipt(
    fixture.root, 'domain', globalQuery, [fixture.domain.source],
  ), '2026-09-20T00:00:00.000Z');
  const wrongOrder = { ...input, marketCoverage: documented, domainReference: { ...input.domainReference,
    queries: [...domainQueries, globalQuery], searches: [...input.domainReference.searches, globalReceipt] } };
  assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(wrongOrder), options), /SEARCH_ORDER/);
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify({ ...domainBrief, request: 'Another task' }));
  assert.throws(() => validateReferenceResearch(fixture.root, parsed, options), /MARKET_DESIGN_PLAN_STALE/);
});

test('market coverage refuses unqualified search order and fallback without a gap', t => {
  const fixture = designAdmissionFixture(t);
  writeFileSync(join(fixture.root, '.omd/locale-design-context.json'), JSON.stringify({
    schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ko-KR',
    marketRegion: 'KR', audience: '한국 사용자', domain: 'public benefits', surface: 'product',
    desiredFit: 'market-grounded', brandInvariants: ['Facts remain source-bound'],
  }));
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify(domainBrief));
  const coverage = { marketRegion: 'KR',
    domain: { localSources: fixture.research.domainReference.sources.map(source => localSource(
      source.id, source.evidence.sha256, `${source.id} serves the captured Korean benefits task.`,
    )), globalFallback: null },
    design: { localSources: [localSource('visual', fixture.source.evidence.sha256, 'The inspected item shows a Korean product interface.')], globalFallback: null } };
  const input = { ...fixture.research, schema: REFERENCE_RESEARCH_SCHEMA, marketCoverage: coverage };
  assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(input), options), /MARKET_DOMAIN_SEARCH_REQUIRED/);
  const exactDomainQueries = ['대한민국 public benefits', 'South Korea public benefits service'];
  const exactDomain = { ...input, domainReference: { ...input.domainReference,
    queries: exactDomainQueries, searches: exactDomainQueries.map(query => testSearchReceipt(
      fixture.root, 'domain', query, [fixture.domain.source, fixture.domainTwo.source, fixture.domainThree.source],
    )) } };
  const arbitraryDesign = { ...exactDomain, designReference: { ...exactDomain.designReference,
    queries: ['대한민국 public benefits arbitrary suffix', 'South Korea public benefits arbitrary suffix'] } };
  assert.throws(() => validateReferenceResearch(fixture.root, parseReferenceResearch(arbitraryDesign), options), /MARKET_DESIGN_SEARCH_REQUIRED/);
  const emptyGap = { ...coverage, domain: {
    localSources: coverage.domain.localSources.slice(0, 2), globalFallback: { sourceIds: ['domain-3'], gap: ' ' },
  } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: emptyGap }), /FALLBACK_GAP/);
  const emptyLocalReason = structuredClone(coverage);
  const firstLocalSource = emptyLocalReason.domain.localSources[0];
  assert.ok(firstLocalSource);
  firstLocalSource.reason = ' ';
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: emptyLocalReason }), /LOCAL_REASON/);
  const wrongLocalEvidence = structuredClone(coverage);
  const wrongEvidenceSource = wrongLocalEvidence.domain.localSources[0];
  assert.ok(wrongEvidenceSource);
  wrongEvidenceSource.evidenceSha256 = '0'.repeat(64);
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: wrongLocalEvidence }), /LOCAL_EVIDENCE/);
  const malformedLocalReason = structuredClone(coverage);
  const malformedReasonSource = malformedLocalReason.domain.localSources[0];
  assert.ok(malformedReasonSource);
  malformedReasonSource.reason = `The captured market signal is malformed \ud800`;
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: malformedLocalReason }), /LOCAL_REASON/);
  const invisibleGap = { ...coverage, domain: {
    localSources: coverage.domain.localSources.slice(0, 2),
    globalFallback: { sourceIds: ['domain-3'], gap: '\u200b' },
  } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: invisibleGap }), /FALLBACK_GAP/);
  const oversizedGap = { ...invisibleGap, domain: { ...invisibleGap.domain,
    globalFallback: { sourceIds: ['domain-3'], gap: 'x'.repeat(4097) } } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: oversizedGap }), /FALLBACK_GAP/);
  const malformedGap = { ...invisibleGap, domain: { ...invisibleGap.domain,
    globalFallback: { sourceIds: ['domain-3'], gap: `No additional public local operator was found \ud800` } } };
  assert.throws(() => parseReferenceResearch({ ...input, marketCoverage: malformedGap }), /FALLBACK_GAP/);
  const direct = { ...input,
    domainReference: { ...input.domainReference, queries: [], searches: [], discoveryRoots: [{ ...rootEnvelope('domain'), reason: 'NOT serving KR; global directory only.' }] },
    designReference: { ...input.designReference, queries: [], searches: [], discoveryRoots: [rootEnvelope('design')] },
  };
  assert.throws(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch(direct), options.expectedRequest), /MARKET_DOMAIN_DIRECT_ROOT_REQUIRED/);
  const scopedDirect = { ...direct,
    domainReference: { ...direct.domainReference, discoveryRoots: [{ ...rootEnvelope('domain'), reason: '대한민국 public benefits directory.' }] },
    designReference: { ...direct.designReference, discoveryRoots: [{ ...rootEnvelope('design'), reason: '대한민국 public benefits gallery list.' }] },
  };
  assert.doesNotThrow(() => validateMarketReferenceCoverage(fixture.root, parseReferenceResearch(scopedDirect), options.expectedRequest));
  for (const reason of [
    'This service is unavailable in South Korea for public benefits.',
    '대한민국에서는 이용 불가하지만 글로벌 공공 혜택 디렉터리입니다.',
    'The AKRZ public directory serves benefits users.',
    'Evidence memo captured KR during inspection.',
  ]) {
    const adversarial = { ...scopedDirect, domainReference: { ...scopedDirect.domainReference,
      discoveryRoots: [{ ...rootEnvelope('domain'), reason }] } };
    assert.throws(() => validateMarketReferenceCoverage(
      fixture.root, parseReferenceResearch(adversarial), options.expectedRequest,
    ), /MARKET_DOMAIN_DIRECT_ROOT_REQUIRED/);
  }
  for (const reason of [`${'x'.repeat(4097)} KR service`, `The KR public directory has malformed evidence \ud800`]) {
    const adversarial = { ...scopedDirect, domainReference: { ...scopedDirect.domainReference,
      discoveryRoots: [{ ...rootEnvelope('domain'), reason }] } };
    assert.throws(() => parseReferenceResearch(adversarial), /DISCOVERY_ROOT_REASON/);
  }
  writeFileSync(join(fixture.root, '.omd/domain-brief.json'), JSON.stringify({ ...domainBrief, request: 'Another task' }));
  assert.throws(() => validateMarketReferenceCoverage(
    fixture.root, parseReferenceResearch(scopedDirect), options.expectedRequest,
  ), /MARKET_DESIGN_PLAN_STALE/);
  unlinkSync(join(fixture.root, '.omd/domain-brief.json'));
  assert.throws(() => validateMarketReferenceCoverage(
    fixture.root, parseReferenceResearch(scopedDirect), options.expectedRequest,
  ), /MARKET_DESIGN_PLAN_REQUIRED/);
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

test('every explicit market requires local reference coverage regardless of fit mode or missing audience', t => {
  const fixture = designAdmissionFixture(t);
  const contexts = [
    { desiredFit: 'locale-mechanics-only', audience: null },
    { desiredFit: 'market-grounded', audience: null },
  ];
  for (const context of contexts) {
    writeFileSync(join(fixture.root, '.omd/locale-design-context.json'), JSON.stringify({
      schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ko-KR',
      marketRegion: 'KR', domain: 'public benefits', surface: 'product',
      brandInvariants: ['Facts remain source-bound'], ...context,
    }));
    assert.throws(() => validateReferenceResearch(
      fixture.root, parseReferenceResearch(fixture.research), options,
    ), /MARKET_COVERAGE_REQUIRED/);
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
  for (const schema of ['reference-navigation-capture-v2', 'reference-discovery-entry-v1']) {
    const bytes = JSON.stringify({ ...captured, schema });
    writeFileSync(path, bytes);
    const input = { ...fixture.research, domainReference: { ...fixture.research.domainReference,
      sources: fixture.research.domainReference.sources.map(source => ({ ...source, capture: { ...source.capture, sha256: admissionHash(bytes) } })) } };
    assert.throws(() => publishReferenceResearch(fixture.root, input, options, fixture.writer), /CAPTURE_PURPOSE/);
    assert.deepEqual(paths.map(path => readFileSync(path)), before);
  }
});
