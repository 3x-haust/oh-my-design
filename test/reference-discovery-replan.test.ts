import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildReferenceDiscoveryPlan, type ReferenceDiscoveryPlan } from '../core/ref/discovery-plan.ts';
import { referenceDiscoveryWork } from '../core/ref/discovery-work.ts';
import { publishSearchLeads } from '../core/ref/search-leads.ts';
import { createTestProjectWriteAdapter } from './helpers/project-write.ts';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { fixture, routeInput, unavailableEntry, unavailableSearch } from './helpers/discovery-work.ts';

function registerEmptyLead(root: string, routeSha: string, lane: 'domain' | 'design', query: string): void {
  publishSearchLeads(createTestProjectWriteAdapter(root), routeSha, {
    schema: 'reference-search-leads-v1', lane, query, urls: [], provider: 'host', tool: 'web_search', observedAt: new Date().toISOString(),
  });
}
function failStaticLane(root: string, plan: ReferenceDiscoveryPlan, lane: 'domain' | 'design', routeSha: string): void {
  const searches = lane === 'domain' ? plan.marketReferencePolicy.domainSearchInputs : plan.designSourcePolicy.nativeSearchInputs;
  for (const input of searches) { unavailableSearch(root, input); registerEmptyLead(root, routeSha, lane, input.query); }
  const entries = lane === 'domain' ? plan.marketReferencePolicy.domainEntryInputs : plan.designSourcePolicy.nativeEntryInputs;
  for (const input of entries) unavailableEntry(root, lane, input.url);
}

test('depleted priority domain discovery does not starve untouched design work', t => {
  // Given: every initial domain search and service entry has a signed failure.
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const plan = buildReferenceDiscoveryPlan(root, route);
  failStaticLane(root, plan, 'domain', route.sourceContractSha256);
  // When: the next owner action is computed with both lanes still incomplete.
  const work = referenceDiscoveryWork(root, route);
  // Then: the existing design plan runs before terminal failure or domain expansion.
  assert.equal(work.status, 'action');
  assert.equal(work.action?.kind, 'collect-leads');
  assert.ok(work.action?.lane === 'domain' || work.action?.lane === 'design');
  assert.ok(work.action?.input?.url);
  assert.deepEqual([work.progress.domainFamilies, work.progress.designFamilies], [0, 0]);
});

test('depleted static lanes expand to a fresh market-qualified public search', t => {
  // Given: static queries and direct roots have all failed in both research lanes.
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const plan = buildReferenceDiscoveryPlan(root, route);
  failStaticLane(root, plan, 'domain', route.sourceContractSha256);
  failStaticLane(root, plan, 'design', route.sourceContractSha256);
  const initialUrls = new Set([...plan.marketReferencePolicy.domainSearchInputs,
    ...plan.designSourcePolicy.nativeSearchInputs].map(input => input.url));
  // When: acquisition selects another reachable avenue instead of asking for completion.
  const work = referenceDiscoveryWork(root, route);
  // Then: the new public query preserves the requested market and has not already failed.
  assert.equal(work.status, 'action');
  assert.equal(work.action?.kind, 'collect-leads');
  assert.ok(work.action?.input);
  assert.equal(initialUrls.has(work.action.input.url), false);
  assert.ok(work.action.input.query.length > 0);
  assert.ok(['www.bing.com', 'duckduckgo.com', 'www.google.com', 'search.daum.net'].includes(new URL(work.action.input.url).hostname));
  assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
});

test('design expansion uses public gallery-item queries when direct galleries and domain leads fail', t => {
  // Given: static routes failed and subsequent domain expansion also has native failure receipts.
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const plan = buildReferenceDiscoveryPlan(root, route);
  failStaticLane(root, plan, 'domain', route.sourceContractSha256);
  failStaticLane(root, plan, 'design', route.sourceContractSha256);
  for (let remaining = 32; remaining > 0; remaining -= 1) {
    const action = referenceDiscoveryWork(root, route).action;
    if (action?.kind !== 'collect-leads' || action.lane !== 'domain') break;
    assert.ok(action.input);
    registerEmptyLead(root, route.sourceContractSha256, 'domain', action.input.query);
  }
  // When: the planner expands the remaining design lane.
  const work = referenceDiscoveryWork(root, route);
  // Then: a public search engine finds concrete gallery items without losing Korean scope.
  assert.equal(work.action?.kind, 'collect-leads');
  assert.equal(work.action?.lane, 'design');
  assert.ok(work.action?.input);
  assert.match(work.action.input.query, /\bsite:/u);
  assert.ok(work.action.input.query.length > 0);
  assert.ok(['www.bing.com', 'duckduckgo.com', 'www.google.com', 'search.daum.net'].includes(new URL(work.action.input.url).hostname));
  assert.equal(work.progress.designFamilies, 0);
});

test('all built-in leads failing yields novel owner research rather than terminal exhaustion', t => {
  // Given: acquisition reports a real signed failure for every selected built-in action.
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const seen = new Set<string>();
  for (let remaining = 160; remaining > 0; remaining -= 1) {
    const work = referenceDiscoveryWork(root, route);
    const action = work.action;
    if (action?.kind === 'collect-leads') {
      assert.ok(action.input);
      assert.equal(seen.has(`${action.lane}:${action.input.query}`), false, 'empty searches cannot masquerade as fresh acquisition');
      seen.add(`${action.lane}:${action.input.query}`);
      registerEmptyLead(root, route.sourceContractSha256, action.input.lane, action.input.query);
    } else if (action?.kind === 'direct-entry') {
      assert.ok(action.url);
      assert.ok(action.lane);
      assert.equal(seen.has(`${action.lane}:${action.url}`), false);
      seen.add(`${action.lane}:${action.url}`);
      unavailableEntry(root, action.lane, action.url);
    } else break;
  }
  // When: no built-in lead remains, including expanded task-specific searches.
  const work = referenceDiscoveryWork(root, route);
  // Then: owner-authored novel acquisition is required; empty evidence never becomes a board.
  assert.equal(work.status, 'action');
  assert.equal(work.action?.kind, 'replan-discovery');
  assert.deepEqual(work.action?.args, ['ref', 'discover-batch', '--input',
    '.omd/.cache/reference-recovery-batch.json', '--recovery', '--json']);
  assert.equal(work.code, null);
  assert.deepEqual([work.progress.domainFamilies, work.progress.designFamilies], [0, 0]);
  assert.equal(existsSync(join(root, '.omd/refs')), false);
  assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
  assert.equal(referenceDiscoveryWork(root, route).workSha256, work.workSha256);
});
