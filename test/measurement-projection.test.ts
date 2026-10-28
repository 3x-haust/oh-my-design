import assert from 'node:assert/strict';
import test from 'node:test';
import { measurementProjection } from '../core/measure/projection.ts';
import type { VisualMeasurement } from '../core/measure/types.ts';

const view = (id: string, state: string) => ({ id, state, viewport: { width: 1280, height: 900 }, browserZoom: 1, stateRecipeSha256: 'r'.repeat(64) });
const subject = (viewId: string, local: string, y: number) => ({ id: `${viewId}:${local}`, viewId, role: 'text', locator: `#${local}`,
  box: { x: 0.4, y: y + 0.3, w: 100.6, h: 20.2 }, visibleBox: { x: 0.4, y: y + 0.3, w: 100.6, h: 20.2 }, textExcerpt: local });
const measurement = (id: string, viewId: string, samples: number) => ({ id, kind: 'spacing-clusters', viewIds: [viewId],
  subjectIds: [`${viewId}:m1`, `${viewId}:m2`], coverage: { eligible: 2, measured: 2, status: 'complete', excluded: [] },
  value: { clusters: [{ value: 8, subjectIds: [`${viewId}:m1`] }], samples: Array.from({ length: samples }, (_, i) => i) } });

test('identical states share one subject set and value while every measurement id stays citable', () => {
  const a = 'desktop-1280x900@1', b = 'desktop-1280x900@1:outcome-1';
  const packet = {
    scope: [view(a, 'initial'), view(b, 'outcome-1')],
    subjects: [subject(a, 'm1', 0), subject(a, 'm2', 40), subject(b, 'm1', 0), subject(b, 'm2', 40)],
    measurements: [measurement(`vm1:${'1'.repeat(64)}`, a, 60), measurement(`vm1:${'2'.repeat(64)}`, b, 60)],
    findings: [], summary: { deterministicVerdict: 'PASS' },
  } as unknown as VisualMeasurement;
  const projection = measurementProjection(packet, 'p'.repeat(64));
  assert.equal(projection.subjectSets.length, 1);
  assert.deepEqual(projection.subjectSets[0]!.viewIds, [a, b]);
  assert.deepEqual(projection.subjectSets[0]!.subjects, [
    { id: ':m1', role: 'text', box: { x: 0, y: 0, w: 101, h: 20 }, textExcerpt: 'm1' },
    { id: ':m2', role: 'text', box: { x: 0, y: 40, w: 101, h: 20 }, textExcerpt: 'm2' },
  ]);
  assert.deepEqual(projection.measurements.map(m => m.id), packet.measurements.map(m => m.id));
  assert.ok(projection.measurements.every(m => m.subjectIds === 'all-subjects-of-its-views'));
  assert.equal(projection.measurements[0]!.valueRef, projection.measurements[1]!.valueRef);
  const value = projection.values[0] as { clusters: unknown[]; samples: unknown[] };
  assert.deepEqual(value.clusters, [{ value: 8, subjectIds: [':m1'] }]);
  assert.equal(value.samples.length, 25);
  assert.match(String(value.samples.at(-1)), /36 more entries omitted/);
  assert.ok(!JSON.stringify(projection).includes('#m1'), 'source locators stay hidden');
});

test('a partial subject list and a different state keep their own facts', () => {
  const a = 'mobile-390x844@1', b = 'mobile-390x844@1:outcome-2';
  const partial = { ...measurement(`vm1:${'3'.repeat(64)}`, a, 2), subjectIds: [`${a}:m1`] };
  const packet = {
    scope: [view(a, 'initial'), view(b, 'outcome-2')],
    subjects: [subject(a, 'm1', 0), subject(a, 'm2', 40), subject(b, 'm1', 0), subject(b, 'm2', 90)],
    measurements: [partial, measurement(`vm1:${'4'.repeat(64)}`, b, 2)],
    findings: [], summary: { deterministicVerdict: 'PASS' },
  } as unknown as VisualMeasurement;
  const projection = measurementProjection(packet, 'p'.repeat(64));
  assert.equal(projection.subjectSets.length, 2);
  assert.deepEqual(projection.measurements[0]!.subjectIds, [`${a}:m1`]);
  assert.equal(projection.measurements[1]!.subjectIds, 'all-subjects-of-its-views');
});
