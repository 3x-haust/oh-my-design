import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORBIDDEN_WITHOUT_REQUEST,
  AdaptiveRouteError,
  parseRouteRecord,
  pathsOutsideScope,
  routeAdaptiveFlow,
} from '../core/route/index.ts';
import { canonicalRouteJson } from '../core/route/adaptive-source-contract.ts';
import { signNativeObservation } from '../core/runtime/self-signed-activation.ts';
import { createTestProjectRunInvocation } from './helpers/project-write.ts';
import { classifyArtifact } from '../core/layout/index.ts';
import { orphanRecords, scanProject } from '../core/layout/scan.ts';

const adaptiveFixture = (): unknown => JSON.parse(readFileSync(fileURLToPath(
  new URL('fixtures/adaptive-flow/copy-only.json', import.meta.url),
), 'utf8'));

test('the canonical route is a typed adaptive decision rather than a fixed depth table', () => {
  const result = routeAdaptiveFlow(adaptiveFixture());
  assert.equal(result.route, 'adaptive');
  assert.equal(result.strategy.owner, 'user-selected-model');
  assert.deepEqual(result.strategy.roles, ['omd-writer', 'omd-hand', 'omd-eye']);
  assert.equal(result.references.decision, 'skip');
  assert.equal(Object.hasOwn(result.references, 'min'), false);
  assert.equal(result.behavior.schema, 'adaptive-behavior-contract-v1');
  assert.equal(result.behavior.policy.references.handoff, 'sanitized-summary-only');
});

test('review purpose versions recorded browsing while benchmark and release require native origin authority', () => {
  const ordinary = adaptiveFixture() as Record<string, unknown>;
  ordinary.reviewPurpose = 'ordinary';
  ordinary.reviewPurposeAuthority = null;
  const ordinaryRoute = routeAdaptiveFlow(ordinary);
  assert.equal(ordinaryRoute.sourceContract.reviewPurpose, 'ordinary');
  assert.equal(ordinaryRoute.behavior.schema, 'adaptive-behavior-contract-v2');
  assert.equal(ordinaryRoute.behavior.policy.references.handoff, 'selected-whole-screens-and-analysis');
  assert.deepEqual(parseRouteRecord(JSON.parse(JSON.stringify(ordinaryRoute))), ordinaryRoute);

  const benchmark = adaptiveFixture() as Record<string, unknown>;
  benchmark.reviewPurpose = 'benchmark';
  benchmark.reviewPurposeAuthority = null;
  assert.throws(() => routeAdaptiveFlow(benchmark), /actual host\/user purpose origin receipt/);

  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omd-review-purpose-')));
  const request = Reflect.get(benchmark, 'request') as string;
  const payload = {
    schema: 'review-purpose-origin-v1' as const,
    projectRoot: root,
    purpose: 'benchmark' as const,
    requestSha256: createHash('sha256').update(request).digest('hex'),
    source: 'host-user-input' as const,
    observedAt: '2026-09-27T00:00:00.000Z',
  };
  const signature = signNativeObservation(root, payload.schema,
    createHash('sha256').update(canonicalRouteJson(payload)).digest('hex'));
  const bytes = Buffer.from(`${canonicalRouteJson({ ...payload, signature })}\n`);
  const receiptSha256 = createHash('sha256').update(bytes).digest('hex');
  const receipt = { path: `.omd/review-purpose-authorities/sha256-${receiptSha256}.json`, sha256: receiptSha256 };
  mkdirSync(join(root, '.omd/review-purpose-authorities'), { recursive: true });
  writeFileSync(join(root, receipt.path), bytes);
  benchmark.reviewPurposeAuthority = receipt;
  const authority = { root, invocation: createTestProjectRunInvocation(root) };
  assert.equal(routeAdaptiveFlow(benchmark, authority).sourceContract.reviewPurpose, 'benchmark');
  writeFileSync(join(root, receipt.path), Buffer.concat([bytes, Buffer.from('\n')]));
  assert.throws(() => routeAdaptiveFlow(benchmark, authority), /origin bytes changed/);
});

test('adaptive route input fails closed on missing and unknown contract contexts', () => {
  assert.throws(() => routeAdaptiveFlow({ schema: 'adaptive-design-route-input-v1' }), AdaptiveRouteError);
  const value = adaptiveFixture();
  assert.ok(typeof value === 'object' && value !== null);
  Reflect.set(value, 'unknown', true);
  assert.throws(() => routeAdaptiveFlow(value), AdaptiveRouteError);
});

test('the scope lock reports writes the route never authorized', () => {
  const record = routeAdaptiveFlow(adaptiveFixture());
  const outside = pathsOutsideScope(record, [
    'src/copy/Confirmation.tsx', '.omd/route.json', 'LICENSE', '.github/workflows/release.yml',
    '.omd/../LICENSE', '../foreign-project/package.json', '/tmp/foreign-project/package.json',
  ]);
  assert.deepEqual([...outside], [
    'LICENSE', '.github/workflows/release.yml', '.omd/../LICENSE',
    '../foreign-project/package.json', '/tmp/foreign-project/package.json',
  ]);
  assert.equal(record.forbiddenWithoutRequest.length, FORBIDDEN_WITHOUT_REQUEST.length);
  assert.ok(record.forbiddenWithoutRequest.some((entry) => /repository/.test(entry)));
});

