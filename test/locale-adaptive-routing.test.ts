import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  AdaptiveRouteError,
  adaptiveRouteAuthorityBytes,
  adaptiveRouteRecordSha256,
  publishAdaptiveRoute,
  parseRouteRecord,
  readPersistedRoute,
  routeAdaptiveFlow,
} from '../core/route/index.ts';
import { adaptiveSourceContractSha256, canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { routeLocaleDesignContext } from '../core/locale/design-context.ts';
import { capturePiRequest } from '../extensions/omd-request-source.ts';
import { judgmentStarter, readVerifiedCliJudgment, runJudgmentCommand } from '../bin/judgment-command.ts';
import {
  authorizeTestProjectRunPayloads,
  createTestProjectRunInvocation,
  createTestProjectWriteAdapter,
} from './helpers/project-write.ts';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`fixtures/adaptive-flow/${name}.json`, import.meta.url), 'utf8'));
const marketFixture = (name: string): Record<string, unknown> => {
  const value = fixture(name) as Record<string, unknown>;
  value.request = `${String(value.request)} Build this for users in Japan.`;
  const publication = value.evidenceClaims as { claims: unknown[]; userFacts: string[] };
  publication.claims.push({ id: 'market-authority', text: 'The product targets Japan.', status: 'confirmed',
    userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'market-request', excerpt: 'Build this for users in Japan.' }] });
  publication.userFacts.push('market-authority');
  return value;
};
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
const context = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ja-JP',
  marketRegion: 'JP', marketAuthorityClaimId: 'market-authority', audience: 'Adults comparing a public mission archive',
  domain: 'public lunar mission archive', surface: 'product', desiredFit: 'market-grounded',
  brandInvariants: ['Mission facts do not change across locales'], ...overrides,
  ...(overrides.marketRegion === null && !Object.hasOwn(overrides, 'marketAuthorityClaimId') ? { marketAuthorityClaimId: null } : {}),
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
  // Re-snapshotted when the source contract gained the explicit learning-scope projection.
  for (const [name, expectedHash, expectedBytes] of [
    ['copy-only', '6bbc39b65fff0f2be911aeb1a66551f5263b826e0f7568404b7c9bdd9808a9ea', 16445],
    ['synth-marketing', '2d17cb8ce22815267cde4596b3c57d94ee637a43c219bfdb27b8920fc2f72a91', 16834],
  ] as const) {
    const bytes = `${canonicalRouteJson(routeAdaptiveFlow(fixture(name)))}\n`;
    assert.equal(Buffer.byteLength(bytes), expectedBytes);
    assert.equal(sha256(bytes), expectedHash);
    assert.equal(Object.hasOwn(routeAdaptiveFlow(fixture(name)).sourceContract, 'localeDesign'), false);
  }
});

test('missing market authority continues without questions or a cultural-fit claim', () => {
  const mechanics = routeLocaleDesignContext(context({ marketRegion: null, audience: null }));
  const route = routeAdaptiveFlow(fixture('synth-marketing'), undefined, mechanics);
  assert.equal(route.sourceContract.localeDesign?.decision, 'mechanics-only');
  assert.equal(route.sourceContract.localeDesign?.marketFitClaim, 'withheld');
  assert.equal(route.sourceContract.localeDesign?.question, null);
  assert.equal(route.sourceContract.localeDesign?.context.marketRegion, null);
  assert.equal(route.sourceContract.localeDesign?.context.audience, null);
});

