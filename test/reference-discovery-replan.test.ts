import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildReferenceDiscoveryPlan, type ReferenceDiscoveryPlan } from '../core/ref/discovery-plan.ts';
// Explicit legacy catalogue recovery remains supported; recorded browsing owns the default bounded loop.
import { legacyReferenceDiscoveryWork as referenceDiscoveryWork } from '../core/ref/discovery-work.ts';
import { routeAdaptiveFlow } from '../core/route/index.ts';
import { fixture, routeInput, unavailableEntry, unavailableSearch } from './helpers/discovery-work.ts';

function failStaticLane(root: string, plan: ReferenceDiscoveryPlan, lane: 'domain' | 'design'): void {
  const searches = lane === 'domain' ? plan.marketReferencePolicy.domainSearchInputs : plan.designSourcePolicy.nativeSearchInputs;
  for (const input of searches) unavailableSearch(root, input);
  const entries = lane === 'domain' ? plan.marketReferencePolicy.domainEntryInputs : plan.designSourcePolicy.nativeEntryInputs;
  for (const input of entries) unavailableEntry(root, lane, input.url);
}

test('depleted priority domain discovery expands without repeating failed static inputs', t => {
  // Given: every initial domain search and service entry has a signed failure.
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const plan = buildReferenceDiscoveryPlan(root, route);
  failStaticLane(root, plan, 'domain');
  // When: the next owner action is computed with both lanes still incomplete.
  const work = referenceDiscoveryWork(root, route);
  // Then: the legacy planner expands the depleted lane without repeating a failed static input.
  assert.equal(work.status, 'action');
  assert.equal(work.action?.kind, 'search');
  assert.equal(work.action?.lane, 'domain');
  assert.notEqual(work.action?.input?.url, plan.marketReferencePolicy.domainSearchInputs[0]?.url);
  assert.deepEqual([work.progress.domainFamilies, work.progress.designFamilies], [0, 0]);
});
test('depleted static lanes expand to a fresh market-qualified public search', t => {
  // Given: static queries and direct roots have all failed in both research lanes.
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const plan = buildReferenceDiscoveryPlan(root, route);
  failStaticLane(root, plan, 'domain');
  failStaticLane(root, plan, 'design');
  const initialUrls = new Set([...plan.marketReferencePolicy.domainSearchInputs,
    ...plan.designSourcePolicy.nativeSearchInputs].map(input => input.url));
  // When: acquisition selects another reachable avenue instead of asking for completion.
  const work = referenceDiscoveryWork(root, route);
  // Then: the new public query preserves the requested market and has not already failed.
  assert.equal(work.status, 'action');
  assert.equal(work.action?.kind, 'search');
  assert.ok(work.action?.input);
  assert.equal(initialUrls.has(work.action.input.url), false);
  assert.ok(work.action.input.query.length > 0);
  assert.ok(['www.bing.com', 'duckduckgo.com', 'www.google.com', 'search.daum.net'].includes(new URL(work.action.input.url).hostname));
  assert.equal(existsSync(join(root, '.omd/reference-board.json')), false);
});

test('depleted static lanes can request owner-authored recovery without inventing evidence', t => {
  // Given: static routes failed and subsequent domain expansion also has native failure receipts.
  const root = fixture(t);
  const route = routeAdaptiveFlow(routeInput());
  const plan = buildReferenceDiscoveryPlan(root, route);
  failStaticLane(root, plan, 'domain');
  failStaticLane(root, plan, 'design');
  for (let remaining = 32; remaining > 0; remaining -= 1) {
    const action = referenceDiscoveryWork(root, route).action;
    if (action?.kind !== 'search' || action.lane !== 'domain') break;
    assert.ok(action.input);
    unavailableSearch(root, action.input);
  }
  // When: the planner has no supported static acquisition left.
  const work = referenceDiscoveryWork(root, route);
  // Then: it requests explicit recovery rather than treating empty acquisition as evidence.
  assert.equal(work.action?.kind, 'replan-discovery');
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
    if (action?.kind === 'search') {
      assert.ok(action.input);
      assert.equal(seen.has(`${action.lane}:${action.input.url}`), false, 'failed requests cannot masquerade as fresh acquisition');
      seen.add(`${action.lane}:${action.input.url}`);
      unavailableSearch(root, action.input);
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
