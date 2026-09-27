import * as v from './validation.ts';
import { coverageSchema, fontsSchema, metricSchemas, observedViewportSchema } from './metric-schema.ts';
import { FINDING_CODES, type VisualMeasurement, type Measurement, type ViewRequest } from './types.ts';
import { digest, measurementId } from './identity.ts';
import { destinationRoute, parseViewState } from '../render/stateful.ts';
const { object: o, array: a, text: t, number: n, nullable: maybe, enumeration: en, sha, receipt, box } = v;
const texts = a(t);
export const viewSchema = o({ id: t, route: value => { destinationRoute(value); }, state: t, stateRecipeSha256: sha, viewport: o({ width: v.integer, height: v.integer }), browserZoom: en(1, 2) });
function measurement(value: unknown): void {
  o({ id: v.pattern(/^vm1:[a-f0-9]{64}$/), kind: en(...Object.keys(metricSchemas)), viewIds: texts, subjectIds: texts, coverage: coverageSchema, value: () => {} })(value);
  const m = value as Measurement; metricSchemas[m.kind](m.value);
  v.unique(m.viewIds, 'measurement view'); v.unique(m.subjectIds, 'measurement subject');
  if (!m.viewIds.length || m.coverage.measured > m.coverage.eligible || m.coverage.status === 'complete' && (m.coverage.measured !== m.coverage.eligible || m.coverage.excluded.length)) v.fail('contradictory measurement coverage');
}
export function parseVisualMeasurement(input: unknown): VisualMeasurement {
  o({ schema: en('visual-measurement-v1'), method: o({ version: en('visual-metrics-v1'), implementationSha256: sha, policySha256: sha, browser: o({ name: en('chromium'), version: t, executableSha256: sha }) }),
    binding: o({ authority: en('native-local', 'external-diagnostic'), projectIdentitySha256: sha, routeSha256: maybe(sha), sourceContractSha256: maybe(sha), activationBuildSha256: maybe(sha), sourceSha256: maybe(sha), production: a(o({ entry: v.path, servedTreeSha256: sha })), inputs: a(o({ kind: en('type-proof', 'composition', 'tokens', 'frame', 'hypothesis', 'route-applicability', 'selected-system'), receipt, consumedContractSha256: sha })), scopeSha256: sha }),
    scope: a(viewSchema), captures: a(o({ viewId: t, capture: receipt, ir: receipt, image: o({ width: v.integer, height: v.integer }), observedViewport: observedViewportSchema, fonts: fontsSchema, stability: o({ status: en('stable', 'unstable'), beforeProjectionSha256: sha, afterProjectionSha256: sha, beforePixelSha256: sha, afterPixelSha256: sha }) })),
    subjects: a(o({ id: t, viewId: t, irNodeId: t, locator: t, role: t, box, visibleBox: maybe(box), textExcerpt: maybe(v.string) })), measurements: a(measurement),
    findings: a(o({ id: v.pattern(/^vf1:[a-f0-9]{64}$/), issueKey: sha, code: en(...FINDING_CODES), axes: texts, severity: en('blocking', 'advisory'), basis: en('contract', 'accessibility', 'heuristic', 'coverage'), viewIds: texts, subjectIds: texts, measurementIds: texts, expected: maybe(o({ field: t, value: v.string })), observed: maybe(o({ value: v.string })) })),
    summary: o({ deterministicVerdict: en('PASS', 'RED', 'UNMEASURED'), blockingFindingIds: texts, advisoryFindingIds: texts }), attestation: o({ kind: en('native-observation-v1', 'diagnostic-only'), payloadSha256: sha, signature: maybe(t) }) })(input);
  const p = input as VisualMeasurement;
  for (const [values, label] of [[p.scope.map(s => s.id), 'view'], [p.captures.map(s => s.viewId), 'capture view'], [p.subjects.map(s => s.id), 'subject'], [p.measurements.map(s => s.id), 'measurement'], [p.findings.map(s => s.id), 'finding']] as const) v.unique(values, label);
  if (!p.scope.length || p.binding.scopeSha256 !== digest(p.scope)) v.fail('scope digest mismatch');
  for (const c of p.captures) {
    if (!p.scope.some(s => s.id === c.viewId) || c.capture.path !== `.omd/visual-measurement-captures/sha256-${c.capture.sha256}.png` || c.ir.path !== `.omd/visual-measurement-ir/sha256-${c.ir.sha256}.json`) v.fail('capture receipt mismatch');
    if (c.stability.status === 'stable' && (c.stability.beforePixelSha256 !== c.stability.afterPixelSha256 || c.stability.beforeProjectionSha256 !== c.stability.afterProjectionSha256)) v.fail('false stability assertion');
  }
  for (const m of p.measurements) {
    if (m.viewIds.some(id => !p.scope.some(s => s.id === id)) || m.subjectIds.some(id => !p.subjects.some(s => s.id === id && m.viewIds.includes(s.viewId)))) v.fail('measurement scope mismatch');
    if (m.id !== measurementId(p.method, m.kind, m.viewIds, p.captures, m.subjectIds)) v.fail('measurement identity mismatch');
  }
  for (const f of p.findings) if (!f.measurementIds.length || f.measurementIds.some(id => !p.measurements.some(m => m.id === id && f.viewIds.every(v => m.viewIds.includes(v))))) v.fail('finding references unknown measurement');
  const blocking = p.findings.filter(f => f.severity === 'blocking').map(f => f.id).sort(), advisory = p.findings.filter(f => f.severity === 'advisory').map(f => f.id).sort();
  if (JSON.stringify(blocking) !== JSON.stringify(p.summary.blockingFindingIds) || JSON.stringify(advisory) !== JSON.stringify(p.summary.advisoryFindingIds)) v.fail('summary inventory mismatch');
  const incomplete = p.measurements.some(m => m.coverage.status !== 'complete') || p.captures.length !== p.scope.length;
  if (p.summary.deterministicVerdict !== (blocking.length ? 'RED' : incomplete ? 'UNMEASURED' : 'PASS')) v.fail('false deterministic verdict');
  return p;
}
export function parseMeasureScope(input: unknown): ViewRequest[] {
  o({ schema: en('visual-measurement-scope-v1'), views: a(value => {
    const state = value && typeof value === 'object' && Object.hasOwn(value, 'state');
    o({ id: t, viewport: o({ width: n, height: n }), browserZoom: en(1, 2), ...(state ? { state: v => { parseViewState(v); } } : {}) })(value);
  }) })(input);
  const requests = (input as { views: ViewRequest[] }).views;
  if (requests.length > 24) v.fail('scope exceeds 24 views');
  for (const r of requests) if (!Number.isInteger(r.viewport.width) || !Number.isInteger(r.viewport.height) || r.viewport.width < 240 || r.viewport.width > 2560 || r.viewport.height < 240 || r.viewport.height > 2160) v.fail('viewport out of bounds');
  v.unique(requests.map(r => r.id), 'scope view'); return requests;
}