test('market research routes without a judgment remain advisory and do not infer meaning from excerpts', () => {
  const research = routeLocaleDesignContext(context());
  assert.doesNotThrow(() => routeAdaptiveFlow(fixture('synth-marketing'), undefined, research));
  const wrongAuthority = marketFixture('synth-marketing');
  const publication = wrongAuthority.evidenceClaims as { claims: Array<{ id: string; text: string; userEvidence: Array<{ excerpt: string }> }> };
  const claim = publication.claims.find(candidate => candidate.id === 'market-authority');
  const evidence = claim?.userEvidence[0];
  if (claim && evidence) { claim.text = 'The product has a target market.'; evidence.excerpt = 'Use the selected region.'; }
  assert.doesNotThrow(() => routeAdaptiveFlow(wrongAuthority, undefined, research));
  for (const excerpt of ['Do not target Japan.', 'This service is not for Japan.', 'Japan is not our target market.',
    'Japan is not our market.', 'We no longer target Japan.', 'Japan is out of scope.',
    'Japan should not be a market.', 'Japan is not a good market.',
    '일본 사용자를 대상으로 하지 마세요.', '일본 시장은 아닙니다.', '일본은 시장으로 적합하지 않습니다.']) {
    const denied = marketFixture('synth-marketing');
    const deniedPublication = denied.evidenceClaims as { claims: Array<{ id: string; userEvidence: Array<{ excerpt: string }> }> };
    const deniedClaim = deniedPublication.claims.find(candidate => candidate.id === 'market-authority');
    const deniedEvidence = deniedClaim?.userEvidence[0];
    if (deniedEvidence) deniedEvidence.excerpt = excerpt;
    assert.doesNotThrow(() => routeAdaptiveFlow(denied, undefined, research));
  }
  const substringAuthority = marketFixture('synth-marketing');
  const substringPublication = substringAuthority.evidenceClaims as { claims: Array<{ id: string; userEvidence: Array<{ excerpt: string }> }> };
  const substringClaim = substringPublication.claims.find(candidate => candidate.id === 'market-authority');
  const substringEvidence = substringClaim?.userEvidence[0];
  if (substringEvidence) substringEvidence.excerpt = 'Use the status dashboard for customers.';
  const usResearch = routeLocaleDesignContext(context({ surfaceLocale: 'en-US', marketRegion: 'US' }));
  assert.doesNotThrow(() => routeAdaptiveFlow(substringAuthority, undefined, usResearch));
  const routed = routeAdaptiveFlow(marketFixture('synth-marketing'), undefined, research);
  assert.equal(routed.sourceContract.localeDesign?.contextSha256, research.contextSha256);
  assert.ok(routed.gates.includes(`locale-design:research:${research.contextSha256}`));

  const missingType = structuredClone(marketFixture('synth-marketing')) as Record<string, unknown>;
  const strategy = Reflect.get(missingType, 'strategyDecision') as Record<string, unknown>;
  Reflect.set(strategy, 'stages', (Reflect.get(strategy, 'stages') as string[]).filter((stage) => stage !== 'type-proof'));
  const skips = Reflect.get(strategy, 'skips') as Record<string, unknown>[];
  Reflect.set(strategy, 'skips', [...skips, { id: 'type-proof', reason: 'Caller tried to skip locale type evidence.' }]);
  assert.doesNotThrow(() => routeAdaptiveFlow(missingType, undefined, research));
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
  assert.doesNotThrow(() => routeAdaptiveFlow(designed, undefined, mechanics));
});

test('a real advisory judgment cannot authenticate a fabricated market claim excerpt', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-market-claim-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const rawContext = context(), locale = routeLocaleDesignContext(rawContext);
  writeFileSync(join(root, '.omd/locale-design-context.json'), JSON.stringify(rawContext));
  const invocation = createTestProjectRunInvocation(root, 'market-claim');
  const writer = createTestProjectWriteAdapter(root, invocation);
  const input = { ...marketFixture('synth-marketing'), request: 'Build a generic status dashboard.' };
  capturePiRequest(root, input.request);
  const starter = judgmentStarter(root, 'target-market', invocation);
  writer.write(starter.path, JSON.stringify({ ...starter.skeleton, payload: { region: 'JP' } }));
  const published = await runJudgmentCommand(root, invocation, 'publish', join(root, starter.path), writer);
  const judgment = await readVerifiedCliJudgment(root, invocation, published.receipt.path);
  assert.throws(() => routeAdaptiveFlow(input, { root, invocation, marketJudgment: judgment }, locale),
    /LOCALE_DESIGN_MARKET_AUTHORITY_REQUIRED/);
  assert.throws(() => publishAdaptiveRoute(root, input, writer, invocation, locale, judgment),
    /LOCALE_DESIGN_MARKET_AUTHORITY_REQUIRED/);
  assert.equal(existsSync(join(root, '.omd/route.json')), false);
});

