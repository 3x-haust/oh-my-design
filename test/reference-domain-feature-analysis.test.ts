import assert from 'node:assert/strict';
import test from 'node:test';
import { captureReferenceNavigation } from '../core/ref/navigation-capture.ts';
import { validateFunctionalResearch } from '../core/ref/reference-research-functional.ts';
import { parseReferenceResearch } from '../core/ref/reference-research-parser.ts';
import { withBrowser } from '../core/render/index.ts';
import { discoveryBrowser, discoveryFixture } from './helpers/discovery-capture.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

test('three signed functional sources cite observed text, compare the request and record adoption', async t => {
  const root = discoveryFixture(t);
  const observations: Array<{ url: string; capture: { path: string; sha256: string } }> = [];
  await withBrowser(async browser => {
    for (const host of ['alpha.com', 'beta.im', 'gamma.info']) {
      const url = `https://${host}/benefits`;
      const observed = discoveryBrowser(browser, {
        url,
        html: '<meta charset="utf-8"><main><h1>복지 서비스 혜택 신청 대상 안내입니다</h1><p>지원 자격 확인하기</p><a href="https://other.example/benefits">신청 정보 확인</a></main>',
      });
      observations.push(await captureReferenceNavigation(
        observed.browser,
        url,
        'domain',
        createTestProjectWriteAdapter(root),
        'public-directory',
      ));
    }
  });
  const sources = observations.map((receipt, index) => ({
    id: `service-${index}`,
    url: receipt.url,
    observations: [{ url: receipt.url, capture: receipt.capture }],
    marketObservationSha256: receipt.capture.sha256,
    features: [{
      id: 'eligibility',
      observedLabel: '지원 자격 확인하기',
      finding: 'The service exposes an eligibility step.',
      evidence: [{
        observationSha256: receipt.capture.sha256,
        field: 'taskText' as const,
        quote: '지원 자격 확인하기',
        linkUrl: null as string | null,
      }],
    }],
    similarities: [{
      requestQuote: 'benefits',
      featureIds: ['eligibility'],
      assessment: 'Same task category.',
    }],
    differences: [],
    adopt: [{
      featureIds: ['eligibility'],
      action: 'Expose eligibility first.',
      reason: 'Reduce dead ends.',
    }],
    avoid: [],
    limitations: [],
  }));
  const research = {
    schema: 'reference-research-v8' as const,
    sourceContractSha256: '0'.repeat(64),
    marketCoverage: null,
    domainReference: { queries: [], searches: [], sources, benchmarkSha256: null },
    designReference: {
      queries: ['design'],
      searches: [{
        path: `.omd/discovery/design/search-${'a'.repeat(64)}.json`,
        sha256: 'a'.repeat(64),
      }],
      sources: [],
      boardSha256: 'b'.repeat(64),
    },
  };
  const options = {
    expectedSourceContractSha256: '0'.repeat(64),
    benchmarkRequired: false,
    expectedRequest: 'Find benefits',
  };
  assert.doesNotThrow(() => validateFunctionalResearch(
    root,
    research as Parameters<typeof validateFunctionalResearch>[1],
    options,
  ));
  const forged = structuredClone(research);
  forged.domainReference.sources[0]!.features[0]!.evidence[0]!.quote = 'Fabricated capability';
  assert.throws(() => validateFunctionalResearch(
    root,
    forged as Parameters<typeof validateFunctionalResearch>[1],
    options,
  ), /REFERENCE_DOMAIN_CITATION_MISMATCH/);
  const wrongLink = structuredClone(research);
  const wrongEvidence = wrongLink.domainReference.sources[0]!.features[0]!.evidence[0]! as {
    field: string;
    linkUrl: string | null;
  };
  wrongEvidence.field = 'linkLabels';
  wrongEvidence.linkUrl = 'https://unrelated.example/benefits';
  assert.throws(() => validateFunctionalResearch(
    root,
    wrongLink as Parameters<typeof validateFunctionalResearch>[1],
    options,
  ), /REFERENCE_DOMAIN_CITATION_MISMATCH/);
  const unrelated = structuredClone(research);
  unrelated.domainReference.sources[0]!.observations.push(unrelated.domainReference.sources[1]!.observations[0]!);
  assert.throws(() => validateFunctionalResearch(
    root,
    unrelated as Parameters<typeof validateFunctionalResearch>[1],
    options,
  ), /REFERENCE_DOMAIN_OBSERVATION_REQUIRED/);
  const wrongRequest = structuredClone(research);
  wrongRequest.domainReference.sources[0]!.similarities[0]!.requestQuote = 'unrelated request';
  assert.throws(() => validateFunctionalResearch(
    root,
    wrongRequest as Parameters<typeof validateFunctionalResearch>[1],
    options,
  ), /REFERENCE_DOMAIN_COMPARISON_REQUEST_MISMATCH/);
  const malformed = structuredClone(research);
  (malformed.domainReference.sources[0] as Record<string, unknown>).taskFlows = [];
  assert.equal(Object.hasOwn(parseReferenceResearch(malformed).domainReference.sources[0]!, 'taskFlows'), false);
});
