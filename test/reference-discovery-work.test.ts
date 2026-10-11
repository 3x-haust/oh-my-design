import assert from 'node:assert/strict';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { canonicalJson, sha256 } from '../core/ref/board-artifacts.ts';
import { publishReferenceDiscoveryExclusion } from '../core/ref/discovery-exclusion.ts';
import { referenceDiscoveryWork } from '../core/ref/discovery-work.ts';
import { browserProfilePath, forgetBrowserConsent, writeBrowserConsent, writeUserBrowserConsent } from '../core/ref/browser-consent.ts';
import { publishSearchLeads } from '../core/ref/search-leads.ts';
import { readStrictDiscoveryNavigation } from '../core/ref/discovery-record.ts';
import { publishFailedAttempt, readReferenceDiscoveryAttempt } from '../core/ref/navigation-capture.ts';
import { testPng } from './helpers/search-execution.ts';
import { DOMAIN_OBSERVATION_LIMITATIONS, DOMAIN_OBSERVATION_SCHEMA, readDomainObservation } from '../core/ref/domain-observation.ts';
import { directRootAt } from './helpers/market-reference.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { fixture, routeInput, unavailableSearch } from './helpers/discovery-work.ts';
import type { GalleryImageCandidate } from '../core/ref/gallery-image-candidates.ts';
function observeDomain(root: string, source: string, links: readonly string[] = [],
  capturedAt = new Date().toISOString(), language: 'korean' | 'non-korean' = 'korean',
  method: 'navigation' | 'direct-public' = 'direct-public'): void {
  const directory = join(root, '.omd/discovery/domain/observations');
  mkdirSync(directory, { recursive: true });
  const observedText = language === 'korean' ? '복지 서비스 혜택 신청 대상 안내입니다' : 'English-language service for residents';
  const unsigned = { schema: DOMAIN_OBSERVATION_SCHEMA, source, researchLane: 'domain' as const,
    method, entry: method === 'direct-public' ? 'public-directory' as const : null, capturedAt,
    acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links },
    observedText, taskText: observedText, linkLabels: links.map(url => ({ url, text: '신청 서비스 안내' })),
    language, limitations: DOMAIN_OBSERVATION_LIMITATIONS };
  const record = { ...unsigned, signature: signNativeObservation(root, DOMAIN_OBSERVATION_SCHEMA, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(join(directory, `${sha256(bytes)}.json`), bytes);
}
function retainDomain(root: string, hostname: string, capturedAt = new Date().toISOString()): void {
  const source = `https://${hostname}/`;
  observeDomain(root, source, [`${source}benefits`], capturedAt);
}
function mislabeledDesign(root: string, hostname: string): void {
  const directory = join(root, '.omd/refs/design');
  mkdirSync(directory, { recursive: true });
  const source = `https://${hostname}/`;
  const imagePath = `.omd/refs/design/${hostname}.png`;
  const image = testPng();
  writeFileSync(join(root, imagePath), image);
  writeFileSync(join(directory, `${hostname}.json`), JSON.stringify({
    source, component: 'home', researchLane: 'design', kind: 'page',
    capturedAt: '2026-09-25T00:00:00Z', imagePath, principles: ['Generic dashboard'], invariants: null,
    acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links: [], imageSha256: sha256(image) },
  }));
}
function observedSearch(root: string, input: { readonly lane: 'domain' | 'design'; readonly query: string;
  readonly url: string; readonly queryParam: string }, results: readonly { readonly url: string; readonly text: string }[]): void {
  const image = testPng();
  const directory = join(root, `.omd/discovery/${input.lane}`);
  mkdirSync(directory, { recursive: true });
  const imageSha256 = sha256(image);
  const imagePath = `.omd/discovery/${input.lane}/search-${imageSha256}.png`;
  writeFileSync(join(root, imagePath), image);
  const unsigned = { schema: 'reference-search-execution-v3', lane: input.lane, query: input.query,
    queryParam: input.queryParam, requestedUrl: input.url, finalUrl: input.url,
    provider: new URL(input.url).hostname, observedAt: new Date().toISOString(),
    status: 'page-observed', httpStatus: 200, links: results.map(result => result.url), results,
    capture: { path: imagePath, sha256: imageSha256 }, error: null,
    limitations: 'observed-links-not-ranked-results; no-clicks; no-authentication; not-provider-attested' };
  const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(join(directory, `search-${sha256(bytes)}.json`), bytes);
}
function visitedItem(root: string, url: string, lane: 'domain' | 'design' = 'design', links: readonly string[] = [],
  imageCandidates?: readonly GalleryImageCandidate[]): void {
  if (lane === 'domain') { observeDomain(root, url, links, new Date().toISOString(), 'korean', 'navigation'); return; }
  const directory = `.omd/discovery/${lane}/navigation`;
  mkdirSync(join(root, directory), { recursive: true });
  const image = testPng();
  const imageSha256 = sha256(image);
  const imagePath = `${directory}/${imageSha256}.png`;
  writeFileSync(join(root, imagePath), image);
  const unsigned = { schema: imageCandidates === undefined ? 'reference-navigation-capture-v4' : 'reference-navigation-capture-v5',
    ...(imageCandidates === undefined ? {} : { imageCandidates }), source: url, researchLane: lane, kind: 'page',
    capturedAt: new Date().toISOString(), imagePath,
    acquisition: { requestedUrl: url, finalUrl: url, httpStatus: 200, links, imageSha256 },
    limitations: 'native-public-get; stable-rendered-viewport-links; no-authentication; no-interaction-probes; not-provider-attested' };
  const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const receipt = { url, evidence: { path: imagePath, sha256: imageSha256 },
    capture: { path: `${directory}/${sha256(bytes)}.json`, sha256: sha256(bytes) } };
  writeFileSync(join(root, receipt.capture.path), bytes);
  assert.equal(readStrictDiscoveryNavigation(root, receipt).url, url);
}

