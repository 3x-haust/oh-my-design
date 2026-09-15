import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyReferenceEvidence } from '../core/ref/reference-verification.ts';
import type { Blueprint, Invariants } from '../core/types.ts';
import { createSelectedReferenceFixture } from './helpers/selected-reference-fixture.ts';

const CLI = fileURLToPath(new URL('../bin/omd.ts', import.meta.url));
const INVARIANTS: Invariants = {
  spacingLadder: [8], radiusLadder: [4], elevationLevels: 0, centeredRatio: 0,
  tokenCoverage: 1, paddingWeight: 8, typeScale: [16], fontFamilies: [], weightLadder: [400],
  motionDurations: [], easingVocab: [], animatedShare: 0, hoverCoverage: 0, focusCoverage: 0,
  animatedProperties: [], hasReducedMotion: false, scrollChoreography: [],
};

// This is a synthetic transport fixture, not reference or visual-quality evidence.
// Its report is deliberately larger than an OS pipe buffer, including on the failure path.
function largeBlueprint(measured: boolean): Blueprint {
  const children = Array.from({ length: 2000 }, (_, index) => `item-${index}`);
  return {
    selector: '.collection', capturedAt: '2026-09-12T00:00:00.000Z', nodes: [
      { id: 'root', role: 'container', children, box: { w: 800, h: 48000 },
        ...(measured ? { position: { x: 0, y: 0 } } : {}) },
      ...children.map((id, index) => ({
        id, role: 'text' as const, children: [], box: { w: 400, h: 24 },
        position: { x: 16, y: index * 24 }, textLength: 'phrase' as const,
      })),
    ],
  };
}

for (const measured of [true, false]) {
  test(`ref verify drains the complete piped report and preserves exit ${measured ? 0 : 1}`, async context => {
    const { root } = createSelectedReferenceFixture(context, {
      invariants: INVARIANTS, viewport: { width: 1280, height: 900 },
      blueprint: largeBlueprint(measured),
    });
    const expected = `${JSON.stringify(await verifyReferenceEvidence(root, { candidateId: 'selected' }))}\n`;
    assert.ok(Buffer.byteLength(expected) > 128 * 1024, 'the fixture must exceed the small-output path');
    const result = spawnSync(process.execPath, [CLI, 'ref', 'verify', '--candidate', 'selected', '--json'], {
      cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, measured ? 0 : 1, result.stderr);
    assert.equal(Buffer.byteLength(result.stdout), Buffer.byteLength(expected), 'stdout must not be truncated');
    assert.equal(result.stdout, expected, 'transport must not rewrite the computed report');
    const report = JSON.parse(result.stdout);
    assert.equal(report.rows[0].acquisition, measured ? 'measured-component' : 'unmeasured-geometry');
    assert.equal(report.rows[0].semanticState, 'requires-visible-inspection');
    assert.equal(report.rows[0].comparison, null, 'a complete output must not invent destination verification');
  });
}
