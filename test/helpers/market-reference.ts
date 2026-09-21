import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../../core/ref/board-artifacts.ts';
import { signNativeObservation } from '../../core/runtime/self-signed-activation.ts';
import { ADMISSION_SOURCE_SHA, admissionHash } from './design-admission.ts';
import { testPng } from './search-execution.ts';

export const marketOptions = { expectedSourceContractSha256: ADMISSION_SOURCE_SHA, benchmarkRequired: false,
  expectedRequest: 'Study Korean public benefits' };
export const marketDomainBrief = {
  schema: 'domain-brief-v1', request: marketOptions.expectedRequest, domain: 'public benefits', summary: 'Compare public benefits',
  surfaces: [{ name: 'home', purpose: 'Find a benefit', evidence: [{ status: 'user-provided', reference: 'test' }] }],
  coreObjects: [{ name: 'benefit', evidence: [{ status: 'user-provided', reference: 'test' }] }],
  audience: { description: 'Korean residents', evidence: [{ status: 'user-provided', reference: 'test' }] },
  referenceQueries: { component: ['benefit card'], craft: ['eligibility feedback'], mood: ['visual task'] },
  planning: { businessGoal: { text: 'Find benefits' }, successSignal: { text: 'Open a relevant benefit' },
    nonGoals: [{ text: 'Do not submit official applications' }] },
};
export const marketContext = { schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ko-KR',
  marketRegion: 'KR', audience: '한국에서 공공 혜택을 비교하는 주민', domain: 'public benefits',
  surface: 'product', desiredFit: 'market-grounded', brandInvariants: ['Facts remain source-bound'] };
export const localSearchSource = (sourceId: string, evidenceSha256: string, scope: 'service' | 'product', searchReceiptSha256: string) => ({
  sourceId, evidenceSha256, scope, basis: 'market-search-result', provenanceReceiptSha256: searchReceiptSha256,
});
export const localDirectSource = (sourceId: string, evidenceSha256: string, scope: 'service' | 'product', receiptSha256: string) => ({
  sourceId, evidenceSha256, scope, basis: 'market-direct-result', provenanceReceiptSha256: receiptSha256,
});
export const fallbackGap = (attemptedQueries: readonly string[], attemptedRoots: readonly string[] = []) => ({
  marketRegion: 'KR', kind: 'coverage', attemptedQueries, attemptedRoots,
});
export const fallbackCoverage = (sourceIds: readonly string[], provenanceReceiptSha256: string,
  gap: ReturnType<typeof fallbackGap>) => ({ sourceIds,
  provenance: sourceIds.map(sourceId => ({ sourceId, provenanceReceiptSha256 })), gap });
export function rootEnvelope(lane: 'domain' | 'design') {
  const digest = (lane === 'domain' ? 'c' : 'd').repeat(64);
  return { method: 'direct-public', entry: lane === 'domain' ? 'public-directory' : 'free-gallery',
    url: lane === 'domain' ? 'https://directory.example/tasks' : 'https://www.siteinspire.com/',
    reason: 'The public list exposes comparable task entries.',
    evidence: { path: `.omd/discovery/${lane}/entries/${digest}.png`, sha256: digest },
    capture: { path: `.omd/discovery/${lane}/entries/${digest}.json`, sha256: digest } };
}
export function directRootAt(root: string, lane: 'domain' | 'design', url: string, links: readonly string[],
  observedText = `South Korea ${lane === 'domain' ? 'service directory for residents' : 'design gallery products'}.`,
  capturedAt = new Date().toISOString(),
  linkText = `South Korea ${lane === 'domain' ? 'service for residents' : 'design product gallery'}`) {
  const image = testPng(1280, 900, Number.parseInt(admissionHash(url).slice(0, 2), 16));
  const imageSha256 = admissionHash(image);
  const imagePath = `.omd/discovery/${lane}/entries/${imageSha256}.png`;
  mkdirSync(join(root, `.omd/discovery/${lane}/entries`), { recursive: true });
  writeFileSync(join(root, imagePath), image);
  const unsigned = { schema: 'reference-discovery-entry-v3', method: 'direct-public',
    entry: lane === 'domain' ? 'public-directory' : 'free-gallery', source: url, researchLane: lane,
    kind: 'page', capturedAt, imagePath,
    acquisition: { requestedUrl: url, finalUrl: url, httpStatus: 200, links, imageSha256 },
    limitations: 'native-public-get; stable-rendered-viewport-links; no-authentication; no-interaction-probes; not-provider-attested',
    observedText, linkLabels: links.map(url => ({ url, text: linkText })) };
  const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema,
    admissionHash(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const sha256 = admissionHash(bytes);
  const path = `.omd/discovery/${lane}/entries/${sha256}.json`;
  writeFileSync(join(root, path), bytes);
  return { ...rootEnvelope(lane), url,
    reason: `South Korea ${lane === 'domain' ? 'service directory' : 'design gallery'} list.`,
    evidence: { path: imagePath, sha256: imageSha256 }, capture: { path, sha256 } };
}