test('work-next searches headlessly without consent or everyday-browser navigation', t => {
  const root = fixture(t);
  forgetBrowserConsent(root);
  const route = routeAdaptiveFlow(routeInput());
  const pending = referenceDiscoveryWork(root, route);
  assert.equal(pending.action?.kind, 'search');
  assert.equal(pending.action?.engine, 'headless');
  assert.deepEqual(pending.action?.args, ['ref', 'advance', '--json']);
  writeBrowserConsent('skipped-this-run', root);
  writeUserBrowserConsent('skipped-this-run', root);
  const next = referenceDiscoveryWork(root, route);
  assert.equal(next.action?.engine, 'headless');
  assert.match(next.action?.input?.url ?? '', /^https:\/\/www\.google\.com\/search\?q=/u);
});

test('previous everyday-browser consent does not override background headless profile search', t => {
  const root = fixture(t);
  mkdirSync(browserProfilePath(root), { recursive: true });
  writeBrowserConsent('consented', root);
  writeUserBrowserConsent('consented', root);
  const action = referenceDiscoveryWork(root, routeAdaptiveFlow(routeInput())).action;
  assert.equal(action?.kind, 'search');
  assert.equal(action?.engine, 'omd-profile');
  assert.deepEqual(action?.args, ['ref', 'advance', '--json']);
});

test('unsigned host lead becomes a follow-link only; signed destination observation then counts as material progress', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const initial = referenceDiscoveryWork(root, route);
  assert.equal(initial.action?.kind, 'search');
  const source = 'https://www.bokjiro.go.kr/service/';
  publishSearchLeads(createTestProjectWriteAdapter(root), route.sourceContractSha256, {
    schema: 'reference-search-leads-v1', lane: 'domain', query: initial.action.input!.query,
    urls: [source], provider: 'host', tool: 'web_search', observedAt: new Date().toISOString(),
  });
  const withLead = referenceDiscoveryWork(root, route);
  assert.equal(withLead.action?.kind, 'follow-link');
  assert.equal(withLead.action?.url, source);
  assert.deepEqual(withLead.materialProgressIdentities, []);
  visitedItem(root, source, 'domain', ['https://www.bokjiro.go.kr/service/apply']);
  assert.deepEqual(referenceDiscoveryWork(root, route).materialProgressIdentities, [ `domain:${source}` ]);
});

