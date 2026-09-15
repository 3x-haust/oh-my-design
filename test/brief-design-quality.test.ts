import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBrief, formatBrief } from '../core/brief/index.ts';
import { readPersistedRoute } from '../core/route/index.ts';
import { publishTestAdaptiveRoute } from './helpers/project-write.ts';

function project(t: { after(fn: () => void): void }): string {
  const root = mkdtempSync(join(tmpdir(), 'omd-brief-quality-'));
  mkdirSync(join(root, '.omd'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`fixtures/adaptive-flow/${name}.json`, import.meta.url), 'utf8'));
}

for (const [name, candidateMode] of [
  ['medical-new-product', 'structural'],
  ['synth-marketing', 'integrated-visual'],
] as const) {
  test(`${name} delivers the exact source quality policy to visual owners in JSON and text`, (t) => {
    const root = project(t);
    const invocation = publishTestAdaptiveRoute(root, fixture(name));
    const route = readPersistedRoute(root, invocation);
    for (const stage of ['composition', 'candidate-generation', 'production', 'independent-review', 'review'] as const) {
      const brief = buildBrief(root, stage, undefined, invocation);
      assert.deepEqual(brief.designQuality, route.behavior.active.designQuality);
      assert.equal(brief.designQuality?.candidateMode, candidateMode);
      assert.deepEqual(brief.designQuality?.floors, {
        beautyDesirability: 4, hierarchyComposition: 4, domainSpecificity: 3,
        humanAuthorship: 3, usability: 3, responsiveCraft: 3,
      });
      assert.deepEqual(JSON.parse(JSON.stringify(brief)).designQuality, route.behavior.active.designQuality);
      assert.deepEqual(Object.keys(brief.designQuality!).sort(), [
        'axes', 'floor', 'floors', 'aggregation', 'candidateMode', 'evidence', 'fidelityCanSubstitute',
      ].sort());
      const printed = formatBrief(brief);
      assert.ok(printed.includes(`quality       candidateMode: ${candidateMode}\n              axes:`));
      assert.ok(printed.includes(`candidateMode: ${candidateMode}`));
      assert.ok(printed.includes(`axes: ${brief.designQuality!.axes.join(', ')}`));
      for (const [axis, floor] of Object.entries(brief.designQuality!.floors)) {
        assert.ok(printed.includes(`${axis}=${floor}`));
      }
      for (const value of ['floor: 3', 'aggregation: conjunctive', 'evidence: localized-desktop-mobile', 'fidelityCanSubstitute: false']) {
        assert.ok(printed.includes(value), value);
      }
      assert.equal(printed.includes(route.strategy.rationale), false);
      for (const skip of route.strategy.skips) assert.equal(printed.includes(skip.reason), false);
    }
    assert.equal(buildBrief(root, 'art-direction', undefined, invocation).designQuality !== null, name === 'synth-marketing');
    for (const stage of ['frame', 'scout', 'copy', 'type-proof', 'acquisition'] as const) {
      const brief = buildBrief(root, stage, undefined, invocation);
      assert.equal(brief.designQuality, null);
      assert.equal(formatBrief(brief).includes('candidateMode:'), false);
    }
  });
}

test('absent route and unselected visual stages do not acquire a default candidate mode', (t) => {
  const root = project(t);
  const absent = buildBrief(root, 'candidate-generation');
  assert.equal(absent.designQuality, null);
  assert.equal(JSON.parse(JSON.stringify(absent)).designQuality, null);
  assert.equal(/^quality\s/m.test(formatBrief(absent)), false);
  assert.ok(absent.blockers.some((entry) => entry.startsWith('no route:')));
  const invocation = publishTestAdaptiveRoute(root, fixture('copy-only'));
  assert.equal(buildBrief(root, 'candidate-generation', undefined, invocation).designQuality, null);
});

test('unreadable or stale route authority still fails closed before delivering quality', (t) => {
  const root = project(t);
  const invocation = publishTestAdaptiveRoute(root, fixture('synth-marketing'));
  assert.throws(() => buildBrief(root, 'production'), /adaptive route authority is required/);
  const pointerPath = join(root, '.omd', 'route.json');
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
  const recordPath = join(root, '.omd', pointer.record);
  // Pointer content identity must still reject changed persisted policy bytes.
  writeFileSync(recordPath, `${readFileSync(recordPath, 'utf8')} `);
  assert.throws(() => buildBrief(root, 'production', undefined, invocation), /SOURCE_CONTRACT_MISMATCH/);
  writeFileSync(pointerPath, '{');
  assert.throws(() => buildBrief(root, 'production', undefined, invocation));
});
