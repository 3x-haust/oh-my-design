import { resolveBackdropContrast } from './backdrop-pixels.ts';
import type { CaptureBinding, Finding, FindingCode, MeasuredIr, Measurement, MetricKind, MetricValues, Subject, ViewSpec, VisualMeasurement } from './types.ts';
import type { Contracts } from './contracts.ts';
import { colorsForView } from './contracts.ts';
import { assignRoles, conformance } from './conformance.ts';
import { typography } from './typography.ts';
import { spacing } from './spacing.ts';
import { contrast } from './color.ts';
import { paint } from './paint.ts';
import { layout } from './layout.ts';
import { responsive } from './responsive.ts';
import { controlAccessibility } from './accessibility.ts';
import { digest, findingId, measurementId } from './identity.ts';
import { canonicalJson } from '../ref/board-artifacts.ts';
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
    dom.accessibility = dom.accessibility.map(control => ({ ...control, subjectId: id(control.subjectId) }));
    dom.paintSamples = dom.paintSamples.map(p => ({ ...p, subjectId: p.subjectId ? id(p.subjectId) : null }));
    assignRoles(dom, contracts);
    subjects.push(...dom.nodes.map(n => ({ id: n.id, viewId: c.view.id, irNodeId: n.id.slice(c.view.id.length + 1), locator: n.locator, role: n.role, box: n.box, visibleBox: n.visibleBox, textExcerpt: n.text ? n.text.slice(0, 200) : null })));
    // SVG internals remain unmeasured; that limitation does not invalidate
    // unrelated DOM geometry/text. Selected paint/target contracts still refuse
    // unsupported SVG through contrast/conformance below.
    // A busy backdrop only matters to text read against it; a node with no text of its own (an icon) is not a text gap.
    const limits = (n: (typeof dom.nodes)[number]): string[] => n.lines.length === 0 ? n.unsupported.filter(r => r !== 'complex-backdrop') : [...n.unsupported];
    const svgPixels = new Set(dom.nodes.filter(n => n.visibleBox && n.tag === 'svg'
      && limits(n).length === 1 && limits(n)[0] === 'opaque-content').map(n => n.id));
    // A native control's own glyphs are unmeasured whatever it is drawn on, so a chevron or icon painted as its
    // background image (a select's arrow) adds no further gap.
    const p = paint(dom, c.png);
    // A drawn canvas (a WebGL scene, a chart) is the same kind of gap: its pixels are in the capture, its internals
    // and any text it draws are not in the DOM. A blank canvas, a scene that never rendered, still blocks.
    const canvasPixels = new Set(dom.nodes.filter(n => n.visibleBox && n.tag === 'canvas' && p.drawnCanvas.has(n.id)
      && limits(n).length === 1 && limits(n)[0] === 'opaque-content').map(n => n.id));
    const nativeText = new Set(dom.nodes.filter(n => n.visibleBox
      && (['input', 'select', 'textarea'].includes(n.tag) && n.unsupported.includes('native-control-text')
        && n.unsupported.every(reason => reason === 'native-control-text' || reason === 'complex-backdrop')
        || n.tag === 'option' && n.unsupported.length === 1 && n.unsupported[0] === 'native-option-text')).map(n => n.id));
    const excluded = [...dom.excluded, ...dom.nodes.filter(n => n.visibleBox && n.unsupported.length && !svgPixels.has(n.id) && !canvasPixels.has(n.id) && !nativeText.has(n.id)).map(n => ({ subjectId: n.id, reason: n.unsupported.join(',') }))];
    if (!dom.fonts.ready || dom.fonts.failedFamilies.length) excluded.push({ subjectId: c.view.id, reason: 'fonts-not-ready-or-failed' });
    if (c.binding.stability.status !== 'stable') excluded.push({ subjectId: c.view.id, reason: 'unstable-capture' });
    const ids = dom.nodes.map(n => n.id), area = dom.viewport.innerWidth * dom.viewport.innerHeight;
    const conforms = conformance(dom, contracts, c.view.id);
    // An image cut by the viewport edge to a sliver thinner than the sampling grid falls between samples and
    // carries no salience; it is noted, not left as an unmeasured subject that blocks completion.
    const unsampledMedia = dom.nodes.filter(n => n.visibleBox && n.media && !p.mediaContrast.has(n.id) && !svgPixels.has(n.id) && !canvasPixels.has(n.id));
    const slivers = unsampledMedia.filter(n => Math.min(n.visibleBox!.w, n.visibleBox!.h) < dom.gridStep).map(n => n.id);
    // An image whose sample points all land on something drawn over it (a skip link shown on focus, an open menu) is
    // covered in this state: nothing of it shows, so it carries no salience to measure.
    const covered = unsampledMedia.filter(n => {
      const box = n.visibleBox!;
      const inside = dom.paintSamples.filter(sample => sample.x >= box.x && sample.x <= box.x + box.w && sample.y >= box.y && sample.y <= box.y + box.h);
      return inside.length > 0 && inside.every(sample => sample.subjectId !== null && sample.subjectId !== n.id);
    }).map(n => n.id);
    for (const n of unsampledMedia.filter(n => !slivers.includes(n.id) && !covered.includes(n.id))) excluded.push({ subjectId: n.id, reason: 'media-salience-unsampled' });
    // Text over a gradient or image is measured from the rendered pixels rather than left unmeasured.
    const sampled = resolveBackdropContrast(contrast(dom.nodes, colorsForView(contracts.composition, c.view.id)).pairs, dom, c.png);
    // A container whose only limitation is its own gradient has no text of its own to measure; the text
    // inside it is measured above. Either way the backdrop no longer leaves a coverage gap.
    const ownTextless = new Set(dom.nodes.filter(n => n.lines.length === 0).map(n => n.id));
    for (let index = excluded.length - 1; index >= 0; index--) {
      const entry = excluded[index]!;
      if (entry.reason === 'complex-backdrop' && (sampled.resolved.has(entry.subjectId) || ownTextless.has(entry.subjectId))) excluded.splice(index, 1);
    }
    // In an interaction state (an open menu, a dialog) text under the layer the interaction opened is covered on
    // purpose: none of it shows, so it has no contrast to read, and the same text is measured at rest. At rest an
    // unexplained cover still blocks.
    const underOpenLayer = c.view.id.includes(':outcome-') ? excluded.filter(e => e.reason === 'occluded-text') : [];
    for (const entry of underOpenLayer) excluded.splice(excluded.indexOf(entry), 1);
    const values: Omit<MetricValues, 'cross-viewport-order'> = { ...typography(dom.nodes, area), 'control-accessibility': controlAccessibility(dom), ...spacing(dom.nodes), 'contrast-pair': { pairs: sampled.pairs }, ...layout(dom, contracts, p.canvasPaintShare, p.mediaContrast), 'canvas-color': p['canvas-color'], 'accent-distribution': p['accent-distribution'], 'contract-conformance': conforms.value };
    const metrics = new Map<MetricKind, Measurement>();
    for (const kind of Object.keys(values) as (keyof typeof values)[]) metrics.set(kind, add(kind, [c.view.id], ids, values[kind], excluded));
    const quality = metrics.get('contract-conformance')!;
    if (svgPixels.size) finding('MEASUREMENT_INCOMPLETE', metrics.get('salience-regions')!, [...svgPixels], null,
      'SVG internal paint and salience are unmeasured; inspect these subjects in the authenticated whole captures. No SVG contrast or salience proof is claimed.',
      'coverage', ['contrastColorRoles', 'hierarchy', 'composition', 'beautyDesirability'], 'advisory');
    if (canvasPixels.size) finding('MEASUREMENT_INCOMPLETE', metrics.get('salience-regions')!, [...canvasPixels], null,
      'Canvas internals, salience and any text drawn into a canvas are unmeasured; inspect these subjects in the authenticated whole captures. No canvas contrast or salience proof is claimed.',
      'coverage', ['contrastColorRoles', 'hierarchy', 'composition', 'beautyDesirability'], 'advisory');
    if (slivers.length) finding('MEASUREMENT_INCOMPLETE', metrics.get('salience-regions')!, slivers, null,
      'Images cut by the viewport edge to a sliver thinner than the sampling grid were not sampled; they carry no salience.',
      'coverage', [], 'advisory');
    if (covered.length) finding('MEASUREMENT_INCOMPLETE', metrics.get('salience-regions')!, covered, null,
      'Images fully covered by another drawn element in this state were not sampled; inspect the capture if the cover is unintended.',
      'coverage', ['composition'], 'advisory');
    if (nativeText.size) finding('MEASUREMENT_INCOMPLETE', quality, [...nativeText], null,
      'Native form-value glyphs and text contrast are unmeasured; inspect these subjects in the authenticated whole captures. DOM metrics do not certify their painted text.',
      'coverage', ['typography', 'contrastColorRoles', 'usability', 'responsiveCraft'], 'advisory');
    const issueGroups = new Map<string, typeof conforms.issues>();
    for (const issue of conforms.issues) { const key = `${issue.code}:${issue.field}`; issueGroups.set(key, [...(issueGroups.get(key) ?? []), issue]); }
    for (const group of issueGroups.values()) { const i = group[0]!; finding(i.code, quality, [...new Set(group.flatMap(i => i.subjects))], { field: i.field, value: i.expected }, group.map(i => i.actual).join(';'), 'contract', i.code.startsWith('TYPE') ? ['typography', 'hierarchy'] : i.code.startsWith('COLOR') ? ['contrastColorRoles'] : ['composition']); }
    const pairs = values['contrast-pair'].pairs.filter(p => p.result === 'fail');
    for (const kind of ['text', 'non-text'] as const) {
      const rows = pairs.filter(p => kind === 'non-text' ? p.kind === 'non-text' : p.kind === undefined);
      if (rows.length) finding(kind === 'non-text' ? 'NON_TEXT_CONTRAST_FAIL' : 'TEXT_CONTRAST_FAIL', metrics.get('contrast-pair')!, rows.map(p => p.subjectId), null, canonicalJson(rows.map(p => ({ ratio: p.ratio, threshold: p.threshold }))), 'accessibility', ['contrastColorRoles', 'usability']);
    }
    const unknownPaint = values['contrast-pair'].pairs.filter(p => p.kind === 'non-text' && p.result === 'unmeasured');
    if (unknownPaint.length) finding('MEASUREMENT_INCOMPLETE', metrics.get('contrast-pair')!, unknownPaint.map(p => p.subjectId), null, 'Declared non-text paint could not be measured', 'coverage', ['contrastColorRoles']);
    const wraps = values['control-word-wrap'].controls.filter(c => c.tokens.some(t => t.split));
    if (wraps.length) finding('REQUIRED_CONTROL_WORD_SPLIT', metrics.get('control-word-wrap')!, wraps.map(w => w.subjectId), null, 'Hangul control token crosses rendered lines', 'accessibility', ['typography', 'usability', 'responsiveCraft']);
    const unnamed = values['control-accessibility'].controls.filter(control => control.issue === 'missing-name');
    if (unnamed.length) finding('FORM_ACCESSIBLE_NAME_MISSING', metrics.get('control-accessibility')!, unnamed.map(control => control.subjectId), null,
      canonicalJson(unnamed.map(({ subjectId, role }) => ({ subjectId, role }))), 'accessibility', ['usability'], 'advisory');
    const placeholderOnly = values['control-accessibility'].controls.filter(control => control.issue === 'placeholder-only');
    if (placeholderOnly.length) finding('FORM_PLACEHOLDER_ONLY_LABEL', metrics.get('control-accessibility')!, placeholderOnly.map(control => control.subjectId), null,
      canonicalJson(placeholderOnly.map(({ subjectId, placeholder }) => ({ subjectId, placeholder }))), 'accessibility', ['usability'], 'advisory');
    // Review convention, not a Korean standard: 0.05em is a common Latin all-caps tracking
    // starting point (https://practicaltypography.com/letterspacing.html), so applying at
    // least that much positive tracking to lang=ko body text deserves rendered review.
    const trackedKorean = dom.nodes.filter(n => n.visibleBox && n.role === 'body' && n.language.toLowerCase().startsWith('ko')
      && /[가-힣]/.test(n.text) && n.size > 0 && n.tracking / n.size >= 0.05);
    if (trackedKorean.length) finding('KOREAN_BODY_TRACKING', metrics.get('type-ladder')!, trackedKorean.map(n => n.id), null,
      canonicalJson(trackedKorean.map(n => ({ subjectId: n.id, em: n.tracking / n.size, pixels: n.tracking }))),
      'heuristic', ['typography', 'usability'], 'advisory');
    const clipped = values['clipping-overflow'].subjects.filter(n => n.control && n.clipped.some(c => !c.scrollEscape));
    if (clipped.length) finding('REQUIRED_CONTROL_CLIPPED', metrics.get('clipping-overflow')!, clipped.map(c => c.subjectId), null, canonicalJson(clipped), 'accessibility', ['usability', 'responsiveCraft']);
    if (values['clipping-overflow'].documentOverflowX > 1) finding('MEASUREMENT_INCOMPLETE', metrics.get('clipping-overflow')!, [], null, 'Document has horizontal overflow; reflow needs repair or a scoped access contract', 'coverage', ['responsiveCraft']);
    // Review convention (core/theory/typography.md "Fine print is a role, not a default"): 12 CSS px is the floor
    // for incidental text, so a view where most characters sit below 14 px reads as fine print at normal distance.
    const ladder = values['type-ladder'].clusters, fine = ladder.filter(c => c.maxSize < 14);
    const characters = ladder.reduce((sum, c) => sum + c.graphemes, 0), fineCharacters = fine.reduce((sum, c) => sum + c.graphemes, 0);
    if (characters >= 200 && fineCharacters * 2 > characters) finding('SMALL_TEXT_DOMINANT', metrics.get('type-ladder')!, fine.flatMap(c => c.subjectIds), null,
      `${fineCharacters} of ${characters} visible characters are set below 14 CSS px`, 'heuristic', ['typography', 'hierarchy', 'usability'], 'advisory');
    if (values['text-minimum'].under12) finding('TEXT_UNDER_12', metrics.get('text-minimum')!, values['text-minimum'].small.map(s => s.subjectId), null, `${values['text-minimum'].under12} visible text roles below 12 CSS px`, 'heuristic', ['typography'], 'advisory');
    // A transformed, non-interactive node with no text of its own (a rotated logo piece, a tilted
    // decorative card) has no type, contrast or target to measure; its exclusion is reported but does
    // not block completion. A transformed control or text still blocks.
    const textless = new Set(dom.nodes.filter(n => !n.text.trim() && !n.interactive && !n.media && n.tabIndex < 0).map(n => n.id));
    const decorative = excluded.filter(e => e.reason === 'transformed-geometry' && textless.has(e.subjectId));
    const unmeasured = excluded.filter(e => !decorative.includes(e));
    if (unmeasured.length) finding('MEASUREMENT_INCOMPLETE', quality, [], null, canonicalJson(unmeasured), 'coverage', []);
    if (decorative.length) finding('MEASUREMENT_INCOMPLETE', quality, decorative.map(e => e.subjectId), null, canonicalJson(decorative), 'coverage', [], 'advisory');
    if (underOpenLayer.length) finding('MEASUREMENT_INCOMPLETE', quality, underOpenLayer.map(e => e.subjectId), null,
      canonicalJson(underOpenLayer), 'coverage', ['composition'], 'advisory');
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