test('known independent source leads share one bounded acquisition action without gaining admission', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const initial = referenceDiscoveryWork(root, route);
  assert.ok(initial.action?.input);
  const urls = ['https://www.bokjiro.go.kr/service/', 'https://www.gov.kr/benefits/', 'https://wis.seoul.go.kr/services/'];
  publishSearchLeads(createTestProjectWriteAdapter(root), route.sourceContractSha256, {
    schema: 'reference-search-leads-v1', lane: 'domain', query: initial.action.input.query,
    urls, provider: 'host', tool: 'web_search', observedAt: new Date().toISOString(),
  });
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'follow-link');
  assert.deepEqual(Reflect.get(work.action ?? {}, 'batchUrls'), urls);
  assert.deepEqual(work.materialProgressIdentities, []);
  assert.equal(work.progress.domainFamilies, 0);
});

test('work-next names the first exact Korean search action when no board evidence exists', t => {
  // Given: a Korean welfare route without any captured reference.
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  // When: the disk-backed discovery pointer is requested.
  const work = referenceDiscoveryWork(root, route);
  // Then: it selects a bounded real search, not another brief/check and not a board.
  assert.equal(work.status, 'action');
  assert.equal(work.action?.kind, 'search');
  assert.equal(work.action?.lane, 'domain');
  assert.ok(work.action?.input?.query);
  assert.deepEqual(work.action?.args, ['ref', 'advance', '--json']);
  assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
});

test('work-next moves to Korean design discovery once three distinct local domain services are retained', t => {
  // Given: three different local service families, but no design reference.
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  for (const name of readdirSync(join(root, '.omd/discovery/domain/observations'))) {
    const record = JSON.parse(readFileSync(join(root, '.omd/discovery/domain/observations', name), 'utf8'));
    assert.equal(readDomainObservation(root, { url: record.source, capture: { path: `.omd/discovery/domain/observations/${name}`, sha256: name.slice(0, -5) } }).language, 'korean');
  }
  // When: the pointer recomputes from disk.
  const work = referenceDiscoveryWork(root, route);
  // Then: it never recycles the domain search or substitutes a government portal as design evidence.
  assert.equal(work.status, 'action');
  assert.equal(work.action?.lane, 'design', JSON.stringify(work.progress));
  assert.equal(work.action?.kind, 'search');
  assert.equal(work.action?.input?.lane, 'design');
  assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
});

test('retained families do not require a fixed inventory of market searches', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  const first = referenceDiscoveryWork(root, route);
  assert.equal(first.action?.lane, 'design');
  const searchUrl = new URL('https://www.google.com/search');
  searchUrl.searchParams.set('q', '복지로');
  unavailableSearch(root, { lane: 'domain', query: '복지로', url: searchUrl.href, queryParam: 'q' });
  const after = referenceDiscoveryWork(root, route);
  assert.equal(after.action?.lane, 'design');
  assert.equal(after.action?.kind, 'search');
});

test('generic search labels and private links do not become candidate services without a signed direct root', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const input = referenceDiscoveryWork(root, route).action?.input;
  assert.ok(input);
  observedSearch(root, input, [
    { url: 'https://127.0.0.1/private', text: `${input.query} local service` },
    { url: 'https://www.welfarehello.com/recommend-policy/', text: '바로가기' },
  ]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'search');
  assert.notEqual(work.action?.input?.url, input.url);
});

test('explicit Korean-market discovery does not follow an unrelated substantive search title', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const input = referenceDiscoveryWork(root, route).action?.input;
  assert.ok(input);
  observedSearch(root, input, [{ url: 'https://weather.example/forecast', text: 'Weather Forecast Tomorrow' }]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'search');
  assert.notEqual(work.action?.input?.url, input.url);
});

