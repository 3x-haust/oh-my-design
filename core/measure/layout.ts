import type { MeasurementDom, MetricValues } from './types.ts';
import type { Contracts } from './contracts.ts';
import type { Box } from '../types.ts';
import { area, intersect, unionArea } from './geometry.ts';
import { backdrop, composite, luminance } from './color.ts';
export function layout(dom: MeasurementDom, contracts: Contracts, canvasPaintShare: number, mediaContrast: ReadonlyMap<string, number>): Pick<MetricValues, 'first-viewport-density' | 'empty-canvas' | 'salience-regions' | 'clipping-overflow' | 'control-word-wrap'> {
  const nodes = dom.nodes.filter(n => n.visibleBox), vpArea = dom.viewport.innerWidth * dom.viewport.innerHeight;
  const texts = nodes.filter(n => n.text.trim()), controls = nodes.filter(n => n.interactive), media = nodes.filter(n => n.media);
  const textBoxes = texts.flatMap(n => n.lines.map(l => intersect(l.box, n.visibleBox!))), controlBoxes = controls.map(n => n.visibleBox), mediaBoxes = media.map(n => n.visibleBox);
  const contentArea = unionArea([...textBoxes, ...controlBoxes, ...mediaBoxes]);
  const atoms = nodes.filter(n => n.media ? mediaContrast.has(n.id) : n.interactive || n.text.trim() && !n.control);
  const occupied: Box[] = [];
  const regions = atoms.map(n => {
    const boxes = n.interactive || n.media ? [n.visibleBox!] : n.lines.flatMap(l => { const b = intersect(l.box, n.visibleBox!); return b ? [b] : []; });
    const uniqueArea = unionArea([...occupied, ...boxes]) - unionArea(occupied); occupied.push(...boxes);
    const bg = backdrop(n), c = n.media ? mediaContrast.get(n.id)! : Math.abs(luminance(composite(n.foreground, bg)) - luminance(bg));
    const b = n.visibleBox!, centroid = { x: b.x + b.w / 2, y: b.y + b.h / 2 }, areaShare = uniqueArea / vpArea;
    return { subjectId: n.id, score: areaShare * c * (1 - 0.35 * Math.max(0, Math.min(1, centroid.y / dom.viewport.innerHeight))), share: null as number | null, areaShare, centroid };
  }).sort((a, b) => b.score - a.score || (a.subjectId < b.subjectId ? -1 : 1));
  const totalScore = regions.reduce((s, r) => s + r.score, 0); for (const r of regions) r.share = totalScore > 0 ? r.score / totalScore : null;
  const taskSelectors = contracts.composition?.regions.filter(r => r.role === 'task').map(r => r.selector);
  return {
    'first-viewport-density': { graphemesPer10000: texts.reduce((s, n) => s + n.lines.filter(l => intersect(l.box, n.visibleBox!)).reduce((s, l) => s + l.graphemes, 0), 0) / vpArea * 10000, textArea: unionArea(textBoxes), controlCount: controls.length, controlArea: unionArea(controlBoxes), mediaArea: unionArea(mediaBoxes), contentArea, taskObjectCount: taskSelectors?.length ? nodes.filter(n => n.assignments.some(a => taskSelectors.includes(a))).length : null, viewportArea: vpArea },
    'empty-canvas': { emptyRatio: Math.max(0, 1 - contentArea / vpArea), canvasPaintShare, method: 'rectangle-union', gridStep: dom.gridStep, samplingErrorBound: 1 },
    'salience-regions': { regions: regions.slice(0, 10), regionCount: regions.length, totalScore, remainderShare: totalScore > 0 ? regions.slice(10).reduce((s, r) => s + r.score, 0) / totalScore : null },
    'clipping-overflow': { documentOverflowX: dom.overflowX, subjects: dom.nodes.filter(n => n.text.trim() || n.interactive).map(n => ({ subjectId: n.id, control: n.interactive, position: n.position, scroll: n.scroll, clipped: n.clipped, visibleFraction: area(n.box) > 0 ? area(n.visibleBox) / area(n.box) : 0 })) },
    'control-word-wrap': { controls: controls.map(n => ({ subjectId: n.id, tokens: n.tokens })), splitCount: controls.reduce((sum, n) => sum + n.tokens.filter(t => t.split).length, 0) },
  };
}
