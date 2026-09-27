import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rmSync } from 'node:fs';
import { measurementFixture } from './helpers/visual-measurement.ts';
import { measureProject } from '../core/measure/index.ts';
import { loadMeasurement } from '../core/measure/files.ts';
import { joinSurfaceCoverage, SURFACE_REVIEW_CRITERIA, parseSurfaceReview, requiredContentCells } from '../core/brief/surface-coverage.ts';
import type { SurfacePlan } from '../core/frame/process-plan.ts';
import { createGlancePacket, validateGlanceReview } from '../core/brief/glance.ts';

test('native exact cell coverage rejects omitted, duplicate, wrong-state and incomplete review, then accepts actual full coverage', async t => {
  const f = measurementFixture('clean'); t.after(() => rmSync(f.root, { recursive: true, force: true }));
  const measured = await measureProject({ ...f, entry: 'dist/index.html' }), packet = loadMeasurement(f.root, measured.packet);
  const plan: SurfacePlan = { schema: 'surface-plan-v1', representativeSurfaceId: 'main', views: packet.scope.map(s => ({ id: s.id, ...s.viewport })),
    surfaces: [{ id: 'main', purpose: 'Inspect work', taskIds: [], componentIds: [], states: [{ id: 'entry', required: true, reason: 'Initial state', primaryActionId: null, primaryRequired: false }], viewIds: packet.scope.map(s => s.id), referenceCoverage: 'brief-derived', referenceIds: [], referenceGap: 'No external research', referenceDecision: 'Test supplied work', contentCases: [] }] };
  const mappings = packet.scope.map(s => ({ surfaceId: 'main', stateId: 'entry', viewId: s.id, route: s.route, state: s.state, stateRecipeSha256: s.stateRecipeSha256 }));
  const review = parseSurfaceReview({ schema: 'surface-review-v1', rows: packet.scope.map(s => ({ surfaceId: 'main', stateId: 'entry', viewId: s.id, packet: measured.packet,
    capture: packet.captures.find(c => c.viewId === s.id)!.capture, measurementIds: packet.measurements.filter(m => m.viewIds.includes(s.id)).map(m => m.id),
    criteria: Object.fromEntries(SURFACE_REVIEW_CRITERIA.map(id => [id, 'pass'])) })) });
  const packets = new Map([[measured.packet.sha256, packet]]);
  for (const invalid of [ { ...review, rows: review.rows.slice(1) }, { ...review, rows: [...review.rows, review.rows[0]!] },
    { ...review, rows: review.rows.map((r, i) => i ? r : { ...r, stateId: 'invented-state' }) },
    { ...review, rows: review.rows.map((r, i) => i ? r : { ...r, criteria: { ...r.criteria, readability: 'unassessed' as const } }) } ]) assert.throws(() => joinSurfaceCoverage(plan, mappings, invalid, packets));
  assert.throws(() => joinSurfaceCoverage(plan, mappings.map((m, i) => i ? m : { ...m, stateRecipeSha256: '0'.repeat(64) }), review, packets));
  assert.equal(joinSurfaceCoverage(plan, mappings, review, packets).reviewed, packet.scope.length);
  assert.deepEqual(requiredContentCells(plan), []);

  const glance = await createGlancePacket(f.root, [measured.packet], f.writer, f.invocation);
  const output = { schema: 'glance-review-v1', packetSha256: glance.packetSha256, observations: glance.packet.renders.map(r => ({ renderId: r.renderId,
    viewport: r.viewport, state: r.state, sourceCaptureSha256: r.sourceCaptureSha256, squintSha256: r.squint.sha256,
    focalPoint: 'Work region', eyePath: ['heading', 'work'], perceivedRegions: ['work'], hierarchyFailure: null, assessed: true })) };
  assert.equal(validateGlanceReview(glance.packet, output).complete, true);
  assert.throws(() => validateGlanceReview(glance.packet, { ...output, observations: output.observations.slice(1) }));
  assert.throws(() => validateGlanceReview(glance.packet, { ...output, packetSha256: '0'.repeat(64) }));
  assert.equal(validateGlanceReview(glance.packet, { ...output, observations: output.observations.map(o => ({ ...o, assessed: false })) }).complete, false);
});
