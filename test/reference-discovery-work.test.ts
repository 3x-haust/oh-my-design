import assert from 'node:assert/strict';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { canonicalJson, sha256 } from '../core/ref/board-artifacts.ts';
import { publishReferenceDiscoveryExclusion } from '../core/ref/discovery-exclusion.ts';
import { referenceDiscoveryWork } from '../core/ref/discovery-work.ts';
import { readStrictDiscoveryNavigation } from '../core/ref/discovery-record.ts';
import { testPng } from './helpers/search-execution.ts';
import { directRootAt } from './helpers/market-reference.ts';
import { designAdmissionFixture } from './helpers/design-admission.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';

const routeInput = () => {
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  input.request = '한국어로 복지 혜택을 찾고 신청을 준비하는 서비스를 만든다.';
  input.taskOutcome.goal = '복지 혜택을 찾아 신청을 준비한다.';
  return input;
};
function fixture(t: { after(fn: () => void): void }): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-discovery-work-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function retainDomain(root: string, hostname: string): void {
  const directory = join(root, '.omd/refs/domain');
  mkdirSync(directory, { recursive: true });
  const imagePath = `.omd/refs/domain/${hostname}.png`;
  const image = testPng();
  writeFileSync(join(root, imagePath), image);
  const source = `https://${hostname}/`;
  writeFileSync(join(directory, `${hostname}.json`), JSON.stringify({
    source, component: 'home', researchLane: 'domain', kind: 'page',
    capturedAt: '2026-09-25T00:00:00Z', imagePath, principles: ['Observe task structure'], invariants: null,
    acquisition: { requestedUrl: source, finalUrl: source, httpStatus: 200, links: [], imageSha256: sha256(image) },
    visibleKoreanText: true,
  }));
  directRootAt(root, 'domain', source, [`${source}benefits`]);
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
function unavailableSearch(root: string, input: { readonly lane: 'domain' | 'design'; readonly query: string;
  readonly url: string; readonly queryParam: string }, observedAt = new Date().toISOString()): void {
  const unsigned = { schema: 'reference-search-execution-v2', lane: input.lane, query: input.query,
    queryParam: input.queryParam, requestedUrl: input.url, finalUrl: null,
    provider: new URL(input.url).hostname, observedAt,
    status: 'navigation-error', httpStatus: null, links: [], results: [], capture: null,
    error: 'network failure', limitations: 'observed-links-not-ranked-results; no-clicks; no-authentication; not-provider-attested' };
  const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const directory = join(root, `.omd/discovery/${input.lane}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `search-${sha256(bytes)}.json`), bytes);
}
function observedSearch(root: string, input: { readonly lane: 'domain' | 'design'; readonly query: string;
  readonly url: string; readonly queryParam: string }, results: readonly { readonly url: string; readonly text: string }[]): void {
  const image = testPng();
  const directory = join(root, `.omd/discovery/${input.lane}`);
  mkdirSync(directory, { recursive: true });
  const imageSha256 = sha256(image);
  const imagePath = `.omd/discovery/${input.lane}/search-${imageSha256}.png`;
  writeFileSync(join(root, imagePath), image);
  const unsigned = { schema: 'reference-search-execution-v2', lane: input.lane, query: input.query,
    queryParam: input.queryParam, requestedUrl: input.url, finalUrl: input.url,
    provider: new URL(input.url).hostname, observedAt: new Date().toISOString(),
    status: 'page-observed', httpStatus: 200, links: results.map(result => result.url), results,
    capture: { path: imagePath, sha256: imageSha256 }, error: null,
    limitations: 'observed-links-not-ranked-results; no-clicks; no-authentication; not-provider-attested' };
  const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(join(directory, `search-${sha256(bytes)}.json`), bytes);
}
function unavailableEntry(root: string, lane: 'domain' | 'design', url: string): void {
  const unsigned = { schema: 'reference-discovery-attempt-v1', source: url, researchLane: lane,
    method: 'direct-public', entry: lane === 'domain' ? 'public-directory' : 'free-gallery', capturedAt: new Date().toISOString(),
    httpStatus: null, outcome: 'unavailable', reason: 'network-failure' };
  const record = { ...unsigned, signature: signNativeObservation(root, unsigned.schema, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const directory = join(root, `.omd/discovery/${lane}/attempts`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${sha256(bytes)}.json`), bytes);
}
function visitedItem(root: string, url: string, lane: 'domain' | 'design' = 'design', links: readonly string[] = []): void {
  const directory = `.omd/discovery/${lane}/navigation`;
  mkdirSync(join(root, directory), { recursive: true });
  const image = testPng();
  const imageSha256 = sha256(image);
  const imagePath = `${directory}/${imageSha256}.png`;
  writeFileSync(join(root, imagePath), image);
  const record = { schema: 'reference-navigation-capture-v2', source: url, researchLane: lane, kind: 'page',
    capturedAt: new Date().toISOString(), imagePath,
    acquisition: { requestedUrl: url, finalUrl: url, httpStatus: 200, links, imageSha256 },
    limitations: 'native-public-get; stable-rendered-viewport-links; no-authentication; no-interaction-probes; not-provider-attested' };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const receipt = { url, evidence: { path: imagePath, sha256: imageSha256 },
    capture: { path: `${directory}/${sha256(bytes)}.json`, sha256: sha256(bytes) } };
  writeFileSync(join(root, receipt.capture.path), bytes);
  assert.equal(readStrictDiscoveryNavigation(root, receipt).url, url);
}

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
  assert.equal(work.action?.input?.query, '복지로');
  assert.deepEqual(work.action?.args, ['ref', 'advance', '--json']);
  assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
});