test('the design record, trust state, and scratch are separable classes', () => {
  assert.equal(classifyArtifact('frame.md')?.cls, 'human');
  assert.equal(classifyArtifact('scout.md')?.cls, 'human');
  assert.equal(classifyArtifact('refs/example.com.hero.json')?.cls, 'refs');
  assert.equal(classifyArtifact('discovery/browse/session/trace.jsonl')?.cls, 'refs');
  assert.equal(classifyArtifact('reference-analysis.json')?.cls, 'human');
  assert.equal(classifyArtifact('review-purpose-authorities/sha256-abc.json')?.cls, 'state');
  assert.equal(classifyArtifact('reference-selection-v2.json')?.cls, 'state');
  assert.equal(classifyArtifact('motion-resolutions/sha256-abc.json')?.cls, 'state');
  assert.equal(classifyArtifact('.cache/art-direction-check.json')?.cls, 'cache');
  assert.equal(classifyArtifact('who-knows.json'), undefined);
});

// Deleting an audit record something still cites is the one unrecoverable mistake here.
test('an immutable record stays reachable through the pointer that cites it', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-scan-'));
  const omd = join(root, '.omd');
  const live = 'a'.repeat(64);
  const dead = 'b'.repeat(64);
  const nested = 'c'.repeat(64);
  mkdirSync(join(omd, 'art-direction-runs'), { recursive: true });
  mkdirSync(join(omd, 'motion-resolutions'), { recursive: true });
  mkdirSync(join(omd, 'framer-decisions'), { recursive: true });
  writeFileSync(join(omd, 'art-direction.json'), JSON.stringify({ record: `art-direction-runs/sha256-${live}.json`, sha256: live }));
  writeFileSync(join(omd, 'art-direction-runs', `sha256-${live}.json`), JSON.stringify({ decision: { motionResolutionProjectionSha256: nested } }));
  writeFileSync(join(omd, 'art-direction-runs', `sha256-${dead}.json`), JSON.stringify({ decision: {} }));
  writeFileSync(join(omd, 'motion-resolutions', `sha256-${nested}.json`), JSON.stringify({ motionDecision: 'none' }));
  writeFileSync(join(omd, 'framer-decisions', 'product-task-loop.json'), '{}');

  const scan = scanProject(root);
  const orphans = scan.orphanRecords.map((entry) => entry.path);
  assert.deepEqual(orphans, [`art-direction-runs/sha256-${dead}.json`]);
  assert.ok(scan.retired.some((entry) => entry.path === 'framer-decisions/product-task-loop.json'));
  assert.equal(scan.byClass.state.files >= 3, true);
  assert.deepEqual([...orphanRecords(omd, [])], []);
});

// Task and final evidence cite render/probe captures that live in the cache; `clean --cache`
// deleting one turns a passing publication into an unverifiable one.
test('a cache capture that published evidence cites is not offered for cleaning', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-cache-'));
  const omd = join(root, '.omd');
  mkdirSync(join(omd, '.cache'), { recursive: true });
  writeFileSync(join(omd, '.cache', 'desktop.png'), 'png');
  writeFileSync(join(omd, '.cache', 'scratch.png'), 'png');
  writeFileSync(join(omd, 'task-evidence.json'), JSON.stringify({ renders: ['.cache/desktop.png'] }));

  const cleanable = scanProject(root).cleanable.map((entry) => entry.path);
  assert.deepEqual(cleanable, ['.cache/scratch.png']);
});

test('selected sketch pointers retain their transitive source and previews while unselected drafts stay cleanable', () => {
  const root = mkdtempSync(join(tmpdir(), 'omd-selected-sketch-cache-'));
  const omd = join(root, '.omd');
  const selection = '.cache/sketches/selections/sha256-' + 'a'.repeat(64) + '.json';
  const source = '.cache/sketches/A/index.html';
  const preview = '.cache/sketches/A/desktop.png';
  const unused = '.cache/sketches/B/index.html';
  for (const path of [selection, source, preview, unused, '.cache/sketches/current.json']) {
    mkdirSync(join(omd, path, '..'), { recursive: true });
  }
  writeFileSync(join(omd, '.cache/sketches/current.json'), JSON.stringify({ selection: { path: `.omd/${selection}`, sha256: 'a'.repeat(64) } }));
  writeFileSync(join(omd, selection), JSON.stringify({ selectedSource: { path: `.omd/${source}` }, previews: [{ png: { path: `.omd/${preview}` } }] }));
  writeFileSync(join(omd, source), '<main>selected</main>');
  writeFileSync(join(omd, preview), 'png');
  writeFileSync(join(omd, unused), '<main>unused</main>');

  const cleanable = scanProject(root).cleanable.map(entry => entry.path);
  assert.equal(cleanable.includes('.cache/sketches/current.json'), false);
  assert.equal(cleanable.includes(selection), false);
  assert.equal(cleanable.includes(source), false);
  assert.equal(cleanable.includes(preview), false);
  assert.equal(cleanable.includes(unused), true);
});
