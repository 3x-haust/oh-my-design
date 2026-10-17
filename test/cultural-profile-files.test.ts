import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { judgmentStarter, readVerifiedCliJudgment, runJudgmentCommand } from '../bin/judgment-command.ts';
import { CULTURAL_DESIGN_AXES } from '../core/locale/cultural-profile.ts';
import {
  CULTURAL_DESIGN_PROJECTION_POINTER_PATH,
  publishCulturalDesignProfile,
  readCurrentCulturalDesignProfile,
} from '../core/locale/cultural-profile-files.ts';
import { routeLocaleDesignContext } from '../core/locale/design-context.ts';
import {
  captureCulturalDesignSource,
  captureStableCulturalDesignSource,
  UNSTABLE_CONTENT_REASON_PREFIX,
  verifyRemoteCulturalDesignSources,
} from '../core/locale/source-capture-files.ts';
import {
  publishAdaptiveRoute,
} from '../core/route/index.ts';
import { capturePiRequest } from '../extensions/omd-request-source.ts';
import {
  createModelLedRouteContext,
} from './helpers/model-led.ts';

const fixture = (): Record<string, unknown> => {
  const value = JSON.parse(readFileSync(new URL('fixtures/adaptive-flow/synth-marketing.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  value.request = `${String(value.request)} Build this for users in Japan.`;
  const publication = value.evidenceClaims as { claims: unknown[]; userFacts: string[] };
  publication.claims.push({ id: 'market-authority', text: 'The product targets Japan.', status: 'confirmed',
    userEvidence: [{ kind: 'explicit-user-evidence', source: 'user-message', reference: 'market-request', excerpt: 'Build this for users in Japan.' }] });
  publication.userFacts.push('market-authority');
  return value;
};
const context = (): Record<string, unknown> => ({
  schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ja-JP',
  marketRegion: 'JP', marketAuthorityClaimId: 'market-authority', audience: 'Adults comparing a public mission archive',
  domain: 'public lunar mission archive', surface: 'product', desiredFit: 'market-grounded',
  brandInvariants: ['Mission facts do not change across locales'],
});
const source = (id: string, lane: string, capture: Awaited<ReturnType<typeof captureCulturalDesignSource>>) => ({
  id, lane, status: 'captured', url: capture.receipt.url,
  capturedAt: capture.receipt.capturedAt, captureSha256: capture.receiptSha256,
  observation: `${id} observation.`, scope: 'Archive list and detail.',
});
const profile = (
  contextSha256: string,
  sources: readonly ReturnType<typeof source>[],
  typeProofSha256: string,
) => ({
  schema: 'cultural-design-profile-v1', contextSha256, capturedAt: '2026-09-02T00:00:00.000Z',
  sources,
  brandInvariants: ['Mission facts do not change across locales'], authorizedMarketFacts: [],
  typeProofSha256,
  decisions: CULTURAL_DESIGN_AXES.map((axis, index) => ({
    id: `decision-${index + 1}`, axis, status: 'supported',
    sourceIds: ['standard', 'global', 'native'], counterexampleIds: ['counter'],
    mechanism: `${axis} mechanism.`, adaptation: `${axis} adaptation.`,
    avoid: `Avoid unsupported ${axis}.`, falsifier: `Reject broken ${axis}.`,
  })),
  rejectedCliches: [], confidence: 'bounded',
});

function routeWithoutArtDirection(): Record<string, unknown> {
  const input = fixture();
  const strategy = Reflect.get(input, 'strategyDecision') as Record<string, unknown>;
  Reflect.set(strategy, 'stages', (Reflect.get(strategy, 'stages') as string[]).filter((stage) => stage !== 'art-direction'));
  Reflect.set(strategy, 'skips', [...(Reflect.get(strategy, 'skips') as object[]), {
    id: 'art-direction', reason: 'The comparison uses an already bounded archive direction.',
  }]);
  return input;
}

async function publishTargetMarketJudgment(
  root: string,
  input: Record<string, unknown>,
  invocation: ReturnType<typeof createModelLedRouteContext>['invocation'],
  writer: ReturnType<typeof createModelLedRouteContext>['writer'],
) {
  capturePiRequest(root, String(input.request));
  const starter = judgmentStarter(root, 'target-market', invocation);
  assert.equal(starter.skeleton.subjectId, 'request');
  writer.write(starter.path, `${JSON.stringify({ ...starter.skeleton, payload: { region: 'JP' } })}\n`);
  const published = await runJudgmentCommand(root, invocation, 'publish', join(root, starter.path), writer);
  return readVerifiedCliJudgment(root, invocation, published.receipt.path);
}

test('published profile and projection bind fetched source receipts, current type proof, and source seal', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-cultural-profile-files-')));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const rawContext = context();
  writeFileSync(join(root, '.omd', 'locale-design-context.json'), `${JSON.stringify(rawContext)}\n`);
  const locale = routeLocaleDesignContext(rawContext);
  const input = routeWithoutArtDirection();
  const { invocation, writer } = createModelLedRouteContext(root, String(input.request));
  const marketJudgment = await publishTargetMarketJudgment(root, input, invocation, writer);
  publishAdaptiveRoute(root, input, writer, invocation, locale, marketJudgment);
  writeFileSync(join(root, '.omd', 'copy-deck.md'), 'copy-deck.md: approved\n');
  const typeProofBytes = 'type-proof.md: approved Japanese copy at both viewports\n';
  writeFileSync(join(root, '.omd', 'type-proof.md'), typeProofBytes);
  writeFileSync(join(root, '.omd', 'composition.md'), 'composition.md: approved\n');
  const fakeFetch: typeof fetch = (async (input: string | URL | Request) => new Response(
    `current bytes for ${String(input)}`, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )) as typeof fetch;
  const captures = await Promise.all(['standard', 'global', 'native', 'counter'].map((id) => (
    captureCulturalDesignSource(root, `https://${id}.example.test/current`, invocation, fakeFetch)
  )));
  const sources = [
    source('standard', 'standard', captures[0]!), source('global', 'global-equivalent', captures[1]!),
    source('native', 'native-category', captures[2]!), source('counter', 'counterexample', captures[3]!),
  ];
  const typeProofSha256 = createHash('sha256').update(typeProofBytes).digest('hex');

  const published = publishCulturalDesignProfile(root, profile(locale.contextSha256, sources, typeProofSha256), invocation);
  assert.match(published.profileRecordPath, /locale-profiles\/sha256-[a-f0-9]{64}\.json$/);
  assert.match(published.projectionRecordPath, /locale-projections\/sha256-[a-f0-9]{64}\.json$/);
  assert.equal(readCurrentCulturalDesignProfile(root, invocation).projectionSha256, published.projectionSha256);
  const remote = await verifyRemoteCulturalDesignSources(root, published.profile.sources, locale.contextSha256, fakeFetch);
  assert.equal(remote.sourceCount, 4);
  const changedFetch: typeof fetch = (async () => new Response(
    'changed remote bytes', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )) as typeof fetch;
  await assert.rejects(
    verifyRemoteCulturalDesignSources(root, published.profile.sources, locale.contextSha256, changedFetch),
    /LOCALE_DESIGN_SOURCE_REMOTE_STALE/,
  );

  assert.ok(captures[0]?.contentPath);
  writeFileSync(join(root, captures[0]!.contentPath!), 'tampered source bytes');
  assert.throws(() => readCurrentCulturalDesignProfile(root, invocation), /LOCALE_DESIGN_SOURCE_STALE/);
  writeFileSync(join(root, captures[0]!.contentPath!), 'current bytes for https://standard.example.test/current');
  writeFileSync(join(root, '.omd', 'type-proof.md'), 'changed type proof\n');
  assert.throws(() => readCurrentCulturalDesignProfile(root, invocation), /LOCALE_DESIGN_TYPE_PROOF_STALE/);
  writeFileSync(join(root, '.omd', 'type-proof.md'), typeProofBytes);

  writeFileSync(join(root, CULTURAL_DESIGN_PROJECTION_POINTER_PATH), '{}\n');
  assert.throws(() => readCurrentCulturalDesignProfile(root, invocation), /LOCALE_DESIGN_PROFILE_STALE/);
});

test('source stability records volatile successful responses without letting a stable source stay unavailable', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-cultural-source-stability-')));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const rawContext = context();
  writeFileSync(join(root, '.omd', 'locale-design-context.json'), `${JSON.stringify(rawContext)}\n`);
  const locale = routeLocaleDesignContext(rawContext);
  const input = routeWithoutArtDirection();
  const { invocation, writer } = createModelLedRouteContext(root, String(input.request));
  const marketJudgment = await publishTargetMarketJudgment(root, input, invocation, writer);
  publishAdaptiveRoute(root, input, writer, invocation, locale, marketJudgment);

  let changingCall = 0;
  const changingFetch: typeof fetch = (async (request: string | URL | Request) => new Response(
    changingCall++ % 2 === 0 ? 'first successful bytes' : 'second successful bytes',
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )) as typeof fetch;
  const unstable = await captureStableCulturalDesignSource(
    root, 'https://native.example.test/volatile', invocation, changingFetch,
  );
  assert.equal(unstable.receipt.status, 'unavailable');
  assert.match(unstable.receipt.reason ?? '', new RegExp(`^${UNSTABLE_CONTENT_REASON_PREFIX}`));
  assert.equal(unstable.contentPath, null);

  const unavailable = {
    id: 'native-volatile', lane: 'native-category' as const, status: 'unavailable' as const,
    url: null, capturedAt: null, captureSha256: unstable.receiptSha256,
    observation: unstable.receipt.reason!, scope: 'A volatile same-task native source.',
  };
  const remote = await verifyRemoteCulturalDesignSources(
    root, [unavailable], locale.contextSha256, changingFetch,
  );
  assert.equal(remote.sourceCount, 1);

  const stableFetch: typeof fetch = (async () => new Response(
    'stable successful bytes', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )) as typeof fetch;
  await assert.rejects(
    verifyRemoteCulturalDesignSources(root, [unavailable], locale.contextSha256, stableFetch),
    /previously unstable source is now stable/,
  );

  const stable = await captureStableCulturalDesignSource(
    root, 'https://native.example.test/stable', invocation, stableFetch,
  );
  assert.equal(stable.receipt.status, 'captured');
  assert.equal(stable.receipt.contentSha256, createHash('sha256').update('stable successful bytes').digest('hex'));
});

test('source stability rejects a fresh matching pair that differs from the active captured receipt', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-cultural-source-delayed-stability-')));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const rawContext = context();
  writeFileSync(join(root, '.omd', 'locale-design-context.json'), `${JSON.stringify(rawContext)}\n`);
  const locale = routeLocaleDesignContext(rawContext);
  const input = routeWithoutArtDirection();
  const { invocation, writer } = createModelLedRouteContext(root, String(input.request));
  const marketJudgment = await publishTargetMarketJudgment(root, input, invocation, writer);
  publishAdaptiveRoute(root, input, writer, invocation, locale, marketJudgment);
  const typeProofBytes = 'type-proof.md: approved Japanese copy at both viewports\n';
  writeFileSync(join(root, '.omd', 'type-proof.md'), typeProofBytes);

  const initialFetch: typeof fetch = (async (request: string | URL | Request) => new Response(
    `initial current bytes for ${String(request)}`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )) as typeof fetch;
  const captures = await Promise.all(['standard', 'global', 'native', 'counter'].map((id) => (
    captureCulturalDesignSource(root, `https://${id}.example.test/current`, invocation, initialFetch)
  )));
  const sources = [
    source('standard', 'standard', captures[0]!), source('global', 'global-equivalent', captures[1]!),
    source('native', 'native-category', captures[2]!), source('counter', 'counterexample', captures[3]!),
  ];
  publishCulturalDesignProfile(
    root,
    profile(
      locale.contextSha256,
      sources,
      createHash('sha256').update(typeProofBytes).digest('hex'),
    ),
    invocation,
  );

  const stillCurrent = await captureStableCulturalDesignSource(
    root, 'https://native.example.test/current', invocation, initialFetch,
  );
  assert.equal(stillCurrent.receipt.status, 'captured');

  const delayedVariantFetch: typeof fetch = (async () => new Response(
    'later internally stable variant',
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )) as typeof fetch;
  const unstable = await captureStableCulturalDesignSource(
    root, 'https://native.example.test/current', invocation, delayedVariantFetch,
  );
  assert.equal(unstable.receipt.status, 'unavailable');
  assert.match(
    unstable.receipt.reason ?? '',
    /^UNSTABLE_CONTENT: the current profile receipt and two immediate captures/,
  );
  assert.equal(unstable.contentPath, null);
});

