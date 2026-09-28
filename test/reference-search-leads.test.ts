import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ProjectWriteAdapter } from '../core/runtime/project-write.ts';
import { fetchSearchLeads, parseSearchLeadsInput, publishSearchLeads, readSearchLeads } from '../core/ref/search-leads.ts';
import { providerCircuitSummaries } from '../core/ref/provider-circuit.ts';
import { extractDuckDuckGoLeadUrls, extractBingLeadUrls, parseLeadQuery } from '../core/ref/search-leads-fetch.ts';
import { readCurrentReferenceDiscoveryEvidence, type LaneEvidence } from '../core/ref/discovery-evidence.ts';
import { publishFailedAttempt } from '../core/ref/navigation-capture.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { parseMarketReferenceCoverage } from '../core/ref/market-reference-coverage-contract.ts';
import { executeUserBrowserSearch, readSearchExecution } from '../core/ref/search-execution.ts';
import { testPng } from './helpers/search-execution.ts';
import type { UserBrowserDriver } from '../core/browser/contracts.ts';

const route = 'a'.repeat(64);
const input = { schema: 'reference-search-leads-v1', lane: 'domain', query: 'Korean benefits',
  urls: ['https://example.com/benefits'], provider: 'host-reported', tool: 'web_search', observedAt: new Date().toISOString() } as const;