test('work-next moves to Korean design discovery once three distinct local domain services are retained', t => {
  // Given: three different local service families, but no design reference.
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  // When: the pointer recomputes from disk.
  const work = referenceDiscoveryWork(root, route);
  // Then: it never recycles the domain search or substitutes a government portal as design evidence.
  assert.equal(work.status, 'action');
  assert.equal(work.action?.lane, 'design');
  assert.equal(work.action?.kind, 'search');
  assert.equal(work.action?.input?.lane, 'design');
  assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
});

test('retained families do not skip remaining required market searches after a search was used', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  const first = referenceDiscoveryWork(root, route);
  assert.equal(first.action?.lane, 'design');
  const searchUrl = new URL('https://search.daum.net/search');
  searchUrl.searchParams.set('w', 'tot');
  searchUrl.searchParams.set('q', '복지로');
  unavailableSearch(root, { lane: 'domain', query: '복지로', url: searchUrl.href, queryParam: 'q' });
  const after = referenceDiscoveryWork(root, route);
  assert.equal(after.action?.lane, 'domain');
  assert.equal(after.action?.kind, 'search');
  assert.equal(after.action?.input?.query, '정부24 혜택알리미');
});

test('observed generic-label service links remain eligible while private links are skipped', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const input = referenceDiscoveryWork(root, route).action?.input;
  assert.ok(input);
  observedSearch(root, input, [
    { url: 'https://127.0.0.1/private', text: `${input.query} local service` },
    { url: 'https://www.welfarehello.com/recommend-policy/', text: '바로가기' },
  ]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'follow-link');
  assert.equal(work.action?.url, 'https://www.welfarehello.com/recommend-policy/');
});

test('domain discovery does not recurse into unrelated footer or pagination chains', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const rootUrl = 'https://www.bokjiro.go.kr/';
  const taskUrl = `${rootUrl}benefits`;
  directRootAt(root, 'domain', rootUrl, [taskUrl, 'https://www.facebook.com/bokjiro']);
  visitedItem(root, taskUrl, 'domain', [`${taskUrl}?page=2`]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'retain-reference');
  assert.equal(work.action?.url, taskUrl);
});

test('a signed public directory can lead to a different service family', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const service = 'https://www.welfarehello.com/recommend-policy/';
  directRootAt(root, 'domain', 'https://directory.example/', [service]);
  const work = referenceDiscoveryWork(root, route);
  assert.equal(work.action?.kind, 'follow-link');
  assert.equal(work.action?.url, service);
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

test('work-next exhausts free design search then moves across signed failed gallery roots', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (const hostname of ['www.bokjiro.go.kr', 'www.gov.kr', 'wis.seoul.go.kr']) retainDomain(root, hostname);
  for (let remaining = 20; remaining > 0; remaining -= 1) {
    const work = referenceDiscoveryWork(root, route);
    if (work.action?.kind !== 'search') break;
    assert.ok(work.action.input);
    unavailableSearch(root, work.action.input);
  }
  const direct = referenceDiscoveryWork(root, route);
  assert.equal(direct.action?.kind, 'direct-entry');
  assert.equal(direct.action?.url, 'https://mobbin.com/explore/screens');
  assert.ok(direct.action.url);
  unavailableEntry(root, 'design', direct.action.url);
  const next = referenceDiscoveryWork(root, route);
  assert.equal(next.action?.kind, 'direct-entry');
  assert.equal(next.action?.url, 'https://pageflows.com/screens/');
  assert.ok(next.attempts.some(item => item.url === direct.action?.url && item.reason === 'network-failure'));
});

test('Korean domain discovery uses verified direct service leads after search transport failures', t => {
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  for (let remaining = 5; remaining > 0; remaining -= 1) {
    const work = referenceDiscoveryWork(root, route);
    if (work.action?.kind !== 'search') break;
    assert.ok(work.action.input);
    unavailableSearch(root, work.action.input);
  }
  const direct = referenceDiscoveryWork(root, route);
  assert.equal(direct.action?.kind, 'direct-entry');
  assert.equal(direct.action?.lane, 'domain');
  assert.equal(direct.action?.url, 'https://www.bokjiro.go.kr/ssis-tbu/');
  assert.ok(direct.action.url);
  unavailableEntry(root, 'domain', direct.action.url);
  const next = referenceDiscoveryWork(root, route);
  assert.equal(next.action?.kind, 'direct-entry');
  assert.equal(next.action?.url, 'https://plus.gov.kr/portal/benefitV2/');
  assert.notEqual(next.workSha256, direct.workSha256);
});

test('unscoped route still begins a plan-derived public domain search', t => {
  const root = fixture(t);
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  const work = referenceDiscoveryWork(root, routeAdaptiveFlow(input));
  assert.equal(work.status, 'action');
  assert.equal(work.action?.kind, 'search');
  assert.equal(work.action?.lane, 'domain');
  assert.match(work.action?.input?.url ?? '', /^https:\/\/www\.bing\.com\/search\?q=/u);
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

test('admitted independent design sources lead to board publication rather than schema repetition', t => {
  const fixture = designAdmissionFixture(t);
  fixture.addSecondDesignDirection();
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  const work = referenceDiscoveryWork(fixture.root, routeAdaptiveFlow(input));
  assert.equal(work.status, 'ready');
  assert.equal(work.action?.kind, 'publish-board');
  assert.equal(work.next, 'omd ref board --input <candidate-assemblies.json>');
});