test('locale publication requires a real judgment and rejects changed companion context on replay', async t => {
  const root = mkdtempSync(join(tmpdir(), 'omd-locale-route-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const rawContext = context();
  writeFileSync(join(root, '.omd', 'locale-design-context.json'), `${JSON.stringify(rawContext)}\n`);
  const locale = routeLocaleDesignContext(rawContext);
  const invocation = createTestProjectRunInvocation(root, 'locale-route-persistence');
  const input = marketFixture('synth-marketing');
  const record = routeAdaptiveFlow(input, undefined, locale);
  const authority = adaptiveRouteAuthorityBytes(record, adaptiveRouteRecordSha256(record), invocation);
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'adaptive-route-authority', payload: authority }]);
  const writer = createTestProjectWriteAdapter(root, invocation);
  assert.throws(() => publishAdaptiveRoute(root, input, writer, invocation, locale), /LOCALE_DESIGN_MARKET_AUTHORITY_REQUIRED/);
  assert.equal(existsSync(join(root, '.omd/route.json')), false);
  capturePiRequest(root, String(input.request));
  const starter = judgmentStarter(root, 'target-market', invocation);
  const draft = { ...starter.skeleton, payload: { region: 'JP' } };
  const quotes = Reflect.get(draft, 'quotes');
  assert.ok(Array.isArray(quotes) && quotes.length > 0);
  const quote = quotes[0];
  assert.ok(typeof quote === 'object' && quote !== null && typeof Reflect.get(quote, 'text') === 'string');
  Reflect.set(quote, 'text', String(Reflect.get(quote, 'text')).replace(' ', '\n'));
  writer.write(starter.path, JSON.stringify({ ...draft, subjectId: 'another-request' }));
  const unrelatedPublication = await runJudgmentCommand(root, invocation, 'publish', join(root, starter.path), writer);
  const unrelated = await readVerifiedCliJudgment(root, invocation, unrelatedPublication.receipt.path);
  assert.throws(() => routeAdaptiveFlow(input, { root, invocation, marketJudgment: unrelated }, locale), /LOCALE_DESIGN_MARKET_AUTHORITY_REQUIRED/);
  assert.equal(existsSync(join(root, '.omd/route.json')), false);
  writer.write(starter.path, JSON.stringify(draft));
  const published = await runJudgmentCommand(root, invocation, 'publish', join(root, starter.path), writer);
  const judgment = await readVerifiedCliJudgment(root, invocation, published.receipt.path);
  const approved = routeAdaptiveFlow(input, { root, invocation, marketJudgment: judgment }, locale);
  authorizeTestProjectRunPayloads(root, invocation, [{ purpose: 'adaptive-route-authority',
    payload: adaptiveRouteAuthorityBytes(approved, adaptiveRouteRecordSha256(approved), invocation) }]);
  publishAdaptiveRoute(root, input, writer, invocation, locale, judgment);
  assert.equal(readPersistedRoute(root, invocation).sourceContract.localeDesign?.contextSha256, locale.contextSha256);
  const judgmentPath = join(root, published.receipt.path), original = readFileSync(judgmentPath);
  const pointer = readFileSync(join(root, '.omd/route.json'));
  const forged = structuredClone(approved);
  const claim = forged.sourceContract.evidenceClaims.claims.find(item => item.id === 'market-authority');
  assert.ok(claim?.status === 'confirmed' && claim.userEvidence[0]);
  Reflect.set(claim.userEvidence[0], 'excerpt', 'An invented statement absent from the authenticated request.');
  Reflect.set(forged, 'sourceContractSha256', adaptiveSourceContractSha256(forged.sourceContract));
  assert.throws(() => parseRouteRecord(forged, { root, invocation }), /LOCALE_DESIGN_MARKET_AUTHORITY_REQUIRED/);
  assert.deepEqual(readFileSync(join(root, '.omd/route.json')), pointer);
  writeFileSync(judgmentPath, Buffer.concat([original, Buffer.from('\n')]));
  assert.throws(() => readPersistedRoute(root, invocation), /MALFORMED_ADAPTIVE_ROUTE/);
  assert.throws(() => publishAdaptiveRoute(root, input, writer, invocation, locale, judgment), /AI_JUDGMENT_SOURCE_UNVERIFIED/);
  assert.deepEqual(readFileSync(join(root, '.omd/route.json')), pointer);
  writeFileSync(judgmentPath, original);

  writeFileSync(join(root, '.omd', 'locale-design-context.json'), `${JSON.stringify(context({ marketRegion: 'US' }))}\n`);
  assert.throws(
    () => readPersistedRoute(root, invocation),
    (error: unknown) => error instanceof AdaptiveRouteError && error.code === 'SOURCE_CONTRACT_MISMATCH',
  );
});
