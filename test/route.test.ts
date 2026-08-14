import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORBIDDEN_WITHOUT_REQUEST,
  AdaptiveRouteError,
  pathsOutsideScope,
  routeAdaptiveFlow,
} from '../core/route/index.ts';
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
