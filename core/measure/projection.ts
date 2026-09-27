import type { VisualMeasurement } from './types.ts';
import { digest } from './identity.ts';

/** Visible native facts only: no source selectors, paths, references, rationale or scores. */
export function measurementProjection(packet: VisualMeasurement, packetSha256: string) {
  const locators = new Map(packet.subjects.map(s => [s.locator, `object-${digest(s.locator).slice(0, 16)}`]));
  const clean = (value: unknown): unknown => {
    if (typeof value === 'string') return locators.get(value) ?? value;
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['locator', 'field'].includes(key)).map(([key, item]) => [key, clean(item)]));
    return value;
  };
  return {
    packetSha256,
    views: packet.scope.map(({ id, state, viewport, browserZoom, stateRecipeSha256 }) => ({ id, state, viewport, browserZoom, stateRecipeSha256 })),
    subjects: packet.subjects.map(({ id, viewId, role, box, visibleBox, textExcerpt }) => ({ id, viewId, role, box, visibleBox, textExcerpt })),
    measurements: packet.measurements.map(m => ({ id: m.id, kind: m.kind, viewIds: m.viewIds, subjectIds: m.subjectIds,
      coverage: { ...m.coverage, excluded: m.coverage.excluded.map(e => ({ subjectId: e.subjectId, reason: 'native-coverage-incomplete' })) },
      value: m.kind === 'contract-conformance' ? { applicability: m.value.applicability, observations: m.value.observations.map(({ field: _field, ...o }) => ({ ...o,
        expected: o.property === 'before' ? 'committed order' : o.property === 'input' ? 'measurable contract' : o.expected,
        actual: o.property === 'input' ? ['unmeasurable'] : o.actual })) } : clean(m.value) })),
    findings: packet.findings.map(({ id, code, severity, basis, axes, viewIds, subjectIds, measurementIds }) => ({ id, code, severity, basis, axes, viewIds, subjectIds, measurementIds })),
    summary: packet.summary,
  };
}
