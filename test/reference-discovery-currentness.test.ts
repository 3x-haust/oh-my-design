import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { canonicalJson, sha256 } from '../core/ref/board-artifacts.ts';
import { buildReferenceDiscoveryPlan } from '../core/ref/discovery-plan.ts';
import { referenceDiscoveryWork } from '../core/ref/discovery-work.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';

function input() {
  const value = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/medical-new-product.json', import.meta.url), 'utf8'));
  value.request = '한국어로 복지 혜택을 찾고 신청을 준비하는 서비스를 만든다.';
  value.taskOutcome.goal = '복지 혜택을 찾아 신청을 준비한다.';
  return value;
}
function fixture(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'omd-discovery-currentness-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd'));
  const pointer = join(root, '.omd/route.json');
  writeFileSync(pointer, '{}');
  const publication = Date.now() - 60_000;
  utimesSync(pointer, new Date(publication), new Date(publication));
  return { root, pointer, publication };
}
function signedRecord(root: string, directory: string, prefix: string,
  unsigned: Readonly<Record<string, unknown>>): void {
  const schema = unsigned['schema'];
  if (typeof schema !== 'string') throw new Error('test schema is missing');
  const record = { ...unsigned, signature: signNativeObservation(root, schema, sha256(canonicalJson(unsigned))) };
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const path = join(root, directory);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, `${prefix}${sha256(bytes)}.json`), bytes);
}
function failedSearch(root: string, request: { lane: 'domain' | 'design'; query: string; url: string; queryParam: string }, at: number): void {
  if (request.lane !== 'domain') throw new Error('test expected domain input');
  signedRecord(root, '.omd/discovery/domain', 'search-', {
    schema: 'reference-search-execution-v2', lane: request.lane, query: request.query,
    queryParam: request.queryParam, requestedUrl: request.url, finalUrl: null,
    provider: new URL(request.url).hostname, observedAt: new Date(at).toISOString(),
    status: 'navigation-error', httpStatus: null, links: [], results: [], capture: null,
    error: 'network failure', limitations: 'observed-links-not-ranked-results; no-clicks; no-authentication; not-provider-attested',
  });
}
function failedEntry(root: string, url: string, at: number): void {
  signedRecord(root, '.omd/discovery/domain/attempts', '', {
    schema: 'reference-discovery-attempt-v1', source: url, researchLane: 'domain',
    method: 'direct-public', entry: 'public-directory', capturedAt: new Date(at).toISOString(),
    httpStatus: null, outcome: 'unavailable', reason: 'network-failure',
  });
}

test('a republished route rejects an earlier signed search failure even when the query URL is unchanged', t => {
  const { root, pointer, publication } = fixture(t);
  const first = referenceDiscoveryWork(root, routeAdaptiveFlow(input()));
  assert.ok(first.action?.input);
  failedSearch(root, first.action.input, publication + 500);
  assert.notEqual(referenceDiscoveryWork(root, routeAdaptiveFlow(input())).action?.input?.url, first.action.input.url);
  const changed = input(); changed.request = '한국어 복지 혜택 신청 준비를 새로 설계한다.';
  utimesSync(pointer, new Date(publication + 750), new Date(publication + 750));
  const resumed = referenceDiscoveryWork(root, routeAdaptiveFlow(changed));
  assert.equal(resumed.action?.input?.url, first.action.input.url);
  assert.deepEqual(resumed.attempts, []);
});

test('a republished route rejects an earlier signed direct-entry failure after new searches', t => {
  const { root, pointer, publication } = fixture(t);
  const firstRoute = routeAdaptiveFlow(input());
  const searches = buildReferenceDiscoveryPlan(root, firstRoute).marketReferencePolicy.domainSearchInputs;
  for (const search of searches) failedSearch(root, search, publication + 100);
  const direct = referenceDiscoveryWork(root, firstRoute);
  assert.equal(direct.action?.kind, 'direct-entry');
  assert.ok(direct.action.url);
  failedEntry(root, direct.action.url, publication + 500);
  assert.notEqual(referenceDiscoveryWork(root, firstRoute).action?.url, direct.action.url);

  const changed = input(); changed.request = '한국어 복지 혜택 신청 준비를 새로 설계한다.';
  utimesSync(pointer, new Date(publication + 750), new Date(publication + 750));
  for (const search of searches) failedSearch(root, search, publication + 800);
  const resumed = referenceDiscoveryWork(root, routeAdaptiveFlow(changed));
  assert.equal(resumed.action?.kind, 'direct-entry');
  assert.equal(resumed.action?.url, direct.action.url);
  assert.deepEqual(resumed.attempts.map(attempt => attempt.url).filter(url => url === direct.action?.url), []);
});