test('rendered Google organic results in the user browser produce a signed, integrity-checked search receipt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-google-search-'));
  const query = 'benefits'; const url = `https://www.google.com/search?q=${query}`;
  const png = testPng(); let stopped = 0; let navigated = 0;
  const driver = { userBrowserBridgeDoctor: async () => ({ ready: true, cli: { installed: true }, daemon: { running: true },
    identification: { needsChoice: false, candidates: [], defaultBrowser: null }, primary: null, browsers: [] }),
    userBrowserBridgeOnboard: async () => ({ ready: true }), connectUserBrowserSession: async () => ({
    resize: async () => {}, navigate: async () => { navigated++; },
    evaluate: async (expression: string) => ({ ok: true, value: expression.includes('location.href')
      ? url : { body: 'Search results', results: [{ url: 'https://example.com/benefits', text: 'Benefits finder service' }] } }),
    screenshot: async () => ({ buffer: png, width: 1280, height: 900, format: 'png' }),
    requestHelp: async () => ({ outcome: 'cancelled' as const }), stop: async () => { stopped++; },
  }) } as UserBrowserDriver;
  try {
    const receipt = await executeUserBrowserSearch({ lane: 'domain', query, url, queryParam: 'q' },
      createTestProjectWriteAdapter(root), { driver, lookup: async () => [{ address: '142.250.1.1', family: 4 }] });
    const observed = readSearchExecution(root, receipt, 'domain');
    assert.equal(observed.schema, 'reference-search-execution-v4');
    assert.equal(observed.httpStatus, null);
    assert.equal(observed.status, 'page-observed');
    assert.deepEqual(observed.results, [{ url: 'https://example.com/benefits', text: 'Benefits finder service' }]);
    assert.equal(navigated, 1); assert.equal(stopped, 1);
    const bytes = readFileSync(join(root, receipt.path), 'utf8');
    writeFileSync(join(root, receipt.path), bytes.replace('Benefits finder service', 'Invented service result'));
    assert.throws(() => readSearchExecution(root, receipt, 'domain'), /REFERENCE_SEARCH/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('caller-reported leads are route-bound, unsigned, and never destination evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-leads-'));
  try {
    const writer = { projectRoot: root, writeContentAddressed(path: string, bytes: string) {
      const full = join(root, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, bytes); return full;
    } } as ProjectWriteAdapter;
    const receipt = publishSearchLeads(writer, route, input);
    assert.equal(readSearchLeads(root, receipt, 'domain', route).urls[0], input.urls[0]);
    assert.equal(fetchSearchLeads(root, 'domain', route).length, 1);
    assert.equal(fetchSearchLeads(root, 'domain', 'b'.repeat(64)).length, 0);
    assert.equal(JSON.parse(readFileSync(join(root, receipt.path), 'utf8')).signature, undefined);
    assert.throws(() => readSearchLeads(root, receipt, 'design', route), /REFERENCE_SEARCH_LEADS_INVALID/);
    writeFileSync(join(root, receipt.path), '{}');
    assert.throws(() => readSearchLeads(root, receipt, 'domain', route), /REFERENCE_SEARCH_LEADS_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unsafe or invented lead fields refuse without publication', () => {
  assert.throws(() => parseSearchLeadsInput({ ...input, urls: ['https://127.0.0.1/'] }), /REFERENCE_SEARCH_LEADS_INVALID/);
  assert.throws(() => parseSearchLeadsInput({ ...input, signed: true }), /REFERENCE_SEARCH_LEADS_INVALID/);
  assert.throws(() => parseSearchLeadsInput({ ...input, urls: [input.urls[0], input.urls[0]] }), /REFERENCE_SEARCH_LEADS_INVALID/);
});

test('HTTP fallback extracts only result anchors and public redirect destinations', () => {
  assert.deepEqual(extractDuckDuckGoLeadUrls(`<a class="header" href="https://bad.example/">header</a>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fservice&amp;rut=1">service</a>
    <a class="result__a" href="https://127.0.0.1/private">private</a>`), ['https://example.com/service']);
  assert.deepEqual(extractBingLeadUrls('<li class="b_algo"><h2><a href="https://example.com/service">service</a></h2></li><li class="b_algo"><h2><a href="https://127.0.0.1/private">private</a></h2></li>'), ['https://example.com/service']);
  assert.deepEqual(parseLeadQuery({ lane: 'domain', query: ' service ' }), { lane: 'domain', query: 'service' });
  assert.throws(() => parseLeadQuery({ lane: 'domain', query: 'service', url: 'https://localhost' }), /REFERENCE_SEARCH_UNAVAILABLE/);
});

test('market-observed-page is additive for v8; historical contracts cannot acquire that basis', () => {
  const source = { id: 'one', url: 'https://example.com/', evidence: { sha256: 'a'.repeat(64) } };
  const lane = { localSources: [{ sourceId: 'one', evidenceSha256: source.evidence.sha256, scope: 'service',
    basis: 'market-observed-page', provenanceReceiptSha256: 'b'.repeat(64) }], globalFallback: null };
  const design = { localSources: [{ ...lane.localSources[0], scope: 'product' }], globalFallback: null };
  const value = { marketRegion: 'KR', domain: lane, design };
  assert.throws(() => parseMarketReferenceCoverage(value, [source], [source]), /LOCAL_BASIS/);
  assert.equal(parseMarketReferenceCoverage(value, [source], [source], true)?.domain.localSources[0]?.basis, 'market-observed-page');
});

test('the circuit reads signed post-solve challenge failures and ignores unsigned fake attempts', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-circuit-'));
  try {
    const writer = createTestProjectWriteAdapter(root);
    publishFailedAttempt(writer, 'https://wwit.design/', 'design', 'free-gallery', 403, new Error('challenge page remained blocked'));
    assert.deepEqual(providerCircuitSummaries(readCurrentReferenceDiscoveryEvidence(root).design), []);
    publishFailedAttempt(writer, 'https://wwit.design/2025/01/01/product/', 'design', undefined, 403, new Error('challenge page remained blocked'));
    assert.equal(providerCircuitSummaries(readCurrentReferenceDiscoveryEvidence(root).design)[0]?.provider, 'WWIT');
    const fake = join(root, '.omd/discovery/design/attempts', `${'f'.repeat(64)}.json`);
    writeFileSync(fake, '{"reason":"challenge-page"}');
    assert.equal(providerCircuitSummaries(readCurrentReferenceDiscoveryEvidence(root).design).length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('two signed unavailable acquisitions open a gallery-family circuit; success resets a pre-trip streak', () => {
  const attempt = (source: string, capturedAt: string) => ({ source, capturedAt, reason: 'challenge-page' as const,
    schema: 'reference-discovery-attempt-v1' as const, researchLane: 'design' as const, method: 'navigation' as const,
    entry: null, outcome: 'unavailable' as const, httpStatus: null, signature: 'signed' });
  const one = attempt('https://wwit.design/', '2026-09-28T00:00:00.000Z');
  const two = attempt('https://wwit.design/2025/01/01/product/', '2026-09-28T00:02:00.000Z');
  const receipt = (id: string) => ({ path: id, sha256: id.padEnd(64, '0') });
  const evidence = { attemptReceipts: [{ attempt: one, receipt: receipt('1') }, { attempt: two, receipt: receipt('2') }],
    entries: [], visits: [] } as unknown as LaneEvidence;
  const open = providerCircuitSummaries(evidence);
  assert.equal(open.length, 1);
  assert.equal(open[0]?.provider, 'WWIT');
  assert.deepEqual(open[0]?.receipts.map(item => item.path), ['1', '2']);
  const reset = { ...evidence, entries: [{ receipt: receipt('ok'), sha256: 'ok', observation: {
    url: one.source, finalUrl: one.source, links: [], capturedAt: '2026-09-28T00:01:00.000Z' } }] } as LaneEvidence;
  assert.deepEqual(providerCircuitSummaries(reset), []);
});
