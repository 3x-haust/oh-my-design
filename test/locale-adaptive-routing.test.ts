import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AdaptiveRouteError,
  adaptiveRouteAuthorityBytes,
  adaptiveRouteRecordSha256,
  publishAdaptiveRoute,
  readPersistedRoute,
  routeAdaptiveFlow,
} from '../core/route/index.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { routeLocaleDesignContext } from '../core/locale/design-context.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectRunInvocation,
  createTestProjectWriteAdapter,
} from './helpers/project-write.ts';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`fixtures/adaptive-flow/${name}.json`, import.meta.url), 'utf8'));
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const context = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ja-JP',
  marketRegion: 'JP', audience: 'Adults comparing a public mission archive',
  domain: 'public lunar mission archive', surface: 'product', desiredFit: 'market-grounded',
  brandInvariants: ['Mission facts do not change across locales'], ...overrides,
});

test('no-context routes retain canonical bytes without injecting locale context', () => {
  // Intentional craft-policy revision: the semantic/visual checkpoint labels now end in
  // render-decision. Replacing those two labels with render-change reproduces both prior hashes.
  // These remain fixed snapshots; historical route files are never rewritten.
  //
  // Re-snapshotted when `domain` became a mandatory stage: the strategy now selects it on every
  // route, so each canonical record gained that stage and its skip entry was removed. The bytes and
  // hashes below are the post-change values, still fixed rather than computed.
  // Re-snapshotted when `moodboard` joined the optional stages: every route now selects it or
  // records a skip reason, so each canonical record gained one skip entry.
  // Re-snapshotted when discovery routes gained the explicit dual-reference-research gate.
  for (const [name, expectedHash, expectedBytes] of [
    ['copy-only', 'd42ebf8debddf7528f9b0561473bea976ac12e60c8d8883cb9430e01ae303329', 16346],
    ['synth-marketing', 'a3b8b62308c25b377a7e3512a20eda1f250192af3c2f8bbc5b5517c7608ce813', 16974],
  ] as const) {
    const bytes = `${canonicalRouteJson(routeAdaptiveFlow(fixture(name)))}\n`;
    assert.equal(Buffer.byteLength(bytes), expectedBytes);
    assert.equal(sha256(bytes), expectedHash);
    assert.equal(Object.hasOwn(routeAdaptiveFlow(fixture(name)).sourceContract, 'localeDesign'), false);
  }
});

test('clarification cannot enter adaptive production', () => {
  const ask = routeLocaleDesignContext(context({ marketRegion: null, audience: null }));
  assert.throws(
    () => routeAdaptiveFlow(fixture('synth-marketing'), undefined, ask),
    (error: unknown) => error instanceof AdaptiveRouteError && error.code === 'LOCALE_DESIGN_CLARIFICATION_REQUIRED',
  );
});

test('research reuses the existing scout, reference, copy, type, and composition path', () => {
  const research = routeLocaleDesignContext(context());
  const routed = routeAdaptiveFlow(fixture('synth-marketing'), undefined, research);
  assert.equal(routed.sourceContract.localeDesign?.contextSha256, research.contextSha256);
  assert.ok(routed.gates.includes(`locale-design:research:${research.contextSha256}`));

  const missingType = structuredClone(fixture('synth-marketing')) as Record<string, unknown>;
  const strategy = Reflect.get(missingType, 'strategyDecision') as Record<string, unknown>;
  Reflect.set(strategy, 'stages', (Reflect.get(strategy, 'stages') as string[]).filter((stage) => stage !== 'type-proof'));
  const skips = Reflect.get(strategy, 'skips') as Record<string, unknown>[];
  Reflect.set(strategy, 'skips', [...skips, { id: 'type-proof', reason: 'Caller tried to skip locale type evidence.' }]);
  assert.throws(
    () => routeAdaptiveFlow(missingType, undefined, research),
    (error: unknown) => {
      assert.ok(error instanceof AdaptiveRouteError);
      assert.equal(error.code, 'LOCALE_DESIGN_RESEARCH_REQUIRED');
      assert.match(error.message, /missing stages: type-proof/);
      assert.doesNotMatch(error.message, /missing roles:/);
      assert.match(error.message, /collected after the research route is published/);
      assert.match(error.message, /not required to classify it/);
      return true;
    },
  );
});

test('mechanics-only requires type proof only when an actual design stage is selected', () => {
  const mechanics = routeLocaleDesignContext(context({
    surfaceLocale: 'en', marketRegion: null, audience: null, desiredFit: 'locale-mechanics-only',
  }));
  assert.doesNotThrow(() => routeAdaptiveFlow(fixture('copy-only'), undefined, mechanics));
  const designed = structuredClone(fixture('synth-marketing')) as Record<string, unknown>;
  const strategy = Reflect.get(designed, 'strategyDecision') as Record<string, unknown>;
  Reflect.set(strategy, 'stages', (Reflect.get(strategy, 'stages') as string[]).filter((stage) => stage !== 'type-proof'));
  Reflect.set(strategy, 'skips', [...(Reflect.get(strategy, 'skips') as object[]), {
    id: 'type-proof', reason: 'Caller tried to skip locale type evidence.',
  }]);
  assert.throws(
    () => routeAdaptiveFlow(designed, undefined, mechanics),
    (error: unknown) => error instanceof AdaptiveRouteError && error.code === 'LOCALE_DESIGN_TYPE_PROOF_REQUIRED',
  );
});

test('persisted locale route is replayable and rejects changed or missing companion context', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-locale-route-'));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const rawContext = context();
  writeFileSync(join(root, '.omd', 'locale-design-context.json'), `${JSON.stringify(rawContext)}\n`);
  const locale = routeLocaleDesignContext(rawContext);
  const invocation = createTestProjectRunInvocation(root, 'locale-route-persistence');
  const input = fixture('synth-marketing');
  const record = routeAdaptiveFlow(input, undefined, locale);
  const authority = adaptiveRouteAuthorityBytes(record, adaptiveRouteRecordSha256(record), invocation);
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'adaptive-route-authority', payload: authority }]);
  publishAdaptiveRoute(root, input, createTestProjectWriteAdapter(root, invocation), invocation, locale);
  assert.equal(readPersistedRoute(root, invocation).sourceContract.localeDesign?.contextSha256, locale.contextSha256);

  writeFileSync(join(root, '.omd', 'locale-design-context.json'), `${JSON.stringify(context({ marketRegion: 'US' }))}\n`);
  assert.throws(
    () => readPersistedRoute(root, invocation),
    (error: unknown) => error instanceof AdaptiveRouteError && error.code === 'SOURCE_CONTRACT_MISMATCH',
  );
});