test('domain search does not promote explanatory articles or policy news as service screens', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const input = referenceDiscoveryWork(root, route).action?.input;
  assert.ok(input);
  observedSearch(root, input, [
    { url: 'https://namu.wiki/w/%EB%B3%B5%EC%A7%80', text: '복지로 - 나무위키' },
    { url: 'https://bangulnote.com/325', text: '복지로 조회 방법' },
    { url: 'https://www.gov.kr/portal/gvrnPolicy/listAll', text: '정부 정책정보' },
  ]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'search');
  assert.notEqual(work.action?.input?.url, input.url);
});

test('two unusable screens from one operator move discovery to another service family', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const input = referenceDiscoveryWork(root, route).action?.input;
  assert.ok(input);
  const homepage = 'https://www.bokjiro.go.kr/';
  const search = 'https://www.bokjiro.go.kr/search';
  observedSearch(root, input, [
    { url: homepage, text: '복지로 공식 혜택 서비스' },
    { url: search, text: '복지로 서비스 검색' },
    { url: 'https://www.bokjiro.go.kr/apply', text: '복지로 온라인 신청' },
    { url: 'https://www.ynote.kr/', text: '복지로와 청년노트 복지 혜택 찾기 서비스' },
  ]);
  for (const url of [homepage, search]) {
    visitedItem(root, url, 'domain');
    publishReferenceDiscoveryExclusion(root, route.sourceContractSha256, 'domain', url,
      'The observed service screen is obscured by a blocking server error popup.', createTestProjectWriteAdapter(root));
  }
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'search');
  assert.notEqual(work.action?.url, 'https://www.ynote.kr/');
});

test('a search header help link is not a domain task result or a next visit', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const input = referenceDiscoveryWork(root, route).action?.input;
  assert.ok(input);
  observedSearch(root, input, [
    { url: 'https://support.microsoft.com/topic/accessibility-in-bing', text: '접근성 도움말' },
    { url: 'https://www.bing.com/images', text: '이미지' },
  ]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'search');
  assert.notEqual(work.action?.input?.url, input.url);
  assert.equal(work.progress.visits, 0);
});

test('domain discovery does not recurse into unrelated footer or pagination chains', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const rootUrl = 'https://www.bokjiro.go.kr/';
  const taskUrl = `${rootUrl}benefits`;
  observeDomain(root, rootUrl, [taskUrl, 'https://www.facebook.com/bokjiro']);
  visitedItem(root, taskUrl, 'domain', [`${taskUrl}?page=2`]);
  const work = referenceDiscoveryWork(root, route);
  assert.notEqual(work.action?.kind, 'retain-reference');
  assert.notEqual(work.action?.url, `${taskUrl}?page=2`);
});

test('a searched service homepage does not promote an unrelated footer operator as a comparable service', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const input = referenceDiscoveryWork(root, route).action?.input;
  assert.ok(input);
  const service = 'https://www.bokjiro.go.kr/';
  observedSearch(root, input, [{ url: service, text: '복지로 맞춤형급여안내' }]);
  visitedItem(root, service, 'domain', ['https://www.ftc.go.kr/bizCommPop.do?wrkr_no=1234567890']);
  const work = referenceDiscoveryWork(root, route);
  assert.notEqual(work.action?.kind, 'retain-reference');
  assert.notEqual(work.action?.url, 'https://www.ftc.go.kr/bizCommPop.do?wrkr_no=1234567890');
});

test('a signed public directory can lead to a different service family', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const service = 'https://www.welfarehello.com/recommend-policy/';
  observeDomain(root, 'https://directory.example/', [service]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'follow-link');
  assert.equal(work.action?.url, service);
});

test('a popup-only domain page cannot satisfy the comparable service family requirement', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  retainDomain(root, 'www.gov.kr');
  retainDomain(root, 'wis.seoul.go.kr');
  observeDomain(root, 'https://www.bokjiro.go.kr/');
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.progress.domainFamilies, 2);
  assert.equal(work.action?.lane, 'domain');
});