test('publication rejects self-attested source and type-proof hashes before writing pointers', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-cultural-profile-self-attested-')));
  mkdirSync(join(root, '.omd'), { recursive: true });
  const rawContext = context();
  writeFileSync(join(root, '.omd', 'locale-design-context.json'), `${JSON.stringify(rawContext)}\n`);
  const actualTypeProof = 'actual type proof bytes\n';
  writeFileSync(join(root, '.omd', 'type-proof.md'), actualTypeProof);
  const locale = routeLocaleDesignContext(rawContext);
  const input = routeWithoutArtDirection();
  const { invocation, writer } = createModelLedRouteContext(root, String(input.request));
  const marketJudgment = await publishTargetMarketJudgment(root, input, invocation, writer);
  publishAdaptiveRoute(root, input, writer, invocation, locale, marketJudgment);
  const fabricated = ['standard', 'global', 'native', 'counter'].map((id, index) => ({
    id, lane: index === 0 ? 'standard' : index === 1 ? 'global-equivalent' : index === 2 ? 'native-category' : 'counterexample',
    status: 'captured', url: `https://${id}.example.test/current`, capturedAt: '2026-09-02T00:00:00.000Z',
    captureSha256: String.fromCharCode(97 + index).repeat(64), observation: `${id} observation.`,
    scope: 'Archive list and detail.',
  }));
  assert.throws(
    () => publishCulturalDesignProfile(root, profile(
      locale.contextSha256,
      fabricated as never,
      createHash('sha256').update(actualTypeProof).digest('hex'),
    ), invocation),
    /LOCALE_DESIGN_SOURCE_STALE/,
  );
  assert.throws(() => readFileSync(join(root, '.omd', 'cultural-design-profile.json')), /ENOENT/);
});
