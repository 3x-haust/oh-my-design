import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  LocaleDesignContextError,
  localeDesignRouteFindings,
  parseLocaleDesignContext,
  routeLocaleDesignContext,
} from '../core/locale/design-context.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const context = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 'locale-design-context-v1',
  conversationLanguage: 'ko-KR',
  surfaceLocale: 'ja-JP',
  marketRegion: 'JP',
  marketAuthorityClaimId: 'market-authority',
  audience: 'Adults comparing a public mission archive',
  domain: 'public lunar mission archive',
  surface: 'product',
  desiredFit: 'market-grounded',
  brandInvariants: ['Mission facts do not change across locales'],
  ...overrides,
  ...(overrides.marketRegion === null && !Object.hasOwn(overrides, 'marketAuthorityClaimId') ? { marketAuthorityClaimId: null } : {}),
});

test('context keeps conversation, surface locale, and explicit market independent', () => {
  const parsed = parseLocaleDesignContext(context({
    conversationLanguage: 'en-gb', surfaceLocale: 'zh-Hant-TW', marketRegion: 'us',
  }));
  assert.equal(parsed.conversationLanguage, 'en-GB');
  assert.equal(parsed.surfaceLocale, 'zh-Hant-TW');
  assert.equal(parsed.marketRegion, 'US');
  const routed = routeLocaleDesignContext(parsed);
  assert.deepEqual(routed.mechanics, {
    surfaceLocale: 'zh-Hant-TW', language: 'zh', explicitScript: 'Hant', explicitRegion: 'TW',
    likelyScript: 'Hant', scriptSource: 'explicit',
  });
  assert.equal(routed.context.marketRegion, 'US', 'locale region must not overwrite explicit market');
});

test('bare locale may infer mechanics script but never market', () => {
  const routed = routeLocaleDesignContext(context({ surfaceLocale: 'zh', marketRegion: null }));
  assert.equal(routed.decision, 'mechanics-only');
  assert.equal(routed.mechanics.explicitRegion, null);
  assert.equal(routed.mechanics.likelyScript, 'Hans');
  assert.equal(routed.mechanics.scriptSource, 'likely-subtag');
  assert.equal(routed.context.marketRegion, null);
  assert.equal(routed.marketFitClaim, 'withheld');
  assert.equal(routed.question, null);
  assert.match(routed.reason, /no explicit market region authority/);
  assert.deepEqual(localeDesignRouteFindings(routed), []);
});

test('missing market or audience defaults to mechanics-only while complete context researches', () => {
  const missingBoth = routeLocaleDesignContext(context({ marketRegion: null, audience: null }));
  assert.equal(missingBoth.decision, 'mechanics-only');
  assert.equal(missingBoth.question, null);
  assert.match(missingBoth.reason, /market region or target audience and task/);
  const missingAudience = routeLocaleDesignContext(context({ audience: null }));
  assert.equal(missingAudience.decision, 'mechanics-only');
  assert.equal(missingAudience.question, null);
  assert.deepEqual(localeDesignRouteFindings(missingAudience), []);
  const complete = routeLocaleDesignContext(context());
  assert.equal(complete.decision, 'research');
  assert.equal(complete.question, null);
  assert.equal(complete.marketFitClaim, 'evidence-required');
  assert.deepEqual(complete.requiredEvidence, [
    'script-mechanics', 'global-equivalent-or-unavailable', 'native-category-first-party',
    'counterexample', 'target-language-type-proof', 'cultural-design-profile',
  ]);
});

test('mechanics-only is explicit and withholds every market-fit claim', () => {
  const routed = routeLocaleDesignContext(context({
    desiredFit: 'locale-mechanics-only', marketRegion: null, audience: null, surfaceLocale: 'en',
  }));
  assert.equal(routed.decision, 'mechanics-only');
  assert.equal(routed.marketFitClaim, 'withheld');
  assert.equal(routed.question, null);
  assert.deepEqual(routed.requiredEvidence, ['script-mechanics', 'target-language-type-proof']);
});

test('zh-CN and zh-TW retain distinct source identities and hashes', () => {
  const cn = routeLocaleDesignContext(context({ surfaceLocale: 'zh-CN', marketRegion: 'CN' }));
  const tw = routeLocaleDesignContext(context({ surfaceLocale: 'zh-TW', marketRegion: 'TW' }));
  assert.notEqual(cn.contextSha256, tw.contextSha256);
  assert.equal(cn.mechanics.likelyScript, 'Hans');
  assert.equal(tw.mechanics.likelyScript, 'Hant');
});

test('malformed, unknown, inherited, accessor, invisible, and duplicate input fails closed', () => {
  const cases: unknown[] = [
    null,
    { ...context(), extra: true },
    Object.assign(Object.create({ inherited: true }), context()),
    Object.defineProperty(context(), 'domain', { get: () => 'archive', enumerable: true }),
    context({ domain: '\u3164' }),
    context({ surfaceLocale: 'english_US' }),
    context({ surfaceLocale: 'und' }),
    context({ marketRegion: 'Japan' }),
    context({ marketRegion: 'ZZ' }),
    context({ marketRegion: 'AA' }),
    context({ marketRegion: 'XX' }),
    context({ marketRegion: '999' }),
    context({ marketRegion: '000' }),
    context({ marketRegion: 'QM' }),
    context({ marketRegion: 'XA' }),
    context({ domain: `benefit\ud800portal` }),
    context({ domain: 'x'.repeat(513) }),
    context({ brandInvariants: ['Same', 'Same'] }),
  ];
  for (const value of cases) assert.throws(() => parseLocaleDesignContext(value), LocaleDesignContextError);
});

test('CLI continues mechanics-only for missing authority and researches complete context', () => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-locale-design-'));
  const path = join(directory, 'context.json');
  writeFileSync(path, `${JSON.stringify(context({ marketRegion: null }))}\n`);
  const ask = spawnSync(process.execPath, [CLI, 'locale', 'plan', '--input', path, '--json'], { encoding: 'utf8' });
  assert.equal(ask.status, 0, ask.stderr);
  const askResult = JSON.parse(ask.stdout);
  assert.equal(askResult.route.decision, 'mechanics-only');
  assert.equal(askResult.route.marketFitClaim, 'withheld');
  assert.deepEqual(askResult.findings, []);

  writeFileSync(path, `${JSON.stringify(context())}\n`);
  const research = spawnSync(process.execPath, [CLI, 'locale', 'plan', '--input', path, '--json'], { encoding: 'utf8' });
  assert.equal(research.status, 0, research.stderr);
  const researchResult = JSON.parse(research.stdout);
  assert.equal(researchResult.route.decision, 'research');
  assert.deepEqual(researchResult.findings, []);
});

test('the canonical skeleton cannot promote its example locale or placeholder into market authority', async () => {
  const { inputSkeleton } = await import('../core/schema/inputs.ts');
  const skeleton = inputSkeleton('locale-design-context').skeleton;
  const routed = routeLocaleDesignContext(skeleton);
  assert.equal(routed.context.surfaceLocale, 'ja-JP');
  assert.equal(routed.context.marketRegion, null);
  assert.equal(routed.context.audience, null);
  assert.equal(routed.decision, 'mechanics-only');
  assert.equal(routed.marketFitClaim, 'withheld');
  assert.deepEqual(localeDesignRouteFindings(routed), []);
});