test('a registered finished-product lead can be inspected and retained without a gallery wrapper', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  const product = 'https://wise.com/gb/send-money/';
  const input = referenceDiscoveryWork(root, route).action?.input;
  assert.ok(input);
  publishSearchLeads(createTestProjectWriteAdapter(root), route.sourceContractSha256, {
    schema: 'reference-search-leads-v1', lane: 'design', query: input.query,
    urls: ['https://www.bokjiro.go.kr/', product],
    provider: 'host', tool: 'web_search', observedAt: new Date().toISOString(),
  });
  const next = referenceDiscoveryWork(root, route);
  assert.equal(next.action?.kind, 'follow-link');
  assert.equal(next.action?.url, product);
  visitedItem(root, product);
  const retained = referenceDiscoveryWork(root, route);
  assert.equal(retained.action?.kind, 'retain-reference');
  assert.equal(retained.action?.url, product);
});

test('registered gallery directories cannot preempt finished-product searches', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  publishSearchLeads(createTestProjectWriteAdapter(root), route.sourceContractSha256, {
    schema: 'reference-search-leads-v1', lane: 'design', query: 'welfare desktop inspiration',
    urls: [
      'https://dribbble.com/search/korea-ui',
      'https://www.behance.net/search/projects/case%20management%20product%20design?locale=ko',
      'https://muz.li/inspiration/dashboard-inspiration/',
      'https://www.figma.com/templates/dashboard-designs/',
    ],
    provider: 'host', tool: 'web_search', observedAt: new Date().toISOString(),
  });
  const next = referenceDiscoveryWork(root, route);
  assert.equal(next.action?.kind, 'search');
  const input = next.action?.input;
  assert.ok(input);
  assert.ok(input.query.endsWith('finished product app'));
  assert.equal(new URL(input.url).hostname, 'www.google.com');
  assert.equal(next.progress.designFamilies, 0);
});

test('a signed blank gallery item cannot repeat the same follow-link; the next distinct product lead advances', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  const first = 'https://dribbble.com/shots/27610524-Task-Management-Dashboard-Ui-Design';
  const second = 'https://www.siteinspire.com/website/123-example';
  const query = referenceDiscoveryWork(root, route).action?.input?.query;
  assert.ok(query);
  publishSearchLeads(createTestProjectWriteAdapter(root), route.sourceContractSha256, {
    schema: 'reference-search-leads-v1', lane: 'design', query, urls: [first, second],
    provider: 'host', tool: 'web_search', observedAt: new Date().toISOString(),
  });
  const before = referenceDiscoveryWork(root, route);
  assert.equal(before.action?.url, first);
  const receipt = publishFailedAttempt(createTestProjectWriteAdapter(root), first, 'design', undefined, 202,
    new Error('no visible task text in discovery capture'));
  assert.equal(readReferenceDiscoveryAttempt(root, receipt).reason, 'entry-unusable');
  const after = referenceDiscoveryWork(root, route);
  assert.equal(after.action?.kind, 'follow-link');
  assert.equal(after.action?.url, second);
  assert.notEqual(after.workSha256, before.workSha256);
});

test('a visited gallery item can expose an original without recursively following its footer', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  const item = 'https://www.siteinspire.com/websites/123456-task-screen';
  const original = 'https://quality-product.example/app';
  directRootAt(root, 'design', 'https://www.siteinspire.com/', [item]);
  visitedItem(root, item, 'design', [original]);
  const first = referenceDiscoveryWork(root, route);
  assert.equal(first.action?.kind, 'follow-link');
  assert.equal(first.action?.url, original);
  visitedItem(root, original, 'design', ['https://unrelated-footer.example/']);
  const second = referenceDiscoveryWork(root, route);
  assert.equal(second.action?.kind, 'retain-reference');
  assert.equal(second.action?.url, original);
});

test('observed originals precede gallery image advice even when a large image exists', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  const item = 'https://www.siteinspire.com/websites/123456-task-screen';
  const original = 'https://quality-product.example/app';
  directRootAt(root, 'design', 'https://www.siteinspire.com/', [item]);
  visitedItem(root, item, 'design', [original], [
    { selector: '#preview', width: 600, height: 400, naturalWidth: 2400, naturalHeight: 1600 },
  ]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'follow-link');
  assert.equal(work.action?.url, original);
});

