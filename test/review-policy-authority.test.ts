import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, realpathSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReviewPolicy, assertReviewQuorum, deriveReviewPolicy } from '../core/measure/review-policy.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { createAdaptiveSourceSealRoute } from '../core/source-seal/adaptive-inputs.ts';
import { validateSourceSeal, writeSourceSeal } from '../core/source-seal/index.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { digest, sha256 } from '../core/measure/identity.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';

function fixture(t: { after(fn: () => void): void }, purpose?: 'ordinary' | 'benchmark' | 'release') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-purpose-policy-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd'), { recursive: true }); writeFileSync(join(root, '.omd/copy-deck.md'), '# Approved copy\n');
  const input = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url), 'utf8'));
  let originPath: string | undefined;
  if (purpose) {
    input.reviewPurpose = purpose;
    const payload = { schema: 'review-purpose-origin-v1', projectRoot: root, purpose, requestSha256: sha256(input.request), source: 'host-user-input', observedAt: '2026-09-27T00:00:00Z' };
    const value = { ...payload, signature: signNativeObservation(root, payload.schema, sha256(canonicalRouteJson(payload))) };
    const bytes = Buffer.from(`${canonicalRouteJson(value)}\n`), sha = sha256(bytes);
    originPath = `.omd/review-purpose-authorities/sha256-${sha}.json`;
    mkdirSync(join(root, '.omd/review-purpose-authorities'), { recursive: true }); writeFileSync(join(root, originPath), bytes);
    input.reviewPurposeAuthority = { path: originPath, sha256: sha };
  }
  const invocation = publishTestAdaptiveRoute(root, input);
  writeSourceSeal(root, invocation);
  return { root, invocation, originPath, route: readPersistedRoute(root, invocation) };
}
test('purpose authority selects exact quorum; absent purpose keeps legacy 2+2+2', t => {
  const legacy = fixture(t), ordinary = fixture(t, 'ordinary'), benchmark = fixture(t, 'benchmark'), release = fixture(t, 'release');
  assert.deepEqual(loadReviewPolicy(legacy.root, legacy.invocation).lanes, { blind: 2, fidelity: 2, protocol: 2 });
  const policy = loadReviewPolicy(ordinary.root, ordinary.invocation);
  assert.deepEqual(policy.lanes, { blind: 1, fidelity: 0, protocol: 0 });
  for (const f of [benchmark, release]) assert.deepEqual(loadReviewPolicy(f.root, f.invocation).lanes, { blind: 2, fidelity: 2, protocol: 2 });
  const high = deriveReviewPolicy({ ...ordinary.route, sourceContract: { ...ordinary.route.sourceContract, designAxes: { ...ordinary.route.sourceContract.designAxes, failureRisk: 'high' } } }, policy.routeSha256);
  assert.deepEqual(high.lanes, { blind: 2, fidelity: 1, protocol: 0 });
  const execution = { processPid: 12, sessionId: 'review', nonce: 'nonce', packetSha256: 'a'.repeat(64), reviewPolicySha256: digest(policy) };
  assert.doesNotThrow(() => assertReviewQuorum(policy, [{ lane: 'blind', executions: [execution] }]));
  assert.throws(() => assertReviewQuorum(policy, [{ lane: 'blind', executions: [execution] }, { lane: 'protocol', executions: [] }]), /must be absent/);
});
test('current policy and read-only source-seal continuation reject altered signed purpose origins', t => {
  const f = fixture(t, 'release'), route = createAdaptiveSourceSealRoute(f.root, f.invocation);
  assert.deepEqual(validateSourceSeal(f.root, undefined, route), []);
  const before = readFileSync(join(f.root, '.omd/source-seal.json'));
  const value = JSON.parse(readFileSync(join(f.root, f.originPath!), 'utf8')); value.purpose = 'ordinary';
  writeFileSync(join(f.root, f.originPath!), `${canonicalRouteJson(value)}\n`);
  assert.throws(() => loadReviewPolicy(f.root, f.invocation), /purpose origin bytes changed|ROUTE_AUTHORITY_REQUIRED/);
  assert.ok(validateSourceSeal(f.root, undefined, route).some(f => f.id === 'SOURCE-SEAL-STALE'));
  assert.deepEqual(readFileSync(join(f.root, '.omd/source-seal.json')), before);
});
