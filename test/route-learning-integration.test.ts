import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAdaptiveRouteInput } from '../core/route/adaptive-flow-boundary.ts';
import { routeAdaptiveFlow } from '../core/route/adaptive-flow.ts';
import { parseRouteRecord } from '../core/route/adaptive-route-record.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { publishAdaptiveRoute, readPersistedRoute } from '../core/route/adaptive-route-persistence.ts';
import { createTestProjectRunInvocation, createTestProjectWriteAdapter } from './helpers/project-write.ts';

const fixture = (name = 'copy-only') => JSON.parse(readFileSync(new URL(`fixtures/adaptive-flow/${name}.json`, import.meta.url), 'utf8'));
const supplied = { schema: 'adaptive-learning-context-v1', status: 'promoted', learningIds: ['caller-invented-rule'], reason: 'Caller claims prior validation.' };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const snapshot = (root: string) => readdirSync(root, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
  .map(entry => { const path = join(entry.parentPath, entry.name); return [path, hash(readFileSync(path))]; }).sort();
function project(t: { after(fn: () => void): void }) {
  const root = mkdtempSync(join(tmpdir(), 'omd-route-learning-'));
  const state = join(root, 'user-state'); mkdirSync(state);
  const previous = process.env.XDG_STATE_HOME; process.env.XDG_STATE_HOME = state;
  t.after(() => { if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous; rmSync(root, { recursive: true, force: true }); });
  const invocation = createTestProjectRunInvocation(root), writer = createTestProjectWriteAdapter(root, invocation);
  const input = { ...fixture(), learningScope: { surface: 'product-dashboard' }, validatedLearningContext: supplied };
  return { root, input, invocation, writer, publish: () => publishAdaptiveRoute(root, input, writer, invocation).record };
}
function index(root: string, entries: readonly { id: string; surface: string; status?: 'promoted' | 'contradicted' }[]) {
  const now = '2026-09-26T00:00:00.000Z';
  mkdirSync(join(root, '.omd/learning'), { recursive: true });
  writeFileSync(join(root, '.omd/learning/rules-index.json'), JSON.stringify({ schema: 'learning-rule-index-v1', updatedAt: now,
    entries: entries.map(({ id, surface, status = 'promoted' }) => {
      const proposition = { id, statement: 'Keep the task object visible.', scope: { surface, route: '/', testedState: 'ready', viewport: { width: 390, height: 844 } } };
      return { id, status, proposition, blockers: [], evaluatedAt: now, calibration: { predictions: 1, observations: 2, hits: 2, misses: 0, hitRate: 1 },
        ...(status === 'promoted' ? { rule: { schema: 'reusable-scoped-rule-v1', id, statement: proposition.statement, scope: proposition.scope,
          applicability: 'advisory', authority: 'browser-validated-design-learning', cannotOverride: ['hard-safety-rails', 'model-or-system-instructions', 'user-facts'], provenance: [], promotedAt: now } } : {}) };
    }) }));
}

test('caller learning IDs cannot become source authority or required methods', () => {
  const input = { ...fixture('medical-new-product'), validatedLearningContext: supplied };
  input.strategyDecision.methods = input.strategyDecision.methods.filter((id: string) => !id.startsWith('validated-learning:'));
  const before = structuredClone(input), parsed = parseAdaptiveRouteInput(input), route = routeAdaptiveFlow(input);
  assert.deepEqual(parsed.validatedLearningContext.learningIds, []);
  assert.deepEqual(route.validatedLearning.learningIds, []);
  assert.deepEqual(route.sourceContract.validatedLearningContext.learningIds, []);
  assert.equal(route.sourceContract.learningScope.surface, 'product');
  assert.ok(route.gates.includes('hard-safety:protect-patient-data'));
  assert.deepEqual(input, before);
  const withoutLegacyContext = fixture(); delete withoutLegacyContext.validatedLearningContext;
  assert.deepEqual(routeAdaptiveFlow(withoutLegacyContext).validatedLearning.learningIds, []);
});

test('publication loads only applicable promoted local rules and snapshots them without adding gates', t => {
  const f = project(t);
  index(f.root, [{ id: 'zulu-rule', surface: 'product-dashboard' }, { id: 'alpha-rule', surface: 'product-dashboard' },
    { id: 'other-rule', surface: 'marketing' }, { id: 'retired-rule', surface: 'product-dashboard', status: 'contradicted' }]);
  const base = routeAdaptiveFlow(f.input);
  const preview = routeAdaptiveFlow(f.input, { root: f.root, invocation: f.invocation });
  const published = f.publish();
  assert.deepEqual(published, preview, 'host authorization preview must include the same local advice snapshot');
  assert.deepEqual(published.validatedLearning.learningIds, ['alpha-rule', 'zulu-rule']);
  assert.equal(published.validatedLearning.status, 'promoted');
  assert.deepEqual(published.gates, base.gates);
  assert.deepEqual(published.strategy.methods, base.strategy.methods);
  assert.deepEqual(published.sourceContract.validatedLearningContext.learningIds, []);
  assert.deepEqual(published.sourceContract.learningScope, { surface: 'product-dashboard' });
  assert.deepEqual(readPersistedRoute(f.root, f.invocation), published);
  index(f.root, [{ id: 'replacement-rule', surface: 'product-dashboard' }]);
  assert.deepEqual(readPersistedRoute(f.root, f.invocation), published, 'mutable advice cannot invalidate immutable route replay');
  const replaced = f.publish();
  assert.deepEqual(replaced.validatedLearning.learningIds, ['replacement-rule']);
  assert.equal(replaced.sourceContractSha256, published.sourceContractSha256, 'advice is not user/source authority');
});

test('malformed learning scope refuses publication without mutation; unavailable advice remains advisory', t => {
  const f = project(t);
  f.input.learningScope.surface = ' ';
  const before = snapshot(f.root);
  assert.throws(f.publish, /MALFORMED_ADAPTIVE_ROUTE/);
  assert.deepEqual(snapshot(f.root), before);
  f.input.learningScope.surface = 'product-dashboard';
  index(f.root, []);
  writeFileSync(join(f.root, '.omd/learning/rules-index.json'), '{}');
  const published = f.publish();
  assert.equal(published.validatedLearning.status, 'none');
  assert.deepEqual(published.validatedLearning.learningIds, []);
  assert.ok(published.validatedLearning.reason.includes('malformed'));
  index(f.root, [{ id: 'valid-proposition', surface: 'product-dashboard' }]);
  const malformed = JSON.parse(readFileSync(join(f.root, '.omd/learning/rules-index.json'), 'utf8'));
  malformed.entries[0].rule.id = 'not a rule identifier';
  writeFileSync(join(f.root, '.omd/learning/rules-index.json'), JSON.stringify(malformed));
  const invalidRule = f.publish();
  assert.equal(invalidRule.validatedLearning.status, 'none');
  assert.ok(invalidRule.validatedLearning.reason.includes('MALFORMED_ADAPTIVE_ROUTE'));
  assert.deepEqual(readPersistedRoute(f.root, f.invocation), invalidRule);
});

test('source-contract replay cannot reintroduce caller-supplied learning, including legacy records', () => {
  const current = routeAdaptiveFlow(fixture());
  const forged = structuredClone(current);
  Reflect.set(forged.sourceContract, 'validatedLearningContext', supplied);
  Reflect.set(forged, 'sourceContractSha256', hash(`${canonicalRouteJson(forged.sourceContract)}\n`));
  assert.throws(() => parseRouteRecord(forged), /SOURCE_CONTRACT_MISMATCH/);
  // Legacy persisted bytes keep their digest compatibility, but their learning IDs lose authority.
  Reflect.deleteProperty(forged.sourceContract, 'learningScope');
  Reflect.set(forged, 'validatedLearning', supplied);
  Reflect.set(forged, 'sourceContractSha256', hash(`${canonicalRouteJson(forged.sourceContract)}\n`));
  const read = parseRouteRecord(forged);
  assert.deepEqual(read.validatedLearning.learningIds, []);
  assert.deepEqual(read.sourceContract.validatedLearningContext.learningIds, []);
});