test('multiple image observations remain explicit choices rather than an automatic largest-image selection', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  const item = 'https://www.siteinspire.com/websites/123456-task-screen';
  const images = [
    { selector: '#large-photo', width: 600, height: 400, naturalWidth: 4000, naturalHeight: 2400 },
    { selector: '#task-screen', width: 400, height: 300, naturalWidth: 1600, naturalHeight: 1200 },
  ];
  directRootAt(root, 'design', 'https://www.siteinspire.com/', [item]);
  visitedItem(root, item, 'design', [], images);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'retain-reference');
  assert.equal(work.action?.selector, undefined);
  const action = work.action;
  assert.ok(action);
  assert.deepEqual(Reflect.get(action, 'imageCandidates'), images);
});

test('a second visited gallery item still exposes its original before wrapper retention', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  const firstItem = 'https://www.siteinspire.com/websites/123456-first-task';
  const secondItem = 'https://www.siteinspire.com/websites/234567-second-task';
  const original = 'https://quality-product.example/application';
  directRootAt(root, 'design', 'https://www.siteinspire.com/', [firstItem, secondItem]);
  visitedItem(root, firstItem);
  visitedItem(root, secondItem, 'design', [original]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'follow-link');
  assert.equal(work.action?.url, original);
});

test('a gallery item original takes priority over another unvisited gallery sibling', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  const item = 'https://www.siteinspire.com/websites/123456-task-screen';
  const sibling = 'https://www.siteinspire.com/websites/234567-other-screen';
  const original = 'https://quality-product.example/app';
  directRootAt(root, 'design', 'https://www.siteinspire.com/', [item, sibling]);
  visitedItem(root, item, 'design', [original]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'follow-link');
  assert.equal(work.action?.url, original);
});

test('old or pre-route retained families cannot make a fresh route board-ready', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname, old);
  const aged = referenceDiscoveryWork(root, route);
  assert.equal(aged.progress.domainFamilies, 0);
  assert.equal(aged.action?.lane, 'domain');
  const freshRoot = fixture(t);
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) {
    retainDomain(freshRoot, hostname, new Date(Date.now() - 60_000).toISOString());
  }
  writeFileSync(join(freshRoot, '.omd/route.json'), '{}');
  const republished = referenceDiscoveryWork(freshRoot, route);
  assert.equal(republished.progress.domainFamilies, 0);
  assert.equal(republished.action?.lane, 'domain');
});

test('script measurement does not determine domain source provenance', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr']) retainDomain(root, hostname);
  const englishHost = 'english-only.example.kr';
  observeDomain(root, `https://${englishHost}/`, [`https://${englishHost}/benefits`], new Date().toISOString(), 'non-korean');
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.progress.domainFamilies, 3);
  assert.equal(work.action?.lane, 'design');
});

test('an old gallery wrapper and unsigned originals cannot become visual-direction coverage', t => {
  const value = designAdmissionFixture(t);
  value.addSecondDesignDirection();
  for (const host of ['alpha.com', 'beta.im', 'gamma.info']) retainDomain(value.root, host);
  const oldGallery = JSON.parse(readFileSync(value.gallery.path, 'utf8')) as Record<string, unknown>;
  oldGallery.capturedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  writeFileSync(value.gallery.path, JSON.stringify(oldGallery));
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  const work = referenceDiscoveryWork(value.root, routeAdaptiveFlow(input));
  assert.equal(work.progress.designFamilies, 0);
  assert.equal(work.status, 'action');
  assert.notEqual(work.action?.kind, 'publish-board');
});

test('work-next resumes after a signed unavailable search instead of repeating that query', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const before = referenceDiscoveryWork(root, route);
  assert.equal(before.action?.kind, 'search');
  assert.ok(before.action?.input);
  unavailableSearch(root, before.action.input);
  const after = referenceDiscoveryWork(root, route);
  assert.equal(after.status, 'action');
  assert.equal(after.action?.kind, 'search');
  assert.notEqual(after.action?.input?.url, before.action.input.url);
  assert.notEqual(after.workSha256, before.workSha256);
  assert.equal(after.attempts[0]?.receipt.path.startsWith('.omd/discovery/domain/search-'), true);
});

