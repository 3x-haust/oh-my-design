import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { validateFunctionalResearch } from '../core/ref/reference-research-functional.ts';
import { parseReferenceResearch } from '../core/ref/reference-research-parser.ts';
import { publishReferenceResearch, readPublishedReferenceResearch } from '../core/ref/reference-research.ts';
import { designAdmissionFixture, ADMISSION_SOURCE_SHA } from './helpers/design-admission.ts';
import { withBrowser } from '../core/render/index.ts';
import { discoveryBrowser, discoveryFixture } from './helpers/discovery-capture.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

test('three signed functional sources cite observed text, compare the request and record adoption', async t => {
  const root = discoveryFixture(t);
  const observations: Array<{ url: string; capture: { path: string; sha256: string } }> = [];
  await withBrowser(async browser => {
    for (const host of ['alpha.com', 'beta.im', 'gamma.info']) {
      const url = `https://${host}/benefits`;
      const observed = discoveryBrowser(browser, { url,
        html: '<meta charset="utf-8"><main><h1>복지 서비스 혜택 신청 대상 안내입니다</h1><p>지원 자격 확인하기</p><a href="https://other.example/benefits">신청 정보 확인</a></main>' });
      observations.push(await captureReferenceNavigation(observed.browser, url, 'domain', createTestProjectWriteAdapter(root), 'public-directory'));
    }
  });
  const sources = observations.map((receipt, index) => ({
    id: `service-${index}`, url: receipt.url,
    observations: [{ url: receipt.url, capture: receipt.capture }], marketObservationSha256: receipt.capture.sha256,
    features: [{ id: 'eligibility', observedLabel: '지원 자격 확인하기', finding: 'The service exposes an eligibility step.',
      evidence: [{ observationSha256: receipt.capture.sha256, field: 'taskText', quote: '지원 자격 확인하기', linkUrl: null as string | null }] }],
    similarities: [{ requestQuote: 'benefits', featureIds: ['eligibility'], assessment: 'Same task category.' }], differences: [],
    adopt: [{ featureIds: ['eligibility'], action: 'Expose eligibility first.', reason: 'Reduce dead ends.' }], avoid: [], limitations: [],
  }));
  const research = { schema: 'reference-research-v8', sourceContractSha256: '0'.repeat(64), marketCoverage: null,
    domainReference: { queries: [], searches: [], sources, benchmarkSha256: null },
    designReference: { queries: ['design'], searches: [{ path: `.omd/discovery/design/search-${'a'.repeat(64)}.json`, sha256: 'a'.repeat(64) }],
      sources: [], boardSha256: 'b'.repeat(64) } };
  const options = { expectedSourceContractSha256: '0'.repeat(64), benchmarkRequired: false, expectedRequest: 'Find benefits' };
  // The isolated functional validator checks citation authority without inventing design evidence.
  const functional = { ...research, domainReference: { ...research.domainReference, sources } } as Parameters<typeof validateFunctionalResearch>[1];
  assert.doesNotThrow(() => validateFunctionalResearch(root, functional, options));
  const forged = structuredClone(research);
  forged.domainReference.sources[0]!.features[0]!.evidence[0]!.quote = 'Fabricated capability';
  assert.throws(() => validateFunctionalResearch(root, forged as Parameters<typeof validateFunctionalResearch>[1], options), /REFERENCE_DOMAIN_CITATION_MISMATCH/);
  const wrongLink = structuredClone(research);
  wrongLink.domainReference.sources[0]!.features[0]!.evidence[0]!.field = 'linkLabels';
  wrongLink.domainReference.sources[0]!.features[0]!.evidence[0]!.linkUrl = 'https://unrelated.example/benefits';
  assert.throws(() => validateFunctionalResearch(root, wrongLink as Parameters<typeof validateFunctionalResearch>[1], options), /REFERENCE_DOMAIN_CITATION_MISMATCH/);
  const unrelated = structuredClone(research);
  unrelated.domainReference.sources[0]!.observations.push(unrelated.domainReference.sources[1]!.observations[0]!);
  assert.throws(() => validateFunctionalResearch(root, unrelated as Parameters<typeof validateFunctionalResearch>[1], options), /REFERENCE_DOMAIN_OBSERVATION_REQUIRED/);
  const wrongRequest = structuredClone(research);
  wrongRequest.domainReference.sources[0]!.similarities[0]!.requestQuote = 'unrelated request';
  assert.throws(() => validateFunctionalResearch(root, wrongRequest as Parameters<typeof validateFunctionalResearch>[1], options), /REFERENCE_DOMAIN_COMPARISON_REQUEST_MISMATCH/);
  const malformed = structuredClone(research);
  (malformed.domainReference.sources[0] as Record<string, unknown>).taskFlows = [];
  assert.throws(() => parseReferenceResearch(malformed), /REFERENCE_DOMAIN_FEATURE_EVIDENCE_REQUIRED/);
});

test('v8 publishes three functional domain sources without domain PNGs and refuses fabricated claims atomically', async t => {
  const fixture = designAdmissionFixture(t);
  fixture.addSecondDesignDirection();
  const observations: Array<{ url: string; capture: { path: string; sha256: string } }> = [];
  await withBrowser(async browser => {
    for (const host of ['alpha.com', 'beta.im', 'gamma.info']) {
      const url = `https://${host}/benefits`;
      const page = discoveryBrowser(browser, { url,
        html: '<meta charset="utf-8"><main><h1>Benefit service catalogue</h1><p>Check eligibility for support</p><a href="https://other.example/benefits">Explore benefits</a></main>' });
      observations.push(await captureReferenceNavigation(page.browser, url, 'domain', fixture.writer, 'public-directory'));
    }
  });
  const sources = observations.map((receipt, index) => ({ id: `functional-${index}`, url: receipt.url,
    observations: [{ url: receipt.url, capture: receipt.capture }], marketObservationSha256: receipt.capture.sha256,
    features: [{ id: 'eligibility', observedLabel: 'Check eligibility for support', finding: 'Eligibility is visible.',
      evidence: [{ observationSha256: receipt.capture.sha256, field: 'taskText', quote: 'Check eligibility for support', linkUrl: null }] }],
    similarities: [{ requestQuote: 'benefits', featureIds: ['eligibility'], assessment: 'Shares the task.' }],
    differences: [], adopt: [{ featureIds: ['eligibility'], action: 'Explain eligibility.', reason: 'Reduce uncertainty.' }],
    avoid: [], limitations: [] }));
  const research = { ...fixture.research, schema: 'reference-research-v8', marketCoverage: null,
    domainReference: { queries: [], searches: [], sources, benchmarkSha256: null } };
  const options = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false,
    expectedRequest: 'Study benefits' };
  assert.doesNotThrow(() => publishReferenceResearch(fixture.root, research, options, fixture.writer));
  assert.equal(readPublishedReferenceResearch(fixture.root).schema, 'reference-research-v8');
  assert.equal(existsSync(join(fixture.root, '.omd/discovery/domain/observations')), true);
  const before = readFileSync(join(fixture.root, '.omd/reference-research.json'));
  const fabricated = structuredClone(research);
  fabricated.domainReference.sources[0]!.features[0]!.evidence[0]!.quote = 'Unobserved feature';
  assert.throws(() => publishReferenceResearch(fixture.root, fabricated, options, fixture.writer), /REFERENCE_DOMAIN_CITATION_MISMATCH/);
  assert.deepEqual(readFileSync(join(fixture.root, '.omd/reference-research.json')), before);
});
