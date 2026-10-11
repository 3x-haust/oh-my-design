import type { CaptureBinding, Finding, FindingCode, MeasuredIr, Measurement, MetricKind, MetricValues, Subject, ViewSpec, VisualMeasurement } from './types.ts';
import type { Contracts } from './contracts.ts';
import { assignRoles, conformance } from './conformance.ts';
import { typography } from './typography.ts';
import { spacing } from './spacing.ts';
import { contrast } from './color.ts';
import { paint } from './paint.ts';
import { layout } from './layout.ts';
import { responsive } from './responsive.ts';
import { digest, findingId, measurementId } from './identity.ts';
export type RetainedCapture = { view: ViewSpec; binding: CaptureBinding; raw: MeasuredIr; png: Buffer };
export function measureCaptures(captures: RetainedCapture[], scope: ViewSpec[], contracts: Contracts, method: VisualMeasurement['method']): Pick<VisualMeasurement, 'subjects' | 'measurements' | 'findings' | 'summary'> {
  const subjects: Subject[] = [], measurements: Measurement[] = [], findings: Finding[] = [];
  const bindings = captures.map(c => c.binding);
  const add = <K extends MetricKind>(kind: K, views: string[], ids: string[], value: MetricValues[K], excluded: { subjectId: string; reason: string }[] = []): Measurement => {
    const m = { id: measurementId(method, kind, views, bindings, ids), kind, viewIds: views, subjectIds: ids, coverage: { status: excluded.length ? 'partial' : 'complete', measured: ids.length, eligible: ids.length + excluded.length, excluded }, value } as Measurement;
    measurements.push(m); return m;
  };
  const finding = (code: FindingCode, metric: Measurement, ids: string[], expected: Finding['expected'], observed: string, basis: Finding['basis'], axes: string[], severity: Finding['severity'] = 'blocking') => {
    const contractDigest = digest({ expected, subjects: ids });
    findings.push({ id: findingId(code, [metric.id], contractDigest), issueKey: digest({ code, views: metric.viewIds, subjects: ids.map(id => subjects.find(s => s.id === id)?.locator ?? id), field: expected?.field ?? null }), code, axes, severity, basis, viewIds: metric.viewIds, subjectIds: ids, measurementIds: [metric.id], expected, observed: { value: observed } });
  };
  const doms = captures.map(c => {
    const dom = structuredClone(c.raw.measurement);
    const id = (id: string) => `${c.view.id}:${id}`;
    for (const n of dom.nodes) { n.id = id(n.id); n.parent = n.parent ? id(n.parent) : null; n.control = n.control ? id(n.control) : null; }
    dom.paintSamples = dom.paintSamples.map(p => ({ ...p, subjectId: p.subjectId ? id(p.subjectId) : null }));
    assignRoles(dom, contracts);
    subjects.push(...dom.nodes.map(n => ({ id: n.id, viewId: c.view.id, irNodeId: n.id.slice(c.view.id.length + 1), locator: n.locator, role: n.role, box: n.box, visibleBox: n.visibleBox, textExcerpt: n.text ? n.text.slice(0, 200) : null })));
    const excluded = [...dom.excluded, ...dom.nodes.filter(n => n.visibleBox && n.unsupported.length).map(n => ({ subjectId: n.id, reason: n.unsupported.join(',') }))];
    if (!dom.fonts.ready || dom.fonts.failedFamilies.length) excluded.push({ subjectId: c.view.id, reason: 'fonts-not-ready-or-failed' });
    if (c.binding.stability.status !== 'stable') excluded.push({ subjectId: c.view.id, reason: 'unstable-capture' });
    const ids = dom.nodes.map(n => n.id), area = dom.viewport.innerWidth * dom.viewport.innerHeight;
    const p = paint(dom, c.png), conforms = conformance(dom, contracts);
    for (const n of dom.nodes.filter(n => n.visibleBox && n.media && !p.mediaContrast.has(n.id))) excluded.push({ subjectId: n.id, reason: 'media-salience-unsampled' });
    const values: Omit<MetricValues, 'cross-viewport-order'> = { ...typography(dom.nodes, area), ...spacing(dom.nodes), 'contrast-pair': contrast(dom.nodes), ...layout(dom, contracts, p.canvasPaintShare, p.mediaContrast), 'canvas-color': p['canvas-color'], 'accent-distribution': p['accent-distribution'], 'contract-conformance': conforms.value };
    const metrics = new Map<MetricKind, Measurement>();
    for (const kind of Object.keys(values) as (keyof typeof values)[]) metrics.set(kind, add(kind, [c.view.id], ids, values[kind], excluded));
    const quality = metrics.get('contract-conformance')!;
    const issueGroups = new Map<string, typeof conforms.issues>();
    for (const issue of conforms.issues) { const key = `${issue.code}:${issue.field}`; issueGroups.set(key, [...(issueGroups.get(key) ?? []), issue]); }
    for (const group of issueGroups.values()) { const i = group[0]!; finding(i.code, quality, [...new Set(group.flatMap(i => i.subjects))], { field: i.field, value: i.expected }, group.map(i => i.actual).join(';'), 'contract', i.code.startsWith('TYPE') ? ['typography', 'hierarchy'] : i.code.startsWith('COLOR') ? ['contrastColorRoles'] : ['composition']); }
    const pairs = values['contrast-pair'].pairs.filter(p => p.result === 'fail');
    if (pairs.length) finding('TEXT_CONTRAST_FAIL', metrics.get('contrast-pair')!, pairs.map(p => p.subjectId), null, JSON.stringify(pairs.map(p => ({ ratio: p.ratio, threshold: p.threshold }))), 'accessibility', ['contrastColorRoles', 'usability']);
    const wraps = values['control-word-wrap'].controls.filter(c => c.tokens.some(t => t.split));
    if (wraps.length) finding('REQUIRED_CONTROL_WORD_SPLIT', metrics.get('control-word-wrap')!, wraps.map(w => w.subjectId), null, 'Hangul control token crosses rendered lines', 'accessibility', ['typography', 'usability', 'responsiveCraft']);
    const clipped = values['clipping-overflow'].subjects.filter(n => n.control && n.clipped.some(c => !c.scrollEscape));
    if (clipped.length) finding('REQUIRED_CONTROL_CLIPPED', metrics.get('clipping-overflow')!, clipped.map(c => c.subjectId), null, JSON.stringify(clipped), 'accessibility', ['usability', 'responsiveCraft']);
    if (values['clipping-overflow'].documentOverflowX > 1) finding('MEASUREMENT_INCOMPLETE', metrics.get('clipping-overflow')!, [], null, 'Document has horizontal overflow; reflow needs repair or a scoped access contract', 'coverage', ['responsiveCraft']);
    if (values['text-minimum'].under12) finding('TEXT_UNDER_12', metrics.get('text-minimum')!, values['text-minimum'].small.map(s => s.subjectId), null, `${values['text-minimum'].under12} visible text roles below 12 CSS px`, 'heuristic', ['typography'], 'advisory');
    if (excluded.length) finding('MEASUREMENT_INCOMPLETE', quality, [], null, JSON.stringify(excluded), 'coverage', []);
    return { view: c.view, dom };
  });
  add('cross-viewport-order', scope.map(s => s.id), subjects.map(s => s.id), responsive(doms));
  for (const missing of scope.filter(s => !captures.some(c => c.view.id === s.id))) {
    const m = add('contract-conformance', [missing.id], [], { observations: [], applicability: 'missing' }, [{ subjectId: missing.id, reason: missing.browserZoom === 2 ? 'ZOOM_UNSUPPORTED' : 'required-view-missing' }]);
    finding(missing.browserZoom === 2 ? 'ZOOM_UNSUPPORTED' : 'REQUIRED_VIEW_MISSING', m, [], null, 'Required view was not captured', 'coverage', ['responsiveCraft']);
  }
  const blockingFindingIds = findings.filter(f => f.severity === 'blocking').map(f => f.id).sort(), advisoryFindingIds = findings.filter(f => f.severity === 'advisory').map(f => f.id).sort();
  return { subjects, measurements, findings, summary: { deterministicVerdict: blockingFindingIds.length ? 'RED' : measurements.some(m => m.coverage.status !== 'complete') ? 'UNMEASURED' : 'PASS', blockingFindingIds, advisoryFindingIds } };
}