test('work-next exhausts finished-product searches without auto-opening gallery roots', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  for (let remaining = 20; remaining > 0; remaining -= 1) {
    const work = referenceDiscoveryWork(root, route);
    if (work.action?.kind !== 'search' || work.action.lane !== 'design') break;
    assert.ok(work.action.input);
    unavailableSearch(root, work.action.input);
  }
  const next = referenceDiscoveryWork(root, route);
  assert.equal(next.status, 'action');
  assert.equal(next.action?.kind, 'replan-discovery',
    'exhausted automatic searches need fresh product leads, not a hard-coded gallery homepage');
  assert.equal(next.action?.url, undefined);
  assert.equal(next.progress.designFamilies, 0);
});

test('domain discovery does not force a fixed service directory after empty searches', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (let remaining = 5; remaining > 0; remaining -= 1) {
    const work = referenceDiscoveryWork(root, route);
    if (work.action?.kind !== 'search' || work.action.lane !== 'domain') break;
    assert.ok(work.action.input);
    unavailableSearch(root, work.action.input);
  }
  const direct = referenceDiscoveryWork(root, route);
  assert.notEqual(direct.action?.url, 'https://www.bokjiro.go.kr/ssis-tbu/');
  assert.equal(direct.action?.kind, 'search');
});

test('unscoped route still begins a plan-derived public domain search', t => {
  const root = fixture(t);
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  const work = referenceDiscoveryWork(root, routeAdaptiveFlow(input));
  assert.equal(work.status, 'action');
  assert.equal(work.action?.kind, 'search');
  assert.equal(work.action?.lane, 'domain');
  assert.match(work.action?.input?.url ?? '', /^https:\/\/www\.google\.com\/search\?q=/u);
});

test('first-party pages merely mislabeled design never mark the board ready', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  mislabeledDesign(root, 'first.example');
  mislabeledDesign(root, 'second.example');
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.status, 'action');
  assert.equal(work.action?.lane, 'design');
  assert.equal(work.progress.designFamilies, 0);
});

test('a rejected observed gallery item advances to another action without inventing design evidence', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  const item = 'https://www.siteinspire.com/websites/123456-task-screen';
  directRootAt(root, 'design', 'https://www.siteinspire.com/', [item]);
  visitedItem(root, item);
  const before = referenceDiscoveryWork(root, route);
  assert.equal(before.action?.kind, 'retain-reference');
  assert.equal(before.action?.url, item);
  const excluded = publishReferenceDiscoveryExclusion(root, route.sourceContractSha256, 'design', item,
    'The observed item has no useful application work surface.', createTestProjectWriteAdapter(root));
  assert.match(excluded.path, /^\.omd\/discovery\/design\/excluded\/[a-f0-9]{64}\.json$/u);
  const after = referenceDiscoveryWork(root, route);
  assert.equal(after.status, 'action');
  assert.notEqual(after.action?.url, item);
  assert.notEqual(after.workSha256, before.workSha256);
  assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
});

test('exclusion refuses an unvisited item without mutating the project', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const item = 'https://www.siteinspire.com/websites/123456-unvisited';
  assert.throws(() => publishReferenceDiscoveryExclusion(root, route.sourceContractSha256, 'design', item,
    'This source is not a useful observed application UI.', createTestProjectWriteAdapter(root)), /visit and capture/);
  assert.equal(existsSync(join(root, '.omd/discovery/design/excluded')), false);
});

test('structurally eligible independent designs still require signed Eye admission before a board', t => {
  const fixture = designAdmissionFixture(t);
  fixture.addSecondDesignDirection();
  for (const host of ['alpha.com', 'beta.im', 'gamma.info']) retainDomain(fixture.root, host);
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  const work = referenceDiscoveryWork(fixture.root, routeAdaptiveFlow(input));
  assert.equal(work.progress.designFamilies, 0);
  assert.equal(work.status, 'action');
  assert.notEqual(work.action?.kind, 'publish-board');
  assert.notEqual(work.next, 'omd ref board --input <candidate-assemblies.json>');
});
