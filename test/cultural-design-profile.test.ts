import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CULTURAL_DESIGN_AXES,
  CulturalDesignProfileError,
  culturalDesignProjectionSha256,
  projectCulturalDesignProfile,
  validateCulturalDesignProfile,
} from '../core/locale/cultural-profile.ts';
import { routeLocaleDesignContext } from '../core/locale/design-context.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const context = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  schema: 'locale-design-context-v1', conversationLanguage: 'ko-KR', surfaceLocale: 'ja-JP',
  marketRegion: 'JP', audience: 'Adults comparing a public mission archive',
  domain: 'public lunar mission archive', surface: 'product', desiredFit: 'market-grounded',
  brandInvariants: ['Mission facts do not change across locales'], ...overrides,
});
const source = (id: string, lane: string, n: string) => ({
  id, lane, status: 'captured', url: `https://${id}.example.test/current`,
  capturedAt: '2026-09-02T00:00:00.000Z', captureSha256: n.repeat(64),
  observation: `${id} provides a bounded observation.`, scope: 'Archive list and selected detail.',
});
const profile = (route = routeLocaleDesignContext(context()), overrides: Record<string, unknown> = {}) => ({
  schema: 'cultural-design-profile-v1', contextSha256: route.contextSha256,
  capturedAt: '2026-09-02T00:00:00.000Z',
  sources: [
    source('standard', 'standard', 'a'), source('global', 'global-equivalent', 'b'),
    source('native', 'native-category', 'c'), source('counter', 'counterexample', 'd'),
  ],
  brandInvariants: ['Mission facts do not change across locales'],
  authorizedMarketFacts: [], typeProofSha256: 'e'.repeat(64),
  decisions: CULTURAL_DESIGN_AXES.map((axis, index) => ({
    id: `decision-${index + 1}`, axis, status: index === 0 ? 'supported' : 'shared',
    sourceIds: ['standard', 'global', 'native'], counterexampleIds: ['counter'],
    mechanism: `Bounded ${axis} mechanism.`, adaptation: `Apply ${axis} only inside the archive task.`,
    avoid: `Do not turn ${axis} into a country theme.`,
    falsifier: `Reject when ${axis} weakens the selected-detail consequence.`,
  })),
  rejectedCliches: ['National symbols without task evidence'], confidence: 'bounded', ...overrides,
});

test('profile requires current cross-lane evidence and produces a source-free projection', () => {
  const route = routeLocaleDesignContext(context());
  const parsed = validateCulturalDesignProfile(profile(route), route);
  const projection = projectCulturalDesignProfile(parsed, route);
  assert.equal(projection.contextSha256, route.contextSha256);
  assert.equal(projection.surfaceLocale, 'ja-JP');
  assert.equal(projection.marketRegion, 'JP');
  assert.equal(projection.humanFitClaim, 'withheld');
  assert.match(culturalDesignProjectionSha256(projection), /^[a-f0-9]{64}$/);
  const bytes = JSON.stringify(projection);
  assert.doesNotMatch(bytes, /https?:|\.example\.test|sourceIds|counterexampleIds|captureSha256/);
});

test('swapped context, missing counterexample, and unused source fail closed', () => {
  const route = routeLocaleDesignContext(context());
  const swapped = routeLocaleDesignContext(context({ surfaceLocale: 'zh-TW', marketRegion: 'TW' }));
  assert.throws(
    () => validateCulturalDesignProfile(profile(route), swapped),
    (error: unknown) => error instanceof CulturalDesignProfileError && error.code === 'LOCALE_DESIGN_PROFILE_STALE',
  );
  const missingCounter = profile(route);
  missingCounter.decisions = missingCounter.decisions.map((entry) => ({ ...entry, counterexampleIds: [] }));
  assert.throws(() => validateCulturalDesignProfile(missingCounter, route), CulturalDesignProfileError);
  const unused = profile(route);
  unused.sources = [...unused.sources, source('unused', 'native-category', 'f')];
  assert.throws(() => validateCulturalDesignProfile(unused, route), /every source must resolve/);
});

test('an unavailable global-equivalent receipt cannot be promoted into convergence', () => {
  const route = routeLocaleDesignContext(context());
  const changed = structuredClone(profile(route)) as Record<string, unknown>;
  const sources = Reflect.get(changed, 'sources') as Array<Record<string, unknown>>;
  Reflect.set(changed, 'sources', sources.map((entry) => entry.id === 'global' ? {
    ...entry, status: 'unavailable', url: null, capturedAt: null, captureSha256: 'b'.repeat(64),
    observation: 'Exact global equivalent was unavailable.',
  } : entry));
  assert.throws(
    () => validateCulturalDesignProfile(changed, route),
    /captured global-equivalent/,
  );
});

test('contested and unknown axes cannot leak an adaptation into production', () => {
  const route = routeLocaleDesignContext(context());
  const changed = structuredClone(profile(route)) as Record<string, unknown>;
  const decisions = Reflect.get(changed, 'decisions') as Array<Record<string, unknown>>;
  Reflect.set(changed, 'decisions', decisions.map((entry, index) => index === 0 ? {
    ...entry, status: 'unknown', sourceIds: [], counterexampleIds: [], mechanism: null, adaptation: null,
  } : entry));
  Reflect.set(changed, 'confidence', 'contested');
  const projection = projectCulturalDesignProfile(changed, route);
  assert.equal(projection.decisions[0]?.status, 'unknown');
  assert.equal(projection.decisions[0]?.adaptation, null);
});

test('source identity, URL, selector, path, markup, and image references cannot enter projection text', () => {
  const route = routeLocaleDesignContext(context());
  for (const leak of [
    'Copy https://source.example/page', 'Follow source.example.org exactly', 'Use ../capture.png',
    'Match [data-source="hero"]', '<img src="reference.webp">', 'Use #sourceHero',
  ]) {
    const changed = profile(route);
    changed.decisions = changed.decisions.map((entry, index) => index === 0 ? { ...entry, adaptation: leak } : entry);
    assert.throws(
      () => projectCulturalDesignProfile(changed, route),
      (error: unknown) => error instanceof CulturalDesignProfileError && error.code === 'LOCALE_DESIGN_SOURCE_LEAK',
      leak,
    );
  }
});

test('CLI validates a profile and returns only hashes plus sanitized projection', () => {
  const directory = mkdtempSync(join(tmpdir(), 'omd-cultural-profile-'));
  const contextPath = join(directory, 'context.json');
  const profilePath = join(directory, 'profile.json');
  const rawContext = context();
  const route = routeLocaleDesignContext(rawContext);
  writeFileSync(contextPath, `${JSON.stringify(rawContext)}\n`);
  writeFileSync(profilePath, `${JSON.stringify(profile(route))}\n`);
  const result = spawnSync(process.execPath, [
    CLI, 'locale', 'profile', '--input', profilePath, '--locale-context', contextPath, '--json',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.match(output.profileSha256, /^[a-f0-9]{64}$/);
  assert.match(output.projectionSha256, /^[a-f0-9]{64}$/);
  assert.equal(output.projection.humanFitClaim, 'withheld');
  assert.doesNotMatch(JSON.stringify(output.projection), /example\.test|sourceIds|captureSha256/);
});
